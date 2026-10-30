-- 水晶玉：基本情報シートを sui_plan に追加し、モニタリング・基本情報も電子署名の対象にする
alter table sui_plan drop constraint if exists sui_plan_plan_type_check;
alter table sui_plan add constraint sui_plan_plan_type_check check (plan_type in ('計画1','計画2','モニタリング','基本情報'));
drop table if exists sui_basic;
alter table sui_request add column if not exists made jsonb;
CREATE OR REPLACE FUNCTION public.sui_sign_issue(p_plan_id bigint, p_explainer text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare t text; p sui_plan;
begin
  if not coalesce(public.my_office() = '水晶玉' or public.can_manage(), false) then raise exception '水晶玉の職員のみ'; end if;
  select * into p from sui_plan where id = p_plan_id; if not found then raise exception '計画がありません'; end if;
  if false then raise exception '署名の対象がありません'; end if;
  if p.status <> '確定' then raise exception '確定した版だけ署名リンクを出せます'; end if;
  if nullif(trim(coalesce(p_explainer,'')),'') is null then raise exception '説明職員を入れてください'; end if;
  update sui_sign_links set expires_at = now() where plan_id = p_plan_id and used_at is null and expires_at > now();
  t := encode(gen_random_bytes(24), 'hex'); insert into sui_sign_links(token, plan_id, explainer_name) values (t, p_plan_id, trim(p_explainer)); return t;
end $function$;
CREATE OR REPLACE FUNCTION public.sui_sign_mark_paper(p_plan_id bigint, p_signed_on date, p_memo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not coalesce(public.my_office() = '水晶玉' or public.can_manage(), false) then raise exception '水晶玉の職員のみ'; end if;
  if p_signed_on is null then raise exception '署名日を入れてください'; end if;
  if not exists (select 1 from sui_plan where id = p_plan_id and true) then raise exception '署名の対象がありません'; end if;
  insert into sui_sign_log(plan_id, method, signed_on, memo) values (p_plan_id, '紙で署名済み', p_signed_on, nullif(trim(coalesce(p_memo,'')),''));
  update sui_plan set signed_on = p_signed_on, signer_kind = '紙で署名済み' where id = p_plan_id;
end $function$;
CREATE OR REPLACE FUNCTION public.sui_sign_onsite(p_plan_id bigint, p_method text, p_signature text, p_name text, p_relation text, p_reason text, p_explainer text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare nm text := nullif(trim(coalesce(p_name,'')),''); rl text := nullif(trim(coalesce(p_relation,'')),''); rs text := nullif(trim(coalesce(p_reason,'')),''); kind text; p sui_plan;
begin
  if not coalesce(public.my_office() = '水晶玉' or public.can_manage(), false) then raise exception '水晶玉の職員のみ'; end if;
  if p_method not in ('本人','ご家族','署名困難') then raise exception '署名方法が正しくありません'; end if;
  select * into p from sui_plan where id = p_plan_id; if not found or false then raise exception '署名の対象がありません'; end if;
  if p.status <> '確定' then raise exception '確定した版だけ署名できます'; end if;
  if p_method in ('本人','ご家族') and (p_signature is null or p_signature not like 'data:image/png;base64,%' or char_length(p_signature) > 300000) then raise exception '署名が正しくありません'; end if;
  if p_method = 'ご家族' and (nm is null or rl is null) then raise exception '署名される方の氏名と続柄を入れてください'; end if;
  if p_method = '署名困難' and rs is null then raise exception '理由を入れてください'; end if;
  insert into sui_sign_log(plan_id, method, signer_name, signer_relation, reason, explainer_name, signature, signed_on, memo)
    values (p_plan_id, p_method, case when p_method='ご家族' then nm end, case when p_method='ご家族' then rl end, case when p_method='署名困難' then rs end, nullif(trim(coalesce(p_explainer,'')),''), case when p_method in ('本人','ご家族') then p_signature end, (now() at time zone 'Asia/Tokyo')::date, '面談の場で署名（タブレット）');
  kind := case p_method when 'ご家族' then 'ご家族（' || rl || '）' else p_method end;
  update sui_plan set signed_on = (now() at time zone 'Asia/Tokyo')::date, signer_kind = left(kind, 60) where id = p_plan_id;
end $function$;
CREATE OR REPLACE FUNCTION public.sui_sign_submit(p_token text, p_method text, p_signature text, p_name text, p_relation text, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare l sui_sign_links; nm text := nullif(trim(coalesce(p_name,'')),''); rl text := nullif(trim(coalesce(p_relation,'')),''); rs text := nullif(trim(coalesce(p_reason,'')),''); kind text;
begin
  if p_method not in ('本人','ご家族','署名困難','あとで署名') then raise exception '署名方法が正しくありません'; end if;
  if p_method in ('本人','ご家族') and (p_signature is null or p_signature not like 'data:image/png;base64,%' or char_length(p_signature) > 300000) then raise exception '署名が正しくありません'; end if;
  if p_method = 'ご家族' and (nm is null or rl is null) then raise exception '署名される方の氏名と続柄を入れてください'; end if;
  if p_method = '署名困難' and rs is null then raise exception '理由を入れてください'; end if;
  select * into l from sui_sign_links where token = p_token and length(p_token) = 48 for update;
  if not found or l.used_at is not null or l.expires_at <= now() then raise exception 'リンクが正しくないか、期限切れ・使用済みです'; end if;
  insert into sui_sign_log(plan_id, token, method, signer_name, signer_relation, reason, explainer_name, signature, signed_on)
    values (l.plan_id, p_token, p_method, case when p_method='ご家族' then nm end, case when p_method='ご家族' then rl end, case when p_method='署名困難' then rs end, l.explainer_name, case when p_method in ('本人','ご家族') then p_signature end, (now() at time zone 'Asia/Tokyo')::date);
  if p_method <> 'あとで署名' then
    kind := case p_method when 'ご家族' then 'ご家族（' || rl || '）' else p_method end;
    update sui_plan set signed_on = (now() at time zone 'Asia/Tokyo')::date, signer_kind = left(kind, 60) where id = l.plan_id;
    update sui_sign_links set used_at = now() where token = p_token;
  end if;
end $function$;
