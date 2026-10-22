-- 金斗雲 書類：自宅住所の利用者（住所区分「自宅」）は、本人用に作ったDrive版を本文（variant = 'u'||利用者id）として使う。
alter table public.kin_user drop constraint if exists kin_user_address_class_check;
alter table public.kin_user add constraint kin_user_address_class_check check (address_class in ('59-4','715-5','自宅'));
alter table public.kin_doc_body drop constraint if exists kin_doc_body_variant_check;
alter table public.kin_doc_body add constraint kin_doc_body_variant_check check (variant in ('59-4','715-5') or variant ~ '^u[0-9]+$');
create or replace function public.kin_doc_variant(p_user_id bigint) returns text language sql stable security definer set search_path = public as $$
  select case when address_class = '自宅' then 'u' || id else address_class end from kin_user where id = p_user_id $$;
revoke all on function public.kin_doc_variant from public; grant execute on function public.kin_doc_variant to authenticated;

create or replace function public.kin_doc_issue(p_user_id bigint, p_docs text[], p_explainer text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare t text; d text; cls text;
begin
  if not coalesce(public.my_office() = '金斗雲' or public.can_manage(), false) then raise exception '金斗雲職員のみ'; end if;
  cls := public.kin_doc_variant(p_user_id);
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

create or replace function public.kin_doc_get(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', u.name, 'explainer', l.explainer_name, 'expires_at', l.expires_at,
    'docs', (select jsonb_agg(jsonb_build_object('code', t.code, 'label', t.label, 'version', t.version,
        'pages', (select jsonb_agg(jsonb_build_object('n', b.page_no, 'image', b.image, 'text', b.page_text) order by b.page_no)
                  from kin_doc_body b where b.doc_code = t.code and b.variant = public.kin_doc_variant(u.id) and b.version = t.version)) order by t.sort)
      from kin_doc_type t where t.code = any(l.docs)))
  from kin_doc_links l join kin_user u on u.id = l.user_id
  where l.token = p_token and length(p_token) = 48 and l.used_at is null and l.expires_at > now() and u.address_class is not null
$$;
revoke all on function public.kin_doc_get from public;
grant execute on function public.kin_doc_get to anon, authenticated;

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
  cls := public.kin_doc_variant(l.user_id);
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

