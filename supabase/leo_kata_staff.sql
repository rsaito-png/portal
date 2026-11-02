-- 送迎の型表（leo_master の kind=kata）と送迎の配慮（leo_child_care）を、レオ所属のログイン職員が直せるようにする。
-- 個別支援計画の管理表（keikaku）と職員配置表（haichi）は、これまでどおり児発管・管理者・事務（can_manage）だけ。
-- 画面の保存は、その種類の行を一度消してから入れ直す。削除も、レオ所属かつ kind=kata に限る。
-- 読む権限（lm_read / lcc_read）は変えない。
--
-- 適用：Supabase の SQL Editor にこのファイルを貼って Run（再実行できる）。
-- 既に leo_plan.sql を流している本番は、このファイルだけで足りる。
-- 画面を先に出しても、これを実行するまで現場支援員の保存は拒否される。

drop policy if exists lm_write on public.leo_master;
create policy lm_write on public.leo_master
  for all
  to authenticated
  using ((public.my_office() = 'レオ' and kind = 'kata') or public.can_manage())
  with check ((public.my_office() = 'レオ' and kind = 'kata') or public.can_manage());

drop policy if exists lcc_write on public.leo_child_care;
create policy lcc_write on public.leo_child_care
  for all
  to authenticated
  using (public.my_office() = 'レオ' or public.can_manage())
  with check (public.my_office() = 'レオ' or public.can_manage());
