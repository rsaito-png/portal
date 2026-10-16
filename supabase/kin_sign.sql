-- 金斗雲 訪問記録の本人署名（スマホ）。匿名はトークン付きRPCのみ。リンクは推測不能(192bit)・期限1週間・1回限り。
-- 署名画像は kin_consent と同じ流儀で base64(data URL) をDBに保存。履歴は kin_sign_log に追記のみ（更新・削除ポリシーなし）。
create table if not exists public.kin_sign_links (
  token text primary key check (token ~ '^[0-9a-f]{48}$'),
  user_id bigint not null references public.kin_user(id) on delete cascade,
  created_at timestamptz not null default now(), created_by uuid default auth.uid(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_at timestamptz);
create table if not exists public.kin_sign_log (
  id bigint generated always as identity primary key,
  token text not null references public.kin_sign_links(token),
  visit_id bigint not null references public.kin_visit(id),
  user_id bigint not null references public.kin_user(id),
  signer_kind text not null default '本人',
  signature text not null check (signature like 'data:image/png;base64,%' and char_length(signature) <= 300000),
  signed_at timestamptz not null default now());
create index if not exists kin_sign_log_visit on public.kin_sign_log(visit_id);
alter table public.kin_sign_links enable row level security;
alter table public.kin_sign_log enable row level security;
drop policy if exists ksl_read on public.kin_sign_links;
create policy ksl_read on public.kin_sign_links for select to authenticated using (public.my_office() = '金斗雲' or public.can_manage());
drop policy if exists kslog_read on public.kin_sign_log;
create policy kslog_read on public.kin_sign_log for select to authenticated using (public.my_office() = '金斗雲' or public.can_manage());
revoke all on public.kin_sign_links, public.kin_sign_log from anon;
revoke insert, update, delete on public.kin_sign_links, public.kin_sign_log from authenticated;

-- 職員：利用者を選んでリンク発行（発行時点で署名待ちが無ければ拒否）
create or replace function public.kin_sign_issue(p_user_id bigint)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare t text;
begin
  if not coalesce(public.my_office() = '金斗雲' or public.can_manage(), false) then raise exception '金斗雲職員のみ'; end if;
  if not exists (select 1 from kin_visit where user_id = p_user_id and sign_status <> '署名済み') then raise exception '署名待ちの訪問がありません'; end if;
  update kin_sign_links set expires_at = now() where user_id = p_user_id and used_at is null and expires_at > now(); -- 古い未使用リンクは失効
  t := encode(gen_random_bytes(24), 'hex');
  insert into kin_sign_links(token, user_id) values (t, p_user_id);
  return t;
end $$;
revoke all on function public.kin_sign_issue from public;
revoke execute on function public.kin_sign_issue from anon;
grant execute on function public.kin_sign_issue to authenticated;

-- 本人：トークンで署名待ちの訪問を取得（無効・期限切れ・使用済みは null）
create or replace function public.kin_sign_get(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', u.name, 'expires_at', l.expires_at,
    'visits', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'date', v.visit_date, 'start', to_char(v.start_time,'HH24:MI'), 'end', to_char(v.end_time,'HH24:MI'),
        'minutes', v.actual_minutes, 'service', v.service, 'staff', v.staff_name, 'content', v.content, 'note', v.note) order by v.visit_date, v.start_time)
      from kin_visit v where v.user_id = l.user_id and v.sign_status <> '署名済み'), '[]'::jsonb))
  from kin_sign_links l join kin_user u on u.id = l.user_id
  where l.token = p_token and length(p_token) = 48 and l.used_at is null and l.expires_at > now()
$$;
revoke all on function public.kin_sign_get from public;
grant execute on function public.kin_sign_get to anon, authenticated;

-- 本人：選んだ訪問にまとめて署名（1回限り。成功でリンクは使用済み）
create or replace function public.kin_sign_submit(p_token text, p_visit_ids bigint[], p_signature text)
returns int language plpgsql security definer set search_path = public as $$
declare l kin_sign_links; n int := 0; v kin_visit; lid bigint;
begin
  if p_signature is null or p_signature not like 'data:image/png;base64,%' or char_length(p_signature) > 300000 then raise exception '署名が正しくありません'; end if;
  if p_visit_ids is null or cardinality(p_visit_ids) = 0 then raise exception '訪問を選んでください'; end if;
  select * into l from kin_sign_links where token = p_token and length(p_token) = 48 for update;
  if not found or l.used_at is not null or l.expires_at <= now() then raise exception 'リンクが正しくないか、期限切れ・使用済みです'; end if;
  for v in select * from kin_visit where id = any(p_visit_ids) and user_id = l.user_id and sign_status <> '署名済み' order by id for update loop
    insert into kin_sign_log(token, visit_id, user_id, signature) values (p_token, v.id, l.user_id, p_signature) returning id into lid;
    update kin_visit set sign_status = '署名済み', signed_at = now(), signer_kind = '本人', signature_url = 'kin_sign_log:' || lid,
      late_signed = 'はい（本人のスマホから署名）', updated_at = now() where id = v.id;
    n := n + 1;
  end loop;
  if n = 0 then raise exception '署名できる訪問がありません'; end if;
  update kin_sign_links set used_at = now() where token = p_token;
  return n;
end $$;
revoke all on function public.kin_sign_submit from public;
grant execute on function public.kin_sign_submit to anon, authenticated;

-- v2: 署名方法4種（本人／ご家族／署名困難／あとで署名）。署名困難・あとで は画像なし。ログは追記のみ。
alter table public.kin_sign_log add column if not exists method text not null default '本人';
alter table public.kin_sign_log add column if not exists relation text check (char_length(relation) <= 30);
alter table public.kin_sign_log add column if not exists reason text check (char_length(reason) <= 500);
alter table public.kin_sign_log alter column signature drop not null;
alter table public.kin_sign_log drop constraint if exists kin_sign_log_method_chk;
alter table public.kin_sign_log add constraint kin_sign_log_method_chk check (method in ('本人','ご家族','署名困難','あとで署名'));
drop function if exists public.kin_sign_submit(text, bigint[], text);
create or replace function public.kin_sign_submit(p_token text, p_visit_ids bigint[], p_method text, p_signature text, p_relation text, p_reason text)
returns int language plpgsql security definer set search_path = public as $$
declare l kin_sign_links; n int := 0; v kin_visit; lid bigint; kind text; rel text := nullif(trim(coalesce(p_relation,'')),''); rs text := nullif(trim(coalesce(p_reason,'')),'');
begin
  if p_method not in ('本人','ご家族','署名困難','あとで署名') then raise exception '署名方法が正しくありません'; end if;
  if p_visit_ids is null or cardinality(p_visit_ids) = 0 then raise exception '訪問を選んでください'; end if;
  if p_method in ('本人','ご家族') and (p_signature is null or p_signature not like 'data:image/png;base64,%' or char_length(p_signature) > 300000) then raise exception '署名が正しくありません'; end if;
  if p_method = 'ご家族' and rel is null then raise exception '続柄を入れてください'; end if;
  if p_method = '署名困難' and rs is null then raise exception '理由を入れてください'; end if;
  select * into l from kin_sign_links where token = p_token and length(p_token) = 48 for update;
  if not found or l.used_at is not null or l.expires_at <= now() then raise exception 'リンクが正しくないか、期限切れ・使用済みです'; end if;
  kind := case p_method when 'ご家族' then left('ご家族（' || rel || '）', 30) else p_method end;
  for v in select * from kin_visit where id = any(p_visit_ids) and user_id = l.user_id and sign_status <> '署名済み' order by id for update loop
    insert into kin_sign_log(token, visit_id, user_id, signer_kind, method, relation, reason, signature)
      values (p_token, v.id, l.user_id, kind, p_method, case when p_method='ご家族' then rel end, case when p_method='署名困難' then rs end, case when p_method in ('本人','ご家族') then p_signature end) returning id into lid;
    if p_method <> 'あとで署名' then
      update kin_visit set sign_status = '署名済み', signed_at = now(), signer_kind = kind, sign_reason = case when p_method='署名困難' then rs end,
        signature_url = case when p_method in ('本人','ご家族') then 'kin_sign_log:' || lid end,
        late_signed = case when p_method in ('本人','ご家族') then 'はい（本人のスマホから署名）' else late_signed end, updated_at = now() where id = v.id;
    end if;
    n := n + 1;
  end loop;
  if n = 0 then raise exception '署名できる訪問がありません'; end if;
  if p_method <> 'あとで署名' then update kin_sign_links set used_at = now() where token = p_token; end if; -- あとで署名はリンクを消費しない
  return n;
end $$;
revoke all on function public.kin_sign_submit(text, bigint[], text, text, text, text) from public;
grant execute on function public.kin_sign_submit(text, bigint[], text, text, text, text) to anon, authenticated;
