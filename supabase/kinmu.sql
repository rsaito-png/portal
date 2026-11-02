-- 三重県運営指導「勤務実績及び利用者の実績表」
-- 職員の配置は月ごとに蓄積し、レオと茶夢で共通（同じ行を両方の入口から見る）。
-- 利用者数はサービス別（児童発達支援 jido / 放課後等デイ houday / 生活介護 seikatsu）。
-- 初期の週パターンは leo_kinmu_lib.js。画面でその月を保存したときにここに残る。
-- 適用: Supabase SQL Editor に貼って Run。または apply_migration。

create or replace function public.kinmu_can_read()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(
    public.is_chair()
    or public.my_role() = '事務'
    or public.my_office() in ('レオ', '茶夢'),
    false)
$$;

create or replace function public.kinmu_can_write()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(
    public.is_chair()
    or public.my_role() = '事務'
    or (public.can_manage() and public.my_office() in ('レオ', '茶夢')),
    false)
$$;

revoke all on function public.kinmu_can_read() from public, anon;
revoke all on function public.kinmu_can_write() from public, anon;
grant execute on function public.kinmu_can_read() to authenticated;
grant execute on function public.kinmu_can_write() to authenticated;

create table if not exists public.kinmu_lines (
  id uuid primary key default gen_random_uuid(),
  ym text not null check (ym ~ '^\d{4}-\d{2}$'),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  job_abbr text not null check (job_abbr in ('管理', '指導', '保育', '児管', '機訓', '送迎', '事務')),
  form_class text not null check (form_class in ('A', 'B', 'C', 'D')),
  qualification text not null default '' check (char_length(qualification) <= 40),
  note text not null default '' check (char_length(note) <= 80),
  sort int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

create table if not exists public.kinmu_cells (
  line_id uuid not null references public.kinmu_lines(id) on delete cascade,
  day int not null check (day between 1 and 31),
  start_time text not null default '' check (start_time = '' or start_time ~ '^\d{2}:\d{2}$'),
  end_time text not null default '' check (end_time = '' or end_time ~ '^\d{2}:\d{2}$'),
  hours text not null default '' check (hours = '' or hours ~ '^\d{1,3}:\d{2}$'),
  primary key (line_id, day)
);

create table if not exists public.kinmu_users (
  service text not null check (service in ('jido', 'houday', 'seikatsu')),
  ym text not null check (ym ~ '^\d{4}-\d{2}$'),
  day int not null check (day between 1 and 31),
  user_count int not null check (user_count >= 0 and user_count <= 200),
  updated_at timestamptz not null default now(),
  primary key (service, ym, day)
);

create index if not exists kinmu_lines_ym on public.kinmu_lines (ym, sort);

alter table public.kinmu_lines enable row level security;
alter table public.kinmu_cells enable row level security;
alter table public.kinmu_users enable row level security;

drop policy if exists kinmu_lines_sel on public.kinmu_lines;
create policy kinmu_lines_sel on public.kinmu_lines for select to authenticated
  using (public.kinmu_can_read());
drop policy if exists kinmu_lines_ins on public.kinmu_lines;
create policy kinmu_lines_ins on public.kinmu_lines for insert to authenticated
  with check (public.kinmu_can_write());
drop policy if exists kinmu_lines_upd on public.kinmu_lines;
create policy kinmu_lines_upd on public.kinmu_lines for update to authenticated
  using (public.kinmu_can_write()) with check (public.kinmu_can_write());
drop policy if exists kinmu_lines_del on public.kinmu_lines;
create policy kinmu_lines_del on public.kinmu_lines for delete to authenticated
  using (public.kinmu_can_write());

drop policy if exists kinmu_cells_sel on public.kinmu_cells;
create policy kinmu_cells_sel on public.kinmu_cells for select to authenticated
  using (public.kinmu_can_read());
drop policy if exists kinmu_cells_ins on public.kinmu_cells;
create policy kinmu_cells_ins on public.kinmu_cells for insert to authenticated
  with check (public.kinmu_can_write());
drop policy if exists kinmu_cells_upd on public.kinmu_cells;
create policy kinmu_cells_upd on public.kinmu_cells for update to authenticated
  using (public.kinmu_can_write()) with check (public.kinmu_can_write());
drop policy if exists kinmu_cells_del on public.kinmu_cells;
create policy kinmu_cells_del on public.kinmu_cells for delete to authenticated
  using (public.kinmu_can_write());

drop policy if exists kinmu_users_sel on public.kinmu_users;
create policy kinmu_users_sel on public.kinmu_users for select to authenticated
  using (public.kinmu_can_read());
drop policy if exists kinmu_users_ins on public.kinmu_users;
create policy kinmu_users_ins on public.kinmu_users for insert to authenticated
  with check (public.kinmu_can_write());
drop policy if exists kinmu_users_upd on public.kinmu_users;
create policy kinmu_users_upd on public.kinmu_users for update to authenticated
  using (public.kinmu_can_write()) with check (public.kinmu_can_write());
drop policy if exists kinmu_users_del on public.kinmu_users;
create policy kinmu_users_del on public.kinmu_users for delete to authenticated
  using (public.kinmu_can_write());

revoke all on public.kinmu_lines, public.kinmu_cells, public.kinmu_users from anon, authenticated, public;
grant select, insert, update, delete on public.kinmu_lines, public.kinmu_cells, public.kinmu_users to authenticated;

comment on table public.kinmu_lines is '監査用の月次勤務実績（職員×職種）。レオと茶夢で共通。打刻とは別。';
comment on table public.kinmu_cells is '勤務実績の日セル。上段開始・中段終了・下段勤務時間。';
comment on table public.kinmu_users is '勤務実績表の利用者数。サービスごとに月次で残す。';

notify pgrst, 'reload schema';
