-- 手編集の残り：茶夢配置・税カレンダー削除・毎日占い手編集
-- 既存の行データは変更しない。

-- 茶夢配置：事務・茶夢の管理者・会長が直せる。個人名の制約は編集の邪魔なので外す（時間の前後だけ残す）
alter table public.chamu_shift drop constraint if exists chamu_shift_fumi;
alter table public.chamu_shift drop constraint if exists chamu_shift_kato;
alter table public.chamu_shift drop constraint if exists chamu_shift_ando;
alter table public.chamu_shift drop constraint if exists chamu_shift_full;
alter table public.chamu_shift drop constraint if exists chamu_shift_part;

create or replace function public.chamu_shift_write()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    public.is_chair()
    or public.bp_is_corp_admin()
    or (public.my_office() = '茶夢' and public.my_duty() = '管理者')
    or (public.my_role() = '事務'),
    false
  );
$$;
revoke all on function public.chamu_shift_write() from public, anon;
grant execute on function public.chamu_shift_write() to authenticated;

drop policy if exists chamu_shift_write on public.chamu_shift;
create policy chamu_shift_write on public.chamu_shift for all to authenticated
  using (public.chamu_shift_write()) with check (public.chamu_shift_write());
grant insert, update, delete on public.chamu_shift to authenticated;

-- 税カレンダー：削除ポリシー
drop policy if exists tax_calendar_del on public.tax_calendar;
create policy tax_calendar_del on public.tax_calendar for delete to authenticated
  using (public.is_chair() or public.bp_is_corp_admin());

-- 毎日占い：会長・事務・管理者が手で直せる
drop policy if exists daily_sky_write on public.portal_daily_sky;
create policy daily_sky_write on public.portal_daily_sky for all to authenticated
  using (public.is_chair() or public.bp_is_corp_admin() or public.my_duty() = '管理者')
  with check (public.is_chair() or public.bp_is_corp_admin() or public.my_duty() = '管理者');
grant insert, update, delete on public.portal_daily_sky to authenticated;

notify pgrst, 'reload schema';
