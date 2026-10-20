-- 金斗雲 署名リンクのLINE週次自動送信。宛先(LINEユーザーID)は個人情報：リポジトリには値を置かず、DBの列にだけ入れる。
alter table public.kin_user add column if not exists line_user_id text check (line_user_id is null or char_length(line_user_id) <= 64);
-- 送信ログ（追記のみ。職員は閲覧のみ。書き込みは service_role のスクリプトだけ）
create table if not exists public.kin_line_send_log (
  id bigint generated always as identity primary key,
  user_id bigint not null references public.kin_user(id) on delete cascade,
  sent_at timestamptz not null default now(),
  status text not null check (status in ('成功','失敗','未連携')),
  error text check (char_length(error) <= 1000),
  pending_visits int,
  expires_at timestamptz);
create index if not exists kin_line_send_log_at on public.kin_line_send_log(sent_at desc);
alter table public.kin_line_send_log enable row level security;
drop policy if exists klsl_read on public.kin_line_send_log;
create policy klsl_read on public.kin_line_send_log for select to authenticated using (public.my_office() = '金斗雲' or public.can_manage());
revoke all on public.kin_line_send_log from anon;
revoke insert, update, delete on public.kin_line_send_log from authenticated;
-- line_user_id を職員の画面に出さないための列権限（既存の select 権限が列単位でなければ下記は効かないため、画面側でも select に含めない）
