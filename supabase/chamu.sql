-- 茶夢（生活介護）業務日誌 → サービス提供実績記録 → 国保連CSV。
-- B型（bp_*）とはテーブルを分ける。生活介護の請求と就労継続支援B型の請求が混ざらないようにする。
-- 再実行できる。利用者の実名・受給者証はこのファイルに書かない（supabase/chamu_seed.sql を管理者が実行する）。
-- 適用: Supabase SQL Editor にこのファイルを貼って Run。または apply_migration。

create or replace function public.chamu_can()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(
    public.is_chair()
    or public.bp_is_corp_admin()
    or exists (
      select 1 from public.staff_profiles
      where user_id = auth.uid()
        and active
        and (office = '茶夢' or role = '事務')
    ),
    false)
$$;

create or replace function public.chamu_can_bill()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(
    public.is_chair()
    or public.bp_is_corp_admin()
    or exists (
      select 1 from public.staff_profiles
      where user_id = auth.uid()
        and active
        and (role = '事務' or (office = '茶夢' and duty = '管理者'))
    ),
    false)
$$;

revoke all on function public.chamu_can() from public, anon;
revoke all on function public.chamu_can_bill() from public, anon;
grant execute on function public.chamu_can() to authenticated;
grant execute on function public.chamu_can_bill() to authenticated;

create or replace function public.chamu_now() returns timestamptz
language sql stable security invoker set search_path = public as $$ select now() $$;
revoke all on function public.chamu_now() from public, anon;
grant execute on function public.chamu_now() to authenticated;

create table if not exists public.chamu_users (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(btrim(name)) between 1 and 100),
  kana text check (kana is null or char_length(kana) <= 100),
  active boolean not null default true,
  sort int not null default 0,
  recipient_no text check (recipient_no is null or recipient_no ~ '^\d{1,10}$'),
  city_no text check (city_no is null or city_no ~ '^\d{1,6}$'),
  support_level int check (support_level is null or support_level between 1 and 6),
  cap_management text not null default '無' check (cap_management in ('有', '無')),
  cap_amount int not null default 0 check (cap_amount >= 0),
  cap_office_no text check (cap_office_no is null or cap_office_no ~ '^\d{0,10}$'),
  decision_code text not null default '221000' check (decision_code ~ '^\d{6}$'),
  contract_days text not null default '原則' check (char_length(contract_days) <= 20),
  contract_start date,
  contract_end date,
  service_start date,
  provider_entry_no text not null default '1' check (provider_entry_no ~ '^\d{1,2}$'),
  meal_addon boolean not null default true,
  transport_class text not null default '2' check (transport_class in ('I', '2', '重度', 'なし')),
  updated_at timestamptz not null default now()
);

create table if not exists public.chamu_journal (
  id uuid primary key default gen_random_uuid(),
  journal_date date not null unique,
  staff_name text not null check (char_length(btrim(staff_name)) between 1 and 60),
  weather text check (weather is null or weather in ('晴れ', 'くもり', '雨', '雪')),
  menu text check (menu is null or char_length(menu) <= 500),
  note text check (note is null or char_length(note) <= 2000),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chamu_journal_line (
  id uuid primary key default gen_random_uuid(),
  journal_id uuid not null references public.chamu_journal(id) on delete cascade,
  user_id uuid not null references public.chamu_users(id) on delete restrict,
  present boolean not null default true,
  start_time text,
  end_time text,
  transport text check (transport is null or transport in ('往復', '片道', 'なし')),
  meal text check (meal is null or meal in ('あり', 'なし')),
  support_note text check (support_note is null or char_length(support_note) <= 2000),
  unique (journal_id, user_id),
  constraint chamu_line_present check (not present or (
    start_time is not null and end_time is not null and transport is not null and meal is not null
  )),
  constraint chamu_line_absent check (present or (
    start_time is null and end_time is null and transport is null and meal is null
  ))
);

create table if not exists public.chamu_service_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.chamu_users(id) on delete restrict,
  service_date date not null,
  start_time text not null,
  end_time text not null,
  transport text not null check (transport in ('往復', '片道', 'なし')),
  meal text not null check (meal in ('あり', 'なし')),
  support_note text not null default '',
  signature_data text check (signature_data is null or (signature_data like 'data:image/png;base64,%' and char_length(signature_data) <= 300000)),
  signed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, service_date),
  constraint chamu_record_sign check (
    (signature_data is null and signed_at is null)
    or (signature_data is not null and signed_at is not null)
  )
);

-- 事業所マスタ（日誌シートと同じ初期値）。利用者が空でも請求設定の既定は入れておく。番号は事業所番号であり個人データではない。
create table if not exists public.chamu_billing_settings (
  id int primary key default 1 check (id = 1),
  office_no text not null default '2410202663' check (office_no ~ '^\d{10}$'),
  office_name text not null default '茶夢',
  service_type text not null default '22' check (service_type = '22'),
  region_code text not null default '06',
  unit_price numeric not null default 10.37,
  shogu_rate numeric not null default 0.096,
  shogu_item text not null default '5175',
  capacity_scale text not null default '11-20',
  standard_band text not null default '6時間以上7時間未満',
  default_start text not null default '10:00',
  default_end text not null default '16:00',
  ishi_gen boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.chamu_billing_settings (id) values (1) on conflict (id) do nothing;

create index if not exists chamu_journal_date on public.chamu_journal (journal_date desc);
create index if not exists chamu_line_journal on public.chamu_journal_line (journal_id);
create index if not exists chamu_record_date on public.chamu_service_records (service_date);
create index if not exists chamu_record_unsigned on public.chamu_service_records (user_id) where signed_at is null;

alter table public.chamu_users enable row level security;
alter table public.chamu_journal enable row level security;
alter table public.chamu_journal_line enable row level security;
alter table public.chamu_service_records enable row level security;
alter table public.chamu_billing_settings enable row level security;

drop policy if exists chamu_users_rw on public.chamu_users;
create policy chamu_users_rw on public.chamu_users for all to authenticated
  using (public.chamu_can()) with check (public.chamu_can());
drop policy if exists chamu_journal_rw on public.chamu_journal;
create policy chamu_journal_rw on public.chamu_journal for all to authenticated
  using (public.chamu_can()) with check (public.chamu_can());
drop policy if exists chamu_line_rw on public.chamu_journal_line;
create policy chamu_line_rw on public.chamu_journal_line for all to authenticated
  using (public.chamu_can()) with check (public.chamu_can());
drop policy if exists chamu_record_rw on public.chamu_service_records;
create policy chamu_record_rw on public.chamu_service_records for all to authenticated
  using (public.chamu_can()) with check (public.chamu_can());

drop policy if exists chamu_set_read on public.chamu_billing_settings;
create policy chamu_set_read on public.chamu_billing_settings for select to authenticated
  using (public.chamu_can());
drop policy if exists chamu_set_write on public.chamu_billing_settings;
create policy chamu_set_write on public.chamu_billing_settings for update to authenticated
  using (public.chamu_can_bill()) with check (public.chamu_can_bill());

revoke all on public.chamu_users, public.chamu_journal, public.chamu_journal_line, public.chamu_service_records, public.chamu_billing_settings from anon, authenticated, public;
grant select, insert, update, delete on public.chamu_users, public.chamu_journal, public.chamu_journal_line, public.chamu_service_records to authenticated;
grant select, update on public.chamu_billing_settings to authenticated;

comment on table public.chamu_journal is '茶夢（生活介護）の業務日誌。1日1行。B型の bp_journal とは別。';
comment on table public.chamu_service_records is '茶夢のサービス提供実績。日誌の保存時にスクリプトが転記する。署名済みだけ国保連CSVの対象。';
comment on table public.chamu_billing_settings is '茶夢の事業所マスタ。サービス種類22、事業所番号2410202663、定員11-20、医師未配置減算あり。';

notify pgrst, 'reload schema';
