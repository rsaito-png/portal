-- レオ 利用料実費請求（お昼代・おやつ代）。月別・児童別。2026-10-16
-- 読む・書く：can_manage（児発管・事務・管理者）。Squareリンクは既存ルーティンが作ったものを貼る／取り込むだけ（トークンはここに置かない）
create table if not exists public.leo_jippi (
  ym text not null check (ym ~ '^\d{4}-\d{2}$'),
  child text not null,
  guardian text,
  lunch int not null default 0 check (lunch >= 0),
  snack int not null default 0 check (snack >= 0),
  pay_link text check (pay_link is null or pay_link ~ '^https://'),
  sent boolean not null default false,
  sent_at timestamptz, sent_by uuid references auth.users(id),
  note text check (char_length(note) <= 500),
  imported_at timestamptz not null default now(),
  primary key (ym, child)
);
alter table public.leo_jippi enable row level security;
drop policy if exists jippi_all on public.leo_jippi;
create policy jippi_all on public.leo_jippi for all to authenticated using (public.can_manage()) with check (public.can_manage());
