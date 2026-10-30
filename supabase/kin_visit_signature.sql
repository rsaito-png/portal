-- 金斗雲 訪問記録のその場署名（記録記入画面で本人・ご家族が書いた画像）。
-- 本人のスマホ署名（kin_sign_log / 署名リンク）とは別。あとで署名の保存にはこの列は使わない。
-- 適用: Supabase の SQL エディタ、または apply_migration でこのファイルを実行する。
alter table public.kin_visit add column if not exists signature_png text;
alter table public.kin_visit drop constraint if exists kin_visit_signature_png_chk;
alter table public.kin_visit add constraint kin_visit_signature_png_chk
  check (signature_png is null or (signature_png like 'data:image/png;base64,%' and char_length(signature_png) <= 300000));
