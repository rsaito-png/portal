-- 茶夢（生活介護）個別支援計画。レオの計画の形を借りるが、保護者リンクとオンライン同意は作らない。
-- 署名は事業所のタブレットで対面（chamu_plan_sign_onsite）。下書き生成は chamu_plan_requests の挿入トリガーが
-- Edge Function chamu-plan-draft を非同期に呼ぶ（pg_net。鍵は vault の sui_service_key。リポジトリには置かない）。
-- 再実行できる。利用者の実名・過去の本文はこのファイルに書かない。
-- 適用: SQL Editor に貼って Run、または apply_migration。適用後に chamu-plan-draft と chamu-svcplan-read をデプロイする。

create extension if not exists pg_net;
create extension if not exists pgcrypto;

-- 計画を作る・直す・生成を頼む・署名する人。会長、法人管理者、事務、または茶夢所属/兼務で管理者・サビ管系。
-- 読む権限（chamu_can）より狭い。anon には実行を渡さない。画面のボタン出し分けのため authenticated だけ。
create or replace function public.chamu_can_plan()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(
    public.is_chair()
    or public.bp_is_corp_admin()
    or exists (
      select 1 from public.staff_profiles
      where user_id = auth.uid()
        and active
        and (
          role = '事務'
          or (
            (office = '茶夢' or '茶夢' = any (coalesce(extra_offices, '{}'::text[])))
            and (
              duty in ('管理者', '児発管', 'サービス管理責任者', 'サビ管')
              or duty like '%サビ管%'
              or duty like '%サービス管理%'
            )
          )
        )
    ),
    false)
$$;

revoke all on function public.chamu_can_plan() from public, anon, authenticated;
grant execute on function public.chamu_can_plan() to authenticated;

create table if not exists public.chamu_plans (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.chamu_users(id) on delete restrict,
  term_no int not null check (term_no between 1 and 40),
  start_on date not null,
  end_on date not null check (end_on > start_on),
  assess_on date,
  genan_on date,
  kaigi_on date,
  honan_on date,
  author text not null default '齊藤 連' check (char_length(btrim(author)) between 1 and 60),
  assessment text check (assessment is null or char_length(assessment) <= 50000),
  monitoring text check (monitoring is null or char_length(monitoring) <= 50000),
  genan text check (genan is null or char_length(genan) <= 50000),
  kaigi text check (kaigi is null or char_length(kaigi) <= 50000),
  honan text check (honan is null or char_length(honan) <= 50000),
  status text not null default '下書き' check (status in ('下書き', '原案確定', '本案確定')),
  genan_signed_at timestamptz,
  honan_signed_at timestamptz,
  imported_from text check (imported_from is null or char_length(imported_from) <= 200),
  source_meta jsonb not null default '{}'::jsonb,
  note text check (note is null or char_length(note) <= 2000),
  audit jsonb not null default '[]'::jsonb,
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, term_no)
);

create index if not exists chamu_plans_user_end on public.chamu_plans (user_id, end_on desc);

-- サービス等利用計画（介護保険の居宅サービス計画書の場合もある）。本文は職員が直せる。ファイルは非公開バケット。
create table if not exists public.chamu_service_plans (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.chamu_users(id) on delete restrict,
  kind text not null default 'サービス等利用計画' check (char_length(btrim(kind)) between 1 and 40),
  office_name text check (office_name is null or char_length(office_name) <= 120),
  author_name text check (author_name is null or char_length(author_name) <= 80),
  created_on date,
  consent_on date,
  period_from date,
  period_to date,
  body_text text not null default '' check (char_length(body_text) <= 100000),
  storage_path text check (storage_path is null or (char_length(storage_path) between 1 and 300)),
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists chamu_service_plans_user on public.chamu_service_plans (user_id, updated_at desc);

-- 下書き生成の依頼。status が「待ち」の挿入で Edge Function を呼ぶ。
create table if not exists public.chamu_plan_requests (
  id bigint generated always as identity primary key,
  plan_id bigint not null references public.chamu_plans(id) on delete cascade,
  status text not null default '待ち' check (status in ('待ち', '作成済み', 'エラー')),
  error text check (error is null or char_length(error) <= 1000),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chamu_plan_requests_plan on public.chamu_plan_requests (plan_id, created_at desc);
create unique index if not exists chamu_plan_requests_one_wait
  on public.chamu_plan_requests (plan_id) where status = '待ち';

-- 署名記録は追記だけ。update / delete はトリガーで拒否する（service_role でも）。
create table if not exists public.chamu_plan_sign_log (
  id bigint generated always as identity primary key,
  plan_id bigint not null references public.chamu_plans(id) on delete restrict,
  doc text not null check (doc in ('原案', '本案')),
  method text not null check (method in ('本人', 'ご家族', '署名困難')),
  signer_name text check (signer_name is null or char_length(signer_name) <= 100),
  signer_relation text check (signer_relation is null or char_length(signer_relation) <= 50),
  reason text check (reason is null or char_length(reason) <= 500),
  explainer_name text not null check (char_length(btrim(explainer_name)) between 1 and 60),
  signature text check (signature is null or (signature like 'data:image/png;base64,%' and char_length(signature) <= 300000)),
  body_snapshot text not null check (char_length(body_snapshot) between 1 and 50000),
  body_sha256 text not null,
  signed_on date not null,
  signed_at timestamptz not null default now(),
  recorded_by uuid default auth.uid()
);

create index if not exists chamu_plan_sign_log_plan on public.chamu_plan_sign_log (plan_id, signed_at);

-- 過去の茶夢日誌（請求済みの chamu_journal とは別）。9〜10月分などを後で一度取り込むための表。取り込み自体はこのファイルではしない。
create table if not exists public.chamu_journal_archive (
  id uuid primary key default gen_random_uuid(),
  journal_date date not null,
  user_id uuid references public.chamu_users(id) on delete set null,
  user_name text check (user_name is null or char_length(user_name) <= 100),
  present boolean,
  attendance text check (attendance is null or char_length(attendance) <= 40),
  start_time text check (start_time is null or char_length(start_time) <= 20),
  end_time text check (end_time is null or char_length(end_time) <= 20),
  transport text check (transport is null or char_length(transport) <= 40),
  meal text check (meal is null or char_length(meal) <= 40),
  intake text check (intake is null or char_length(intake) <= 40),
  intake_note text check (intake_note is null or char_length(intake_note) <= 200),
  support_note text check (support_note is null or char_length(support_note) <= 4000),
  staff_name text check (staff_name is null or char_length(staff_name) <= 60),
  weather text check (weather is null or char_length(weather) <= 20),
  menu text check (menu is null or char_length(menu) <= 500),
  note text check (note is null or char_length(note) <= 2000),
  rice_portion text check (rice_portion is null or char_length(rice_portion) <= 80),
  egg_count text check (egg_count is null or char_length(egg_count) <= 80),
  tofu_g text check (tofu_g is null or char_length(tofu_g) <= 80),
  meat_note text check (meat_note is null or char_length(meat_note) <= 80),
  fish_g text check (fish_g is null or char_length(fish_g) <= 80),
  dairy_note text check (dairy_note is null or char_length(dairy_note) <= 80),
  raw jsonb not null default '{}'::jsonb,
  source text check (source is null or char_length(source) <= 80),
  imported_at timestamptz not null default now()
);

create index if not exists chamu_journal_archive_user_day on public.chamu_journal_archive (user_id, journal_date);
create index if not exists chamu_journal_archive_day on public.chamu_journal_archive (journal_date);
create index if not exists chamu_journal_archive_name on public.chamu_journal_archive (user_name, journal_date);

-- 署名日時は署名RPCからしか入らない。原案確定後は原案本文を固定。本案確定または本案署名後は5書類を固定。
create or replace function public.chamu_plans_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  signing boolean := coalesce(current_setting('chamu.plan_sign', true), '') = '1';
begin
  if tg_op = 'DELETE' then
    if old.status <> '下書き' or old.genan_signed_at is not null or old.honan_signed_at is not null then
      raise exception '確定または署名した計画は削除できません';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.status is null or new.status not in ('下書き', '原案確定', '本案確定') then
      new.status := '下書き';
    end if;
    if new.status = '原案確定' and coalesce(btrim(new.genan), '') = '' then
      raise exception '原案の本文が空です';
    end if;
    if new.status = '本案確定' and coalesce(btrim(new.honan), '') = '' then
      raise exception '本案の本文が空です';
    end if;
    new.genan_signed_at := null;
    new.honan_signed_at := null;
    if coalesce(btrim(new.author), '') = '' then
      new.author := '齊藤 連';
    end if;
    new.audit := '[]'::jsonb;
  else
    if new.user_id is distinct from old.user_id or new.term_no is distinct from old.term_no then
      raise exception '利用者と期は変えられません';
    end if;
    if not signing and (new.genan_signed_at is distinct from old.genan_signed_at or new.honan_signed_at is distinct from old.honan_signed_at) then
      raise exception '署名日時は署名の操作からしか入りません';
    end if;
    if signing then
      if new.assessment is distinct from old.assessment
        or new.monitoring is distinct from old.monitoring
        or new.genan is distinct from old.genan
        or new.kaigi is distinct from old.kaigi
        or new.honan is distinct from old.honan
        or new.status is distinct from old.status
        or new.start_on is distinct from old.start_on
        or new.end_on is distinct from old.end_on then
        raise exception '署名の操作で本文や状態は変えられません';
      end if;
    end if;
    if old.status = '本案確定' or old.honan_signed_at is not null then
      if new.assessment is distinct from old.assessment
        or new.monitoring is distinct from old.monitoring
        or new.genan is distinct from old.genan
        or new.kaigi is distinct from old.kaigi
        or new.honan is distinct from old.honan
        or new.start_on is distinct from old.start_on
        or new.end_on is distinct from old.end_on then
        raise exception '本案確定または署名のあと、本文は変えられません';
      end if;
    elsif old.status = '原案確定' or old.genan_signed_at is not null then
      if new.genan is distinct from old.genan
        or new.start_on is distinct from old.start_on
        or new.end_on is distinct from old.end_on then
        raise exception '原案確定または原案署名のあと、原案の本文は変えられません';
      end if;
    end if;
    if new.status is distinct from old.status then
      if not (
        (old.status = '下書き' and new.status = '原案確定')
        or (old.status = '原案確定' and new.status = '本案確定')
      ) then
        raise exception '状態は下書き→原案確定→本案確定の順です';
      end if;
      if new.status = '原案確定' and coalesce(btrim(new.genan), '') = '' then
        raise exception '原案の本文が空です';
      end if;
      if new.status = '本案確定' and coalesce(btrim(new.honan), '') = '' then
        raise exception '本案の本文が空です';
      end if;
    end if;
  end if;

  if auth.uid() is not null then
    new.updated_by := auth.uid();
  end if;
  new.updated_at := now();
  new.audit := coalesce(case when tg_op = 'INSERT' then '[]'::jsonb else old.audit end, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
    'at', to_char(now() at time zone 'Asia/Tokyo', 'YYYY-MM-DD"T"HH24:MI'),
    'by', auth.uid(),
    'op', tg_op,
    'status', new.status
  ));
  if jsonb_typeof(new.audit) = 'array' and jsonb_array_length(new.audit) > 40 then
    new.audit := (
      select coalesce(jsonb_agg(e order by n), '[]'::jsonb)
      from (
        select e, n
        from jsonb_array_elements(new.audit) with ordinality as t(e, n)
        order by n desc
        limit 40
      ) s
    );
  end if;
  return new;
end $$;

revoke all on function public.chamu_plans_guard() from public, anon, authenticated;
drop trigger if exists chamu_plans_guard on public.chamu_plans;
create trigger chamu_plans_guard
  before insert or update or delete on public.chamu_plans
  for each row execute function public.chamu_plans_guard();

-- 手入力の署名日は捨て、サーバの日本時間の当日にする。ハッシュもここで計算する。書き換えと削除は拒否。
create or replace function public.chamu_plan_sign_log_guard()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  if tg_op <> 'INSERT' then
    raise exception '署名記録は書き換え・削除できません';
  end if;
  if coalesce(btrim(new.body_snapshot), '') = '' then
    raise exception '署名する本文がありません';
  end if;
  new.signed_on := (now() at time zone 'Asia/Tokyo')::date;
  new.signed_at := now();
  new.body_sha256 := encode(digest(convert_to(new.body_snapshot, 'UTF8'), 'sha256'), 'hex');
  if coalesce(btrim(new.explainer_name), '') = '' then
    new.explainer_name := '齊藤 連';
  end if;
  return new;
end $$;

revoke all on function public.chamu_plan_sign_log_guard() from public, anon, authenticated;
drop trigger if exists chamu_plan_sign_log_guard on public.chamu_plan_sign_log;
create trigger chamu_plan_sign_log_guard
  before insert or update or delete on public.chamu_plan_sign_log
  for each row execute function public.chamu_plan_sign_log_guard();

create or replace function public.chamu_plan_sign_onsite(
  p_plan_id bigint,
  p_doc text,
  p_method text,
  p_signature text,
  p_name text,
  p_relation text,
  p_reason text,
  p_explainer text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.chamu_plans;
  nm text := nullif(btrim(coalesce(p_name, '')), '');
  rl text := nullif(btrim(coalesce(p_relation, '')), '');
  rs text := nullif(btrim(coalesce(p_reason, '')), '');
  ex text := coalesce(nullif(btrim(coalesce(p_explainer, '')), ''), '齊藤 連');
  body text;
begin
  if not coalesce(public.chamu_can_plan(), false) then
    raise exception '茶夢の個別支援計画を作る職員のみ署名できます';
  end if;
  if p_doc not in ('原案', '本案') then
    raise exception '署名の対象は原案か本案です';
  end if;
  if p_method not in ('本人', 'ご家族', '署名困難') then
    raise exception '署名方法が正しくありません';
  end if;
  if p_method in ('本人', 'ご家族') and (p_signature is null or p_signature not like 'data:image/png;base64,%' or char_length(p_signature) > 300000) then
    raise exception '署名が正しくありません';
  end if;
  if p_method = 'ご家族' and (nm is null or rl is null) then
    raise exception '署名される方の氏名と続柄を入れてください';
  end if;
  if p_method = '署名困難' and rs is null then
    raise exception '理由を入れてください';
  end if;
  if char_length(ex) > 60 then
    raise exception '説明者は60文字以内にしてください';
  end if;
  select * into p from public.chamu_plans where id = p_plan_id for update;
  if not found then
    raise exception '計画がありません';
  end if;
  if p_doc = '原案' then
    if p.status not in ('原案確定', '本案確定') then
      raise exception '原案を確定してから署名します';
    end if;
    if p.genan_signed_at is not null then
      raise exception '原案は署名済みです';
    end if;
    body := p.genan;
  else
    if p.status <> '本案確定' then
      raise exception '本案を確定してから署名します';
    end if;
    if p.genan_signed_at is null then
      raise exception '原案の署名が先です';
    end if;
    if p.honan_signed_at is not null then
      raise exception '本案は署名済みです';
    end if;
    body := p.honan;
  end if;
  if coalesce(btrim(body), '') = '' then
    raise exception '署名する本文がありません';
  end if;
  insert into public.chamu_plan_sign_log (
    plan_id, doc, method, signer_name, signer_relation, reason, explainer_name, signature, body_snapshot
  ) values (
    p.id, p_doc, p_method,
    case when p_method = 'ご家族' then nm end,
    case when p_method = 'ご家族' then rl end,
    case when p_method = '署名困難' then rs end,
    ex,
    case when p_method in ('本人', 'ご家族') then p_signature end,
    body
  );
  perform set_config('chamu.plan_sign', '1', true);
  if p_doc = '原案' then
    update public.chamu_plans set genan_signed_at = now() where id = p.id;
  else
    update public.chamu_plans set honan_signed_at = now() where id = p.id;
  end if;
end $$;

revoke all on function public.chamu_plan_sign_onsite(bigint, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.chamu_plan_sign_onsite(bigint, text, text, text, text, text, text, text) to authenticated;

create or replace function public.trg_chamu_plan_request_fire()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  k text;
  err text;
begin
  select decrypted_secret into k from vault.decrypted_secrets where name = 'sui_service_key' limit 1;
  if k is null then
    update public.chamu_plan_requests
      set status = 'エラー', error = 'vaultにsui_service_keyがありません', updated_at = now()
      where id = new.id;
    return new;
  end if;
  begin
    perform net.http_post(
      url := 'https://zvrardoyxocmqhvyddnf.supabase.co/functions/v1/chamu-plan-draft',
      headers := jsonb_build_object('content-type', 'application/json', 'authorization', 'Bearer ' || k),
      body := jsonb_build_object('id', new.id),
      timeout_milliseconds := 5000
    );
  exception when others then
    err := left(regexp_replace(sqlerrm, 'Bearer [^ ]+', 'Bearer ***', 'gi'), 300);
    update public.chamu_plan_requests
      set status = 'エラー', error = err, updated_at = now()
      where id = new.id;
  end;
  return new;
end $$;

revoke all on function public.trg_chamu_plan_request_fire() from public, anon, authenticated;
drop trigger if exists chamu_plan_request_fire on public.chamu_plan_requests;
create trigger chamu_plan_request_fire
  after insert on public.chamu_plan_requests
  for each row when (new.status = '待ち')
  execute function public.trg_chamu_plan_request_fire();

alter table public.chamu_plans enable row level security;
alter table public.chamu_service_plans enable row level security;
alter table public.chamu_plan_requests enable row level security;
alter table public.chamu_plan_sign_log enable row level security;
alter table public.chamu_journal_archive enable row level security;

drop policy if exists chamu_plans_sel on public.chamu_plans;
drop policy if exists chamu_plans_ins on public.chamu_plans;
drop policy if exists chamu_plans_upd on public.chamu_plans;
drop policy if exists chamu_plans_del on public.chamu_plans;
create policy chamu_plans_sel on public.chamu_plans for select to authenticated using (public.chamu_can());
create policy chamu_plans_ins on public.chamu_plans for insert to authenticated with check (public.chamu_can_plan());
create policy chamu_plans_upd on public.chamu_plans for update to authenticated using (public.chamu_can_plan()) with check (public.chamu_can_plan());
create policy chamu_plans_del on public.chamu_plans for delete to authenticated using (public.chamu_can_plan());

drop policy if exists chamu_svc_sel on public.chamu_service_plans;
drop policy if exists chamu_svc_ins on public.chamu_service_plans;
drop policy if exists chamu_svc_upd on public.chamu_service_plans;
drop policy if exists chamu_svc_del on public.chamu_service_plans;
create policy chamu_svc_sel on public.chamu_service_plans for select to authenticated using (public.chamu_can());
create policy chamu_svc_ins on public.chamu_service_plans for insert to authenticated with check (public.chamu_can_plan());
create policy chamu_svc_upd on public.chamu_service_plans for update to authenticated using (public.chamu_can_plan()) with check (public.chamu_can_plan());
create policy chamu_svc_del on public.chamu_service_plans for delete to authenticated using (public.chamu_can_plan());

drop policy if exists chamu_req_sel on public.chamu_plan_requests;
drop policy if exists chamu_req_ins on public.chamu_plan_requests;
create policy chamu_req_sel on public.chamu_plan_requests for select to authenticated using (public.chamu_can());
create policy chamu_req_ins on public.chamu_plan_requests for insert to authenticated
  with check (public.chamu_can_plan() and status = '待ち' and error is null);

drop policy if exists chamu_sign_sel on public.chamu_plan_sign_log;
create policy chamu_sign_sel on public.chamu_plan_sign_log for select to authenticated using (public.chamu_can());

drop policy if exists chamu_arch_sel on public.chamu_journal_archive;
drop policy if exists chamu_arch_ins on public.chamu_journal_archive;
drop policy if exists chamu_arch_upd on public.chamu_journal_archive;
drop policy if exists chamu_arch_del on public.chamu_journal_archive;
create policy chamu_arch_sel on public.chamu_journal_archive for select to authenticated using (public.chamu_can());
create policy chamu_arch_ins on public.chamu_journal_archive for insert to authenticated with check (public.chamu_can_plan());
create policy chamu_arch_upd on public.chamu_journal_archive for update to authenticated using (public.chamu_can_plan()) with check (public.chamu_can_plan());
create policy chamu_arch_del on public.chamu_journal_archive for delete to authenticated using (public.chamu_can_plan());

revoke all on public.chamu_plans, public.chamu_service_plans, public.chamu_plan_requests, public.chamu_plan_sign_log, public.chamu_journal_archive from anon, authenticated, public;
grant select, insert, update, delete on public.chamu_plans to authenticated;
grant select, insert, update, delete on public.chamu_service_plans to authenticated;
grant select, insert on public.chamu_plan_requests to authenticated;
grant select on public.chamu_plan_sign_log to authenticated;
grant select, insert, update, delete on public.chamu_journal_archive to authenticated;
grant all on public.chamu_plans, public.chamu_service_plans, public.chamu_plan_requests, public.chamu_plan_sign_log, public.chamu_journal_archive to service_role;

grant usage, select on sequence public.chamu_plans_id_seq to authenticated, service_role;
grant usage, select on sequence public.chamu_service_plans_id_seq to authenticated, service_role;
grant usage, select on sequence public.chamu_plan_requests_id_seq to authenticated, service_role;
grant usage, select on sequence public.chamu_plan_sign_log_id_seq to service_role;

insert into storage.buckets (id, name, public)
values ('chamu-docs', 'chamu-docs', false)
on conflict (id) do update set public = false;

drop policy if exists chamu_docs_sel on storage.objects;
drop policy if exists chamu_docs_ins on storage.objects;
drop policy if exists chamu_docs_upd on storage.objects;
drop policy if exists chamu_docs_del on storage.objects;
create policy chamu_docs_sel on storage.objects for select to authenticated
  using (bucket_id = 'chamu-docs' and public.chamu_can());
create policy chamu_docs_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'chamu-docs' and public.chamu_can_plan());
create policy chamu_docs_upd on storage.objects for update to authenticated
  using (bucket_id = 'chamu-docs' and public.chamu_can_plan())
  with check (bucket_id = 'chamu-docs' and public.chamu_can_plan());
create policy chamu_docs_del on storage.objects for delete to authenticated
  using (bucket_id = 'chamu-docs' and public.chamu_can_plan());

comment on table public.chamu_plans is '茶夢の個別支援計画。利用者×期で1行。署名日時は chamu_plan_sign_onsite だけが入れる。';
comment on table public.chamu_service_plans is '茶夢のサービス等利用計画（居宅サービス計画書を含む）。body_text は書き起こし。ファイルは chamu-docs。';
comment on table public.chamu_plan_requests is '個別支援計画のAI下書き依頼。待ちの挿入で chamu-plan-draft を呼ぶ。';
comment on table public.chamu_plan_sign_log is '茶夢の計画の対面署名。追記専用。signed_on は日本時間の当日。';
comment on table public.chamu_journal_archive is '茶夢日誌の過去分取り込み用。請求の chamu_journal とは別。';

notify pgrst, 'reload schema';

-- 取り込みの形（実行しない。氏名は入れない）。
-- 利用者の追加は画面「茶夢 → 利用者」でもできる。name 以外は初期値がある。
-- insert into public.chamu_users (name, kana, sort, active) values ('氏名', 'カナ', 10, true);
--
-- 既存計画。署名日時は入れられない（署名RPCだけ）。紙で署名済みなら note に書き、状態は本文を入れてから本案確定にする。
-- insert into public.chamu_plans (user_id, term_no, start_on, end_on, author, assessment, monitoring, genan, kaigi, honan, status, imported_from, note)
-- values ('利用者のuuid', 1, '2026-05-01', '2026-10-31', '齊藤 連', '…', '…', '…', '…', '…', '本案確定', '既存の計画書', '取り込み前に署名済み（画像は紙）');
--
-- 日誌アーカイブ。user_id が分かれば入れる。未登録の人は user_name だけ（あとで利用者を足して user_id を埋める）。
-- insert into public.chamu_journal_archive (journal_date, user_id, user_name, present, start_time, end_time, meal, support_note, raw, source)
-- values ('2026-09-01', null, '氏名', true, '10:30', '16:30', 'あり', '支援の文章', '{"列名":"元の値"}'::jsonb, 'sheet');
