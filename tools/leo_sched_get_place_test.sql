-- 保護者フォーム用 leo_sched_get の場所：型表の値のまま返し、空欄は空欄（自宅を補わない）。
-- 本番の SQL Editor には貼らない。使い方: 空のデータベースで psql -v ON_ERROR_STOP=1 -f tools/leo_sched_get_place_test.sql
\set ON_ERROR_STOP on

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
end $$;

\ir ../supabase/leo_sched_name.sql

create table public.leo_kata_test (data jsonb);
create or replace function public.leo_sched_kata_all() returns setof jsonb
language sql stable security definer set search_path = public as $$
  select data from public.leo_kata_test $$;
create or replace function public.leo_sched_closed(p_month date) returns date[]
language sql stable security definer set search_path = public as $$ select '{}'::date[] $$;
create or replace function public.leo_sched_staff(p text) returns text language sql immutable as $$ select nullif(p, '') $$;
create or replace function public.leo_left_on(p_name text) returns date language sql stable as $$ select null::date $$;

create table if not exists public.leo_schedule_weekday (
  child text not null, month date not null, dow text not null, use boolean not null default true,
  school_time text, pick_place text, drop_place text, answer_id bigint, answered_at timestamptz not null default now(),
  primary key (child, month, dow));
create table if not exists public.leo_schedule_exception (
  id bigint generated always as identity primary key, child text not null, month date not null, day date,
  kind text not null, time text, place text, memo text, source text not null default '保護者', answer_id bigint);
create table if not exists public.leo_schedule_answer (
  id bigint generated always as identity primary key, request_id bigint, child text not null, month date not null,
  answered_at timestamptz not null default now(), is_usual boolean not null default false, answer jsonb not null default '{}'::jsonb);
create table if not exists public.leo_schedule_request (
  id bigint generated always as identity primary key, child text not null, month date not null,
  token text not null unique, expires_at timestamptz not null, answered_at timestamptz);

-- 型表：月=迎え下野小学校/送り空欄、木=迎え・送りとも空白だけ、金=迎え空欄/送り自宅と明記
insert into public.leo_kata_test (data) values
  ('{"児童名":"山根 一輝","曜日":"月","利用週":"毎週","利用開始":"15:00","利用終了":"17:00","迎え開始":"14:30","迎え場所":" 下野小学校 ","送り場所（空欄なら自宅）":""}'),
  ('{"児童名":"山根 一輝","曜日":"木","利用週":"毎週","利用開始":"15:00","利用終了":"17:00","迎え開始":"14:30","迎え場所":"　 ","送り場所（空欄なら自宅）":"　"}'),
  ('{"児童名":"山根 一輝","曜日":"金","利用週":"毎週","利用開始":"15:00","利用終了":"17:00","迎え開始":"14:30","送り場所（空欄なら自宅）":"自宅"}');

-- 前回（10月）の回答：場所が古い。leo_sched_get は prev にそのまま返すが、regular の場所は型表の値。
insert into public.leo_schedule_answer (child, month, answer) values
  ('山根 一輝', '2026-10-01', '{"weekdays":{"月":{"use":true,"pick_place":"下野こども園","drop_place":"旧送り先"}}}');
insert into public.leo_schedule_request (child, month, token, expires_at)
values ('山根 一輝', '2026-12-01', repeat('cd', 24), now() + interval '7 days');

do $$
declare g jsonb; r jsonb;
begin
  g := public.leo_sched_get(repeat('cd', 24));
  select x into r from jsonb_array_elements(g->'regular') x where x->>'dow' = '月';
  if r->>'pick_place' is distinct from '下野小学校' then raise exception 'FAIL 月 pick_place %', r; end if;
  if r->'drop_place' is distinct from 'null'::jsonb then raise exception 'FAIL 月 drop_place must be null (blank): %', r; end if;
  select x into r from jsonb_array_elements(g->'regular') x where x->>'dow' = '木';
  if r->'pick_place' is distinct from 'null'::jsonb or r->'drop_place' is distinct from 'null'::jsonb then
    raise exception 'FAIL 木 whitespace-only must be blank: %', r; end if;
  select x into r from jsonb_array_elements(g->'regular') x where x->>'dow' = '金';
  if r->'pick_place' is distinct from 'null'::jsonb then raise exception 'FAIL 金 pick_place blank: %', r; end if;
  if r->>'drop_place' is distinct from '自宅' then raise exception 'FAIL 金 自宅 written in 型表 must stay: %', r; end if;
  if g::text like '%（未登録）%' then raise exception 'FAIL 未登録'; end if;
  if g->'prev'->'answer'->'weekdays'->'月'->>'pick_place' is distinct from '下野こども園' then
    raise exception 'FAIL prev must stay as stored'; end if;
end $$;

\echo leo_sched_get_place_test ok
