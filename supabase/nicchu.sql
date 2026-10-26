-- 日中一時支援（星心会レスパイトスタジオ）。居宅介護の kin_visit とは別テーブル。kin_* は変更しない。
-- 読む・書く: nicchu_can()（担当フラグ / 所属が日中一時支援・レスパイト・日中一時 / 事務・管理者・児発管 / 会長）
-- 署名の列は残す。画面は署名を受け取らない（印刷して市役所へ出す）。利用ありは時刻・送迎・食事・活動・ご様子だけで保存できる。
-- 適用: Supabase SQL Editor にこのファイルを貼って Run（再実行できる）
-- 利用者・記入者の実名はこのファイルに置かない。画面の「利用者を追加」か、次の形で登録する:
--   insert into public.nicchu_user(name, kana, sort) values ('氏名', 'ふりがな', 1);
--   insert into public.nicchu_helper(name, sort) values ('記入者名', 1);
-- 担当職員（所属がレオなどのままでよい）:
--   update public.staff_profiles set nicchu = true where user_id = '<auth.users の id>';

alter table public.staff_profiles add column if not exists nicchu boolean not null default false;

create or replace function public.nicchu_can()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(
    public.can_manage()
    or coalesce(public.is_chair(), false)
    or exists (
      select 1 from public.staff_profiles
      where user_id = auth.uid()
        and active
        and (nicchu or office in ('日中一時支援', 'レスパイト', '日中一時'))
    ),
    false)
$$;

revoke all on function public.nicchu_can() from public, anon;
grant execute on function public.nicchu_can() to authenticated;

create table if not exists public.nicchu_user (
  id bigint generated always as identity primary key,
  name text not null unique check (char_length(name) between 1 and 100),
  kana text check (char_length(kana) <= 100),
  active boolean not null default true,
  sort int not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.nicchu_helper (
  id bigint generated always as identity primary key,
  name text not null unique check (char_length(name) between 1 and 60),
  active boolean not null default true,
  sort int not null default 0
);

create table if not exists public.nicchu_day (
  id bigint generated always as identity primary key,
  service_date date not null unique,
  staff_name text not null check (char_length(staff_name) between 1 and 60),
  weather text check (weather is null or weather in ('晴れ', 'くもり', '雨', '雪')),
  meal_menu text check (char_length(meal_menu) <= 500),
  general_notes text check (char_length(general_notes) <= 2000),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);

create table if not exists public.nicchu_record (
  id bigint generated always as identity primary key,
  day_id bigint not null references public.nicchu_day(id) on delete cascade,
  user_id bigint not null references public.nicchu_user(id),
  present boolean not null default true,
  start_time time,
  end_time time,
  actual_minutes int generated always as (
    case when start_time is not null and end_time is not null
      then (extract(epoch from (end_time - start_time)) / 60)::int
    end
  ) stored,
  transport text check (transport is null or transport in ('往復', '迎えのみ', '送りのみ', 'なし')),
  meal_served text check (meal_served is null or meal_served in ('あり', 'なし')),
  activity text check (char_length(activity) <= 2000),
  state text check (char_length(state) <= 2000),
  signer_kind text check (signer_kind is null or signer_kind in ('本人', 'ご家族', '署名困難', 'あとで署名')),
  sign_reason text check (char_length(sign_reason) <= 500),
  signature text check (signature is null or (signature like 'data:image/png;base64,%' and char_length(signature) <= 300000)),
  sign_status text check (sign_status is null or sign_status in ('署名待ち', '署名済')),
  signed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (day_id, user_id),
  constraint nicchu_record_when_present check (not present or (
    start_time is not null and end_time is not null and end_time > start_time
    and transport is not null and meal_served is not null
    and char_length(btrim(coalesce(activity, ''))) > 0
    and char_length(btrim(coalesce(state, ''))) > 0
  )),
  constraint nicchu_record_sign_shape check (
    (signer_kind is null and sign_status is null and signature is null and sign_reason is null and signed_at is null)
    or (signer_kind = 'あとで署名' and sign_status = '署名待ち' and signature is null and signed_at is null)
    or (signer_kind = '署名困難' and sign_status = '署名済' and signature is null and char_length(btrim(coalesce(sign_reason, ''))) > 0)
    or (signer_kind in ('本人', 'ご家族') and sign_status = '署名済' and signature is not null and signed_at is not null)
  ),
  constraint nicchu_record_when_absent check (present or (
    start_time is null and end_time is null and transport is null and meal_served is null
    and activity is null and state is null and signer_kind is null and sign_reason is null
    and signature is null and sign_status is null and signed_at is null
  ))
);

create table if not exists public.nicchu_sign_log (
  id bigint generated always as identity primary key,
  record_id bigint not null references public.nicchu_record(id) on delete cascade,
  signer_kind text not null check (signer_kind in ('本人', 'ご家族', '署名困難')),
  sign_reason text check (char_length(sign_reason) <= 500),
  signature text check (signature is null or (signature like 'data:image/png;base64,%' and char_length(signature) <= 300000)),
  signed_at timestamptz not null default now(),
  signed_by uuid default auth.uid(),
  constraint nicchu_sign_log_shape check (
    (signer_kind = '署名困難' and signature is null and char_length(btrim(coalesce(sign_reason, ''))) > 0)
    or (signer_kind in ('本人', 'ご家族') and signature is not null)
  )
);

-- すでに作った表の制約を、署名なしでも保存できる形に揃える（再実行できる）
alter table public.nicchu_record drop constraint if exists nicchu_record_when_present;
alter table public.nicchu_record add constraint nicchu_record_when_present check (not present or (
  start_time is not null and end_time is not null and end_time > start_time
  and transport is not null and meal_served is not null
  and char_length(btrim(coalesce(activity, ''))) > 0
  and char_length(btrim(coalesce(state, ''))) > 0
));
alter table public.nicchu_record drop constraint if exists nicchu_record_sign_shape;
alter table public.nicchu_record add constraint nicchu_record_sign_shape check (
  (signer_kind is null and sign_status is null and signature is null and sign_reason is null and signed_at is null)
  or (signer_kind = 'あとで署名' and sign_status = '署名待ち' and signature is null and signed_at is null)
  or (signer_kind = '署名困難' and sign_status = '署名済' and signature is null and char_length(btrim(coalesce(sign_reason, ''))) > 0)
  or (signer_kind in ('本人', 'ご家族') and sign_status = '署名済' and signature is not null and signed_at is not null)
);

create index if not exists nicchu_day_date on public.nicchu_day(service_date desc);
create index if not exists nicchu_record_day on public.nicchu_record(day_id);
create index if not exists nicchu_record_pending on public.nicchu_record(user_id) where present and sign_status = '署名待ち';
create index if not exists nicchu_sign_log_record on public.nicchu_sign_log(record_id);

alter table public.nicchu_user enable row level security;
alter table public.nicchu_helper enable row level security;
alter table public.nicchu_day enable row level security;
alter table public.nicchu_record enable row level security;
alter table public.nicchu_sign_log enable row level security;

drop policy if exists nicchu_user_rw on public.nicchu_user;
create policy nicchu_user_rw on public.nicchu_user for all to authenticated
  using (public.nicchu_can()) with check (public.nicchu_can());
drop policy if exists nicchu_helper_rw on public.nicchu_helper;
create policy nicchu_helper_rw on public.nicchu_helper for all to authenticated
  using (public.nicchu_can()) with check (public.nicchu_can());
drop policy if exists nicchu_day_rw on public.nicchu_day;
create policy nicchu_day_rw on public.nicchu_day for all to authenticated
  using (public.nicchu_can()) with check (public.nicchu_can());
drop policy if exists nicchu_record_rw on public.nicchu_record;
create policy nicchu_record_rw on public.nicchu_record for all to authenticated
  using (public.nicchu_can()) with check (public.nicchu_can());
drop policy if exists nicchu_sign_log_read on public.nicchu_sign_log;
create policy nicchu_sign_log_read on public.nicchu_sign_log for select to authenticated
  using (public.nicchu_can());
drop policy if exists nicchu_sign_log_ins on public.nicchu_sign_log;
create policy nicchu_sign_log_ins on public.nicchu_sign_log for insert to authenticated
  with check (public.nicchu_can());
-- 日の削除で署名履歴も消える（画面からは履歴だけは消さない）。更新はできない。
drop policy if exists nicchu_sign_log_del on public.nicchu_sign_log;
create policy nicchu_sign_log_del on public.nicchu_sign_log for delete to authenticated
  using (public.nicchu_can());

revoke all on public.nicchu_user, public.nicchu_helper, public.nicchu_day, public.nicchu_record, public.nicchu_sign_log from anon, public;
grant select, insert, update, delete on public.nicchu_user, public.nicchu_helper, public.nicchu_day, public.nicchu_record to authenticated;
grant select, insert, delete on public.nicchu_sign_log to authenticated;
revoke all on sequence public.nicchu_user_id_seq, public.nicchu_helper_id_seq, public.nicchu_day_id_seq, public.nicchu_record_id_seq, public.nicchu_sign_log_id_seq from anon, public;
grant usage, select on sequence public.nicchu_user_id_seq, public.nicchu_helper_id_seq, public.nicchu_day_id_seq, public.nicchu_record_id_seq, public.nicchu_sign_log_id_seq to authenticated;

-- あとで署名。選んだ行が全部「署名待ち」のときだけ、同じ署名を入れて履歴を残す（途中失敗は全部戻る）
create or replace function public.nicchu_sign_later(p_ids bigint[], p_kind text, p_reason text, p_signature text)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  n int := 0;
  distinct_users int;
  distinct_ids int;
  r public.nicchu_record;
  reason text := nullif(btrim(coalesce(p_reason, '')), '');
  sig text := nullif(p_signature, '');
begin
  if not public.nicchu_can() then raise exception '日中一時の担当だけが署名できます'; end if;
  if p_kind is null or p_kind not in ('本人', 'ご家族', '署名困難') then raise exception '署名する人を選んでください'; end if;
  if p_kind = '署名困難' and reason is null then raise exception '署名困難の理由を入れてください'; end if;
  if p_kind <> '署名困難' and (sig is null or sig not like 'data:image/png;base64,%' or char_length(sig) > 300000) then
    raise exception '署名がありません';
  end if;
  if p_ids is null or array_length(p_ids, 1) is null then raise exception '署名する記録を選んでください'; end if;
  select count(*) into distinct_ids from (select distinct x from unnest(p_ids) as t(x)) s;
  select count(distinct user_id) into distinct_users from public.nicchu_record where id = any(p_ids);
  if distinct_users > 1 then raise exception '一度に署名できるのはお一人分です'; end if;
  for r in
    select * from public.nicchu_record
    where id = any(p_ids) and present and sign_status = '署名待ち'
    order by id
    for update
  loop
    update public.nicchu_record set
      signer_kind = p_kind,
      sign_reason = case when p_kind = '署名困難' then reason else null end,
      signature = case when p_kind = '署名困難' then null else sig end,
      sign_status = '署名済',
      signed_at = now(),
      updated_at = now()
    where id = r.id;
    insert into public.nicchu_sign_log(record_id, signer_kind, sign_reason, signature)
    values (
      r.id, p_kind,
      case when p_kind = '署名困難' then reason else null end,
      case when p_kind = '署名困難' then null else sig end
    );
    n := n + 1;
  end loop;
  if n = 0 or n <> distinct_ids then raise exception '署名待ちの記録がありません。画面を読み込み直してください'; end if;
  return n;
end $$;

revoke all on function public.nicchu_sign_later(bigint[], text, text, text) from public, anon;
grant execute on function public.nicchu_sign_later(bigint[], text, text, text) to authenticated;

-- 第８号様式（実績記録票）に書く受給者情報。実名や番号はこのファイルに置かない。
alter table public.nicchu_user add column if not exists recipient_no text;
alter table public.nicchu_user add column if not exists kubun text;
alter table public.nicchu_user add column if not exists monthly_quota int;
alter table public.nicchu_user add column if not exists guardian_name text;
alter table public.nicchu_user drop constraint if exists nicchu_user_recipient_no_chk;
alter table public.nicchu_user add constraint nicchu_user_recipient_no_chk check (recipient_no is null or recipient_no ~ '^[0-9]{1,10}$');
alter table public.nicchu_user drop constraint if exists nicchu_user_kubun_chk;
alter table public.nicchu_user add constraint nicchu_user_kubun_chk check (kubun is null or kubun in ('区分１', '区分２', '区分３'));
alter table public.nicchu_user drop constraint if exists nicchu_user_quota_chk;
alter table public.nicchu_user add constraint nicchu_user_quota_chk check (monthly_quota is null or monthly_quota between 1 and 31);
alter table public.nicchu_user drop constraint if exists nicchu_user_guardian_chk;
alter table public.nicchu_user add constraint nicchu_user_guardian_chk check (char_length(guardian_name) <= 100);

create table if not exists public.nicchu_office (
  id int primary key check (id = 1),
  office_no text check (office_no is null or office_no ~ '^[0-9]{1,10}$'),
  office_name text check (char_length(office_name) <= 200),
  updated_at timestamptz not null default now()
);
insert into public.nicchu_office(id, office_name)
values (1, E'一般社団法人 心理社会的リハビリテーション・星心会\n星心会レスパイトスタジオ')
on conflict (id) do nothing;

alter table public.nicchu_office enable row level security;
drop policy if exists nicchu_office_rw on public.nicchu_office;
create policy nicchu_office_rw on public.nicchu_office for all to authenticated
  using (public.nicchu_can()) with check (public.nicchu_can());
revoke all on public.nicchu_office from anon, public;
grant select, insert, update, delete on public.nicchu_office to authenticated;
