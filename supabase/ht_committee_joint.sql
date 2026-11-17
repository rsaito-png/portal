-- 委員会の一体開催（合同）：1回の会議を委員会ごとの開催記録として同じ joint_id で保存する。2026-11-17
alter table public.ht_committee_logs add column if not exists joint_id text;
create index if not exists ht_committee_logs_joint_idx on public.ht_committee_logs(joint_id);
-- 見本（SAMPLE- 接頭辞）は下書きのまま置き、開催回数には数えない。消すとき：
-- delete from public.ht_committee_logs where id like 'SAMPLE-%';
