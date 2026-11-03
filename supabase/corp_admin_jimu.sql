-- 事務（staff_profiles.role='事務'）も法人管理者扱い（会計・RYDEEN等）。再実行可。会長専用(is_chair)は別。
create or replace function public.bp_is_corp_admin()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select auth.uid() is not null and (
    exists (select 1 from public.bp_corp_admins where user_id = auth.uid())
    or coalesce(public.my_role() = '事務', false)
  );
$$;
