-- 個別支援計画 管理表 → ポータル（児童1人1行）。管理表（Google）と並行運転。シートには書き戻さない
create table if not exists public.leo_flags (name text primary key, enabled boolean not null default false, note text, updated_at timestamptz not null default now());
alter table public.leo_flags enable row level security;
drop policy if exists lf_read on public.leo_flags; create policy lf_read on public.leo_flags for select to authenticated using (public.my_office() = 'レオ' or public.can_bill());
drop policy if exists lf_write on public.leo_flags; create policy lf_write on public.leo_flags for all to authenticated using (public.can_manage()) with check (public.can_manage());
-- 繰り越し：11/1までOFF（管理表のGAS rollForward_ が今やっている。二重に期が進むのを防ぐ）。11/1にGASを止めてからON
insert into public.leo_flags (name, enabled, note) values ('plan_track_rollover', false, '本案の同意で次期へ繰り越す。11/1にGAS rollForward_ を止めてからtrueにする') on conflict (name) do nothing;

create table if not exists public.leo_plan_track (
  child text primary key check (char_length(child) <= 100),
  term_no int not null check (term_no between 1 and 40),
  period_from date, period_to date, next_start date,
  survey_due date, survey_sent_at timestamptz, survey_answered_at date, staff_mon_at timestamptz,
  genan_date date, kaigi_date date, honan_date date,
  plan_made boolean not null default false, genan_consent_at timestamptz, honan_consent_at timestamptz,
  note text check (char_length(note) <= 4000), source_ref text check (char_length(source_ref) <= 400),
  updated_by uuid default auth.uid(), updated_at timestamptz not null default now());
alter table public.leo_plan_track enable row level security;
drop policy if exists lpt_read on public.leo_plan_track; create policy lpt_read on public.leo_plan_track for select to authenticated using (public.my_office() = 'レオ' or public.can_bill());
drop policy if exists lpt_write on public.leo_plan_track; create policy lpt_write on public.leo_plan_track for all to authenticated using (public.can_manage()) with check (public.can_manage());

-- 本案の同意が入ったら次期へ繰り越す（GASの自動更新ルールと同じ：期+1、期間=次期開始月〜+5か月、次期開始月+6か月、送付目安=新しい次期開始月の前月15日、回答日・署名・計画書作成を戻し、備考に追記）。フラグOFFの間は何もしない
create or replace function public.leo_track_roll() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if not coalesce((select enabled from leo_flags where name = 'plan_track_rollover'), false) then return new; end if;
  if old.next_start is null then return new; end if;
  new.term_no := old.term_no + 1;
  new.period_from := old.next_start;
  new.period_to := (old.next_start + interval '6 months' - interval '1 day')::date;
  new.next_start := (old.next_start + interval '6 months')::date;
  new.survey_due := (new.next_start - interval '1 month' + interval '14 days')::date;
  new.survey_sent_at := null; new.survey_answered_at := null; new.staff_mon_at := null;
  new.genan_date := null; new.kaigi_date := null; new.honan_date := null;
  new.plan_made := false; new.genan_consent_at := null; new.honan_consent_at := null;
  new.note := btrim(coalesce(old.note, '') || ' ' || to_char(now() at time zone 'Asia/Tokyo', 'YYYY/MM/DD') || ' 自動更新');
  return new;
end $$;
create or replace function public.leo_track_touch() returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists leo_track_roll on public.leo_plan_track;
create trigger leo_track_roll before update on public.leo_plan_track for each row when (new.honan_consent_at is not null and old.honan_consent_at is null) execute function public.leo_track_roll();
drop trigger if exists leo_track_touch on public.leo_plan_track;
create trigger leo_track_touch before update on public.leo_plan_track for each row when (not (new.honan_consent_at is not null and old.honan_consent_at is null)) execute function public.leo_track_touch();

-- 計画書（leo_plans）の同意・作成済みが変わったら、管理表の行へ反映（次期の計画＝管理表の期+1）
create or replace function public.leo_track_sync() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update leo_plan_track t set plan_made = new.plan_made, genan_consent_at = new.genan_consent_at, honan_consent_at = new.honan_consent_at
  where replace(t.child, ' ', '') = replace(new.child, ' ', '') and t.term_no = new.term_no - 1;
  return new;
end $$;
drop trigger if exists leo_track_sync on public.leo_plans;
create trigger leo_track_sync after update on public.leo_plans for each row
  when (old.plan_made is distinct from new.plan_made or old.genan_consent_at is distinct from new.genan_consent_at or old.honan_consent_at is distinct from new.honan_consent_at)
  execute function public.leo_track_sync();
