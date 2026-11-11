-- 児童名をマスタ（leo_children）の「姓 名」にそろえる。
-- 空白の違い、または名前だけ（名が1人に決まる場合）でも、マスタの表記に直す。
create or replace function public.leo_name_master(v text) returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select m.name from public.leo_children m where regexp_replace(m.name,'\s','','g') = regexp_replace(coalesce(v,''),'\s','','g') limit 1),
    (select m.name from public.leo_children m where split_part(m.name,' ',2) = btrim(coalesce(v,''))
       and (select count(*) from public.leo_children m2 where split_part(m2.name,' ',2)=split_part(m.name,' ',2))=1 limit 1),
    v)
$$;
create or replace function public.leo_events_name_canon() returns trigger language plpgsql as $$
begin
  if new.child is not null then new.child := public.leo_name_master(new.child); end if;
  if new.kids is not null then
    new.kids := (select coalesce(array_agg(public.leo_name_master(k) order by o), '{}') from unnest(new.kids) with ordinality u(k,o));
  end if;
  if new.kid_times is not null and new.kid_times <> '{}'::jsonb then
    new.kid_times := (select coalesce(jsonb_object_agg(public.leo_name_master(key), value), '{}'::jsonb) from jsonb_each(new.kid_times));
  end if;
  if new.kid_places is not null and new.kid_places <> '{}'::jsonb then
    new.kid_places := (select coalesce(jsonb_object_agg(public.leo_name_master(key), value), '{}'::jsonb) from jsonb_each(new.kid_places));
  end if;
  return new;
end $$;
drop trigger if exists trg_leo_events_name_canon on public.leo_events;
create trigger trg_leo_events_name_canon before insert or update of child, kids on public.leo_events
  for each row execute function public.leo_events_name_canon();
