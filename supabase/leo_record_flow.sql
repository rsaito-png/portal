-- レオ記録をポータルDB正にする（2026-11）。Google日誌への書き戻しは増やさない。
-- この順でつなぐ。各関数は単体でも呼べるが、leo_record_day が途中で切らずに通す。
--   1) 利用予定（leo_events の kind=利用、欠席時対応の休み）→ 日誌（leo_nikki）
--   2) LINE下書き（leo_line_drafts。トップの下書きも写す）→ 日誌の活動記録（leo_activity と leo_nikki.activity）
--   3) 日誌 → サービス提供実績（leo_jisseki：日付・児童・出席/欠席・開始終了）
-- 請求の国保連入力は簡易入力への手打ち。ここではCSVを作らない。
-- すでに入っている Google 由来の実績（source が「ポータル」以外）は上書きしない。
-- Supabase SQL Editor でこのファイルを Run する。

alter table public.leo_nikki add column if not exists seed text;
alter table public.leo_nikki add column if not exists activity_via text;

create or replace function public.leo_record_allowed() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth.role(), '') = 'service_role' or public.my_office() = 'レオ'
$$;

-- 児童名のゆれ（空白）を吸収して jsonb の値を取る
create or replace function public.leo_kid_json(j jsonb, name text) returns text
language sql immutable as $$
  select coalesce(
    nullif(j ->> name, ''),
    (select nullif(e.value, '')
       from jsonb_each_text(coalesce(j, '{}'::jsonb)) e
      where public.leo_norm(e.key) = public.leo_norm(name)
      limit 1))
$$;

-- です・ますをである調にする補完。ボット（source=ボット）の本文は上書きしない。
-- 長い語から置換する。五段の「走りました→走った」を先に行い、残った「ました」は一段（食べました→食べた）。
create or replace function public.leo_dearu(b text) returns text
language plpgsql immutable as $$
declare
  s text := coalesce(b, '');
  p text[];
  pairs text[][] := array[
    array['ませんでした','なかった'],
    array['でした','だった'],
    array['ていました','ていた'],
    array['できました','できた'],
    array['行きました','行った'],
    array['来ました','来た'],
    array['しました','した'],
    array['降りました','降りた'],
    array['借りました','借りた'],
    array['りました','った'],
    array['びました','んだ'],
    array['見ました','見た'],
    array['みました','んだ'],
    array['ちました','った'],
    array['ぎました','いだ'],
    array['きました','いた'],
    array['いました','った'],
    array['ました','た'],
    array['ません','ない'],
    array['します','する'],
    array['です','である']
  ];
begin
  foreach p slice 1 in array pairs loop
    s := replace(s, p[1], p[2]);
  end loop;
  return nullif(trim(s), '');
end $$;

create or replace function public.leo_event_hidden(p_source text, p_title text, p_note text) returns boolean
language sql immutable as $$
  select p_source = 'portal' and (coalesce(p_title, '') = 'カレンダーで削除' or coalesce(p_note, '') = 'カレンダーで削除')
$$;

-- 1) 予定 → 日誌。無い児童だけ足す。空欄の開始終了・送迎だけ予定で埋める。手入力の活動は触らない。
create or replace function public.leo_nikki_from_events(p_day date) returns int
language plpgsql security definer set search_path = public as $$
declare
  r record;
  n int := 0;
  base int;
  svc text;
  p_driver text; p_time text; p_place text;
  d_driver text; d_time text; d_place text; d_src text; kata_drop text;
  kid_drop text; d_end text; d_start text; dow text;
begin
  if not public.leo_record_allowed() then raise exception 'レオ職員のみ'; end if;
  if p_day is null then raise exception '日付'; end if;

  create temporary table if not exists _leo_plan (
    child text, kind text, start_time text, end_time text,
    parent_drop boolean, parent_pick boolean) on commit drop;
  truncate _leo_plan;

  insert into _leo_plan (child, kind, start_time, end_time, parent_drop, parent_pick)
  with ev as (
    select * from leo_events where day = p_day
  ), use_one as (
    select distinct on (public.leo_norm(child)) *
      from ev
     where kind = '利用' and coalesce(btrim(child), '') <> '' and not public.leo_event_hidden(source, title, note)
     order by public.leo_norm(child), updated_at desc nulls last, id desc
  ), abs_one as (
    select distinct on (public.leo_norm(child)) *
      from ev
     where kind = '休み' and coalesce(btrim(child), '') <> ''
       and (title = '欠席（欠席時対応加算）'
            or coalesce(note, '') like '%区分:欠席（欠席時対応加算）%'
            or coalesce(note, '') like '%区分：欠席（欠席時対応加算）%')
     order by public.leo_norm(child), updated_at desc nulls last, id desc
  ), cancel_one as (
    select distinct on (public.leo_norm(child)) *
      from ev
     where kind = '休み' and coalesce(btrim(child), '') <> ''
       and (title = 'キャンセル' or coalesce(note, '') like '%区分:キャンセル%' or coalesce(note, '') like '%区分：キャンセル%')
     order by public.leo_norm(child), updated_at desc nulls last, id desc
  )
  select coalesce(u.child, a.child),
    case
      when c.id is not null
       and (u.updated_at is null or c.updated_at >= u.updated_at)
       and (a.updated_at is null or c.updated_at >= a.updated_at) then null
      when a.id is not null and (u.updated_at is null or a.updated_at >= u.updated_at) then '欠席'
      when u.id is not null then '利用'
    end,
    u.start_time, u.end_time, coalesce(u.parent_drop, false), coalesce(u.parent_pick, false)
  from use_one u
  full join abs_one a on public.leo_norm(a.child) = public.leo_norm(u.child)
  left join cancel_one c on public.leo_norm(c.child) = public.leo_norm(coalesce(u.child, a.child));

  delete from _leo_plan where kind is null or coalesce(btrim(child), '') = '';

  -- 予定から消えた、まだ活動を書いていないポータル行だけ外す（キャンセルは日誌・実績に残さない）
  delete from leo_nikki n
   where n.day = p_day and n.seed = 'events'
     and coalesce(n.activity_via, '') <> '手入力'
     and coalesce(btrim(n.activity), '') = ''
     and not exists (select 1 from _leo_plan p where public.leo_norm(p.child) = public.leo_norm(n.child));

  for r in select * from _leo_plan order by kind, child loop
    select coalesce(nullif(e.staff, ''), case when r.parent_drop then '保護者' end),
           coalesce(public.leo_kid_json(e.kid_times, r.child), e.start_time),
           coalesce(public.leo_kid_json(e.kid_places, r.child), e.place)
      into p_driver, p_time, p_place
      from leo_events e
     where e.day = p_day and e.kind = '迎え' and not public.leo_event_hidden(e.source, e.title, e.note)
       and (public.leo_norm(e.child) = public.leo_norm(r.child)
            or exists (select 1 from unnest(e.kids) k where public.leo_norm(k) = public.leo_norm(r.child)))
     order by e.updated_at desc nulls last, e.id desc
     limit 1;
    if p_driver is null and r.parent_drop then p_driver := '保護者'; end if;

    select coalesce(nullif(e.staff, ''), case when r.parent_pick then '保護者' end),
           nullif(btrim(public.leo_kid_json(e.kid_times, r.child)), ''),
           nullif(btrim(e.end_time), ''),
           nullif(btrim(e.start_time), ''),
           coalesce(public.leo_kid_json(e.kid_places, r.child), e.place),
           e.source
      into d_driver, kid_drop, d_end, d_start, d_place, d_src
      from leo_events e
     where e.day = p_day and e.kind = '送り' and not public.leo_event_hidden(e.source, e.title, e.note)
       and (public.leo_norm(e.child) = public.leo_norm(r.child)
            or exists (select 1 from unnest(e.kids) k where public.leo_norm(k) = public.leo_norm(r.child)))
     order by e.updated_at desc nulls last, e.id desc
     limit 1;
    if d_driver is null and r.parent_pick then d_driver := '保護者'; end if;
    -- 送り時刻が空のときだけ埋める（下の update は、すでに入っている drop_time を残す）。
    -- 着の順。児童ごとの時刻が利用終了と同じときは、古い確定の写しなので着とみなさない。
    --   1. 児童ごとの着（kid_times。共有便ではその子の送り終了）
    --   2. 便の end_time（最後の着。型表の行が見つからなくてもここを使う）
    --   3. 型表の送り終了（画面の送り時間。列名が「送り時間」の行も読む）
    --   4. 便の start_time（乗り始め。利用終了と同じになりやすい）
    -- source が kata 以外（カレンダーで職員が直した便）は型表で置き換えない。
    -- 母の迎えの日は施設の送りが無いので型表では埋めない。保護者の回答に送り時刻の欄は無い。
    kata_drop := null;
    dow := (array['日','月','火','水','木','金','土'])[extract(dow from p_day)::int + 1];
    if not r.parent_pick then
      select nullif(btrim(coalesce(nullif(btrim(k->>'送り終了'), ''), nullif(btrim(k->>'送り時間'), ''))), '')
        into kata_drop
        from (
          select data as k from leo_master where kind = 'kata'
          union all
          select data from leo_sheet where kind = 'kata'
            and not exists (select 1 from leo_master where kind = 'kata')
        ) s
       where public.leo_norm(k->>'児童名') = public.leo_norm(r.child)
         and left(btrim(k->>'曜日'), 1) = dow
         and coalesce(k->>'保護者送迎', '') is distinct from '母の迎え'
       order by (btrim(k->>'曜日') = dow) desc, (k->>'児童名' = public.leo_name_canon(k->>'児童名')) desc, k->>'児童名'
       limit 1;
    end if;
    if d_src is not null and d_src is distinct from 'kata' then
      if kid_drop is not null and kid_drop is distinct from nullif(btrim(r.end_time), '') then
        d_time := kid_drop;
      elsif d_end is not null and d_end is distinct from nullif(btrim(r.end_time), '') then
        d_time := d_end;
      else
        d_time := coalesce(kid_drop, d_end, d_start);
      end if;
    elsif kid_drop is not null and kid_drop is distinct from nullif(btrim(r.end_time), '') then
      d_time := kid_drop;
    elsif d_end is not null and d_end is distinct from nullif(btrim(r.end_time), '') then
      d_time := d_end;
    elsif kata_drop is not null then
      d_time := kata_drop;
    else
      d_time := coalesce(kid_drop, d_end, d_start);
    end if;

    select c.kind into svc from leo_children c where public.leo_norm(c.name) = public.leo_norm(r.child) limit 1;

    if exists (select 1 from leo_nikki n where n.day = p_day and public.leo_norm(n.child) = public.leo_norm(r.child)) then
      update leo_nikki n set
        kind = case when n.seed = 'events' and coalesce(n.activity_via, '') <> '手入力' then r.kind else n.kind end,
        -- 種別が分かっていれば、日誌に先に入っていた「放課後等デイサービス」などで上書きする。不明なときは今の文字を残す。
        service = case when svc in ('児発', '放デイ') then svc else coalesce(nullif(btrim(n.service), ''), svc) end,
        start_time = case when r.kind = '利用' and coalesce(btrim(n.start_time), '') = '' then nullif(btrim(r.start_time), '') else n.start_time end,
        end_time = case when r.kind = '利用' and coalesce(btrim(n.end_time), '') = '' then nullif(btrim(r.end_time), '') else n.end_time end,
        pick_driver = coalesce(nullif(btrim(n.pick_driver), ''), p_driver),
        pick_time = coalesce(nullif(btrim(n.pick_time), ''), p_time),
        pick_place = coalesce(nullif(btrim(n.pick_place), ''), p_place),
        drop_driver = coalesce(nullif(btrim(n.drop_driver), ''), d_driver),
        drop_time = coalesce(nullif(btrim(n.drop_time), ''), d_time),
        drop_place = coalesce(nullif(btrim(n.drop_place), ''), d_place),
        seed = case when n.day >= date '2026-11-01' then coalesce(n.seed, 'events') else n.seed end
      where n.day = p_day and public.leo_norm(n.child) = public.leo_norm(r.child);
      n := n + 1;
    else
      base := case when r.kind = '欠席' then 20 else 9 end;
      while exists (select 1 from leo_nikki where day = p_day and row_no = base) loop
        base := base + 1;
        if base > 80 then raise exception '日誌の行が足りません'; end if;
      end loop;
      insert into leo_nikki (day, row_no, kind, child, service, start_time, end_time,
        pick_driver, pick_time, pick_place, drop_driver, drop_time, drop_place, seed)
      values (p_day, base, r.kind, r.child, svc,
        case when r.kind = '利用' then nullif(btrim(r.start_time), '') end,
        case when r.kind = '利用' then nullif(btrim(r.end_time), '') end,
        p_driver, p_time, p_place, d_driver, d_time, d_place, 'events');
      n := n + 1;
    end if;
    p_driver := null; p_time := null; p_place := null;
    d_driver := null; d_time := null; d_place := null; d_src := null; kata_drop := null;
    kid_drop := null; d_end := null; d_start := null;
    svc := null;
  end loop;
  return n;
end $$;

-- 3) 日誌 → 実績。source=ポータル の行だけ更新する。Google由来の行は残す。
create or replace function public.leo_jisseki_from_nikki(p_day date) returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; m int := 0;
begin
  if not public.leo_record_allowed() then raise exception 'レオ職員のみ'; end if;
  if p_day is null then raise exception '日付'; end if;

  update leo_jisseki j set
    status = case when s.kind = '利用' then '出席' else '欠席' end,
    start_time = case when s.kind = '利用' then public.leo_time(s.start_time) else null end,
    end_time = case when s.kind = '利用' then public.leo_time(s.end_time) else null end,
    source = 'ポータル',
    synced_at = now()
  from (
    select distinct on (public.leo_norm(child)) child, kind, start_time, end_time
      from leo_nikki
     where day = p_day and kind in ('利用', '欠席') and coalesce(btrim(child), '') <> ''
     order by public.leo_norm(child), (kind = '利用') desc, row_no
  ) s
  where j.day = p_day and public.leo_norm(j.child) = public.leo_norm(s.child)
    and (j.source is null or j.source = 'ポータル');
  get diagnostics m = row_count;

  insert into leo_jisseki (day, child, status, start_time, end_time, source)
  select p_day, s.child,
    case when s.kind = '利用' then '出席' else '欠席' end,
    case when s.kind = '利用' then public.leo_time(s.start_time) end,
    case when s.kind = '利用' then public.leo_time(s.end_time) end,
    'ポータル'
  from (
    select distinct on (public.leo_norm(child)) child, kind, start_time, end_time
      from leo_nikki
     where day = p_day and kind in ('利用', '欠席') and coalesce(btrim(child), '') <> ''
     order by public.leo_norm(child), (kind = '利用') desc, row_no
  ) s
  where not exists (
    select 1 from leo_jisseki j
     where j.day = p_day and public.leo_norm(j.child) = public.leo_norm(s.child));
  get diagnostics n = row_count;

  delete from leo_jisseki j
   where j.day = p_day and j.source = 'ポータル'
     and not exists (
       select 1 from leo_nikki nk
        where nk.day = p_day and nk.kind in ('利用', '欠席')
          and public.leo_norm(nk.child) = public.leo_norm(j.child));
  return n + m;
end $$;

-- 2) 下書き → 活動記録。先に日誌行を足し、最後に実績へ載せる（1→2→3）。
-- ボット・手入力の活動は上書きしない。ボットがまだならである調で補完する。
create or replace function public.leo_activity_from_drafts(p_day date) returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0;
begin
  if not public.leo_record_allowed() then raise exception 'レオ職員のみ'; end if;
  if p_day is null then raise exception '日付'; end if;

  perform public.leo_nikki_from_events(p_day);

  if auth.uid() is not null then
    insert into leo_line_drafts (day, child, body, author_name)
    select d.day, d.child, d.body, d.author
      from leo_diary_draft d
     where d.day = p_day and coalesce(btrim(d.body), '') <> ''
       and not exists (
         select 1 from leo_line_drafts l
          where l.day = d.day and public.leo_norm(l.child) = public.leo_norm(d.child));
  end if;

  insert into leo_activity (day, child, text, source, draft_id, made_by)
  select distinct on (public.leo_norm(d.child))
    d.day, d.child, public.leo_dearu(public.leo_simple_activity(d.body)), '自動（簡易）', d.id, auth.uid()
    from leo_line_drafts d
   where d.day = p_day and public.leo_dearu(public.leo_simple_activity(d.body)) is not null
   order by public.leo_norm(d.child), d.updated_at desc
  on conflict (day, child) do update
    set text = excluded.text, draft_id = excluded.draft_id, made_at = now()
    where leo_activity.source = '自動（簡易）';
  get diagnostics n = row_count;

  update leo_nikki nk set
    activity = left(a.text, 6000),
    activity_via = a.source
  from leo_activity a
  where nk.day = p_day and a.day = p_day and nk.kind = '利用'
    and public.leo_norm(nk.child) = public.leo_norm(a.child)
    and a.source in ('自動（簡易）', 'ボット')
    and coalesce(nk.activity_via, '') <> '手入力'
    and (coalesce(btrim(nk.activity), '') = '' or nk.activity_via in ('自動（簡易）', 'ボット'));

  perform public.leo_jisseki_from_nikki(p_day);
  return n;
end $$;

-- 画面が開いた日に 1→2→3 を通す
create or replace function public.leo_record_day(p_day date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.leo_record_allowed() then raise exception 'レオ職員のみ'; end if;
  n := public.leo_activity_from_drafts(p_day);
  return jsonb_build_object('day', p_day, 'activity', n);
end $$;

create or replace function public.leo_record_span(p_from date, p_to date) returns int
language plpgsql security definer set search_path = public as $$
declare d date; n int := 0;
begin
  if not public.leo_record_allowed() then raise exception 'レオ職員のみ'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception '日付'; end if;
  if p_to - p_from > 40 then raise exception '範囲は40日まで'; end if;
  for d in select generate_series(p_from, p_to, '1 day')::date loop
    perform public.leo_record_day(d);
    n := n + 1;
  end loop;
  return n;
end $$;

-- 日誌の直す。Googleの直し依頼（leo_edits）には出さない。活動を直すと手入力になり、自動転記は上書きしない。
create or replace function public.leo_nikki_apply(p_day date, p_row int, p_fields jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  allowed text[] := array['activity','pick_place','pick_time','pick_driver','start_time','end_time','drop_time','drop_driver','drop_place'];
  k text; v text; child text; touched_activity boolean := false;
begin
  if not public.leo_record_allowed() then raise exception 'レオ職員のみ'; end if;
  if p_day is null or p_row is null or jsonb_typeof(p_fields) <> 'object' then raise exception '形式'; end if;
  if not exists (select 1 from leo_nikki where day = p_day and row_no = p_row) then raise exception '日誌の行がありません'; end if;
  for k, v in select e.key, e.value from jsonb_each_text(p_fields) e loop
    if not (k = any (allowed)) then continue; end if;
    v := nullif(btrim(v), '');
    if k = 'activity' then
      update leo_nikki set activity = left(coalesce(v, ''), 6000), activity_via = '手入力' where day = p_day and row_no = p_row;
      touched_activity := true;
    elsif k = 'pick_place' then update leo_nikki set pick_place = v where day = p_day and row_no = p_row;
    elsif k = 'pick_time' then update leo_nikki set pick_time = v where day = p_day and row_no = p_row;
    elsif k = 'pick_driver' then update leo_nikki set pick_driver = v where day = p_day and row_no = p_row;
    elsif k = 'start_time' then update leo_nikki set start_time = v where day = p_day and row_no = p_row;
    elsif k = 'end_time' then update leo_nikki set end_time = v where day = p_day and row_no = p_row;
    elsif k = 'drop_time' then update leo_nikki set drop_time = v where day = p_day and row_no = p_row;
    elsif k = 'drop_driver' then update leo_nikki set drop_driver = v where day = p_day and row_no = p_row;
    elsif k = 'drop_place' then update leo_nikki set drop_place = v where day = p_day and row_no = p_row;
    end if;
  end loop;
  if touched_activity then
    select nk.child into child from leo_nikki nk where nk.day = p_day and nk.row_no = p_row;
    insert into leo_activity (day, child, text, source, made_by)
    select p_day, child, left(coalesce(nk.activity, ''), 6000), '手入力', auth.uid()
      from leo_nikki nk where nk.day = p_day and nk.row_no = p_row
    on conflict (day, child) do update
      set text = excluded.text, source = '手入力', made_at = now(), made_by = excluded.made_by;
  end if;
  perform public.leo_jisseki_from_nikki(p_day);
end $$;

-- Google同期が戻っても、ポータルで足した日誌とポータル実績は消さない・上書きしない
create or replace function public.leo_sync(p_token text, p_nikki jsonb, p_jisseki jsonb, p_days date[])
returns text language plpgsql security definer set search_path = public, extensions as $$
begin
  if encode(digest(p_token, 'sha256'), 'hex') is distinct from (select token_sha256 from sync_secret where name = 'leo')
    then raise exception 'bad token'; end if;
  delete from leo_nikki where day = any(p_days) and coalesce(seed, '') <> 'events';
  insert into leo_nikki select * from jsonb_populate_recordset(null::leo_nikki, p_nikki)
    on conflict (day, row_no) do nothing;
  insert into leo_jisseki select * from jsonb_populate_recordset(null::leo_jisseki, p_jisseki)
    on conflict (day, child) do update set status = excluded.status, start_time = excluded.start_time,
      end_time = excluded.end_time, source = excluded.source, synced_at = now()
    where leo_jisseki.source is distinct from 'ポータル';
  return 'ok';
end $$;

revoke all on function public.leo_record_allowed() from public;
revoke all on function public.leo_nikki_from_events(date) from public, anon;
revoke all on function public.leo_jisseki_from_nikki(date) from public, anon;
revoke all on function public.leo_activity_from_drafts(date) from public, anon;
revoke all on function public.leo_record_day(date) from public, anon;
revoke all on function public.leo_record_span(date, date) from public, anon;
revoke all on function public.leo_nikki_apply(date, int, jsonb) from public, anon;
grant execute on function public.leo_nikki_from_events(date) to authenticated, service_role;
grant execute on function public.leo_jisseki_from_nikki(date) to authenticated, service_role;
grant execute on function public.leo_activity_from_drafts(date) to authenticated, service_role;
grant execute on function public.leo_record_day(date) to authenticated, service_role;
grant execute on function public.leo_record_span(date, date) to authenticated, service_role;
grant execute on function public.leo_nikki_apply(date, int, jsonb) to authenticated, service_role;
