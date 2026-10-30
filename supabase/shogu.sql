-- 処遇改善加算（国保連PDF・賃金改善の監査）
-- SQL Editor に貼って Run。再実行できる。
-- 前提: staff_profiles（leo.sql）に active（privacy_hardening）・duty（leo_duty.sql）・rank（hyojosho.sql）があること。
-- 見られるのは事務（role または app_metadata.role）・管理者（duty）・総務奉行（rank）だけ。
-- 児発管・一般職員・会長だけの人は対象にしない。user_metadata は本人が書き換えられるので見ない。
-- 金額は円の整数（bigint）。行政への提出、送金、フリーウェイへの送信はしない。

create or replace function public.shogu_can() returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare
  ok boolean;
begin
  select exists (
    select 1 from public.staff_profiles p
    where p.user_id = auth.uid()
      and p.active
      and (p.role = '事務' or p.duty = '管理者' or p.rank = '総務奉行')
  ) into ok;
  if coalesce(ok, false) then
    return true;
  end if;
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = '事務' then
    return true;
  end if;
  return false;
end
$$;

revoke all on function public.shogu_can() from public, anon;
grant execute on function public.shogu_can() to authenticated;

create table if not exists public.shogu_settings (
  id int primary key check (id = 1),
  fy_year int not null,
  regular_this int not null default 1 check (regular_this >= 0),
  regular_next int not null default 4 check (regular_next >= 0),
  freeway_item text not null default '処遇改善手当',
  freeway_bonus_item text not null default '処遇改善一時金',
  updated_at timestamptz not null default now()
);

create table if not exists public.shogu_staff (
  id bigint generated always as identity primary key,
  staff_code text not null default '',
  name text not null,
  office_id text not null,
  employment text not null default '非正規' check (employment in ('正社員', '非正規')),
  contract_yen bigint not null check (contract_yen >= 0),
  baseline_yen bigint not null check (baseline_yen >= 0),
  active boolean not null default true,
  note text not null default '',
  updated_at timestamptz not null default now()
);
create unique index if not exists shogu_staff_code_uq on public.shogu_staff (staff_code) where staff_code <> '';

create table if not exists public.shogu_receipt (
  id bigint generated always as identity primary key,
  office_id text not null,
  office_name text not null default '',
  office_number text not null default '',
  service_type text not null,
  target_month date not null,
  amount_yen bigint not null check (amount_yen >= 0),
  amount_raw text not null default '',
  category text not null default '',
  rate_got_ppm int check (rate_got_ppm is null or rate_got_ppm >= 0),
  rate_iv_ppm int check (rate_iv_ppm is null or rate_iv_ppm >= 0),
  iv_yen bigint check (iv_yen is null or iv_yen >= 0),
  iv_manual boolean not null default false,
  note text not null default '',
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  unique (office_id, service_type, target_month),
  check (target_month = date_trunc('month', target_month)::date)
);

create table if not exists public.shogu_pdf (
  id bigint generated always as identity primary key,
  receipt_id bigint not null references public.shogu_receipt (id) on delete cascade,
  storage_path text not null,
  file_name text not null default '',
  extract_json jsonb not null default '{}'::jsonb,
  uploaded_by uuid default auth.uid(),
  uploaded_at timestamptz not null default now()
);

create table if not exists public.shogu_pay (
  id bigint generated always as identity primary key,
  staff_id bigint not null references public.shogu_staff (id) on delete cascade,
  target_month date not null,
  gross_yen bigint check (gross_yen is null or gross_yen >= 0),
  shogu_yen bigint not null default 0 check (shogu_yen >= 0),
  lump_yen bigint not null default 0 check (lump_yen >= 0),
  note text not null default '',
  updated_at timestamptz not null default now(),
  unique (staff_id, target_month),
  check (target_month = date_trunc('month', target_month)::date),
  check (gross_yen is null or shogu_yen <= gross_yen)
);

alter table public.shogu_settings enable row level security;
alter table public.shogu_staff enable row level security;
alter table public.shogu_receipt enable row level security;
alter table public.shogu_pdf enable row level security;
alter table public.shogu_pay enable row level security;

drop policy if exists shogu_settings_rw on public.shogu_settings;
create policy shogu_settings_rw on public.shogu_settings for all to authenticated
  using (public.shogu_can()) with check (public.shogu_can());
drop policy if exists shogu_staff_rw on public.shogu_staff;
create policy shogu_staff_rw on public.shogu_staff for all to authenticated
  using (public.shogu_can()) with check (public.shogu_can());
drop policy if exists shogu_receipt_rw on public.shogu_receipt;
create policy shogu_receipt_rw on public.shogu_receipt for all to authenticated
  using (public.shogu_can()) with check (public.shogu_can());
drop policy if exists shogu_pdf_rw on public.shogu_pdf;
create policy shogu_pdf_rw on public.shogu_pdf for all to authenticated
  using (public.shogu_can()) with check (public.shogu_can());
drop policy if exists shogu_pay_rw on public.shogu_pay;
create policy shogu_pay_rw on public.shogu_pay for all to authenticated
  using (public.shogu_can()) with check (public.shogu_can());

revoke all on table public.shogu_settings from anon, public;
revoke all on table public.shogu_staff from anon, public;
revoke all on table public.shogu_receipt from anon, public;
revoke all on table public.shogu_pdf from anon, public;
revoke all on table public.shogu_pay from anon, public;
grant select, insert, update, delete on table public.shogu_settings to authenticated;
grant select, insert, update, delete on table public.shogu_staff to authenticated;
grant select, insert, update, delete on table public.shogu_receipt to authenticated;
grant select, insert, update, delete on table public.shogu_pdf to authenticated;
grant select, insert, update, delete on table public.shogu_pay to authenticated;

revoke all on sequence public.shogu_staff_id_seq from anon, public;
revoke all on sequence public.shogu_receipt_id_seq from anon, public;
revoke all on sequence public.shogu_pdf_id_seq from anon, public;
revoke all on sequence public.shogu_pay_id_seq from anon, public;
grant usage, select on sequence public.shogu_staff_id_seq to authenticated;
grant usage, select on sequence public.shogu_receipt_id_seq to authenticated;
grant usage, select on sequence public.shogu_pdf_id_seq to authenticated;
grant usage, select on sequence public.shogu_pay_id_seq to authenticated;

insert into public.shogu_settings (id, fy_year, regular_this, regular_next)
values (1, 2026, 1, 4)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit)
values ('shogu-pdf', 'shogu-pdf', false, 20971520)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists shogu_pdf_sel on storage.objects;
create policy shogu_pdf_sel on storage.objects for select to authenticated
  using (bucket_id = 'shogu-pdf' and public.shogu_can());
drop policy if exists shogu_pdf_ins on storage.objects;
create policy shogu_pdf_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'shogu-pdf' and public.shogu_can());
drop policy if exists shogu_pdf_upd on storage.objects;
create policy shogu_pdf_upd on storage.objects for update to authenticated
  using (bucket_id = 'shogu-pdf' and public.shogu_can())
  with check (bucket_id = 'shogu-pdf' and public.shogu_can());
drop policy if exists shogu_pdf_del on storage.objects;
create policy shogu_pdf_del on storage.objects for delete to authenticated
  using (bucket_id = 'shogu-pdf' and public.shogu_can());
