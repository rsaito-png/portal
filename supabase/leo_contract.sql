-- レオ 利用契約書・重要事項説明書の電子署名。水晶玉（sui_contract.sql）と同じ仕組み（署名リンク1回限り・1週間／追記専用ログ／紙で署名済み）。
-- 本文はテキスト（leo_doc_type.body）。{保護者}{児童}{契約開始}{契約終了}{契約締結日}{説明日}{説明職員}{保護者住所}{続柄} を差し込む。
-- 見学者（leo_children にまだいない児童）も、名前を入れて発行できる（leo_doc_party に児童名・保護者名を持つ。leo_children への外部キーは持たない）。
-- 権限：児発管・事務・管理者（can_manage_for('レオ')）。現場職員は不可。匿名はトークン付きRPCのみ。金斗雲・水晶玉の表・RPCは変更しない。

create table if not exists public.leo_doc_type (
  code text primary key, label text not null, version text not null default 'R8.11', sort int not null default 0, body text not null default '', updated_at timestamptz default now());

create table if not exists public.leo_doc_party (
  id bigint generated always as identity primary key,
  child_name text not null unique check (char_length(child_name) between 1 and 80),
  guardian_name text not null check (char_length(guardian_name) between 1 and 100),
  guardian_relation text check (char_length(guardian_relation) <= 50),
  guardian_address text check (char_length(guardian_address) <= 200),
  contract_start date, contract_end date,
  created_at timestamptz not null default now(), created_by uuid default auth.uid(),
  updated_at timestamptz not null default now());

create table if not exists public.leo_doc_links (
  token text primary key check (token ~ '^[0-9a-f]{48}$'),
  party_id bigint not null references public.leo_doc_party(id) on delete cascade,
  docs text[] not null, explainer_name text not null check (char_length(explainer_name) between 1 and 60),
  created_at timestamptz not null default now(), created_by uuid default auth.uid(),
  expires_at timestamptz not null default now() + interval '7 days', used_at timestamptz);

create table if not exists public.leo_doc_log ( -- 追記専用
  id bigint generated always as identity primary key,
  party_id bigint not null references public.leo_doc_party(id) on delete cascade,
  doc_code text not null references public.leo_doc_type(code), version text not null,
  token text references public.leo_doc_links(token) on delete set null,
  method text not null check (method in ('保護者','ご家族','署名困難','あとで署名','紙で署名済み')),
  agent_name text check (char_length(agent_name) <= 100), agent_relation text check (char_length(agent_relation) <= 50), reason text check (char_length(reason) <= 500),
  explainer_name text check (char_length(explainer_name) <= 60),
  signature text check (signature is null or (signature like 'data:image/png;base64,%' and char_length(signature) <= 300000)),
  signed_on date, memo text check (char_length(memo) <= 500),
  signed_at timestamptz not null default now(), recorded_by uuid default auth.uid());
create index if not exists leo_doc_log_pd on public.leo_doc_log(party_id, doc_code);

do $$ declare t text; begin
  foreach t in array array['leo_doc_type','leo_doc_party','leo_doc_links','leo_doc_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_r', t);
    execute format($p$create policy %I on public.%I for select to authenticated using (public.can_manage_for('レオ'))$p$, t||'_r', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke insert, update, delete on public.%I from authenticated', t);
  end loop;
end $$;
grant select on public.leo_doc_type, public.leo_doc_party, public.leo_doc_links, public.leo_doc_log to authenticated;
revoke truncate, references, trigger on public.leo_doc_type, public.leo_doc_party, public.leo_doc_links, public.leo_doc_log from authenticated;

drop policy if exists leo_doc_type_u on public.leo_doc_type;
create policy leo_doc_type_u on public.leo_doc_type for update to authenticated using (public.can_manage_for('レオ')) with check (public.can_manage_for('レオ'));
grant update (body, version, updated_at) on public.leo_doc_type to authenticated;

create or replace function public.leo_wareki(p date)
returns text language sql immutable as $$
  select case when p is null then '　　年　　月　　日'
    else '令和' || (extract(year from p)::int - 2018)::text || '年' || extract(month from p)::int || '月' || extract(day from p)::int || '日'
  end
$$;
revoke all on function public.leo_wareki(date) from public;
grant execute on function public.leo_wareki(date) to authenticated;

create or replace function public.leo_doc_fill(p_body text, p_child text, p_guardian text, p_relation text, p_address text, p_start date, p_end date, p_explainer text, p_sign_date date, p_explain_date date)
returns text language sql immutable as $$
  select replace(replace(replace(replace(replace(replace(replace(replace(replace(coalesce(p_body,''),
    '{保護者}', coalesce(nullif(p_guardian,''),'＿＿＿＿＿＿')),
    '{児童}', coalesce(nullif(p_child,''),'＿＿＿＿＿＿')),
    '{契約開始}', public.leo_wareki(p_start)),
    '{契約終了}', public.leo_wareki(p_end)),
    '{契約締結日}', public.leo_wareki(p_sign_date)),
    '{説明日}', public.leo_wareki(p_explain_date)),
    '{説明職員}', coalesce(nullif(p_explainer,''),'＿＿＿＿＿＿')),
    '{保護者住所}', coalesce(nullif(p_address,''),'＿＿＿＿＿＿＿＿＿＿')),
    '{続柄}', coalesce(nullif(p_relation,''),'＿＿＿＿'))
$$;
revoke all on function public.leo_doc_fill from public;
grant execute on function public.leo_doc_fill to authenticated;

create or replace function public.leo_doc_issue(p_child_name text, p_guardian_name text, p_docs text[], p_explainer text, p_guardian_relation text default null, p_guardian_address text default null, p_contract_start date default null, p_contract_end date default null)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare t text; d text; cn text := nullif(trim(coalesce(p_child_name,'')),''); gn text := nullif(trim(coalesce(p_guardian_name,'')),''); ex text := nullif(trim(coalesce(p_explainer,'')),'');
  rel text := nullif(trim(coalesce(p_guardian_relation,'')),''); addr text := nullif(trim(coalesce(p_guardian_address,'')),''); pid bigint;
begin
  if not coalesce(public.can_manage_for('レオ'), false) then raise exception '児発管・事務・管理者のみ'; end if;
  if cn is null or gn is null or ex is null or p_docs is null or cardinality(p_docs) = 0 then raise exception '児童名・保護者名・書類と説明職員を指定してください'; end if;
  if char_length(cn) > 80 or char_length(gn) > 100 or char_length(ex) > 60 then raise exception '氏名が長すぎます'; end if;
  if rel is not null and char_length(rel) > 50 then raise exception '続柄が長すぎます'; end if;
  if addr is not null and char_length(addr) > 200 then raise exception '住所が長すぎます'; end if;
  foreach d in array p_docs loop
    if not exists (select 1 from leo_doc_type where code = d and body <> '') then raise exception '本文が未登録です: %', d; end if;
  end loop;
  insert into leo_doc_party(child_name, guardian_name, guardian_relation, guardian_address, contract_start, contract_end)
    values (cn, gn, rel, addr, p_contract_start, p_contract_end)
    on conflict (child_name) do update set
      guardian_name = excluded.guardian_name,
      guardian_relation = coalesce(excluded.guardian_relation, leo_doc_party.guardian_relation),
      guardian_address = coalesce(excluded.guardian_address, leo_doc_party.guardian_address),
      contract_start = coalesce(excluded.contract_start, leo_doc_party.contract_start),
      contract_end = coalesce(excluded.contract_end, leo_doc_party.contract_end),
      updated_at = now()
    returning id into pid;
  update leo_doc_links set expires_at = now() where party_id = pid and used_at is null and expires_at > now();
  t := encode(gen_random_bytes(24), 'hex');
  insert into leo_doc_links(token, party_id, docs, explainer_name) values (t, pid, p_docs, ex);
  return t;
end $$;
revoke all on function public.leo_doc_issue from public; revoke execute on function public.leo_doc_issue from anon;
grant execute on function public.leo_doc_issue to authenticated;

create or replace function public.leo_doc_get(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'child', p.child_name, 'guardian', p.guardian_name, 'relation', p.guardian_relation, 'address', p.guardian_address,
    'contract_start', p.contract_start, 'contract_end', p.contract_end,
    'explainer', l.explainer_name, 'expires_at', l.expires_at,
    'docs', (select jsonb_agg(jsonb_build_object('code', t.code, 'label', t.label, 'version', t.version,
        'body', public.leo_doc_fill(t.body, p.child_name, p.guardian_name, p.guardian_relation, p.guardian_address, p.contract_start, p.contract_end, l.explainer_name, p.contract_start, (now() at time zone 'Asia/Tokyo')::date)
      ) order by t.sort)
      from leo_doc_type t where t.code = any(l.docs)))
  from leo_doc_links l join leo_doc_party p on p.id = l.party_id
  where l.token = p_token and length(p_token) = 48 and l.used_at is null and l.expires_at > now()
$$;
revoke all on function public.leo_doc_get from public;
grant execute on function public.leo_doc_get to anon, authenticated;

create or replace function public.leo_doc_submit(p_token text, p_docs text[], p_method text, p_signature text, p_agent_name text, p_agent_relation text, p_reason text)
returns int language plpgsql security definer set search_path = public as $$
declare l leo_doc_links; n int := 0; d text; t leo_doc_type; an text := nullif(trim(coalesce(p_agent_name,'')),''); ar text := nullif(trim(coalesce(p_agent_relation,'')),''); rs text := nullif(trim(coalesce(p_reason,'')),'');
begin
  if p_method not in ('保護者','ご家族','署名困難','あとで署名') then raise exception '署名方法が正しくありません'; end if;
  if p_docs is null or cardinality(p_docs) = 0 then raise exception '書類を選んでください'; end if;
  if p_method in ('保護者','ご家族') and (p_signature is null or p_signature not like 'data:image/png;base64,%' or char_length(p_signature) > 300000) then raise exception '署名が正しくありません'; end if;
  if p_method = 'ご家族' and (an is null or ar is null) then raise exception '署名される方の氏名と続柄を入れてください'; end if;
  if p_method = '署名困難' and rs is null then raise exception '理由を入れてください'; end if;
  select * into l from leo_doc_links where token = p_token and length(p_token) = 48 for update;
  if not found or l.used_at is not null or l.expires_at <= now() then raise exception 'リンクが正しくないか、期限切れ・使用済みです'; end if;
  foreach d in array p_docs loop
    if d = any(l.docs) then
      select * into t from leo_doc_type where code = d;
      insert into leo_doc_log(party_id, doc_code, version, token, method, agent_name, agent_relation, reason, explainer_name, signature, signed_on)
        values (l.party_id, d, t.version, p_token, p_method,
          case when p_method='ご家族' then an end, case when p_method='ご家族' then ar end, case when p_method='署名困難' then rs end,
          l.explainer_name, case when p_method in ('保護者','ご家族') then p_signature end,
          case when p_method <> 'あとで署名' then (now() at time zone 'Asia/Tokyo')::date end);
      if p_method <> 'あとで署名' and d = 'keiyaku' then
        update leo_doc_party set contract_start = coalesce(contract_start, (now() at time zone 'Asia/Tokyo')::date), updated_at = now() where id = l.party_id;
      end if;
      n := n + 1;
    end if;
  end loop;
  if n = 0 then raise exception '署名できる書類がありません'; end if;
  if p_method <> 'あとで署名' then update leo_doc_links set used_at = now() where token = p_token; end if;
  return n;
end $$;
revoke all on function public.leo_doc_submit from public;
grant execute on function public.leo_doc_submit to anon, authenticated;

create or replace function public.leo_doc_mark_paper(p_party_id bigint, p_doc text, p_signed_on date, p_memo text)
returns void language plpgsql security definer set search_path = public as $$
declare t leo_doc_type;
begin
  if not coalesce(public.can_manage_for('レオ'), false) then raise exception '児発管・事務・管理者のみ'; end if;
  select * into t from leo_doc_type where code = p_doc; if not found then raise exception '書類が正しくありません'; end if;
  if p_signed_on is null then raise exception '署名日を入れてください'; end if;
  if not exists (select 1 from leo_doc_party where id = p_party_id) then raise exception '対象が見つかりません'; end if;
  insert into leo_doc_log(party_id, doc_code, version, method, signed_on, memo)
    values (p_party_id, p_doc, t.version, '紙で署名済み', p_signed_on, nullif(trim(coalesce(p_memo,'')),''));
  if p_doc = 'keiyaku' then update leo_doc_party set contract_start = coalesce(contract_start, p_signed_on), updated_at = now() where id = p_party_id; end if;
end $$;
revoke all on function public.leo_doc_mark_paper from public; revoke execute on function public.leo_doc_mark_paper from anon;
grant execute on function public.leo_doc_mark_paper to authenticated;
