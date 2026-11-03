-- 梁山泊：日ごとの食事メニューと連絡・備考。再実行できる。
create table if not exists public.ryozan_day_log (
  day date primary key,
  meal_menu text check (char_length(meal_menu) <= 500),
  notes text check (char_length(notes) <= 4000),
  author text check (char_length(author) <= 100),
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);
create or replace function public.ryozan_can()
returns boolean language sql stable security invoker set search_path = public as $$
  select coalesce(public.is_chair() or public.bp_is_corp_admin() or exists (
    select 1 from public.staff_profiles where user_id = auth.uid() and active and (
      office = '梁山泊' or role = '事務' or duty = '管理者'
      or '梁山泊' = any (coalesce(extra_offices, '{}'::text[])))), false)
$$;
revoke all on function public.ryozan_can() from public, anon;
grant execute on function public.ryozan_can() to authenticated;
alter table public.ryozan_day_log enable row level security;
drop policy if exists ryozan_day_log_sel on public.ryozan_day_log;
drop policy if exists ryozan_day_log_ins on public.ryozan_day_log;
drop policy if exists ryozan_day_log_upd on public.ryozan_day_log;
create policy ryozan_day_log_sel on public.ryozan_day_log for select to authenticated using (public.ryozan_can());
create policy ryozan_day_log_ins on public.ryozan_day_log for insert to authenticated with check (public.ryozan_can());
create policy ryozan_day_log_upd on public.ryozan_day_log for update to authenticated using (public.ryozan_can()) with check (public.ryozan_can());
grant select, insert, update on public.ryozan_day_log to authenticated;
notify pgrst, 'reload schema';
