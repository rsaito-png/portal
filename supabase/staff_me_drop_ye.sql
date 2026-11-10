-- 年末調整関連の表を削除する（件数 0 のときだけ）。
-- staff_bank_accounts と staff_my_numbers は残す。
-- Storage バケット staff-ye-docs は storage.protect_delete により SQL からの DELETE が拒否される。
-- オブジェクト0件を確認したうえで、Storage API（DELETE /storage/v1/bucket/staff-ye-docs）で削除する。
do $$
declare
  n_ye int;
  n_dep int;
  n_obj int;
begin
  if to_regclass('public.staff_ye_declarations') is not null then
    execute 'select count(*) from public.staff_ye_declarations' into n_ye;
  else
    n_ye := 0;
  end if;
  if to_regclass('public.staff_dependent_my_numbers') is not null then
    execute 'select count(*) from public.staff_dependent_my_numbers' into n_dep;
  else
    n_dep := 0;
  end if;
  select count(*) into n_obj from storage.objects where bucket_id = 'staff-ye-docs';
  if coalesce(n_ye,0) > 0 or coalesce(n_dep,0) > 0 or coalesce(n_obj,0) > 0 then
    raise exception 'refuse drop: staff_ye_declarations=%, staff_dependent_my_numbers=%, storage.objects=% (1件でもあれば削除しない)', n_ye, n_dep, n_obj;
  end if;
end $$;

drop policy if exists syedoc_sel on storage.objects;
drop policy if exists syedoc_ins on storage.objects;
drop policy if exists syedoc_upd on storage.objects;
drop policy if exists syedoc_del on storage.objects;

drop table if exists public.staff_ye_declarations;
drop table if exists public.staff_dependent_my_numbers;
