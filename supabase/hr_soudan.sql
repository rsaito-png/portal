-- 人事労務の相談所：相談した本人と総務奉行だけが見られる（会長も見ない）
create table if not exists public.hr_soudan (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id),
  name text, topic text, body text not null,
  reply text, replied_at timestamptz, created_at timestamptz not null default now());
alter table public.hr_soudan enable row level security;
create or replace function public.is_soumu_bugyo() returns boolean language sql stable security definer set search_path=public as
$$ select exists(select 1 from staff_profiles where user_id=auth.uid() and rank='総務奉行' and active) $$;
grant execute on function public.is_soumu_bugyo() to authenticated;
drop policy if exists hs_sel on public.hr_soudan; drop policy if exists hs_ins on public.hr_soudan; drop policy if exists hs_upd on public.hr_soudan;
create policy hs_sel on public.hr_soudan for select to authenticated using (user_id=auth.uid() or public.is_soumu_bugyo());
create policy hs_ins on public.hr_soudan for insert to authenticated with check (user_id=auth.uid());
create policy hs_upd on public.hr_soudan for update to authenticated using (public.is_soumu_bugyo()) with check (public.is_soumu_bugyo());
revoke all on public.hr_soudan from anon;
grant select, insert, update on public.hr_soudan to authenticated;
