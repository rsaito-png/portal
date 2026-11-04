-- 日誌の送り時刻を、送り便の着から埋める。Supabase SQL Editor でこのファイルだけ Run する。
-- CREATE OR REPLACE だけ。権限の設定は足さない（置き換えても、すでにある実行できる人はそのまま）。
-- すでに leo_nikki.drop_time が入っている行は上書きしない。空のときだけ、次の順で埋める。
--   1. 送り便の児童ごとの着（kid_times。利用終了と同じ値は古い写しなので着とみなさない）
--   2. 送り便の end_time（最後の着。型表の行が無くてもここを使う）
--   3. 型表の送り終了（画面の送り時間。列名が「送り時間」の行も読む）
--   4. 送り便の start_time（乗り始め）
-- カレンダーで職員が直した便（source が kata 以外）は型表で置き換えない。
-- この関数は supabase/leo_record_flow.sql と同じ中身。あとから record_flow を実行しても戻らない。
-- 依存する関数（leo_record_allowed, leo_kid_json, leo_norm, leo_name_canon, leo_event_hidden）は、先に record_flow を一度実行してあること。

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

-- 任意。11月の利用で、送り時刻が利用の終了時刻と同じ行だけ着に直す。
-- 別の送り時刻がすでに入っている行は対象にしない。欠席も対象にしない。
-- 先にこの select のコメントを外して対象を見る。問題なければ、その下の update のコメントも外して実行する。
-- このファイルを Run しただけでは日誌を書き換えない。
/*
select n.day, n.child, n.row_no, n.end_time as use_end, n.drop_time as drop_time_now, s.drop_time_to_set
from leo_nikki n
join lateral (
  select case
    when ev.src is not null and ev.src is distinct from 'kata' then
      case
        when ev.kid_drop is not null and ev.kid_drop is distinct from nullif(btrim(n.end_time), '') then ev.kid_drop
        when ev.d_end is not null and ev.d_end is distinct from nullif(btrim(n.end_time), '') then ev.d_end
        else coalesce(ev.kid_drop, ev.d_end, ev.d_start)
      end
    when ev.kid_drop is not null and ev.kid_drop is distinct from nullif(btrim(n.end_time), '') then ev.kid_drop
    when ev.d_end is not null and ev.d_end is distinct from nullif(btrim(n.end_time), '') then ev.d_end
    when ev.kata_drop is not null then ev.kata_drop
    else coalesce(ev.kid_drop, ev.d_end, ev.d_start)
  end as drop_time_to_set
  from (
    select
      e.source as src,
      nullif(btrim(public.leo_kid_json(e.kid_times, n.child)), '') as kid_drop,
      nullif(btrim(e.end_time), '') as d_end,
      nullif(btrim(e.start_time), '') as d_start,
      case when coalesce(u.parent_pick, false) then null else (
        select nullif(btrim(coalesce(nullif(btrim(k->>'送り終了'), ''), nullif(btrim(k->>'送り時間'), ''))), '')
          from (
            select data as k from leo_master where kind = 'kata'
            union all
            select data from leo_sheet where kind = 'kata'
              and not exists (select 1 from leo_master where kind = 'kata')
          ) src
         where public.leo_norm(k->>'児童名') = public.leo_norm(n.child)
           and left(btrim(k->>'曜日'), 1) = (array['日','月','火','水','木','金','土'])[extract(dow from n.day)::int + 1]
           and coalesce(k->>'保護者送迎', '') is distinct from '母の迎え'
         order by (btrim(k->>'曜日') = (array['日','月','火','水','木','金','土'])[extract(dow from n.day)::int + 1]) desc,
                  (k->>'児童名' = public.leo_name_canon(k->>'児童名')) desc, k->>'児童名'
         limit 1
      ) end as kata_drop
    from (select 1) one
    left join lateral (
      select e.source, e.kid_times, e.end_time, e.start_time
        from leo_events e
       where e.day = n.day and e.kind = '送り'
         and not (e.source = 'portal' and (coalesce(e.title, '') = 'カレンダーで削除' or coalesce(e.note, '') = 'カレンダーで削除'))
         and (public.leo_norm(e.child) = public.leo_norm(n.child)
              or exists (select 1 from unnest(e.kids) k where public.leo_norm(k) = public.leo_norm(n.child)))
       order by e.updated_at desc nulls last, e.id desc
       limit 1
    ) e on true
    left join lateral (
      select u.parent_pick
        from leo_events u
       where u.day = n.day and u.kind = '利用' and public.leo_norm(u.child) = public.leo_norm(n.child)
         and not (u.source = 'portal' and (coalesce(u.title, '') = 'カレンダーで削除' or coalesce(u.note, '') = 'カレンダーで削除'))
       order by u.updated_at desc nulls last, u.id desc
       limit 1
    ) u on true
  ) ev
) s on true
where n.day >= date '2026-11-01' and n.day < date '2026-12-01'
  and n.kind = '利用'
  and coalesce(btrim(n.drop_time), '') <> ''
  and btrim(n.drop_time) = btrim(n.end_time)
  and s.drop_time_to_set is not null
  and btrim(s.drop_time_to_set) is distinct from btrim(n.drop_time)
order by n.day, n.row_no;
*/

-- update leo_nikki n
--    set drop_time = s.drop_time_to_set
--   from (
--     select n2.day, n2.row_no, s2.drop_time_to_set
--       from leo_nikki n2
--       join lateral (
--         select case
--           when ev.src is not null and ev.src is distinct from 'kata' then
--             case
--               when ev.kid_drop is not null and ev.kid_drop is distinct from nullif(btrim(n2.end_time), '') then ev.kid_drop
--               when ev.d_end is not null and ev.d_end is distinct from nullif(btrim(n2.end_time), '') then ev.d_end
--               else coalesce(ev.kid_drop, ev.d_end, ev.d_start)
--             end
--           when ev.kid_drop is not null and ev.kid_drop is distinct from nullif(btrim(n2.end_time), '') then ev.kid_drop
--           when ev.d_end is not null and ev.d_end is distinct from nullif(btrim(n2.end_time), '') then ev.d_end
--           when ev.kata_drop is not null then ev.kata_drop
--           else coalesce(ev.kid_drop, ev.d_end, ev.d_start)
--         end as drop_time_to_set
--         from (
--           select
--             e.source as src,
--             nullif(btrim(public.leo_kid_json(e.kid_times, n2.child)), '') as kid_drop,
--             nullif(btrim(e.end_time), '') as d_end,
--             nullif(btrim(e.start_time), '') as d_start,
--             case when coalesce(u.parent_pick, false) then null else (
--               select nullif(btrim(coalesce(nullif(btrim(k->>'送り終了'), ''), nullif(btrim(k->>'送り時間'), ''))), '')
--                 from (
--                   select data as k from leo_master where kind = 'kata'
--                   union all
--                   select data from leo_sheet where kind = 'kata'
--                     and not exists (select 1 from leo_master where kind = 'kata')
--                 ) src
--                where public.leo_norm(k->>'児童名') = public.leo_norm(n2.child)
--                  and left(btrim(k->>'曜日'), 1) = (array['日','月','火','水','木','金','土'])[extract(dow from n2.day)::int + 1]
--                  and coalesce(k->>'保護者送迎', '') is distinct from '母の迎え'
--                order by (btrim(k->>'曜日') = (array['日','月','火','水','木','金','土'])[extract(dow from n2.day)::int + 1]) desc,
--                         (k->>'児童名' = public.leo_name_canon(k->>'児童名')) desc, k->>'児童名'
--                limit 1
--             ) end as kata_drop
--           from (select 1) one
--           left join lateral (
--             select e.source, e.kid_times, e.end_time, e.start_time
--               from leo_events e
--              where e.day = n2.day and e.kind = '送り'
--                and not (e.source = 'portal' and (coalesce(e.title, '') = 'カレンダーで削除' or coalesce(e.note, '') = 'カレンダーで削除'))
--                and (public.leo_norm(e.child) = public.leo_norm(n2.child)
--                     or exists (select 1 from unnest(e.kids) k where public.leo_norm(k) = public.leo_norm(n2.child)))
--              order by e.updated_at desc nulls last, e.id desc
--              limit 1
--           ) e on true
--           left join lateral (
--             select u.parent_pick
--               from leo_events u
--              where u.day = n2.day and u.kind = '利用' and public.leo_norm(u.child) = public.leo_norm(n2.child)
--                and not (u.source = 'portal' and (coalesce(u.title, '') = 'カレンダーで削除' or coalesce(u.note, '') = 'カレンダーで削除'))
--              order by u.updated_at desc nulls last, u.id desc
--              limit 1
--           ) u on true
--         ) ev
--       ) s2 on true
--      where n2.day >= date '2026-11-01' and n2.day < date '2026-12-01'
--        and n2.kind = '利用'
--        and coalesce(btrim(n2.drop_time), '') <> ''
--        and btrim(n2.drop_time) = btrim(n2.end_time)
--        and s2.drop_time_to_set is not null
--        and btrim(s2.drop_time_to_set) is distinct from btrim(n2.drop_time)
--   ) s
--  where n.day = s.day and n.row_no = s.row_no;
