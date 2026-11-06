-- 受給者証の原本確認：画面から直す・消す（児発管・管理者・事務＝can_manage）
-- 既存の leo_jukyusha_check.sql のあとに実行。何度実行しても同じ。
drop policy if exists ljc_upd on public.leo_jukyusha_checks;
create policy ljc_upd on public.leo_jukyusha_checks for update to authenticated
  using (public.can_manage()) with check (
    public.can_manage()
    and checked_on <= (now() at time zone 'Asia/Tokyo')::date
    and char_length(btrim(checked_by)) between 1 and 60
  );
drop policy if exists ljc_del on public.leo_jukyusha_checks;
create policy ljc_del on public.leo_jukyusha_checks for delete to authenticated
  using (public.can_manage());
grant update, delete on public.leo_jukyusha_checks to authenticated;
