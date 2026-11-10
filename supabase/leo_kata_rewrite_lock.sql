-- leo_kata_rewrite_day：同じ日の同時実行で「利用」が二重になるのを防ぐ（2026-11-10、11/10に2児童分が二重）
CREATE OR REPLACE FUNCTION public.leo_kata_rewrite_day(p_day date, p_plan jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  plan jsonb := p_plan;
  evj jsonb;
  kids_left text[];
  kid text;
begin
  if p_day is null or p_day < greatest((timezone('Asia/Tokyo', now()))::date, public.leo_sync_start()) then return; end if;
  -- 同じ日を同時に2回作り直すと（保存の二重送信など）型表の行が二重になるので、日ごとに順番待ちにする
  perform pg_advisory_xact_lock(hashtext('leo_kata_rewrite_day:' || p_day::text));
  if plan is null then plan := public.leo_sched_plan_core(date_trunc('month', p_day)::date); end if;
  create temp table if not exists _kata_prev (
    day date, key text,
    start_time text, end_time text, pick_time text, pick_place text, pick_driver text,
    drop_time text, drop_driver text, drop_place text,
    primary key (day, key)
  ) on commit drop;
  if not exists (select 1 from _kata_prev where day = p_day) then
    insert into _kata_prev (day, key, start_time, end_time, pick_time, pick_place, pick_driver, drop_time, drop_driver, drop_place)
    select p_day, public.leo_norm(c.child),
      (select nullif(btrim(e.start_time), '') from leo_events e
        where e.day = p_day and e.source = 'kata' and e.kind = '利用' and public.leo_norm(e.child) = public.leo_norm(c.child)
        order by e.updated_at desc nulls last, e.id desc limit 1),
      (select nullif(btrim(e.end_time), '') from leo_events e
        where e.day = p_day and e.source = 'kata' and e.kind = '利用' and public.leo_norm(e.child) = public.leo_norm(c.child)
        order by e.updated_at desc nulls last, e.id desc limit 1),
      (select coalesce(public.leo_kid_json(e.kid_times, c.child), nullif(btrim(e.start_time), '')) from leo_events e
        where e.day = p_day and e.source = 'kata' and e.kind = '迎え'
          and (public.leo_norm(e.child) = public.leo_norm(c.child) or exists (select 1 from unnest(coalesce(e.kids, '{}')) k where public.leo_norm(k) = public.leo_norm(c.child)))
        order by e.updated_at desc nulls last, e.id desc limit 1),
      (select coalesce(public.leo_kid_json(e.kid_places, c.child), nullif(btrim(e.place), '')) from leo_events e
        where e.day = p_day and e.source = 'kata' and e.kind = '迎え'
          and (public.leo_norm(e.child) = public.leo_norm(c.child) or exists (select 1 from unnest(coalesce(e.kids, '{}')) k where public.leo_norm(k) = public.leo_norm(c.child)))
        order by e.updated_at desc nulls last, e.id desc limit 1),
      (select nullif(btrim(e.staff), '') from leo_events e
        where e.day = p_day and e.source = 'kata' and e.kind = '迎え'
          and (public.leo_norm(e.child) = public.leo_norm(c.child) or exists (select 1 from unnest(coalesce(e.kids, '{}')) k where public.leo_norm(k) = public.leo_norm(c.child)))
        order by e.updated_at desc nulls last, e.id desc limit 1),
      (select coalesce(
          case when nullif(btrim(public.leo_kid_json(e.kid_times, c.child)), '') is distinct from nullif(btrim(u.end_time), '')
               then nullif(btrim(public.leo_kid_json(e.kid_times, c.child)), '') end,
          case when nullif(btrim(e.end_time), '') is distinct from nullif(btrim(u.end_time), '')
               then nullif(btrim(e.end_time), '') end,
          nullif(btrim(e.start_time), ''))
        from leo_events e
        left join lateral (
          select end_time from leo_events u
          where u.day = p_day and u.source = 'kata' and u.kind = '利用' and public.leo_norm(u.child) = public.leo_norm(c.child)
          order by u.id desc limit 1
        ) u on true
        where e.day = p_day and e.source = 'kata' and e.kind = '送り'
          and (public.leo_norm(e.child) = public.leo_norm(c.child) or exists (select 1 from unnest(coalesce(e.kids, '{}')) k where public.leo_norm(k) = public.leo_norm(c.child)))
        order by e.updated_at desc nulls last, e.id desc limit 1),
      (select nullif(btrim(e.staff), '') from leo_events e
        where e.day = p_day and e.source = 'kata' and e.kind = '送り'
          and (public.leo_norm(e.child) = public.leo_norm(c.child) or exists (select 1 from unnest(coalesce(e.kids, '{}')) k where public.leo_norm(k) = public.leo_norm(c.child)))
        order by e.updated_at desc nulls last, e.id desc limit 1),
      (select coalesce(public.leo_kid_json(e.kid_places, c.child), nullif(btrim(e.place), '')) from leo_events e
        where e.day = p_day and e.source = 'kata' and e.kind = '送り'
          and (public.leo_norm(e.child) = public.leo_norm(c.child) or exists (select 1 from unnest(coalesce(e.kids, '{}')) k where public.leo_norm(k) = public.leo_norm(c.child)))
        order by e.updated_at desc nulls last, e.id desc limit 1)
    from (
      select e.child from leo_events e where e.day = p_day and e.source = 'kata' and e.kind = '利用' and coalesce(e.child, '') <> ''
      union
      select k from leo_events e cross join lateral unnest(coalesce(e.kids, '{}')) k
      where e.day = p_day and e.source = 'kata' and e.kind in ('迎え', '送り') and coalesce(k, '') <> ''
    ) c(child);
  end if;

  delete from leo_events e
  where e.source = 'kata' and e.day = p_day and e.kind in ('利用', '迎え', '送り');

  for evj in
    select value from jsonb_array_elements(coalesce(plan->'events', '[]'::jsonb))
    where (value->>'day')::date = p_day and value->>'kind' in ('利用', '迎え', '送り')
  loop
    if evj->>'kind' in ('迎え', '送り') then
      select coalesce(array_agg(t.k order by t.ord), '{}') into kids_left
      from jsonb_array_elements_text(coalesce(evj->'kids', '[]'::jsonb)) with ordinality t(k, ord)
      where not public.leo_portal_covers(p_day, evj->>'kind', t.k);
      if coalesce(cardinality(kids_left), 0) = 0 then continue; end if;
      insert into leo_events (day, kind, child, kids, staff, start_time, end_time, parent_drop, parent_pick, place, note, title, source, kid_places, kid_times)
      values (p_day, evj->>'kind', null, kids_left, evj->>'staff', evj->>'start_time', evj->>'end_time', false, false,
        (select string_agg(distinct v, '、') from jsonb_each_text(coalesce(evj->'kid_places', '{}'::jsonb)) e(k, v)
          where public.leo_norm(e.k) in (select public.leo_norm(u) from unnest(kids_left) u) and coalesce(v, '') <> '' and v <> '自宅'),
        evj->>'note', (case when evj->>'kind' = '迎え' then '☆' else '★' end) || array_to_string(kids_left, '→'), 'kata',
        (select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) from jsonb_each(coalesce(evj->'kid_places', '{}'::jsonb)) e
          where public.leo_norm(e.key) in (select public.leo_norm(u) from unnest(kids_left) u)),
        (select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) from jsonb_each(coalesce(evj->'kid_times', '{}'::jsonb)) e
          where public.leo_norm(e.key) in (select public.leo_norm(u) from unnest(kids_left) u)));
    elsif not public.leo_portal_covers(p_day, '利用', evj->>'child') then
      insert into leo_events (day, kind, child, kids, staff, start_time, end_time, parent_drop, parent_pick, place, note, title, source, kid_places, kid_times)
      values (p_day, evj->>'kind', evj->>'child', '{}', evj->>'staff', evj->>'start_time', evj->>'end_time',
        coalesce((evj->>'parent_drop')::bool, false), coalesce((evj->>'parent_pick')::bool, false),
        evj->>'place', evj->>'note', evj->>'title', 'kata', evj->'kid_places', evj->'kid_times');
    end if;
  end loop;
end $function$;
