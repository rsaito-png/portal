-- 管理職からの報告（管理職→会長）。書ける人＝can_manage() か会長。読める人＝本人と会長。完了にできるのは会長だけ。
create table if not exists public.mgr_report (
  id bigint generated always as identity primary key,
  author uuid not null default auth.uid(),
  office text,
  kind text not null default '報告' check (kind in ('報告','相談','決裁依頼','緊急')),
  body text check (char_length(body) <= 2000),
  no_problem boolean not null default false,
  status text not null default 'open' check (status in ('open','done')),
  created_at timestamptz not null default now(),
  done_at timestamptz,
  check (no_problem or coalesce(body,'') <> ''));
alter table public.mgr_report enable row level security;
drop policy if exists mr_read on public.mgr_report;
create policy mr_read on public.mgr_report for select to authenticated using (author = auth.uid() or public.is_chair());
drop policy if exists mr_ins on public.mgr_report;
create policy mr_ins on public.mgr_report for insert to authenticated with check (author = auth.uid() and (public.can_manage() or public.is_chair()));
drop policy if exists mr_upd on public.mgr_report;
create policy mr_upd on public.mgr_report for update to authenticated using (public.is_chair()) with check (public.is_chair());
