-- レオ「利用者情報」一覧の並び順（2026-10-28）
-- 齊藤連さんが Supabase の SQL Editor にこのファイルを貼って Run してください。本番データは消しません（列を足すだけ・何度実行しても同じ）。
-- アプリからは実行しません。
--
-- 保存先：leo_child_info.sort_order（その児童の連絡先の行）。小さい数の順に一覧の先頭から並ぶ。
-- 空の児童（これから増える児童など）は、数のある児童の後ろに、今までどおりのあいうえお順で並ぶ。
-- 在籍・退所児童のどちらの一覧も同じ規則。他の画面（日誌・送迎・型表など）の並びは変えない。
-- 並び順の中身（児童名つき）は公開リポジトリに置かない。数は SQL Editor で別に入れる（例は下のコメント）。
--
-- 数の入れ方の例（名前は空白の違い・全角半角を問わず、同じ児童の行すべてに入る）：
--   update public.leo_child_info set sort_order = 1
--    where regexp_replace(name, '[[:space:]　]', '', 'g') = regexp_replace('（児童名）', '[[:space:]　]', '', 'g');
-- 行がまだ無い児童は、先に一度「利用者情報」で保存するか、insert into public.leo_child_info (name, sort_order) values ('（児童名）', 1); で作る。

alter table public.leo_child_info add column if not exists sort_order integer;
comment on column public.leo_child_info.sort_order is '利用者情報の一覧の並び順（小さい順）。空なら数のある児童の後ろに、あいうえお順。';
