-- 書類の控え（docs.html?t=…）：利用者本人・保護者が、署名・同意済みの契約書・重要事項説明書・個別支援計画（レオ本案／金斗雲 居宅介護計画）をいつでも見返せる。
-- 閲覧専用トークン：ログインなし・期限なし・何度でも使える。児童（レオ）／利用者（金斗雲）ごとに1つだけ有効。再発行すると古いものは使えなくなる。
-- 書類は複製しない：既存の署名記録（leo_doc_log / leo_plan_consents / kin_doc_log / kin_consent）と本文（leo_doc_type / leo_plans / kin_doc_body / kin_plan）を参照する。
-- 名前の空白（半角・全角）を無視して比べる
create or replace function public.dv_key(p text) returns text language sql immutable as $$ select regexp_replace(coalesce(p,''), '[\s　]', '', 'g') $$;

create table if not exists public.doc_view_tokens (
  token text primary key check (token ~ '^[0-9a-f]{48}$'),
  office text not null check (office in ('レオ','金斗雲')),
  child_name text,                                   -- レオ：児童名（leo_children.name）
  kin_user_id bigint references public.kin_user(id), -- 金斗雲：利用者
  created_at timestamptz not null default now(), created_by uuid default auth.uid(),
  revoked_at timestamptz,
  check ((office = 'レオ' and child_name is not null and kin_user_id is null) or (office = '金斗雲' and kin_user_id is not null and child_name is null)));
create unique index if not exists doc_view_tokens_leo_active on public.doc_view_tokens (public.dv_key(child_name)) where office = 'レオ' and revoked_at is null;
create unique index if not exists doc_view_tokens_kin_active on public.doc_view_tokens (kin_user_id) where office = '金斗雲' and revoked_at is null;
alter table public.doc_view_tokens enable row level security;  -- ポリシーなし＝直接は誰も読めない（RPCだけ）
revoke all on public.doc_view_tokens from anon, authenticated;


-- 発行できる人：署名リンクを出せる人と同じ（レオ＝児発管・管理者（レオ）・事務、金斗雲＝金斗雲職員・児発管・管理者・事務）＋会長。DBから直接（service_role / 管理API）も可
create or replace function public.dv_can(p_office text) returns boolean language sql stable security definer set search_path = public as $$
  select auth.role() is null or auth.role() = 'service_role' or coalesce(public.is_chair(), false) or case p_office
    when 'レオ' then coalesce(public.can_manage_for('レオ'), false)
    when '金斗雲' then coalesce(public.my_office() = '金斗雲' or public.can_manage(), false)
    else false end $$;

-- 職員：今の控えリンク一覧（レオ＝児童名、金斗雲＝利用者id）
create or replace function public.doc_view_list(p_office text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.dv_can(p_office) then raise exception '権限がありません'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('child', child_name, 'user_id', kin_user_id, 'token', token, 'created_at', created_at) order by created_at)
    from doc_view_tokens where office = p_office and revoked_at is null), '[]'::jsonb);
end $$;

-- 職員：控えリンクを出す。p_new=true で再発行（古いリンクは使えなくなる）。すでにあれば同じものを返す
create or replace function public.doc_view_issue(p_office text, p_child text default null, p_user_id bigint default null, p_new boolean default false)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare t text; cn text := nullif(btrim(coalesce(p_child,'')),'');
begin
  if not public.dv_can(p_office) then raise exception '権限がありません'; end if;
  if p_office = 'レオ' then
    if cn is null then raise exception '児童名を指定してください'; end if;
    select coalesce((select name from leo_children where public.dv_key(name) = public.dv_key(cn) limit 1), (select child_name from leo_doc_party where public.dv_key(child_name) = public.dv_key(cn) limit 1)) into cn;
    if cn is null then raise exception '児童が見つかりません'; end if;
    if not p_new then select token into t from doc_view_tokens where office = 'レオ' and revoked_at is null and public.dv_key(child_name) = public.dv_key(cn); end if;
    if t is null then
      update doc_view_tokens set revoked_at = now() where office = 'レオ' and revoked_at is null and public.dv_key(child_name) = public.dv_key(cn);
      t := encode(gen_random_bytes(24), 'hex');
      insert into doc_view_tokens(token, office, child_name) values (t, 'レオ', cn);
    end if;
  elsif p_office = '金斗雲' then
    if not exists (select 1 from kin_user where id = p_user_id) then raise exception '利用者が見つかりません'; end if;
    if not p_new then select token into t from doc_view_tokens where office = '金斗雲' and revoked_at is null and kin_user_id = p_user_id; end if;
    if t is null then
      update doc_view_tokens set revoked_at = now() where office = '金斗雲' and revoked_at is null and kin_user_id = p_user_id;
      t := encode(gen_random_bytes(24), 'hex');
      insert into doc_view_tokens(token, office, kin_user_id) values (t, '金斗雲', p_user_id);
    end if;
  else raise exception '事業所が正しくありません'; end if;
  return t;
end $$;

-- 本人・保護者：トークン → その人の書類だけ（金斗雲の書類本文は画像が重いので、ページは doc_view_pages で開いたときに読む）
create or replace function public.doc_view_get(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v doc_view_tokens; r jsonb; pty leo_doc_party; u kin_user; gname text;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{48}$' then return null; end if;
  select * into v from doc_view_tokens where token = p_token and revoked_at is null;
  if not found then return null; end if;
  if v.office = 'レオ' then
    select * into pty from leo_doc_party where public.dv_key(child_name) = public.dv_key(v.child_name) order by id limit 1;
    gname := coalesce(pty.guardian_name, (select guardian_name from leo_child_info where public.dv_key(name) = public.dv_key(v.child_name) limit 1));
    r := jsonb_build_object('office', 'レオ', 'name', v.child_name, 'guardian', gname,
      'contract_start', pty.contract_start, 'contract_end', pty.contract_end,
      'docs', coalesce((select jsonb_agg(d order by d->>'sort') from (
        select jsonb_build_object('code', t.code, 'label', t.label, 'sort', lpad(t.sort::text, 4, '0'),
          'status', case when l.id is not null then 'signed' else 'pending' end,
          'version', coalesce(l.version, t.version), 'current_version', t.version,
          'signed_on', coalesce(l.signed_on, (l.signed_at at time zone 'Asia/Tokyo')::date), 'method', l.method,
          'signer', case l.method when '保護者' then pty.guardian_name when 'ご家族' then l.agent_name else null end,
          'relation', case l.method when '保護者' then pty.guardian_relation when 'ご家族' then l.agent_relation else null end,
          'reason', l.reason, 'explainer', l.explainer_name, 'signature', l.signature,
          'body', case when l.id is not null and l.version = t.version then public.leo_doc_fill(t.body, pty.child_name, pty.guardian_name, coalesce(l.agent_relation, pty.guardian_relation), pty.guardian_address, pty.contract_start, pty.contract_end, l.explainer_name, coalesce(l.signed_on, (l.signed_at at time zone 'Asia/Tokyo')::date), coalesce(l.signed_on, (l.signed_at at time zone 'Asia/Tokyo')::date)) end) d
        from leo_doc_type t
        left join lateral (select * from leo_doc_log x where x.party_id = pty.id and x.doc_code = t.code and x.method <> 'あとで署名' order by x.signed_at desc limit 1) l on true
        where pty.id is not null and (l.id is not null
          or exists (select 1 from leo_doc_log x where x.party_id = pty.id and x.doc_code = t.code)
          or exists (select 1 from leo_doc_links k where k.party_id = pty.id and t.code = any(k.docs) and k.used_at is null and k.expires_at > now()))) q), '[]'::jsonb),
      'plans', coalesce((select jsonb_agg(pl order by (pl->>'term_no')::int desc) from (
        select jsonb_build_object('term_no', p.term_no, 'title', '第' || p.term_no || '期 個別支援計画（本案）', 'start', p.start_on, 'end', p.end_on,
          'status', st, 'version', '第' || p.term_no || '期',
          'consented_at', case when st = 'signed' then coalesce(c.consented_at, p.honan_consent_at) end,
          'signer', case when st = 'signed' then coalesce(c.parent_name, gname) end,
          'via', case when st = 'signed' then case when c.id is not null then 'リンクで同意' else '同意済み' end end,
          'text', case when st in ('signed','legacy') and public.leo_plan_text_ok(coalesce(c.text_snapshot, p.honan)) then coalesce(c.text_snapshot, p.honan) end) pl
        from leo_plans p
        left join lateral (select * from leo_plan_consents x where x.plan_id = p.id and x.doc = '本案' order by x.consented_at desc nulls last, x.id desc limit 1) c on true
        cross join lateral (select case
          when p.honan_consent_at is not null then 'signed'
          when exists (select 1 from leo_plan_consent_links k where k.plan_id = p.id and k.used_at is null and k.expires_at > now()) then 'pending'
          when p.imported_from is not null and p.imported_from not like 'bot:%' and length(btrim(coalesce(p.honan,''))) > 0 then 'legacy'
          when length(btrim(coalesce(p.honan,''))) > 0 or p.genan_consent_at is not null then 'pending'
          else null end st) s
        where public.dv_key(p.child) = public.dv_key(v.child_name) and s.st is not null) q2), '[]'::jsonb));
  else
    select * into u from kin_user where id = v.kin_user_id;
    if not found then return null; end if;
    r := jsonb_build_object('office', '金斗雲', 'name', u.name, 'contract_start', u.contract_start,
      'docs', coalesce((select jsonb_agg(d order by d->>'sort') from (
        select jsonb_build_object('code', t.code, 'label', t.label, 'sort', lpad(t.sort::text, 4, '0'),
          'status', case when l.id is not null then 'signed' else 'pending' end,
          'version', coalesce(l.version, t.version),
          'signed_on', coalesce(l.signed_on, (l.signed_at at time zone 'Asia/Tokyo')::date), 'method', l.method,
          'signer', case l.method when '本人' then u.name when 'ご家族' then l.agent_name else null end,
          'relation', case l.method when 'ご家族' then l.agent_relation else null end,
          'reason', l.reason, 'explainer', l.explainer_name, 'signature', l.signature,
          'pages_n', case when l.id is not null then (select count(*) from kin_doc_body b where b.doc_code = t.code and b.variant = l.variant and b.version = l.version) end) d
        from kin_doc_type t
        left join lateral (select * from kin_doc_log x where x.user_id = u.id and x.doc_code = t.code and x.method <> 'あとで署名' order by x.signed_at desc limit 1) l on true
        where t.sign_in_portal and (l.id is not null
          or exists (select 1 from kin_doc_log x where x.user_id = u.id and x.doc_code = t.code)
          or exists (select 1 from kin_doc_links k where k.user_id = u.id and t.code = any(k.docs) and k.used_at is null and k.expires_at > now()))) q), '[]'::jsonb),
      'plans', coalesce((select jsonb_agg(pl order by (pl->>'v')::int desc) from (
        select jsonb_build_object('v', p.version, 'title', '居宅介護計画書', 'term', p.term, 'period', p.period, 'version', '版 ' || p.version,
          'status', case when c.id is not null then 'signed' when p.version = (select max(version) from kin_plan z where z.user_name = p.user_name) then 'pending' else 'legacy' end,
          'consented_at', c.consented_at, 'signer', case when c.id is null then null when c.writer = '代理人' then c.proxy_name else u.name end,
          'relation', case when c.writer = '代理人' then c.proxy_relation end, 'explainer', c.explained_by_name,
          'via', case when c.id is null then null when c.via = 'リンク' then 'リンクで同意' else '事業所で同意' end, 'signature', c.signature,
          'text', case when c.id is not null or p.version <> (select max(version) from kin_plan z where z.user_name = p.user_name) then p.body end) pl
        from kin_plan p
        left join lateral (select * from kin_consent x where x.user_name = p.user_name and x.version = p.version order by x.consented_at desc limit 1) c on true
        where p.user_name = u.name) q2), '[]'::jsonb));
  end if;
  return r;
end $$;

-- 金斗雲の書類本文（署名した版・住所区分のページ画像）
create or replace function public.doc_view_pages(p_token text, p_code text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('n', b.page_no, 'image', b.image) order by b.page_no), '[]'::jsonb)
  from doc_view_tokens v
  join lateral (select * from kin_doc_log x where x.user_id = v.kin_user_id and x.doc_code = p_code and x.method <> 'あとで署名' order by x.signed_at desc limit 1) l on true
  join kin_doc_body b on b.doc_code = l.doc_code and b.variant = l.variant and b.version = l.version
  where v.token = p_token and p_token ~ '^[0-9a-f]{48}$' and v.revoked_at is null and v.office = '金斗雲' $$;

-- 署名ページの送信後：その署名リンクの人に控えリンクがあれば返す（なければ null）。使ってから1日以内か、期限内のリンクだけ
create or replace function public.doc_view_from_sign(p_kind text, p_token text)
returns text language sql stable security definer set search_path = public as $$
  select v.token from doc_view_tokens v
  where v.revoked_at is null and p_token ~ '^[0-9a-f]{48}$' and case p_kind
    when 'leo_doc' then v.office = 'レオ' and exists (select 1 from leo_doc_links l join leo_doc_party p on p.id = l.party_id where l.token = p_token and (l.expires_at > now() or l.used_at > now() - interval '1 day') and public.dv_key(p.child_name) = public.dv_key(v.child_name))
    when 'leo_doui' then v.office = 'レオ' and exists (select 1 from leo_plan_consent_links l join leo_plans p on p.id = l.plan_id where l.token = p_token and (l.expires_at > now() or l.used_at > now() - interval '1 day') and public.dv_key(p.child) = public.dv_key(v.child_name))
    when 'kin_doc' then v.office = '金斗雲' and exists (select 1 from kin_doc_links l where l.token = p_token and (l.expires_at > now() or l.used_at > now() - interval '1 day') and l.user_id = v.kin_user_id)
    when 'kin_consent' then v.office = '金斗雲' and exists (select 1 from kin_consent_links l where l.token = p_token and (l.expires_at > now() or l.used_at > now() - interval '1 day') and l.user_id = v.kin_user_id)
    else false end
  limit 1 $$;

revoke all on function public.dv_can(text) from public, anon;
revoke all on function public.doc_view_list(text) from public, anon;
revoke all on function public.doc_view_issue(text, text, bigint, boolean) from public, anon;
revoke all on function public.doc_view_get(text) from public;
revoke all on function public.doc_view_pages(text, text) from public;
revoke all on function public.doc_view_from_sign(text, text) from public;
grant execute on function public.dv_can(text) to authenticated;
grant execute on function public.doc_view_list(text) to authenticated;
grant execute on function public.doc_view_issue(text, text, bigint, boolean) to authenticated;
grant execute on function public.doc_view_get(text) to anon, authenticated;
grant execute on function public.doc_view_pages(text, text) to anon, authenticated;
grant execute on function public.doc_view_from_sign(text, text) to anon, authenticated;
