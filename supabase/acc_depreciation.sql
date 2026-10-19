-- 減価償却の自動計算（台帳→決算整理仕訳）用の列。何度実行しても安全。
alter table public.acc_fixed_assets
  add column if not exists dep_calc boolean not null default true,     -- 償却計算に含める
  add column if not exists dep_start date,                              -- 事業供用日（空=取得日）
  add column if not exists dep_direct boolean not null default true,    -- 直接法(資産を直接減額)。falseなら減価償却累計額
  add column if not exists dep_override jsonb,                          -- {"2025":金額} 期(開始年)ごとの償却費の確定値（会計士の実績）
  add column if not exists dept_alloc jsonb,                            -- {"11":1} 部門への配賦比率
  add column if not exists dept_amt jsonb,                              -- {"2025":{"1":54037}} 期ごとの部門への配賦額
  add column if not exists dep_status text not null default '要確認' check (dep_status in ('確定','要確認')),
  add column if not exists dep_basis text,                              -- 根拠
  add column if not exists is_adjust boolean not null default false;    -- freee実績との差額調整行
