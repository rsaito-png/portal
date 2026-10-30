-- レオ「アセスメント」：児童ごとに1行。項目は data(jsonb) のキーで持つ（キー一覧は assess_lib.js。
-- 保護者向け公開ページ assess.html と、職員の利用者情報タブが同じキーを使う）。
-- 閲覧：レオ職員・事務（機微情報を含むが職員全員に見せる方針）／編集：can_manage。新しい表のみ・既存データには触らない。
create table if not exists public.leo_child_assess (
  name text primary key,                                   -- 日誌・leo_children と同じ表記
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 60000),
  source text check (char_length(source) <= 100),          -- 例：「Googleフォーム 2026-05-07」「ポータル入力」
  answered_at date,
  updated_by uuid default auth.uid(), updated_at timestamptz not null default now());
alter table public.leo_child_assess enable row level security;
drop policy if exists lca_read on public.leo_child_assess;
create policy lca_read on public.leo_child_assess for select to authenticated using (public.my_office() = 'レオ' or public.can_bill());
drop policy if exists lca_write on public.leo_child_assess;
create policy lca_write on public.leo_child_assess for all to authenticated using (public.can_manage()) with check (public.can_manage());
