-- 水晶玉：基本情報シート（版ごとに1行。録音後に sui-draft が下書きを自動作成）
create table if not exists sui_basic (
  id bigserial primary key,
  user_id bigint not null references sui_user(id) on delete cascade,
  version int not null default 1,
  status text not null default '下書き' check (status in ('下書き','確定')),
  body jsonb not null default '{}'::jsonb,
  request_id bigint references sui_request(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, version)
);
alter table sui_basic enable row level security;
drop policy if exists sui_basic_rw on sui_basic;
create policy sui_basic_rw on sui_basic for all to authenticated
  using ((my_office() = '水晶玉') or can_manage_for('水晶玉'))
  with check ((my_office() = '水晶玉') or can_manage_for('水晶玉'));
grant select, insert, update, delete on sui_basic to authenticated;
grant usage, select on sequence sui_basic_id_seq to authenticated;
-- 録音から自動で作った書類の記録
alter table sui_request add column if not exists made jsonb;
