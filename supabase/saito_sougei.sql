-- 齊藤さんの朝の送迎Chat文面。担当は leo_sched_staff で職員名に揃えて「齊藤　連」の分だけ（齊藤管理者・宮本〜も含む）。2026-11-10 横田はレオ職員になったので祥先生・横田の運転は齊藤に数えない（月曜除外もやめた）。型表は leo_master を正とし、無いときだけ旧スプシ写し leo_sheet。
create or replace function public.saito_sougei_text(d date DEFAULT ((now() AT TIME ZONE 'Asia/Tokyo'::text))::date)
returns text
language sql
stable security definer
set search_path to 'public'
as $$
 with k as (
  select data from leo_master where kind='kata'
   and left(btrim(data->>'曜日'), 1) = (array['日','月','火','水','木','金','土'])[extract(dow from d)::int+1]
  union all
  select data from leo_sheet where kind='kata'
   and not exists (select 1 from leo_master where kind='kata')
   and left(btrim(data->>'曜日'), 1) = (array['日','月','火','水','木','金','土'])[extract(dow from d)::int+1]
 ), duty as (
  select data->>'迎え開始' t, data->>'児童名' c, '迎え' w, nullif(data->>'迎え場所','') p from k
   where public.leo_sched_staff(data->>'迎え担当') = '齊藤　連'
  union all
  select data->>'送り終了', data->>'児童名', '送り', coalesce(nullif(data->>'送り場所（空欄なら自宅）',''),'自宅') from k
   where public.leo_sched_staff(data->>'送り担当') = '齊藤　連'
 ), ok as (
  select * from duty x
  where not exists (select 1 from leo_schedule_exception e where e.day=d and public.leo_norm(e.child)=public.leo_norm(x.c)
          and (e.kind='休み' or (e.kind='母の送り' and x.w='迎え') or (e.kind='母の迎え' and x.w='送り')))
    and not exists (select 1 from leo_day_flags f where f.day=d and (f.holiday or (public.leo_norm(f.child)=public.leo_norm(x.c) and f.absent_support)))
 )
 select '今日の送迎担当：' || string_agg(t||' '||c||'くん '||w||coalesce('（'||p||'）',''), '、' order by t)
 from ok having count(*)>0
$$;
