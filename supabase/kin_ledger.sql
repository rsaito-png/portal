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

-- 訪問記録（金斗雲・居宅介護）。署名トークン表は別途。取り込みは (source_file, source_row) の一意制約で冪等。
create table if not exists public.kin_visit (
  id bigint generated always as identity primary key,
  visit_date date not null,
  user_id bigint not null references public.kin_user(id) on delete restrict,
  staff_name text check (char_length(staff_name) between 1 and 60), -- 空は後日入力
  service text not null default '身体介護' check (service in ('身体介護','家事援助','通院等介助')),
  start_time time not null, end_time time not null,
  actual_minutes int generated always as ((extract(epoch from (end_time - start_time))/60)::int) stored, -- 実時間(分)。開始・終了から自動計算、手入力不可
  check (end_time > start_time), -- 日またぎは想定しない
  content text check (char_length(content) <= 1000), note text check (char_length(note) <= 1000),
  report1 text check (char_length(report1) <= 1000), report2 text check (char_length(report2) <= 1000), report3 text check (char_length(report3) <= 1000),
  report4 text check (char_length(report4) <= 1000), report5 text check (char_length(report5) <= 1000),
  addition text check (char_length(addition) <= 100), -- 加算の有無（緊急時対応・初回加算など）
  instruction_id text check (char_length(instruction_id) <= 60),
  sign_status text not null default '未署名' check (sign_status in ('未署名','署名済み')),
  signed_at timestamptz, signer_kind text check (char_length(signer_kind) <= 30),
  signature_url text check (char_length(signature_url) <= 500), pdf_url text check (char_length(pdf_url) <= 500),
  staff_confirmed boolean not null default false, sab_confirmed boolean not null default false,
  source_file text check (char_length(source_file) <= 200), source_row int,
  updated_by uuid default auth.uid(), updated_at timestamptz not null default now(),
  unique (source_file, source_row));
create index if not exists kin_visit_date on public.kin_visit(visit_date, user_id);
alter table public.kin_visit enable row level security;
drop policy if exists kin_visit_rw on public.kin_visit;
create policy kin_visit_rw on public.kin_visit for all to authenticated using (public.my_office() = '金斗雲' or public.can_manage()) with check (public.my_office() = '金斗雲' or public.can_manage());
revoke all on public.kin_visit from anon;

-- 既存テーブルへの反映（冪等）
alter table public.kin_visit add column if not exists addition text check (char_length(addition) <= 100);
do $$ begin
  if not exists (select 1 from pg_constraint where conname='kin_visit_time_order') then
    alter table public.kin_visit add constraint kin_visit_time_order check (end_time > start_time); end if;
end $$;

-- 追加列（取り込み用）。職員名は後日入力があるため空を許す。
alter table public.kin_visit drop column if exists second_staff;
alter table public.kin_visit alter column staff_name drop not null;
alter table public.kin_visit add column if not exists sv_confirm_1 text check (char_length(sv_confirm_1) <= 60);  -- サ責確認 確認者
alter table public.kin_visit add column if not exists sv_confirm_2 timestamptz;                                     -- サ責確認 日時
alter table public.kin_visit add column if not exists sv_confirm_3 text check (char_length(sv_confirm_3) <= 1000); -- サ責確認 コメント
alter table public.kin_visit add column if not exists sign_reason text check (char_length(sign_reason) <= 500);     -- 署名困難の理由
alter table public.kin_visit add column if not exists late_signed text check (char_length(late_signed) <= 100);                    -- 後日署名（元の値のまま）
alter table public.kin_visit add column if not exists recorded_at timestamptz;                                       -- 入力日時
alter table public.kin_visit add column if not exists staff_confirmed_at timestamptz;                                -- 職員確認 日時
alter table public.kin_visit alter column late_signed drop default;
do $$ begin if (select data_type from information_schema.columns where table_name='kin_visit' and column_name='late_signed')='boolean' then alter table public.kin_visit alter column late_signed type text using case when late_signed then 'はい' end; end if; end $$;

-- 請求CSV用の不足列（値が分からないものは空のまま。推測で埋めない）
alter table public.kin_user add column if not exists name_kana text check (char_length(name_kana) <= 100);            -- 氏名カナ
alter table public.kin_user add column if not exists decided_service_code text check (char_length(decided_service_code) <= 20); -- 決定サービスコード
alter table public.kin_user add column if not exists contract_start date;                                              -- 契約開始日（サービス開始日とは別）
alter table public.kin_office_setting add column if not exists area_grade_code text check (char_length(area_grade_code) <= 10); -- 地域区分コード（国保連IFの値）
alter table public.kin_office_setting add column if not exists form_type text check (char_length(form_type) <= 10);             -- 様式種別（例: J611実績記録票の様式種別）
-- 既存列: 支給決定期間=valid_from/valid_to、市町村番号=city_no、上限月額=cap_amount、事業所番号=office_no、地域区分=area_grade
