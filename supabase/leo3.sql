-- 日誌への即時反映（box の apply_edits.py）用

alter table public.leo_edits drop constraint if exists leo_edits_status_check;
update public.leo_edits set status='反映済' where status='反映済み';
alter table public.leo_edits add constraint leo_edits_status_check check (status in ('未反映','反映済','衝突','却下'));
alter table public.leo_edits add column if not exists applied_at timestamptz;
alter table public.leo_edits add column if not exists apply_note text;
