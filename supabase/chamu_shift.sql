-- 茶夢（生活介護）の曜日別職員配置。外部の表は使わず、この表だけを見る。
-- 氏名・常勤/非常勤・開始・終了だけを置く。金額の列は置かない。
-- 土日の行は置かない。再実行できる。chamu.sql のあと、Supabase SQL Editor でこのファイルを実行する。
-- 2026-11-02 確定。常勤は月〜金とも齊藤・中村友香。非常勤の中村文は月〜金 14:00〜17:00。
-- 安藤尚子は月火木金 11:00〜14:00。文とは14:00で引き継ぎ、重ならない。

create table if not exists public.chamu_shift (
  id uuid primary key default gen_random_uuid(),
  dow text not null check (dow in ('月', '火', '水', '木', '金')),
  staff_name text not null check (char_length(btrim(staff_name)) between 1 and 40),
  employment text not null check (employment in ('常勤', '非常勤')),
  start_time text not null check (start_time ~ '^\d{2}:\d{2}$'),
  end_time text not null check (end_time ~ '^\d{2}:\d{2}$'),
  sort int not null default 0,
  unique (dow, staff_name),
  constraint chamu_shift_span check (end_time > start_time),
  constraint chamu_shift_full check (employment <> '常勤' or (start_time = '10:00' and end_time = '18:00')),
  constraint chamu_shift_part check (employment <> '非常勤' or (start_time >= '11:00' and end_time <= '17:00')),
  constraint chamu_shift_fumi check (staff_name <> '中村文' or (start_time = '14:00' and end_time = '17:00')),
  constraint chamu_shift_kato check (staff_name <> '加藤幸弘' or dow = '水'),
  constraint chamu_shift_ando check (staff_name <> '安藤尚子' or dow <> '水')
);

comment on table public.chamu_shift is '茶夢の曜日別職員配置。氏名・常勤か非常勤・時間だけ。金額の列はない。土日の行は置かない。';

insert into public.chamu_shift (dow, staff_name, employment, start_time, end_time, sort) values
  ('月', '齊藤', '常勤', '10:00', '18:00', 10),
  ('月', '中村友香', '常勤', '10:00', '18:00', 20),
  ('月', '安藤尚子', '非常勤', '11:00', '14:00', 30),
  ('月', '中村文', '非常勤', '14:00', '17:00', 40),
  ('火', '齊藤', '常勤', '10:00', '18:00', 10),
  ('火', '中村友香', '常勤', '10:00', '18:00', 20),
  ('火', '安藤尚子', '非常勤', '11:00', '14:00', 30),
  ('火', '中村文', '非常勤', '14:00', '17:00', 40),
  ('水', '齊藤', '常勤', '10:00', '18:00', 10),
  ('水', '中村友香', '常勤', '10:00', '18:00', 20),
  ('水', '加藤幸弘', '非常勤', '11:00', '14:00', 30),
  ('水', '中村文', '非常勤', '14:00', '17:00', 40),
  ('木', '齊藤', '常勤', '10:00', '18:00', 10),
  ('木', '中村友香', '常勤', '10:00', '18:00', 20),
  ('木', '安藤尚子', '非常勤', '11:00', '14:00', 30),
  ('木', '中村文', '非常勤', '14:00', '17:00', 40),
  ('金', '齊藤', '常勤', '10:00', '18:00', 10),
  ('金', '中村友香', '常勤', '10:00', '18:00', 20),
  ('金', '安藤尚子', '非常勤', '11:00', '14:00', 30),
  ('金', '中村文', '非常勤', '14:00', '17:00', 40)
on conflict (dow, staff_name) do update set
  employment = excluded.employment,
  start_time = excluded.start_time,
  end_time = excluded.end_time,
  sort = excluded.sort;

create index if not exists chamu_shift_dow on public.chamu_shift (dow, sort);

alter table public.chamu_shift enable row level security;

drop policy if exists chamu_shift_read on public.chamu_shift;
create policy chamu_shift_read on public.chamu_shift for select to authenticated
  using (public.chamu_can());

revoke all on public.chamu_shift from anon, authenticated, public;
grant select on public.chamu_shift to authenticated;

notify pgrst, 'reload schema';
