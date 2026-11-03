-- leo_jippi_from_nikki.sql を戻す。トリガーと関数だけ消す。
-- すでに入った leo_jippi_day と、leo_jippi のお昼代・おやつ代は消さない・戻さない。
-- 権限（RLS）は変えない。再実行できる。
drop trigger if exists leo_meal_record_jippi on public.leo_meal_record;
drop function if exists public.leo_jippi_meal_trg();
drop function if exists public.leo_jippi_sync_meal(date, text);
drop function if exists public.leo_jippi_lunch_unit();
