-- uketsuke_debug は動作確認用に一時作成→削除済み
-- Google Chat 受付窓口：Botが受けた依頼・報告を貯める（書き込みは Edge Function の service_role だけ）
alter table public.staff_profiles add column if not exists chat_email text unique; -- Google Chat のアカウント（@psr-seishinkai.org）
alter table public.staff_profiles add column if not exists chat_user text unique;  -- Chat のユーザーID（users/数字）。メールが取れない時もこれで引ける
create table if not exists public.uketsuke (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  sender_name text, sender_email text, chat_user text,
  space text, thread text, message_name text unique,
  office text,                 -- staff_profiles.chat_email で引いた事業所（未登録なら null）
  category text not null,      -- 日誌/送迎/請求/計画/記録/その他/不具合・修正
  body text not null,
  status text not null default '未対応' check (status in ('未対応','対応中','完了'))
);
alter table public.uketsuke enable row level security;
drop policy if exists uk_read on public.uketsuke;
create policy uk_read on public.uketsuke for select to authenticated
  using (office = public.my_office() or public.my_role() = '事務');
drop policy if exists uk_status on public.uketsuke;
create policy uk_status on public.uketsuke for update to authenticated
  using (office = public.my_office() or public.my_role() = '事務');
revoke update on public.uketsuke from authenticated;
grant select on public.uketsuke to authenticated;
grant update (status) on public.uketsuke to authenticated;
