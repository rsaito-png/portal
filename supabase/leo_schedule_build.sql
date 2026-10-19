-- 利用予定の作成（25日に実行）：保護者の回答（leo_schedule_weekday / exception）＋型表 → leo_events（利用・休み・迎え・送り）
-- 意味は Google の GAS と同じ：利用＝来る時間／迎え☆＝担当ごとにまとめて乗る順／送り★／母の送り＝迎えなし／母の迎え＝送りなし
-- source='kata' が「この処理で作った行」。作り直すときはこの行だけ消して入れ直す（職員が直した source='portal' 行・Google取込 source='google' 行は触らない）
alter table public.leo_events add column if not exists kid_places jsonb;   -- 迎え・送り：児童ごとの場所
alter table public.leo_events add column if not exists kid_times jsonb;    -- 迎え・送り：児童ごとの目安時刻

create or replace function public.leo_sched_staff(p text) returns text language sql immutable as $$
  select case when p like '友香%' then '中村　友香' when p like '文%' then '中村　文' when p like '宮本%' or p like '祥%' then '宮本　幸子'
    when p like '齊藤%' or p like '連%' then '齊藤　連' else nullif(p, '') end $$;
create or replace function public.leo_sched_kata_all() returns setof jsonb language sql stable security definer set search_path = public as $$
  select data from leo_master where kind = 'kata' union all select data from leo_sheet where kind = 'kata' and not exists (select 1 from leo_master where kind = 'kata') $$;
revoke all on function public.leo_sched_kata_all, public.leo_sched_staff from public;

-- 中身（権限チェックなし。直接は呼べない）
create or replace function public.leo_sched_plan_core(p_month date) returns jsonb language plpgsql security definer set search_path = public as $$
declare ev jsonb := '[]'; warn jsonb := '[]'; closed date[]; last_day date := (p_month + interval '1 month - 1 day')::date;
  v record; g record; hol text;
begin
  closed := leo_sched_closed(p_month);
  create temp table if not exists _lsv (day date, child text, dow text, ks text, ke text, ps text, pe text, pst text, dst text, pord int, dord int, par text, pplace text, dplace text, parent_drop bool, parent_pick bool) on commit drop;
  truncate _lsv;
  -- 1) 児童×日の「来る日」を決める
  insert into _lsv
  select d.day, k->>'児童名', d.dow, k->>'利用開始', k->>'利用終了', nullif(k->>'迎え開始', ''), nullif(k->>'送り終了', ''),
    leo_sched_staff(k->>'迎え担当'), leo_sched_staff(k->>'送り担当'), nullif(k->>'迎え順', '')::int, nullif(k->>'送り順', '')::int, coalesce(k->>'保護者送迎', ''),
    coalesce(nullif(k->>'迎え場所', ''), case when nullif(k->>'迎え開始', '') is null then '自宅' else '（未登録）' end), coalesce(nullif(k->>'送り場所（空欄なら自宅）', ''), '自宅'), false, false
  from (select d::date as day, (array['日','月','火','水','木','金','土'])[extract(dow from d)::int + 1] as dow from generate_series(p_month, last_day, interval '1 day') d) d
  join leo_sched_kata_all() k on k->>'曜日' = d.dow
  where d.day <> all(closed)
    and (case when exists (select 1 from leo_schedule_weekday w where w.child = k->>'児童名' and w.month = p_month)
         then coalesce((select w.use from leo_schedule_weekday w where w.child = k->>'児童名' and w.month = p_month and w.dow = d.dow), false)
         else coalesce(k->>'利用週', '毎週') <> '不定期' end);
  for v in select c from (select distinct data->>'児童名' c from leo_sched_kata_all() data) x where not exists (select 1 from leo_schedule_weekday w where w.child = c and w.month = p_month) loop
    warn := warn || jsonb_build_array(jsonb_build_object('child', v.c, 'msg', '回答がありません（型表の「毎週」どおりで作成）'));
  end loop;
  -- 2) 曜日回答：学校お迎え時刻の変更（迎え開始・利用開始を同じ分だけずらす）、迎え・送り場所
  update _lsv s set
    ks = to_char((s.ks::time + (w.school_time::time - s.ps::time)), 'HH24:MI'), ps = w.school_time
    from leo_schedule_weekday w where w.child = s.child and w.month = p_month and w.dow = s.dow and w.school_time is not null and s.ps is not null and w.school_time <> s.ps;
  update _lsv s set pplace = coalesce(w.pick_place, s.pplace), dplace = coalesce(w.drop_place, s.dplace)
    from leo_schedule_weekday w where w.child = s.child and w.month = p_month and w.dow = s.dow;
  -- 3) 日ごとの連絡
  for v in select * from leo_schedule_exception e where e.month = p_month and e.day is not null order by e.id loop
    if v.kind = '休み' then
      delete from _lsv where child = v.child and day = v.day;
      ev := ev || jsonb_build_array(jsonb_build_object('day', v.day, 'kind', '休み', 'child', v.child, 'title', v.child || '　休み'));
    elsif v.kind in ('追加利用') then
      if not exists (select 1 from _lsv where child = v.child and day = v.day) and v.day <> all(closed) then
        insert into _lsv select v.day, v.child, d.dow, k->>'利用開始', k->>'利用終了', nullif(k->>'迎え開始', ''), nullif(k->>'送り終了', ''),
            leo_sched_staff(k->>'迎え担当'), leo_sched_staff(k->>'送り担当'), nullif(k->>'迎え順', '')::int, nullif(k->>'送り順', '')::int, coalesce(k->>'保護者送迎', ''),
            coalesce(nullif(k->>'迎え場所', ''), case when nullif(k->>'迎え開始', '') is null then '自宅' else '（未登録）' end), coalesce(nullif(k->>'送り場所（空欄なら自宅）', ''), '自宅'), false, false
          from (select (array['日','月','火','水','木','金','土'])[extract(dow from v.day)::int + 1] dow) d,
            lateral (select k from leo_sched_kata_all() k where k->>'児童名' = v.child order by (k->>'曜日' = d.dow) desc, k->>'曜日' limit 1) kk(k);
        if not found then warn := warn || jsonb_build_array(jsonb_build_object('child', v.child, 'msg', to_char(v.day, 'MM/DD') || ' 追加利用：型表に行がないため作れません')); end if;
      end if;
      if v.time is not null then
        update _lsv s set ks = case when s.ps is not null then to_char(s.ks::time + (v.time::time - s.ps::time), 'HH24:MI') else s.ks end, ps = case when s.ps is not null then v.time end where s.child = v.child and s.day = v.day;
      end if;
    elsif v.kind = '時刻変更' then
      update _lsv s set ks = case when s.ps is not null then to_char(s.ks::time + (v.time::time - s.ps::time), 'HH24:MI') else v.time end, ps = case when s.ps is not null then v.time end where s.child = v.child and s.day = v.day;
    elsif v.kind = '母の送り' then
      update _lsv set parent_drop = true, ps = null, pst = null where child = v.child and day = v.day;
    elsif v.kind = '母の迎え' then
      update _lsv set parent_pick = true, ke = coalesce(v.time, ke), pe = null, dst = null where child = v.child and day = v.day;
    elsif v.kind = '送り場所変更' then
      update _lsv set dplace = v.place where child = v.child and day = v.day;
    end if;
  end loop;
  -- 型表で母の送り／母の迎えの子
  update _lsv set parent_drop = true, ps = null, pst = null where par = '母の送り' and not parent_drop;
  update _lsv set parent_pick = true, pe = null, dst = null where par = '母の迎え' and not parent_pick;
  for v in select distinct child, e.memo from leo_schedule_exception e where e.month = p_month and e.kind = '要確認' loop
    warn := warn || jsonb_build_array(jsonb_build_object('child', v.child, 'msg', '保護者の備考：' || coalesce(v.memo, '')));
  end loop;
  -- 4) 利用
  select ev || coalesce(jsonb_agg(jsonb_build_object('day', day, 'kind', '利用', 'child', child, 'start_time', ks, 'end_time', ke, 'parent_drop', parent_drop, 'parent_pick', parent_pick,
      'title', child || case when parent_drop then '（母の送り）' when parent_pick then '（母の迎え）' else '' end,
      'note', (select '⚠ 保護者の備考：' || string_agg(coalesce(e.memo, ''), ' / ') from leo_schedule_exception e where e.month = p_month and e.kind = '要確認' and e.child = _lsv.child)) order by day, ks), '[]') into ev from _lsv;
  -- 5) 迎え（担当ごと・乗る順）／送り
  for g in select day, pst staff, array_agg(child order by ps, pord nulls last) kids, min(ps) st, max(ks) en,
        jsonb_object_agg(child, pplace) kp, jsonb_object_agg(child, ps) kt
      from (select *, sum(case when pm is null or ps >= pm then 1 else 0 end) over (partition by day, pst order by ps, pord) grp
            from (select *, max(ks) over (partition by day, pst order by ps, pord rows between unbounded preceding and 1 preceding) pm from _lsv where ps is not null and not parent_drop) a) b
      group by day, pst, grp loop
    ev := ev || jsonb_build_array(jsonb_build_object('day', g.day, 'kind', '迎え', 'kids', g.kids, 'staff', g.staff, 'start_time', g.st, 'end_time', g.en, 'kid_places', g.kp, 'kid_times', g.kt,
      'place', (select string_agg(distinct x, '、') from jsonb_each_text(g.kp) e(k, x) where x <> '自宅'), 'title', '☆' || array_to_string(g.kids, '→')));
    if g.staff is null then warn := warn || jsonb_build_array(jsonb_build_object('child', array_to_string(g.kids, '・'), 'msg', to_char(g.day, 'MM/DD') || ' 迎えの担当が決まっていません')); end if;
  end loop;
  for g in select day, dst staff, array_agg(child order by dord nulls last, ke) kids, min(ke) st, max(pe) en,
        jsonb_object_agg(child, dplace) kp, jsonb_object_agg(child, ke) kt
      from (select *, sum(case when pm is null or ke >= pm then 1 else 0 end) over (partition by day, dst order by ke, dord) grp
            from (select *, max(coalesce(pe, ke)) over (partition by day, dst order by ke, dord rows between unbounded preceding and 1 preceding) pm from _lsv where not parent_pick and (pe is not null or dst is not null)) a) b
      group by day, dst, grp loop
    ev := ev || jsonb_build_array(jsonb_build_object('day', g.day, 'kind', '送り', 'kids', g.kids, 'staff', g.staff, 'start_time', g.st, 'end_time', g.en, 'kid_places', g.kp, 'kid_times', g.kt,
      'place', (select string_agg(distinct x, '、') from jsonb_each_text(g.kp) e(k, x) where x <> '自宅'), 'title', '★' || array_to_string(g.kids, '→')));
    if g.staff is null then warn := warn || jsonb_build_array(jsonb_build_object('child', array_to_string(g.kids, '・'), 'msg', to_char(g.day, 'MM/DD') || ' 送りの担当が決まっていません')); end if;
  end loop;
  -- 6) 担当が不在の日
  for g in select e.day, e.staff, e.title from leo_events e where e.kind = '不在' and e.day >= p_month and e.day <= last_day loop
    if exists (select 1 from jsonb_array_elements(ev) x where x->>'day' = g.day::text and x->>'staff' = g.staff and x->>'kind' in ('迎え', '送り')) then
      warn := warn || jsonb_build_array(jsonb_build_object('child', g.staff, 'msg', to_char(g.day, 'MM/DD') || ' 不在の予定（' || coalesce(g.title, '') || '）の日に送迎担当になっています'));
    end if;
  end loop;
  return jsonb_build_object('events', ev, 'warnings', warn, 'closed', to_jsonb(closed),
    'google_events', (select count(*) from leo_events where source = 'google' and kind in ('利用','迎え','送り','休み') and day >= p_month and day <= last_day),
    'answered', (select count(distinct child) from leo_schedule_answer where month = p_month),
    'children', (select count(distinct data->>'児童名') from leo_sched_kata_all() data));
end $$;
revoke all on function public.leo_sched_plan_core from public;

-- 確認用（何も書き込まない）
create or replace function public.leo_sched_plan(p_month date) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage() then raise exception '児発管・管理者・事務のみ'; end if;
  if extract(day from p_month) <> 1 then raise exception '月の1日を指定してください'; end if;
  return leo_sched_plan_core(p_month);
end $$;
-- 確定（この処理で作った source='kata' の行だけ入れ替える）。Googleの予定が同じ月にあるときは止める（二重になるため）
create or replace function public.leo_sched_commit(p_month date, p_force boolean default false) returns jsonb language plpgsql security definer set search_path = public as $$
declare p jsonb; n int; last_day date := (p_month + interval '1 month - 1 day')::date;
begin
  if not public.can_manage() then raise exception '児発管・管理者・事務のみ'; end if;
  if extract(day from p_month) <> 1 then raise exception '月の1日を指定してください'; end if;
  p := leo_sched_plan_core(p_month);
  if (p->>'google_events')::int > 0 and not p_force then raise exception 'この月にはGoogleカレンダー由来の予定が % 件あります。二重になるので、Googleで作る処理を止めたことを確認してから進めてください', p->>'google_events'; end if;
  delete from leo_events where source = 'kata' and day >= p_month and day <= last_day and kind in ('利用','休み','迎え','送り');
  insert into leo_events (day, kind, child, kids, staff, start_time, end_time, parent_drop, parent_pick, place, note, title, source, kid_places, kid_times)
  select (x->>'day')::date, x->>'kind', x->>'child', coalesce(array(select jsonb_array_elements_text(x->'kids')), '{}'), x->>'staff', x->>'start_time', x->>'end_time',
    coalesce((x->>'parent_drop')::bool, false), coalesce((x->>'parent_pick')::bool, false), x->>'place', x->>'note', x->>'title', 'kata', x->'kid_places', x->'kid_times'
  from jsonb_array_elements(p->'events') x;
  get diagnostics n = row_count;
  return jsonb_build_object('inserted', n, 'warnings', p->'warnings');
end $$;
revoke all on function public.leo_sched_plan, public.leo_sched_commit from public;
grant execute on function public.leo_sched_plan, public.leo_sched_commit to authenticated;
