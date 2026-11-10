-- 法定研修・従業者管理（GAS版 v1.4.0 の Supabase 版）。表の頭は ht_
-- 個人データ（職員・受講記録）はこのDBにだけ置く。公開リポジトリには入れない。
-- アクセス制御は ht_access（メール×事業所）。office_id が null の行＝法人全体（統括）

set check_function_bodies = off;
create table if not exists public.ht_access (
  email text not null,                       -- 小文字で登録
  office_id text,                            -- null＝全事業所（統括）
  can_edit boolean not null default false,   -- その事業所の記録を入力・直せる
  note text,
  created_at timestamptz not null default now()
);
create unique index if not exists ht_access_uq on public.ht_access (email, coalesce(office_id,''));
alter table public.ht_access enable row level security;

-- ログイン中のメール
create or replace function public.ht_email() returns text language sql stable as
$$ select lower(coalesce(auth.jwt()->>'email','')) $$;
-- 統括（全事業所）か
create or replace function public.ht_all() returns boolean language sql stable security definer set search_path=public as
$$ select exists(select 1 from ht_access where email=public.ht_email() and office_id is null) $$;
-- 見られる事業所（統括は全部）
create or replace function public.ht_offices() returns text[] language sql stable security definer set search_path=public as
$$ select case when public.ht_all() then (select coalesce(array_agg(id),'{}') from ht_offices_t)
       else (select coalesce(array_agg(office_id),'{}') from ht_access where email=public.ht_email() and office_id is not null) end $$;
-- 入力できる事業所
create or replace function public.ht_edit_offices() returns text[] language sql stable security definer set search_path=public as
$$ select case when public.ht_all() then (select coalesce(array_agg(id),'{}') from ht_offices_t)
       else (select coalesce(array_agg(office_id),'{}') from ht_access where email=public.ht_email() and office_id is not null and can_edit) end $$;

create table if not exists public.ht_offices_t (
  id text primary key, code text, name text not null, types text[] not null default '{}',
  note text, start_date date, sort int not null default 0);
create table if not exists public.ht_settings (key text primary key, value text, note text);
create table if not exists public.ht_staff (
  id text primary key, name text not null, kana text, email text,
  main_office text references public.ht_offices_t(id), sub_offices text[] not null default '{}',
  employment text, job text, hired date, status text not null default '在籍', retired date, note text);
create table if not exists public.ht_trainings (
  id text primary key, name text not null, category text, target_types text[] not null default '{}',
  frequency text, months int[] not null default '{}', times_per_year int not null default 1, newhire boolean not null default false,
  basis text, url1 text, kind1 text, url2 text, kind2 text, url_checked date, note text,
  pass_score int not null default 75, active boolean not null default true, owner text, prep text);
create table if not exists public.ht_questions (
  training_id text references public.ht_trainings(id) on delete cascade, no int, question text,
  opt_a text, opt_b text, opt_c text, opt_d text, answer text, points int not null default 25, primary key (training_id, no));
create table if not exists public.ht_materials (
  id text primary key, training_id text references public.ht_trainings(id) on delete cascade, kind text, title text, url text,
  minutes int, descr text, sort int default 0, active boolean not null default true, note text);
create table if not exists public.ht_events (  -- 訓練・点検・計画見直し・運営指導準備
  id text primary key, kind text, name text not null, target_types text[] not null default '{}', months int[] not null default '{}',
  times_per_year int not null default 1, basis text, prep text, owner text, active boolean not null default true, note text);
create table if not exists public.ht_event_logs (
  id text primary key default gen_random_uuid()::text, event_id text references public.ht_events(id), done_on date not null,
  office_id text references public.ht_offices_t(id) not null, headcount int, members text, result text, issues text, url text, note text,
  created_by text default public.ht_email(), created_at timestamptz not null default now());
create table if not exists public.ht_committees (
  id text primary key, name text not null, target_types text[] not null default '{}', interval_months int not null default 12,
  basis text, owner text, last_held date, next_due date, url text, note text, grp text, prep text);
create table if not exists public.ht_committee_plan (
  id bigint generated always as identity primary key, fy int not null, month int not null, committee_ids text[] not null,
  joint boolean not null default false, planned_on date, place text, note text);
create table if not exists public.ht_committee_logs (
  id text primary key default gen_random_uuid()::text, committee_id text references public.ht_committees(id), held_at timestamptz not null,
  place text, office_ids text[] not null default '{}', attendees text, absent text, agenda text, discussion text, decisions text,
  next_plan text, notice_method text, notice_on date, note text, created_by text default public.ht_email(), created_at timestamptz not null default now());
create table if not exists public.ht_records (
  id text primary key default 'R-'||to_char(now() at time zone 'Asia/Tokyo','YYYYMMDDHH24MISS')||'-'||substr(gen_random_uuid()::text,1,4),
  taken_at timestamptz not null default now(), fy int not null, training_id text references public.ht_trainings(id), training_name text,
  round int, staff_id text references public.ht_staff(id), staff_name text, email text,
  offices text[] not null default '{}',               -- 計上事業所（兼務者は複数の記録に載る）
  score int, max_score int, rate int, passed text, impression text, plan text,
  source text not null default '手入力',               -- フォーム／ポータル／手入力
  submit_email text,                                   -- ログインしたメール（本人確認）
  evidence text not null default '手入力（証跡なし）',
  confirmed_at timestamptz, confirmed_by text,
  created_by text default public.ht_email(), created_at timestamptz not null default now());
create index if not exists ht_records_off on public.ht_records using gin (offices);

-- 更新・削除の制限：統括確認は統括だけ。確認済みの記録は統括以外が直せない
create or replace function public.ht_rec_guard() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='INSERT' then
    if not public.ht_all() and (new.confirmed_at is not null or new.confirmed_by is not null) then raise exception '統括確認は統括責任者だけができます'; end if;
    if new.source='ポータル' then new.submit_email := public.ht_email(); new.evidence := 'ポータル（本人確認あり）';
    else new.submit_email := coalesce(new.submit_email,''); if new.evidence is null or new.evidence like 'ポータル%' then new.evidence := '手入力（証跡なし）'; end if; end if;
    return new;
  elsif tg_op='UPDATE' then
    if not public.ht_all() then
      if new.confirmed_at is distinct from old.confirmed_at or new.confirmed_by is distinct from old.confirmed_by then raise exception '統括確認は統括責任者だけができます'; end if;
      if old.confirmed_at is not null then raise exception '統括確認済みの記録は直せません'; end if;
    end if;
    if new.evidence is distinct from old.evidence or new.submit_email is distinct from old.submit_email or new.source is distinct from old.source then
      if not public.ht_all() then raise exception '証跡区分は変えられません'; end if; end if;
    return new;
  end if;
  return old;
end $$;
drop trigger if exists ht_rec_guard on public.ht_records;
create trigger ht_rec_guard before insert or update on public.ht_records for each row execute function public.ht_rec_guard();

-- RLS：マスタ類は ht_access にいる人が読める／書けるのは統括だけ
do $$ declare t text; begin
  foreach t in array array['ht_offices_t','ht_settings','ht_trainings','ht_questions','ht_materials','ht_events','ht_committees','ht_committee_plan'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_r', t);
    execute format('create policy %I on public.%I for select to authenticated using (array_length(public.ht_offices(),1)>0)', t||'_r', t);
    execute format('drop policy if exists %I on public.%I', t||'_w', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.ht_all()) with check (public.ht_all())', t||'_w', t);
  end loop;
end $$;
-- 職員：自分が見られる事業所に所属（主・兼務）する人だけ。書けるのは入力権限のある事業所の職員
alter table public.ht_staff enable row level security;
drop policy if exists ht_staff_r on public.ht_staff;
create policy ht_staff_r on public.ht_staff for select to authenticated using (public.ht_all() or main_office = any(public.ht_offices()) or sub_offices && public.ht_offices());
drop policy if exists ht_staff_w on public.ht_staff;
create policy ht_staff_w on public.ht_staff for all to authenticated using (public.ht_all() or main_office = any(public.ht_edit_offices()))
  with check (public.ht_all() or (main_office = any(public.ht_edit_offices())));
-- 受講記録：計上事業所のどれかが見られる範囲なら読める。入れる・直すのはその全事業所に入力権限があるとき
alter table public.ht_records enable row level security;
drop policy if exists ht_records_r on public.ht_records;
create policy ht_records_r on public.ht_records for select to authenticated using (public.ht_all() or offices && public.ht_offices());
drop policy if exists ht_records_i on public.ht_records;
create policy ht_records_i on public.ht_records for insert to authenticated with check (public.ht_all() or (array_length(offices,1)>0 and offices <@ public.ht_edit_offices()));
drop policy if exists ht_records_u on public.ht_records;
create policy ht_records_u on public.ht_records for update to authenticated using (public.ht_all() or offices <@ public.ht_edit_offices()) with check (public.ht_all() or offices <@ public.ht_edit_offices());
drop policy if exists ht_records_d on public.ht_records;
create policy ht_records_d on public.ht_records for delete to authenticated using (public.ht_all());
-- 訓練・点検の実施記録 / 委員会開催記録
alter table public.ht_event_logs enable row level security;
drop policy if exists ht_el_r on public.ht_event_logs; create policy ht_el_r on public.ht_event_logs for select to authenticated using (public.ht_all() or office_id = any(public.ht_offices()));
drop policy if exists ht_el_w on public.ht_event_logs; create policy ht_el_w on public.ht_event_logs for all to authenticated using (public.ht_all() or office_id = any(public.ht_edit_offices())) with check (public.ht_all() or office_id = any(public.ht_edit_offices()));
alter table public.ht_committee_logs enable row level security;
drop policy if exists ht_cl_r on public.ht_committee_logs; create policy ht_cl_r on public.ht_committee_logs for select to authenticated using (public.ht_all() or office_ids && public.ht_offices());
drop policy if exists ht_cl_w on public.ht_committee_logs; create policy ht_cl_w on public.ht_committee_logs for all to authenticated using (public.ht_all() or (office_ids <@ public.ht_edit_offices())) with check (public.ht_all() or (array_length(office_ids,1)>0 and office_ids <@ public.ht_edit_offices()));
-- アクセス表：自分の行は読める。変えられるのは統括だけ（設定画面から管理）
drop policy if exists ht_access_r on public.ht_access; create policy ht_access_r on public.ht_access for select to authenticated using (email = public.ht_email() or public.ht_all());
drop policy if exists ht_access_w on public.ht_access; create policy ht_access_w on public.ht_access for all to authenticated using (public.ht_all()) with check (public.ht_all());
-- anon には何も出さない
do $$ declare t text; begin for t in select tablename from pg_tables where schemaname='public' and tablename like 'ht\_%' loop execute format('revoke all on public.%I from anon', t); end loop; end $$;

-- 2026-11-08 手動編集。閲覧のみの全事業所権限は管理者ではない。
create or replace function public.ht_all() returns boolean language sql stable security definer set search_path=public as
$$ select exists(select 1 from ht_access where email=public.ht_email() and office_id is null and can_edit) $$;
create or replace function public.ht_offices() returns text[] language sql stable security definer set search_path=public as
$$ select case when exists(select 1 from ht_access where email=public.ht_email() and office_id is null)
 then (select coalesce(array_agg(id),'{}') from ht_offices_t)
 else (select coalesce(array_agg(office_id),'{}') from ht_access where email=public.ht_email() and office_id is not null) end $$;
-- 書き込みは直列化して、同時操作で最後の管理者が消えることも防ぐ。
create schema if not exists private;
create table if not exists private.ht_access_mutex (id boolean primary key default true check(id), version bigint not null default 0);
insert into private.ht_access_mutex(id) values(true) on conflict do nothing;
revoke all on private.ht_access_mutex from public, anon, authenticated;
create or replace function private.ht_access_lock() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update private.ht_access_mutex set version=version+1 where id;
 return null;
end $$;
create or replace function private.ht_access_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare losing boolean;
begin
 if tg_op <> 'DELETE' then
  new.email := lower(trim(new.email));
  if new.email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'メールアドレスを確認してください'; end if;
  if new.office_id is not null and not exists(select 1 from public.ht_offices_t where id=new.office_id) then raise exception '対象事業所がありません'; end if;
 end if;
 if tg_op <> 'INSERT' and old.office_id is null and old.can_edit then
  losing := tg_op='DELETE';
  if tg_op='UPDATE' then losing := new.office_id is not null or not new.can_edit or new.email<>old.email; end if;
  if losing then
   if old.email=public.ht_email() then raise exception '自分の全事業所の管理者権限は外せません'; end if;
   if not exists(select 1 from public.ht_access where office_id is null and can_edit and email<>old.email) then raise exception '最後の全事業所管理者は外せません'; end if;
  end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
revoke all on function private.ht_access_lock(), private.ht_access_guard() from public, anon, authenticated;
drop trigger if exists ht_access_lock on public.ht_access;
create trigger ht_access_lock before insert or update or delete on public.ht_access for each statement execute function private.ht_access_lock();
drop trigger if exists ht_access_guard on public.ht_access;
create trigger ht_access_guard before insert or update or delete on public.ht_access for each row execute function private.ht_access_guard();
-- 修正した受講内容に、元の本人確認・統括確認をそのまま付けない。
create or replace function private.ht_record_edit_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (to_jsonb(new)-array['confirmed_at','confirmed_by']) is distinct from (to_jsonb(old)-array['confirmed_at','confirmed_by']) then
  new.confirmed_at := null; new.confirmed_by := null;
  new.source := '手入力'; new.evidence := '手入力（編集済み・証跡なし）'; new.submit_email := '';
 end if;
 return new;
end $$;
revoke all on function private.ht_record_edit_guard() from public, anon, authenticated;
drop trigger if exists ht_record_edit_guard on public.ht_records;
create trigger ht_record_edit_guard before update on public.ht_records for each row execute function private.ht_record_edit_guard();
-- 空配列で書き込み範囲をすり抜けない。
drop policy if exists ht_records_u on public.ht_records;
create policy ht_records_u on public.ht_records for update to authenticated
 using (public.ht_all() or (array_length(offices,1)>0 and offices <@ public.ht_edit_offices()))
 with check (public.ht_all() or (array_length(offices,1)>0 and offices <@ public.ht_edit_offices()));
drop policy if exists ht_cl_w on public.ht_committee_logs;
create policy ht_cl_w on public.ht_committee_logs for all to authenticated
 using (public.ht_all() or (array_length(office_ids,1)>0 and office_ids <@ public.ht_edit_offices()))
 with check (public.ht_all() or (array_length(office_ids,1)>0 and office_ids <@ public.ht_edit_offices()));
-- 配列参照はFKでは守られないため、参照中のマスタ削除を止める。
create or replace function private.ht_master_delete_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='ht_offices_t' then
  if exists(select 1 from public.ht_access where office_id=old.id)
   or exists(select 1 from public.ht_staff where old.id=any(sub_offices))
   or exists(select 1 from public.ht_records where old.id=any(offices))
   or exists(select 1 from public.ht_committee_logs where old.id=any(office_ids)) then
   raise exception 'この事業所は権限や記録に使われているため削除できません';
  end if;
 elsif tg_table_name='ht_committees' then
  if exists(select 1 from public.ht_committee_plan where old.id=any(committee_ids)) then raise exception '開催予定に使われている委員会は削除できません'; end if;
 end if;
 return old;
end $$;
revoke all on function private.ht_master_delete_guard() from public, anon, authenticated;
drop trigger if exists ht_master_delete_guard on public.ht_offices_t;
create trigger ht_master_delete_guard before delete on public.ht_offices_t for each row execute function private.ht_master_delete_guard();
drop trigger if exists ht_master_delete_guard on public.ht_committees;
create trigger ht_master_delete_guard before delete on public.ht_committees for each row execute function private.ht_master_delete_guard();

-- 2026-11-10 本人の確認テスト提出。増分の適用単位は supabase/ht_self_submit.sql（以下は同じ内容で、このファイル全体を新規に流したときも同じ形になる）。
-- 法定研修: 閲覧だけの職員が「本人の確認テスト」だけ提出できる増分。
-- 冪等。houtei.sql 全体は再実行しない（既存ポリシーやシードを上書きしうるため）。
-- このファイルに実在のメールアドレス・auth.users の id は入れない。
-- 名簿の連絡先（ht_staff.email）は変更しない。ログインとの紐付けは全事業所管理者（または JWT のない DB 所有者セッション）だけが書く。
-- 本人提出の採点・本人・事業所・証跡はサーバが決める。閲覧者の ht_records 直 INSERT は従来どおり拒否。

create schema if not exists private;

alter table public.ht_staff add column if not exists auth_user_id uuid;
comment on column public.ht_staff.auth_user_id is
  'ポータルログインの auth.users.id。連絡先メールとは別。未設定の行だけ、在籍かつ連絡先が JWT の email と一致する場合に本人とみなす。';

create unique index if not exists ht_staff_auth_user_uq
  on public.ht_staff (auth_user_id) where auth_user_id is not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ht_staff_auth_user_fk') then
    alter table public.ht_staff
      add constraint ht_staff_auth_user_fk
      foreign key (auth_user_id) references auth.users (id) on delete set null
      deferrable initially deferred;
  end if;
end $$;

-- 正解は問題文と分ける。閲覧者は問題文だけ読め、正解表は編集者と統括だけ。
create table if not exists public.ht_question_keys (
  training_id text not null,
  no int not null,
  answer text not null,
  primary key (training_id, no),
  foreign key (training_id, no) references public.ht_questions (training_id, no) on delete cascade,
  constraint ht_question_keys_answer_chk check (answer in ('A', 'B', 'C', 'D'))
);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ht_question_keys_answer_chk') then
    alter table public.ht_question_keys
      add constraint ht_question_keys_answer_chk check (answer in ('A', 'B', 'C', 'D'));
  end if;
end $$;

do $$
declare nbad int;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'ht_questions' and column_name = 'answer'
  ) then
    select count(*) into nbad from public.ht_questions
     where answer is not null and btrim(answer) <> ''
       and upper(btrim(answer)) not in ('A', 'B', 'C', 'D');
    if nbad > 0 then
      raise exception '確認テストの正解に A〜D 以外が % 件あります。直してから再実行してください', nbad;
    end if;
    insert into public.ht_question_keys (training_id, no, answer)
    select q.training_id, q.no, upper(btrim(q.answer))
    from public.ht_questions q
    where q.answer is not null and btrim(q.answer) <> ''
    on conflict (training_id, no) do update set answer = excluded.answer;
    alter table public.ht_questions drop column answer;
  end if;
end $$;

alter table public.ht_question_keys enable row level security;
drop policy if exists ht_question_keys_r on public.ht_question_keys;
create policy ht_question_keys_r on public.ht_question_keys
  for select to authenticated
  using (public.ht_all() or coalesce(array_length(public.ht_edit_offices(), 1), 0) > 0);
drop policy if exists ht_question_keys_w on public.ht_question_keys;
create policy ht_question_keys_w on public.ht_question_keys
  for all to authenticated
  using (public.ht_all()) with check (public.ht_all());

revoke all on public.ht_question_keys from public;
grant select, insert, update, delete on public.ht_question_keys to authenticated;

-- 連絡先一覧からログインの user id を読ませない（提出の本人判定は下の関数だけが見る）。
revoke select on public.ht_staff from authenticated;
grant select (
  id, name, kana, email, main_office, sub_offices, employment, job, hired, status, retired, note
) on public.ht_staff to authenticated;

-- ログイン中の本人（在籍のみ）。紐付けがあるユーザーはメール一致へ落ちない。
create or replace function private.ht_self_staff_id()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := pg_catalog.lower(coalesce(auth.jwt() ->> 'email', ''::text));
  v_id text;
  v_n int;
begin
  if v_uid is null then
    return null;
  end if;
  select count(*) into v_n from public.ht_staff s where s.auth_user_id = v_uid;
  if v_n > 1 then
    return null;
  end if;
  if v_n = 1 then
    select s.id into v_id from public.ht_staff s
     where s.auth_user_id = v_uid and s.status = '在籍';
    return v_id;
  end if;
  if v_email = '' then
    return null;
  end if;
  select count(*) into v_n from public.ht_staff s
   where s.auth_user_id is null and s.status = '在籍' and pg_catalog.lower(s.email) = v_email;
  if v_n <> 1 then
    return null;
  end if;
  select s.id into v_id from public.ht_staff s
   where s.auth_user_id is null and s.status = '在籍' and pg_catalog.lower(s.email) = v_email;
  return v_id;
end $$;

create or replace function private.ht_my_staff()
returns table (id text, name text, email text, main_office text, sub_offices text[], status text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id text := private.ht_self_staff_id();
begin
  return query
  select s.id, s.name, s.email, s.main_office, s.sub_offices, s.status
  from public.ht_staff s
  where s.id = v_id;
end $$;

-- 閲覧者の本人提出。得点・氏名・事業所・証跡は引数で受けない。
create or replace function private.ht_submit_own_quiz(
  p_training_id text,
  p_answers jsonb,
  p_impression text,
  p_plan text
) returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(auth.role(), auth.jwt() ->> 'role', ''::text);
  v_staff_id text;
  v_name text;
  v_email text;
  v_main text;
  v_subs text[];
  v_tr_name text;
  v_targets text[];
  v_pass int;
  v_offs text[];
  v_imp text := pg_catalog.btrim(coalesce(p_impression, ''::text));
  v_plan text := pg_catalog.btrim(coalesce(p_plan, ''::text));
  v_score int := 0;
  v_max int := 0;
  v_rate int;
  v_passed text;
  v_id text;
  v_n int;
  v_keys int;
  v_today date := (pg_catalog.timezone('Asia/Tokyo', pg_catalog.now()))::date;
  v_fy int;
begin
  if auth.uid() is null or v_role <> 'authenticated' then
    raise exception 'ログインが必要です';
  end if;
  v_staff_id := private.ht_self_staff_id();
  if v_staff_id is null then
    raise exception '名簿とログインが結びついていません';
  end if;
  select s.name, s.email, s.main_office, s.sub_offices
    into v_name, v_email, v_main, v_subs
  from public.ht_staff s
  where s.id = v_staff_id and s.status = '在籍';
  if not found then
    raise exception '名簿とログインが結びついていません';
  end if;
  if v_imp = '' or v_plan = '' then
    raise exception '所感と実践計画は必須です';
  end if;
  if pg_catalog.char_length(v_imp) > 4000 or pg_catalog.char_length(v_plan) > 4000 then
    raise exception '所感と実践計画は4000字以内にしてください';
  end if;
  select t.name, t.target_types, t.pass_score
    into v_tr_name, v_targets, v_pass
  from public.ht_trainings t
  where t.id = p_training_id and t.active;
  if not found then
    raise exception 'この研修のテストは受けられません';
  end if;
  select coalesce(array_agg(o.id order by o.sort, o.id), '{}'::text[])
    into v_offs
  from public.ht_offices_t o
  where o.id = any (array[v_main] || coalesce(v_subs, '{}'::text[]))
    and o.id = any (public.ht_offices())
    and ('全事業' = any (v_targets) or o.types operator(pg_catalog.&&) v_targets);
  if coalesce(pg_catalog.array_length(v_offs, 1), 0::int) = 0 then
    raise exception 'この研修の対象事業所ではありません';
  end if;
  if p_answers is null or pg_catalog.jsonb_typeof(p_answers) <> 'object' then
    raise exception '回答の形式を確認してください';
  end if;
  select count(*) into v_n from public.ht_questions q where q.training_id = p_training_id;
  if v_n = 0 then
    raise exception 'この研修にはテストがありません';
  end if;
  select count(*) into v_keys from public.ht_question_keys k where k.training_id = p_training_id;
  if v_keys <> v_n then
    raise exception 'このテストはいま採点できません。管理者に連絡してください';
  end if;
  if exists (
    select 1 from public.ht_questions q
    where q.training_id = p_training_id
      and not (p_answers ? q.no::text)
  ) or exists (
    select 1 from pg_catalog.jsonb_object_keys(p_answers) k
    where not exists (
      select 1 from public.ht_questions q
      where q.training_id = p_training_id and q.no::text = k
    )
  ) or exists (
    select 1 from public.ht_questions q
    where q.training_id = p_training_id
      and pg_catalog.upper(pg_catalog.btrim(coalesce(p_answers ->> q.no::text, ''::text))) not in (
        case when q.opt_a is not null and pg_catalog.btrim(q.opt_a) <> '' then 'A' else '' end,
        case when q.opt_b is not null and pg_catalog.btrim(q.opt_b) <> '' then 'B' else '' end,
        case when q.opt_c is not null and pg_catalog.btrim(q.opt_c) <> '' then 'C' else '' end,
        case when q.opt_d is not null and pg_catalog.btrim(q.opt_d) <> '' then 'D' else '' end
      )
  ) then
    raise exception 'すべての問いに、選択肢から答えてください';
  end if;
  select coalesce(sum(q.points), 0::bigint),
         coalesce(sum(case
           when k.answer = pg_catalog.upper(pg_catalog.btrim(p_answers ->> q.no::text)) then q.points
           else 0 end), 0::bigint)
    into v_max, v_score
  from public.ht_questions q
  join public.ht_question_keys k on k.training_id = q.training_id and k.no = q.no
  where q.training_id = p_training_id;
  if v_max <= 0 then
    raise exception 'このテストはいま採点できません。管理者に連絡してください';
  end if;
  v_rate := pg_catalog.round(v_score::numeric * 100 / v_max)::int;
  v_passed := case when v_rate >= v_pass then '合格' else '不合格' end;
  v_fy := pg_catalog.date_part('year', v_today)::int
    - case when pg_catalog.date_part('month', v_today)::int >= 4 then 0 else 1 end;
  insert into public.ht_records (
    fy, training_id, training_name, staff_id, staff_name, email, offices,
    score, max_score, rate, passed, impression, plan, source, confirmed_at, confirmed_by
  ) values (
    v_fy, p_training_id, v_tr_name, v_staff_id, v_name, v_email, v_offs,
    v_score, v_max, v_rate, v_passed, v_imp, v_plan, 'ポータル', null, null
  )
  returning id into v_id;
  return pg_catalog.jsonb_build_object(
    'id', v_id, 'score', v_score, 'max_score', v_max, 'rate', v_rate, 'passed', v_passed
  );
end $$;

-- API に出すのは invoker。中身の権限は private の security definer だけが持つ。
create or replace function public.ht_my_staff()
returns table (id text, name text, email text, main_office text, sub_offices text[], status text)
language sql
stable
security invoker
set search_path = ''
as $$ select id, name, email, main_office, sub_offices, status from private.ht_my_staff() $$;

create or replace function public.ht_submit_own_quiz(p_training_id text, p_answers jsonb, p_impression text, p_plan text)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$ select private.ht_submit_own_quiz(p_training_id, p_answers, p_impression, p_plan) $$;

-- 事業所の編集者は名簿の他の列を直せるが、ログイン紐付けは全事業所管理者だけ。
create or replace function private.ht_staff_auth_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(auth.role(), auth.jwt() ->> 'role', ''::text);
  v_changing boolean;
begin
  if tg_op = 'INSERT' then
    v_changing := new.auth_user_id is not null;
  else
    v_changing := new.auth_user_id is distinct from old.auth_user_id;
  end if;
  if not v_changing then
    return new;
  end if;
  if public.ht_all() or v_role = 'service_role' then
    return new;
  end if;
  -- JWT のない DB 所有者セッション（SQL エディタ）だけ、適用時の紐付けを許す。
  if session_user in ('postgres', 'supabase_admin')
     and v_role not in ('authenticated', 'anon')
     and auth.uid() is null
     and coalesce(auth.jwt() ->> 'email', ''::text) = '' then
    return new;
  end if;
  raise exception 'ログイン紐付けは全事業所の管理者だけが変更できます';
end $$;

revoke all on function private.ht_self_staff_id() from public, authenticated;
revoke all on function private.ht_staff_auth_guard() from public, authenticated;
revoke all on function private.ht_my_staff() from public;
revoke all on function private.ht_submit_own_quiz(text, jsonb, text, text) from public;
revoke all on function public.ht_my_staff() from public;
revoke all on function public.ht_submit_own_quiz(text, jsonb, text, text) from public;

grant usage on schema private to authenticated;
grant execute on function private.ht_my_staff() to authenticated;
grant execute on function private.ht_submit_own_quiz(text, jsonb, text, text) to authenticated;
grant execute on function public.ht_my_staff() to authenticated;
grant execute on function public.ht_submit_own_quiz(text, jsonb, text, text) to authenticated;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function private.ht_self_staff_id() from anon';
    execute 'revoke all on function private.ht_staff_auth_guard() from anon';
    execute 'revoke all on function private.ht_my_staff() from anon';
    execute 'revoke all on function private.ht_submit_own_quiz(text, jsonb, text, text) from anon';
    execute 'revoke all on function public.ht_my_staff() from anon';
    execute 'revoke all on function public.ht_submit_own_quiz(text, jsonb, text, text) from anon';
    execute 'revoke all on table public.ht_question_keys from anon';
    execute 'revoke usage on schema private from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update, delete on table public.ht_question_keys to service_role';
  end if;
end $$;

drop trigger if exists ht_staff_auth_guard on public.ht_staff;
create trigger ht_staff_auth_guard
  before insert or update on public.ht_staff
  for each row execute function private.ht_staff_auth_guard();

notify pgrst, 'reload schema';
