-- レオ 日誌・実績 用（Supabase の SQL Editor に貼って Run）
-- 個人データはこのDBにだけ置く（公開リポジトリには置かない）。読めるのはレオ所属のログイン職員だけ

-- 職員プロフィール（どの事業所か・役割・日誌に書かれる名前）
create table if not exists public.staff_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  office text not null default 'レオ',
  role text not null default '職員' check (role in ('職員','事務')),
  nikki_name text            -- 日誌の運転手欄に出る名前（例「齊藤　連」）。自分の送迎担当を出すのに使う
);
alter table public.staff_profiles enable row level security;
drop policy if exists sp_self on public.staff_profiles;
create policy sp_self on public.staff_profiles for select to authenticated using (user_id = auth.uid());

create or replace function public.my_office() returns text language sql stable security definer set search_path = public
as $$ select office from public.staff_profiles where user_id = auth.uid() $$;

-- 日誌（1日×1行＝1人）。Googleの日誌から box の同期ジョブが入れる
create table if not exists public.leo_nikki (
  day date not null,
  row_no int not null,                 -- 日誌タブの行番号（9〜18 利用、20〜29 欠席）
  kind text not null check (kind in ('利用','欠席')),
  child text, service text,
  pick_car text, pick_driver text, pick_place text, pick_time text,
  start_time text, end_time text,
  drop_time text, drop_car text, drop_driver text, drop_place text,
  meal text, snack text,
  synced_at timestamptz not null default now(),
  primary key (day, row_no)
);
alter table public.leo_nikki enable row level security;
drop policy if exists nikki_read on public.leo_nikki;
create policy nikki_read on public.leo_nikki for select to authenticated using (public.my_office() = 'レオ');

-- 実績記録「一覧」（請求に関わる列＝利用料・加算・おやつ代は同期しない）
create table if not exists public.leo_jisseki (
  day date not null, child text not null,
  status text, start_time text, end_time text, source text,
  synced_at timestamptz not null default now(),
  primary key (day, child)
);
alter table public.leo_jisseki enable row level security;
drop policy if exists jisseki_read on public.leo_jisseki;
create policy jisseki_read on public.leo_jisseki for select to authenticated using (public.my_office() = 'レオ');

-- ポータルでの「直す」は元データを上書きせず、修正依頼として記録（Googleへは承認後に反映）
create table if not exists public.leo_edits (
  id bigint generated always as identity primary key,
  target text not null check (target in ('nikki','jisseki')),
  day date not null, row_key text not null, field text not null,
  old_value text, new_value text check (char_length(new_value) <= 500),
  edited_by uuid not null default auth.uid() references auth.users(id),
  edited_at timestamptz not null default now(),
  status text not null default '未反映' check (status in ('未反映','反映済み','却下'))
);
alter table public.leo_edits enable row level security;
drop policy if exists edits_read on public.leo_edits;
create policy edits_read on public.leo_edits for select to authenticated using (public.my_office() = 'レオ');
drop policy if exists edits_insert on public.leo_edits;
create policy edits_insert on public.leo_edits for insert to authenticated
  with check (public.my_office() = 'レオ' and edited_by = auth.uid() and status = '未反映');

-- box の同期ジョブ用の入口（秘密トークンの照合つき。秘密鍵をboxに置かずに済む）
create table if not exists public.sync_secret (name text primary key, token_sha256 text not null);
alter table public.sync_secret enable row level security;  -- ポリシーなし＝誰も直接読めない
insert into public.sync_secret values ('leo', '02c2aa3c260e281111587a71f1f72fdeac4c909f0641692158e6b6a993dbe590')
  on conflict (name) do update set token_sha256 = excluded.token_sha256;

create or replace function public.leo_sync(p_token text, p_nikki jsonb, p_jisseki jsonb, p_days date[])
returns text language plpgsql security definer set search_path = public, extensions as $$
begin
  if encode(digest(p_token, 'sha256'), 'hex') is distinct from (select token_sha256 from sync_secret where name = 'leo')
    then raise exception 'bad token'; end if;
  delete from leo_nikki where day = any(p_days);
  insert into leo_nikki select * from jsonb_populate_recordset(null::leo_nikki, p_nikki);
  insert into leo_jisseki select * from jsonb_populate_recordset(null::leo_jisseki, p_jisseki)
    on conflict (day, child) do update set status = excluded.status, start_time = excluded.start_time,
      end_time = excluded.end_time, source = excluded.source, synced_at = now();
  return 'ok';
end $$;
revoke all on function public.leo_sync from public;
grant execute on function public.leo_sync to anon, authenticated;

-- 最初の職員をレオ・事務として登録（ログイン作成後に再実行してもOK）
insert into public.staff_profiles (user_id, office, role, nikki_name)
  select id, 'レオ', '事務', '<職員氏名>' from auth.users where email = '<メールアドレス>'
  on conflict (user_id) do nothing;
