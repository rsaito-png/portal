-- 金斗雲（居宅介護）計画同意：Googleフォームの代わり。利用者名・計画本文はここに入れず、DBにだけ入れる（公開リポジトリに個人情報を置かない）
-- 読む／同意を記録：金斗雲職員・管理側（my_office()='金斗雲' or can_manage()）／計画の登録：管理側（can_manage）
create table if not exists public.kin_plan (
  user_name text not null check (char_length(user_name) <= 100),
  version int not null default 1,
  term text check (char_length(term) <= 20),
  period text check (char_length(period) <= 80),
  body text check (char_length(body) <= 20000),
  source_url text check (source_url is null or source_url ~ '^https://'),
  updated_by uuid default auth.uid(), updated_at timestamptz not null default now(),
  primary key (user_name, version));
alter table public.kin_plan enable row level security;
drop policy if exists kp_read on public.kin_plan;
create policy kp_read on public.kin_plan for select to authenticated using (public.my_office() = '金斗雲' or public.can_manage());
drop policy if exists kp_write on public.kin_plan;
create policy kp_write on public.kin_plan for all to authenticated using (public.can_manage()) with check (public.can_manage());

create table if not exists public.kin_consent (
  id bigint generated always as identity primary key,
  user_name text not null check (char_length(user_name) <= 100),
  version int not null,
  consented_at timestamptz not null default now(),
  writer text not null check (writer in ('本人','代理人')),
  proxy_name text check (char_length(proxy_name) <= 100),
  proxy_relation text check (char_length(proxy_relation) <= 50),
  explained_by uuid not null default auth.uid(),
  explained_by_name text check (char_length(explained_by_name) <= 100),
  signature text check (signature is null or (signature like 'data:image/png;base64,%' and char_length(signature) <= 400000)),
  foreign key (user_name, version) references public.kin_plan(user_name, version),
  check (writer = '本人' or (proxy_name is not null and proxy_relation is not null)));
alter table public.kin_consent enable row level security;
drop policy if exists kc_read on public.kin_consent;
create policy kc_read on public.kin_consent for select to authenticated using (public.my_office() = '金斗雲' or public.can_manage());
drop policy if exists kc_ins on public.kin_consent;
create policy kc_ins on public.kin_consent for insert to authenticated with check ((public.my_office() = '金斗雲' or public.can_manage()) and explained_by = auth.uid());
drop policy if exists kc_del on public.kin_consent;
create policy kc_del on public.kin_consent for delete to authenticated using (public.can_manage());
-- 同意の記録は更新できない（update ポリシーなし）
