-- 金斗雲 共通台帳（利用者・支給と利用・事業所設定・サービスコード表・書類履歴）。実データは後日取り込み。匿名不可。
-- 読み書き：金斗雲職員 or 管理側（my_office()='金斗雲' or can_manage()）。事業所設定・コード表の書き込みは管理側のみ。
create table if not exists public.kin_user (
  id bigint generated always as identity primary key,
  name text not null unique check (char_length(name) between 1 and 100),
  birth date, address text check (char_length(address) <= 300), phone text check (char_length(phone) <= 40),
  emergency text check (char_length(emergency) <= 300),
  jukyusha_no text check (char_length(jukyusha_no) <= 20),
  city text check (char_length(city) <= 60), city_no text check (char_length(city_no) <= 10),
  shien_kubun text check (char_length(shien_kubun) <= 20),
  valid_from date, valid_to date,
  soudan_office text check (char_length(soudan_office) <= 100), soudan_person text check (char_length(soudan_person) <= 60),
  sabisek text check (char_length(sabisek) <= 60),
  cap_amount int check (cap_amount >= 0), cap_from date, cap_to date, cap_mgmt boolean not null default false,
  start_date date,
  needs_check boolean not null default false, check_memo text check (char_length(check_memo) <= 1000),
  updated_by uuid default auth.uid(), updated_at timestamptz not null default now());
create table if not exists public.kin_supply (
  id bigint generated always as identity primary key,
  user_id bigint not null references public.kin_user(id) on delete cascade,
  service text not null check (service in ('身体介護','家事援助','通院等介助')),
  monthly_amount numeric check (monthly_amount >= 0), amount_unit text check (amount_unit in ('時間','回')),
  weekday smallint check (weekday between 0 and 6), -- 0=日
  start_time time, end_time time,
  supply_minutes int check (supply_minutes > 0), -- 支給時間(分)。実支援時間は訪問記録の開始〜終了から出す
  content text check (char_length(content) <= 500), building text check (char_length(building) <= 100),
  plan_from date, plan_to date, memo text check (char_length(memo) <= 500),
  updated_by uuid default auth.uid(), updated_at timestamptz not null default now());
create index if not exists kin_supply_user on public.kin_supply(user_id);
create table if not exists public.kin_office_setting (
  id bigint generated always as identity primary key,
  office_no text check (char_length(office_no) <= 20),
  area_grade text check (char_length(area_grade) <= 20), -- 例: 7級地
  additions jsonb not null default '[]'::jsonb, -- [{name,kind:'加算'|'減算',active,from,to}]（特定事業所加算Ⅱ・処遇改善加算Ⅱ・早朝・夜間・深夜 等）
  valid_from date, memo text check (char_length(memo) <= 500),
  updated_by uuid default auth.uid(), updated_at timestamptz not null default now());
create table if not exists public.kin_service_code (
  id bigint generated always as identity primary key,
  service text not null check (service in ('身体介護','家事援助','通院等介助')),
  duration_class text, time_band text, code text, units int, memo text,
  updated_at timestamptz not null default now());
create table if not exists public.kin_doc (
  id bigint generated always as identity primary key,
  user_id bigint not null references public.kin_user(id) on delete cascade,
  doc_type text not null check (doc_type in ('計画','アセスメント','会議録')),
  version int not null default 1,
  created_on date, signed_on date,
  locked boolean not null default false, memo text check (char_length(memo) <= 500),
  updated_by uuid default auth.uid(), updated_at timestamptz not null default now(),
  unique (user_id, doc_type, version));
-- ロック中は作成日・同意(署名)日を変更不可。解除は管理側のみ。
create or replace function public.kin_doc_lock() returns trigger language plpgsql as $$
begin
  if old.locked then
    if new.locked is not true and not public.can_manage() then raise exception 'ロック解除は管理側のみ'; end if;
    if new.locked is true and (new.created_on is distinct from old.created_on or new.signed_on is distinct from old.signed_on) then
      raise exception '作成日・署名日はロック中のため変更できません'; end if;
  end if;
  return new; end $$;
drop trigger if exists kin_doc_lock on public.kin_doc;
create trigger kin_doc_lock before update on public.kin_doc for each row execute function public.kin_doc_lock();
do $$ declare t text; begin
  foreach t in array array['kin_user','kin_supply','kin_doc'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_rw', t);
    execute format($p$create policy %I on public.%I for all to authenticated using (public.my_office() = '金斗雲' or public.can_manage()) with check (public.my_office() = '金斗雲' or public.can_manage())$p$, t||'_rw', t);
  end loop;
  foreach t in array array['kin_office_setting','kin_service_code'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_r', t);
    execute format('drop policy if exists %I on public.%I', t||'_w', t);
    execute format($p$create policy %I on public.%I for select to authenticated using (public.my_office() = '金斗雲' or public.can_manage())$p$, t||'_r', t);
    execute format($p$create policy %I on public.%I for all to authenticated using (public.can_manage()) with check (public.can_manage())$p$, t||'_w', t);
  end loop;
end $$;
revoke all on public.kin_user, public.kin_supply, public.kin_office_setting, public.kin_service_code, public.kin_doc from anon;

-- 身体介護の月支給量（利用者単位）。食い違いのある人は空のまま conflict=true。
alter table public.kin_user add column if not exists supply_body_hours numeric check (supply_body_hours >= 0);
alter table public.kin_user add column if not exists supply_body_conflict boolean not null default false;
