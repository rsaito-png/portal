-- 個別支援計画まわり（アセスメント・モニタリング・担当者会議・計画書の保管と同意）
create table if not exists public.leo_plan_steps (
  id bigint generated always as identity primary key,
  child text not null, term text not null,   -- 例 2026年11月〜2027年4月
  step text not null check (step in ('アセスメント','保護者モニタリング','職員モニタリング','担当者会議','計画書原案','原案の説明・同意','計画書本案','本案の交付・同意')),
  due date, done_on date, content text check (char_length(content) <= 6000),
  attendees text, consent_by text, consent_on date, file_url text check (file_url is null or file_url ~ '^https://'),
  author uuid default auth.uid(), updated_at timestamptz not null default now(),
  unique (child, term, step, author));
alter table public.leo_plan_steps enable row level security;
drop policy if exists lps_read on public.leo_plan_steps;
create policy lps_read on public.leo_plan_steps for select to authenticated using (public.my_office() = 'レオ' or public.can_bill());
drop policy if exists lps_ins on public.leo_plan_steps;
create policy lps_ins on public.leo_plan_steps for insert to authenticated with check ((public.my_office() = 'レオ' and (step = '職員モニタリング' or public.can_manage())) and author = auth.uid());
drop policy if exists lps_upd on public.leo_plan_steps;
create policy lps_upd on public.leo_plan_steps for update to authenticated using (author = auth.uid() or public.can_manage()) with check (public.my_office() = 'レオ' or public.can_bill());
-- 配置表・型表・管理表をポータルで入力（11/1からはこちらが正。それまではGoogleから写して確認用）
create table if not exists public.leo_master (
  kind text not null check (kind in ('kata','keikaku','haichi')), row_no int not null, data jsonb not null,
  updated_by uuid default auth.uid(), updated_at timestamptz not null default now(), primary key (kind, row_no));
alter table public.leo_master enable row level security;
drop policy if exists lm_read on public.leo_master;
create policy lm_read on public.leo_master for select to authenticated using (public.my_office() = 'レオ' or public.can_bill());
drop policy if exists lm_write on public.leo_master;
create policy lm_write on public.leo_master for all to authenticated using (public.can_manage()) with check (public.can_manage());
-- 送迎の配慮（児童ごと：座席・チャイルドシート・引き渡し相手・アレルギー等）。レオ職員が見る、管理側が書く
create table if not exists public.leo_child_care (
  child text primary key, note text check (char_length(note) <= 1000), updated_by uuid default auth.uid(), updated_at timestamptz not null default now());
alter table public.leo_child_care enable row level security;
drop policy if exists lcc_read on public.leo_child_care;
create policy lcc_read on public.leo_child_care for select to authenticated using (public.my_office() = 'レオ' or public.can_bill());
drop policy if exists lcc_write on public.leo_child_care;
create policy lcc_write on public.leo_child_care for all to authenticated using (public.can_manage()) with check (public.can_manage());
-- ヒヤリハットの出どころ（ポータル／LINE）
alter table public.hiyari add column if not exists source text not null default 'ポータル' check (source in ('ポータル','LINE'));
