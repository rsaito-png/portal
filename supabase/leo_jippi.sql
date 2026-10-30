-- レオ 利用料実費請求（お昼代・おやつ代）。月別・児童別。2026-10-16
-- 読む・書く：can_manage（児発管・事務・管理者）。再実行できる。
-- 支払いリンクは jippi-checkout が Square で作り pay_link に保存する（トークンはここに置かない）。
-- pay_link_amount はリンクを作ったときの lunch+snack（円）。同じなら作り直さない。
-- 金額が変わったあとの古いリンクは無効化しない（新しい URL で上書きするだけ）。
create table if not exists public.leo_jippi (
  ym text not null check (ym ~ '^\d{4}-\d{2}$'),
  child text not null,
  guardian text,
  lunch int not null default 0 check (lunch >= 0),
  snack int not null default 0 check (snack >= 0),
  pay_link text check (pay_link is null or pay_link ~ '^https://'),
  pay_link_amount int check (pay_link_amount is null or pay_link_amount >= 0),
  sent boolean not null default false,
  sent_at timestamptz, sent_by uuid references auth.users(id),
  note text check (char_length(note) <= 500),
  imported_at timestamptz not null default now(),
  primary key (ym, child)
);
-- 既存の表には create table では列が増えないので、こちらで足す
alter table public.leo_jippi add column if not exists pay_link_amount int check (pay_link_amount is null or pay_link_amount >= 0);
comment on column public.leo_jippi.pay_link_amount is '支払いリンクを作ったときの lunch+snack（円）。同じなら作り直さない。古い Square リンクは無効化しない。';
alter table public.leo_jippi enable row level security;
drop policy if exists jippi_all on public.leo_jippi;
create policy jippi_all on public.leo_jippi for all to authenticated using (public.can_manage()) with check (public.can_manage());
-- jippi-checkout が本人の JWT で can_manage() を呼ぶ
grant execute on function public.can_manage() to authenticated;
