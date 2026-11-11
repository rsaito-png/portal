-- 児童名の空白ゆれを書き込み時に直す（空白を除いた形がleo_childrenと同じなら、マスタの表記にそろえる）
create or replace function public.leo_name_master(v text) returns text language sql stable security definer set search_path = public as $$
  select coalesce((select m.name from public.leo_children m
    where regexp_replace(m.name,'\s','','g') = regexp_replace(coalesce(v,''),'\s','','g') limit 1), v)
$$;
create or replace function public.leo_events_name_canon() returns trigger language plpgsql as $$
begin
  if new.child is not null then new.child := public.leo_name_master(new.child); end if;
  if new.kids is not null then
    new.kids := (select coalesce(array_agg(public.leo_name_master(k) order by o), '{}') from unnest(new.kids) with ordinality u(k,o));
  end if;
  return new;
end $$;
drop trigger if exists trg_leo_events_name_canon on public.leo_events;
create trigger trg_leo_events_name_canon before insert or update of child, kids on public.leo_events
  for each row execute function public.leo_events_name_canon();
