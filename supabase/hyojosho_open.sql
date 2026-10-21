-- 評定所を「全体の報連相」に（2026-10-21）。全職員（staff_profiles の active）と会長が投稿・閲覧・返信できる。
-- 種別 kind（報告／連絡／相談）。旧「お伺い」(ask) 欄の投稿は報告として表示。会長のリアクション・返信（leader_post.reaction/reply）は会長のみ。
create or replace function public.is_staff() returns boolean language sql stable security definer set search_path=public as
$$ select exists(select 1 from staff_profiles where user_id=auth.uid() and (active or is_chair)) $$;
grant execute on function public.is_staff() to authenticated;
alter table public.leader_post add column if not exists kind text check (kind in ('報告','連絡','相談'));
create or replace function public.leader_post_fill() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op = 'INSERT' then
    new.author := auth.uid(); new.created_at := now(); new.reply := null; new.reaction := null; new.replied_at := null;
    new.kind := coalesce(new.kind,'報告');
    select trim(coalesce(rank,'') || ' ' || coalesce(full_name, nikki_name)), office into new.author_name, new.office from staff_profiles where user_id = auth.uid();
  else
    if not public.is_chair() then raise exception '会長のリアクションは会長のみ'; end if;
    new.author := old.author; new.author_name := old.author_name; new.office := old.office; new.created_at := old.created_at;
    new.today := old.today; new.trouble := old.trouble; new.ask := old.ask; new.kind := old.kind;
    new.replied_at := case when coalesce(new.reply,'') <> '' or coalesce(new.reaction,'') <> '' then now() end;
  end if;
  return new;
end $$;
drop policy if exists lp_read on public.leader_post; create policy lp_read on public.leader_post for select to authenticated using (public.is_staff());
drop policy if exists lp_ins on public.leader_post; create policy lp_ins on public.leader_post for insert to authenticated with check (public.is_staff());
-- 全職員の返信
create table if not exists public.leader_reply (
  id bigint generated always as identity primary key,
  post_id bigint not null references public.leader_post(id) on delete cascade,
  author uuid not null default auth.uid() references auth.users(id),
  author_name text, body text not null, created_at timestamptz not null default now());
create or replace function public.leader_reply_fill() returns trigger language plpgsql security definer set search_path=public as $$
begin
  new.author := auth.uid(); new.created_at := now();
  select trim(coalesce(case when is_chair then '会長' end, rank,'') || ' ' || coalesce(full_name, nikki_name)) into new.author_name from staff_profiles where user_id = auth.uid();
  return new;
end $$;
drop trigger if exists leader_reply_fill on public.leader_reply;
create trigger leader_reply_fill before insert on public.leader_reply for each row execute function public.leader_reply_fill();
alter table public.leader_reply enable row level security;
revoke all on public.leader_reply from anon, authenticated;
grant select, insert on public.leader_reply to authenticated;
drop policy if exists lr_read on public.leader_reply; create policy lr_read on public.leader_reply for select to authenticated using (public.is_staff());
drop policy if exists lr_ins on public.leader_reply; create policy lr_ins on public.leader_reply for insert to authenticated with check (public.is_staff() and author = auth.uid());
