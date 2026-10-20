-- ヒヤリハットの既読（人ごと）。本人は自分の既読だけ、管理・児発管は事業所の全員分を見て「まだ読んでいない人」がわかる
create table if not exists public.hiyari_reads (
  hiyari_id bigint not null references public.hiyari(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id),
  read_at timestamptz not null default now(), primary key (hiyari_id, user_id));
alter table public.hiyari_reads enable row level security;
drop policy if exists hr_ins on public.hiyari_reads;
create policy hr_ins on public.hiyari_reads for insert to authenticated with check (user_id = auth.uid());
drop policy if exists hr_read on public.hiyari_reads;
create policy hr_read on public.hiyari_reads for select to authenticated using (user_id = auth.uid() or public.can_manage());
