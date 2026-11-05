-- 型表やカレンダーを直したあと、今日以降の予定（source=kata）と、職員がまだ保存していない日誌の送迎・開始を追従させる。
-- Supabase SQL Editor でこのファイルだけ Run する。何度実行してもよい。
-- 権限（RLS・grant）は変えない。過去の日は予定を消さない。source が kata 以外（カレンダーで直した便・削除の印・休み）は消さない。
-- 依存：leo_sched_plan_core / leo_norm / leo_kid_json / leo_record_allowed / leo_nikki_from_events（supabase/leo_record_flow.sql を一度は実行してあること）。
-- このファイルは leo_nikki_from_events も置き換える（record_flow と同じ中身）。

alter table public.leo_nikki add column if not exists staff_saved_at timestamptz;
alter table public.leo_nikki add column if not exists auto_fill jsonb;
comment on column public.leo_nikki.staff_saved_at is '職員が日誌の保存を押した時刻。入っている行の送迎・開始は自動で上書きしない。';
comment on column public.leo_nikki.auto_fill is '最後に自動で入れた送迎・開始。まだこの値の欄だけ、予定の変更で入れ直す。';

-- 職員が保存した行、過去の日は、空の欄だけ埋める。今日以降で未保存の欄は、前回の自動値・型表由来の値・送り時刻=終了のときだけ入れ直す。
create or replace function public.leo_auto_field(
  p_saved timestamptz, p_day date, p_auto jsonb, p_key text,
  p_cur text, p_new text, p_prev text, p_stale boolean
) returns text
language sql stable as $$
  select case
    when p_saved is not null then p_cur
    when p_day < (timezone('Asia/Tokyo', now()))::date then
      case when coalesce(btrim(p_cur), '') = '' then p_new else p_cur end
    when p_auto is not null
      and coalesce(btrim(p_cur), '') <> ''
      and btrim(p_cur) is distinct from nullif(p_auto->>p_key, '') then p_cur
    when coalesce(btrim(p_cur), '') = '' or p_stale
      or (p_prev is not null and btrim(p_cur) is not distinct from btrim(p_prev))
      or (p_auto is not null and (coalesce(btrim(p_cur), '') = '' or btrim(p_cur) is not distinct from nullif(p_auto->>p_key, '')))
      then p_new
    else p_cur
  end
$$;

create or replace function public.leo_kata_prev(p_day date, p_child text, p_key text) returns text
language plpgsql stable as $$
declare v text;
begin
  if p_key not in ('start_time','end_time','pick_time','pick_place','pick_driver','drop_time','drop_driver','drop_place') then
    return null;
  end if;
  if to_regclass('pg_temp._kata_prev') is null then return null; end if;
  execute format('select %I from _kata_prev where day = $1 and key = public.leo_norm($2)', p_key)
    into v using p_day, p_child;
  return v;
end $$;

create or replace function public.leo_hm_min(p text) returns int
language sql immutable as $$
  select case when m is null or m[1]::int > 23 or m[2]::int > 59 then null else m[1]::int * 60 + m[2]::int end
  from (select regexp_match(btrim(coalesce(p, '')), '^(\d{1,2}):(\d{2})') m) x
$$;

create or replace function public.leo_min_hm(p int) returns text
language sql immutable as $$
  select case when p is null then null else lpad((((p % 1440) + 1440) % 1440 / 60)::text, 2, '0') || ':' || lpad((((p % 1440) + 1440) % 1440 % 60)::text, 2, '0') end
$$;

-- カレンダーで便の時刻・場所を直したとき、児童ごとの時刻・場所を同じ内容にする。
-- 1人の便は、その子の時刻を便の時刻にする（迎えは開始、送りは終了）。複数人は、古い便の時刻と同じだった子を新しい時刻にし、それ以外は差分だけずらす。
create or replace function public.leo_events_align_kids() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  kids text[]; kid text; n int; delta int; oldt text; newt text; t text; place text;
  times jsonb := coalesce(NEW.kid_times, '{}'::jsonb);
  places jsonb := coalesce(NEW.kid_places, '{}'::jsonb);
begin
  if NEW.kind not in ('迎え', '送り') then return NEW; end if;
  if NEW.source = 'portal' and (coalesce(NEW.title, '') = 'カレンダーで削除' or coalesce(NEW.note, '') = 'カレンダーで削除') then
    return NEW;
  end if;
  kids := coalesce(NEW.kids, '{}');
  if coalesce(cardinality(kids), 0) = 0 and coalesce(NEW.child, '') <> '' then kids := array[NEW.child]; end if;
  n := coalesce(cardinality(kids), 0);
  if n = 0 then return NEW; end if;
  if n = 1 then
    kid := kids[1];
    newt := case when NEW.kind = '送り' then coalesce(nullif(btrim(NEW.end_time), ''), nullif(btrim(NEW.start_time), ''))
                 else nullif(btrim(NEW.start_time), '') end;
    if newt is not null then times := jsonb_build_object(kid, newt); end if;
    if nullif(btrim(NEW.place), '') is not null then places := jsonb_build_object(kid, btrim(NEW.place)); end if;
  else
    delta := public.leo_hm_min(NEW.start_time) - public.leo_hm_min(OLD.start_time);
    foreach kid in array kids loop
      oldt := nullif(btrim(times->>kid), '');
      if NEW.kind = '迎え' and oldt is not null and oldt is not distinct from nullif(btrim(OLD.start_time), '') then
        newt := nullif(btrim(NEW.start_time), '');
      elsif NEW.kind = '送り' and oldt is not null and (oldt is not distinct from nullif(btrim(OLD.end_time), '') or oldt is not distinct from nullif(btrim(OLD.start_time), '')) then
        newt := coalesce(nullif(btrim(NEW.end_time), ''), nullif(btrim(NEW.start_time), ''));
      elsif delta is not null and public.leo_hm_min(oldt) is not null and OLD.start_time is distinct from NEW.start_time then
        newt := public.leo_min_hm(public.leo_hm_min(oldt) + delta);
      else
        newt := oldt;
      end if;
      if newt is not null then times := jsonb_set(times, array[kid], to_jsonb(newt), true); end if;
      place := nullif(btrim(places->>kid), '');
      if place is not null and place is not distinct from nullif(btrim(OLD.place), '') and nullif(btrim(NEW.place), '') is not null then
        places := jsonb_set(places, array[kid], to_jsonb(btrim(NEW.place)), true);
      end if;
    end loop;
  end if;
  NEW.kid_times := times;
  NEW.kid_places := places;
  return NEW;
end $$;

drop trigger if exists leo_events_align_kids on public.leo_events;
create trigger leo_events_align_kids
  before update of start_time, end_time, place, staff
  on public.leo_events
  for each row execute function public.leo_events_align_kids();

-- すでに保存済みの1人便で、児童ごとの時刻だけ古いままのものを、その日の日誌を開く前に揃える。
create or replace function public.leo_align_event_kids(p_day date) returns void
language plpgsql security definer set search_path = public as $$
declare r record; kid text; newt text;
begin
  for r in
    select id, kind, child, kids, start_time, end_time, place
    from leo_events
    where day = p_day and kind in ('迎え', '送り') and source is distinct from 'kata'
      and not (source = 'portal' and (coalesce(title, '') = 'カレンダーで削除' or coalesce(note, '') = 'カレンダーで削除'))
  loop
    if coalesce(cardinality(r.kids), 0) > 1 then continue; end if;
    kid := coalesce(r.kids[1], nullif(r.child, ''));
    if kid is null then continue; end if;
    newt := case when r.kind = '送り' then coalesce(nullif(btrim(r.end_time), ''), nullif(btrim(r.start_time), ''))
                 else nullif(btrim(r.start_time), '') end;
    update leo_events e set
      kid_times = case when newt is null then e.kid_times else jsonb_build_object(kid, newt) end,
      kid_places = case when nullif(btrim(r.place), '') is null then e.kid_places else jsonb_build_object(kid, btrim(r.place)) end
    where e.id = r.id
      and (
        (newt is not null and public.leo_kid_json(e.kid_times, kid) is distinct from newt)
        or (nullif(btrim(r.place), '') is not null and public.leo_kid_json(e.kid_places, kid) is distinct from btrim(r.place))
      );
  end loop;
end $$;

create or replace function public.leo_portal_covers(p_day date, p_kind text, p_child text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from leo_events e
    where e.day = p_day and e.kind = p_kind and e.source is distinct from 'kata'
      and (
        public.leo_norm(e.child) = public.leo_norm(p_child)
        or exists (select 1 from unnest(coalesce(e.kids, '{}')) k where public.leo_norm(k) = public.leo_norm(p_child))
      )
  )
$$;

-- その日の source=kata の利用・迎え・送りだけ、今の型表（予定の中身）で入れ直す。カレンダーで直した便と削除の印は残す。
create or replace function public.leo_kata_rewrite_day(p_day date, p_plan jsonb default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  plan jsonb := p_plan;
  evj jsonb;
  kids_left text[];
  kid text;
begin
  if p_day is null or p_day < (timezone('Asia/Tokyo', now()))::date then return; end if;
  if plan is null then plan := public.leo_sched_plan_core(date_trunc('month', p_day)::date); end if;
  create temp table if not exists _kata_prev (
    day date, key text,
    start_time text, end_time text, pick_time text, pick_place text, pick_driver text,
    drop_time text, drop_driver text, drop_place text,
    primary key (day, key)
  ) on commit drop;
  if not exists (select 1 from _kata_prev where day = p_day) then
    insert into _kata_prev (day, key, start_time, end_time, pick_time, pick_place, pick_driver, drop_time, drop_driver, drop_place)
    select p_day, public.leo_norm(c.child),
      (select nullif(btrim(e.start_time), '') from leo_events e
        where e.day = p_day and e.source = 'kata' and e.kind = '利用' and public.leo_norm(e.child) = public.leo_norm(c.child)
        order by e.updated_at desc nulls last, e.id desc limit 1),
      (select nullif(btrim(e.end_time), '') from leo_events e
        where e.day = p_day and e.source = 'kata' and e.kind = '利用' and public.leo_norm(e.child) = public.leo_norm(c.child)
        order by e.updated_at desc nulls last, e.id desc limit 1),
      (select coalesce(public.leo_kid_json(e.kid_times, c.child), nullif(btrim(e.start_time), '')) from leo_events e
        where e.day = p_day and e.source = 'kata' and e.kind = '迎え'
          and (public.leo_norm(e.child) = public.leo_norm(c.child) or exists (select 1 from unnest(coalesce(e.kids, '{}')) k where public.leo_norm(k) = public.leo_norm(c.child)))
        order by e.updated_at desc nulls last, e.id desc limit 1),
      (select coalesce(public.leo_kid_json(e.kid_places, c.child), nullif(btrim(e.place), '')) from leo_events e
        where e.day = p_day and e.source = 'kata' and e.kind = '迎え'
          and (public.leo_norm(e.child) = public.leo_norm(c.child) or exists (select 1 from unnest(coalesce(e.kids, '{}')) k where public.leo_norm(k) = public.leo_norm(c.child)))
        order by e.updated_at desc nulls last, e.id desc limit 1),
      (select nullif(btrim(e.staff), '') from leo_events e
        where e.day = p_day and e.source = 'kata' and e.kind = '迎え'
          and (public.leo_norm(e.child) = public.leo_norm(c.child) or exists (select 1 from unnest(coalesce(e.kids, '{}')) k where public.leo_norm(k) = public.leo_norm(c.child)))
        order by e.updated_at desc nulls last, e.id desc limit 1),
      (select coalesce(
          case when nullif(btrim(public.leo_kid_json(e.kid_times, c.child)), '') is distinct from nullif(btrim(u.end_time), '')
               then nullif(btrim(public.leo_kid_json(e.kid_times, c.child)), '') end,
          case when nullif(btrim(e.end_time), '') is distinct from nullif(btrim(u.end_time), '')
               then nullif(btrim(e.end_time), '') end,
          nullif(btrim(e.start_time), ''))
        from leo_events e
        left join lateral (
          select end_time from leo_events u
          where u.day = p_day and u.source = 'kata' and u.kind = '利用' and public.leo_norm(u.child) = public.leo_norm(c.child)
          order by u.id desc limit 1
        ) u on true
        where e.day = p_day and e.source = 'kata' and e.kind = '送り'
          and (public.leo_norm(e.child) = public.leo_norm(c.child) or exists (select 1 from unnest(coalesce(e.kids, '{}')) k where public.leo_norm(k) = public.leo_norm(c.child)))
        order by e.updated_at desc nulls last, e.id desc limit 1),
      (select nullif(btrim(e.staff), '') from leo_events e
        where e.day = p_day and e.source = 'kata' and e.kind = '送り'
          and (public.leo_norm(e.child) = public.leo_norm(c.child) or exists (select 1 from unnest(coalesce(e.kids, '{}')) k where public.leo_norm(k) = public.leo_norm(c.child)))
        order by e.updated_at desc nulls last, e.id desc limit 1),
      (select coalesce(public.leo_kid_json(e.kid_places, c.child), nullif(btrim(e.place), '')) from leo_events e
        where e.day = p_day and e.source = 'kata' and e.kind = '送り'
          and (public.leo_norm(e.child) = public.leo_norm(c.child) or exists (select 1 from unnest(coalesce(e.kids, '{}')) k where public.leo_norm(k) = public.leo_norm(c.child)))
        order by e.updated_at desc nulls last, e.id desc limit 1)
    from (
      select e.child from leo_events e where e.day = p_day and e.source = 'kata' and e.kind = '利用' and coalesce(e.child, '') <> ''
      union
      select k from leo_events e cross join lateral unnest(coalesce(e.kids, '{}')) k
      where e.day = p_day and e.source = 'kata' and e.kind in ('迎え', '送り') and coalesce(k, '') <> ''
    ) c(child);
  end if;

  delete from leo_events e
  where e.source = 'kata' and e.day = p_day and e.kind in ('利用', '迎え', '送り');

  for evj in
    select value from jsonb_array_elements(coalesce(plan->'events', '[]'::jsonb))
    where (value->>'day')::date = p_day and value->>'kind' in ('利用', '迎え', '送り')
  loop
    if evj->>'kind' in ('迎え', '送り') then
      select coalesce(array_agg(t.k order by t.ord), '{}') into kids_left
      from jsonb_array_elements_text(coalesce(evj->'kids', '[]'::jsonb)) with ordinality t(k, ord)
      where not public.leo_portal_covers(p_day, evj->>'kind', t.k);
      if coalesce(cardinality(kids_left), 0) = 0 then continue; end if;
      insert into leo_events (day, kind, child, kids, staff, start_time, end_time, parent_drop, parent_pick, place, note, title, source, kid_places, kid_times)
      values (p_day, evj->>'kind', null, kids_left, evj->>'staff', evj->>'start_time', evj->>'end_time', false, false,
        (select string_agg(distinct v, '、') from jsonb_each_text(coalesce(evj->'kid_places', '{}'::jsonb)) e(k, v)
          where public.leo_norm(e.k) in (select public.leo_norm(u) from unnest(kids_left) u) and coalesce(v, '') <> '' and v <> '自宅'),
        evj->>'note', (case when evj->>'kind' = '迎え' then '☆' else '★' end) || array_to_string(kids_left, '→'), 'kata',
        (select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) from jsonb_each(coalesce(evj->'kid_places', '{}'::jsonb)) e
          where public.leo_norm(e.key) in (select public.leo_norm(u) from unnest(kids_left) u)),
        (select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) from jsonb_each(coalesce(evj->'kid_times', '{}'::jsonb)) e
          where public.leo_norm(e.key) in (select public.leo_norm(u) from unnest(kids_left) u)));
    elsif not public.leo_portal_covers(p_day, '利用', evj->>'child') then
      insert into leo_events (day, kind, child, kids, staff, start_time, end_time, parent_drop, parent_pick, place, note, title, source, kid_places, kid_times)
      values (p_day, evj->>'kind', evj->>'child', '{}', evj->>'staff', evj->>'start_time', evj->>'end_time',
        coalesce((evj->>'parent_drop')::bool, false), coalesce((evj->>'parent_pick')::bool, false),
        evj->>'place', evj->>'note', evj->>'title', 'kata', evj->'kid_places', evj->'kid_times');
    end if;
  end loop;
end $$;

create or replace function public.leo_kata_resync(p_from date default null) returns int
language plpgsql security definer set search_path = public as $$
declare
  d0 date := coalesce(p_from, (timezone('Asia/Tokyo', now()))::date);
  d1 date;
  m date;
  plan jsonb;
  d date;
  n int := 0;
begin
  if not public.leo_record_allowed() then raise exception 'レオ職員のみ'; end if;
  if d0 < (timezone('Asia/Tokyo', now()))::date then d0 := (timezone('Asia/Tokyo', now()))::date; end if;
  d1 := least(greatest(
      coalesce((select max(day) from leo_events where source = 'kata' and day >= d0), d0),
      (date_trunc('month', d0)::date + interval '2 month' - interval '1 day')::date
    ), d0 + 92);
  m := date_trunc('month', d0)::date;
  while m <= date_trunc('month', d1)::date loop
    plan := public.leo_sched_plan_core(m);
    for d in select generate_series(greatest(d0, m), least(d1, (m + interval '1 month' - interval '1 day')::date), '1 day')::date loop
      perform public.leo_kata_rewrite_day(d, plan);
      if exists (select 1 from leo_nikki where day = d) then
        perform public.leo_align_event_kids(d);
        perform public.leo_nikki_from_events(d);
      end if;
      n := n + 1;
    end loop;
    m := (m + interval '1 month')::date;
  end loop;
  return n;
end $$;

create or replace function public.leo_master_kata_touch() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from new_rows where kind = 'kata') then
    perform public.leo_kata_resync((timezone('Asia/Tokyo', now()))::date);
  end if;
  return null;
end $$;

drop trigger if exists leo_master_kata_touch on public.leo_master;
create trigger leo_master_kata_touch
  after insert on public.leo_master
  referencing new table as new_rows
  for each statement execute function public.leo_master_kata_touch();

create or replace function public.leo_nikki_from_events(p_day date) returns int
language plpgsql security definer set search_path = public as $$
declare
  r record;
  n int := 0;
  base int;
  svc text;
  p_driver text; p_time text; p_place text;
  d_driver text; d_time text; d_place text; d_src text; kata_drop text;
  kid_drop text; d_end text; d_start text; dow text;
begin
  if not public.leo_record_allowed() then raise exception 'レオ職員のみ'; end if;
  if p_day is null then raise exception '日付'; end if;
  if p_day >= (timezone('Asia/Tokyo', now()))::date then
    perform public.leo_align_event_kids(p_day);
    perform public.leo_kata_rewrite_day(p_day);
  end if;

  create temporary table if not exists _leo_plan (
    child text, kind text, start_time text, end_time text,
    parent_drop boolean, parent_pick boolean) on commit drop;
  truncate _leo_plan;

  insert into _leo_plan (child, kind, start_time, end_time, parent_drop, parent_pick)
  with ev as (
    select * from leo_events where day = p_day
  ), use_one as (
    select distinct on (public.leo_norm(child)) *
      from ev
     where kind = '利用' and coalesce(btrim(child), '') <> '' and not public.leo_event_hidden(source, title, note)
     order by public.leo_norm(child), updated_at desc nulls last, id desc
  ), abs_one as (
    select distinct on (public.leo_norm(child)) *
      from ev
     where kind = '休み' and coalesce(btrim(child), '') <> ''
       and (title = '欠席（欠席時対応加算）'
            or coalesce(note, '') like '%区分:欠席（欠席時対応加算）%'
            or coalesce(note, '') like '%区分：欠席（欠席時対応加算）%')
     order by public.leo_norm(child), updated_at desc nulls last, id desc
  ), cancel_one as (
    select distinct on (public.leo_norm(child)) *
      from ev
     where kind = '休み' and coalesce(btrim(child), '') <> ''
       and (title = 'キャンセル' or coalesce(note, '') like '%区分:キャンセル%' or coalesce(note, '') like '%区分：キャンセル%')
     order by public.leo_norm(child), updated_at desc nulls last, id desc
  )
  select coalesce(u.child, a.child),
    case
      when c.id is not null
       and (u.updated_at is null or c.updated_at >= u.updated_at)
       and (a.updated_at is null or c.updated_at >= a.updated_at) then null
      when a.id is not null and (u.updated_at is null or a.updated_at >= u.updated_at) then '欠席'
      when u.id is not null then '利用'
    end,
    u.start_time, u.end_time, coalesce(u.parent_drop, false), coalesce(u.parent_pick, false)
  from use_one u
  full join abs_one a on public.leo_norm(a.child) = public.leo_norm(u.child)
  left join cancel_one c on public.leo_norm(c.child) = public.leo_norm(coalesce(u.child, a.child));

  delete from _leo_plan where kind is null or coalesce(btrim(child), '') = '';

  -- 予定から消えた、まだ活動を書いていないポータル行だけ外す（キャンセルは日誌・実績に残さない）
  delete from leo_nikki n
   where n.day = p_day and n.seed = 'events'
     and coalesce(n.activity_via, '') <> '手入力'
     and coalesce(btrim(n.activity), '') = ''
     and not exists (select 1 from _leo_plan p where public.leo_norm(p.child) = public.leo_norm(n.child));

  for r in select * from _leo_plan order by kind, child loop
    select coalesce(nullif(e.staff, ''), case when r.parent_drop then '保護者' end),
           coalesce(public.leo_kid_json(e.kid_times, r.child), e.start_time),
           coalesce(public.leo_kid_json(e.kid_places, r.child), e.place)
      into p_driver, p_time, p_place
      from leo_events e
     where e.day = p_day and e.kind = '迎え' and not public.leo_event_hidden(e.source, e.title, e.note)
       and (public.leo_norm(e.child) = public.leo_norm(r.child)
            or exists (select 1 from unnest(e.kids) k where public.leo_norm(k) = public.leo_norm(r.child)))
     order by e.updated_at desc nulls last, e.id desc
     limit 1;
    if p_driver is null and r.parent_drop then p_driver := '保護者'; end if;

    select coalesce(nullif(e.staff, ''), case when r.parent_pick then '保護者' end),
           nullif(btrim(public.leo_kid_json(e.kid_times, r.child)), ''),
           nullif(btrim(e.end_time), ''),
           nullif(btrim(e.start_time), ''),
           coalesce(public.leo_kid_json(e.kid_places, r.child), e.place),
           e.source
      into d_driver, kid_drop, d_end, d_start, d_place, d_src
      from leo_events e
     where e.day = p_day and e.kind = '送り' and not public.leo_event_hidden(e.source, e.title, e.note)
       and (public.leo_norm(e.child) = public.leo_norm(r.child)
            or exists (select 1 from unnest(e.kids) k where public.leo_norm(k) = public.leo_norm(r.child)))
     order by e.updated_at desc nulls last, e.id desc
     limit 1;
    if d_driver is null and r.parent_pick then d_driver := '保護者'; end if;
    -- 送り時刻が空のときだけ埋める（下の update は、すでに入っている drop_time を残す）。
    -- 着の順。児童ごとの時刻が利用終了と同じときは、古い確定の写しなので着とみなさない。
    --   1. 児童ごとの着（kid_times。共有便ではその子の送り終了）
    --   2. 便の end_time（最後の着。型表の行が見つからなくてもここを使う）
    --   3. 型表の送り終了（画面の送り時間。列名が「送り時間」の行も読む）
    --   4. 便の start_time（乗り始め。利用終了と同じになりやすい）
    -- source が kata 以外（カレンダーで職員が直した便）は型表で置き換えない。
    -- 母の迎えの日は施設の送りが無いので型表では埋めない。保護者の回答に送り時刻の欄は無い。
    kata_drop := null;
    dow := (array['日','月','火','水','木','金','土'])[extract(dow from p_day)::int + 1];
    if not r.parent_pick then
      select nullif(btrim(coalesce(nullif(btrim(k->>'送り終了'), ''), nullif(btrim(k->>'送り時間'), ''))), '')
        into kata_drop
        from (
          select data as k from leo_master where kind = 'kata'
          union all
          select data from leo_sheet where kind = 'kata'
            and not exists (select 1 from leo_master where kind = 'kata')
        ) s
       where public.leo_norm(k->>'児童名') = public.leo_norm(r.child)
         and left(btrim(k->>'曜日'), 1) = dow
         and coalesce(k->>'保護者送迎', '') is distinct from '母の迎え'
       order by (btrim(k->>'曜日') = dow) desc, (k->>'児童名' = public.leo_name_canon(k->>'児童名')) desc, k->>'児童名'
       limit 1;
    end if;
    if d_src is not null and d_src is distinct from 'kata' then
      if kid_drop is not null and kid_drop is distinct from nullif(btrim(r.end_time), '') then
        d_time := kid_drop;
      elsif d_end is not null and d_end is distinct from nullif(btrim(r.end_time), '') then
        d_time := d_end;
      else
        d_time := coalesce(kid_drop, d_end, d_start);
      end if;
    elsif kid_drop is not null and kid_drop is distinct from nullif(btrim(r.end_time), '') then
      d_time := kid_drop;
    elsif d_end is not null and d_end is distinct from nullif(btrim(r.end_time), '') then
      d_time := d_end;
    elsif kata_drop is not null then
      d_time := kata_drop;
    else
      d_time := coalesce(kid_drop, d_end, d_start);
    end if;

    select c.kind into svc from leo_children c where public.leo_norm(c.name) = public.leo_norm(r.child) limit 1;

    if exists (select 1 from leo_nikki n where n.day = p_day and public.leo_norm(n.child) = public.leo_norm(r.child)) then
      update leo_nikki n set
        kind = case when n.seed = 'events' and coalesce(n.activity_via, '') <> '手入力' then r.kind else n.kind end,
        -- 種別が分かっていれば、日誌に先に入っていた「放課後等デイサービス」などで上書きする。不明なときは今の文字を残す。
        service = case when svc in ('児発', '放デイ') then svc else coalesce(nullif(btrim(n.service), ''), svc) end,
        start_time = public.leo_auto_field(n.staff_saved_at, n.day, n.auto_fill, 'start_time', n.start_time, case when r.kind = '利用' then nullif(btrim(r.start_time), '') end, public.leo_kata_prev(n.day, n.child, 'start_time'), false),
        end_time = public.leo_auto_field(n.staff_saved_at, n.day, n.auto_fill, 'end_time', n.end_time, case when r.kind = '利用' then nullif(btrim(r.end_time), '') end, public.leo_kata_prev(n.day, n.child, 'end_time'), false),
        pick_driver = public.leo_auto_field(n.staff_saved_at, n.day, n.auto_fill, 'pick_driver', n.pick_driver, p_driver, public.leo_kata_prev(n.day, n.child, 'pick_driver'), false),
        pick_time = public.leo_auto_field(n.staff_saved_at, n.day, n.auto_fill, 'pick_time', n.pick_time, p_time, public.leo_kata_prev(n.day, n.child, 'pick_time'), false),
        pick_place = public.leo_auto_field(n.staff_saved_at, n.day, n.auto_fill, 'pick_place', n.pick_place, p_place, public.leo_kata_prev(n.day, n.child, 'pick_place'), false),
        drop_driver = public.leo_auto_field(n.staff_saved_at, n.day, n.auto_fill, 'drop_driver', n.drop_driver, d_driver, public.leo_kata_prev(n.day, n.child, 'drop_driver'), false),
        drop_time = public.leo_auto_field(n.staff_saved_at, n.day, n.auto_fill, 'drop_time', n.drop_time, d_time, public.leo_kata_prev(n.day, n.child, 'drop_time'), coalesce(btrim(n.drop_time), '') <> '' and btrim(n.drop_time) is not distinct from btrim(n.end_time)),
        drop_place = public.leo_auto_field(n.staff_saved_at, n.day, n.auto_fill, 'drop_place', n.drop_place, d_place, public.leo_kata_prev(n.day, n.child, 'drop_place'), false),
        auto_fill = case when n.staff_saved_at is null and n.day >= (timezone('Asia/Tokyo', now()))::date then jsonb_build_object(
          'start_time', public.leo_auto_field(n.staff_saved_at, n.day, n.auto_fill, 'start_time', n.start_time, case when r.kind = '利用' then nullif(btrim(r.start_time), '') end, public.leo_kata_prev(n.day, n.child, 'start_time'), false),
          'end_time', public.leo_auto_field(n.staff_saved_at, n.day, n.auto_fill, 'end_time', n.end_time, case when r.kind = '利用' then nullif(btrim(r.end_time), '') end, public.leo_kata_prev(n.day, n.child, 'end_time'), false),
          'pick_driver', public.leo_auto_field(n.staff_saved_at, n.day, n.auto_fill, 'pick_driver', n.pick_driver, p_driver, public.leo_kata_prev(n.day, n.child, 'pick_driver'), false),
          'pick_time', public.leo_auto_field(n.staff_saved_at, n.day, n.auto_fill, 'pick_time', n.pick_time, p_time, public.leo_kata_prev(n.day, n.child, 'pick_time'), false),
          'pick_place', public.leo_auto_field(n.staff_saved_at, n.day, n.auto_fill, 'pick_place', n.pick_place, p_place, public.leo_kata_prev(n.day, n.child, 'pick_place'), false),
          'drop_driver', public.leo_auto_field(n.staff_saved_at, n.day, n.auto_fill, 'drop_driver', n.drop_driver, d_driver, public.leo_kata_prev(n.day, n.child, 'drop_driver'), false),
          'drop_time', public.leo_auto_field(n.staff_saved_at, n.day, n.auto_fill, 'drop_time', n.drop_time, d_time, public.leo_kata_prev(n.day, n.child, 'drop_time'), coalesce(btrim(n.drop_time), '') <> '' and btrim(n.drop_time) is not distinct from btrim(n.end_time)),
          'drop_place', public.leo_auto_field(n.staff_saved_at, n.day, n.auto_fill, 'drop_place', n.drop_place, d_place, public.leo_kata_prev(n.day, n.child, 'drop_place'), false)
        ) else n.auto_fill end,
        seed = case when n.day >= date '2026-11-01' then coalesce(n.seed, 'events') else n.seed end
      where n.day = p_day and public.leo_norm(n.child) = public.leo_norm(r.child);
      n := n + 1;
    else
      base := case when r.kind = '欠席' then 20 else 9 end;
      while exists (select 1 from leo_nikki where day = p_day and row_no = base) loop
        base := base + 1;
        if base > 80 then raise exception '日誌の行が足りません'; end if;
      end loop;
      insert into leo_nikki (day, row_no, kind, child, service, start_time, end_time,
        pick_driver, pick_time, pick_place, drop_driver, drop_time, drop_place, seed)
      values (p_day, base, r.kind, r.child, svc,
        case when r.kind = '利用' then nullif(btrim(r.start_time), '') end,
        case when r.kind = '利用' then nullif(btrim(r.end_time), '') end,
        p_driver, p_time, p_place, d_driver, d_time, d_place, 'events');
      update leo_nikki set auto_fill = jsonb_build_object(
        'start_time', start_time, 'end_time', end_time, 'pick_driver', pick_driver, 'pick_time', pick_time,
        'pick_place', pick_place, 'drop_driver', drop_driver, 'drop_time', drop_time, 'drop_place', drop_place)
      where day = p_day and row_no = base and day >= (timezone('Asia/Tokyo', now()))::date;
      n := n + 1;
    end if;
    p_driver := null; p_time := null; p_place := null;
    d_driver := null; d_time := null; d_place := null; d_src := null; kata_drop := null;
    kid_drop := null; d_end := null; d_start := null;
    svc := null;
  end loop;
  return n;
end $$;

create or replace function public.leo_nikki_apply(p_day date, p_row int, p_fields jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  allowed text[] := array['activity','pick_place','pick_time','pick_driver','start_time','end_time','drop_time','drop_driver','drop_place'];
  k text; v text; child text; touched_activity boolean := false;
begin
  if not public.leo_record_allowed() then raise exception 'レオ職員のみ'; end if;
  if p_day is null or p_row is null or jsonb_typeof(p_fields) <> 'object' then raise exception '形式'; end if;
  if not exists (select 1 from leo_nikki where day = p_day and row_no = p_row) then raise exception '日誌の行がありません'; end if;
  for k, v in select e.key, e.value from jsonb_each_text(p_fields) e loop
    if not (k = any (allowed)) then continue; end if;
    v := nullif(btrim(v), '');
    if k = 'activity' then
      update leo_nikki set activity = left(coalesce(v, ''), 6000), activity_via = '手入力' where day = p_day and row_no = p_row;
      touched_activity := true;
    elsif k = 'pick_place' then update leo_nikki set pick_place = v where day = p_day and row_no = p_row;
    elsif k = 'pick_time' then update leo_nikki set pick_time = v where day = p_day and row_no = p_row;
    elsif k = 'pick_driver' then update leo_nikki set pick_driver = v where day = p_day and row_no = p_row;
    elsif k = 'start_time' then update leo_nikki set start_time = v where day = p_day and row_no = p_row;
    elsif k = 'end_time' then update leo_nikki set end_time = v where day = p_day and row_no = p_row;
    elsif k = 'drop_time' then update leo_nikki set drop_time = v where day = p_day and row_no = p_row;
    elsif k = 'drop_driver' then update leo_nikki set drop_driver = v where day = p_day and row_no = p_row;
    elsif k = 'drop_place' then update leo_nikki set drop_place = v where day = p_day and row_no = p_row;
    end if;
  end loop;
  update leo_nikki set staff_saved_at = coalesce(staff_saved_at, now()) where day = p_day and row_no = p_row;
  if touched_activity then
    select nk.child into child from leo_nikki nk where nk.day = p_day and nk.row_no = p_row;
    insert into leo_activity (day, child, text, source, made_by)
    select p_day, child, left(coalesce(nk.activity, ''), 6000), '手入力', auth.uid()
      from leo_nikki nk where nk.day = p_day and nk.row_no = p_row
    on conflict (day, child) do update
      set text = excluded.text, source = '手入力', made_at = now(), made_by = excluded.made_by;
  end if;
  perform public.leo_jisseki_from_nikki(p_day);
end $$;
