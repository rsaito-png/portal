-- 法定研修 期限アラート抽出（JST今日基準・年度4月始まり・期限＝予定月の末日）
with p as (select (now() at time zone 'Asia/Tokyo')::date today,
  (case when extract(month from now() at time zone 'Asia/Tokyo')>=4 then extract(year from now() at time zone 'Asia/Tokyo') else extract(year from now() at time zone 'Asia/Tokyo')-1 end)::int fy),
items as (
  select 'training' kind,'研修' kname,t.id,t.name,t.target_types,m.mon,
   (make_date(p.fy+(m.mon<4)::int,m.mon,1)+interval '1 month - 1 day')::date due from ht_trainings t,p,unnest(t.months) m(mon) where t.active
  union all
  select 'event',e.kind,e.id,e.name,e.target_types,m.mon,
   (make_date(p.fy+(m.mon<4)::int,m.mon,1)+interval '1 month - 1 day')::date from ht_events e,p,unnest(e.months) m(mon) where e.active),
oi as (select o.id oid,o.name oname,i.* from items i join ht_offices_t o
  on (i.target_types && array['全事業'] or i.target_types && o.types) and (o.start_date is null or o.start_date<=i.due)),
-- 職員別 未受講
st as (
  select oi.oname 事業所, oi.kname 種別, oi.name 項目, s.name 対象,
   count(*) filter (where due<=p.today+14) need, count(*) filter (where due<p.today) over_n,
   coalesce(min(due) filter (where due>=p.today), max(due) filter (where due<p.today)) 期限,
   (select count(*) from ht_records r where r.staff_id=s.id and r.training_id=oi.id and r.fy=p.fy) done
  from oi cross join p join ht_staff s on s.status='在籍' and (s.main_office=oi.oid or oi.oid=any(s.sub_offices))
  where oi.kind='training' group by oi.oid,oi.oname,oi.kname,oi.id,oi.name,s.id,s.name,p.fy),
-- 事業所別 訓練・点検・見直し
ev as (
  select oi.oname 事業所, oi.kname 種別, oi.name 項目, '事業所' 対象,
   count(*) filter (where due<=p.today+14) need, count(*) filter (where due<p.today) over_n,
   coalesce(min(due) filter (where due>=p.today), max(due) filter (where due<p.today)) 期限,
   (select count(*) from ht_event_logs l where l.event_id=oi.id and l.office_id=oi.oid and l.done_on>=make_date(p.fy,4,1) and l.done_on<make_date(p.fy+1,4,1)) done
  from oi cross join p where oi.kind='event' group by oi.oid,oi.oname,oi.kname,oi.id,oi.name,p.fy),
cm as (
  select '全事業所' 事業所,'委員会' 種別,c.name 項目,'委員会' 対象,
   coalesce(pl.planned_on,(make_date(pl.fy+(pl.month<4)::int,pl.month,1)+interval '1 month - 1 day')::date) 期限
  from ht_committee_plan pl join p on pl.fy=p.fy cross join lateral unnest(pl.committee_ids) cid join ht_committees c on c.id=cid
  where coalesce(pl.planned_on,make_date(pl.fy+(pl.month<4)::int,pl.month,1))<=p.today+14
   and not exists(select 1 from ht_committee_logs l where l.committee_id=cid and (l.held_at at time zone 'Asia/Tokyo')::date
     between make_date(pl.fy+(pl.month<4)::int,pl.month,1) and (make_date(pl.fy+(pl.month<4)::int,pl.month,1)+interval '1 month - 1 day')::date))
select 事業所,種別,項目,対象,case when over_n>done then '期限超過' else '14日以内' end 状況,期限 from (select * from st union all select * from ev) x where need>done
union all
select 事業所,種別,項目,対象,case when 期限<(select today from p) then '期限超過' else '14日以内' end,期限 from cm
order by 1,5,2,3,4;
