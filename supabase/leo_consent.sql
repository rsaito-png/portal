-- 保護者の同意リンクを拡張：使い捨て・期限・送った本文の写し。同意の記録は書き換え不可
alter table public.leo_plan_consent_links add column if not exists link_id bigint generated always as identity;
alter table public.leo_plan_consent_links add column if not exists expires_at timestamptz not null default now() + interval '30 days';
alter table public.leo_plan_consent_links add column if not exists used_at timestamptz;
alter table public.leo_plan_consent_links add column if not exists sent_at timestamptz not null default now();
alter table public.leo_plan_consent_links add column if not exists text_snapshot text;
alter table public.leo_plan_consent_links drop constraint if exists leo_plan_consent_links_plan_id_doc_key;
create index if not exists lpcl_plan_doc on public.leo_plan_consent_links (plan_id, doc);
alter table public.leo_plan_consents add column if not exists child text, add column if not exists doc text, add column if not exists term_no int, add column if not exists plan_id bigint,
  add column if not exists text_snapshot text, add column if not exists sent_at timestamptz, add column if not exists consented_at timestamptz, add column if not exists link_id bigint;
alter table public.leo_plan_consents alter column parent_name drop not null;
-- 既存データの補完（既存の送付済みリンクは、いまの本文を写しとして保存。同意済みの記録は本文の写しなし）
drop trigger if exists leo_consent_immutable on public.leo_plan_consents;
update public.leo_plan_consent_links l set text_snapshot = case l.doc when '原案' then p.genan else p.honan end from public.leo_plans p where p.id = l.plan_id and l.text_snapshot is null and not exists (select 1 from public.leo_plan_consents c where c.token = l.token);
update public.leo_plan_consents c set child = p.child, doc = l.doc, term_no = p.term_no, plan_id = l.plan_id, sent_at = l.created_at, consented_at = c.submitted_at, link_id = l.link_id
  from public.leo_plan_consent_links l join public.leo_plans p on p.id = l.plan_id where l.token = c.token and c.child is null;
update public.leo_plan_consent_links l set used_at = (select min(submitted_at) from public.leo_plan_consents c where c.token = l.token) where used_at is null and exists (select 1 from public.leo_plan_consents c where c.token = l.token);
create or replace function public.leo_consent_immutable() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then raise exception '同意の記録は書き換えできません'; end if;
  if coalesce(current_setting('leo.purge', true), '') <> '1' then raise exception '同意の記録は削除できません'; end if;
  return old;
end $$;
create trigger leo_consent_immutable before update or delete on public.leo_plan_consents for each row execute function public.leo_consent_immutable();

-- リンク作成（児発管・管理者・事務）。doui＝同じ本文の未使用・期限内リンクがあればそれを返し、なければ古い未使用リンクを失効して新規作成
create or replace function public.leo_make_token_link(p_kind text, p_child text, p_term text, p_plan bigint, p_doc text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare t text; pl record; txt text;
begin
  if not public.can_manage() then raise exception '児発管・管理者・事務のみ'; end if;
  if p_kind = 'mon' then
    insert into leo_mon_links (token, child, term) values (encode(gen_random_bytes(24), 'hex'), p_child, p_term) on conflict (child, term) do nothing;
    select token into t from leo_mon_links where child = p_child and term = p_term;
  elsif p_kind = 'doui' then
    select * into pl from leo_plans where id = p_plan; if not found then raise exception '計画書がありません'; end if;
    if p_doc not in ('原案','本案') then raise exception 'doc'; end if;
    if p_doc = '本案' and pl.genan_consent_at is null then raise exception '原案の同意が先です'; end if;
    if (p_doc = '原案' and pl.genan_consent_at is not null) or (p_doc = '本案' and pl.honan_consent_at is not null) then raise exception 'すでに同意済みです'; end if;
    txt := case p_doc when '原案' then pl.genan else pl.honan end;
    if length(btrim(coalesce(txt, ''))) = 0 then raise exception '計画書の本文が空です'; end if;
    select token into t from leo_plan_consent_links where plan_id = p_plan and doc = p_doc and used_at is null and expires_at > now() and text_snapshot = txt order by link_id desc limit 1;
    if t is null then
      update leo_plan_consent_links set expires_at = now() where plan_id = p_plan and doc = p_doc and used_at is null and expires_at > now();
      t := encode(gen_random_bytes(24), 'hex');
      insert into leo_plan_consent_links (token, plan_id, doc, text_snapshot) values (t, p_plan, p_doc, txt);
    end if;
  else raise exception 'kind'; end if;
  return t;
end $$;
grant execute on function public.leo_make_token_link to authenticated;

-- 保護者ページ（ログインなし・トークンのみ）
create or replace function public.leo_doui_get(p_token text) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('child', p.child, 'term_no', p.term_no, 'doc', l.doc, 'start', p.start_on, 'end', p.end_on,
    'expired', (l.used_at is null and l.expires_at <= now()), 'sent_at', l.sent_at, 'done', l.used_at,
    'text', case when l.used_at is null and l.expires_at <= now() then null else coalesce(l.text_snapshot, case l.doc when '原案' then p.genan else p.honan end) end)
  from leo_plan_consent_links l join leo_plans p on p.id = l.plan_id where l.token = p_token and length(p_token) = 48 $$;
create or replace function public.leo_doui_submit(p_token text, p_parent text default null) returns text language plpgsql security definer set search_path = public as $$
declare l record; p record; txt text;
begin
  select * into l from leo_plan_consent_links where token = p_token and length(p_token) = 48 for update; if not found then raise exception 'リンクが正しくありません'; end if;
  if l.used_at is not null then raise exception 'このリンクは使用済みです'; end if;
  if l.expires_at <= now() then raise exception 'リンクの期限が切れています'; end if;
  select * into p from leo_plans where id = l.plan_id;
  if l.doc = '本案' and p.genan_consent_at is null then raise exception '原案の同意が先です'; end if;
  txt := coalesce(l.text_snapshot, case l.doc when '原案' then p.genan else p.honan end);
  insert into leo_plan_consents (token, parent_name, child, doc, term_no, plan_id, text_snapshot, sent_at, consented_at, link_id)
  values (p_token, nullif(btrim(coalesce(p_parent, '')), ''), p.child, l.doc, p.term_no, l.plan_id, txt, l.sent_at, now(), l.link_id);
  update leo_plan_consent_links set used_at = now() where token = p_token;
  perform set_config('leo.consent', '1', true);
  if l.doc = '原案' then update leo_plans set genan_consent_at = coalesce(genan_consent_at, now()) where id = l.plan_id;
  else update leo_plans set honan_consent_at = coalesce(honan_consent_at, now()) where id = l.plan_id; end if;
  return 'ok';
end $$;
revoke all on function public.leo_doui_get, public.leo_doui_submit from public;
grant execute on function public.leo_doui_get, public.leo_doui_submit to anon, authenticated;
