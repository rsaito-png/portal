-- 委員会開催記録に「下書き／確定」を追加（幂等）。
-- 既定は '確定' なので、既存の記録と古い画面からの登録はこれまでどおり開催済みとして数える。
-- 「前回開催」・議事録PDF・期限アラート（ht_alert.sql）は status='確定' だけを数える。RLS は変更しない。
alter table public.ht_committee_logs add column if not exists status text not null default '確定';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ht_committee_logs_status_chk') then
    alter table public.ht_committee_logs add constraint ht_committee_logs_status_chk check (status in ('下書き','確定'));
  end if;
end $$;
-- 戻し方：alter table public.ht_committee_logs drop constraint if exists ht_committee_logs_status_chk, drop column if exists status;
