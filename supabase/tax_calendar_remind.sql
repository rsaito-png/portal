-- 税カレンダーの拡張（会長承認 2026-11-27・総務からの依頼）。再実行可。
-- 1) tax_calendar に remind_date（期限の5日前）・方法・根拠・金額・添付などの列を足す
-- 2) 毎朝 9:00（日本時間）cron「taxcal-remind」で、remind_date が来た未済の行ごとに会長宛の staff_todo を1件だけ作る
-- 3) カレンダーの「済」と staff_todo の完了をどちらからでも連動
-- 4) 毎月の源泉・住民税の行は「翌月10日、土日祝は翌営業日」で自動で足す。祝日は内閣府の CSV を jp_holidays に取り込む（Edge Function jp-holidays、毎月 cron）
-- 振込・納付・e-Tax 送信は作らない。金額は推測で入れない（amount_text は総務が書く）。職員へのメールや Chat も送らない。

alter table public.tax_calendar
  add column if not exists remind_date date,
  add column if not exists method text,
  add column if not exists source text,
  add column if not exists detail text,
  add column if not exists amount_text text,
  add column if not exists tax_month date,
  add column if not exists todo_id bigint,
  add column if not exists receipts text[] not null default '{}',
  add column if not exists done_at timestamptz;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'tax_calendar_todo_fk') then
    alter table public.tax_calendar add constraint tax_calendar_todo_fk foreign key (todo_id) references public.staff_todo(id) on delete set null;
  end if;
end $$;
-- 毎月分は対象月ごとに1行（自動生成の重複止め）
create unique index if not exists tax_calendar_monthly_month on public.tax_calendar (tax_month) where kind = 'monthly_tax' and tax_month is not null;
-- 依頼は1つの税カレンダー行に1件（状態に関係なく）
create unique index if not exists staff_todo_taxcal_key on public.staff_todo (source_key) where source_key like 'taxcal:%';
grant delete on public.tax_calendar to authenticated;
drop policy if exists tax_calendar_del on public.tax_calendar;
create policy tax_calendar_del on public.tax_calendar for delete to authenticated using (public.is_chair() or public.bp_is_corp_admin());

-- 既存の毎月分に対象月を入れる（期限は対象月の翌月10〜12日）
update public.tax_calendar set tax_month = (date_trunc('month', due_date) - interval '1 month')::date
 where kind = 'monthly_tax' and tax_month is null;

-- 祝日（内閣府「国民の祝日」CSV）。推測の祝日は入れない。
create table if not exists public.jp_holidays (
  d date primary key,
  name text not null,
  fetched_at timestamptz not null default now()
);
alter table public.jp_holidays enable row level security;
drop policy if exists jp_holidays_sel on public.jp_holidays;
create policy jp_holidays_sel on public.jp_holidays for select to authenticated using (true);
grant select on public.jp_holidays to authenticated;

-- 動きの記録（失敗もここに残す。通知はしない）
create table if not exists public.tax_calendar_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  kind text not null,          -- info / warn / error
  msg text not null
);
alter table public.tax_calendar_log enable row level security;
drop policy if exists tax_calendar_log_sel on public.tax_calendar_log;
create policy tax_calendar_log_sel on public.tax_calendar_log for select to authenticated using (public.is_chair() or public.bp_is_corp_admin());
grant select on public.tax_calendar_log to authenticated;

-- 土日・祝日なら翌営業日
create or replace function public.jp_next_business_day(p date) returns date
language sql stable set search_path = public as $$
  with recursive c(x) as (
    select p
    union all
    select x + 1 from c where extract(isodow from x) in (6, 7) or exists (select 1 from public.jp_holidays h where h.d = c.x)
  ) select max(x) from c
$$;
-- その年の祝日データがあるか（元日が入っていれば取り込み済みとみなす）
create or replace function public.jp_holidays_has_year(y int) returns boolean
language sql stable set search_path = public as $$
  select exists (select 1 from public.jp_holidays where d = make_date(y, 1, 1))
$$;

create or replace function public.taxcal_md(d date) returns text
language sql immutable as $$
  select extract(month from d)::int || '/' || extract(day from d)::int || '（' || (array['日','月','火','水','木','金','土'])[extract(dow from d)::int + 1] || '）'
$$;

-- 毎月分の行を足す（対象月：先月〜12か月先。祝日データの無い年はまだ作らない）
create or replace function public.taxcal_ensure_monthly(p_today date default (now() at time zone 'Asia/Tokyo')::date)
returns int language plpgsql security definer set search_path = public as $$
declare
  m date; base date; due date; n int := 0; tpl record; missing int[] := '{}';
begin
  select agency, method, assignee into tpl from public.tax_calendar
   where kind = 'monthly_tax' and tax_month is not null order by tax_month desc limit 1;
  for m in select generate_series(date_trunc('month', p_today) - interval '1 month', date_trunc('month', p_today) + interval '12 months', interval '1 month')::date loop
    if exists (select 1 from public.tax_calendar where kind = 'monthly_tax' and tax_month = m) then continue; end if;
    base := (m + interval '1 month')::date + 9;   -- 翌月10日
    if not public.jp_holidays_has_year(extract(year from base)::int) then
      missing := array_append(missing, extract(year from base)::int); continue;
    end if;
    due := public.jp_next_business_day(base);
    insert into public.tax_calendar (due_date, title, kind, assignee, agency, method, remind_date, tax_month, source, detail)
    values (due, '源泉所得税・住民税（特別徴収）' || extract(month from m)::int || '月分の納付', 'monthly_tax',
            coalesce(tpl.assignee, '齊藤連（納付）'), tpl.agency, tpl.method, due - 5, m,
            '自動で追加（翌月10日、土日祝は翌営業日。祝日は内閣府の祝日CSV）',
            '納期特例なし（毎月納付）。源泉は給与分＋社労士分。納付方法は郵便局・紙の納付書の方針（定着したかは要確認）。金額は総務が追記。納付は会長。')
    on conflict do nothing;
    if found then n := n + 1; end if;
  end loop;
  if n > 0 then insert into public.tax_calendar_log (kind, msg) values ('info', '毎月分を ' || n || ' 行追加'); end if;
  if array_length(missing, 1) > 0 and not exists (
       select 1 from public.tax_calendar_log where kind = 'warn' and msg like '祝日データ待ち%' and (at at time zone 'Asia/Tokyo')::date = p_today) then
    insert into public.tax_calendar_log (kind, msg)
    values ('warn', '祝日データ待ち：' || (select string_agg(distinct y::text, '・') from unnest(missing) y) || '年の祝日が未取り込みのため、その年が期限の毎月分はまだ作っていません');
  end if;
  return n;
end $$;

-- 依頼の件名と本文
create or replace function public.taxcal_todo_title(r public.tax_calendar) returns text
language sql stable as $$
  select left(
    case
      when r.kind = 'monthly_tax' then '【納付】' || replace(replace(r.title, '（特別徴収）', ' '), 'の納付', '')
      when r.title like '%申告%' and r.title like '%納付%' then '【提出・納付】' || r.title
      when r.title like '%納付%' then '【納付】' || r.title
      when r.title ~ '(提出|申告|届|交付)' then '【提出】' || r.title
      when r.title ~ '(決める|判定|承認)' then '【判断】' || r.title
      else '【確認】' || r.title
    end || ' 期限' || public.taxcal_md(r.due_date), 300)
$$;
create or replace function public.taxcal_todo_note(r public.tax_calendar) returns text
language sql stable as $$
  select left(
    '何を：' || r.title || '（期限 ' || public.taxcal_md(r.due_date) || '）' || E'\n' ||
    'どこへ：' || coalesce(nullif(r.agency, ''), '要確認') || E'\n' ||
    'どう払う・出す：' || coalesce(nullif(r.method, ''), '要確認') || E'\n' ||
    '金額：' || coalesce(nullif(r.amount_text, ''), '総務が追記します（まだ未記入）') || E'\n' ||
    '操作は会長がします（Botは振込・納付・送信をしません）。' || E'\n' ||
    '終わったら税カレンダーで受付画面（納付済・受信通知・提出控え）を添付して「済」にしてください。' ||
    case when r.kind = 'monthly_tax' then E'\n' ||
      '補足：納期特例なし。翌月10日（土日祝は翌営業日）。源泉は給与分＋社労士分。郵便局・紙の納付書の方針（定着したかは要確認）。会長分の住民税は名古屋市（月額は一次資料で未確認）。'
    else '' end, 1000)
$$;

-- 毎朝の本体：remind_date が来た未済の行に、会長宛の依頼を1件だけ作る
create or replace function public.taxcal_remind(p_today date default (now() at time zone 'Asia/Tokyo')::date)
returns int language plpgsql security definer set search_path = public as $$
declare
  chair uuid; chair_office text; r public.tax_calendar; k text; tid bigint; n int := 0;
begin
  perform pg_advisory_xact_lock(hashtext('taxcal_remind'));
  begin
    perform public.taxcal_ensure_monthly(p_today);
  exception when others then
    insert into public.tax_calendar_log (kind, msg) values ('error', '毎月分の追加に失敗：' || sqlerrm);
  end;
  select user_id, office into chair, chair_office from public.staff_profiles where is_chair and active order by user_id limit 1;
  if chair is null then
    insert into public.tax_calendar_log (kind, msg) values ('error', '会長（is_chair）が見つからないため依頼を作れませんでした');
    return 0;
  end if;
  for r in select * from public.tax_calendar
            where not done and remind_date is not null and remind_date <= p_today
              and due_date >= p_today - 60          -- 期限切れ60日まで拾う
              and todo_id is null
            order by due_date, id loop
    begin
      k := 'taxcal:' || r.id;
      select id into tid from public.staff_todo where source_key = k order by id limit 1;
      if tid is null then
        insert into public.staff_todo (assignee, title, status, due, note, created_by, link, office, source_key)
        values (chair, public.taxcal_todo_title(r), 'open', r.due_date, public.taxcal_todo_note(r), null,
                '#taxcal/' || r.id, coalesce(chair_office, 'レオ'), k)
        on conflict do nothing
        returning id into tid;
        if tid is null then select id into tid from public.staff_todo where source_key = k order by id limit 1;
        else n := n + 1; end if;
      end if;
      update public.tax_calendar set todo_id = tid where id = r.id and todo_id is null;
    exception when others then
      insert into public.tax_calendar_log (kind, msg) values ('error', '依頼の作成に失敗（税カレンダー ' || r.id || '）：' || sqlerrm);
    end;
  end loop;
  if n > 0 then insert into public.tax_calendar_log (kind, msg) values ('info', '会長の「私への依頼」を ' || n || ' 件作成（' || p_today || '）'); end if;
  return n;
end $$;
revoke all on function public.taxcal_remind(date) from public, anon, authenticated;
revoke all on function public.taxcal_ensure_monthly(date) from public, anon, authenticated;

-- 済の日時
create or replace function public.taxcal_before() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.done and (tg_op = 'INSERT' or not old.done) then new.done_at := coalesce(new.done_at, now()); end if;
  if not new.done then new.done_at := null; end if;
  return new;
end $$;
drop trigger if exists taxcal_before on public.tax_calendar;
create trigger taxcal_before before insert or update on public.tax_calendar for each row execute function public.taxcal_before();

-- カレンダー → 依頼（済／期限の変更）
create or replace function public.taxcal_sync_todo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.todo_id is null then return null; end if;
  if new.done and not old.done then
    update public.staff_todo set status = 'done' where id = new.todo_id and status <> 'done';
  elsif old.done and not new.done then
    update public.staff_todo set status = 'open' where id = new.todo_id and status = 'done';
  end if;
  if new.due_date is distinct from old.due_date then
    begin
      update public.staff_todo set due = new.due_date where id = new.todo_id;
    exception when others then null;   -- 期限の書き換え権限が無い人の操作では依頼側は変えない
    end;
  end if;
  return null;
end $$;
drop trigger if exists taxcal_sync_todo on public.tax_calendar;
create trigger taxcal_sync_todo after update on public.tax_calendar for each row execute function public.taxcal_sync_todo();

-- 依頼 → カレンダー（依頼を「完了」にしたら済、戻したら未済）
create or replace function public.staff_todo_sync_taxcal() returns trigger
language plpgsql security definer set search_path = public as $$
declare tc bigint;
begin
  if new.source_key is null or new.source_key !~ '^taxcal:[0-9]+$' then return null; end if;
  if new.status is not distinct from old.status then return null; end if;
  tc := substring(new.source_key from 8)::bigint;
  if new.status = 'done' then
    update public.tax_calendar set done = true, updated_at = now() where id = tc and not done;
  elsif old.status = 'done' then
    update public.tax_calendar set done = false, updated_at = now() where id = tc and done;
  end if;
  return null;
end $$;
drop trigger if exists staff_todo_sync_taxcal on public.staff_todo;
create trigger staff_todo_sync_taxcal after update of status on public.staff_todo for each row execute function public.staff_todo_sync_taxcal();

-- 受付画面の置き場（非公開）。見られる・置ける・消せるのは会長と事務だけ
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tax-receipts', 'tax-receipts', false, 10485760, array['image/png','image/jpeg','image/webp','image/heic','image/heif','application/pdf'])
on conflict (id) do update set public = false;
drop policy if exists tax_receipts_sel on storage.objects;
drop policy if exists tax_receipts_ins on storage.objects;
drop policy if exists tax_receipts_del on storage.objects;
create policy tax_receipts_sel on storage.objects for select to authenticated using (bucket_id = 'tax-receipts' and (public.is_chair() or public.bp_is_corp_admin()));
create policy tax_receipts_ins on storage.objects for insert to authenticated with check (bucket_id = 'tax-receipts' and (public.is_chair() or public.bp_is_corp_admin()));
create policy tax_receipts_del on storage.objects for delete to authenticated using (bucket_id = 'tax-receipts' and (public.is_chair() or public.bp_is_corp_admin()));

-- cron（UTC 0:00 = 日本時間 9:00）。祝日の取り込みは毎月2日 8:30（日本時間）
create table if not exists public.private_config (k text primary key, v text not null);
insert into public.private_config (k, v) values ('jp_holidays_secret', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')) on conflict (k) do nothing;
select cron.unschedule(jobid) from cron.job where jobname in ('taxcal-remind', 'jp-holidays');
select cron.schedule('taxcal-remind', '0 0 * * *', $c$select public.taxcal_remind()$c$);
select cron.schedule('jp-holidays', '30 23 1 * *', $c$
  select net.http_post(url := 'https://zvrardoyxocmqhvyddnf.supabase.co/functions/v1/jp-holidays',
    headers := jsonb_build_object('Content-Type','application/json','x-jp-holidays-secret',(select v from public.private_config where k='jp_holidays_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 30000);
$c$);
