-- リーダー掲示板（試作）。見られるのはリーダー(staff_profiles.is_leader)と会長(is_chair)だけ
alter table public.staff_profiles add column if not exists is_leader boolean not null default false;
create or replace function public.is_leader() returns boolean language sql stable security definer set search_path=public as
$$ select coalesce((select is_leader or is_chair from public.staff_profiles where user_id = auth.uid()), false) $$;
grant execute on function public.is_leader() to authenticated;
-- 登録：既存データで役職が「児発管」の人だけ（推測では増やさない）
update public.staff_profiles set is_leader = true where duty = '児発管';
create table if not exists public.leader_post (
  id bigserial primary key,
  author uuid not null default auth.uid() references auth.users(id),
  author_name text,
  office text,
  today text not null,
  trouble text,
  ask text,
  reply text,
  reaction text,
  replied_at timestamptz,
  created_at timestamptz not null default now()
);
-- 投稿者名・事業所は自動で入れる
create or replace function public.leader_post_fill() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op = 'INSERT' then
    new.author := auth.uid(); new.created_at := now(); new.reply := null; new.reaction := null; new.replied_at := null;
    select coalesce(full_name, nikki_name), office into new.author_name, new.office from staff_profiles where user_id = auth.uid();
  else
    if not public.is_chair() then raise exception '返信は会長のみ'; end if;
    new.author := old.author; new.author_name := old.author_name; new.office := old.office; new.created_at := old.created_at;
    new.today := old.today; new.trouble := old.trouble; new.ask := old.ask;
    new.replied_at := case when coalesce(new.reply,'') <> '' or coalesce(new.reaction,'') <> '' then now() end;
  end if;
  return new;
end $$;
drop trigger if exists leader_post_fill on public.leader_post;
create trigger leader_post_fill before insert or update on public.leader_post for each row execute function public.leader_post_fill();
alter table public.leader_post enable row level security;
revoke all on public.leader_post from anon;
grant select, insert, update on public.leader_post to authenticated;
grant usage on sequence public.leader_post_id_seq to authenticated;
drop policy if exists lp_read on public.leader_post; create policy lp_read on public.leader_post for select to authenticated using (public.is_leader());
drop policy if exists lp_ins on public.leader_post; create policy lp_ins on public.leader_post for insert to authenticated with check (public.is_leader());
drop policy if exists lp_upd on public.leader_post; create policy lp_upd on public.leader_post for update to authenticated using (public.is_chair()) with check (public.is_chair());
