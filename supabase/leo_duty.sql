-- 職責（画面の出し分け）：管理者／児発管／現場支援員／事務。role（職員/事務）はデータの見える範囲、duty は仕事の画面
alter table public.staff_profiles add column if not exists duty text not null default '現場支援員'
  check (duty in ('管理者','児発管','現場支援員','事務'));
create or replace function public.my_duty() returns text language sql stable security definer set search_path = public
as $$ select duty from public.staff_profiles where user_id = auth.uid() $$;
-- 管理・確認ができる人：事務（role）・管理者・児発管
create or replace function public.can_manage() returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(public.my_role() = '事務' or public.my_duty() in ('管理者','児発管'), false) $$;
-- （実名を含む役職の初期設定は公開リポジトリから削除。DBで設定済み）
-- （実名を含む役職の初期設定は公開リポジトリから削除。DBで設定済み）
-- ヒヤリハットの確認・保護者の実績確認は児発管もできる
drop policy if exists hy_check on public.hiyari;
create policy hy_check on public.hiyari for update to authenticated using (public.can_manage() and (office = public.my_office() or public.my_role() = '事務')) with check (public.can_manage());
drop policy if exists lcl_clerk on public.leo_confirm_links;
create policy lcl_clerk on public.leo_confirm_links for select to authenticated using (public.can_manage());
drop policy if exists lc_clerk on public.leo_confirmations;
create policy lc_clerk on public.leo_confirmations for select to authenticated using (public.can_manage());
create or replace function public.leo_confirm_make_links(p_month text)
returns int language plpgsql security definer set search_path = public, extensions as $$
declare n int;
begin
  if not public.can_manage() then raise exception '事務・管理者・児発管のみ'; end if;
  if p_month !~ '^\d{4}-\d{2}$' then raise exception '月は 2026-11 の形'; end if;
  insert into leo_confirm_links (token, child, month)
    select encode(gen_random_bytes(24), 'hex'), c, p_month from (
      select distinct child c from leo_jisseki where to_char(day, 'YYYY-MM') = p_month and coalesce(child,'') <> ''
      union select distinct child from leo_nikki where to_char(day, 'YYYY-MM') = p_month and kind = '利用' and coalesce(child,'') <> '') x
    on conflict (child, month) do nothing;
  get diagnostics n = row_count; return n;
end $$;
-- 自分の職責は読める（staff_profiles の自分の行は sp_self で読める）
