-- レオ（共生型）職員の「実態のシフト」（2026-11-11 齊藤さん）
-- 大前提：実態と勤務実績表は別。kinmu_lines / kinmu_users / leo_kinmu_lib.js / chamu_shift とは一切つながない。初期値にも使わない。
-- staff_shift_base：いつもの型（職員×曜日×時間）。staff_shift_day：その日だけの変更（休み／時間変更／追加）。
-- 読む：レオ職員・事務・管理者・会長。書く：can_leo_home_todo()（管理者・児発管・事務・会長・安藤・加藤）。書き込みは RPC だけ。

create table if not exists public.staff_shift_base (
  id bigserial primary key,
  user_id uuid not null references public.staff_profiles(user_id) on delete cascade,
  dow smallint not null check (dow between 0 and 6),          -- 0=日 1=月 … 6=土
  start_time time not null,
  end_time time not null check (end_time > start_time),
  note text,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create unique index if not exists staff_shift_base_uq on public.staff_shift_base (user_id, dow, start_time);

create table if not exists public.staff_shift_day (
  id bigserial primary key,
  day date not null,
  user_id uuid not null references public.staff_profiles(user_id) on delete cascade,
  kind text not null check (kind in ('休み','時間変更','追加')),
  start_time time,
  end_time time,
  note text,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  check (kind = '休み' or (start_time is not null and end_time is not null and end_time > start_time))
);
-- 休み・時間変更は1人1日1件。追加は複数可
create unique index if not exists staff_shift_day_one on public.staff_shift_day (day, user_id) where kind in ('休み','時間変更');
create index if not exists staff_shift_day_day on public.staff_shift_day (day);

-- 読める人：レオ所属（兼務含む）・事務・管理者・会長
create or replace function public.staff_shift_can_read() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(auth.role(), '') = 'service_role' or exists (
    select 1 from staff_profiles where user_id = auth.uid() and active
      and (office = 'レオ' or 'レオ' = any(coalesce(extra_offices, '{}')) or role = '事務' or duty = '管理者' or is_chair));
$$;
create or replace function public.staff_shift_can_edit() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(auth.role(), '') = 'service_role' or public.can_leo_home_todo() or public.is_chair();
$$;
revoke all on function public.staff_shift_can_read() from public, anon;
revoke all on function public.staff_shift_can_edit() from public, anon;
grant execute on function public.staff_shift_can_read() to authenticated;
grant execute on function public.staff_shift_can_edit() to authenticated;

alter table public.staff_shift_base enable row level security;
alter table public.staff_shift_day enable row level security;
drop policy if exists staff_shift_base_read on public.staff_shift_base;
create policy staff_shift_base_read on public.staff_shift_base for select to authenticated using (public.staff_shift_can_read());
drop policy if exists staff_shift_day_read on public.staff_shift_day;
create policy staff_shift_day_read on public.staff_shift_day for select to authenticated using (public.staff_shift_can_read());
revoke all on public.staff_shift_base, public.staff_shift_day from anon;
revoke insert, update, delete on public.staff_shift_base, public.staff_shift_day from authenticated;
grant select on public.staff_shift_base, public.staff_shift_day to authenticated;

-- 表示名（日誌の名前。空白は全角のまま。例「横田　祥」）
create or replace function public.staff_shift_name(p uuid) returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(btrim(nikki_name), ''), nullif(btrim(full_name), '')) from staff_profiles where user_id = p;
$$;
revoke all on function public.staff_shift_name(uuid) from public, anon;

-- 期間のシフトを1回で返す。staff=表に出る人（型か変更がある人）、pick=足せる人（レオ在籍。宮本は休職なので出さない）
-- punches は管理者・児発管・事務・会長だけ（打刻との照らし合わせ用。職員には返さない）
create or replace function public.staff_shift_get(p_from date, p_to date) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare can_edit boolean := public.staff_shift_can_edit();
  see_punch boolean := coalesce(auth.role(), '') = 'service_role' or public.can_manage() or public.is_chair();
  res jsonb;
begin
  if not public.staff_shift_can_read() then raise exception 'レオの職員だけが見られます'; end if;
  if p_to < p_from or p_to - p_from > 62 then raise exception '期間は62日までです'; end if;
  with who as (
    select distinct user_id from staff_shift_base
    union select distinct user_id from staff_shift_day where day between p_from and p_to)
  select jsonb_build_object(
    'can_edit', can_edit,
    'staff', coalesce((select jsonb_agg(jsonb_build_object('user_id', w.user_id, 'name', public.staff_shift_name(w.user_id)) order by sp.full_name)
       from who w join staff_profiles sp on sp.user_id = w.user_id), '[]'::jsonb),
    'base', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'user_id', user_id, 'dow', dow, 'start', to_char(start_time, 'HH24:MI'), 'end', to_char(end_time, 'HH24:MI'), 'note', note) order by user_id, dow, start_time) from staff_shift_base), '[]'::jsonb),
    'days', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'day', day, 'user_id', user_id, 'kind', kind, 'start', to_char(start_time, 'HH24:MI'), 'end', to_char(end_time, 'HH24:MI'), 'note', note) order by day, user_id) from staff_shift_day where day between p_from and p_to), '[]'::jsonb),
    'pick', case when can_edit then coalesce((select jsonb_agg(jsonb_build_object('user_id', user_id, 'name', public.staff_shift_name(user_id)) order by full_name)
       from staff_profiles where active and (office = 'レオ' or 'レオ' = any(coalesce(extra_offices, '{}')))
         and replace(replace(coalesce(full_name, ''), '　', ''), ' ', '') not like '宮本%'), '[]'::jsonb) else '[]'::jsonb end,
    'punches', case when see_punch then coalesce((
       select jsonb_agg(jsonb_build_object('user_id', sp.user_id, 'day', x.d, 'in', x.t_in, 'out', x.t_out) order by x.d)
       from (select p.staff_name, (p.punched_at at time zone 'Asia/Tokyo')::date d,
               to_char(min(p.punched_at at time zone 'Asia/Tokyo') filter (where p.kind = '出勤'), 'HH24:MI') t_in,
               to_char(max(p.punched_at at time zone 'Asia/Tokyo') filter (where p.kind = '退勤'), 'HH24:MI') t_out
             from dakoku_punches p
             where (p.punched_at at time zone 'Asia/Tokyo')::date between p_from and p_to
             group by 1, 2) x
       join staff_profiles sp on sp.active and replace(replace(coalesce(sp.full_name, ''), '　', ''), ' ', '') = replace(replace(coalesce(x.staff_name, ''), '　', ''), ' ', '')
       join who w on w.user_id = sp.user_id), '[]'::jsonb) else null end
  ) into res;
  return res;
end $$;
revoke all on function public.staff_shift_get(date, date) from public, anon;
grant execute on function public.staff_shift_get(date, date) to authenticated;

-- いつもの型：その人のその曜日を丸ごと置きかえる。p_slots=[{start,end}]（空なら、その曜日は入らない）
create or replace function public.staff_shift_set_base(p_user uuid, p_dow int, p_slots jsonb) returns void language plpgsql security definer set search_path = public as $$
declare s jsonb;
begin
  if not public.staff_shift_can_edit() then raise exception '管理者だけが直せます'; end if;
  if p_dow not between 0 and 6 then raise exception '曜日が正しくありません'; end if;
  if not exists (select 1 from staff_profiles where user_id = p_user) then raise exception '職員が見つかりません'; end if;
  delete from staff_shift_base where user_id = p_user and dow = p_dow;
  for s in select * from jsonb_array_elements(coalesce(p_slots, '[]'::jsonb)) loop
    if coalesce(s->>'start', '') = '' or coalesce(s->>'end', '') = '' then continue; end if;
    insert into staff_shift_base (user_id, dow, start_time, end_time, note, updated_by)
    values (p_user, p_dow, (s->>'start')::time, (s->>'end')::time, nullif(s->>'note', ''), auth.uid())
    on conflict (user_id, dow, start_time) do update set end_time = excluded.end_time, note = excluded.note, updated_at = now(), updated_by = excluded.updated_by;
  end loop;
end $$;
revoke all on function public.staff_shift_set_base(uuid, int, jsonb) from public, anon;
grant execute on function public.staff_shift_set_base(uuid, int, jsonb) to authenticated;

-- その日だけ：p_kind = 休み／時間変更／追加／型に戻す（その日の変更を全部消す）。追加の1件だけ消すのは p_kind='削除' と p_id
create or replace function public.staff_shift_set_day(p_day date, p_user uuid, p_kind text, p_start text default null, p_end text default null, p_note text default null, p_id bigint default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.staff_shift_can_edit() then raise exception '管理者だけが直せます'; end if;
  if not exists (select 1 from staff_profiles where user_id = p_user) then raise exception '職員が見つかりません'; end if;
  if p_kind = '型に戻す' then
    delete from staff_shift_day where day = p_day and user_id = p_user;
  elsif p_kind = '削除' then
    delete from staff_shift_day where id = p_id and day = p_day and user_id = p_user;
  elsif p_kind in ('休み', '時間変更') then
    delete from staff_shift_day where day = p_day and user_id = p_user and kind in ('休み', '時間変更');
    insert into staff_shift_day (day, user_id, kind, start_time, end_time, note, updated_by)
    values (p_day, p_user, p_kind, case when p_kind = '時間変更' then nullif(p_start, '')::time end, case when p_kind = '時間変更' then nullif(p_end, '')::time end, nullif(btrim(coalesce(p_note, '')), ''), auth.uid());
  elsif p_kind = '追加' then
    insert into staff_shift_day (day, user_id, kind, start_time, end_time, note, updated_by)
    values (p_day, p_user, '追加', nullif(p_start, '')::time, nullif(p_end, '')::time, nullif(btrim(coalesce(p_note, '')), ''), auth.uid());
  else raise exception '種類が正しくありません'; end if;
end $$;
revoke all on function public.staff_shift_set_day(date, uuid, text, text, text, text, bigint) from public, anon;
grant execute on function public.staff_shift_set_day(date, uuid, text, text, text, text, bigint) to authenticated;
