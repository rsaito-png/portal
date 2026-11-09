-- 打刻設定・打刻ログを Supabase に移す（ポータルが正。GASシートは参照しない）
-- 既存の設定値は GAS bootstrap（2026-11-06 取得）をそのまま投入。何度実行しても同じ。

create table if not exists public.dakoku_offices (
  name text primary key check (char_length(btrim(name)) between 1 and 40),
  code text not null default '',
  radius double precision,
  lat double precision,
  lng double precision,
  enabled boolean not null default true,
  sort_no int not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.dakoku_staff (
  id text primary key check (char_length(btrim(id)) between 1 and 40),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  office text not null references public.dakoku_offices(name) on update cascade,
  email text,
  role text not null default '本人',
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.dakoku_punches (
  id bigint generated always as identity primary key,
  punched_at timestamptz not null default now(),
  punched_at_jst text not null,
  office text not null,
  staff_id text not null,
  staff_name text not null,
  kind text not null check (kind in ('出勤','退勤')),
  lat double precision,
  lng double precision,
  distance double precision,
  accuracy double precision,
  lunch boolean not null default false,
  email text,
  memo text,
  created_by uuid default auth.uid()
);
create index if not exists dakoku_punches_staff on public.dakoku_punches (staff_id, punched_at desc);

alter table public.dakoku_offices enable row level security;
alter table public.dakoku_staff enable row level security;
alter table public.dakoku_punches enable row level security;

-- 読む：ログイン職員（打刻画面用）。直す：会長・事務・職責管理者
create or replace function public.dakoku_admin_can()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.is_chair() or public.bp_is_corp_admin() or public.my_duty() = '管理者', false);
$$;
revoke all on function public.dakoku_admin_can() from public, anon;
grant execute on function public.dakoku_admin_can() to authenticated;

drop policy if exists dk_off_sel on public.dakoku_offices;
create policy dk_off_sel on public.dakoku_offices for select to authenticated using (true);
drop policy if exists dk_off_w on public.dakoku_offices;
create policy dk_off_w on public.dakoku_offices for all to authenticated
  using (public.dakoku_admin_can()) with check (public.dakoku_admin_can());

drop policy if exists dk_st_sel on public.dakoku_staff;
create policy dk_st_sel on public.dakoku_staff for select to authenticated using (true);
drop policy if exists dk_st_w on public.dakoku_staff;
create policy dk_st_w on public.dakoku_staff for all to authenticated
  using (public.dakoku_admin_can()) with check (public.dakoku_admin_can());

drop policy if exists dk_punch_sel on public.dakoku_punches;
create policy dk_punch_sel on public.dakoku_punches for select to authenticated
  using (created_by = auth.uid() or public.dakoku_admin_can()
    or exists (select 1 from public.dakoku_staff s where s.id = staff_id and s.email is not null
      and lower(s.email) = lower(coalesce(auth.jwt()->>'email',''))));
drop policy if exists dk_punch_ins on public.dakoku_punches;
create policy dk_punch_ins on public.dakoku_punches for insert to authenticated
  with check (created_by = auth.uid());

revoke all on public.dakoku_offices, public.dakoku_staff, public.dakoku_punches from anon;
grant select, insert, update, delete on public.dakoku_offices, public.dakoku_staff to authenticated;
grant select, insert on public.dakoku_punches to authenticated;
grant usage on sequence public.dakoku_punches_id_seq to authenticated;

-- 初期データ（既存値のまま。すでに同じ主キーがあれば更新しないで値を保つ：DO UPDATE で同じ値に戻すだけ）
insert into public.dakoku_offices (name, code, radius, lat, lng, enabled, sort_no) values


  ('レオ', 'LEO', 200, 35.03466, 136.577937, true, 1),
  ('金斗雲', 'KINTOUN', null, null, null, true, 2),
  ('RYDEEN', 'RYDEEN', 200, 35.034866, 136.583191, true, 3),
  ('梁山泊', 'RYOZAN', 200, 35.034715, 136.582907, true, 4)
on conflict (name) do nothing;

insert into public.dakoku_staff (id, name, office, email, role, enabled) values

  ('R001', '河合尚美', 'RYDEEN', null, '責任者', true),
  ('R002', '宮本幸子', 'RYDEEN', null, '本人', true),
  ('R003', '横田祥', 'RYDEEN', null, '本人', true),
  ('R004', '金彌倞', 'RYDEEN', null, '本人', true),
  ('L001', '中村友香', 'レオ', 'seishinnkai.n@gmail.com', '責任者', true),
  ('L002', '齊藤連', 'レオ', 'rsaito@psr-seishinkai.org', '本人', true),
  ('L003', '中村文', 'レオ', null, '本人', true),
  ('L004', '安藤尚子', 'レオ', 'nico705nico@gmail.com', '本人', true),
  ('L005', '加藤幸弘', 'レオ', 'je2mdd@gmail.com', '本人', true),
  ('K001', '山川美恵子', '金斗雲', null, '本人', true),
  ('K002', '大坪シズカ', '金斗雲', null, '本人', true),
  ('K003', '齊藤連', '金斗雲', 'rsaito@psr-seishinkai.org', '責任者', true),
  ('Y001', '伊藤八重', '梁山泊', 'aozra.88@gmail.com', '本人', true)
on conflict (id) do nothing;

-- bootstrap（有効な事業所・職員）
create or replace function public.dakoku_bootstrap()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  offs jsonb;
  stf jsonb;
begin
  if auth.uid() is null then raise exception 'ログインが必要です'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'name', name, 'code', code, 'radius', radius, 'lat', lat, 'lng', lng, 'enabled', enabled
  ) order by sort_no, name), '[]'::jsonb)
  into offs from public.dakoku_offices where enabled;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id, 'name', s.name, 'office', s.office, 'email', coalesce(s.email,''), 'role', s.role, 'enabled', s.enabled
  ) order by s.office, s.id), '[]'::jsonb)
  into stf
  from public.dakoku_staff s
  join public.dakoku_offices o on o.name = s.office and o.enabled
  where s.enabled;
  return jsonb_build_object('ok', true, 'offices', offs, 'staff', stf);
end;
$$;

create or replace function public.dakoku_recent(p_staff_id text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  rows jsonb;
  s public.dakoku_staff;
  email text := lower(coalesce(auth.jwt()->>'email',''));
begin
  if auth.uid() is null then raise exception 'ログインが必要です'; end if;
  if coalesce(btrim(p_staff_id),'') = '' then return jsonb_build_object('ok', false, 'error', '職員が指定されていません'); end if;
  select * into s from public.dakoku_staff where id = btrim(p_staff_id);
  if not found then return jsonb_build_object('ok', false, 'error', '職員が見つかりません'); end if;
  if not public.dakoku_admin_can() then
    if email = '' or coalesce(nullif(btrim(s.email),''), '') = '' or email <> lower(btrim(s.email)) then
      return jsonb_build_object('ok', false, 'error', '自分の打刻だけ見られます');
    end if;
  end if;
  select coalesce(jsonb_agg(x.obj order by x.punched_at desc), '[]'::jsonb) into rows
  from (
    select punched_at, jsonb_build_object(
      'at', punched_at_jst, 'kind', kind, 'office', office,
      'lunch', case when lunch then 'はい' else 'いいえ' end
    ) as obj
    from public.dakoku_punches
    where staff_id = s.id
    order by punched_at desc
    limit 8
  ) x;
  return jsonb_build_object('ok', true, 'rows', rows);
end;
$$;

create or replace function public.dakoku_punch(
  p_office text, p_staff_id text, p_kind text,
  p_lat double precision default null, p_lng double precision default null,
  p_accuracy double precision default null, p_lunch boolean default false, p_memo text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  o public.dakoku_offices;
  s public.dakoku_staff;
  need_gps boolean;
  dist double precision;
  at_jst text;
  email text := lower(coalesce(auth.jwt()->>'email',''));
  r double precision := 6371000;
  dlat double precision; dlng double precision; aa double precision;
begin
  if auth.uid() is null then raise exception 'ログインが必要です'; end if;
  if p_kind is distinct from '出勤' and p_kind is distinct from '退勤' then
    return jsonb_build_object('ok', false, 'error', '種別は出勤か退勤です');
  end if;
  select * into o from public.dakoku_offices where name = btrim(p_office);
  if not found or not o.enabled then
    return jsonb_build_object('ok', false, 'error', 'この事業所は打刻できません');
  end if;
  select * into s from public.dakoku_staff where id = btrim(p_staff_id) and office = o.name and enabled;
  if not found then
    return jsonb_build_object('ok', false, 'error', '職員が見つかりません');
  end if;
  if email = '' then
    return jsonb_build_object('ok', false, 'error', 'ログインが必要です');
  end if;
  if coalesce(nullif(btrim(s.email),''), '') = '' then
    return jsonb_build_object('ok', false, 'error', '職員のログイン用メールが未登録です。管理者へ連絡してください');
  end if;
  if email <> lower(btrim(s.email)) then
    return jsonb_build_object('ok', false, 'error', 'ログイン中のメールと職員が一致しません');
  end if;
  need_gps := o.lat is not null and o.lng is not null and o.radius is not null and o.radius > 0;
  if need_gps then
    if p_lat is null or p_lng is null then
      return jsonb_build_object('ok', false, 'error', '位置情報がありません');
    end if;
    dlat := radians(p_lat - o.lat); dlng := radians(p_lng - o.lng);
    aa := sin(dlat/2)^2 + cos(radians(o.lat)) * cos(radians(p_lat)) * sin(dlng/2)^2;
    dist := 2 * r * asin(least(1, sqrt(aa)));
    if dist > o.radius then
      return jsonb_build_object('ok', false, 'error', '範囲外です（' || round(dist)::text || 'm / 許可' || round(o.radius)::text || 'm）');
    end if;
  end if;
  at_jst := to_char((now() at time zone 'Asia/Tokyo'), 'YYYY-MM-DD HH24:MI:SS');
  insert into public.dakoku_punches (punched_at_jst, office, staff_id, staff_name, kind, lat, lng, distance, accuracy, lunch, email, memo, created_by)
  values (at_jst, o.name, s.id, s.name, p_kind, p_lat, p_lng, dist, p_accuracy, coalesce(p_lunch,false), email, left(coalesce(p_memo,''), 200), auth.uid());
  return jsonb_build_object('ok', true, 'at', at_jst, 'distance', dist, 'office', o.name, 'staffId', s.id, 'kind', p_kind);
end;
$$;

create or replace function public.dakoku_month(p_staff_id text, p_month text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s public.dakoku_staff;
  email text := lower(coalesce(auth.jwt()->>'email',''));
  rows jsonb;
  mon text;
  mon_start text;
  mon_end text;
begin
  if auth.uid() is null then raise exception 'ログインが必要です'; end if;
  if coalesce(btrim(p_staff_id),'') = '' then
    return jsonb_build_object('ok', false, 'error', '職員が指定されていません');
  end if;
  mon := btrim(coalesce(p_month,''));
  if mon !~ '^\d{4}-\d{2}$' then
    return jsonb_build_object('ok', false, 'error', '月はYYYY-MMで指定してください');
  end if;
  select * into s from public.dakoku_staff where id = btrim(p_staff_id);
  if not found then
    return jsonb_build_object('ok', false, 'error', '職員が見つかりません');
  end if;
  if not public.dakoku_admin_can() then
    if email = '' or coalesce(nullif(btrim(s.email),''), '') = '' or email <> lower(btrim(s.email)) then
      return jsonb_build_object('ok', false, 'error', '自分の打刻だけ見られます');
    end if;
  end if;
  mon_start := mon || '-01 00:00:00';
  mon_end := to_char(((mon || '-01')::date + interval '1 month'), 'YYYY-MM-DD') || ' 00:00:00';
  select coalesce(jsonb_agg(x.obj order by x.punched_at_jst, x.id), '[]'::jsonb) into rows
  from (
    select id, punched_at_jst, jsonb_build_object(
      'id', id,
      'at', punched_at_jst,
      'kind', kind,
      'office', office,
      'lunch', case when lunch then 'はい' else 'いいえ' end,
      'memo', coalesce(memo,''),
      'proxy', coalesce(memo,'') like '管理者記録%'
    ) as obj
    from public.dakoku_punches
    where staff_id = s.id
      and punched_at_jst >= mon_start
      and punched_at_jst < mon_end
  ) x;
  return jsonb_build_object('ok', true, 'month', mon, 'staffId', s.id, 'rows', rows);
end;
$$;

revoke all on function public.dakoku_bootstrap() from public, anon;
revoke all on function public.dakoku_recent(text) from public, anon;
revoke all on function public.dakoku_month(text, text) from public, anon;
revoke all on function public.dakoku_punch(text,text,text,double precision,double precision,double precision,boolean,text) from public, anon;
grant execute on function public.dakoku_bootstrap() to authenticated;
grant execute on function public.dakoku_recent(text) to authenticated;
grant execute on function public.dakoku_month(text, text) to authenticated;
grant execute on function public.dakoku_punch(text,text,text,double precision,double precision,double precision,boolean,text) to authenticated;

notify pgrst, 'reload schema';
