-- モニタリングシート（leo_staff_mon）を、レオの職員が手入力で保存できるようにする。
-- これまでは insert / update / delete が can_manage()（児発管・管理者・事務）だけだった。
-- 読む権限（lsm_read）は変えない（レオ所属、または can_bill）。
-- 追記と更新はレオ所属の職員もできる。削除はこれまでどおり can_manage() のみ。
--
-- 適用：Supabase Management API（このファイルを再実行できる）。
-- 画面を先に出しても、これを実行するまで現場職員の保存は拒否される。

drop policy if exists lsm_write on public.leo_staff_mon;
drop policy if exists lsm_ins on public.leo_staff_mon;
drop policy if exists lsm_upd on public.leo_staff_mon;
drop policy if exists lsm_del on public.leo_staff_mon;

create policy lsm_ins on public.leo_staff_mon
  for insert
  to authenticated
  with check (public.my_office() = 'レオ' or public.can_manage());

create policy lsm_upd on public.leo_staff_mon
  for update
  to authenticated
  using (public.my_office() = 'レオ' or public.can_manage())
  with check (public.my_office() = 'レオ' or public.can_manage());

create policy lsm_del on public.leo_staff_mon
  for delete
  to authenticated
  using (public.can_manage());
