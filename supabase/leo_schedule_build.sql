-- 退所日の除外と児童名の照合は、このファイルの leo_sched_plan_core に入っている（leo_left.sql / leo_sched_name.sql と同じ定義）。このファイルを再実行しても、その二つは残る。
-- 確認（leo_sched_plan）は何も書き込まない。確定（leo_sched_commit）だけが source='kata' の予定を入れる。型表は書き換えない。
-- 利用予定の作成（25日に実行）：保護者の回答（leo_schedule_weekday / exception）＋型表 → leo_events（利用・休み・迎え・送り）
-- 意味は Google の GAS と同じ：利用＝来る時間／迎え☆＝担当ごとにまとめて乗る順／送り★／母の送り＝迎えなし／母の迎え＝送りなし
-- source='kata' が「この処理で作った行」。作り直すときはこの行だけ消して入れ直す（職員が直した source='portal' 行・Google取込 source='google' 行は触らない）
alter table public.leo_events add column if not exists kid_places jsonb;   -- 迎え・送り：児童ごとの場所
alter table public.leo_events add column if not exists kid_times jsonb;    -- 迎え・送り：児童ごとの目安時刻

-- leo_sched_staff(p)：職員の呼び名→氏名の対応表。実名を含むため公開リポジトリから削除（定義はDB上にある）
create or replace function public.leo_sched_kata_all() returns setof jsonb language sql stable security definer set search_path = public as $$
  select data from leo_master where kind = 'kata' union all select data from leo_sheet where kind = 'kata' and not exists (select 1 from leo_master where kind = 'kata') $$;
revoke all on function public.leo_sched_kata_all, public.leo_sched_staff from public;

-- BEGIN leo_name_helpers
create or replace function public.leo_name_canon(p text) returns text
language sql immutable parallel safe as $$
  select btrim(regexp_replace(
    translate(
      coalesce(p, ''),
      chr(12288) || chr(160) || chr(5760)
        || chr(8192) || chr(8193) || chr(8194) || chr(8195) || chr(8196) || chr(8197) || chr(8198) || chr(8199) || chr(8200) || chr(8201) || chr(8202)
        || chr(8232) || chr(8233) || chr(8239) || chr(8287) || chr(65279),
      repeat(' ', 19)),
    '[[:space:]]+', ' ', 'g'))
$$;

create or replace function public.leo_name_tokens(p text) returns text[]
language sql immutable parallel safe as $$
  select case when public.leo_name_canon(p) = '' then '{}'::text[]
    else regexp_split_to_array(public.leo_name_canon(p), ' ') end
$$;

create or replace function public.leo_name_same(a text, b text) returns boolean
language sql immutable parallel safe as $$
  select public.leo_name_canon(a) <> '' and (
    public.leo_name_canon(a) = public.leo_name_canon(b)
    or (
      cardinality(public.leo_name_tokens(a)) = 1
      and cardinality(public.leo_name_tokens(b)) >= 2
      and (public.leo_name_tokens(a))[1] = (public.leo_name_tokens(b))[cardinality(public.leo_name_tokens(b))]
    )
    or (
      cardinality(public.leo_name_tokens(b)) = 1
      and cardinality(public.leo_name_tokens(a)) >= 2
      and (public.leo_name_tokens(b))[1] = (public.leo_name_tokens(a))[cardinality(public.leo_name_tokens(a))]
    )
  )
$$;

-- 型表の名前（戻り値の kata は空白を揃えた表記）と、回答に保存されている名前（answer は保存値のまま）を結ぶ。
create or replace function public.leo_name_resolve(p_kata text[], p_answers text[])
returns table(kata text, answer text, kind text)
language sql stable as $$
  with kata as (
    select distinct public.leo_name_canon(n) as name
    from unnest(coalesce(p_kata, '{}'::text[])) n
    where public.leo_name_canon(n) <> ''
  ),
  ans as (
    select n as name
    from unnest(coalesce(p_answers, '{}'::text[])) n
    where public.leo_name_canon(n) <> ''
    group by n
  ),
  exact as (
    select a.name as answer, k.name as kata
    from ans a
    join kata k on k.name = public.leo_name_canon(a.name)
  ),
  token_hits as (
    select a.name as answer, k.name as kata
    from ans a
    join kata k on not exists (select 1 from exact e where e.answer = a.name)
      and (
        (cardinality(public.leo_name_tokens(a.name)) = 1
          and cardinality(public.leo_name_tokens(k.name)) >= 2
          and (public.leo_name_tokens(k.name))[cardinality(public.leo_name_tokens(k.name))] = (public.leo_name_tokens(a.name))[1])
        or
        (cardinality(public.leo_name_tokens(a.name)) >= 2
          and cardinality(public.leo_name_tokens(k.name)) = 1
          and (public.leo_name_tokens(a.name))[cardinality(public.leo_name_tokens(a.name))] = k.name)
      )
  ),
  token_n as (
    select answer, count(*)::int as n from token_hits group by answer
  )
  select e.kata, e.answer, 'link'::text from exact e
  union all
  select t.kata, t.answer, 'link'::text from token_hits t join token_n n on n.answer = t.answer and n.n = 1
  union all
  select t.kata, t.answer, 'ambiguous'::text from token_hits t join token_n n on n.answer = t.answer and n.n > 1
  union all
  select null::text, a.name, 'orphan'::text
  from ans a
  where not exists (select 1 from exact e where e.answer = a.name)
    and not exists (select 1 from token_hits t where t.answer = a.name)
$$;

create or replace function public.leo_sched_name_rows(p_month date)
returns table(kata text, answer text, kind text)
language plpgsql stable security definer set search_path = public as $$
declare kat text[]; ans text[];
begin
  select coalesce(array_agg(distinct n), '{}') into kat from (
    select k->>'児童名' as n from leo_sched_kata_all() k
  ) s where coalesce(n, '') <> '';
  select coalesce(array_agg(distinct c), '{}') into ans from (
    select child as c from leo_schedule_weekday where month = p_month
    union all select child from leo_schedule_exception where month = p_month
    union all select child from leo_schedule_answer where month = p_month
  ) s where coalesce(c, '') <> '';
  return query select * from public.leo_name_resolve(kat, ans);
end $$;
-- END leo_name_helpers

revoke all on function public.leo_name_canon(text), public.leo_name_tokens(text), public.leo_name_same(text, text), public.leo_name_resolve(text[], text[]), public.leo_sched_name_rows(date) from public, anon, authenticated;

-- 中身（権限チェックなし。直接は呼べない）
-- BEGIN leo_sched_plan_core
-- 予定の中身。型表は読むだけ。回答が結び付いた子は回答を優先し、結び付かない子だけ型表の「毎週」どおり。確認用の呼び出しは書き込まない。
create or replace function public.leo_sched_plan_core(p_month date) returns jsonb language plpgsql security definer set search_path = public as $$
declare ev jsonb := '[]'; warn jsonb := '[]'; closed date[]; last_day date := (p_month + interval '1 month - 1 day')::date;
  v record; g record; hol text;
begin
  closed := leo_sched_closed(p_month);
  create temp table if not exists _lsv (day date, child text, dow text, ks text, ke text, ps text, pe text, pst text, dst text, pord int, dord int, par text, pplace text, dplace text, parent_drop bool, parent_pick bool) on commit drop;
  truncate _lsv;
  if to_regclass('pg_temp._nres') is not null then drop table pg_temp._nres; end if;
  create temp table _nres (kata text, answer text, kind text) on commit drop;
  insert into _nres select * from public.leo_sched_name_rows(p_month);
  insert into _lsv
  select d.day, public.leo_name_canon(kata.k->>'児童名'), d.dow, kata.k->>'利用開始', kata.k->>'利用終了', nullif(kata.k->>'迎え開始', ''), nullif(kata.k->>'送り終了', ''),
    leo_sched_staff(kata.k->>'迎え担当'), leo_sched_staff(kata.k->>'送り担当'), nullif(kata.k->>'迎え順', '')::int, nullif(kata.k->>'送り順', '')::int, coalesce(kata.k->>'保護者送迎', ''),
    coalesce(nullif(kata.k->>'迎え場所', ''), case when nullif(kata.k->>'迎え開始', '') is null then '自宅' else '（未登録）' end), coalesce(nullif(kata.k->>'送り場所（空欄なら自宅）', ''), '自宅'), false, false
  from (select d::date as day, (array['日','月','火','水','木','金','土'])[extract(dow from d)::int + 1] as dow from generate_series(p_month, last_day, interval '1 day') d) d
  join (
    select distinct on (public.leo_name_canon(k->>'児童名'), k->>'曜日') k
    from leo_sched_kata_all() k
    where coalesce(k->>'児童名', '') <> '' and coalesce(k->>'曜日', '') <> ''
    order by public.leo_name_canon(k->>'児童名'), k->>'曜日', (k->>'児童名' = public.leo_name_canon(k->>'児童名')) desc, k->>'児童名'
  ) kata on kata.k->>'曜日' = d.dow
  where d.day <> all(closed)
    and (public.leo_left_on(kata.k->>'児童名') is null or d.day <= public.leo_left_on(kata.k->>'児童名'))
    and (case when exists (
           select 1 from _nres r join leo_schedule_weekday w on w.child = r.answer and w.month = p_month
           where r.kind = 'link' and r.kata = public.leo_name_canon(kata.k->>'児童名'))
         then coalesce((
           select w.use from _nres r join leo_schedule_weekday w on w.child = r.answer and w.month = p_month and w.dow = d.dow
           where r.kind = 'link' and r.kata = public.leo_name_canon(kata.k->>'児童名')
           order by w.answered_at desc nulls last, w.child limit 1), false)
         else coalesce(kata.k->>'利用週', '毎週') <> '不定期' end);
  for v in
    select c from (
      select distinct public.leo_name_canon(k->>'児童名') c from leo_sched_kata_all() k where coalesce(k->>'児童名', '') <> ''
    ) x
    where c <> ''
      and exists (
        select 1 from leo_sched_kata_all() k
        where public.leo_name_canon(k->>'児童名') = c
          and (public.leo_left_on(k->>'児童名') is null or public.leo_left_on(k->>'児童名') >= p_month))
      and not exists (
        select 1 from _nres r join leo_schedule_weekday w on w.child = r.answer and w.month = p_month
        where r.kind = 'link' and r.kata = c)
      and not exists (select 1 from _nres r where r.kind = 'ambiguous' and r.kata = c)
  loop
    warn := warn || jsonb_build_array(jsonb_build_object('child', v.c, 'msg', '回答がありません（型表の「毎週」どおりで作成）'));
  end loop;
  for v in
    select public.leo_name_canon(answer) as answer, string_agg(distinct kata, '、' order by kata) as detail
    from _nres where kind = 'ambiguous' group by public.leo_name_canon(answer)
  loop
    warn := warn || jsonb_build_array(jsonb_build_object('child', v.answer, 'msg', '回答名「' || v.answer || '」が型表の複数の児童（' || coalesce(v.detail, '') || '）に当たるため、この回答は使わず型表どおりにしました'));
  end loop;
  for v in select distinct public.leo_name_canon(answer) as answer from _nres where kind = 'orphan' and answer is not null loop
    warn := warn || jsonb_build_array(jsonb_build_object('child', v.answer, 'msg', '回答名「' || v.answer || '」に当たる型表の児童がいないため、この回答は予定に入っていません'));
  end loop;
  update _lsv s set
    ks = to_char((s.ks::time + (w.school_time::time - s.ps::time)), 'HH24:MI'), ps = w.school_time
  from (
    select distinct on (r.kata, w.dow) r.kata, w.dow, w.school_time
    from _nres r join leo_schedule_weekday w on w.child = r.answer and w.month = p_month
    where r.kind = 'link' and w.school_time is not null
    order by r.kata, w.dow, w.answered_at desc nulls last, w.child
  ) w
  where w.kata = s.child and w.dow = s.dow and s.ps is not null and w.school_time <> s.ps;
  update _lsv s set pplace = coalesce(w.pick_place, s.pplace), dplace = coalesce(w.drop_place, s.dplace)
  from (
    select distinct on (r.kata, w.dow) r.kata, w.dow, w.pick_place, w.drop_place
    from _nres r join leo_schedule_weekday w on w.child = r.answer and w.month = p_month
    where r.kind = 'link'
    order by r.kata, w.dow, w.answered_at desc nulls last, w.child
  ) w
  where w.kata = s.child and w.dow = s.dow;
  for v in
    select distinct on (r.kata, e.day, e.kind, e.time, e.place, e.memo)
      e.day, e.kind, e.time, e.place, e.memo, r.kata as child
    from leo_schedule_exception e
    join _nres r on r.kind = 'link' and r.answer = e.child
    where e.month = p_month and e.day is not null
    order by r.kata, e.day, e.kind, e.time, e.place, e.memo, e.id
  loop
    if public.leo_left_on(v.child) is not null and v.day > public.leo_left_on(v.child) then continue; end if;
    if v.kind = '休み' then
      delete from _lsv where child = v.child and day = v.day;
      ev := ev || jsonb_build_array(jsonb_build_object('day', v.day, 'kind', '休み', 'child', v.child, 'title', v.child || '　休み'));
    elsif v.kind in ('追加利用') then
      if not exists (select 1 from _lsv where child = v.child and day = v.day) and v.day <> all(closed) then
        insert into _lsv select v.day, v.child, d.dow, k->>'利用開始', k->>'利用終了', nullif(k->>'迎え開始', ''), nullif(k->>'送り終了', ''),
            leo_sched_staff(k->>'迎え担当'), leo_sched_staff(k->>'送り担当'), nullif(k->>'迎え順', '')::int, nullif(k->>'送り順', '')::int, coalesce(k->>'保護者送迎', ''),
            coalesce(nullif(k->>'迎え場所', ''), case when nullif(k->>'迎え開始', '') is null then '自宅' else '（未登録）' end), coalesce(nullif(k->>'送り場所（空欄なら自宅）', ''), '自宅'), false, false
          from (select (array['日','月','火','水','木','金','土'])[extract(dow from v.day)::int + 1] dow) d,
            lateral (select k from leo_sched_kata_all() k where public.leo_name_canon(k->>'児童名') = v.child order by (k->>'曜日' = d.dow) desc, (k->>'児童名' = v.child) desc, k->>'曜日' limit 1) kk(k);
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
  delete from _lsv s where public.leo_left_on(s.child) is not null and s.day > public.leo_left_on(s.child);
  select coalesce(jsonb_agg(x), '[]') into ev from jsonb_array_elements(ev) x
    where public.leo_left_on(x->>'child') is null or nullif(x->>'day', '') is null or (x->>'day')::date <= public.leo_left_on(x->>'child');
  update _lsv set parent_drop = true, ps = null, pst = null where par = '母の送り' and not parent_drop;
  update _lsv set parent_pick = true, pe = null, dst = null where par = '母の迎え' and not parent_pick;
  for v in
    select distinct r.kata as child, e.memo
    from leo_schedule_exception e
    join _nres r on r.kind = 'link' and r.answer = e.child
    where e.month = p_month and e.kind = '要確認'
      and (public.leo_left_on(r.kata) is null or public.leo_left_on(r.kata) >= p_month)
  loop
    warn := warn || jsonb_build_array(jsonb_build_object('child', v.child, 'msg', '保護者の備考：' || coalesce(v.memo, '')));
  end loop;
  select ev || coalesce(jsonb_agg(jsonb_build_object('day', day, 'kind', '利用', 'child', child, 'start_time', ks, 'end_time', ke, 'parent_drop', parent_drop, 'parent_pick', parent_pick,
      'title', child || case when parent_drop then '（母の送り）' when parent_pick then '（母の迎え）' else '' end,
      'note', (select '⚠ 保護者の備考：' || string_agg(coalesce(e.memo, ''), ' / ') from leo_schedule_exception e join _nres r on r.kind = 'link' and r.answer = e.child and r.kata = _lsv.child where e.month = p_month and e.kind = '要確認')) order by day, ks), '[]') into ev from _lsv;
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
  for g in select e.day, e.staff, e.title from leo_events e where e.kind = '不在' and e.day >= p_month and e.day <= last_day loop
    if exists (select 1 from jsonb_array_elements(ev) x where x->>'day' = g.day::text and x->>'staff' = g.staff and x->>'kind' in ('迎え', '送り')) then
      warn := warn || jsonb_build_array(jsonb_build_object('child', g.staff, 'msg', to_char(g.day, 'MM/DD') || ' 不在の予定（' || coalesce(g.title, '') || '）の日に送迎担当になっています'));
    end if;
  end loop;
  return jsonb_build_object('events', ev, 'warnings', warn, 'closed', to_jsonb(closed),
    'google_events', (select count(*) from leo_events where source = 'google' and kind in ('利用','迎え','送り','休み') and day >= p_month and day <= last_day),
    'answered', (select count(distinct public.leo_name_canon(a.child)) from leo_schedule_answer a where a.month = p_month and (public.leo_left_on(a.child) is null or public.leo_left_on(a.child) >= p_month)),
    'children', (select count(distinct public.leo_name_canon(k->>'児童名')) from leo_sched_kata_all() k where coalesce(k->>'児童名', '') <> '' and (public.leo_left_on(k->>'児童名') is null or public.leo_left_on(k->>'児童名') >= p_month)));
end $$;
revoke all on function public.leo_sched_plan_core(date) from public, anon, authenticated;
-- END leo_sched_plan_core

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
