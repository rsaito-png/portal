-- RYDEEN（就労継続支援B型）工賃。本番適用は別担当。このファイルをそのまま実行できる（再実行可）。
-- 既存の bp_is_admin / bp_is_corp_admin / bp_my_office / bp_office_immutable だけを使う。権限は緩めない。
-- 時給は利用者ごと 60 / 75 / 90 円。月次明細は日誌の実働（終了−開始−休憩、分）×時給。円未満は切り捨て。
-- 賞与は月次明細へ手入力（年2回を想定）。締めは月末、支払予定は翌月15日（振込日 paid_at は手記録）。
-- 利用者は自分の status=confirmed だけ読める。下書き・他人・時給マスタは見えない。書くのは管理者のみ。

create table if not exists public.bp_wage_rates (
  worker_id uuid primary key references public.bp_profiles(id) on delete cascade,
  office text not null default public.bp_my_office() check (office <> ''),
  hourly_rate int not null check (hourly_rate in (60, 75, 90)),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  foreign key (worker_id, office) references public.bp_profiles(id, office) on delete cascade
);
comment on table public.bp_wage_rates is 'RYDEEN 利用者の時給区分（60/75/90）。管理者のみ。';

create table if not exists public.bp_wage_months (
  id uuid primary key default gen_random_uuid(),
  office text not null default public.bp_my_office() check (office <> ''),
  worker_id uuid not null references public.bp_profiles(id) on delete cascade,
  year_month text not null check (year_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  minutes int not null default 0 check (minutes >= 0),
  hours numeric(8,2) not null default 0 check (hours >= 0),
  hourly_rate int not null check (hourly_rate in (60, 75, 90)),
  amount int not null default 0 check (amount >= 0),
  bonus int not null default 0 check (bonus >= 0),
  status text not null default 'draft' check (status in ('draft', 'confirmed')),
  paid_at date,
  confirmed_at timestamptz,
  confirmed_by uuid,
  updated_at timestamptz not null default now(),
  unique (worker_id, year_month),
  foreign key (worker_id, office) references public.bp_profiles(id, office) on delete cascade,
  constraint bp_wage_months_amount_floor check (amount = floor((minutes::numeric * hourly_rate) / 60)::int),
  constraint bp_wage_months_hours_round check (hours = round(minutes / 60.0, 2))
);
comment on table public.bp_wage_months is 'RYDEEN 月次工賃。draft は利用者に非公開。confirmed は本人だけ読める。';
comment on column public.bp_wage_months.amount is 'floor(minutes * hourly_rate / 60)。円未満切り捨て。hours では計算しない。';
comment on column public.bp_wage_months.hours is '表示用。minutes/60 を小数第2位で丸めた値。';
comment on column public.bp_wage_months.status is 'draft=下書き（利用者は見えない） confirmed=確定（本人だけ読める）';
comment on column public.bp_wage_months.paid_at is '振込を記録した日。空なら未記録。支払予定は翌月15日。';

create index if not exists bp_wage_months_office_month on public.bp_wage_months (office, year_month);

alter table public.bp_wage_rates enable row level security;
alter table public.bp_wage_months enable row level security;

drop trigger if exists bp_office_immutable_t on public.bp_wage_rates;
create trigger bp_office_immutable_t before update on public.bp_wage_rates
  for each row execute function public.bp_office_immutable();
drop trigger if exists bp_office_immutable_t on public.bp_wage_months;
create trigger bp_office_immutable_t before update on public.bp_wage_months
  for each row execute function public.bp_office_immutable();

revoke all on public.bp_wage_rates from public, anon;
revoke all on public.bp_wage_months from public, anon;
grant select, insert, update, delete on public.bp_wage_rates to authenticated, service_role;
grant select, insert, update, delete on public.bp_wage_months to authenticated, service_role;

drop policy if exists bp_wage_rates_corp_all on public.bp_wage_rates;
create policy bp_wage_rates_corp_all on public.bp_wage_rates for all to authenticated
  using (public.bp_is_corp_admin()) with check (public.bp_is_corp_admin());
drop policy if exists bp_wage_rates_admin on public.bp_wage_rates;
create policy bp_wage_rates_admin on public.bp_wage_rates for all to authenticated
  using (public.bp_is_admin() and office = public.bp_my_office())
  with check (public.bp_is_admin() and office = public.bp_my_office());

drop policy if exists bp_wage_months_corp_all on public.bp_wage_months;
create policy bp_wage_months_corp_all on public.bp_wage_months for all to authenticated
  using (public.bp_is_corp_admin()) with check (public.bp_is_corp_admin());
drop policy if exists bp_wage_months_admin on public.bp_wage_months;
create policy bp_wage_months_admin on public.bp_wage_months for all to authenticated
  using (public.bp_is_admin() and office = public.bp_my_office())
  with check (public.bp_is_admin() and office = public.bp_my_office());
drop policy if exists bp_wage_months_worker_select on public.bp_wage_months;
create policy bp_wage_months_worker_select on public.bp_wage_months for select to authenticated
  using (status = 'confirmed' and worker_id = auth.uid() and office = public.bp_my_office());
