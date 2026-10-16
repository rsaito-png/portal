-- スタッフ業務報告。新しい表と関数のみ（staff_profiles に列を1つ足す）。個人名は入れない。
-- 誰が報告対象か＝ staff_profiles.daily_report = true（画面ではなくSQLで設定。docs/staff_report.md 参照）
alter table public.staff_profiles add column if not exists daily_report boolean not null default false;

create table if not exists public.staff_report (
  id bigint generated always as identity primary key,
  staff uuid not null default auth.uid(),
  day date not null,
  body text check (char_length(body) <= 2000),
  no_problem boolean not null default false,
  trouble text check (char_length(trouble) <= 2000),
  updated_at timestamptz not null default now(),
  unique (staff, day),
  check (no_problem or coalesce(body,'') <> '' or coalesce(trouble,'') <> ''));
alter table public.staff_report enable row level security;
drop policy if exists sr_read on public.staff_report;
create policy sr_read on public.staff_report for select to authenticated using (staff = auth.uid() or public.can_manage());
drop policy if exists sr_ins on public.staff_report;
create policy sr_ins on public.staff_report for insert to authenticated with check (staff = auth.uid());
drop policy if exists sr_upd on public.staff_report;
create policy sr_upd on public.staff_report for update to authenticated using (staff = auth.uid()) with check (staff = auth.uid());
drop policy if exists sr_del on public.staff_report;
create policy sr_del on public.staff_report for delete to authenticated using (public.can_manage());

create table if not exists public.staff_todo (
  id bigint generated always as identity primary key,
  assignee uuid not null,
  title text not null check (char_length(title) <= 300),
  status text not null default 'open' check (status in ('open','doing','done')),
  due date,
  note text check (char_length(note) <= 1000),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now());
alter table public.staff_todo enable row level security;
drop policy if exists st_read on public.staff_todo;
create policy st_read on public.staff_todo for select to authenticated using (assignee = auth.uid() or public.can_manage());
drop policy if exists st_ins on public.staff_todo;
create policy st_ins on public.staff_todo for insert to authenticated with check (public.can_manage());
drop policy if exists st_upd on public.staff_todo;
create policy st_upd on public.staff_todo for update to authenticated using (assignee = auth.uid() or public.can_manage()) with check (assignee = auth.uid() or public.can_manage());
drop policy if exists st_del on public.staff_todo;
create policy st_del on public.staff_todo for delete to authenticated using (public.can_manage());

-- 本人は進み具合（status・note）だけ直せる。更新日時は自動。
create or replace function public.staff_todo_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage() then
    if new.assignee is distinct from old.assignee or new.title is distinct from old.title or new.due is distinct from old.due
       or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
      raise exception '指示の内容は本人は変えられません';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists staff_todo_guard on public.staff_todo;
create trigger staff_todo_guard before update on public.staff_todo for each row execute function public.staff_todo_guard();

-- 管理者（can_manage）だけ：職員の名簿（報告対象かどうか付き）
create or replace function public.staff_roster() returns table(user_id uuid, name text, office text, daily_report boolean)
language sql stable security definer set search_path = public as $$
  select user_id, coalesce(nullif(full_name,''), nikki_name, '（名前未設定）'), office, daily_report
  from public.staff_profiles where public.can_manage() $$;
revoke all on function public.staff_roster() from public, anon;
grant execute on function public.staff_roster() to authenticated;
