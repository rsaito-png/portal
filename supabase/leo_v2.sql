-- レオ 11/1切替：LINE報告の下書き → 日誌（活動記録）→ 職員モニタリング → 保護者アンケート → 個別支援計画（4書類）→ 同意。すべてDB（東京）・職員のみRLS
-- ① LINE報告の下書き（現行「活動記録 下書き（業務日誌用）」ドキュメントの置き換え。1日×児童×書いた人）
create table if not exists public.leo_line_drafts (
  id bigint generated always as identity primary key, day date not null, child text not null,
  body text not null check (char_length(body) between 1 and 6000), author uuid not null default auth.uid(), author_name text,
  sent_line boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
alter table public.leo_line_drafts enable row level security;
drop policy if exists lld_read on public.leo_line_drafts;
create policy lld_read on public.leo_line_drafts for select to authenticated using (public.my_office() = 'レオ' or public.can_bill());
drop policy if exists lld_ins on public.leo_line_drafts;
create policy lld_ins on public.leo_line_drafts for insert to authenticated with check (public.my_office() = 'レオ' and author = auth.uid());
drop policy if exists lld_upd on public.leo_line_drafts;
create policy lld_upd on public.leo_line_drafts for update to authenticated using (author = auth.uid() or public.can_manage()) with check (public.my_office() = 'レオ');

-- ② 日誌の活動記録（DB）。下書きから作る。手で直したもの（manual）は自動で上書きしない
create table if not exists public.leo_activity (
  day date not null, child text not null, text text not null check (char_length(text) <= 6000),
  source text not null check (source in ('自動（簡易）','ボット','手入力','日誌から')), draft_id bigint references public.leo_line_drafts(id) on delete set null,
  made_by uuid, made_at timestamptz not null default now(), primary key (day, child));
alter table public.leo_activity enable row level security;
drop policy if exists la_read on public.leo_activity;
create policy la_read on public.leo_activity for select to authenticated using (public.my_office() = 'レオ' or public.can_bill());
drop policy if exists la_write on public.leo_activity;
create policy la_write on public.leo_activity for all to authenticated using (public.my_office() = 'レオ') with check (public.my_office() = 'レオ' and source = '手入力');
-- 下書き→活動記録（簡易）：あいさつ・署名行を除く。ボットが「である調」に書き直す（leo_bot_write）。手入力・ボット済みは上書きしない
create or replace function public.leo_simple_activity(b text) returns text language sql immutable as $$
  select trim(regexp_replace(regexp_replace(regexp_replace(b, '^\s*(本日も|今日も)?ありがとうございました[。！!]*\s*', ''), '\n\s*\S{1,12}\s*$', ''), '\n{3,}', E'\n\n', 'g')) $$;
create or replace function public.leo_activity_from_drafts(p_day date) returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if public.my_office() is distinct from 'レオ' and current_user <> 'postgres' and coalesce(current_setting('request.jwt.claim.role', true),'') <> 'service_role' then raise exception 'レオ職員のみ'; end if;
  insert into leo_activity (day, child, text, source, draft_id, made_by)
  select distinct on (d.child) d.day, d.child, leo_simple_activity(d.body), '自動（簡易）', d.id, auth.uid() from leo_line_drafts d where d.day = p_day order by d.child, d.updated_at desc
  on conflict (day, child) do update set text = excluded.text, draft_id = excluded.draft_id, made_at = now() where leo_activity.source = '自動（簡易）';
  get diagnostics n = row_count; return n;
end $$;
grant execute on function public.leo_activity_from_drafts to authenticated;
-- 日誌（Google→DB）＋活動記録（DB）を合わせた見え方。実績の写し（leo_shadow_transfer）は従来どおり leo_nikki の利用/欠席から
create or replace view public.leo_nikki_full with (security_invoker = true) as
  select n.*, coalesce(a.text, n.activity) as activity_text, coalesce(a.source, case when coalesce(n.activity,'') <> '' then '日誌から' end) as activity_source
  from leo_nikki n left join leo_activity a on a.day = n.day and leo_norm(a.child) = leo_norm(n.child);

-- ③ 保護者モニタリング（アンケート）：現行Googleフォームの設問を写す。トークン付きリンク（公式LINEで送る）
create table if not exists public.leo_mon_links (token text primary key, child text not null, term text not null, created_at timestamptz not null default now(), created_by uuid default auth.uid(), unique (child, term));
create table if not exists public.leo_mon_answers (id bigint generated always as identity primary key, token text not null references public.leo_mon_links(token) on delete cascade,
  answers jsonb not null check (pg_column_size(answers) < 20000), submitted_at timestamptz not null default now());
alter table public.leo_mon_links enable row level security; alter table public.leo_mon_answers enable row level security;
drop policy if exists lml_read on public.leo_mon_links; create policy lml_read on public.leo_mon_links for select to authenticated using (public.can_manage());
drop policy if exists lma_read on public.leo_mon_answers; create policy lma_read on public.leo_mon_answers for select to authenticated using (public.can_manage());

-- ④ 職員モニタリング（活動記録から作る）
create table if not exists public.leo_staff_mon (id bigint generated always as identity primary key, child text not null, term text not null,
  period_from date, period_to date, text text not null check (char_length(text) <= 20000), source text not null default '自動（簡易）',
  made_at timestamptz not null default now(), made_by uuid, unique (child, term));
alter table public.leo_staff_mon enable row level security;
drop policy if exists lsm_read on public.leo_staff_mon; create policy lsm_read on public.leo_staff_mon for select to authenticated using (public.my_office() = 'レオ' or public.can_bill());
drop policy if exists lsm_write on public.leo_staff_mon; create policy lsm_write on public.leo_staff_mon for all to authenticated using (public.can_manage()) with check (public.can_manage());

-- ⑤ 個別支援計画（1期＝1行。4書類の本文と日付。作成者は齊藤連）
create table if not exists public.leo_plans (
  id bigint generated always as identity primary key, child text not null, term_no int not null check (term_no between 1 and 40),
  start_on date not null check (extract(day from start_on) = 1), end_on date not null,
  assess_on date, genan_on date, kaigi_on date, honan_on date, author text not null default '齊藤連',
  assessment text, genan text, kaigi text, honan text,
  plan_made boolean not null default false, genan_consent_at timestamptz, honan_consent_at timestamptz,
  imported_from text, verified boolean not null default true, note text,
  updated_by uuid default auth.uid(), updated_at timestamptz not null default now(), unique (child, term_no));
alter table public.leo_plans enable row level security;
drop policy if exists lp_read on public.leo_plans; create policy lp_read on public.leo_plans for select to authenticated using (public.my_office() = 'レオ' or public.can_bill());
drop policy if exists lp_write on public.leo_plans; create policy lp_write on public.leo_plans for all to authenticated using (public.can_manage()) with check (public.can_manage() and genan_consent_at is not distinct from genan_consent_at);
-- 同意（原案・本案を別リンクで）
create table if not exists public.leo_plan_consent_links (token text primary key, plan_id bigint not null references public.leo_plans(id) on delete cascade,
  doc text not null check (doc in ('原案','本案')), created_at timestamptz not null default now(), unique (plan_id, doc));
create table if not exists public.leo_plan_consents (id bigint generated always as identity primary key, token text not null references public.leo_plan_consent_links(token) on delete cascade,
  parent_name text not null check (length(parent_name) between 1 and 60), submitted_at timestamptz not null default now());
alter table public.leo_plan_consent_links enable row level security; alter table public.leo_plan_consents enable row level security;
drop policy if exists lpcl_read on public.leo_plan_consent_links; create policy lpcl_read on public.leo_plan_consent_links for select to authenticated using (public.can_manage());
drop policy if exists lpc_read on public.leo_plan_consents; create policy lpc_read on public.leo_plan_consents for select to authenticated using (public.can_manage());

-- リンク作成（児発管・管理者・事務）
create or replace function public.leo_make_token_link(p_kind text, p_child text, p_term text, p_plan bigint, p_doc text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare t text;
begin
  if not public.can_manage() then raise exception '児発管・管理者・事務のみ'; end if;
  if p_kind = 'mon' then
    insert into leo_mon_links (token, child, term) values (encode(gen_random_bytes(24), 'hex'), p_child, p_term) on conflict (child, term) do nothing;
    select token into t from leo_mon_links where child = p_child and term = p_term;
  elsif p_kind = 'doui' then
    if p_doc = '本案' and (select genan_consent_at from leo_plans where id = p_plan) is null then raise exception '原案の同意が先です'; end if;
    insert into leo_plan_consent_links (token, plan_id, doc) values (encode(gen_random_bytes(24), 'hex'), p_plan, p_doc) on conflict (plan_id, doc) do nothing;
    select token into t from leo_plan_consent_links where plan_id = p_plan and doc = p_doc;
  else raise exception 'kind'; end if;
  return t;
end $$;
grant execute on function public.leo_make_token_link to authenticated;

-- 保護者ページ用（ログインなし・トークンのみ）
create or replace function public.leo_mon_get(p_token text) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('child', l.child, 'term', l.term, 'done', exists (select 1 from leo_mon_answers a where a.token = l.token))
  from leo_mon_links l where l.token = p_token and length(p_token) = 48 $$;
create or replace function public.leo_mon_submit(p_token text, p_answers jsonb) returns text language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from leo_mon_links where token = p_token) then raise exception 'リンクが正しくありません'; end if;
  if (select count(*) from leo_mon_answers where token = p_token and submitted_at > now() - interval '1 hour') >= 5 then raise exception '送信が多すぎます'; end if;
  if jsonb_typeof(p_answers) <> 'object' then raise exception '形式'; end if;
  insert into leo_mon_answers (token, answers) values (p_token, p_answers); return 'ok';
end $$;
create or replace function public.leo_doui_get(p_token text) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('child', p.child, 'term_no', p.term_no, 'doc', l.doc, 'start', p.start_on, 'end', p.end_on,
    'text', case l.doc when '原案' then p.genan else p.honan end, 'done', case l.doc when '原案' then p.genan_consent_at else p.honan_consent_at end)
  from leo_plan_consent_links l join leo_plans p on p.id = l.plan_id where l.token = p_token and length(p_token) = 48 $$;
create or replace function public.leo_doui_submit(p_token text, p_parent text) returns text language plpgsql security definer set search_path = public as $$
declare l record;
begin
  select * into l from leo_plan_consent_links where token = p_token; if not found then raise exception 'リンクが正しくありません'; end if;
  if length(trim(coalesce(p_parent,''))) = 0 then raise exception '氏名'; end if;
  if (select count(*) from leo_plan_consents where token = p_token and submitted_at > now() - interval '1 hour') >= 5 then raise exception '送信が多すぎます'; end if;
  insert into leo_plan_consents (token, parent_name) values (p_token, trim(p_parent));
  -- 済フラグは自動：原案→genan_consent_at、本案→honan_consent_at（最初の1回だけ）
  if l.doc = '原案' then update leo_plans set genan_consent_at = coalesce(genan_consent_at, now()) where id = l.plan_id;
  else update leo_plans set honan_consent_at = coalesce(honan_consent_at, now()) where id = l.plan_id; end if;
  return 'ok';
end $$;
revoke all on function public.leo_mon_get, public.leo_mon_submit, public.leo_doui_get, public.leo_doui_submit from public;
grant execute on function public.leo_mon_get, public.leo_mon_submit, public.leo_doui_get, public.leo_doui_submit to anon, authenticated;

-- ボットがポータルに書き込む口（同期トークン）：活動記録（である調）、職員モニタリング、計画書の本文
create or replace function public.leo_bot_write(p_token text, p_kind text, p jsonb) returns text language plpgsql security definer set search_path = public, extensions as $$
begin
  if encode(digest(p_token, 'sha256'), 'hex') is distinct from (select token_sha256 from sync_secret where name = 'leo') then raise exception 'bad token'; end if;
  if p_kind = 'activity' then
    insert into leo_activity (day, child, text, source, draft_id) values ((p->>'day')::date, p->>'child', p->>'text', 'ボット', (p->>'draft_id')::bigint)
    on conflict (day, child) do update set text = excluded.text, source = 'ボット', made_at = now() where leo_activity.source in ('自動（簡易）','ボット');
  elsif p_kind = 'staff_mon' then
    insert into leo_staff_mon (child, term, period_from, period_to, text, source) values (p->>'child', p->>'term', (p->>'from')::date, (p->>'to')::date, p->>'text', 'ボット')
    on conflict (child, term) do update set text = excluded.text, source = 'ボット', made_at = now();
  elsif p_kind = 'plan' then
    update leo_plans set assessment = coalesce(p->>'assessment', assessment), genan = coalesce(p->>'genan', genan), kaigi = coalesce(p->>'kaigi', kaigi), honan = coalesce(p->>'honan', honan), updated_at = now()
    where id = (p->>'plan_id')::bigint and not plan_made;   -- 確認済（計画書作成＝済）のものは上書きしない
  else raise exception 'kind'; end if;
  return 'ok';
end $$;
revoke all on function public.leo_bot_write from public; grant execute on function public.leo_bot_write to anon;
-- ボットのやること一覧（同期トークン）
create or replace function public.leo_bot_todo(p_token text) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
begin
  if encode(digest(p_token, 'sha256'), 'hex') is distinct from (select token_sha256 from sync_secret where name = 'leo') then raise exception 'bad token'; end if;
  return jsonb_build_object(
    'activity', (select coalesce(jsonb_agg(jsonb_build_object('day', a.day, 'child', a.child, 'draft_id', a.draft_id, 'draft', d.body)), '[]') from leo_activity a join leo_line_drafts d on d.id = a.draft_id where a.source = '自動（簡易）'),
    'plans', (select coalesce(jsonb_agg(jsonb_build_object('plan_id', id, 'child', child, 'term_no', term_no)), '[]') from leo_plans where not plan_made and (genan is null or honan is null)));
end $$;
revoke all on function public.leo_bot_todo from public; grant execute on function public.leo_bot_todo to anon;
-- 同意の日時は同意ページ（leo_doui_submit）からしか入らない
create or replace function public.leo_plans_guard() returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('leo.consent', true), '') <> '1' then new.genan_consent_at := old.genan_consent_at; new.honan_consent_at := old.honan_consent_at; end if;
  new.updated_at := now(); return new;
end $$;
drop trigger if exists leo_plans_guard on public.leo_plans;
create trigger leo_plans_guard before update on public.leo_plans for each row execute function public.leo_plans_guard();
create or replace function public.leo_doui_submit(p_token text, p_parent text) returns text language plpgsql security definer set search_path = public as $$
declare l record;
begin
  select * into l from leo_plan_consent_links where token = p_token; if not found then raise exception 'リンクが正しくありません'; end if;
  if length(trim(coalesce(p_parent,''))) = 0 then raise exception '氏名'; end if;
  if (select count(*) from leo_plan_consents where token = p_token and submitted_at > now() - interval '1 hour') >= 5 then raise exception '送信が多すぎます'; end if;
  insert into leo_plan_consents (token, parent_name) values (p_token, trim(p_parent));
  perform set_config('leo.consent', '1', true);
  if l.doc = '原案' then update leo_plans set genan_consent_at = coalesce(genan_consent_at, now()) where id = l.plan_id;
  else update leo_plans set honan_consent_at = coalesce(honan_consent_at, now()) where id = l.plan_id; end if;
  return 'ok';
end $$;
create or replace function public.leo_activity_from_drafts(p_day date) returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if public.my_office() is distinct from 'レオ' then raise exception 'レオ職員のみ'; end if;
  -- トップの「LINEの下書き」(leo_diary_draft) にだけある分も転記元へ
  insert into leo_line_drafts (day, child, body, author_name)
  select d.day, d.child, d.body, d.author from leo_diary_draft d
  where d.day = p_day and coalesce(trim(d.body), '') <> ''
    and not exists (select 1 from leo_line_drafts l where l.day = d.day and leo_norm(l.child) = leo_norm(d.child));
  insert into leo_activity (day, child, text, source, draft_id, made_by)
  select distinct on (d.child) d.day, d.child, leo_simple_activity(d.body), '自動（簡易）', d.id, auth.uid() from leo_line_drafts d where d.day = p_day order by d.child, d.updated_at desc
  on conflict (day, child) do update set text = excluded.text, draft_id = excluded.draft_id, made_at = now() where leo_activity.source = '自動（簡易）';
  get diagnostics n = row_count; return n;
end $$;
drop policy if exists lp_write on public.leo_plans;
create policy lp_write on public.leo_plans for all to authenticated using (public.can_manage()) with check (public.can_manage());
