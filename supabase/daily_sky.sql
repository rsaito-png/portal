-- 毎日占い（全体の空の動き。個人natalではない）。トップ最上段に出す。
-- 書き込みは Edge daily-sky（service_role）だけ。ログイン職員は読むだけ。
create table if not exists public.portal_daily_sky (
  day date primary key,            -- Asia/Tokyo の日付
  body text not null,              -- 本文 2〜3文
  tip text not null,               -- 今日のひとこと
  updated_at timestamptz default now()
);
alter table public.portal_daily_sky enable row level security;
revoke all on public.portal_daily_sky from anon;
grant select on public.portal_daily_sky to authenticated;
drop policy if exists daily_sky_read on public.portal_daily_sky;
create policy daily_sky_read on public.portal_daily_sky for select to authenticated using (true);

insert into public.portal_daily_sky(day, body, tip) values
  ((now() at time zone 'Asia/Tokyo')::date,
   '月は昼に乙女座へ。話は進むが、現場は動かない日。急がず、一つだけ片づける。',
   '散らかっても慌てず、目の前の一つを拾え。')
on conflict (day) do nothing;

-- 毎日 JST 5:10（UTC 20:10）に daily-sky を叩く。秘密は private_config 'daily_sky_secret'（値はDBにだけ保存）。
-- 投入: insert into private_config values ('daily_sky_secret','<secret>') on conflict (k) do update set v=excluded.v;
create table if not exists private_config (k text primary key, v text not null);
alter table private_config enable row level security;
revoke all on private_config from anon, authenticated;
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule('daily-sky') where exists (select 1 from cron.job where jobname = 'daily-sky');
select cron.schedule('daily-sky', '10 20 * * *', $$
  select net.http_post(url := 'https://zvrardoyxocmqhvyddnf.supabase.co/functions/v1/daily-sky',
    headers := jsonb_build_object('Content-Type','application/json','x-daily-sky-secret',(select v from private_config where k='daily_sky_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 30000);
$$);
