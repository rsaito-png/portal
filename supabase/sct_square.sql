-- ストレスチェック研修のカード決済を Square に揃える追加分。再実行できる。
-- 対象: すでに supabase/sct.sql を実行したデータベース（Stripe 版でも、Square 反映後の sct.sql でもよい）。
-- 未入金の method=stripe だけ square に替える。入金済みの stripe 行は履歴のまま残す。
-- 秘密は入れない。新規環境は更新後の sct.sql だけでも同じ列と関数になる。このファイルを続けて実行しても安全。

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

create unique index if not exists sct_pay_square_link on public.sct_payments (square_payment_link_id) where square_payment_link_id is not null;
create unique index if not exists sct_pay_square_order on public.sct_payments (square_order_id) where square_order_id is not null;
create unique index if not exists sct_pay_square_payment on public.sct_payments (square_payment_id) where square_payment_id is not null;

create table if not exists public.sct_square_events (
  id text primary key,
  type text,
  payment_id uuid,
  note text,
  received_at timestamptz not null default now()
);

drop trigger if exists sct_square_no_delete on public.sct_square_events;
create trigger sct_square_no_delete before delete on public.sct_square_events
  for each row execute function public.sct_no_delete();

alter table public.sct_square_events enable row level security;
drop policy if exists sct_square_r on public.sct_square_events;
create policy sct_square_r on public.sct_square_events for select to authenticated using (public.sct_is_admin());

-- sct.sql の sct_begin_payment と同じ。カードの method は square。金額は sct_price。
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
