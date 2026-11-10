-- レオの送迎・予定・日誌の「職員・運転」プルダウン用。在籍中のレオ職員の表示名だけを返す（ほかの列は返さない）。
-- 一般職員は staff_profiles を自分の行しか読めないため SECURITY DEFINER。呼べるのはログイン中の職員（is_staff）だけ。
create or replace function public.leo_staff_names()
returns table(name text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct coalesce(nullif(btrim(nikki_name), ''), nullif(btrim(full_name), '')) as name
  from public.staff_profiles
  where public.is_staff()
    and active is not false
    and (office = 'レオ' or 'レオ' = any(coalesce(extra_offices, '{}')))
    and coalesce(nullif(btrim(nikki_name), ''), nullif(btrim(full_name), '')) is not null
  order by 1;
$$;
revoke all on function public.leo_staff_names() from public, anon;
grant execute on function public.leo_staff_names() to authenticated;
