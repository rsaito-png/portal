-- レオ 請求用：児童マスタ（受給者証）＝事務・管理者だけ。日ごとの請求の印（欠席時対応・子育てサポート・学校休業日）＝レオ職員が付け、事務が確認
create or replace function public.can_bill() returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(public.my_role() = '事務' or public.my_duty() = '管理者', false) $$;
create table if not exists public.leo_children (
  name text primary key,                     -- 日誌の児童名と同じ表記
  kana text, jukyusha_no text check (jukyusha_no ~ '^\d{10}$'), city_no text check (city_no ~ '^\d{6}$'),
  kind text not null default '放デイ' check (kind in ('児発','放デイ')),
  cap_monthly int not null default 4600 check (cap_monthly in (0, 4600, 37200)),
  mushouka boolean not null default false,   -- 幼児教育・保育の無償化（3〜5歳の児発）→負担0
  contract_days int check (contract_days between 1 and 31), contract_start date, contract_end date,
  updated_by uuid default auth.uid(), updated_at timestamptz not null default now()
);
alter table public.leo_children enable row level security;
drop policy if exists lch_bill on public.leo_children;
create policy lch_bill on public.leo_children for all to authenticated using (public.can_bill()) with check (public.can_bill());
create table if not exists public.leo_day_flags (
  day date not null, child text not null,
  absent_support boolean not null default false,  -- 欠席時対応加算：欠席の連絡を受け、相談援助をして記録した
  absent_note text check (char_length(absent_note) <= 500),
  kosodate boolean not null default false,        -- 子育てサポート加算：保護者が支援に参加・見学した
  holiday boolean not null default false,         -- 学校休業日（放デイ区分3の判定）
  updated_by uuid default auth.uid(), updated_at timestamptz not null default now(),
  primary key (day, child)
);
alter table public.leo_day_flags enable row level security;
drop policy if exists ldf_read on public.leo_day_flags;
create policy ldf_read on public.leo_day_flags for select to authenticated using (public.my_office() = 'レオ' or public.can_bill());
drop policy if exists ldf_ins on public.leo_day_flags;
create policy ldf_ins on public.leo_day_flags for insert to authenticated with check (public.my_office() = 'レオ' or public.can_bill());
drop policy if exists ldf_upd on public.leo_day_flags;
create policy ldf_upd on public.leo_day_flags for update to authenticated using (public.my_office() = 'レオ' or public.can_bill()) with check (public.my_office() = 'レオ' or public.can_bill());
-- 2026-10-15 障害児様式（K122）対応：保護者カナ・一連の契約での初回提供日（明細書 日数情報の開始年月日）・事業者記入欄番号・児童ごとの減算（未計画など）
alter table public.leo_children add column if not exists guardian_kana text;
alter table public.leo_children add column if not exists first_date date;
alter table public.leo_children add column if not exists kinyu_no int check (kinyu_no between 1 and 99);
alter table public.leo_children add column if not exists gensan text[] not null default '{}' check (gensan <@ array['未計画','未計画2']);
