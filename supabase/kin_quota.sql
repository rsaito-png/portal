-- 金斗雲：支給量の枠と、日ごとの予定の増減（休み・追加）。土曜などで支給量を使い切るための表。2026-11-12
-- 数え方：1回＝count_minutes 分（石田大雅さん 身体介護は30分。実際は20分でも30分）。
-- 予定の分＝（週の固定予定 kin_supply の回数 − 休みの日の回数 ＋ 追加の回数）× count_minutes。
-- 追加・休みの取り消しで支給量（monthly_minutes）を超える場合は DB で止める。実績（kin_visit）は止めず、画面で警告する。

create table if not exists public.kin_quota (
  id bigint generated always as identity primary key,
  user_id bigint not null references public.kin_user(id) on delete cascade,
  service text not null check (service in ('身体介護','家事援助','通院等介助')),
  monthly_minutes int not null check (monthly_minutes > 0),
  count_minutes int not null default 30 check (count_minutes between 1 and 600),
  fill_weekday smallint not null default 6 check (fill_weekday between 0 and 6),
  memo text check (char_length(memo) <= 500),
  updated_by uuid default auth.uid(), updated_at timestamptz not null default now(),
  unique (user_id, service));

create table if not exists public.kin_plan_day (
  id bigint generated always as identity primary key,
  user_id bigint not null references public.kin_user(id) on delete cascade,
  service text not null check (service in ('身体介護','家事援助','通院等介助')),
  plan_date date not null,
  kind text not null check (kind in ('追加','休み')),
  start_time time, end_time time,
  memo text check (char_length(memo) <= 300),
  created_by uuid default auth.uid(), created_at timestamptz not null default now(),
  unique (user_id, service, plan_date));
create index if not exists kin_plan_day_month on public.kin_plan_day(user_id, service, plan_date);

alter table public.kin_quota enable row level security;
alter table public.kin_plan_day enable row level security;
revoke all on public.kin_quota, public.kin_plan_day from anon;
drop policy if exists kin_quota_rw on public.kin_quota;
create policy kin_quota_rw on public.kin_quota for all to authenticated
  using ((public.my_office() = '金斗雲') or public.can_manage_for('金斗雲'))
  with check ((public.my_office() = '金斗雲') or public.can_manage_for('金斗雲'));
drop policy if exists kin_plan_day_rw on public.kin_plan_day;
create policy kin_plan_day_rw on public.kin_plan_day for all to authenticated
  using ((public.my_office() = '金斗雲') or public.can_manage_for('金斗雲'))
  with check ((public.my_office() = '金斗雲') or public.can_manage_for('金斗雲'));
grant select, insert, update, delete on public.kin_quota, public.kin_plan_day to authenticated;

-- その日の固定予定の回数（週の予定 kin_supply から）
create or replace function public.kin_regular_count(p_user bigint, p_service text, p_date date)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.kin_supply s
   where s.user_id = p_user and s.service = p_service and s.start_time is not null
     and s.weekday = extract(dow from p_date)::int
     and (s.plan_from is null or s.plan_from <= p_date) and (s.plan_to is null or s.plan_to >= p_date);
$$;

-- その月の予定の回数（固定 − 休み ＋ 追加）
create or replace function public.kin_planned_count(p_user bigint, p_service text, p_month date)
returns int language sql stable security definer set search_path = public as $$
  with d as (select g::date d from generate_series(date_trunc('month', p_month)::date, (date_trunc('month', p_month) + interval '1 month - 1 day')::date, interval '1 day') g)
  select (coalesce(sum(public.kin_regular_count(p_user, p_service, d.d)) filter (where not exists (
            select 1 from public.kin_plan_day x where x.user_id = p_user and x.service = p_service and x.plan_date = d.d and x.kind = '休み')), 0)
        + (select count(*) from public.kin_plan_day x where x.user_id = p_user and x.service = p_service and x.kind = '追加'
             and x.plan_date >= date_trunc('month', p_month)::date and x.plan_date < (date_trunc('month', p_month) + interval '1 month')::date))::int
  from d;
$$;
revoke all on function public.kin_regular_count(bigint, text, date) from public, anon, authenticated;
revoke all on function public.kin_planned_count(bigint, text, date) from public, anon, authenticated;

-- 追加・休みの取り消しで支給量を超えるなら止める
create or replace function public.kin_plan_day_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare q public.kin_quota; cur int; add_n int; r public.kin_plan_day;
begin
  if tg_op = 'UPDATE' then
    if (new.user_id, new.service, new.plan_date, new.kind) is distinct from (old.user_id, old.service, old.plan_date, old.kind) then
      raise exception '日付や種類は変えられません。いったん取り消して、入れ直してください。';
    end if;
    return new;
  end if;
  r := case when tg_op = 'DELETE' then old else new end;
  if tg_op = 'INSERT' and r.kind = '休み' and public.kin_regular_count(r.user_id, r.service, r.plan_date) = 0 then
    raise exception '% はもともと予定のない日です（休みにできません）。', r.plan_date;
  end if;
  if tg_op = 'INSERT' and r.kind = '追加' and public.kin_regular_count(r.user_id, r.service, r.plan_date) > 0 then
    raise exception '% はもともと予定のある日です（追加はいりません）。', r.plan_date;
  end if;
  -- 枠を増やす操作だけ調べる（追加を入れる／休みを取り消す）
  if (tg_op = 'INSERT' and r.kind = '追加') or (tg_op = 'DELETE' and r.kind = '休み') then
    select * into q from public.kin_quota where user_id = r.user_id and service = r.service;
    if found then
      cur := public.kin_planned_count(r.user_id, r.service, r.plan_date);
      add_n := case when r.kind = '追加' then 1 else public.kin_regular_count(r.user_id, r.service, r.plan_date) end;
      if (cur + add_n) * q.count_minutes > q.monthly_minutes then
        raise exception '支給量をこえます（月 % 分のうち、予定 % 分。あと % 分しかありません）。', q.monthly_minutes, cur * q.count_minutes, q.monthly_minutes - cur * q.count_minutes;
      end if;
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
drop trigger if exists kin_plan_day_guard on public.kin_plan_day;
create trigger kin_plan_day_guard before insert or update or delete on public.kin_plan_day
  for each row execute function public.kin_plan_day_guard();

-- 画面用：その月の数字（予定・実績・入れられる回数）
create or replace function public.kin_quota_month(p_month text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d0 date; d1 date; out jsonb := '[]'::jsonb; q record; pc int; fill_free int; fill_added int; act int; reg int; off int; addn int; remain int;
begin
  if not ((public.my_office() = '金斗雲') or public.can_manage_for('金斗雲')) then raise exception '権限がありません'; end if;
  d0 := to_date(p_month || '-01', 'YYYY-MM-DD'); d1 := (d0 + interval '1 month')::date;
  for q in select k.*, u.name, u.supply_body_hours from public.kin_quota k join public.kin_user u on u.id = k.user_id order by u.name, k.service loop
    pc := public.kin_planned_count(q.user_id, q.service, d0);
    select coalesce(sum(public.kin_regular_count(q.user_id, q.service, g::date)), 0) into reg from generate_series(d0, d1 - 1, interval '1 day') g;
    select coalesce(sum(public.kin_regular_count(q.user_id, q.service, x.plan_date)), 0) into off from public.kin_plan_day x
      where x.user_id = q.user_id and x.service = q.service and x.kind = '休み' and x.plan_date >= d0 and x.plan_date < d1;
    select count(*) into addn from public.kin_plan_day x where x.user_id = q.user_id and x.service = q.service and x.kind = '追加' and x.plan_date >= d0 and x.plan_date < d1;
    -- 埋める曜日（土曜など）で、固定予定も追加もまだない日（今日より前は数えない）
    select count(*) into fill_free from generate_series(d0, d1 - 1, interval '1 day') g
      where extract(dow from g)::int = q.fill_weekday and g::date >= (now() at time zone 'Asia/Tokyo')::date and public.kin_regular_count(q.user_id, q.service, g::date) = 0
        and not exists (select 1 from public.kin_plan_day x where x.user_id = q.user_id and x.service = q.service and x.plan_date = g::date);
    select count(*) into fill_added from public.kin_plan_day x where x.user_id = q.user_id and x.service = q.service and x.kind = '追加'
      and extract(dow from x.plan_date)::int = q.fill_weekday and x.plan_date >= d0 and x.plan_date < d1;
    select count(*) into act from public.kin_visit v where v.user_id = q.user_id and v.service = q.service and v.visit_date >= d0 and v.visit_date < d1;
    remain := q.monthly_minutes - pc * q.count_minutes;
    out := out || jsonb_build_object(
      'quota_id', q.id, 'user_id', q.user_id, 'name', q.name, 'service', q.service,
      'monthly_minutes', q.monthly_minutes, 'count_minutes', q.count_minutes, 'fill_weekday', q.fill_weekday,
      'ledger_hours', case when q.service = '身体介護' then q.supply_body_hours end,
      'regular_count', reg, 'off_count', off, 'add_count', addn, 'planned_count', pc,
      'planned_minutes', pc * q.count_minutes, 'remain_minutes', remain,
      'fill_added', fill_added, 'fill_free', fill_free,
      'fill_can_add', greatest(0, least(fill_free, floor(greatest(remain, 0)::numeric / q.count_minutes)::int)),
      'actual_count', act, 'actual_minutes', act * q.count_minutes,
      'over_plan', pc * q.count_minutes > q.monthly_minutes, 'over_actual', act * q.count_minutes > q.monthly_minutes,
      'days', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'date', x.plan_date, 'kind', x.kind, 'start', x.start_time, 'end', x.end_time, 'memo', x.memo) order by x.plan_date), '[]'::jsonb)
                 from public.kin_plan_day x where x.user_id = q.user_id and x.service = q.service and x.plan_date >= d0 and x.plan_date < d1));
  end loop;
  return out;
end $$;
revoke all on function public.kin_quota_month(text) from public, anon;
grant execute on function public.kin_quota_month(text) to authenticated;

-- 石田大雅さん：身体介護 月12.5時間＝750分、1回30分で数える、土曜で埋める
insert into public.kin_quota (user_id, service, monthly_minutes, count_minutes, fill_weekday, memo)
select id, '身体介護', 750, 30, 6, '受給者証 身体介護 月12.5時間。20分の支援も30分で数える（齊藤さん指定 2026-11-12）'
  from public.kin_user where name = '石田大雅'
on conflict (user_id, service) do nothing;

notify pgrst, 'reload schema';
