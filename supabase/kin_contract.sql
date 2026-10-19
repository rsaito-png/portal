-- 金斗雲 書類（利用契約書・重要事項説明書・計画書）の本文保管と署名。本文はDriveの既存PDFを転用（ページ画像＋テキスト、Google非依存）。
-- 書類の種類は kin_doc_type に行を足せば増やせる。署名は追記専用ログ kin_doc_log。匿名はトークン付きRPCのみ（1週間・1回限り）。
alter table public.kin_user add column if not exists address_class text check (address_class in ('59-4','715-5')); -- 住所区分（本文の事業所住所が変わる）。未確定は空欄
create table if not exists public.kin_doc_type (
  code text primary key, label text not null, version text not null default 'R8.10', sign_in_portal boolean not null default true, sort int not null default 0, memo text);
insert into public.kin_doc_type(code,label,version,sign_in_portal,sort,memo) values
 ('keikaku','居宅介護計画書','R8.10',false,1,'本文はkin_plan、同意は #kintoun/consent（kin_consent）。ここでは状況の表示のみ'),
 ('keiyaku','利用契約書','R8.10',true,2,'Drive「【居宅介護】契約書(59-4/715-5)」を転用'),
 ('juyo','重要事項説明書','R8.10',true,3,'Drive「R8.10重要事項説明書(59-4/715-5).pdf」を転用')
 on conflict (code) do nothing;
create table if not exists public.kin_doc_body (
  id bigint generated always as identity primary key,
  doc_code text not null references public.kin_doc_type(code), variant text not null check (variant in ('59-4','715-5')), version text not null default 'R8.10',
  page_no int not null, image text not null check (image like 'data:image/jpeg;base64,%'), page_text text, source_url text,
  unique (doc_code, variant, version, page_no));
create table if not exists public.kin_doc_links (
  token text primary key check (token ~ '^[0-9a-f]{48}$'),
  user_id bigint not null references public.kin_user(id) on delete cascade,
  docs text[] not null, explainer_name text not null check (char_length(explainer_name) between 1 and 60),
  created_at timestamptz not null default now(), created_by uuid default auth.uid(),
  expires_at timestamptz not null default now() + interval '7 days', used_at timestamptz);
create table if not exists public.kin_doc_log ( -- 追記専用
  id bigint generated always as identity primary key,
  user_id bigint not null references public.kin_user(id), doc_code text not null references public.kin_doc_type(code), version text not null, variant text,
  token text references public.kin_doc_links(token),
  method text not null check (method in ('本人','ご家族','署名困難','あとで署名','紙で署名済み')),
  agent_name text check (char_length(agent_name) <= 100), agent_relation text check (char_length(agent_relation) <= 50), reason text check (char_length(reason) <= 500),
  explainer_name text check (char_length(explainer_name) <= 60),
  signature text check (signature is null or (signature like 'data:image/png;base64,%' and char_length(signature) <= 300000)),
  signed_on date, memo text check (char_length(memo) <= 500),
  signed_at timestamptz not null default now(), recorded_by uuid default auth.uid());
create index if not exists kin_doc_log_ud on public.kin_doc_log(user_id, doc_code);
do $$ declare t text; begin
  foreach t in array array['kin_doc_type','kin_doc_body','kin_doc_links','kin_doc_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_r', t);
    execute format($p$create policy %I on public.%I for select to authenticated using (public.my_office() = '金斗雲' or public.can_manage())$p$, t||'_r', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke insert, update, delete on public.%I from authenticated', t);
  end loop; end $$;

-- 職員：署名リンク発行（住所区分が空の利用者・本文未登録の書類は拒否。古い未使用リンクは失効）
create or replace function public.kin_doc_issue(p_user_id bigint, p_docs text[], p_explainer text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare t text; d text; cls text;
begin
  if not coalesce(public.my_office() = '金斗雲' or public.can_manage(), false) then raise exception '金斗雲職員のみ'; end if;
  select address_class into cls from kin_user where id = p_user_id;
  if cls is null then raise exception '住所区分が未設定です（台帳で設定してください）'; end if;
  if p_docs is null or cardinality(p_docs) = 0 or nullif(trim(coalesce(p_explainer,'')),'') is null then raise exception '書類と説明職員を指定してください'; end if;
  foreach d in array p_docs loop
    if not exists (select 1 from kin_doc_type where code = d and sign_in_portal) then raise exception '署名できない書類です: %', d; end if;
    if not exists (select 1 from kin_doc_body where doc_code = d and variant = cls) then raise exception '本文が未登録です: %', d; end if;
  end loop;
  update kin_doc_links set expires_at = now() where user_id = p_user_id and used_at is null and expires_at > now();
  t := encode(gen_random_bytes(24), 'hex');
  insert into kin_doc_links(token, user_id, docs, explainer_name) values (t, p_user_id, p_docs, trim(p_explainer));
  return t;
end $$;
revoke all on function public.kin_doc_issue from public; revoke execute on function public.kin_doc_issue from anon;
grant execute on function public.kin_doc_issue to authenticated;

-- 本人：トークンで本文（ページ画像・テキスト）を取得
create or replace function public.kin_doc_get(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', u.name, 'explainer', l.explainer_name, 'expires_at', l.expires_at,
    'docs', (select jsonb_agg(jsonb_build_object('code', t.code, 'label', t.label, 'version', t.version,
        'pages', (select jsonb_agg(jsonb_build_object('n', b.page_no, 'image', b.image, 'text', b.page_text) order by b.page_no)
                  from kin_doc_body b where b.doc_code = t.code and b.variant = u.address_class and b.version = t.version)) order by t.sort)
      from kin_doc_type t where t.code = any(l.docs)))
  from kin_doc_links l join kin_user u on u.id = l.user_id
  where l.token = p_token and length(p_token) = 48 and l.used_at is null and l.expires_at > now() and u.address_class is not null
$$;
revoke all on function public.kin_doc_get from public;
grant execute on function public.kin_doc_get to anon, authenticated;

-- 本人：選んだ書類にまとめて署名（本人／ご家族＝代理人(氏名・続柄)／署名困難(理由)／あとで署名）。契約書は署名日を契約開始日(空の場合)に反映
create or replace function public.kin_doc_submit(p_token text, p_docs text[], p_method text, p_signature text, p_agent_name text, p_agent_relation text, p_reason text)
returns int language plpgsql security definer set search_path = public as $$
declare l kin_doc_links; n int := 0; d text; t kin_doc_type; cls text; an text := nullif(trim(coalesce(p_agent_name,'')),''); ar text := nullif(trim(coalesce(p_agent_relation,'')),''); rs text := nullif(trim(coalesce(p_reason,'')),'');
begin
  if p_method not in ('本人','ご家族','署名困難','あとで署名') then raise exception '署名方法が正しくありません'; end if;
  if p_docs is null or cardinality(p_docs) = 0 then raise exception '書類を選んでください'; end if;
  if p_method in ('本人','ご家族') and (p_signature is null or p_signature not like 'data:image/png;base64,%' or char_length(p_signature) > 300000) then raise exception '署名が正しくありません'; end if;
  if p_method = 'ご家族' and (an is null or ar is null) then raise exception '署名される方の氏名と続柄を入れてください'; end if;
  if p_method = '署名困難' and rs is null then raise exception '理由を入れてください'; end if;
  select * into l from kin_doc_links where token = p_token and length(p_token) = 48 for update;
  if not found or l.used_at is not null or l.expires_at <= now() then raise exception 'リンクが正しくないか、期限切れ・使用済みです'; end if;
  select address_class into cls from kin_user where id = l.user_id;
  foreach d in array p_docs loop
    if d = any(l.docs) then
      select * into t from kin_doc_type where code = d;
      insert into kin_doc_log(user_id, doc_code, version, variant, token, method, agent_name, agent_relation, reason, explainer_name, signature)
        values (l.user_id, d, t.version, cls, p_token, p_method, case when p_method='ご家族' then an end, case when p_method='ご家族' then ar end, case when p_method='署名困難' then rs end, l.explainer_name, case when p_method in ('本人','ご家族') then p_signature end);
      if p_method <> 'あとで署名' and d = 'keiyaku' then
        update kin_user set contract_start = (now() at time zone 'Asia/Tokyo')::date, updated_at = now() where id = l.user_id and contract_start is null;
      end if;
      n := n + 1;
    end if;
  end loop;
  if n = 0 then raise exception '署名できる書類がありません'; end if;
  if p_method <> 'あとで署名' then update kin_doc_links set used_at = now() where token = p_token; end if;
  return n;
end $$;
revoke all on function public.kin_doc_submit from public;
grant execute on function public.kin_doc_submit to anon, authenticated;

-- 職員：紙で署名済みの書類を確認して記録（自動では署名済みにしない。確認した職員が明示的に押す）
create or replace function public.kin_doc_mark_paper(p_user_id bigint, p_doc text, p_signed_on date, p_memo text)
returns void language plpgsql security definer set search_path = public as $$
declare t kin_doc_type;
begin
  if not coalesce(public.my_office() = '金斗雲' or public.can_manage(), false) then raise exception '金斗雲職員のみ'; end if;
  select * into t from kin_doc_type where code = p_doc and sign_in_portal; if not found then raise exception '書類が正しくありません'; end if;
  if p_signed_on is null then raise exception '署名日を入れてください'; end if;
  insert into kin_doc_log(user_id, doc_code, version, variant, method, signed_on, memo, explainer_name)
    values (p_user_id, p_doc, t.version, (select address_class from kin_user where id = p_user_id), '紙で署名済み', p_signed_on, nullif(trim(coalesce(p_memo,'')),''), null);
  if p_doc = 'keiyaku' then update kin_user set contract_start = p_signed_on, updated_at = now() where id = p_user_id and contract_start is null; end if;
end $$;
revoke all on function public.kin_doc_mark_paper from public; revoke execute on function public.kin_doc_mark_paper from anon;
grant execute on function public.kin_doc_mark_paper to authenticated;
