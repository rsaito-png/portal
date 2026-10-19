-- 申告タブ用: 期ごとの入力値（法人管理者のみ）。何度実行しても安全。
create table if not exists public.acc_tax_inputs (
  fy_start date primary key,            -- 期首日（例 2025-06-01 = 第5期）
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now());
alter table public.acc_tax_inputs enable row level security;
drop policy if exists acc_tax_inputs_admin on public.acc_tax_inputs;
create policy acc_tax_inputs_admin on public.acc_tax_inputs for all to authenticated using (public.acc_is_admin()) with check (public.acc_is_admin());
revoke all on public.acc_tax_inputs from anon;
