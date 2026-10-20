-- 現行の個別支援計画の本文（児童ごと1件）。レオ職員が見る、管理側が書く
create table if not exists public.leo_child_plan (
  name text primary key,
  term text check (char_length(term) <= 20),
  period text check (char_length(period) <= 80),
  body text check (char_length(body) <= 20000),
  source_url text check (source_url is null or source_url ~ '^https://'),
  updated_by uuid default auth.uid(), updated_at timestamptz not null default now());
alter table public.leo_child_plan enable row level security;
drop policy if exists lcp_read on public.leo_child_plan;
create policy lcp_read on public.leo_child_plan for select to authenticated using (public.my_office() = 'レオ' or public.can_bill());
drop policy if exists lcp_write on public.leo_child_plan;
create policy lcp_write on public.leo_child_plan for all to authenticated using (public.can_manage()) with check (public.can_manage());
