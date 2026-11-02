-- 迎え場所・送り場所：回答に場所があれば回答、空欄なら型表、どちらも空欄なら空欄、のテスト。本番の SQL Editor には貼らない（関数をテスト用の定義で置き換える）。
-- 使い方: 空のデータベースで psql -v ON_ERROR_STOP=1 -f tools/leo_kata_place_test.sql
\set ON_ERROR_STOP on

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
end $$;

create table public.leo_events (
  id bigint generated always as identity primary key,
  day date not null, kind text not null, child text,
  kids text[] not null default '{}', staff text,
  start_time text, end_time text,
  parent_drop boolean not null default false, parent_pick boolean not null default false,
  place text, note text, title text, source text not null default 'portal',
  kid_places jsonb, kid_times jsonb);
create table public.leo_schedule_weekday (
  child text not null, month date not null, dow text not null,
  use boolean not null default true,
  school_time text, pick_place text, drop_place text,
  answer_id bigint, answered_at timestamptz not null default now(),
  primary key (child, month, dow));
create table public.leo_schedule_exception (
  id bigint generated always as identity primary key,
  child text not null, month date not null, day date,
  kind text not null, time text, place text, memo text,
  source text not null default '保護者', answer_id bigint);
create table public.leo_schedule_answer (
  id bigint generated always as identity primary key,
  request_id bigint, child text not null, month date not null,
  answered_at timestamptz not null default now(),
  is_usual boolean not null default false, answer jsonb not null default '{}'::jsonb);
create table public.leo_master (kind text, data jsonb);   -- 型表（本番では画面で保存した型表）
create table public.leo_sheet (kind text, data jsonb);

create function public.can_manage() returns boolean language sql as $$ select true $$;
create function public.leo_sched_staff(p text) returns text language sql immutable as $$ select nullif(p, '') $$;
create function public.leo_left_on(p_name text) returns date language sql stable as $$ select null::date $$;
create function public.leo_sched_closed(p_month date) returns date[] language sql stable as $$ select '{}'::date[] $$;

\ir ../supabase/leo_schedule_build.sql

-- 型表（2026-11 は 月=2,9,16,23,30 / 木=5,12,19,26 / 金=6,13,20,27）
-- 山根 一輝: 月 迎え場所=下野小学校（直した後の値）、送り場所=空欄
-- 市川 湊  : 月 迎え場所=海蔵こども園（直した後の値）、送り場所=自宅と明記
-- 児童D    : 月 迎えも送りも担当ありだが、場所は両方とも空欄（全角スペースだけも空欄扱い）
-- 児童E    : 火 迎えなし（保護者が迎え）。場所は空欄
insert into public.leo_master (kind, data) values
  ('kata', '{"児童名":"山根 一輝","曜日":"月","利用週":"毎週","利用開始":"15:00","利用終了":"17:00","迎え開始":"14:30","迎え担当":"職員A","迎え順":"1","迎え場所":"下野小学校","送り終了":"17:00","送り担当":"職員B","送り順":"1","送り場所（空欄なら自宅）":""}'),
  ('kata', '{"児童名":"山根 一輝","曜日":"木","利用週":"毎週","利用開始":"15:00","利用終了":"17:00","迎え開始":"14:30","迎え担当":"職員A","迎え順":"1","迎え場所":"下野小学校","送り終了":"17:00","送り担当":"職員B","送り順":"1","送り場所（空欄なら自宅）":""}'),
  ('kata', '{"児童名":"市川 湊","曜日":"月","利用週":"毎週","利用開始":"15:00","利用終了":"17:00","迎え開始":"14:30","迎え担当":"職員A","迎え順":"2","迎え場所":"海蔵こども園","送り終了":"17:00","送り担当":"職員B","送り順":"2","送り場所（空欄なら自宅）":"自宅"}'),
  ('kata', '{"児童名":"児童D","曜日":"月","利用週":"毎週","利用開始":"15:00","利用終了":"17:00","迎え開始":"14:30","迎え担当":"職員C","迎え順":"1","迎え場所":"","送り終了":"17:40","送り担当":"職員D","送り順":"1","送り場所（空欄なら自宅）":"　 "}'),
  ('kata', '{"児童名":"児童E","曜日":"火","利用週":"毎週","利用開始":"15:00","利用終了":"17:00","保護者送迎":"","迎え場所":"","送り終了":"17:00","送り担当":"職員D","送り順":"2","送り場所（空欄なら自宅）":""}');

-- 保護者の回答。場所が入っていればそれが優先、空欄・空白だけなら型表。
--   一輝 月: 迎え=下野こども園（回答あり→回答が勝つ）、送り=空欄（→型表の空欄）
--   一輝 木: 迎え・送りとも NULL（→型表の下野小学校）
--   湊   月: 迎え=全角スペースと空白だけ（→型表の海蔵こども園）、送り=旧送り先（回答あり→回答が勝つ。型表の「自宅」より優先）
--   児童D/E: 回答の場所は空欄（型表も空欄 → 空欄のまま）
insert into public.leo_schedule_weekday (child, month, dow, use, school_time, pick_place, drop_place) values
  ('山根 一輝', '2026-11-01', '月', true, '14:30', '下野こども園', ''),
  ('山根 一輝', '2026-11-01', '木', true, '14:30', null, null),
  ('市川　湊',  '2026-11-01', '月', true, '14:30', '　 ', '旧送り先'),
  ('児童D',     '2026-11-01', '月', true, '14:10', ' ', null),
  ('児童E',     '2026-11-01', '火', true, '15:00', '', '　');
insert into public.leo_schedule_answer (child, month, answer) values
  ('山根 一輝', '2026-11-01', '{}'), ('市川　湊', '2026-11-01', '{}'), ('児童D', '2026-11-01', '{}'), ('児童E', '2026-11-01', '{}');
-- 日ごとの連絡：11/09（月）の一輝の送り場所だけ変える
insert into public.leo_schedule_exception (child, month, day, kind, place) values
  ('山根 一輝', '2026-11-01', '2026-11-09', '送り場所変更', '祖父母宅');

create function pg_temp.kp(p jsonb, p_day date, p_kind text, p_kid text) returns text language sql as $$
  select e->'kid_places'->>p_kid from jsonb_array_elements(p->'events') e
  where e->>'kind' = p_kind and (e->>'day')::date = p_day and (e->'kids') ? p_kid $$;
create function pg_temp.has_kp(p jsonb, p_day date, p_kind text, p_kid text) returns boolean language sql as $$
  select exists (select 1 from jsonb_array_elements(p->'events') e
  where e->>'kind' = p_kind and (e->>'day')::date = p_day and (e->'kids') ? p_kid) $$;
create function pg_temp.kt(p jsonb, p_day date, p_kind text, p_kid text) returns text language sql as $$
  select e->'kid_times'->>p_kid from jsonb_array_elements(p->'events') e
  where e->>'kind' = p_kind and (e->>'day')::date = p_day and (e->'kids') ? p_kid $$;

do $$
declare p jsonb; r text; n int;
begin
  p := public.leo_sched_plan_core('2026-11-01');

  -- 1) 回答に場所があればそれ、なければ型表
  if pg_temp.kp(p, '2026-11-02', '迎え', '山根 一輝') is distinct from '下野こども園' then
    raise exception 'FAIL 一輝 月 迎え: answer must win: %', pg_temp.kp(p, '2026-11-02', '迎え', '山根 一輝'); end if;
  if pg_temp.kp(p, '2026-11-05', '迎え', '山根 一輝') is distinct from '下野小学校' then
    raise exception 'FAIL 一輝 木 迎え: null answer must fall back to 型表: %', pg_temp.kp(p, '2026-11-05', '迎え', '山根 一輝'); end if;
  if pg_temp.kp(p, '2026-11-02', '迎え', '市川 湊') is distinct from '海蔵こども園' then
    raise exception 'FAIL 湊 迎え: whitespace-only answer must fall back to 型表: [%]', pg_temp.kp(p, '2026-11-02', '迎え', '市川 湊'); end if;
  if pg_temp.kp(p, '2026-11-02', '送り', '市川 湊') is distinct from '旧送り先' then
    raise exception 'FAIL 湊 送り: answer must win over 型表 自宅: %', pg_temp.kp(p, '2026-11-02', '送り', '市川 湊'); end if;

  -- 2) どちらも空欄なら空欄のまま（自宅や（未登録）を入れない）
  if pg_temp.kp(p, '2026-11-02', '送り', '山根 一輝') is distinct from '' then
    raise exception 'FAIL 一輝 送り blank must stay blank: [%]', pg_temp.kp(p, '2026-11-02', '送り', '山根 一輝'); end if;
  if pg_temp.kp(p, '2026-11-05', '送り', '山根 一輝') is distinct from '' then
    raise exception 'FAIL 一輝 木 送り blank'; end if;
  if pg_temp.kp(p, '2026-11-02', '迎え', '児童D') is distinct from '' then
    raise exception 'FAIL 児童D 迎え blank: [%]', pg_temp.kp(p, '2026-11-02', '迎え', '児童D'); end if;
  if pg_temp.kp(p, '2026-11-02', '送り', '児童D') is distinct from '' then
    raise exception 'FAIL 児童D 送り blank (full-width space only in 型表): [%]', pg_temp.kp(p, '2026-11-02', '送り', '児童D'); end if;
  if pg_temp.kp(p, '2026-11-03', '送り', '児童E') is distinct from '' or pg_temp.has_kp(p, '2026-11-03', '迎え', '児童E') then
    raise exception 'FAIL 児童E blank (full-width space only answer)'; end if;
  if p::text like '%（未登録）%' then raise exception 'FAIL （未登録） still produced'; end if;
  if p::text like '%古い迎え先%' or p::text like '%古い送り先%' then raise exception 'FAIL unexpected place'; end if;

  -- 型表に自宅と書いてあり、回答が空欄なら自宅のまま（書いていない空欄は空欄）
  -- 日ごとの連絡の送り場所変更は、回答・型表よりさらに優先で、その日だけ効く
  if pg_temp.kp(p, '2026-11-09', '送り', '山根 一輝') is distinct from '祖父母宅' then
    raise exception 'FAIL 送り場所変更 exception not applied: %', pg_temp.kp(p, '2026-11-09', '送り', '山根 一輝'); end if;
  if pg_temp.kp(p, '2026-11-16', '送り', '山根 一輝') is distinct from '' then
    raise exception 'FAIL 送り場所変更 leaked to other days'; end if;

  -- 4) place（まとめ表示）には空欄・自宅を入れない
  select e->>'place' into r from jsonb_array_elements(p->'events') e
    where e->>'kind' = '迎え' and (e->>'day')::date = '2026-11-02' and (e->'kids') ? '山根 一輝';
  if r is distinct from '下野こども園、海蔵こども園' and r is distinct from '海蔵こども園、下野こども園' then
    raise exception 'FAIL 迎え place summary: [%]', r; end if;
  select e->>'place' into r from jsonb_array_elements(p->'events') e
    where e->>'kind' = '送り' and (e->>'day')::date = '2026-11-02' and (e->'kids') ? '児童D';
  if r is not null then raise exception 'FAIL blank-only 送り place must be null: [%]', r; end if;

  -- 送り時刻は型表の送り終了。利用終了や、迎えの学校お迎え時刻では埋めない。
  if pg_temp.kt(p, '2026-11-02', '送り', '児童D') is distinct from '17:40' then
    raise exception 'FAIL 児童D 送り時刻は型表の送り終了: %', pg_temp.kt(p, '2026-11-02', '送り', '児童D'); end if;
  if pg_temp.kt(p, '2026-11-02', '迎え', '児童D') is distinct from '14:10' then
    raise exception 'FAIL 児童D 迎えは回答の学校お迎え時刻: %', pg_temp.kt(p, '2026-11-02', '迎え', '児童D'); end if;
  if pg_temp.kt(p, '2026-11-02', '送り', '山根 一輝') is distinct from '17:00' then
    raise exception 'FAIL 一輝 送り時刻が学校お迎え時刻に置き換わっている: %', pg_temp.kt(p, '2026-11-02', '送り', '山根 一輝'); end if;
end $$;

-- 確定（commit）：場所は上の優先順位どおり。place は空欄・自宅を除く。
insert into public.leo_events (day, kind, child, kids, title, place, kid_places, source)
values ('2026-11-02', '迎え', null, array['山根 一輝'], '☆旧', '下野こども園', '{"山根 一輝":"下野こども園"}', 'kata');

select public.leo_sched_commit('2026-11-01');

do $$
declare r record;
begin
  select * into r from public.leo_events where kind = '迎え' and day = '2026-11-02' and '山根 一輝' = any(kids) and source = 'kata';
  if r.kid_places->>'山根 一輝' <> '下野こども園' or r.kid_places->>'市川 湊' <> '海蔵こども園' then
    raise exception 'FAIL commit 迎え places %', r.kid_places; end if;
  if (select count(*) from public.leo_events where kind = '迎え' and day = '2026-11-02' and '山根 一輝' = any(kids)) <> 1 then
    raise exception 'FAIL old kata 迎え row was not replaced'; end if;
  select * into r from public.leo_events where kind = '送り' and day = '2026-11-02' and '児童D' = any(kids) and source = 'kata';
  if r.kid_places->>'児童D' <> '' or r.place is not null then
    raise exception 'FAIL commit D blank: % [%]', r.kid_places, r.place; end if;
  if r.kid_times->>'児童D' is distinct from '17:40' then
    raise exception 'FAIL commit D 送り時刻 %', r.kid_times; end if;
  select * into r from public.leo_events where kind = '送り' and day = '2026-11-02' and '山根 一輝' = any(kids) and source = 'kata';
  if r.kid_places->>'山根 一輝' <> '' then raise exception 'FAIL commit 一輝 送り blank %', r.kid_places; end if;
  select * into r from public.leo_events where kind = '送り' and day = '2026-11-09' and '山根 一輝' = any(kids) and source = 'kata';
  if r.kid_places->>'山根 一輝' <> '祖父母宅' or r.place <> '祖父母宅' then
    raise exception 'FAIL commit exception %', r.kid_places; end if;
  if exists (select 1 from public.leo_events where source = 'kata' and (kid_places::text like '%（未登録）%' or place like '%（未登録）%')) then
    raise exception 'FAIL commit wrote （未登録）'; end if;
end $$;

\echo leo_kata_place_test ok
