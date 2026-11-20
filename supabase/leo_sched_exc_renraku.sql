-- 保護者アンケートで「この日の備考」だけ書いた日（kind='連絡'）が保存できるようにする
alter table public.leo_schedule_exception drop constraint if exists leo_schedule_exception_kind_check;
alter table public.leo_schedule_exception add constraint leo_schedule_exception_kind_check
  check (kind in ('休み','母の送り','母の迎え','追加利用','時刻変更','送り場所変更','要確認','連絡'));
