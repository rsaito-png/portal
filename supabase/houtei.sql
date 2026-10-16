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
-- アクセス表：自分の行は読める。変えられるのは統括だけ（画面からは触らない・SQLで設定）
drop policy if exists ht_access_r on public.ht_access; create policy ht_access_r on public.ht_access for select to authenticated using (email = public.ht_email() or public.ht_all());
drop policy if exists ht_access_w on public.ht_access; create policy ht_access_w on public.ht_access for all to authenticated using (public.ht_all()) with check (public.ht_all());
-- anon には何も出さない
do $$ declare t text; begin for t in select tablename from pg_tables where schemaname='public' and tablename like 'ht\_%' loop execute format('revoke all on public.%I from anon', t); end loop; end $$;
