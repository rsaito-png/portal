-- 金斗雲 計画同意：本人のスマホで開く署名リンク（1週間・1回限り）。kin_doc_links と同じ考え方
alter table public.kin_consent add column if not exists via text check (via in ('リンク'));
create table if not exists public.kin_consent_links (
  token text primary key check (token ~ '^[0-9a-f]{48}$'),
  user_id bigint not null references public.kin_user(id) on delete cascade,
  user_name text not null, version int not null,
  explainer_name text not null check (char_length(explainer_name) between 1 and 60),
  created_at timestamptz not null default now(), created_by uuid default auth.uid(),
  expires_at timestamptz not null default now() + interval '7 days', used_at timestamptz,
  foreign key (user_name, version) references public.kin_plan(user_name, version));
alter table public.kin_consent_links enable row level security;
drop policy if exists kcl_read on public.kin_consent_links;
create policy kcl_read on public.kin_consent_links for select to authenticated using (public.my_office() = '金斗雲' or public.can_manage());

-- 発行：金斗雲職員・管理側、またはDBから直接（service_role / 管理API）。最新版の計画に対して発行
create or replace function public.kin_consent_issue(p_user_id bigint, p_explainer text default '宮本')
returns text language plpgsql security definer set search_path = public, extensions as $$
declare t text; n text; v int;
begin
  if not (auth.role() is null or auth.role() = 'service_role' or coalesce(public.my_office() = '金斗雲' or public.can_manage(), false)) then raise exception '金斗雲職員のみ'; end if;
  if nullif(trim(coalesce(p_explainer,'')),'') is null then raise exception '説明職員を指定してください'; end if;
  select p.user_name, p.version into n, v from kin_plan p join kin_user u on u.name = p.user_name where u.id = p_user_id order by p.version desc limit 1;
  if n is null then raise exception 'この利用者の計画が登録されていません'; end if;
  if exists (select 1 from kin_consent where user_name = n and version = v) then raise exception 'この計画はすでに同意済みです'; end if;
  update kin_consent_links set expires_at = now() where user_id = p_user_id and used_at is null and expires_at > now();
  t := encode(gen_random_bytes(24), 'hex');
  insert into kin_consent_links(token, user_id, user_name, version, explainer_name) values (t, p_user_id, n, v, trim(p_explainer));
  return t;
end $$;
revoke all on function public.kin_consent_issue from public; grant execute on function public.kin_consent_issue to authenticated, service_role;

create or replace function public.kin_consent_get(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', p.user_name, 'version', p.version, 'term', p.term, 'period', p.period, 'body', p.body, 'explainer', l.explainer_name, 'expires_at', l.expires_at)
  from kin_consent_links l join kin_plan p on p.user_name = l.user_name and p.version = l.version
  where l.token = p_token and length(p_token) = 48 and l.used_at is null and l.expires_at > now()
    and not exists (select 1 from kin_consent c where c.user_name = l.user_name and c.version = l.version) $$;
revoke all on function public.kin_consent_get from public; grant execute on function public.kin_consent_get to anon, authenticated;

create or replace function public.kin_consent_submit(p_token text, p_writer text, p_proxy_name text, p_proxy_relation text, p_signature text)
returns bigint language plpgsql security definer set search_path = public as $$
declare l kin_consent_links; id0 bigint; pn text := nullif(trim(coalesce(p_proxy_name,'')),''); pr text := nullif(trim(coalesce(p_proxy_relation,'')),''); exb uuid;
begin
  if p_writer not in ('本人','代理人') then raise exception '記入者が正しくありません'; end if;
  if p_writer = '代理人' and (pn is null or pr is null) then raise exception '代理人の氏名と続柄を入れてください'; end if;
  if p_signature is null or p_signature not like 'data:image/png;base64,%' or char_length(p_signature) > 300000 then raise exception '署名が正しくありません'; end if;
  select * into l from kin_consent_links where token = p_token and length(p_token) = 48 for update;
  if not found or l.used_at is not null or l.expires_at <= now() then raise exception 'リンクが正しくないか、期限切れ・使用済みです'; end if;
  if exists (select 1 from kin_consent where user_name = l.user_name and version = l.version) then raise exception 'すでに同意済みです'; end if;
  exb := coalesce(l.created_by, (select id from auth.users where email = 'rsaito@psr-seishinkai.org'));
  insert into kin_consent(user_name, version, writer, proxy_name, proxy_relation, explained_by, explained_by_name, signature, via)
    values (l.user_name, l.version, p_writer, case when p_writer='代理人' then pn end, case when p_writer='代理人' then pr end, exb, l.explainer_name, p_signature, 'リンク') returning id into id0;
  update kin_consent_links set used_at = now() where token = p_token;
  return id0;
end $$;
revoke all on function public.kin_consent_submit from public; grant execute on function public.kin_consent_submit to anon, authenticated;
