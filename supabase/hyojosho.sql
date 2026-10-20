-- 評定所（旧リーダー掲示板）。見られるのは役職名(rank)がある人と会長
alter table public.staff_profiles add column if not exists rank text;
update public.staff_profiles set rank = null;
update public.staff_profiles set rank = '大老' where full_name = '加藤幸弘';
update public.staff_profiles set rank = 'レオ奉行' where full_name = '中村友香';
update public.staff_profiles set rank = 'RYDEEN・水晶玉奉行' where full_name = '河合尚美';
update public.staff_profiles set rank = '若年寄' where full_name = '安藤尚子';
update public.staff_profiles set is_leader = (rank is not null);
create or replace function public.is_leader() returns boolean language sql stable security definer set search_path=public as
$$ select coalesce((select rank is not null or is_chair from public.staff_profiles where user_id = auth.uid()), false) $$;
create or replace function public.leader_post_fill() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op = 'INSERT' then
    new.author := auth.uid(); new.created_at := now(); new.reply := null; new.reaction := null; new.replied_at := null;
    select trim(coalesce(rank,'') || ' ' || coalesce(full_name, nikki_name)), office into new.author_name, new.office from staff_profiles where user_id = auth.uid();
  else
    if not public.is_chair() then raise exception '返信は会長のみ'; end if;
    new.author := old.author; new.author_name := old.author_name; new.office := old.office; new.created_at := old.created_at;
    new.today := old.today; new.trouble := old.trouble; new.ask := old.ask;
    new.replied_at := case when coalesce(new.reply,'') <> '' or coalesce(new.reaction,'') <> '' then now() end;
  end if;
  return new;
end $$;
