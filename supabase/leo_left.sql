-- レオ 退所（2026-10-21）
-- 齊藤連さんが Supabase の SQL Editor にこのファイルを貼って Run してください。本番データは消しません（列を足し、関数を置き換えるだけです）。
-- アプリからは実行しません。
--
-- 保存先：leo_child_info.left_on（その児童の連絡先の行。型表 leo_master / leo_sheet は読み書きしません）
-- 意味：退所日の当日までは在籍。翌日以降は、利用予定の作成・カレンダーの枠材料から外します。
-- 画面側も同じ境界で表示だけ隠します（すでに入っている予定行は削除しません）。
--
-- 注意：leo_schedule.sql / leo_schedule_build.sql / leo_cal.sql をこのあと再実行すると、退所の除外が古い定義に戻ります。
-- そのときは、このファイルをもう一度実行してください。

alter table public.leo_child_info add column if not exists left_on date;
comment on column public.leo_child_info.left_on is '退所日。この日までは在籍。翌日以降の利用予定・送迎には出さない。空なら在籍。記録は消さない。';

-- 児童名の空白（半角・全角）は同一視。職員画面には出さない（予定作成の関数だけが使う）
create or replace function public.leo_left_on(p_name text) returns date
language sql stable security definer set search_path = public as $$
  select i.left_on from public.leo_child_info i
  where i.left_on is not null
    and regexp_replace(i.name, '[[:space:]　]', '', 'g') = regexp_replace(coalesce(p_name, ''), '[[:space:]　]', '', 'g')
  order by i.left_on
  limit 1
$$;
revoke all on function public.leo_left_on(text) from public, anon, authenticated;

-- 来月のリンクを作るとき、退所日が対象月より前の児童は足さない（すでに作った依頼は消さない）
create or replace function public.leo_sched_open(p_month date, p_children text[] default null) returns int language plpgsql security definer set search_path = public, extensions as $$
declare n int;
begin
  if not public.can_manage() then raise exception '児発管・管理者・事務のみ'; end if;
  if extract(day from p_month) <> 1 then raise exception '月の1日を指定してください'; end if;
  insert into leo_schedule_request (child, month, token, expires_at)
  select c, p_month, encode(gen_random_bytes(24), 'hex'), ((p_month - interval '1 month')::date + 24)::timestamp at time zone 'Asia/Tokyo' + interval '9 hours'
  from unnest(coalesce(p_children, array(select distinct data->>'児童名' from (select data from leo_master where kind = 'kata' union all select data from leo_sheet where kind = 'kata' and not exists (select 1 from leo_master where kind = 'kata')) y where coalesce(data->>'児童名', '') <> ''))) c
  where public.leo_left_on(c) is null or public.leo_left_on(c) >= p_month
  on conflict (child, month) do nothing;
  get diagnostics n = row_count; return n;
end $$;

-- 保護者の画面に退所日を渡す（その日よりあと入力させない）
create or replace function public.leo_sched_get(p_token text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r record; reg jsonb; closed jsonb; prev jsonb;
begin
  select * into r from leo_schedule_request where token = p_token and length(p_token) = 48;
  if not found then return null; end if;
  select coalesce(jsonb_agg(jsonb_build_object('dow', k->>'曜日', 'start', k->>'利用開始', 'end', k->>'利用終了',
      'weekly', coalesce(k->>'利用週', '毎週') <> '不定期', 'parent', coalesce(k->>'保護者送迎', ''),
      'school_time', coalesce(nullif(k->>'学校お迎え時刻（基準）※空欄なら迎え開始', ''), nullif(k->>'迎え開始', '')), 'pick_place', nullif(k->>'迎え場所', ''), 'drop_place', coalesce(nullif(k->>'送り場所（空欄なら自宅）', ''), '自宅'))
      order by position(k->>'曜日' in '月火水木金土')), '[]') into reg from leo_sched_kata(r.child) k;
  select coalesce(to_jsonb(leo_sched_closed(r.month)), '[]') into closed;
  select jsonb_build_object('month', a.month, 'answered_at', a.answered_at, 'same_month', a.month = r.month, 'answer', a.answer) into prev
    from leo_schedule_answer a where a.child = r.child and a.month <= r.month order by (a.month = r.month) desc, a.answered_at desc limit 1;
  return jsonb_build_object('child', r.child, 'month', to_char(r.month, 'YYYY-MM'), 'expired', r.expires_at <= now(), 'deadline', r.expires_at,
    'answered_at', r.answered_at, 'regular', reg, 'closed', closed, 'prev', prev, 'left_on', public.leo_left_on(r.child));
end $$;

create or replace function public.leo_sched_submit(p_token text, p_answer jsonb) returns text language plpgsql security definer set search_path = public as $$
declare r record; aid bigint; wr record; d jsonb; kd text; tm text; dy date; n int := 0; usual boolean; a_days jsonb; note text;
  closed date[];
begin
  if p_answer is null or jsonb_typeof(p_answer) <> 'object' or pg_column_size(p_answer) > 30000 then raise exception '回答の形が正しくありません'; end if;
  select * into r from leo_schedule_request where token = p_token and length(p_token) = 48 for update;
  if not found then raise exception 'リンクが正しくありません'; end if;
  if r.expires_at <= now() then raise exception 'リンクの期限が切れています'; end if;
  a_days := coalesce(p_answer->'days', '[]'); if jsonb_typeof(a_days) <> 'array' or jsonb_array_length(a_days) > 80 then raise exception '日ごとの連絡が多すぎます'; end if;
  if jsonb_typeof(coalesce(p_answer->'weekdays', '{}')) <> 'object' then raise exception '曜日の形が正しくありません'; end if;
  note := nullif(btrim(coalesce(p_answer->>'note', '')), ''); if char_length(coalesce(note, '')) > 500 then raise exception '備考は500字までです'; end if;
  closed := leo_sched_closed(r.month);
  for d in select * from jsonb_array_elements(a_days) loop
    kd := d->>'kind'; if kd not in ('休み','母の送り','母の迎え','追加利用','時刻変更','送り場所変更') then raise exception '種類が正しくありません'; end if;
    begin dy := (d->>'day')::date; exception when others then raise exception '日付が正しくありません'; end;
    if dy < r.month or dy >= (r.month + interval '1 month')::date then raise exception '対象月以外の日付です'; end if;
    if dy = any(closed) then raise exception '% は事業所のお休みです', to_char(dy, 'MM/DD'); end if;
    if public.leo_left_on(r.child) is not null and dy > public.leo_left_on(r.child) then raise exception '退所日（%）の翌日以降は入力できません', to_char(public.leo_left_on(r.child), 'YYYY-MM-DD'); end if;
    tm := nullif(d->>'time', ''); if tm is not null and tm !~ '^\d{1,2}:\d{2}$' then raise exception '時刻は 15:30 の形で入れてください'; end if;
    if char_length(coalesce(d->>'place', '')) > 100 or char_length(coalesce(d->>'memo', '')) > 500 then raise exception '文字数が多すぎます'; end if;
  end loop;
  for wr in select key, value from jsonb_each(coalesce(p_answer->'weekdays', '{}')) loop
    if wr.key not in ('月','火','水','木','金','土') or jsonb_typeof(wr.value) <> 'object' then raise exception '曜日が正しくありません'; end if;
    tm := nullif(wr.value->>'school_time', ''); if tm is not null and tm !~ '^\d{1,2}:\d{2}$' then raise exception '時刻は 15:30 の形で入れてください'; end if;
    if char_length(coalesce(wr.value->>'pick_place', '')) > 100 or char_length(coalesce(wr.value->>'drop_place', '')) > 100 then raise exception '場所が長すぎます'; end if;
  end loop;
  usual := jsonb_array_length(a_days) = 0 and note is null;
  insert into leo_schedule_answer (request_id, child, month, is_usual, answer) values (r.id, r.child, r.month, usual, p_answer) returning id into aid;
  delete from leo_schedule_weekday where child = r.child and month = r.month;
  insert into leo_schedule_weekday (child, month, dow, use, school_time, pick_place, drop_place, answer_id)
  select r.child, r.month, jw.key, coalesce((jw.value->>'use')::boolean, true),
    case when nullif(jw.value->>'school_time', '') is null then null else lpad(split_part(jw.value->>'school_time', ':', 1), 2, '0') || ':' || split_part(jw.value->>'school_time', ':', 2) end,
    nullif(btrim(jw.value->>'pick_place'), ''), nullif(btrim(jw.value->>'drop_place'), ''), aid
  from jsonb_each(coalesce(p_answer->'weekdays', '{}')) jw;
  delete from leo_schedule_exception where child = r.child and month = r.month and source = '保護者';
  insert into leo_schedule_exception (child, month, day, kind, time, place, memo, answer_id)
  select r.child, r.month, (x->>'day')::date, x->>'kind',
    case when nullif(x->>'time', '') is null then null else lpad(split_part(x->>'time', ':', 1), 2, '0') || ':' || split_part(x->>'time', ':', 2) end,
    nullif(btrim(x->>'place'), ''), nullif(btrim(x->>'memo'), ''), aid from jsonb_array_elements(a_days) x;
  if note is not null then insert into leo_schedule_exception (child, month, day, kind, memo, answer_id) values (r.child, r.month, null, '要確認', note, aid); end if;
  update leo_schedule_request set answered_at = now() where id = r.id;
  return 'ok';
end $$;

-- 予定の中身。型表は今まで通り読むだけ。退所日の翌日以降の行は作らない。
create or replace function public.leo_sched_plan_core(p_month date) returns jsonb language plpgsql security definer set search_path = public as $$
declare ev jsonb := '[]'; warn jsonb := '[]'; closed date[]; last_day date := (p_month + interval '1 month - 1 day')::date;
  v record; g record; hol text;
begin
  closed := leo_sched_closed(p_month);
  create temp table if not exists _lsv (day date, child text, dow text, ks text, ke text, ps text, pe text, pst text, dst text, pord int, dord int, par text, pplace text, dplace text, parent_drop bool, parent_pick bool) on commit drop;
  truncate _lsv;
  insert into _lsv
  select d.day, k->>'児童名', d.dow, k->>'利用開始', k->>'利用終了', nullif(k->>'迎え開始', ''), nullif(k->>'送り終了', ''),
    leo_sched_staff(k->>'迎え担当'), leo_sched_staff(k->>'送り担当'), nullif(k->>'迎え順', '')::int, nullif(k->>'送り順', '')::int, coalesce(k->>'保護者送迎', ''),
    coalesce(nullif(k->>'迎え場所', ''), case when nullif(k->>'迎え開始', '') is null then '自宅' else '（未登録）' end), coalesce(nullif(k->>'送り場所（空欄なら自宅）', ''), '自宅'), false, false
  from (select d::date as day, (array['日','月','火','水','木','金','土'])[extract(dow from d)::int + 1] as dow from generate_series(p_month, last_day, interval '1 day') d) d
  join leo_sched_kata_all() k on k->>'曜日' = d.dow
  where d.day <> all(closed)
    and (public.leo_left_on(k->>'児童名') is null or d.day <= public.leo_left_on(k->>'児童名'))
    and (case when exists (select 1 from leo_schedule_weekday w where w.child = k->>'児童名' and w.month = p_month)
         then coalesce((select w.use from leo_schedule_weekday w where w.child = k->>'児童名' and w.month = p_month and w.dow = d.dow), false)
         else coalesce(k->>'利用週', '毎週') <> '不定期' end);
  for v in select c from (select distinct data->>'児童名' c from leo_sched_kata_all() data) x
    where coalesce(c, '') <> ''
      and (public.leo_left_on(c) is null or public.leo_left_on(c) >= p_month)
      and not exists (select 1 from leo_schedule_weekday w where w.child = c and w.month = p_month) loop
    warn := warn || jsonb_build_array(jsonb_build_object('child', v.c, 'msg', '回答がありません（型表の「毎週」どおりで作成）'));
  end loop;
  update _lsv s set
    ks = to_char((s.ks::time + (w.school_time::time - s.ps::time)), 'HH24:MI'), ps = w.school_time
    from leo_schedule_weekday w where w.child = s.child and w.month = p_month and w.dow = s.dow and w.school_time is not null and s.ps is not null and w.school_time <> s.ps;
  update _lsv s set pplace = coalesce(w.pick_place, s.pplace), dplace = coalesce(w.drop_place, s.dplace)
    from leo_schedule_weekday w where w.child = s.child and w.month = p_month and w.dow = s.dow;
  for v in select * from leo_schedule_exception e where e.month = p_month and e.day is not null order by e.id loop
    if public.leo_left_on(v.child) is not null and v.day > public.leo_left_on(v.child) then continue; end if;
    if v.kind = '休み' then
      delete from _lsv where child = v.child and day = v.day;
      ev := ev || jsonb_build_array(jsonb_build_object('day', v.day, 'kind', '休み', 'child', v.child, 'title', v.child || '　休み'));
    elsif v.kind in ('追加利用') then
      if not exists (select 1 from _lsv where child = v.child and day = v.day) and v.day <> all(closed) then
        insert into _lsv select v.day, v.child, d.dow, k->>'利用開始', k->>'利用終了', nullif(k->>'迎え開始', ''), nullif(k->>'送り終了', ''),
            leo_sched_staff(k->>'迎え担当'), leo_sched_staff(k->>'送り担当'), nullif(k->>'迎え順', '')::int, nullif(k->>'送り順', '')::int, coalesce(k->>'保護者送迎', ''),
            coalesce(nullif(k->>'迎え場所', ''), case when nullif(k->>'迎え開始', '') is null then '自宅' else '（未登録）' end), coalesce(nullif(k->>'送り場所（空欄なら自宅）', ''), '自宅'), false, false
          from (select (array['日','月','火','水','木','金','土'])[extract(dow from v.day)::int + 1] dow) d,
            lateral (select k from leo_sched_kata_all() k where k->>'児童名' = v.child order by (k->>'曜日' = d.dow) desc, k->>'曜日' limit 1) kk(k);
        if not found then warn := warn || jsonb_build_array(jsonb_build_object('child', v.child, 'msg', to_char(v.day, 'MM/DD') || ' 追加利用：型表に行がないため作れません')); end if;
      end if;
      if v.time is not null then
        update _lsv s set ks = case when s.ps is not null then to_char(s.ks::time + (v.time::time - s.ps::time), 'HH24:MI') else s.ks end, ps = case when s.ps is not null then v.time end where s.child = v.child and s.day = v.day;
      end if;
    elsif v.kind = '時刻変更' then
      update _lsv s set ks = case when s.ps is not null then to_char(s.ks::time + (v.time::time - s.ps::time), 'HH24:MI') else v.time end, ps = case when s.ps is not null then v.time end where s.child = v.child and s.day = v.day;
    elsif v.kind = '母の送り' then
      update _lsv set parent_drop = true, ps = null, pst = null where child = v.child and day = v.day;
    elsif v.kind = '母の迎え' then
      update _lsv set parent_pick = true, ke = coalesce(v.time, ke), pe = null, dst = null where child = v.child and day = v.day;
    elsif v.kind = '送り場所変更' then
      update _lsv set dplace = v.place where child = v.child and day = v.day;
    end if;
  end loop;
  delete from _lsv s where public.leo_left_on(s.child) is not null and s.day > public.leo_left_on(s.child);
  select coalesce(jsonb_agg(x), '[]') into ev from jsonb_array_elements(ev) x
    where public.leo_left_on(x->>'child') is null or nullif(x->>'day', '') is null or (x->>'day')::date <= public.leo_left_on(x->>'child');
  update _lsv set parent_drop = true, ps = null, pst = null where par = '母の送り' and not parent_drop;
  update _lsv set parent_pick = true, pe = null, dst = null where par = '母の迎え' and not parent_pick;
  for v in select distinct child, e.memo from leo_schedule_exception e where e.month = p_month and e.kind = '要確認'
    and (public.leo_left_on(e.child) is null or public.leo_left_on(e.child) >= p_month) loop
    warn := warn || jsonb_build_array(jsonb_build_object('child', v.child, 'msg', '保護者の備考：' || coalesce(v.memo, '')));
  end loop;
  select ev || coalesce(jsonb_agg(jsonb_build_object('day', day, 'kind', '利用', 'child', child, 'start_time', ks, 'end_time', ke, 'parent_drop', parent_drop, 'parent_pick', parent_pick,
      'title', child || case when parent_drop then '（母の送り）' when parent_pick then '（母の迎え）' else '' end,
      'note', (select '⚠ 保護者の備考：' || string_agg(coalesce(e.memo, ''), ' / ') from leo_schedule_exception e where e.month = p_month and e.kind = '要確認' and e.child = _lsv.child)) order by day, ks), '[]') into ev from _lsv;
  for g in select day, pst staff, array_agg(child order by ps, pord nulls last) kids, min(ps) st, max(ks) en,
        jsonb_object_agg(child, pplace) kp, jsonb_object_agg(child, ps) kt
      from (select *, sum(case when pm is null or ps >= pm then 1 else 0 end) over (partition by day, pst order by ps, pord) grp
            from (select *, max(ks) over (partition by day, pst order by ps, pord rows between unbounded preceding and 1 preceding) pm from _lsv where ps is not null and not parent_drop) a) b
      group by day, pst, grp loop
    ev := ev || jsonb_build_array(jsonb_build_object('day', g.day, 'kind', '迎え', 'kids', g.kids, 'staff', g.staff, 'start_time', g.st, 'end_time', g.en, 'kid_places', g.kp, 'kid_times', g.kt,
      'place', (select string_agg(distinct x, '、') from jsonb_each_text(g.kp) e(k, x) where x <> '自宅'), 'title', '☆' || array_to_string(g.kids, '→')));
    if g.staff is null then warn := warn || jsonb_build_array(jsonb_build_object('child', array_to_string(g.kids, '・'), 'msg', to_char(g.day, 'MM/DD') || ' 迎えの担当が決まっていません')); end if;
  end loop;
  for g in select day, dst staff, array_agg(child order by dord nulls last, ke) kids, min(ke) st, max(pe) en,
        jsonb_object_agg(child, dplace) kp, jsonb_object_agg(child, ke) kt
      from (select *, sum(case when pm is null or ke >= pm then 1 else 0 end) over (partition by day, dst order by ke, dord) grp
            from (select *, max(coalesce(pe, ke)) over (partition by day, dst order by ke, dord rows between unbounded preceding and 1 preceding) pm from _lsv where not parent_pick and (pe is not null or dst is not null)) a) b
      group by day, dst, grp loop
    ev := ev || jsonb_build_array(jsonb_build_object('day', g.day, 'kind', '送り', 'kids', g.kids, 'staff', g.staff, 'start_time', g.st, 'end_time', g.en, 'kid_places', g.kp, 'kid_times', g.kt,
      'place', (select string_agg(distinct x, '、') from jsonb_each_text(g.kp) e(k, x) where x <> '自宅'), 'title', '★' || array_to_string(g.kids, '→')));
    if g.staff is null then warn := warn || jsonb_build_array(jsonb_build_object('child', array_to_string(g.kids, '・'), 'msg', to_char(g.day, 'MM/DD') || ' 送りの担当が決まっていません')); end if;
  end loop;
  for g in select e.day, e.staff, e.title from leo_events e where e.kind = '不在' and e.day >= p_month and e.day <= last_day loop
    if exists (select 1 from jsonb_array_elements(ev) x where x->>'day' = g.day::text and x->>'staff' = g.staff and x->>'kind' in ('迎え', '送り')) then
      warn := warn || jsonb_build_array(jsonb_build_object('child', g.staff, 'msg', to_char(g.day, 'MM/DD') || ' 不在の予定（' || coalesce(g.title, '') || '）の日に送迎担当になっています'));
    end if;
  end loop;
  return jsonb_build_object('events', ev, 'warnings', warn, 'closed', to_jsonb(closed),
    'google_events', (select count(*) from leo_events where source = 'google' and kind in ('利用','迎え','送り','休み') and day >= p_month and day <= last_day),
    'answered', (select count(distinct a.child) from leo_schedule_answer a where a.month = p_month and (public.leo_left_on(a.child) is null or public.leo_left_on(a.child) >= p_month)),
    'children', (select count(distinct data->>'児童名') from leo_sched_kata_all() data where coalesce(data->>'児童名', '') <> '' and (public.leo_left_on(data->>'児童名') is null or public.leo_left_on(data->>'児童名') >= p_month)));
end $$;
revoke all on function public.leo_sched_plan_core(date) from public, anon, authenticated;

-- 日誌の枠を作る材料。その日が退所日よりあとなら、予定と型表の行から外す（表そのものは変えない）
create or replace function public.leo_frame_input(p_token text, p_day date)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare ev jsonb := '[]'; e record; kids text[]; j jsonb;
begin
  if encode(digest(p_token, 'sha256'), 'hex') is distinct from (select token_sha256 from sync_secret where name = 'leo') then raise exception 'bad token'; end if;
  for e in select * from leo_events where day = p_day order by id loop
    if e.kind in ('利用', '休み') and public.leo_left_on(e.child) is not null and p_day > public.leo_left_on(e.child) then continue; end if;
    j := to_jsonb(e) - 'updated_by';
    if e.kind in ('迎え', '送り') and e.kids is not null and cardinality(e.kids) > 0 then
      select coalesce(array_agg(u.k order by u.ord), '{}') into kids
      from unnest(e.kids) with ordinality as u(k, ord)
      where public.leo_left_on(u.k) is null or p_day <= public.leo_left_on(u.k);
      if cardinality(kids) = 0 then continue; end if;
      j := j || jsonb_build_object('kids', to_jsonb(kids));
      if j ? 'kid_places' and jsonb_typeof(j->'kid_places') = 'object' then
        j := jsonb_set(j, '{kid_places}', coalesce((select jsonb_object_agg(key, value) from jsonb_each(j->'kid_places') p where public.leo_left_on(p.key) is null or p_day <= public.leo_left_on(p.key)), '{}'::jsonb));
      end if;
      if j ? 'kid_times' and jsonb_typeof(j->'kid_times') = 'object' then
        j := jsonb_set(j, '{kid_times}', coalesce((select jsonb_object_agg(key, value) from jsonb_each(j->'kid_times') p where public.leo_left_on(p.key) is null or p_day <= public.leo_left_on(p.key)), '{}'::jsonb));
      end if;
    end if;
    ev := ev || jsonb_build_array(j);
  end loop;
  return jsonb_build_object(
    'events', ev,
    'roster', (select coalesce(jsonb_agg(distinct n), '[]') from (select child n from leo_nikki where child <> '' and day > p_day - 120
                 union select name from leo_children) x where n is not null),
    'kata', (select coalesce(jsonb_agg(s.data), '[]') from leo_sheet s where s.kind = 'kata'
              and (public.leo_left_on(s.data->>'児童名') is null or p_day <= public.leo_left_on(s.data->>'児童名'))),
    'nikki', (select coalesce(jsonb_agg(to_jsonb(n)), '[]') from leo_nikki n where n.day = p_day));
end $$;

-- 置き換えた関数の実行権限（元の定義と同じ。退所日の照会関数は職員画面には出さない）
revoke all on function public.leo_sched_open(date, text[]) from public, anon;
grant execute on function public.leo_sched_open(date, text[]) to authenticated;
revoke all on function public.leo_sched_get(text), public.leo_sched_submit(text, jsonb) from public;
grant execute on function public.leo_sched_get(text), public.leo_sched_submit(text, jsonb) to anon, authenticated;
revoke all on function public.leo_frame_input(text, date) from public;
grant execute on function public.leo_frame_input(text, date) to anon;
