-- 日誌 Q列（活動記録＝児童の様子）を見る・直す
alter table public.leo_nikki add column if not exists activity text;
alter table public.leo_edits drop constraint if exists leo_edits_new_value_check;
alter table public.leo_edits add constraint leo_edits_new_value_check check (char_length(new_value) <= 4000);
