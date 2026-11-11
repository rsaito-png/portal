-- モニタリングシート（相談員へ渡す表）。目標ごとの推移・評価・課題。
-- テキスト型の leo_staff_mon はそのまま残す。画面はこちらを使う。
-- 読む・追加・更新：レオの職員、または児発管・管理者・事務（can_manage）。
-- 削除：児発管・管理者・事務のみ。
-- 再実行できる。

create table if not exists public.leo_monitoring (
  id bigint generated always as identity primary key,
  child text not null,
  term text not null,
  period_from date,
  period_to date,
  update_label text not null default '',
  rows jsonb not null default '[]'::jsonb,
  source text not null default '手入力',
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  unique (child, term),
  constraint leo_monitoring_rows_arr check (jsonb_typeof(rows) = 'array'),
  constraint leo_monitoring_rows_size check (pg_column_size(rows) < 200000),
  constraint leo_monitoring_label check (char_length(update_label) <= 40)
);

alter table public.leo_monitoring enable row level security;
grant select, insert, update, delete on public.leo_monitoring to authenticated;

drop policy if exists lmon_read on public.leo_monitoring;
create policy lmon_read on public.leo_monitoring
  for select to authenticated
  using (public.my_office() = 'レオ' or public.can_manage());

drop policy if exists lmon_ins on public.leo_monitoring;
create policy lmon_ins on public.leo_monitoring
  for insert to authenticated
  with check (public.my_office() = 'レオ' or public.can_manage());

drop policy if exists lmon_upd on public.leo_monitoring;
create policy lmon_upd on public.leo_monitoring
  for update to authenticated
  using (public.my_office() = 'レオ' or public.can_manage())
  with check (public.my_office() = 'レオ' or public.can_manage());

drop policy if exists lmon_del on public.leo_monitoring;
create policy lmon_del on public.leo_monitoring
  for delete to authenticated
  using (public.can_manage());
