-- 番頭さんAI：職員の報連相を受け、Edge Function banto（xAI）が即時に回答 or 会長へ取り次ぎ。
-- 職員は自分の分だけ、会長は全件。人事労務の個人的な相談は対象外（相談所 hr_soudan へ案内）。
create extension if not exists pg_net;
create table if not exists public.banto_msg (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id),
  name text, kind text not null default '相談' check (kind in ('報告','連絡','相談')), body text not null,
  status text not null default 'pending' check (status in ('pending','answered','escalated','chair_replied','error')),
  ai_answer text, ai_summary text, ai_opinion text, ai_category text, answered_at timestamptz,
  chair_reply text, chair_replied_at timestamptz, chair_seen boolean not null default false,
  created_at timestamptz not null default now());
alter table public.banto_msg enable row level security;
drop policy if exists bm_sel on public.banto_msg; drop policy if exists bm_ins on public.banto_msg; drop policy if exists bm_upd on public.banto_msg;
create policy bm_sel on public.banto_msg for select to authenticated using (user_id=auth.uid() or public.is_chair());
create policy bm_ins on public.banto_msg for insert to authenticated with check (user_id=auth.uid());
create policy bm_upd on public.banto_msg for update to authenticated using (public.is_chair()) with check (public.is_chair());
revoke all on public.banto_msg from anon, authenticated;
grant select on public.banto_msg to authenticated;
grant insert (name, kind, body) on public.banto_msg to authenticated;
grant update (chair_reply, chair_replied_at, chair_seen, status) on public.banto_msg to authenticated;
create table if not exists private_config (k text primary key, v text not null);
alter table private_config enable row level security;
revoke all on private_config from anon, authenticated;
-- private_config: banto_url, banto_secret（値はDBにだけ保存）
create or replace function public.banto_kick() returns trigger language plpgsql security definer set search_path=public, extensions as $$
begin
  begin
    perform net.http_post(url := (select v from private_config where k='banto_url'),
      headers := jsonb_build_object('Content-Type','application/json','x-banto-secret',(select v from private_config where k='banto_secret')),
      body := jsonb_build_object('id',new.id), timeout_milliseconds := 60000);
  exception when others then null; end;
  return new;
end $$;
drop trigger if exists banto_kick on public.banto_msg;
create trigger banto_kick after insert on public.banto_msg for each row execute function public.banto_kick();
