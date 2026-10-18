-- 水晶玉 月間実績（計画相談）。利用者×月で 新規/継続（サービス利用支援／継続サービス利用支援）と各加算を記録。
-- アクセスは水晶玉の職員と管理側のみ（my_office()='水晶玉' or can_manage()）。請求CSV生成は別途。
create table if not exists public.sui_jisseki (
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  user_id bigint not null references public.sui_user(id) on delete cascade,
  -- 基本報酬: 新規=サービス利用支援／障害児相談支援、継続=継続サービス利用支援／障害児継続相談支援。null=基本報酬なし（加算のみの月）
  service_kind text check (service_kind is null or service_kind in ('新規', '継続')),
  service_date date, -- 主な実施日（計画交付・モニタリング実施など）
  additions jsonb not null default '[]'::jsonb, -- ["初回加算", ...] または [{"name":"退院・退所加算","count":2}]
  memo text check (char_length(memo) <= 500),
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (month, user_id)
);
create index if not exists sui_jisseki_month on public.sui_jisseki(month);
alter table public.sui_jisseki enable row level security;
drop policy if exists sui_jisseki_rw on public.sui_jisseki;
create policy sui_jisseki_rw on public.sui_jisseki for all to authenticated
  using (public.my_office() = '水晶玉' or public.can_manage())
  with check (public.my_office() = '水晶玉' or public.can_manage());
revoke all on public.sui_jisseki from anon;
