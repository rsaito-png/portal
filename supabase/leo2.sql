-- レオ 追加分: 型表・個別支援計画 管理表・職員配置表（Googleから読むだけで同期）と、事務の「直した所」確認
create table if not exists public.leo_sheet (
  kind text not null check (kind in ('kata','keikaku','haichi')),  -- 型表 / 個別支援計画 管理表 / 職員配置表(日別配置)
  row_no int not null,
  data jsonb not null,                                             -- 見出し → 値
  synced_at timestamptz not null default now(),
  primary key (kind, row_no)
);
alter table public.leo_sheet enable row level security;
drop policy if exists sheet_read on public.leo_sheet;
create policy sheet_read on public.leo_sheet for select to authenticated using (public.my_office() = 'レオ');

create or replace function public.my_role() returns text language sql stable security definer set search_path = public
as $$ select role from public.staff_profiles where user_id = auth.uid() $$;

-- 事務は同じ事業所の職員プロフィール（日誌の名前）を見られる（「直した所」に誰が直したかを出すため）
drop policy if exists sp_jimu on public.staff_profiles;
create policy sp_jimu on public.staff_profiles for select to authenticated
  using (public.my_role() = '事務' and office = public.my_office());

create or replace function public.leo_sync_sheet(p_token text, p_kind text, p_rows jsonb)
returns text language plpgsql security definer set search_path = public, extensions as $$
begin
  if encode(digest(p_token, 'sha256'), 'hex') is distinct from (select token_sha256 from sync_secret where name = 'leo')
    then raise exception 'bad token'; end if;
  delete from leo_sheet where kind = p_kind;
  insert into leo_sheet (kind, row_no, data)
    select p_kind, (x->>'row_no')::int, x->'data' from jsonb_array_elements(p_rows) x;
  return 'ok';
end $$;
revoke all on function public.leo_sync_sheet from public;
grant execute on function public.leo_sync_sheet to anon, authenticated;
