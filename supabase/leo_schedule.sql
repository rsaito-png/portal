-- 保護者への「来月の利用予定」確認（Googleフォーム＋型表＋25日のカレンダー作成 の置き換え。11/25までは並行・実保護者には送らない）
-- 保護者は ログインなし・児童×月ごとのリンク（hogosha と同じ48桁トークン）。公開は SECURITY DEFINER の RPC 2つ（get / submit）だけ
-- 回答は leo_schedule_answer に書き換え不可で積み上げ、最新の回答を leo_schedule_weekday / leo_schedule_exception に展開（25日の作成スクリプトが読む。列の意味は 型表・例外シートと同じ。型表そのものは変えない）

create table if not exists public.leo_schedule_request (
  id bigint generated always as identity primary key,
  child text not null check (char_length(child) <= 100),          -- 型表の「児童名」と同じ表記
  month date not null check (extract(day from month) = 1),         -- 対象月の1日
  token text not null unique check (token ~ '^[0-9a-f]{48}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,                                  -- この時刻まで回答・訂正できる（初期＝前月25日 9:00 JST＝カレンダー作成の時刻）
  sent_at timestamptz, send_count int not null default 0,           -- 職員がリンクをコピーした（＝送った）記録
  last_reminded_at timestamptz, remind_count int not null default 0,
  answered_at timestamptz,                                          -- 最新の回答日時
  created_by uuid default auth.uid(),
  unique (child, month));
alter table public.leo_schedule_request enable row level security;
drop policy if exists lsr_read on public.leo_schedule_request;
create policy lsr_read on public.leo_schedule_request for select to authenticated using (public.can_manage());   -- トークンを含むので管理側のみ。レオ職員は leo_sched_status() で状況だけ見る
drop policy if exists lsr_write on public.leo_schedule_request;
create policy lsr_write on public.leo_schedule_request for update to authenticated using (public.can_manage()) with check (public.can_manage());

create table if not exists public.leo_schedule_answer (
  id bigint generated always as identity primary key,
  request_id bigint not null references public.leo_schedule_request(id),
  child text not null, month date not null,
  answered_at timestamptz not null default now(),
  is_usual boolean not null,                                        -- いつもどおり（個別の日の連絡も備考もない）
  answer jsonb not null check (pg_column_size(answer) <= 30000));
create index if not exists lsa_req on public.leo_schedule_answer (request_id, answered_at desc);
alter table public.leo_schedule_answer enable row level security;
drop policy if exists lsa_read on public.leo_schedule_answer;
create policy lsa_read on public.leo_schedule_answer for select to authenticated using (public.my_office() = 'レオ' or public.can_manage() or public.can_bill());
create or replace function public.leo_schedule_answer_immutable() returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('leo.purge', true), '') = '1' and tg_op = 'DELETE' then return old; end if;
  raise exception '回答の記録は書き換え・削除できません'; end $$;
drop trigger if exists lsa_immutable on public.leo_schedule_answer;
create trigger lsa_immutable before update or delete on public.leo_schedule_answer for each row execute function public.leo_schedule_answer_immutable();

-- 最新の回答の展開（曜日回答＝Googleの「曜日回答」シート、例外＝「例外」シートと同じ意味）
create table if not exists public.leo_schedule_weekday (
  child text not null, month date not null, dow text not null check (dow in ('月','火','水','木','金','土')),
  use boolean not null default true,                                -- その曜日に来る（型表どおり）
  school_time text check (school_time ~ '^\d{2}:\d{2}$'),           -- 学校（園）お迎え時刻（型表の「学校お迎え時刻（基準）」に当たる）
  pick_place text check (char_length(pick_place) <= 100),            -- 迎え場所（型表 O列）
  drop_place text check (char_length(drop_place) <= 100),            -- 送り場所（型表 P列。空欄なら自宅）
  answer_id bigint references public.leo_schedule_answer(id), answered_at timestamptz not null default now(),
  primary key (child, month, dow));
create table if not exists public.leo_schedule_exception (
  id bigint generated always as identity primary key,
  child text not null, month date not null, day date,               -- day は「要確認」（備考）のときだけ空でよい
  kind text not null check (kind in ('休み','母の送り','母の迎え','追加利用','時刻変更','送り場所変更','要確認')),
  time text check (time ~ '^\d{2}:\d{2}$'),                         -- 母の迎え＝施設に来る時刻／時刻変更・追加利用＝学校お迎え時刻
  place text check (char_length(place) <= 100), memo text check (char_length(memo) <= 500),
  source text not null default '保護者' check (source in ('保護者','職員')),
  answer_id bigint references public.leo_schedule_answer(id), created_at timestamptz not null default now());
create index if not exists lse_cm on public.leo_schedule_exception (child, month);
alter table public.leo_schedule_weekday enable row level security;
alter table public.leo_schedule_exception enable row level security;
drop policy if exists lsw_read on public.leo_schedule_weekday;
create policy lsw_read on public.leo_schedule_weekday for select to authenticated using (public.my_office() = 'レオ' or public.can_manage() or public.can_bill());
drop policy if exists lsw_write on public.leo_schedule_weekday;
create policy lsw_write on public.leo_schedule_weekday for all to authenticated using (public.can_manage()) with check (public.can_manage());
drop policy if exists lse_read on public.leo_schedule_exception;
create policy lse_read on public.leo_schedule_exception for select to authenticated using (public.my_office() = 'レオ' or public.can_manage() or public.can_bill());
drop policy if exists lse_write on public.leo_schedule_exception;
create policy lse_write on public.leo_schedule_exception for all to authenticated using (public.can_manage()) with check (public.can_manage());

-- 型表（ポータルで直したものがあればそれ、なければGoogleの写し）から、その児童の行を返す
create or replace function public.leo_sched_kata(p_child text) returns setof jsonb language sql stable security definer set search_path = public as $$
  select data from (select data from leo_master where kind = 'kata' union all select data from leo_sheet where kind = 'kata' and not exists (select 1 from leo_master where kind = 'kata')) x
  where data->>'児童名' = p_child $$;
revoke all on function public.leo_sched_kata from public;

-- 事業所のお休みの日＝「休所」の予定＋祝日（祝日はこれまでのGASと同じく予定を作らない。祝日に開ける日は職員が予定を直接入れる）
create or replace function public.leo_sched_closed(p_month date) returns date[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct d), '{}') from (
    select day d from leo_events where kind = '休所' and day >= p_month and day < (p_month + interval '1 month')::date
    union select h::date from unnest(array['2026-11-03','2026-11-23','2027-01-01','2027-01-11','2027-02-11','2027-02-23','2027-03-21','2027-03-22','2027-04-29','2027-05-03','2027-05-04','2027-05-05','2027-07-19','2027-08-11','2027-09-20','2027-09-23','2027-10-11','2027-11-03','2027-11-23']) h
      where h::date >= p_month and h::date < (p_month + interval '1 month')::date) x $$;
revoke all on function public.leo_sched_closed from public;

-- 保護者ページ：その子の画面に必要なものだけ返す（他の児童の情報は出さない）
create or replace function public.leo_sched_get(p_token text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r record; reg jsonb; closed jsonb; prev jsonb;
begin
  select * into r from leo_schedule_request where token = p_token and length(p_token) = 48;
  if not found then return null; end if;
  select coalesce(jsonb_agg(jsonb_build_object('dow', k->>'曜日', 'start', k->>'利用開始', 'end', k->>'利用終了',
      'weekly', coalesce(k->>'利用週', '毎週') <> '不定期', 'parent', coalesce(k->>'保護者送迎', ''),
      'school_time', coalesce(nullif(k->>'学校お迎え時刻（基準）※空欄なら迎え開始', ''), nullif(k->>'迎え開始', '')), 'pick_place', nullif(k->>'迎え場所', ''), 'drop_place', coalesce(nullif(k->>'送り場所（空欄なら自宅）', ''), '自宅'))
      order by position(k->>'曜日' in '月火水木金土')), '[]') into reg from leo_sched_kata(r.child) k;
  select coalesce(to_jsonb(leo_sched_closed(r.month)), '[]') into closed;
  select jsonb_build_object('month', a.month, 'answered_at', a.answered_at, 'same_month', a.month = r.month, 'answer', a.answer) into prev
    from leo_schedule_answer a where a.child = r.child and a.month <= r.month order by (a.month = r.month) desc, a.answered_at desc limit 1;
  return jsonb_build_object('child', r.child, 'month', to_char(r.month, 'YYYY-MM'), 'expired', r.expires_at <= now(), 'deadline', r.expires_at,
    'answered_at', r.answered_at, 'regular', reg, 'closed', closed, 'prev', prev);
end $$;

-- 保護者の回答：書き換え不可の履歴に積み、最新を展開。期限内なら何度でも送り直せる（最新が有効）
create or replace function public.leo_sched_submit(p_token text, p_answer jsonb) returns text language plpgsql security definer set search_path = public as $$
declare r record; aid bigint; wr record; d jsonb; kd text; tm text; dy date; n int := 0; usual boolean; a_days jsonb; note text;
  closed date[]; 
begin
  if p_answer is null or jsonb_typeof(p_answer) <> 'object' or pg_column_size(p_answer) > 30000 then raise exception '回答の形が正しくありません'; end if;
  select * into r from leo_schedule_request where token = p_token and length(p_token) = 48 for update;
  if not found then raise exception 'リンクが正しくありません'; end if;
  if r.expires_at <= now() then raise exception 'リンクの期限が切れています'; end if;
  a_days := coalesce(p_answer->'days', '[]'); if jsonb_typeof(a_days) <> 'array' or jsonb_array_length(a_days) > 80 then raise exception '日ごとの連絡が多すぎます'; end if;
  if jsonb_typeof(coalesce(p_answer->'weekdays', '{}')) <> 'object' then raise exception '曜日の形が正しくありません'; end if;
  note := nullif(btrim(coalesce(p_answer->>'note', '')), ''); if char_length(coalesce(note, '')) > 500 then raise exception '備考は500字までです'; end if;
  closed := leo_sched_closed(r.month);
  -- 検証（先に全部確かめる）
  for d in select * from jsonb_array_elements(a_days) loop
    kd := d->>'kind'; if kd not in ('休み','母の送り','母の迎え','追加利用','時刻変更','送り場所変更') then raise exception '種類が正しくありません'; end if;
    begin dy := (d->>'day')::date; exception when others then raise exception '日付が正しくありません'; end;
    if dy < r.month or dy >= (r.month + interval '1 month')::date then raise exception '対象月以外の日付です'; end if;
    if dy = any(closed) then raise exception '% は事業所のお休みです', to_char(dy, 'MM/DD'); end if;
    tm := nullif(d->>'time', ''); if tm is not null and tm !~ '^\d{1,2}:\d{2}$' then raise exception '時刻は 15:30 の形で入れてください'; end if;
    if char_length(coalesce(d->>'place', '')) > 100 or char_length(coalesce(d->>'memo', '')) > 500 then raise exception '文字数が多すぎます'; end if;
  end loop;
  for wr in select key, value from jsonb_each(coalesce(p_answer->'weekdays', '{}')) loop
    if wr.key not in ('月','火','水','木','金','土') or jsonb_typeof(wr.value) <> 'object' then raise exception '曜日が正しくありません'; end if;
    tm := nullif(wr.value->>'school_time', ''); if tm is not null and tm !~ '^\d{1,2}:\d{2}$' then raise exception '時刻は 15:30 の形で入れてください'; end if;
    if char_length(coalesce(wr.value->>'pick_place', '')) > 100 or char_length(coalesce(wr.value->>'drop_place', '')) > 100 then raise exception '場所が長すぎます'; end if;
  end loop;
  usual := jsonb_array_length(a_days) = 0 and note is null;
  insert into leo_schedule_answer (request_id, child, month, is_usual, answer) values (r.id, r.child, r.month, usual, p_answer) returning id into aid;
  delete from leo_schedule_weekday where child = r.child and month = r.month;
  insert into leo_schedule_weekday (child, month, dow, use, school_time, pick_place, drop_place, answer_id)
  select r.child, r.month, jw.key, coalesce((jw.value->>'use')::boolean, true),
    case when nullif(jw.value->>'school_time', '') is null then null else lpad(split_part(jw.value->>'school_time', ':', 1), 2, '0') || ':' || split_part(jw.value->>'school_time', ':', 2) end,
    nullif(btrim(jw.value->>'pick_place'), ''), nullif(btrim(jw.value->>'drop_place'), ''), aid
  from jsonb_each(coalesce(p_answer->'weekdays', '{}')) jw;
  delete from leo_schedule_exception where child = r.child and month = r.month and source = '保護者';
  insert into leo_schedule_exception (child, month, day, kind, time, place, memo, answer_id)
  select r.child, r.month, (x->>'day')::date, x->>'kind',
    case when nullif(x->>'time', '') is null then null else lpad(split_part(x->>'time', ':', 1), 2, '0') || ':' || split_part(x->>'time', ':', 2) end,
    nullif(btrim(x->>'place'), ''), nullif(btrim(x->>'memo'), ''), aid from jsonb_array_elements(a_days) x;
  if note is not null then insert into leo_schedule_exception (child, month, day, kind, memo, answer_id) values (r.child, r.month, null, '要確認', note, aid); end if;
  update leo_schedule_request set answered_at = now() where id = r.id;
  return 'ok';
end $$;
revoke all on function public.leo_sched_get, public.leo_sched_submit from public;
grant execute on function public.leo_sched_get, public.leo_sched_submit to anon, authenticated;

-- 職員：対象月の依頼を作る（型表の児童全員。作るだけで何も送らない）／状況／リンク取得＋送信記録／期限の延長
create or replace function public.leo_sched_open(p_month date, p_children text[] default null) returns int language plpgsql security definer set search_path = public, extensions as $$
declare n int;
begin
  if not public.can_manage() then raise exception '児発管・管理者・事務のみ'; end if;
  if extract(day from p_month) <> 1 then raise exception '月の1日を指定してください'; end if;
  insert into leo_schedule_request (child, month, token, expires_at)
  select c, p_month, encode(gen_random_bytes(24), 'hex'), ((p_month - interval '1 month')::date + 24)::timestamp at time zone 'Asia/Tokyo' + interval '9 hours'
  from unnest(coalesce(p_children, array(select distinct data->>'児童名' from (select data from leo_master where kind = 'kata' union all select data from leo_sheet where kind = 'kata' and not exists (select 1 from leo_master where kind = 'kata')) y where coalesce(data->>'児童名', '') <> ''))) c
  on conflict (child, month) do nothing;
  get diagnostics n = row_count; return n;
end $$;
create or replace function public.leo_sched_status(p_month date) returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.my_office() = 'レオ' or public.can_manage() or public.can_bill()) then raise exception 'レオの職員のみ'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'child', r.child, 'answered_at', r.answered_at, 'answers', (select count(*) from leo_schedule_answer a where a.request_id = r.id),
    'usual', (select a.is_usual from leo_schedule_answer a where a.request_id = r.id order by a.answered_at desc limit 1),
    'sent_at', r.sent_at, 'send_count', r.send_count, 'last_reminded_at', r.last_reminded_at, 'remind_count', r.remind_count, 'expires_at', r.expires_at) order by r.answered_at is not null, r.child)
    from leo_schedule_request r where r.month = p_month), '[]');
end $$;
create or replace function public.leo_sched_link(p_id bigint, p_kind text default 'send') returns text language plpgsql security definer set search_path = public as $$
declare t text;
begin
  if not public.can_manage() then raise exception '児発管・管理者・事務のみ'; end if;
  if p_kind = 'remind' then update leo_schedule_request set last_reminded_at = now(), remind_count = remind_count + 1, sent_at = coalesce(sent_at, now()) where id = p_id returning token into t;
  else update leo_schedule_request set sent_at = coalesce(sent_at, now()), send_count = send_count + 1 where id = p_id returning token into t; end if;
  if t is null then raise exception '依頼がありません'; end if;
  return t;
end $$;
create or replace function public.leo_sched_extend(p_id bigint, p_until timestamptz) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage() then raise exception '児発管・管理者・事務のみ'; end if;
  update leo_schedule_request set expires_at = p_until where id = p_id;
end $$;
revoke all on function public.leo_sched_open, public.leo_sched_status, public.leo_sched_link, public.leo_sched_extend from public;
grant execute on function public.leo_sched_open, public.leo_sched_status, public.leo_sched_link, public.leo_sched_extend to authenticated;
