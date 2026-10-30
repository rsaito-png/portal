-- 水晶玉（計画相談）書類：利用契約書・重要事項説明書。金斗雲（kin_contract.sql）と同じ仕組み（署名リンク1回限り・1週間／追記専用ログ／紙で署名済み）。
-- 本文は画像ではなくテキスト（sui_doc_type.body）。{氏名}{事業所} を差し込み。
alter table public.sui_user add column if not exists contract_start date;
create table if not exists public.sui_doc_type (
  code text primary key, label text not null, version text not null default 'R8.11', sort int not null default 0, body text not null default '', updated_at timestamptz default now());
create table if not exists public.sui_doc_links (
  token text primary key check (token ~ '^[0-9a-f]{48}$'),
  user_id bigint not null references public.sui_user(id) on delete cascade,
  docs text[] not null, explainer_name text not null check (char_length(explainer_name) between 1 and 60),
  created_at timestamptz not null default now(), created_by uuid default auth.uid(),
  expires_at timestamptz not null default now() + interval '7 days', used_at timestamptz);
create table if not exists public.sui_doc_log ( -- 追記専用
  id bigint generated always as identity primary key,
  user_id bigint not null references public.sui_user(id) on delete cascade, doc_code text not null references public.sui_doc_type(code), version text not null,
  token text references public.sui_doc_links(token) on delete set null,
  method text not null check (method in ('本人','ご家族','署名困難','あとで署名','紙で署名済み')),
  agent_name text check (char_length(agent_name) <= 100), agent_relation text check (char_length(agent_relation) <= 50), reason text check (char_length(reason) <= 500),
  explainer_name text check (char_length(explainer_name) <= 60),
  signature text check (signature is null or (signature like 'data:image/png;base64,%' and char_length(signature) <= 300000)),
  signed_on date, memo text check (char_length(memo) <= 500),
  signed_at timestamptz not null default now(), recorded_by uuid default auth.uid());
create index if not exists sui_doc_log_ud on public.sui_doc_log(user_id, doc_code);
do $$ declare t text; begin
  foreach t in array array['sui_doc_type','sui_doc_links','sui_doc_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_r', t);
    execute format($p$create policy %I on public.%I for select to authenticated using (public.my_office() = '水晶玉' or public.can_manage())$p$, t||'_r', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke insert, update, delete on public.%I from authenticated', t);
  end loop; end $$;
-- 本文の編集は職員に許可（文面の差し替え用）
drop policy if exists sui_doc_type_u on public.sui_doc_type;
create policy sui_doc_type_u on public.sui_doc_type for update to authenticated using (public.my_office() = '水晶玉' or public.can_manage()) with check (public.my_office() = '水晶玉' or public.can_manage());
grant update (body, version, updated_at) on public.sui_doc_type to authenticated;

create or replace function public.sui_doc_issue(p_user_id bigint, p_docs text[], p_explainer text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare t text; d text;
begin
  if not coalesce(public.my_office() = '水晶玉' or public.can_manage(), false) then raise exception '水晶玉の職員のみ'; end if;
  if p_docs is null or cardinality(p_docs) = 0 or nullif(trim(coalesce(p_explainer,'')),'') is null then raise exception '書類と説明職員を指定してください'; end if;
  foreach d in array p_docs loop
    if not exists (select 1 from sui_doc_type where code = d and body <> '') then raise exception '本文が未登録です: %', d; end if;
  end loop;
  update sui_doc_links set expires_at = now() where user_id = p_user_id and used_at is null and expires_at > now();
  t := encode(gen_random_bytes(24), 'hex');
  insert into sui_doc_links(token, user_id, docs, explainer_name) values (t, p_user_id, p_docs, trim(p_explainer));
  return t;
end $$;
revoke all on function public.sui_doc_issue from public; revoke execute on function public.sui_doc_issue from anon;
grant execute on function public.sui_doc_issue to authenticated;

create or replace function public.sui_doc_get(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', u.name, 'explainer', l.explainer_name, 'expires_at', l.expires_at,
    'docs', (select jsonb_agg(jsonb_build_object('code', t.code, 'label', t.label, 'version', t.version, 'body', replace(t.body, '{氏名}', u.name)) order by t.sort)
      from sui_doc_type t where t.code = any(l.docs)))
  from sui_doc_links l join sui_user u on u.id = l.user_id
  where l.token = p_token and length(p_token) = 48 and l.used_at is null and l.expires_at > now()
$$;
revoke all on function public.sui_doc_get from public;
grant execute on function public.sui_doc_get to anon, authenticated;

create or replace function public.sui_doc_submit(p_token text, p_docs text[], p_method text, p_signature text, p_agent_name text, p_agent_relation text, p_reason text)
returns int language plpgsql security definer set search_path = public as $$
declare l sui_doc_links; n int := 0; d text; t sui_doc_type; an text := nullif(trim(coalesce(p_agent_name,'')),''); ar text := nullif(trim(coalesce(p_agent_relation,'')),''); rs text := nullif(trim(coalesce(p_reason,'')),'');
begin
  if p_method not in ('本人','ご家族','署名困難','あとで署名') then raise exception '署名方法が正しくありません'; end if;
  if p_docs is null or cardinality(p_docs) = 0 then raise exception '書類を選んでください'; end if;
  if p_method in ('本人','ご家族') and (p_signature is null or p_signature not like 'data:image/png;base64,%' or char_length(p_signature) > 300000) then raise exception '署名が正しくありません'; end if;
  if p_method = 'ご家族' and (an is null or ar is null) then raise exception '署名される方の氏名と続柄を入れてください'; end if;
  if p_method = '署名困難' and rs is null then raise exception '理由を入れてください'; end if;
  select * into l from sui_doc_links where token = p_token and length(p_token) = 48 for update;
  if not found or l.used_at is not null or l.expires_at <= now() then raise exception 'リンクが正しくないか、期限切れ・使用済みです'; end if;
  foreach d in array p_docs loop
    if d = any(l.docs) then
      select * into t from sui_doc_type where code = d;
      insert into sui_doc_log(user_id, doc_code, version, token, method, agent_name, agent_relation, reason, explainer_name, signature)
        values (l.user_id, d, t.version, p_token, p_method, case when p_method='ご家族' then an end, case when p_method='ご家族' then ar end, case when p_method='署名困難' then rs end, l.explainer_name, case when p_method in ('本人','ご家族') then p_signature end);
      if p_method <> 'あとで署名' and d = 'keiyaku' then
        update sui_user set contract_start = (now() at time zone 'Asia/Tokyo')::date where id = l.user_id and contract_start is null;
      end if;
      n := n + 1;
    end if;
  end loop;
  if n = 0 then raise exception '署名できる書類がありません'; end if;
  if p_method <> 'あとで署名' then update sui_doc_links set used_at = now() where token = p_token; end if;
  return n;
end $$;
revoke all on function public.sui_doc_submit from public;
grant execute on function public.sui_doc_submit to anon, authenticated;

create or replace function public.sui_doc_mark_paper(p_user_id bigint, p_doc text, p_signed_on date, p_memo text)
returns void language plpgsql security definer set search_path = public as $$
declare t sui_doc_type;
begin
  if not coalesce(public.my_office() = '水晶玉' or public.can_manage(), false) then raise exception '水晶玉の職員のみ'; end if;
  select * into t from sui_doc_type where code = p_doc; if not found then raise exception '書類が正しくありません'; end if;
  if p_signed_on is null then raise exception '署名日を入れてください'; end if;
  insert into sui_doc_log(user_id, doc_code, version, method, signed_on, memo)
    values (p_user_id, p_doc, t.version, '紙で署名済み', p_signed_on, nullif(trim(coalesce(p_memo,'')),''));
  if p_doc = 'keiyaku' then update sui_user set contract_start = p_signed_on where id = p_user_id and contract_start is null; end if;
end $$;
revoke all on function public.sui_doc_mark_paper from public; revoke execute on function public.sui_doc_mark_paper from anon;
grant execute on function public.sui_doc_mark_paper to authenticated;
