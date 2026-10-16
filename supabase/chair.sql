-- 会長ページ（会長専用）。会長かどうかは staff_profiles.is_chair（SQLで設定。個人のIDはこのファイルに書かない）
alter table public.staff_profiles add column if not exists is_chair boolean not null default false;
create or replace function public.is_chair() returns boolean language sql stable security definer set search_path=public as
$$ select coalesce((select is_chair from public.staff_profiles where user_id = auth.uid()), false) $$;
grant execute on function public.is_chair() to authenticated;

create table if not exists public.chair_idea (
  id bigint generated always as identity primary key,
  text text not null check (char_length(text) between 1 and 1000),
  created_at timestamptz not null default now(),
  bucket text not null default 'あとで',            -- 担当別（名前は config.js の chair.buckets）／会長が判断／あとで
  status text not null default 'open' check (status in ('open','done')),
  ai_note text,                                    -- AIの一言（なぜこの振り分け・次の一手）
  priority int check (priority between 1 and 5),   -- AIの重要度（5が高い）
  due date,                                        -- AIの期限の推定
  stale boolean not null default false,            -- AIが「放置・期限切れ」と判断
  ai_at timestamptz,                               -- AIが整理した日時（nullなら未整理＝新着）
  done_at timestamptz);
create table if not exists public.chair_today (
  day date not null, rank int not null check (rank between 1 and 3),
  idea_id bigint not null references public.chair_idea(id) on delete cascade,
  primary key (day, rank));
create table if not exists public.chair_message (
  id bigint generated always as identity primary key,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now(),
  active boolean not null default true);
alter table public.chair_idea enable row level security;
alter table public.chair_today enable row level security;
alter table public.chair_message enable row level security;
drop policy if exists ci_all on public.chair_idea; create policy ci_all on public.chair_idea for all to authenticated using (public.is_chair()) with check (public.is_chair());
drop policy if exists ct_all on public.chair_today; create policy ct_all on public.chair_today for all to authenticated using (public.is_chair()) with check (public.is_chair());
-- 一言は全職員が読める（スタッフ画面に出す）。書けるのは会長だけ
drop policy if exists cm_r on public.chair_message; create policy cm_r on public.chair_message for select to authenticated using (active);
drop policy if exists cm_w on public.chair_message; create policy cm_w on public.chair_message for all to authenticated using (public.is_chair()) with check (public.is_chair());

-- 設定（担当別の名前など）。法人ごとに行を変えるだけで他事業所にも使える
create table if not exists public.chair_config (k text primary key, v jsonb not null);
alter table public.chair_config enable row level security;
drop policy if exists cc_all on public.chair_config; create policy cc_all on public.chair_config for all to authenticated using (public.is_chair()) with check (public.is_chair());
-- 例: insert into chair_config values ('buckets','["担当A","担当B"]'), ('owner','"会長"'), ('org','"法人名"');
