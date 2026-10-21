-- 退所日で枠の材料（leo_frame_input）から児童を外す処理は supabase/leo_left.sql。このファイルを再実行したあとは leo_left.sql をもう一度実行する。
-- レオ 予定（利用予定・送迎・職員の勤務/不在）。11/1からはこれが正（Googleカレンダーは11/1まで取り込むだけ、書き戻さない）
-- 読む：レオ職員・事務。書く：児発管・管理者・事務（can_manage）。Google取り込み分は box の同期だけが入れ替える
create table if not exists public.leo_events (
  id bigint generated always as identity primary key,
  day date not null,
  kind text not null check (kind in ('利用','休み','迎え','送り','勤務','不在','休所','その他')),
  child text,                 -- 利用・休み：児童（日誌と同じフルネーム。照合できない時はカレンダーの表記）
  kids text[] not null default '{}',  -- 迎え・送り：乗る順
  staff text,                 -- 迎え・送り：運転手／勤務・不在：職員（日誌の名前）
  start_time text check (start_time ~ '^\d{2}:\d{2}$'), end_time text check (end_time ~ '^\d{2}:\d{2}$'),
  parent_drop boolean not null default false,   -- 保護者が施設へ送る（☆なし）
  parent_pick boolean not null default false,   -- 保護者が施設へ迎えに来る（★なし）
  place text check (char_length(place) <= 200), note text check (char_length(note) <= 500),
  title text check (char_length(title) <= 200),  -- Googleの予定名（取り込み分）
  source text not null default 'portal' check (source in ('google','portal','kata')),
  gkey text unique,           -- Google：カレンダー名|イベントID（ポータルで直すと source='portal' になり同期で上書きされない）
  updated_by uuid default auth.uid(), updated_at timestamptz not null default now());
create index if not exists leo_events_day on public.leo_events (day);
alter table public.leo_events enable row level security;
drop policy if exists le_read on public.leo_events;
create policy le_read on public.leo_events for select to authenticated using (public.my_office() = 'レオ' or public.can_bill());
drop policy if exists le_write on public.leo_events;
create policy le_write on public.leo_events for all to authenticated using (public.can_manage()) with check (public.can_manage());

-- box：Googleカレンダーの取り込み（期間内の google 分を入れ替え。ポータルで直した行は残す）
create or replace function public.leo_cal_import(p_token text, p_from date, p_to date, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare n int;
begin
  if encode(digest(p_token, 'sha256'), 'hex') is distinct from (select token_sha256 from sync_secret where name = 'leo') then raise exception 'bad token'; end if;
  delete from leo_events where source = 'google' and day >= p_from and day < p_to;
  insert into leo_events (day, kind, child, kids, staff, start_time, end_time, parent_drop, parent_pick, place, note, title, source, gkey)
  select (x->>'day')::date, x->>'kind', x->>'child', coalesce(array(select jsonb_array_elements_text(x->'kids')), '{}'), x->>'staff',
    x->>'start_time', x->>'end_time', coalesce((x->>'parent_drop')::bool, false), coalesce((x->>'parent_pick')::bool, false),
    x->>'place', x->>'note', x->>'title', 'google', x->>'gkey'
  from jsonb_array_elements(p_rows) x
  where (x->>'day')::date >= p_from and (x->>'day')::date < p_to
  on conflict (gkey) do nothing;     -- ポータルで直した（source='portal'）行はそのまま
  get diagnostics n = row_count;
  return jsonb_build_object('inserted', n, 'at', now());
end $$;
revoke all on function public.leo_cal_import from public;
grant execute on function public.leo_cal_import to anon;

-- 日誌の枠（影）：ポータルの予定から box が毎朝作る。GASが作った日誌（leo_nikki）と照合するだけ
create table if not exists public.leo_frame_shadow (
  day date not null, child text not null, kind text not null check (kind in ('利用','欠席')),
  start_time text, end_time text, pick_driver text, pick_time text, pick_place text, drop_driver text, drop_time text, drop_place text,
  warn text, made_at timestamptz not null default now(), primary key (day, child));
alter table public.leo_frame_shadow enable row level security;
drop policy if exists lfs_read on public.leo_frame_shadow;
create policy lfs_read on public.leo_frame_shadow for select to authenticated using (public.can_manage());
create or replace function public.leo_frame_put(p_token text, p_day date, p_rows jsonb)
returns int language plpgsql security definer set search_path = public, extensions as $$
declare n int;
begin
  if encode(digest(p_token, 'sha256'), 'hex') is distinct from (select token_sha256 from sync_secret where name = 'leo') then raise exception 'bad token'; end if;
  delete from leo_frame_shadow where day = p_day;
  insert into leo_frame_shadow (day, child, kind, start_time, end_time, pick_driver, pick_time, pick_place, drop_driver, drop_time, drop_place, warn)
  select p_day, x->>'child', x->>'kind', x->>'start_time', x->>'end_time', x->>'pick_driver', x->>'pick_time', x->>'pick_place',
    x->>'drop_driver', x->>'drop_time', x->>'drop_place', x->>'warn' from jsonb_array_elements(p_rows) x;
  get diagnostics n = row_count; return n;
end $$;
revoke all on function public.leo_frame_put from public;
grant execute on function public.leo_frame_put to anon;

-- box：枠を作るための材料（その日の予定・名簿・型表・GASが作った日誌）
create or replace function public.leo_frame_input(p_token text, p_day date)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
begin
  if encode(digest(p_token, 'sha256'), 'hex') is distinct from (select token_sha256 from sync_secret where name = 'leo') then raise exception 'bad token'; end if;
  return jsonb_build_object(
    'events', (select coalesce(jsonb_agg(to_jsonb(e) - 'updated_by'), '[]') from leo_events e where day = p_day),
    'roster', (select coalesce(jsonb_agg(distinct n), '[]') from (select child n from leo_nikki where child <> '' and day > p_day - 120
                 union select name from leo_children) x where n is not null),
    'kata', (select coalesce(jsonb_agg(data), '[]') from leo_sheet where kind = 'kata'),
    'nikki', (select coalesce(jsonb_agg(to_jsonb(n)), '[]') from leo_nikki n where day = p_day));
end $$;
revoke all on function public.leo_frame_input from public;
grant execute on function public.leo_frame_input to anon;
