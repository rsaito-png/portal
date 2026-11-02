-- 今日の日誌：おやつ提供が「あり」のときの金額（円）。
-- 列を足すだけ。すでにある食事・おやつの有無、内容、実費請求（leo_jippi）、負担上限月額（4,600円）は変えない。
-- 権限（RLS）は変えない。Supabase の SQL Editor でこのファイルを実行する（再実行できる）。
-- 実行するまで、今日の日誌の金額は保存できない。あり／なしの読み込みは、画面側で列が無くても続ける。

alter table public.leo_meal_record
  add column if not exists snack_yen integer;

alter table public.leo_meal_record drop constraint if exists leo_meal_record_snack_yen_check;
alter table public.leo_meal_record
  add constraint leo_meal_record_snack_yen_check
  check (snack_yen is null or snack_yen >= 0);

comment on column public.leo_meal_record.snack_yen is 'おやつ提供が「あり」のときの金額（円、0以上の整数）。なし・未記入のときは空。利用料実費請求の月額（leo_jippi.snack）には自動では入れない。';

notify pgrst, 'reload schema';
