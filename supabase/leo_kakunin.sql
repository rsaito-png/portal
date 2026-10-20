-- レオ 保護者の実績確認（Googleフォームの置き換え。11/1切り替え）
-- 保護者はログインなし。児童×月ごとの推測できないトークン付きリンクで、その児童のその月の実績だけを見て確認する
-- 項目はフォームを引き継ぐ：児童名・対象月・確認（内容に相違ありません／相違があります）・保護者氏名・相違点・ご意見 ＋ 署名（任意）
create table if not exists public.leo_confirm_links (
  token text primary key, child text not null, month text not null check (month ~ '^\d{4}-\d{2}$'),
  created_at timestamptz not null default now(), created_by uuid default auth.uid(),
  unique (child, month));
create table if not exists public.leo_confirmations (
  id bigint generated always as identity primary key,
  token text not null references public.leo_confirm_links(token) on delete cascade,
  confirm text not null check (confirm in ('内容に相違ありません','相違があります')),
  parent_name text not null check (length(parent_name) between 1 and 60),
  comment text check (length(comment) <= 2000),
  signature text check (signature is null or (signature like 'data:image/png;base64,%' and length(signature) < 200000)),
  submitted_at timestamptz not null default now());
alter table public.leo_confirm_links enable row level security;
alter table public.leo_confirmations enable row level security;
-- 事務だけが一覧を見られる（保護者・職員は直接読めない）
drop policy if exists lcl_clerk on public.leo_confirm_links;
create policy lcl_clerk on public.leo_confirm_links for select to authenticated using (public.my_role() = '事務');
drop policy if exists lc_clerk on public.leo_confirmations;
create policy lc_clerk on public.leo_confirmations for select to authenticated using (public.my_role() = '事務');

-- 事務：その月の児童ぶんのリンクを作る（既にあれば作らない）。実績・日誌に出てくる児童が対象
create or replace function public.leo_confirm_make_links(p_month text)
returns int language plpgsql security definer set search_path = public, extensions as $$
declare n int;
begin
  if public.my_role() is distinct from '事務' then raise exception '事務のみ'; end if;
  if p_month !~ '^\d{4}-\d{2}$' then raise exception '月は 2026-11 の形'; end if;
  insert into leo_confirm_links (token, child, month)
    select encode(gen_random_bytes(24), 'hex'), c, p_month from (
      select distinct child c from leo_jisseki where to_char(day, 'YYYY-MM') = p_month and coalesce(child,'') <> ''
      union select distinct child from leo_nikki where to_char(day, 'YYYY-MM') = p_month and kind = '利用' and coalesce(child,'') <> '') x
    on conflict (child, month) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.leo_confirm_make_links from public;
grant execute on function public.leo_confirm_make_links to authenticated;

-- 保護者：トークンで、その児童のその月の実績だけを返す（請求の項目は返さない）
create or replace function public.leo_confirm_get(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'child', l.child, 'month', l.month,
    'rows', coalesce((select jsonb_agg(jsonb_build_object('day', j.day, 'status', j.status, 'start', j.start_time, 'end', j.end_time) order by j.day)
                      from leo_jisseki j where j.child = l.child and to_char(j.day, 'YYYY-MM') = l.month), '[]'),
    'last', (select jsonb_build_object('confirm', c.confirm, 'parent', c.parent_name, 'at', c.submitted_at)
             from leo_confirmations c where c.token = l.token order by c.id desc limit 1))
  from leo_confirm_links l where l.token = p_token and length(p_token) = 48
$$;
revoke all on function public.leo_confirm_get from public;
grant execute on function public.leo_confirm_get to anon, authenticated;

create or replace function public.leo_confirm_submit(p_token text, p_confirm text, p_parent text, p_comment text, p_signature text)
returns text language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from leo_confirm_links where token = p_token) then raise exception 'リンクが正しくありません'; end if;
  if (select count(*) from leo_confirmations where token = p_token and submitted_at > now() - interval '1 hour') >= 5
    then raise exception '送信が多すぎます。時間をおいてください'; end if;
  insert into leo_confirmations (token, confirm, parent_name, comment, signature)
    values (p_token, p_confirm, trim(p_parent), nullif(trim(coalesce(p_comment,'')), ''), nullif(p_signature, ''));
  return 'ok';
end $$;
revoke all on function public.leo_confirm_submit from public;
grant execute on function public.leo_confirm_submit to anon, authenticated;
