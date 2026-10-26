-- 児童名の照合テスト。本番の SQL Editor には貼らない（関数をテスト用の定義で置き換える）。
-- 使い方: 空のデータベースで psql -v ON_ERROR_STOP=1 -f tools/leo_sched_name_test.sql
\set ON_ERROR_STOP on

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
end $$;

\ir ../supabase/leo_sched_name.sql

create table if not exists public.leo_kata_test (data jsonb);
create or replace function public.leo_sched_kata_all() returns setof jsonb
language sql stable security definer set search_path = public as $$
  select data from public.leo_kata_test $$;

create or replace function public.leo_sched_closed(p_month date) returns date[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(h::date), '{}') from unnest(array[
    '2026-11-03','2026-11-23','2027-01-01','2027-01-11','2027-02-11','2027-02-23','2027-03-21','2027-03-22',
    '2027-04-29','2027-05-03','2027-05-04','2027-05-05','2027-07-19','2027-08-11','2027-09-20','2027-09-23',
    '2027-10-11','2027-11-03','2027-11-23']) h
  where h::date >= p_month and h::date < (p_month + interval '1 month')::date $$;

create or replace function public.leo_sched_staff(p text) returns text
language sql immutable as $$ select nullif(p, '') $$;

create or replace function public.leo_left_on(p_name text) returns date
language sql stable as $$ select null::date $$;

create table if not exists public.leo_schedule_weekday (
  child text not null, month date not null, dow text not null,
  use boolean not null default true,
  school_time text, pick_place text, drop_place text,
  answer_id bigint, answered_at timestamptz not null default now(),
  primary key (child, month, dow));
create table if not exists public.leo_schedule_exception (
  id bigint generated always as identity primary key,
  child text not null, month date not null, day date,
  kind text not null, time text, place text, memo text,
  source text not null default '保護者', answer_id bigint);
create table if not exists public.leo_schedule_answer (
  id bigint generated always as identity primary key,
  request_id bigint, child text not null, month date not null,
  answered_at timestamptz not null default now(),
  is_usual boolean not null default false, answer jsonb not null default '{}'::jsonb);
create table if not exists public.leo_schedule_request (
  id bigint generated always as identity primary key,
  child text not null, month date not null,
  token text not null unique, expires_at timestamptz not null,
  answered_at timestamptz);
create table if not exists public.leo_events (
  id bigint generated always as identity primary key,
  day date not null, kind text not null, child text,
  kids text[] not null default '{}', staff text,
  start_time text, end_time text,
  parent_drop boolean not null default false, parent_pick boolean not null default false,
  place text, note text, title text, source text not null default 'portal',
  kid_places jsonb, kid_times jsonb);

insert into public.leo_events (day, kind, child, title, source)
values ('2026-11-01', 'その他', 'marker', 'keep', 'portal');

do $$
declare n int; p jsonb; msg text;
begin
  if public.leo_name_canon('  山根' || chr(12288) || chr(12288) || '一輝  ') <> '山根 一輝' then
    raise exception 'FAIL canon fullwidth'; end if;
  if public.leo_name_canon('山根' || chr(160) || '一輝') <> '山根 一輝' then
    raise exception 'FAIL canon nbsp'; end if;
  if public.leo_name_canon('山根  一輝') <> '山根 一輝' then
    raise exception 'FAIL canon repeat'; end if;
  if public.leo_name_canon('山根一輝') <> '山根一輝' then
    raise exception 'FAIL canon no-space must stay'; end if;
  if length(chr(12288) || chr(160) || chr(5760)
      || chr(8192) || chr(8193) || chr(8194) || chr(8195) || chr(8196) || chr(8197) || chr(8198) || chr(8199) || chr(8200) || chr(8201) || chr(8202)
      || chr(8232) || chr(8233) || chr(8239) || chr(8287) || chr(65279)) <> 19 then
    raise exception 'FAIL translate length'; end if;
  if extract(dow from date '2026-11-17') <> 2 or extract(dow from date '2026-11-11') <> 3 then
    raise exception 'FAIL dow'; end if;

  if (select count(*) from public.leo_name_resolve(array['市川 碧音','山根 一輝'], array['碧音']) r where r.kind = 'link' and r.kata = '市川 碧音' and r.answer = '碧音') <> 1 then
    raise exception 'FAIL resolve 碧音'; end if;
  if (select count(*) from public.leo_name_resolve(array['山根 一輝'], array['一輝','山根　一輝']) r where r.kind = 'link' and r.kata = '山根 一輝') <> 2 then
    raise exception 'FAIL resolve 山根'; end if;
  if (select kind from public.leo_name_resolve(array['市川 碧音'], array['市川'])) <> 'orphan' then
    raise exception 'FAIL surname must not link'; end if;
  if (select kind from public.leo_name_resolve(array['山田 一輝'], array['田一輝'])) <> 'orphan' then
    raise exception 'FAIL 田一輝 must not link'; end if;
  if (select kind from public.leo_name_resolve(array['山根 一輝'], array['山根一輝'])) <> 'orphan' then
    raise exception 'FAIL no-space must not link'; end if;
  if (select count(*) from public.leo_name_resolve(array['市川 碧音','佐藤 碧音'], array['碧音']) r where r.kind = 'ambiguous') <> 2 then
    raise exception 'FAIL ambiguous 碧音'; end if;
end $$;

insert into public.leo_kata_test (data) values
  ('{"児童名":"市川 碧音","曜日":"火","利用週":"毎週","利用開始":"15:00","利用終了":"17:00"}'),
  ('{"児童名":"市川 碧音","曜日":"水","利用週":"不定期","利用開始":"15:00","利用終了":"17:00"}'),
  ('{"児童名":"山根 一輝","曜日":"火","利用週":"毎週","利用開始":"15:00","利用終了":"17:00"}'),
  ('{"児童名":"山根 一輝","曜日":"水","利用週":"毎週","利用開始":"15:00","利用終了":"17:00"}'),
  ('{"児童名":"児童C","曜日":"火","利用週":"毎週","利用開始":"15:00","利用終了":"17:00"}'),
  ('{"児童名":"児童C","曜日":"水","利用週":"不定期","利用開始":"15:00","利用終了":"17:00"}');

insert into public.leo_schedule_weekday (child, month, dow, use) values
  ('碧音', '2026-11-01', '火', false),
  ('碧音', '2026-11-01', '水', true),
  ('山根　一輝', '2026-11-01', '火', false),
  ('山根　一輝', '2026-11-01', '水', true);
insert into public.leo_schedule_exception (child, month, day, kind) values
  ('碧音', '2026-11-01', '2026-11-11', '休み');
insert into public.leo_schedule_answer (child, month, answer) values
  ('碧音', '2026-11-01', '{"note":"history"}'),
  ('山根　一輝', '2026-11-01', '{"note":"history"}');

do $$
declare p jsonb; days date[];
begin
  p := public.leo_sched_plan_core('2026-11-01');
  select coalesce(array_agg((e->>'day')::date order by (e->>'day')::date), '{}') into days
    from jsonb_array_elements(p->'events') e where e->>'kind' = '利用' and e->>'child' = '市川 碧音';
  if days <> array['2026-11-04','2026-11-18','2026-11-25']::date[] then
    raise exception 'FAIL 市川 碧音 days %', days; end if;
  if exists (select 1 from jsonb_array_elements(p->'events') e where e->>'child' = '碧音') then
    raise exception 'FAIL event child stayed 碧音'; end if;
  if (select count(*) from jsonb_array_elements(p->'events') e where e->>'kind' = '休み' and e->>'child' = '市川 碧音' and (e->>'day')::date = '2026-11-11') <> 1 then
    raise exception 'FAIL 11/11 休み'; end if;
  if exists (select 1 from jsonb_array_elements(p->'events') e where e->>'kind' = '利用' and e->>'child' = '市川 碧音' and extract(dow from (e->>'day')::date) = 2) then
    raise exception 'FAIL 市川 tuesday still present'; end if;

  select coalesce(array_agg((e->>'day')::date order by (e->>'day')::date), '{}') into days
    from jsonb_array_elements(p->'events') e where e->>'kind' = '利用' and e->>'child' = '山根 一輝';
  if days <> array['2026-11-04','2026-11-11','2026-11-18','2026-11-25']::date[] then
    raise exception 'FAIL 山根 days %', days; end if;
  if exists (select 1 from jsonb_array_elements(p->'events') e where e->>'child' = '山根　一輝') then
    raise exception 'FAIL fullwidth child on event'; end if;

  if exists (select 1 from jsonb_array_elements(p->'events') e
    where e->>'child' = '児童C' or (e->'kids') ? '児童C') then
    raise exception 'FAIL 児童C unanswered must have no events'; end if;

  if exists (select 1 from jsonb_array_elements(p->'warnings') w where w->>'msg' like '未回答のため予定を作りません' and w->>'child' in ('市川 碧音','山根 一輝')) then
    raise exception 'FAIL matched child warned as unanswered'; end if;
  if (select count(*) from jsonb_array_elements(p->'warnings') w where w->>'child' = '児童C' and w->>'msg' = '未回答のため予定を作りません') <> 1 then
    raise exception 'FAIL 児童C should be listed as unanswered'; end if;

  if (select count(*) from public.leo_events where child = 'marker' and source = 'portal') <> 1 then
    raise exception 'FAIL marker event'; end if;
  if (select count(*) from public.leo_events where source = 'kata') <> 0 then
    raise exception 'FAIL plan wrote kata events'; end if;
  if (select count(*) from public.leo_schedule_weekday where child = '碧音' and month = '2026-11-01') <> 2 then
    raise exception 'FAIL plan renamed 碧音'; end if;
  if (select count(*) from public.leo_schedule_answer where child = '碧音') <> 1 then
    raise exception 'FAIL plan renamed answer'; end if;
end $$;

insert into public.leo_schedule_request (child, month, token, expires_at)
values ('山根　一輝', '2026-11-01', repeat('ab', 24), now() + interval '7 days');

select public.leo_sched_submit(repeat('ab', 24), '{"weekdays":{"火":{"use":false},"水":{"use":true}},"days":[]}'::jsonb);

do $$
begin
  if (select child from public.leo_schedule_request where token = repeat('ab', 24)) <> '山根　一輝' then
    raise exception 'FAIL request child changed'; end if;
  if exists (select 1 from public.leo_schedule_weekday where month = '2026-11-01' and child = '山根　一輝') then
    raise exception 'FAIL fullwidth weekday remained'; end if;
  if (select count(*) from public.leo_schedule_weekday where month = '2026-11-01' and child = '山根 一輝') <> 2 then
    raise exception 'FAIL canon weekday missing'; end if;
  if (select count(*) from public.leo_schedule_answer where child = '山根　一輝') <> 1 then
    raise exception 'FAIL old answer removed'; end if;
  if (select count(*) from public.leo_schedule_answer where child = '山根 一輝') <> 1 then
    raise exception 'FAIL new answer not canon'; end if;
  if (select count(*) from public.leo_schedule_weekday where child = '碧音') <> 2 then
    raise exception 'FAIL submit touched 碧音'; end if;
end $$;

delete from public.leo_kata_test;
delete from public.leo_schedule_weekday;
delete from public.leo_schedule_exception;
delete from public.leo_schedule_answer;
insert into public.leo_kata_test (data) values
  ('{"児童名":"市川 碧音","曜日":"火","利用週":"毎週","利用開始":"15:00","利用終了":"17:00"}'),
  ('{"児童名":"佐藤 碧音","曜日":"火","利用週":"毎週","利用開始":"15:00","利用終了":"17:00"}');
insert into public.leo_schedule_weekday (child, month, dow, use) values
  ('碧音', '2026-11-01', '火', false);

do $$
declare p jsonb; msg text; days date[];
begin
  p := public.leo_sched_plan_core('2026-11-01');
  select string_agg(w->>'msg', ' / ') into msg from jsonb_array_elements(p->'warnings') w where w->>'msg' like '%複数の児童%';
  if msg is null or msg not like '%市川 碧音%' or msg not like '%佐藤 碧音%' then
    raise exception 'FAIL ambiguous warning %', msg; end if;
  select coalesce(array_agg((e->>'day')::date order by (e->>'day')::date), '{}') into days
    from jsonb_array_elements(p->'events') e where e->>'kind' = '利用' and e->>'child' = '市川 碧音';
  if days <> array['2026-11-10','2026-11-17','2026-11-24']::date[] then
    raise exception 'FAIL ambiguous 市川 days %', days; end if;
  select coalesce(array_agg((e->>'day')::date order by (e->>'day')::date), '{}') into days
    from jsonb_array_elements(p->'events') e where e->>'kind' = '利用' and e->>'child' = '佐藤 碧音';
  if days <> array['2026-11-10','2026-11-17','2026-11-24']::date[] then
    raise exception 'FAIL ambiguous 佐藤 days %', days; end if;
  if (select count(*) from public.leo_events where source = 'kata') <> 0 then
    raise exception 'FAIL second plan wrote events'; end if;
end $$;

\echo leo_sched_name_test ok
