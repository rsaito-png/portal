-- レオ「日誌」画面の職員下書き（です・ます調）。新しい表のみ・既存データには触らない。
-- 読む：レオ職員・事務／書く：レオ職員（追加・直す）。消すのは書いた本人か can_manage。
create table if not exists public.leo_diary_draft (
  id bigint generated always as identity primary key,
  child text not null check (char_length(child) <= 100),
  day date not null,
  body text not null check (char_length(body) <= 4000),
  author text check (char_length(author) <= 100),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  unique (child, day));
alter table public.leo_diary_draft enable row level security;
drop policy if exists ldd_read on public.leo_diary_draft;
create policy ldd_read on public.leo_diary_draft for select to authenticated using (public.my_office() = 'レオ' or public.can_bill());
drop policy if exists ldd_ins on public.leo_diary_draft;
create policy ldd_ins on public.leo_diary_draft for insert to authenticated with check (public.my_office() = 'レオ');
drop policy if exists ldd_upd on public.leo_diary_draft;
create policy ldd_upd on public.leo_diary_draft for update to authenticated using (public.my_office() = 'レオ') with check (public.my_office() = 'レオ');
drop policy if exists ldd_del on public.leo_diary_draft;
create policy ldd_del on public.leo_diary_draft for delete to authenticated using (created_by = auth.uid() or public.can_manage());
