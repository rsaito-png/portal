-- 2026-10-20 個人情報保護の対策（本番に適用済み。apply_migration: privacy_*）
-- 1) RLSを迂回する関数の実行権限を外す
revoke execute on function public.leo_sched_kata_all() from public, anon, authenticated;
revoke execute on function public.leo_shadow_transfer() from public, anon, authenticated;
-- 2) 在籍フラグと、事業所を見る管理権限
alter table public.staff_profiles add column if not exists active boolean not null default true;
-- my_office/my_role/my_duty/is_chair は "and active" を追加。
-- can_manage_for(p_office)：事務＝全事業所、管理者・児発管＝自事業所のみ。kin_/sui_/leo_ のポリシーの can_manage() を置換。
-- 3) audit_log（追記のみ・事務と会長だけ閲覧）＋ audit_row() トリガー、閲覧記録用 audit_view(table, ref)
-- 4) portal_links（内部リンク・書類用職員名。在籍職員のみ閲覧）
-- 詳細な定義はDBを正とする（select pg_get_functiondef('public.can_manage_for(text)'::regprocedure) 等）。
