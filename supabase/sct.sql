-- ストレスチェック実施者養成研修（sct_）。外部の受講者が日時固定の開催を予約し、運営が修了を判定する。
-- 法定研修（ht_）とは別。ht_ は職員の法定研修、こちらは歯科医師・看護師・精神保健福祉士・公認心理師向け。
-- 適用: Supabase SQL Editor にこのファイルを貼って Run。再実行できる。
-- 帳簿・視聴ログ・本人確認・修了証控え・決済・Meet受信は削除しない（sct_no_delete）。自動削除のジョブは作らない。
-- 権限: app_metadata.role が 事務 または sct_admin。職員プロフィールの my_role() が同じ値でも運営とみなす。
-- 修了: 対象科目ごとに必要分数を満たし、本人確認済み。確認テストは記録できるが合否は要件にしない。
-- 全免除（労働衛生コンサルタント）は受講不要・課金なし・修了証なし。科目1免除（衛生管理者）は 10,800円で科目2と3。
-- それ以外は3科目 12,800円（税込）。金額の正は sct_price。画面の sct_logic.js と揃える。
-- カード決済は Square の支払いリンク。入金の確定は square-webhook だけ。旧 Stripe の列と sct_stripe_events は履歴として残す。

set check_function_bodies = off;

create or replace function public.sct_is_admin() returns boolean
language plpgsql stable security definer set search_path = public as $$
declare r text;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('事務', 'sct_admin') then
    return true;
  end if;
  begin
    r := public.my_role();
  exception
    when undefined_function or undefined_table then
      return false;
  end;
  return coalesce(r in ('事務', 'sct_admin'), false);
end $$;

create or replace function public.sct_price(p_plan text) returns integer
language sql immutable as $$
  select case p_plan when 'bundle' then 12800 when 'exempt_s1' then 10800 when 'exempt_all' then 0 else null end
$$;

create or replace function public.sct_no_delete() returns trigger
language plpgsql as $$
begin
  raise exception 'この記録は削除しません（帳簿・視聴ログ・本人確認・修了証控え・決済は永続）';
end $$;

create table if not exists public.sct_subjects (
  id int primary key check (id in (1, 2, 3)),
  name text not null,
  min_minutes int not null check (min_minutes > 0),
  note text
);
insert into public.sct_subjects (id, name, min_minutes, note) values
  (1, '労働者の健康管理', 120, '2時間以上'),
  (2, '事業場におけるメンタルヘルス対策', 90, '1.5時間以上'),
  (3, '職場における個々の労働者及び労働者の集団への支援の方法', 90, '1.5時間以上')
on conflict (id) do update set name = excluded.name, min_minutes = excluded.min_minutes, note = excluded.note;

create table if not exists public.sct_instructors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now()
);
insert into public.sct_instructors (id, name, active, note) values
  ('11111111-1111-4111-8111-111111111111', '西岡愛梨', true, '既定の講師。実務年数要件の照合は運用で確認する。')
on conflict (id) do nothing;

create table if not exists public.sct_settings (
  key text primary key,
  value text not null,
  note text
);
insert into public.sct_settings (key, value, note) values
  ('法人名', '一般社団法人 心理社会的リハビリテーション・星心会', '修了証に出す'),
  ('証明者', '代表理事 齊藤連', '修了証の名義。画面で直せる'),
  ('返金', '開催7日前まで全額（決済手数料の実費を控除できる）。6日前から前日までは半額。当日以降と無断欠席は返金しない。主催都合は全額。振替を優先して案内する。', '運営向けの案内文')
on conflict (key) do nothing;

create table if not exists public.sct_profiles (
  user_id uuid primary key references auth.users(id),
  full_name text not null default '',
  kana text,
  email text,
  license_type text check (license_type is null or license_type in ('歯科医師', '看護師', '精神保健福祉士', '公認心理師')),
  license_no text,
  exemption text not null default 'none' check (exemption in ('none', 'subject1', 'all')),
  exemption_status text not null default 'none' check (exemption_status in ('none', 'pending', 'approved', 'rejected')),
  exemption_proof_path text,
  exemption_note text,
  identity_status text not null default 'unverified' check (identity_status in ('unverified', 'pending', 'verified', 'rejected')),
  identity_proof_path text,
  identity_note text,
  identity_checked_at timestamptz,
  identity_checked_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sct_sessions (
  id uuid primary key default gen_random_uuid(),
  subject_id int not null references public.sct_subjects(id),
  instructor_id uuid references public.sct_instructors(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity int not null check (capacity > 0),
  status text not null default 'draft' check (status in ('draft', 'open', 'closed', 'cancelled', 'done')),
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
-- Meet の URL と space 名は、予約済みの本人と運営だけが見る（未入金の一覧には出さない）
create table if not exists public.sct_session_access (
  session_id uuid primary key references public.sct_sessions(id) on delete cascade,
  meet_url text,
  meet_space text
);

create table if not exists public.sct_bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  session_id uuid not null references public.sct_sessions(id),
  status text not null default 'reserved' check (status in ('reserved', 'cancelled', 'attended', 'excluded', 'no_show')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists sct_booking_live on public.sct_bookings (user_id, session_id) where status <> 'cancelled';

create table if not exists public.sct_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  plan text not null check (plan in ('bundle', 'exempt_s1', 'exempt_all')),
  amount_yen int not null check (amount_yen >= 0),
  method text not null check (method in ('square', 'bank', 'none', 'stripe')),
  status text not null check (status in ('pending', 'paid', 'failed', 'waived', 'refund_pending', 'refunded_full', 'refunded_half', 'refund_none')),
  square_payment_link_id text,
  square_order_id text,
  square_payment_id text,
  processor_fee_yen int,
  -- 旧カード決済の控え。新規は書かない。適用済みの行を残すため列は消さない。
  stripe_session_id text,
  stripe_payment_intent text,
  stripe_fee_yen int,
  paid_at timestamptz,
  refund_amount_yen int,
  refund_reason text,
  refunded_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);
-- 既に Stripe 版の表がある場合でも足せる。supabase/sct_square.sql と同じ。
alter table public.sct_payments add column if not exists square_payment_link_id text;
alter table public.sct_payments add column if not exists square_order_id text;
alter table public.sct_payments add column if not exists square_payment_id text;
alter table public.sct_payments add column if not exists processor_fee_yen int;
update public.sct_payments set processor_fee_yen = stripe_fee_yen
  where processor_fee_yen is null and stripe_fee_yen is not null;
do $$
declare r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public' and rel.relname = 'sct_payments' and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%method%'
  loop
    execute format('alter table public.sct_payments drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.sct_payments add constraint sct_payments_method_check
  check (method in ('square', 'bank', 'none', 'stripe'));
update public.sct_payments set method = 'square' where method = 'stripe' and status = 'pending';
create unique index if not exists sct_pay_stripe on public.sct_payments (stripe_session_id) where stripe_session_id is not null;
create unique index if not exists sct_pay_square_link on public.sct_payments (square_payment_link_id) where square_payment_link_id is not null;
create unique index if not exists sct_pay_square_order on public.sct_payments (square_order_id) where square_order_id is not null;
create unique index if not exists sct_pay_square_payment on public.sct_payments (square_payment_id) where square_payment_id is not null;
create unique index if not exists sct_pay_active on public.sct_payments (user_id)
  where status in ('pending', 'paid', 'waived', 'refund_pending', 'refunded_half', 'refund_none');

create table if not exists public.sct_attendance (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.sct_bookings(id),
  user_id uuid not null,
  session_id uuid not null,
  source text not null default 'manual' check (source in ('manual', 'meet')),
  joined_at timestamptz,
  left_at timestamptz,
  camera_off boolean not null default false,
  camera_off_note text,
  note text,
  recorded_by text default lower(coalesce(auth.jwt() ->> 'email', '')),
  created_at timestamptz not null default now(),
  check (left_at is null or joined_at is null or left_at >= joined_at)
);

create table if not exists public.sct_meet_events (
  id uuid primary key default gen_random_uuid(),
  message_id text,
  event_type text,
  space_name text,
  resource_name text,
  display_name text,
  start_time timestamptz,
  end_time timestamptz,
  payload jsonb not null default '{}'::jsonb,
  note text,
  received_at timestamptz not null default now()
);
create unique index if not exists sct_meet_msg on public.sct_meet_events (message_id) where message_id is not null;

create table if not exists public.sct_stripe_events (
  id text primary key,
  type text,
  payment_id uuid,
  note text,
  received_at timestamptz not null default now()
);

create table if not exists public.sct_square_events (
  id text primary key,
  type text,
  payment_id uuid,
  note text,
  received_at timestamptz not null default now()
);

create table if not exists public.sct_certificates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  issued_at timestamptz not null default now(),
  issued_on date not null,
  full_name text not null,
  subject_ids int[] not null,
  instructor_names text[] not null default '{}',
  snapshot jsonb not null,
  issued_by text,
  created_at timestamptz not null default now()
);
create unique index if not exists sct_cert_user on public.sct_certificates (user_id);

create table if not exists public.sct_quiz (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  subject_id int not null references public.sct_subjects(id),
  score int check (score is null or score between 0 and 100),
  passed boolean,
  note text,
  taken_at timestamptz not null default now()
);

-- 受講者は確認の確定（verified / approved）を自分で付けられない
create or replace function public.sct_profile_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.user_id is distinct from auth.uid() and not public.sct_is_admin() then
      raise exception '自分のプロフィールだけ作れます';
    end if;
  end if;
  if not public.sct_is_admin() then
    new.user_id := case when tg_op = 'INSERT' then auth.uid() else old.user_id end;
    new.email := lower(coalesce(auth.jwt() ->> 'email', ''));
    new.identity_checked_at := case when tg_op = 'UPDATE' then old.identity_checked_at else null end;
    new.identity_checked_by := case when tg_op = 'UPDATE' then old.identity_checked_by else null end;
    if tg_op = 'UPDATE' and old.identity_status = 'verified' and new.identity_proof_path is not distinct from old.identity_proof_path then
      new.identity_status := 'verified';
    elsif tg_op = 'UPDATE' and new.identity_proof_path is distinct from old.identity_proof_path then
      new.identity_status := case when new.identity_proof_path is null then 'unverified' else 'pending' end;
    elsif new.identity_status is null or new.identity_status not in ('unverified', 'pending') then
      new.identity_status := case when tg_op = 'UPDATE' then old.identity_status else 'unverified' end;
    end if;
    if tg_op = 'UPDATE' and old.exemption_status = 'approved'
       and new.exemption is not distinct from old.exemption
       and new.exemption_proof_path is not distinct from old.exemption_proof_path then
      new.exemption_status := 'approved';
    elsif new.exemption is distinct from 'none' and (tg_op = 'INSERT' or new.exemption is distinct from old.exemption or new.exemption_proof_path is distinct from old.exemption_proof_path) then
      new.exemption_status := 'pending';
    elsif new.exemption = 'none' then
      new.exemption_status := 'none';
    elsif tg_op = 'UPDATE' and new.exemption_status is distinct from old.exemption_status and new.exemption_status not in ('none', 'pending') then
      raise exception '免除の確定は運営だけができます';
    end if;
  elsif new.identity_status = 'verified' and (tg_op = 'INSERT' or old.identity_status is distinct from 'verified') then
    new.identity_checked_at := coalesce(new.identity_checked_at, now());
    new.identity_checked_by := coalesce(nullif(new.identity_checked_by, ''), lower(coalesce(auth.jwt() ->> 'email', '')));
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists sct_profile_guard on public.sct_profiles;
create trigger sct_profile_guard before insert or update on public.sct_profiles
  for each row execute function public.sct_profile_guard();

create or replace function public.sct_booking_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  se public.sct_sessions;
  prof public.sct_profiles;
  seats int;
begin
  if tg_op = 'DELETE' then raise exception '予約は取り消して残します'; end if;
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    new.updated_at := now();
    return new;
  end if;
  select * into se from public.sct_sessions where id = new.session_id for update;
  if se.id is null then raise exception '開催がありません'; end if;
  if tg_op = 'INSERT' then
    if new.user_id is distinct from auth.uid() and not public.sct_is_admin() then
      raise exception '自分の予約だけ作れます';
    end if;
    if not exists (select 1 from public.sct_payments p where p.user_id = new.user_id and p.status in ('paid', 'waived')) then
      raise exception '入金後に予約できます';
    end if;
    select * into prof from public.sct_profiles where user_id = new.user_id;
    if prof.exemption = 'all' and prof.exemption_status = 'approved' then
      raise exception '全免除の方は受講不要です';
    end if;
    if prof.exemption = 'subject1' and prof.exemption_status = 'approved' and se.subject_id = 1 then
      raise exception '科目1は免除です';
    end if;
    if not public.sct_is_admin() and (se.status <> 'open' or se.starts_at <= now()) then
      raise exception '予約できない開催です';
    end if;
    select count(*) into seats from public.sct_bookings
      where session_id = new.session_id and status in ('reserved', 'attended', 'excluded', 'no_show');
    if seats >= se.capacity then raise exception '定員に達しています'; end if;
    return new;
  end if;
  if not public.sct_is_admin() then
    if old.user_id is distinct from auth.uid() then raise exception 'forbidden'; end if;
    if new.status is distinct from old.status then
      if not (old.status = 'reserved' and new.status = 'cancelled') then
        raise exception '受講者が変えられるのは予約の取消だけです';
      end if;
      if se.starts_at <= now() then raise exception '開始後の取消は運営へ連絡してください'; end if;
    end if;
    new.user_id := old.user_id;
    new.session_id := old.session_id;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists sct_booking_guard on public.sct_bookings;
create trigger sct_booking_guard before insert or update or delete on public.sct_bookings
  for each row execute function public.sct_booking_guard();

create or replace function public.sct_attendance_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare b public.sct_bookings;
begin
  if tg_op = 'DELETE' then perform public.sct_no_delete(); end if;
  select * into b from public.sct_bookings where id = new.booking_id;
  if b.id is null then raise exception '予約がありません'; end if;
  new.user_id := b.user_id;
  new.session_id := b.session_id;
  if new.camera_off then
    update public.sct_bookings set status = 'excluded', updated_at = now()
      where id = b.id and status <> 'cancelled';
  end if;
  return new;
end $$;
drop trigger if exists sct_attendance_guard on public.sct_attendance;
create trigger sct_attendance_guard before insert or update or delete on public.sct_attendance
  for each row execute function public.sct_attendance_guard();

create or replace function public.sct_payment_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  prof public.sct_profiles;
  expect_plan text;
  expect_amt int;
begin
  if tg_op = 'DELETE' then perform public.sct_no_delete(); end if;
  expect_amt := public.sct_price(new.plan);
  if expect_amt is null or new.amount_yen is distinct from expect_amt then
    raise exception '金額が料金区分と一致しません';
  end if;
  if new.plan = 'exempt_all' and new.status not in ('waived', 'failed') then
    raise exception '全免除は課金しません';
  end if;
  if new.refund_amount_yen is not null and (new.refund_amount_yen < 0 or new.refund_amount_yen > new.amount_yen) then
    raise exception '返金額が不正です';
  end if;
  if tg_op = 'INSERT' then
    select * into prof from public.sct_profiles where user_id = new.user_id;
    if prof.user_id is null then raise exception 'プロフィールがありません'; end if;
    if prof.exemption <> 'none' and prof.exemption_status = 'pending' then
      raise exception '免除証明の確認待ちです';
    end if;
    expect_plan := case
      when prof.exemption = 'all' and prof.exemption_status = 'approved' then 'exempt_all'
      when prof.exemption = 'subject1' and prof.exemption_status = 'approved' then 'exempt_s1'
      else 'bundle' end;
    if new.plan is distinct from expect_plan then
      raise exception 'プロフィールの免除区分と料金が違います';
    end if;
  elsif old.status in ('paid', 'waived', 'refunded_full', 'refunded_half', 'refund_none')
        and new.amount_yen is distinct from old.amount_yen then
    raise exception '確定済みの金額は変えません';
  end if;
  if new.status in ('paid', 'waived') and new.paid_at is null then new.paid_at := now(); end if;
  if new.status in ('refunded_full', 'refunded_half', 'refund_none') and new.refunded_at is null then
    new.refunded_at := now();
  end if;
  return new;
end $$;
drop trigger if exists sct_payment_guard on public.sct_payments;
create trigger sct_payment_guard before insert or update or delete on public.sct_payments
  for each row execute function public.sct_payment_guard();

drop trigger if exists sct_cert_no_delete on public.sct_certificates;
create trigger sct_cert_no_delete before delete on public.sct_certificates
  for each row execute function public.sct_no_delete();
drop trigger if exists sct_meet_no_delete on public.sct_meet_events;
create trigger sct_meet_no_delete before delete on public.sct_meet_events
  for each row execute function public.sct_no_delete();
drop trigger if exists sct_stripe_no_delete on public.sct_stripe_events;
create trigger sct_stripe_no_delete before delete on public.sct_stripe_events
  for each row execute function public.sct_no_delete();
drop trigger if exists sct_square_no_delete on public.sct_square_events;
create trigger sct_square_no_delete before delete on public.sct_square_events
  for each row execute function public.sct_no_delete();
drop trigger if exists sct_profile_no_delete on public.sct_profiles;
create trigger sct_profile_no_delete before delete on public.sct_profiles
  for each row execute function public.sct_no_delete();

-- 修了判定。画面の Sct.progress と同じ規則（科目ごとの分数、カメラOFFはその回を0、本人確認、テストは見ない）
create or replace function public.sct_progress(p_user uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := coalesce(p_user, auth.uid());
  prof public.sct_profiles;
  required int[];
  subj jsonb := '[]'::jsonb;
  rec record;
  mins int;
  names text[];
  complete boolean := false;
  reason text;
  cert uuid;
begin
  if uid is null then raise exception 'login required'; end if;
  if uid is distinct from auth.uid() and not public.sct_is_admin()
     and coalesce(auth.jwt() ->> 'role', '') is distinct from 'service_role' then
    raise exception 'forbidden';
  end if;
  select * into prof from public.sct_profiles where user_id = uid;
  if prof.user_id is null then
    return jsonb_build_object('complete', false, 'blocked_reason', 'プロフィールがありません', 'required', '[]'::jsonb, 'subjects', '[]'::jsonb);
  end if;
  if prof.exemption = 'all' and prof.exemption_status = 'approved' then required := '{}';
  elsif prof.exemption = 'subject1' and prof.exemption_status = 'approved' then required := '{2,3}';
  else required := '{1,2,3}';
  end if;

  for rec in select s.id, s.name, s.min_minutes from public.sct_subjects s order by s.id loop
    select coalesce(sum(x.mins), 0) into mins from (
      select case
        when b.status in ('excluded', 'no_show') then 0
        when exists (select 1 from public.sct_attendance a where a.booking_id = b.id and a.camera_off) then 0
        else least(
          greatest(0, floor(extract(epoch from (se.ends_at - se.starts_at)) / 60))::int,
          coalesce((
            select max(greatest(0, floor(extract(epoch from (a.left_at - a.joined_at)) / 60))::int)
            from public.sct_attendance a
            where a.booking_id = b.id and a.joined_at is not null and a.left_at is not null and not a.camera_off
          ), 0)
        )
      end as mins
      from public.sct_bookings b
      join public.sct_sessions se on se.id = b.session_id
      where b.user_id = uid and se.subject_id = rec.id and b.status <> 'cancelled'
    ) x;
    select coalesce(array_agg(distinct i.name), '{}') into names
    from public.sct_bookings b
    join public.sct_sessions se on se.id = b.session_id
    left join public.sct_instructors i on i.id = se.instructor_id
    where b.user_id = uid and se.subject_id = rec.id and b.status in ('reserved', 'attended')
      and not exists (select 1 from public.sct_attendance a where a.booking_id = b.id and a.camera_off)
      and coalesce((
        select max(greatest(0, floor(extract(epoch from (a.left_at - a.joined_at)) / 60))::int)
        from public.sct_attendance a
        where a.booking_id = b.id and a.joined_at is not null and a.left_at is not null and not a.camera_off
      ), 0) > 0;
    subj := subj || jsonb_build_array(jsonb_build_object(
      'id', rec.id, 'name', rec.name, 'min_minutes', rec.min_minutes, 'minutes', mins,
      'met', mins >= rec.min_minutes, 'required', rec.id = any(required), 'instructors', to_jsonb(names)
    ));
  end loop;

  if prof.exemption = 'all' and prof.exemption_status = 'approved' then
    reason := '労働衛生コンサルタント等の全免除のため受講不要です（修了証は発行しません）';
  elsif prof.identity_status is distinct from 'verified' then
    reason := '本人確認が済んでいません';
  elsif exists (select 1 from jsonb_array_elements(subj) e where (e->>'required')::boolean and not (e->>'met')::boolean) then
    reason := '視聴時間が足りない科目があります';
  elsif coalesce(array_length(required, 1), 0) = 0 then
    reason := '対象科目がありません';
  else
    complete := true;
  end if;
  select c.id into cert from public.sct_certificates c where c.user_id = uid order by c.issued_at limit 1;
  return jsonb_build_object(
    'user_id', uid, 'full_name', prof.full_name, 'license_type', prof.license_type,
    'exemption', prof.exemption, 'exemption_status', prof.exemption_status,
    'identity_status', prof.identity_status, 'required', to_jsonb(required), 'subjects', subj,
    'complete', complete, 'blocked_reason', reason, 'certificate_id', cert
  );
end $$;

create or replace function public.sct_issue_certificate(p_user uuid default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := coalesce(p_user, auth.uid());
  prog jsonb;
  cid uuid;
  org text;
  signer text;
  subjects jsonb;
  instructors jsonb;
  ids int[];
  names text[];
  note text;
  snap jsonb;
begin
  if uid is null then raise exception 'login required'; end if;
  if uid is distinct from auth.uid() and not public.sct_is_admin()
     and coalesce(auth.jwt() ->> 'role', '') is distinct from 'service_role' then
    raise exception 'forbidden';
  end if;
  select id into cid from public.sct_certificates where user_id = uid;
  if cid is not null then return cid; end if;
  prog := public.sct_progress(uid);
  if coalesce((prog->>'complete')::boolean, false) is not true then
    raise exception '%', coalesce(prog->>'blocked_reason', '修了条件を満たしていません');
  end if;
  select coalesce(value, '') into org from public.sct_settings where key = '法人名';
  select coalesce(value, '') into signer from public.sct_settings where key = '証明者';
  select coalesce(jsonb_agg(jsonb_build_object('id', (e->>'id')::int, 'name', e->>'name') order by (e->>'id')::int), '[]'::jsonb)
    into subjects
  from jsonb_array_elements(prog->'subjects') e
  where (e->>'required')::boolean;
  select coalesce(jsonb_agg(distinct n), '[]'::jsonb) into instructors
  from (
    select jsonb_array_elements_text(e->'instructors') as n
    from jsonb_array_elements(prog->'subjects') e
    where (e->>'required')::boolean
  ) q where n <> '';
  select coalesce(array_agg((e->>'id')::int order by (e->>'id')::int), '{}') into ids
  from jsonb_array_elements(subjects) e;
  select coalesce(array_agg(n order by n), '{}') into names from jsonb_array_elements_text(instructors) n;
  if (prog->>'exemption') = 'subject1' and (prog->>'exemption_status') = 'approved' then
    note := '科目1（労働者の健康管理）は衛生管理者の資格により免除';
  end if;
  snap := jsonb_build_object(
    'full_name', prog->>'full_name', 'issued_on', to_char(timezone('Asia/Tokyo', now()), 'YYYY-MM-DD'),
    'subjects', subjects, 'instructors', instructors, 'org', org, 'signer', signer,
    'license_type', prog->>'license_type', 'exemption_note', note
  );
  begin
    insert into public.sct_certificates (user_id, issued_on, full_name, subject_ids, instructor_names, snapshot, issued_by)
    values (uid, timezone('Asia/Tokyo', now())::date, prog->>'full_name', ids, names, snap, lower(coalesce(auth.jwt() ->> 'email', '')))
    returning id into cid;
  exception when unique_violation then
    select id into cid from public.sct_certificates where user_id = uid;
  end;
  return cid;
end $$;

-- 受講者の決済開始。金額はプロフィールから決め、クライアントの指定は使わない。カードは Square。
create or replace function public.sct_begin_payment()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  prof public.sct_profiles;
  v_plan text;
  v_amt int;
  existing public.sct_payments;
  nid uuid;
  st text;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  select * into prof from public.sct_profiles where user_id = auth.uid();
  if prof.user_id is null or coalesce(prof.full_name, '') = '' or prof.license_type is null then
    raise exception '氏名と資格種別を保存してください';
  end if;
  if prof.exemption <> 'none' and prof.exemption_status = 'pending' then
    raise exception '免除証明の確認待ちです';
  end if;
  v_plan := case
    when prof.exemption = 'all' and prof.exemption_status = 'approved' then 'exempt_all'
    when prof.exemption = 'subject1' and prof.exemption_status = 'approved' then 'exempt_s1'
    else 'bundle' end;
  v_amt := public.sct_price(v_plan);
  select * into existing from public.sct_payments
    where user_id = auth.uid() and status in ('pending', 'paid', 'waived', 'refund_pending', 'refunded_half', 'refund_none')
    order by created_at desc limit 1;
  if found and existing.status = 'pending'
     and (existing.plan is distinct from v_plan or existing.amount_yen is distinct from v_amt) then
    update public.sct_payments set status = 'failed', note = '料金区分が変わったため無効' where id = existing.id;
    existing.id := null;
  end if;
  if found and existing.id is not null and existing.status <> 'pending' then
    return jsonb_build_object('payment_id', existing.id, 'status', existing.status, 'amount_yen', existing.amount_yen, 'plan', existing.plan, 'already', true);
  end if;
  if found and existing.id is not null then
    return jsonb_build_object('payment_id', existing.id, 'status', 'pending', 'amount_yen', existing.amount_yen, 'plan', existing.plan, 'square_payment_link_id', existing.square_payment_link_id, 'square_order_id', existing.square_order_id, 'already', false);
  end if;
  st := case when v_amt = 0 then 'waived' else 'pending' end;
  insert into public.sct_payments (user_id, plan, amount_yen, method, status)
  values (auth.uid(), v_plan, v_amt, case when v_amt = 0 then 'none' else 'square' end, st)
  returning id into nid;
  return jsonb_build_object('payment_id', nid, 'status', st, 'amount_yen', v_amt, 'plan', v_plan, 'already', false);
end $$;

-- RLS
alter table public.sct_subjects enable row level security;
alter table public.sct_instructors enable row level security;
alter table public.sct_settings enable row level security;
alter table public.sct_profiles enable row level security;
alter table public.sct_sessions enable row level security;
alter table public.sct_session_access enable row level security;
alter table public.sct_bookings enable row level security;
alter table public.sct_payments enable row level security;
alter table public.sct_attendance enable row level security;
alter table public.sct_meet_events enable row level security;
alter table public.sct_stripe_events enable row level security;
alter table public.sct_square_events enable row level security;
alter table public.sct_certificates enable row level security;
alter table public.sct_quiz enable row level security;

drop policy if exists sct_subjects_r on public.sct_subjects;
create policy sct_subjects_r on public.sct_subjects for select to authenticated using (true);
drop policy if exists sct_subjects_w on public.sct_subjects;
create policy sct_subjects_w on public.sct_subjects for all to authenticated using (public.sct_is_admin()) with check (public.sct_is_admin());

drop policy if exists sct_instructors_r on public.sct_instructors;
create policy sct_instructors_r on public.sct_instructors for select to authenticated using (active or public.sct_is_admin());
drop policy if exists sct_instructors_w on public.sct_instructors;
create policy sct_instructors_w on public.sct_instructors for all to authenticated using (public.sct_is_admin()) with check (public.sct_is_admin());

drop policy if exists sct_settings_r on public.sct_settings;
create policy sct_settings_r on public.sct_settings for select to authenticated using (true);
drop policy if exists sct_settings_w on public.sct_settings;
create policy sct_settings_w on public.sct_settings for all to authenticated using (public.sct_is_admin()) with check (public.sct_is_admin());

drop policy if exists sct_profiles_r on public.sct_profiles;
create policy sct_profiles_r on public.sct_profiles for select to authenticated using (user_id = auth.uid() or public.sct_is_admin());
drop policy if exists sct_profiles_i on public.sct_profiles;
create policy sct_profiles_i on public.sct_profiles for insert to authenticated with check (user_id = auth.uid() or public.sct_is_admin());
drop policy if exists sct_profiles_u on public.sct_profiles;
create policy sct_profiles_u on public.sct_profiles for update to authenticated using (user_id = auth.uid() or public.sct_is_admin()) with check (user_id = auth.uid() or public.sct_is_admin());

drop policy if exists sct_sessions_r on public.sct_sessions;
create policy sct_sessions_r on public.sct_sessions for select to authenticated using (
  public.sct_is_admin() or status = 'open'
  or exists (select 1 from public.sct_bookings b where b.session_id = sct_sessions.id and b.user_id = auth.uid())
);
drop policy if exists sct_sessions_w on public.sct_sessions;
create policy sct_sessions_w on public.sct_sessions for insert to authenticated with check (public.sct_is_admin());
drop policy if exists sct_sessions_u on public.sct_sessions;
create policy sct_sessions_u on public.sct_sessions for update to authenticated using (public.sct_is_admin()) with check (public.sct_is_admin());
drop policy if exists sct_sessions_d on public.sct_sessions;
create policy sct_sessions_d on public.sct_sessions for delete to authenticated using (
  public.sct_is_admin() and status = 'draft' and not exists (select 1 from public.sct_bookings b where b.session_id = sct_sessions.id)
);

drop policy if exists sct_access_r on public.sct_session_access;
create policy sct_access_r on public.sct_session_access for select to authenticated using (
  public.sct_is_admin()
  or exists (
    select 1 from public.sct_bookings b
    where b.session_id = sct_session_access.session_id and b.user_id = auth.uid()
      and b.status in ('reserved', 'attended', 'excluded', 'no_show')
  )
);
drop policy if exists sct_access_w on public.sct_session_access;
create policy sct_access_w on public.sct_session_access for all to authenticated using (public.sct_is_admin()) with check (public.sct_is_admin());

drop policy if exists sct_bookings_r on public.sct_bookings;
create policy sct_bookings_r on public.sct_bookings for select to authenticated using (user_id = auth.uid() or public.sct_is_admin());
drop policy if exists sct_bookings_i on public.sct_bookings;
create policy sct_bookings_i on public.sct_bookings for insert to authenticated with check (user_id = auth.uid() or public.sct_is_admin());
drop policy if exists sct_bookings_u on public.sct_bookings;
create policy sct_bookings_u on public.sct_bookings for update to authenticated using (user_id = auth.uid() or public.sct_is_admin()) with check (user_id = auth.uid() or public.sct_is_admin());

drop policy if exists sct_payments_r on public.sct_payments;
create policy sct_payments_r on public.sct_payments for select to authenticated using (user_id = auth.uid() or public.sct_is_admin());
drop policy if exists sct_payments_w on public.sct_payments;
create policy sct_payments_w on public.sct_payments for insert to authenticated with check (public.sct_is_admin());
drop policy if exists sct_payments_u on public.sct_payments;
create policy sct_payments_u on public.sct_payments for update to authenticated using (public.sct_is_admin()) with check (public.sct_is_admin());

drop policy if exists sct_attendance_r on public.sct_attendance;
create policy sct_attendance_r on public.sct_attendance for select to authenticated using (user_id = auth.uid() or public.sct_is_admin());
drop policy if exists sct_attendance_w on public.sct_attendance;
create policy sct_attendance_w on public.sct_attendance for insert to authenticated with check (public.sct_is_admin());
drop policy if exists sct_attendance_u on public.sct_attendance;
create policy sct_attendance_u on public.sct_attendance for update to authenticated using (public.sct_is_admin()) with check (public.sct_is_admin());

drop policy if exists sct_meet_r on public.sct_meet_events;
create policy sct_meet_r on public.sct_meet_events for select to authenticated using (public.sct_is_admin());
drop policy if exists sct_stripe_r on public.sct_stripe_events;
create policy sct_stripe_r on public.sct_stripe_events for select to authenticated using (public.sct_is_admin());
drop policy if exists sct_square_r on public.sct_square_events;
create policy sct_square_r on public.sct_square_events for select to authenticated using (public.sct_is_admin());

drop policy if exists sct_cert_r on public.sct_certificates;
create policy sct_cert_r on public.sct_certificates for select to authenticated using (user_id = auth.uid() or public.sct_is_admin());

drop policy if exists sct_quiz_r on public.sct_quiz;
create policy sct_quiz_r on public.sct_quiz for select to authenticated using (user_id = auth.uid() or public.sct_is_admin());
drop policy if exists sct_quiz_i on public.sct_quiz;
create policy sct_quiz_i on public.sct_quiz for insert to authenticated with check (user_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit)
values ('sct-proofs', 'sct-proofs', false, 10485760)
on conflict (id) do nothing;
drop policy if exists sct_proof_ins on storage.objects;
create policy sct_proof_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'sct-proofs' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists sct_proof_sel on storage.objects;
create policy sct_proof_sel on storage.objects for select to authenticated
  using (bucket_id = 'sct-proofs' and ((storage.foldername(name))[1] = auth.uid()::text or public.sct_is_admin()));

revoke all on function public.sct_is_admin() from public;
revoke all on function public.sct_price(text) from public;
revoke all on function public.sct_no_delete() from public;
revoke all on function public.sct_profile_guard() from public;
revoke all on function public.sct_booking_guard() from public;
revoke all on function public.sct_attendance_guard() from public;
revoke all on function public.sct_payment_guard() from public;
revoke all on function public.sct_progress(uuid) from public;
revoke all on function public.sct_issue_certificate(uuid) from public;
revoke all on function public.sct_begin_payment() from public;
grant execute on function public.sct_is_admin() to authenticated, service_role;
grant execute on function public.sct_price(text) to authenticated, service_role;
grant execute on function public.sct_progress(uuid) to authenticated, service_role;
grant execute on function public.sct_issue_certificate(uuid) to authenticated, service_role;
grant execute on function public.sct_begin_payment() to authenticated, service_role;

do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'public' and tablename like 'sct\_%' escape '\'
  loop
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
revoke all on function public.sct_is_admin() from anon;
revoke all on function public.sct_progress(uuid) from anon;
revoke all on function public.sct_issue_certificate(uuid) from anon;
revoke all on function public.sct_begin_payment() from anon;
