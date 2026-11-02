-- 11月の日誌で、送り時刻が空の行だけ埋める。Supabase の SQL Editor で実行する（このファイルは自動では走らない）。
-- すでに送り時刻が入っている行、欠席、母の迎えの日は変えない。カレンダー（leo_events）は変えない。
-- 優先は、カレンダーで職員が直した送り（source が kata 以外）の児童ごとの時刻。それが無いときだけ型表の送り終了（画面の送り時間。列名が「送り時間」の行も読む）。
-- 先に下の select で対象を見てから、update を実行する。
-- カレンダーの11月の送りに時刻を出すには、このファイルでは足りない。
--   1) supabase/leo_schedule_build.sql を実行する（予定を作る関数。leo_left.sql と leo_sched_name.sql も同じ関数なので、あとからどれを実行しても同じ）。
--   2) 11月の利用予定を、画面からもう一度確定する。source='kata' の予定だけ入れ替わる。職員がカレンダーで直した source='portal' は残る。
-- 日誌を開いたときに空欄を埋める関数は supabase/leo_record_flow.sql。先にこちらを実行してから確定する。

select n.day, n.child, n.row_no,
  coalesce(nullif(btrim(s.other_time), ''), s.kata_time) as drop_time_to_set
from leo_nikki n
join lateral (
  select
    (
      select coalesce(public.leo_kid_json(e.kid_times, n.child), nullif(btrim(e.start_time), ''))
        from leo_events e
       where e.day = n.day and e.kind = '送り' and e.source is distinct from 'kata'
         and not (e.source = 'portal' and (coalesce(e.title, '') = 'カレンダーで削除' or coalesce(e.note, '') = 'カレンダーで削除'))
         and (public.leo_norm(e.child) = public.leo_norm(n.child)
              or exists (select 1 from unnest(e.kids) k where public.leo_norm(k) = public.leo_norm(n.child)))
       order by e.updated_at desc nulls last, e.id desc
       limit 1
    ) as other_time,
    (
      select nullif(btrim(coalesce(nullif(btrim(k->>'送り終了'), ''), nullif(btrim(k->>'送り時間'), ''))), '')
        from (
          select data as k from leo_master where kind = 'kata'
          union all
          select data from leo_sheet where kind = 'kata'
            and not exists (select 1 from leo_master where kind = 'kata')
        ) src
       where public.leo_name_canon(k->>'児童名') = public.leo_name_canon(n.child)
         and k->>'曜日' = (array['日','月','火','水','木','金','土'])[extract(dow from n.day)::int + 1]
         and coalesce(k->>'保護者送迎', '') is distinct from '母の迎え'
       order by (k->>'児童名' = public.leo_name_canon(k->>'児童名')) desc, k->>'児童名'
       limit 1
    ) as kata_time
) s on true
where n.day >= date '2026-11-01' and n.day < date '2026-12-01'
  and n.kind = '利用'
  and coalesce(btrim(n.drop_time), '') = ''
  and coalesce(nullif(btrim(s.other_time), ''), s.kata_time) is not null
  and not exists (
    select 1 from leo_events u
     where u.day = n.day and u.kind = '利用' and coalesce(u.parent_pick, false)
       and public.leo_norm(u.child) = public.leo_norm(n.child)
       and not (u.source = 'portal' and (coalesce(u.title, '') = 'カレンダーで削除' or coalesce(u.note, '') = 'カレンダーで削除'))
  )
  and not exists (
    select 1 from leo_schedule_exception ex
     where ex.day = n.day and ex.kind = '母の迎え'
       and public.leo_name_canon(ex.child) = public.leo_name_canon(n.child)
  )
order by n.day, n.row_no;

update leo_nikki n
   set drop_time = coalesce(nullif(btrim(s.other_time), ''), s.kata_time)
  from (
    select n2.day, n2.row_no,
      (
        select coalesce(public.leo_kid_json(e.kid_times, n2.child), nullif(btrim(e.start_time), ''))
          from leo_events e
         where e.day = n2.day and e.kind = '送り' and e.source is distinct from 'kata'
           and not (e.source = 'portal' and (coalesce(e.title, '') = 'カレンダーで削除' or coalesce(e.note, '') = 'カレンダーで削除'))
           and (public.leo_norm(e.child) = public.leo_norm(n2.child)
                or exists (select 1 from unnest(e.kids) k where public.leo_norm(k) = public.leo_norm(n2.child)))
         order by e.updated_at desc nulls last, e.id desc
         limit 1
      ) as other_time,
      (
        select nullif(btrim(coalesce(nullif(btrim(k->>'送り終了'), ''), nullif(btrim(k->>'送り時間'), ''))), '')
          from (
            select data as k from leo_master where kind = 'kata'
            union all
            select data from leo_sheet where kind = 'kata'
              and not exists (select 1 from leo_master where kind = 'kata')
          ) src
         where public.leo_name_canon(k->>'児童名') = public.leo_name_canon(n2.child)
           and k->>'曜日' = (array['日','月','火','水','木','金','土'])[extract(dow from n2.day)::int + 1]
           and coalesce(k->>'保護者送迎', '') is distinct from '母の迎え'
         order by (k->>'児童名' = public.leo_name_canon(k->>'児童名')) desc, k->>'児童名'
         limit 1
      ) as kata_time
    from leo_nikki n2
    where n2.day >= date '2026-11-01' and n2.day < date '2026-12-01'
      and n2.kind = '利用'
      and coalesce(btrim(n2.drop_time), '') = ''
      and not exists (
        select 1 from leo_events u
         where u.day = n2.day and u.kind = '利用' and coalesce(u.parent_pick, false)
           and public.leo_norm(u.child) = public.leo_norm(n2.child)
           and not (u.source = 'portal' and (coalesce(u.title, '') = 'カレンダーで削除' or coalesce(u.note, '') = 'カレンダーで削除'))
      )
      and not exists (
        select 1 from leo_schedule_exception ex
         where ex.day = n2.day and ex.kind = '母の迎え'
           and public.leo_name_canon(ex.child) = public.leo_name_canon(n2.child)
      )
  ) s
 where n.day = s.day and n.row_no = s.row_no
   and coalesce(nullif(btrim(s.other_time), ''), s.kata_time) is not null;
