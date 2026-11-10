-- 打刻忘れ申告（#dakoku）。Supabase のみ（Google／GAS／シートは使わない）。
-- 本人が申告 → 管理者（dakoku_admin_can）が承認すると dakoku_punches に入る。
-- テーブルは直接読めない・書けない（RLS有効・ポリシーなし・権限なし）。RPC 経由だけ。
create table if not exists public.dakoku_requests (
  id bigint generated always as identity primary key,
  staff_id text not null,
  staff_name text not null,
  office text not null,
  target_date date not null,
  kind text not null check (kind in ('出勤','退勤')),
  req_time time not null,
  reason text not null check (length(btrim(reason)) > 0),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  requested_by_email text not null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  decided_by text,
  decided_at timestamptz,
  decide_note text,
  punch_id bigint references public.dakoku_punches(id) on delete set null
);
create index if not exists dakoku_requests_staff on public.dakoku_requests (staff_id, created_at desc);
create index if not exists dakoku_requests_status on public.dakoku_requests (status, created_at);
create index if not exists dakoku_requests_punch on public.dakoku_requests (punch_id);
create unique index if not exists dakoku_requests_one_pending on public.dakoku_requests (staff_id, target_date, kind) where status = 'pending';
alter table public.dakoku_requests enable row level security;
revoke all on public.dakoku_requests from public, anon, authenticated;

-- 本人が申告（ログインメール＝名簿メールの職員だけ。他人の分は出せない）
create or replace function public.dakoku_request_submit(p_staff_id text, p_date text, p_kind text, p_time text, p_reason text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s public.dakoku_staff;
  v_email text := lower(coalesce(auth.jwt()->>'email',''));
  d date;
  t time;
  today date := (now() at time zone 'Asia/Tokyo')::date;
  v_reason text := btrim(coalesce(p_reason,''));
  day_txt text;
  new_id bigint;
begin
  if auth.uid() is null or v_email = '' then raise exception 'ログインが必要です'; end if;
  select * into s from public.dakoku_staff where id = btrim(coalesce(p_staff_id,'')) and enabled;
  if not found then return jsonb_build_object('ok', false, 'error', '職員が見つかりません'); end if;
  if coalesce(nullif(btrim(s.email),''), '') = '' or v_email <> lower(btrim(s.email)) then
    return jsonb_build_object('ok', false, 'error', '自分の分だけ申告できます');
  end if;
  if p_kind is distinct from '出勤' and p_kind is distinct from '退勤' then
    return jsonb_build_object('ok', false, 'error', '種別は出勤か退勤です');
  end if;
  if coalesce(p_date,'') !~ '^\d{4}-\d{2}-\d{2}$' then
    return jsonb_build_object('ok', false, 'error', '日付を選んでください');
  end if;
  if coalesce(p_time,'') !~ '^([01]?\d|2[0-3]):[0-5]\d$' then
    return jsonb_build_object('ok', false, 'error', '時刻を HH:MM で入れてください');
  end if;
  begin d := p_date::date; exception when others then
    return jsonb_build_object('ok', false, 'error', '日付が正しくありません');
  end;
  t := p_time::time;
  if d > today then return jsonb_build_object('ok', false, 'error', '先の日付は申告できません'); end if;
  if d < today - 31 then return jsonb_build_object('ok', false, 'error', '31日より前の分は責任者に伝えてください'); end if;
  if d = today and t > (now() at time zone 'Asia/Tokyo')::time then
    return jsonb_build_object('ok', false, 'error', 'まだ来ていない時刻は申告できません');
  end if;
  if length(v_reason) = 0 then return jsonb_build_object('ok', false, 'error', '理由を書いてください'); end if;
  day_txt := to_char(d, 'YYYY-MM-DD');
  if exists (select 1 from public.dakoku_punches where staff_id = s.id and kind = p_kind and punched_at_jst like day_txt || ' %') then
    return jsonb_build_object('ok', false, 'error', 'この日の' || p_kind || 'は記録済みです');
  end if;
  if exists (select 1 from public.dakoku_requests where staff_id = s.id and target_date = d and kind = p_kind and status = 'pending') then
    return jsonb_build_object('ok', false, 'error', 'この日の' || p_kind || 'は申告済み（承認待ち）です');
  end if;
  insert into public.dakoku_requests (staff_id, staff_name, office, target_date, kind, req_time, reason, requested_by_email, created_by)
  values (s.id, s.name, s.office, d, p_kind, t, left(v_reason, 200), v_email, auth.uid())
  returning id into new_id;
  return jsonb_build_object('ok', true, 'id', new_id);
end;
$$;

-- 一覧：本人は自分の申告（直近60日）。管理者は承認待ち全件と直近の処理済み。
create or replace function public.dakoku_request_list()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_email text := lower(coalesce(auth.jwt()->>'email',''));
  adm boolean := public.dakoku_admin_can();
  mine jsonb;
  pend jsonb := '[]'::jsonb;
  done jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'ログインが必要です'; end if;
  select coalesce(jsonb_agg(x.obj order by x.created_at desc), '[]'::jsonb) into mine from (
    select r.created_at, jsonb_build_object('id', r.id, 'staffId', r.staff_id, 'name', r.staff_name, 'office', r.office,
      'date', to_char(r.target_date,'YYYY-MM-DD'), 'kind', r.kind, 'time', to_char(r.req_time,'HH24:MI'), 'reason', r.reason,
      'status', r.status, 'decidedBy', coalesce(r.decided_by,''), 'note', coalesce(r.decide_note,''),
      'createdAt', to_char(r.created_at at time zone 'Asia/Tokyo','YYYY-MM-DD HH24:MI')) obj
    from public.dakoku_requests r
    join public.dakoku_staff s on s.id = r.staff_id
    where v_email <> '' and coalesce(btrim(s.email),'') <> '' and lower(btrim(s.email)) = v_email
      and r.created_at > now() - interval '60 days'
    order by r.created_at desc limit 50) x;
  if adm then
    select coalesce(jsonb_agg(x.obj order by x.created_at), '[]'::jsonb) into pend from (
      select r.created_at, jsonb_build_object('id', r.id, 'staffId', r.staff_id, 'name', r.staff_name, 'office', r.office,
        'date', to_char(r.target_date,'YYYY-MM-DD'), 'kind', r.kind, 'time', to_char(r.req_time,'HH24:MI'), 'reason', r.reason,
        'status', r.status, 'createdAt', to_char(r.created_at at time zone 'Asia/Tokyo','YYYY-MM-DD HH24:MI')) obj
      from public.dakoku_requests r where r.status = 'pending' order by r.created_at limit 200) x;
    select coalesce(jsonb_agg(x.obj order by x.decided_at desc), '[]'::jsonb) into done from (
      select r.decided_at, jsonb_build_object('id', r.id, 'name', r.staff_name, 'office', r.office,
        'date', to_char(r.target_date,'YYYY-MM-DD'), 'kind', r.kind, 'time', to_char(r.req_time,'HH24:MI'),
        'status', r.status, 'decidedBy', coalesce(r.decided_by,''), 'note', coalesce(r.decide_note,'')) obj
      from public.dakoku_requests r where r.status <> 'pending' order by r.decided_at desc nulls last limit 10) x;
  end if;
  return jsonb_build_object('ok', true, 'admin', adm, 'mine', mine, 'pending', pend, 'recentDone', done);
end;
$$;

-- 承認・却下（管理者だけ）。承認で dakoku_punches に1行入れ、punch_id を結ぶ。
create or replace function public.dakoku_request_decide(p_id bigint, p_approve boolean, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.dakoku_requests;
  v_email text := lower(coalesce(auth.jwt()->>'email',''));
  decider text;
  at_jst text;
  pid bigint;
  note text := nullif(btrim(coalesce(p_note,'')), '');
begin
  if auth.uid() is null then raise exception 'ログインが必要です'; end if;
  if not public.dakoku_admin_can() then return jsonb_build_object('ok', false, 'error', '承認できるのは管理者だけです'); end if;
  select * into r from public.dakoku_requests where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', '申告が見つかりません'); end if;
  if r.status <> 'pending' then return jsonb_build_object('ok', false, 'error', 'この申告は処理済みです'); end if;
  select coalesce(
    (select nullif(btrim(full_name),'') from public.staff_profiles where user_id = auth.uid()),
    (select ds.name from public.dakoku_staff ds where ds.email is not null and lower(btrim(ds.email)) = v_email order by ds.id limit 1),
    nullif(v_email,''), '管理者') into decider;
  decider := replace(decider, ' ', ''); decider := replace(decider, '　', '');
  if not coalesce(p_approve, false) then
    update public.dakoku_requests set status = 'rejected', decided_by = decider, decided_at = now(), decide_note = left(note, 200) where id = r.id;
    return jsonb_build_object('ok', true, 'status', 'rejected');
  end if;
  at_jst := to_char(r.target_date + r.req_time, 'YYYY-MM-DD HH24:MI:SS');
  select id into pid from public.dakoku_punches
    where staff_id = r.staff_id and kind = r.kind and punched_at_jst like to_char(r.target_date,'YYYY-MM-DD') || ' %'
    order by punched_at_jst limit 1;
  if found then
    update public.dakoku_requests set status = 'approved', decided_by = decider, decided_at = now(),
      decide_note = left(coalesce(note || '／', '') || '同じ日の' || r.kind || 'が既にあるため追加せず', 200) where id = r.id;
    return jsonb_build_object('ok', true, 'status', 'approved', 'skipped', true, 'punchId', null);
  end if;
  insert into public.dakoku_punches (punched_at, punched_at_jst, office, staff_id, staff_name, kind, lunch, email, memo, created_by)
  values ((r.target_date + r.req_time) at time zone 'Asia/Tokyo', at_jst, r.office, r.staff_id, r.staff_name, r.kind, false, '',
    left('本人申告（打刻漏れ）／' || decider || '承認：' || r.reason, 200), auth.uid())
  returning id into pid;
  update public.dakoku_requests set status = 'approved', decided_by = decider, decided_at = now(), decide_note = left(note, 200), punch_id = pid where id = r.id;
  return jsonb_build_object('ok', true, 'status', 'approved', 'skipped', false, 'punchId', pid, 'at', at_jst);
end;
$$;

-- 月別一覧に「申告」印（memo 先頭が 本人申告）を返す
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
      'proxy', coalesce(memo,'') like '管理者記録%',
      'request', coalesce(memo,'') like '本人申告%'
    ) as obj
    from public.dakoku_punches
    where staff_id = s.id
      and punched_at_jst >= mon_start
      and punched_at_jst < mon_end
  ) x;
  return jsonb_build_object('ok', true, 'month', mon, 'staffId', s.id, 'rows', rows);
end;
$$;

revoke all on function public.dakoku_request_submit(text,text,text,text,text) from public, anon;
revoke all on function public.dakoku_request_list() from public, anon;
revoke all on function public.dakoku_request_decide(bigint,boolean,text) from public, anon;
grant execute on function public.dakoku_request_submit(text,text,text,text,text) to authenticated;
grant execute on function public.dakoku_request_list() to authenticated;
grant execute on function public.dakoku_request_decide(bigint,boolean,text) to authenticated;

notify pgrst, 'reload schema';
