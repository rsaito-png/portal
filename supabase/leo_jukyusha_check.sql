-- レオ 受給者証「原本の確認」の記録（いつ・誰が原本を見たか。監査用）
-- 利用者情報の児童ページ「① 受給者証」の下に、確認の履歴（新しい順）と「原本を確認した」の追加欄を出す。
-- 受給者証の写真は保管しない（連先生の決定）。ここに残すのは「確認した日・確認した職員・メモ」だけ。
-- 前提：leo_billing.sql（can_manage / can_bill）と leo_userinfo.sql（my_office）が実行ずみであること。
-- 既存の表・データには触らない（新しい表だけ）。何度実行しても同じ。
-- 追加だけできる記録：画面からは「追加」と「読む」だけ。直す・消すは画面からはできない
--   （まちがえたときは、新しく「訂正：…」のメモつきで1件足す。どうしても消すときは管理者が SQL で）。
create table if not exists public.leo_jukyusha_checks (
  id bigint generated always as identity primary key,
  child text not null check (char_length(child) between 1 and 100),   -- leo_children / leo_child_info と同じ児童名の表記
  checked_on date not null,                                           -- 原本を確認した日
  checked_by text not null check (char_length(btrim(checked_by)) between 1 and 60),   -- 確認した職員（名前）
  note text check (char_length(note) <= 500),                         -- メモ（任意）
  created_at timestamptz not null default now(),                      -- 記録した時刻
  created_by uuid default auth.uid());                                -- 記録したログイン（なりすまし防止：insert のとき自分のIDだけ許可）
create index if not exists leo_jukyusha_checks_child on public.leo_jukyusha_checks (child, checked_on desc, id desc);
alter table public.leo_jukyusha_checks enable row level security;
-- 読む：レオ職員・事務（leo_child_info と同じ）／追加：児発管・管理者・事務（can_manage）。未来の日付・他人のIDでの追加は不可
drop policy if exists ljc_read on public.leo_jukyusha_checks;
create policy ljc_read on public.leo_jukyusha_checks for select to authenticated using (public.my_office() = 'レオ' or public.can_bill());
drop policy if exists ljc_ins on public.leo_jukyusha_checks;
create policy ljc_ins on public.leo_jukyusha_checks for insert to authenticated
  with check (public.can_manage() and created_by = auth.uid() and checked_on <= (now() at time zone 'Asia/Tokyo')::date);
-- Supabase は public の新しい表に anon / authenticated の権限を自動で付けるので、いったん外し、必要な分だけ付ける（RLS と二重で守る）
revoke all on public.leo_jukyusha_checks from anon, authenticated;
grant select, insert on public.leo_jukyusha_checks to authenticated;
