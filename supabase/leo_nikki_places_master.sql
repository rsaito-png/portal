-- 日誌の迎え／送り場所を型表（leo_master）に合わせる。
-- 職員が保存した行・過去日も含め、場所欄だけ直す（活動・時刻・担当は触らない）。
-- 母の送り／母の迎えの日は、施設側の場所を無理に入れない。
-- Supabase SQL Editor で Run してよい。何度実行してもよい。

create table if not exists public.leo_nikki_place_bak (
  bak_at timestamptz not null default timezone('Asia/Tokyo', now()),
  day date not null,
  row_no integer not null,
  child text,
  pick_place text,
  drop_place text,
  primary key (bak_at, day, row_no)
);
comment on table public.leo_nikki_place_bak is '日誌の迎え／送り場所を型表に合わせる直前の控え';

create or replace function public.leo_nikki_places_from_master(
  p_from date,
  p_to date default null
) returns int
language plpgsql security definer set search_path = public as $$
declare
  d1 date := coalesce(p_from, date '2026-10-01');
  d2 date := coalesce(p_to, (timezone('Asia/Tokyo', now()))::date + 60);
  n int := 0;
  bak_ts timestamptz := timezone('Asia/Tokyo', now());
begin
  if d1 is null then raise exception '開始日'; end if;
  if d2 < d1 then raise exception '終了日'; end if;

  insert into public.leo_nikki_place_bak (bak_at, day, row_no, child, pick_place, drop_place)
  select bak_ts, n.day, n.row_no, n.child, n.pick_place, n.drop_place
  from leo_nikki n
  where n.day between d1 and d2 and n.kind = '利用'
    and exists (
      select 1
      from leo_master m
      where m.kind = 'kata'
        and public.leo_norm(m.data->>'児童名') = public.leo_norm(n.child)
        and left(btrim(m.data->>'曜日'), 1)
          = (array['日','月','火','水','木','金','土'])[extract(dow from n.day)::int + 1]
        and (
          (nullif(btrim(m.data->>'迎え場所'), '') is not null
            and nullif(btrim(n.pick_place), '') is distinct from nullif(btrim(m.data->>'迎え場所'), '')
            and coalesce(n.pick_driver, '') not in ('保護者', '送迎なし')
            and coalesce(nullif(btrim(m.data->>'保護者送迎'), ''), '') not in ('母の送り', '○', '保護者送迎'))
          or
          (nullif(btrim(coalesce(m.data->>'送り場所（空欄なら自宅）', m.data->>'送り場所')), '') is not null
            and nullif(btrim(n.drop_place), '') is distinct from nullif(btrim(coalesce(m.data->>'送り場所（空欄なら自宅）', m.data->>'送り場所')), '')
            and coalesce(n.drop_driver, '') not in ('保護者', '送迎なし')
            and coalesce(nullif(btrim(m.data->>'保護者送迎'), ''), '') is distinct from '母の迎え')
        )
    );

  with kata as (
    select public.leo_norm(data->>'児童名') as nchild,
           left(btrim(data->>'曜日'), 1) as dow,
           nullif(btrim(data->>'迎え場所'), '') as pick,
           nullif(btrim(coalesce(data->>'送り場所（空欄なら自宅）', data->>'送り場所')), '') as drop_raw,
           nullif(btrim(data->>'保護者送迎'), '') as parent
      from leo_master where kind = 'kata'
  ), want as (
    select n.day, n.row_no,
      case
        when coalesce(n.pick_driver, '') in ('保護者', '送迎なし') then n.pick_place
        when coalesce(k.parent, '') in ('母の送り', '○', '保護者送迎') then n.pick_place
        when k.pick is not null then k.pick
        else n.pick_place
      end as new_pick,
      case
        when coalesce(n.drop_driver, '') in ('保護者', '送迎なし') then n.drop_place
        when coalesce(k.parent, '') = '母の迎え' then n.drop_place
        when k.drop_raw is not null then k.drop_raw
        else n.drop_place
      end as new_drop
    from leo_nikki n
    join kata k
      on k.nchild = public.leo_norm(n.child)
     and k.dow = (array['日','月','火','水','木','金','土'])[extract(dow from n.day)::int + 1]
    where n.day between d1 and d2 and n.kind = '利用'
  )
  update leo_nikki n
     set pick_place = w.new_pick,
         drop_place = w.new_drop
    from want w
   where n.day = w.day and n.row_no = w.row_no
     and (n.pick_place is distinct from w.new_pick or n.drop_place is distinct from w.new_drop);

  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.leo_nikki_places_from_master(date, date) from public;
grant execute on function public.leo_nikki_places_from_master(date, date) to authenticated, service_role;

-- Google日誌同期のあと、場所だけ型表に戻す（旧スプシの場所が戻らないように）
create or replace function public.leo_sync(p_token text, p_nikki jsonb, p_jisseki jsonb, p_days date[])
returns text language plpgsql security definer set search_path = public, extensions as $$
declare
  d1 date;
  d2 date;
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
  select min(x), max(x) into d1, d2 from unnest(p_days) x;
  if d1 is not null then
    perform public.leo_nikki_places_from_master(d1, d2);
  end if;
  return 'ok';
end $$;
