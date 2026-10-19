-- 水晶玉（計画相談）。利用者台帳・計画（計画1=サービス等利用計画／障がい児支援利用計画、計画2=週間計画表、モニタリング報告書）・AI下書き依頼。
-- アクセスは水晶玉の職員と管理側のみ（my_office()='水晶玉' or can_manage()）。匿名不可。過去の利用者は精算済みのため空で新規。
create table if not exists public.sui_user (
  id bigint generated always as identity primary key,
  name text not null unique check (char_length(name) between 1 and 100),
  name_kana text check (char_length(name_kana) <= 100), birth date,
  kind text not null default '障害福祉サービス' check (kind in ('障害福祉サービス','障害児')), -- 計画の種類（サービス等利用計画／障がい児支援利用計画）
  guardian_name text check (char_length(guardian_name) <= 100), guardian_relation text check (char_length(guardian_relation) <= 50),
  shien_kubun text check (char_length(shien_kubun) <= 20),
  address text check (char_length(address) <= 300), phone text check (char_length(phone) <= 40), city text check (char_length(city) <= 60),
  jukyusha_fukushi text check (char_length(jukyusha_fukushi) <= 20), jukyusha_chiiki text check (char_length(jukyusha_chiiki) <= 20), jukyusha_jido text check (char_length(jukyusha_jido) <= 20),
  cap_amount int check (cap_amount >= 0),
  monitoring_period text check (char_length(monitoring_period) <= 100),
  memo text check (char_length(memo) <= 1000), needs_check boolean not null default false,
  updated_by uuid default auth.uid(), updated_at timestamptz not null default now());
create table if not exists public.sui_plan (
  id bigint generated always as identity primary key,
  user_id bigint not null references public.sui_user(id) on delete cascade,
  plan_type text not null check (plan_type in ('計画1','計画2','モニタリング')),
  version int not null default 1,
  kind text not null default '新規' check (kind in ('新規','継続')),
  prev_plan_id bigint references public.sui_plan(id) on delete set null, -- 前回計画への参照
  status text not null default '下書き' check (status in ('下書き','確定')),
  body jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(),
  updated_by uuid default auth.uid(), updated_at timestamptz not null default now(),
  unique (user_id, plan_type, version));
create index if not exists sui_plan_user on public.sui_plan(user_id, plan_type, version);
create table if not exists public.sui_request ( -- 録音→文字起こし→AI下書きの依頼。水晶玉システムボットが service_role で「待ち」を拾い、draft に下書きJSONを書き戻す
  id bigint generated always as identity primary key,
  user_id bigint not null references public.sui_user(id) on delete cascade,
  kind text not null default '新規' check (kind in ('新規','継続')),
  transcript text check (char_length(transcript) <= 200000),
  audio_path text check (char_length(audio_path) <= 300), -- Storage 非公開バケット sui-audio 内のパス
  status text not null default '待ち' check (status in ('待ち','作成済み','確定')),
  draft jsonb,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index if not exists sui_request_status on public.sui_request(status, created_at);
-- 確定した計画は本文を変更できない（版を新しく作る）。解除は管理側のみ。
create or replace function public.sui_plan_lock() returns trigger language plpgsql as $$
begin
  if old.status = '確定' and (new.body is distinct from old.body or new.status = '下書き') and not public.can_manage() then
    raise exception '確定した計画は変更できません（新しい版を作ってください）'; end if;
  new.updated_at := now(); return new; end $$;
drop trigger if exists sui_plan_lock on public.sui_plan;
create trigger sui_plan_lock before update on public.sui_plan for each row execute function public.sui_plan_lock();
do $$ declare t text; begin
  foreach t in array array['sui_user','sui_plan','sui_request'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_rw', t);
    execute format($p$create policy %I on public.%I for all to authenticated using (public.my_office() = '水晶玉' or public.can_manage()) with check (public.my_office() = '水晶玉' or public.can_manage())$p$, t||'_rw', t);
    execute format('revoke all on public.%I from anon', t);
  end loop; end $$;
-- 録音の保存先（非公開バケット）。職員のみ保存・閲覧
insert into storage.buckets (id, name, public) values ('sui-audio', 'sui-audio', false) on conflict (id) do nothing;
drop policy if exists sui_audio_rw on storage.objects;
create policy sui_audio_rw on storage.objects for all to authenticated using (bucket_id = 'sui-audio' and (public.my_office() = '水晶玉' or public.can_manage())) with check (bucket_id = 'sui-audio' and (public.my_office() = '水晶玉' or public.can_manage()));

-- 計画案／計画（別書類・内容は同じでよい。両方作り、それぞれ署名をもらい、市役所へ紙で送る）
alter table public.sui_plan add column if not exists doc_class text check (doc_class in ('計画案','計画')); -- モニタリングは空
alter table public.sui_plan add column if not exists source_id bigint references public.sui_plan(id) on delete set null; -- 計画案→計画の複製元
alter table public.sui_plan add column if not exists signed_on date;
alter table public.sui_plan add column if not exists signer_kind text check (char_length(signer_kind) <= 60);
alter table public.sui_plan add column if not exists sent_on date;            -- 市役所へ紙で送付した日
alter table public.sui_plan add column if not exists sent_memo text check (char_length(sent_memo) <= 200);
update public.sui_plan set doc_class = '計画案' where doc_class is null and plan_type in ('計画1','計画2');
create table if not exists public.sui_sign_links (
  token text primary key check (token ~ '^[0-9a-f]{48}$'),
  plan_id bigint not null references public.sui_plan(id) on delete cascade, explainer_name text not null check (char_length(explainer_name) between 1 and 60),
  created_at timestamptz not null default now(), created_by uuid default auth.uid(), expires_at timestamptz not null default now() + interval '7 days', used_at timestamptz);
create table if not exists public.sui_sign_log ( -- 追記専用。計画案・計画ごとの署名記録（署名日・署名者区分・署名画像）
  id bigint generated always as identity primary key,
  plan_id bigint not null references public.sui_plan(id), token text references public.sui_sign_links(token),
  method text not null check (method in ('本人','ご家族','署名困難','あとで署名','紙で署名済み')),
  signer_name text check (char_length(signer_name) <= 100), signer_relation text check (char_length(signer_relation) <= 50), reason text check (char_length(reason) <= 500),
  explainer_name text check (char_length(explainer_name) <= 60),
  signature text check (signature is null or (signature like 'data:image/png;base64,%' and char_length(signature) <= 300000)),
  signed_on date, memo text check (char_length(memo) <= 500), signed_at timestamptz not null default now(), recorded_by uuid default auth.uid());
do $$ declare t text; begin
  foreach t in array array['sui_sign_links','sui_sign_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_r', t);
    execute format($p$create policy %I on public.%I for select to authenticated using (public.my_office() = '水晶玉' or public.can_manage())$p$, t||'_r', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke insert, update, delete on public.%I from authenticated', t);
  end loop; end $$;
create or replace function public.sui_sign_issue(p_plan_id bigint, p_explainer text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare t text; p sui_plan;
begin
  if not coalesce(public.my_office() = '水晶玉' or public.can_manage(), false) then raise exception '水晶玉の職員のみ'; end if;
  select * into p from sui_plan where id = p_plan_id; if not found then raise exception '計画がありません'; end if;
  if p.doc_class is null then raise exception '署名の対象は計画案・計画です'; end if;
  if p.status <> '確定' then raise exception '確定した版だけ署名リンクを出せます'; end if;
  if nullif(trim(coalesce(p_explainer,'')),'') is null then raise exception '説明職員を入れてください'; end if;
  update sui_sign_links set expires_at = now() where plan_id = p_plan_id and used_at is null and expires_at > now();
  t := encode(gen_random_bytes(24), 'hex'); insert into sui_sign_links(token, plan_id, explainer_name) values (t, p_plan_id, trim(p_explainer)); return t;
end $$;
revoke all on function public.sui_sign_issue from public; revoke execute on function public.sui_sign_issue from anon; grant execute on function public.sui_sign_issue to authenticated;
create or replace function public.sui_sign_get(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('user_name', u.name, 'doc_class', p.doc_class, 'plan_type', p.plan_type, 'version', p.version, 'kind', p.kind, 'body', p.body, 'explainer', l.explainer_name, 'expires_at', l.expires_at)
  from sui_sign_links l join sui_plan p on p.id = l.plan_id join sui_user u on u.id = p.user_id
  where l.token = p_token and length(p_token) = 48 and l.used_at is null and l.expires_at > now()
$$;
revoke all on function public.sui_sign_get from public; grant execute on function public.sui_sign_get to anon, authenticated;
create or replace function public.sui_sign_submit(p_token text, p_method text, p_signature text, p_name text, p_relation text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
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
end $$;
revoke all on function public.sui_sign_submit from public; grant execute on function public.sui_sign_submit to anon, authenticated;
create or replace function public.sui_sign_mark_paper(p_plan_id bigint, p_signed_on date, p_memo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not coalesce(public.my_office() = '水晶玉' or public.can_manage(), false) then raise exception '水晶玉の職員のみ'; end if;
  if p_signed_on is null then raise exception '署名日を入れてください'; end if;
  if not exists (select 1 from sui_plan where id = p_plan_id and doc_class is not null) then raise exception '署名の対象は計画案・計画です'; end if;
  insert into sui_sign_log(plan_id, method, signed_on, memo) values (p_plan_id, '紙で署名済み', p_signed_on, nullif(trim(coalesce(p_memo,'')),''));
  update sui_plan set signed_on = p_signed_on, signer_kind = '紙で署名済み' where id = p_plan_id;
end $$;
revoke all on function public.sui_sign_mark_paper from public; revoke execute on function public.sui_sign_mark_paper from anon; grant execute on function public.sui_sign_mark_paper to authenticated;

-- 面談の場（同じタブレット）で署名：ログイン中の職員が利用者にタブレットを渡して署名してもらう。計画案・計画それぞれに追記ログ。
create or replace function public.sui_sign_onsite(p_plan_id bigint, p_method text, p_signature text, p_name text, p_relation text, p_reason text, p_explainer text)
returns void language plpgsql security definer set search_path = public as $$
declare nm text := nullif(trim(coalesce(p_name,'')),''); rl text := nullif(trim(coalesce(p_relation,'')),''); rs text := nullif(trim(coalesce(p_reason,'')),''); kind text; p sui_plan;
begin
  if not coalesce(public.my_office() = '水晶玉' or public.can_manage(), false) then raise exception '水晶玉の職員のみ'; end if;
  if p_method not in ('本人','ご家族','署名困難') then raise exception '署名方法が正しくありません'; end if;
  select * into p from sui_plan where id = p_plan_id; if not found or p.doc_class is null then raise exception '署名の対象は計画案・計画です'; end if;
  if p.status <> '確定' then raise exception '確定した版だけ署名できます'; end if;
  if p_method in ('本人','ご家族') and (p_signature is null or p_signature not like 'data:image/png;base64,%' or char_length(p_signature) > 300000) then raise exception '署名が正しくありません'; end if;
  if p_method = 'ご家族' and (nm is null or rl is null) then raise exception '署名される方の氏名と続柄を入れてください'; end if;
  if p_method = '署名困難' and rs is null then raise exception '理由を入れてください'; end if;
  insert into sui_sign_log(plan_id, method, signer_name, signer_relation, reason, explainer_name, signature, signed_on, memo)
    values (p_plan_id, p_method, case when p_method='ご家族' then nm end, case when p_method='ご家族' then rl end, case when p_method='署名困難' then rs end, nullif(trim(coalesce(p_explainer,'')),''), case when p_method in ('本人','ご家族') then p_signature end, (now() at time zone 'Asia/Tokyo')::date, '面談の場で署名（タブレット）');
  kind := case p_method when 'ご家族' then 'ご家族（' || rl || '）' else p_method end;
  update sui_plan set signed_on = (now() at time zone 'Asia/Tokyo')::date, signer_kind = left(kind, 60) where id = p_plan_id;
end $$;
revoke all on function public.sui_sign_onsite from public; revoke execute on function public.sui_sign_onsite from anon; grant execute on function public.sui_sign_onsite to authenticated;
