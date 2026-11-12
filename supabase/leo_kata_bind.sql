-- 型表に児童を追加・変更したとき、児童マスタと紐づけ、今日以降の予定に反映する（2026-11-12）
-- 未登録の児童は、契約相手（leo_doc_party）があれば利用者情報へ登録する。名前は「姓 名」。
-- 保護者の月次回答がある子は、その回答の曜日を優先する（これまでどおり）。
-- 回答がまだ無く、今日以降の利用・休みの予定も無い「毎週」の子だけ、型表の曜日で今月（すでに予定がある月）へ入れる。
-- 不定期・退所、および既に予定がある未回答の子（職員がカレンダーで入れた行など）は触らない。
-- 過去の日誌・実績は書き換えない。source='portal' の予定は leo_kata_rewrite_day 側で残る。

create or replace function public.leo_name_family_given(v text) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select m.name from public.leo_children m
      where regexp_replace(m.name, '\s', '', 'g') = regexp_replace(public.leo_name_canon(v), ' ', '', 'g')
      limit 1),
    case
      when public.leo_name_canon(v) like '% %' then public.leo_name_canon(v)
      when char_length(public.leo_name_canon(v)) >= 3
        then left(public.leo_name_canon(v), 2) || ' ' || substr(public.leo_name_canon(v), 3)
      else public.leo_name_canon(v)
    end
  )
$$;

create or replace function public.leo_name_compact(v text) returns text
language sql immutable parallel safe as $$
  select regexp_replace(public.leo_name_canon(v), ' ', '', 'g')
$$;

create or replace function public.leo_kata_apply() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r record;
  nm text;
  party public.leo_doc_party%rowtype;
  dows text[];
  m date;
  m0 date := date_trunc('month', (timezone('Asia/Tokyo', now()))::date)::date;
  m1 date;
  today_jst date := (timezone('Asia/Tokyo', now()))::date;
  registered jsonb := '[]'::jsonb;
  renamed jsonb := '[]'::jsonb;
  unregistered jsonb := '[]'::jsonb;
  seeded jsonb := '[]'::jsonb;
  days int := 0;
begin
  if not public.leo_record_allowed() then raise exception 'レオ職員のみ'; end if;

  m1 := date_trunc('month', coalesce(
    (select max(day) from leo_events where source = 'kata' and day >= today_jst),
    today_jst
  ))::date;

  for r in
    select distinct public.leo_name_family_given(k.data->>'児童名') as name,
           public.leo_name_canon(k.data->>'児童名') as raw
    from leo_master k
    where k.kind = 'kata' and coalesce(k.data->>'児童名', '') <> ''
  loop
    nm := r.name;
    if nm is null or nm = '' then continue; end if;

    if r.raw is distinct from nm then
      update leo_master
        set data = jsonb_set(data, '{児童名}', to_jsonb(nm), true), updated_at = now()
        where kind = 'kata' and public.leo_name_canon(data->>'児童名') = r.raw;
      renamed := renamed || jsonb_build_array(jsonb_build_object('from', r.raw, 'to', nm));
    end if;

    if not exists (select 1 from leo_children c where public.leo_name_compact(c.name) = public.leo_name_compact(nm)) then
      select * into party from leo_doc_party p
        where public.leo_name_compact(p.child_name) = public.leo_name_compact(nm)
        order by p.id desc limit 1;
      if found then
        insert into leo_children (name, kind, contract_start, contract_end)
        values (nm, '放デイ', party.contract_start, party.contract_end)
        on conflict (name) do nothing;
        insert into leo_child_info (
          name, guardian_name, home_address, use_transport, pickup_place, dropoff_place,
          transport_mode, transport_days
        )
        values (
          nm,
          nullif(public.leo_name_family_given(party.guardian_name), ''),
          nullif(btrim(party.guardian_address), ''),
          true,
          (select nullif(btrim(x.data->>'迎え場所'), '') from leo_master x
            where x.kind = 'kata' and public.leo_name_compact(x.data->>'児童名') = public.leo_name_compact(nm)
              and nullif(btrim(x.data->>'迎え場所'), '') is not null
            order by x.row_no limit 1),
          (select nullif(btrim(x.data->>'送り場所（空欄なら自宅）'), '') from leo_master x
            where x.kind = 'kata' and public.leo_name_compact(x.data->>'児童名') = public.leo_name_compact(nm)
              and nullif(btrim(x.data->>'送り場所（空欄なら自宅）'), '') is not null
            order by x.row_no limit 1),
          '送迎あり',
          coalesce((
            select array_agg(distinct left(btrim(x.data->>'曜日'), 1) order by left(btrim(x.data->>'曜日'), 1))
            from leo_master x
            where x.kind = 'kata' and public.leo_name_compact(x.data->>'児童名') = public.leo_name_compact(nm)
              and left(btrim(x.data->>'曜日'), 1) in ('月','火','水','木','金','土','日')
              and coalesce(x.data->>'利用週', '毎週') not in ('不定期', '退所')
          ), '{}'::text[])
        )
        on conflict (name) do nothing;
        update leo_doc_party
          set child_name = nm, updated_at = now()
          where id = party.id and child_name is distinct from nm;
        registered := registered || jsonb_build_array(jsonb_build_object('name', nm, 'from', '契約'));
      else
        unregistered := unregistered || jsonb_build_array(nm);
        continue;
      end if;
    else
      -- マスタにあるが契約相手の表記が空白違いのとき、契約画面で「未登録」にならないようそろえる
      update leo_doc_party p
        set child_name = (select c.name from leo_children c where public.leo_name_compact(c.name) = public.leo_name_compact(p.child_name) limit 1),
            updated_at = now()
        where public.leo_name_compact(p.child_name) = public.leo_name_compact(nm)
          and p.child_name is distinct from (select c.name from leo_children c where public.leo_name_compact(c.name) = public.leo_name_compact(nm) limit 1);
    end if;

    -- すでに予定がある月について、未回答かつ今日以降の利用・休みが無い「毎週」だけ型表どおりに入れる
    m := m0;
    while m <= m1 loop
      if exists (
        select 1 from leo_master x
        where x.kind = 'kata' and public.leo_name_compact(x.data->>'児童名') = public.leo_name_compact(nm)
          and coalesce(x.data->>'利用週', '毎週') not in ('不定期', '退所')
          and left(btrim(x.data->>'曜日'), 1) in ('月','火','水','木','金','土','日')
      ) and not exists (
        select 1 from leo_schedule_weekday w
        where w.month = m and public.leo_name_compact(w.child) = public.leo_name_compact(nm)
      ) and not exists (
        select 1 from leo_events e
        where e.day >= greatest(m, today_jst) and e.day < (m + interval '1 month')::date
          and e.kind in ('利用', '休み')
          and public.leo_name_compact(e.child) = public.leo_name_compact(nm)
      ) then
        select coalesce(array_agg(distinct left(btrim(x.data->>'曜日'), 1) order by left(btrim(x.data->>'曜日'), 1)), '{}')
          into dows
        from leo_master x
        where x.kind = 'kata' and public.leo_name_compact(x.data->>'児童名') = public.leo_name_compact(nm)
          and coalesce(x.data->>'利用週', '毎週') not in ('不定期', '退所')
          and left(btrim(x.data->>'曜日'), 1) in ('月','火','水','木','金','土','日');
        insert into leo_schedule_weekday (child, month, dow, use, answered_at)
        select nm, m, d, true, now()
        from unnest(dows) d
        on conflict (child, month, dow) do nothing;
        seeded := seeded || jsonb_build_array(jsonb_build_object('child', nm, 'month', m, 'dows', to_jsonb(dows)));
      end if;
      m := (m + interval '1 month')::date;
    end loop;
  end loop;

  days := public.leo_kata_resync(greatest(today_jst, public.leo_sync_start()));
  return jsonb_build_object(
    'days', days,
    'registered', registered,
    'renamed', renamed,
    'unregistered', unregistered,
    'seeded', seeded
  );
end $$;

revoke all on function public.leo_name_family_given(text), public.leo_name_compact(text), public.leo_kata_apply() from public, anon;
grant execute on function public.leo_name_family_given(text), public.leo_name_compact(text), public.leo_kata_apply() to authenticated, service_role;

create or replace function public.leo_master_kata_touch() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from new_rows where kind = 'kata') then
    perform public.leo_kata_apply();
  end if;
  return null;
end $$;
