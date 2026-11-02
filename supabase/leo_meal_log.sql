-- レオの食事提供（児童ごと）と総合日誌（その日全体）。ポータルが正。
-- Googleの食事・おやつ列（あり／なし、または金額）には書き戻さない。国保連の請求は簡易入力の手打ちのまま。
-- 予定→日誌→LINE→実績（leo_record_flow.sql）の表は変えない。ここは記録だけ。
-- Supabase SQL Editor で Run する（再実行できる）。

create table if not exists public.leo_day_log (
  day date primary key,
  meal_menu text check (meal_menu is null or char_length(meal_menu) <= 500),
  notes text check (notes is null or char_length(notes) <= 4000),
  author text check (author is null or char_length(author) <= 100),
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);
comment on table public.leo_day_log is 'レオの総合日誌。1日1行。食事メニューと連絡・報告。請求には使わない。';
comment on column public.leo_day_log.meal_menu is 'その日の食事メニュー（茶夢総合日誌の昼食メニュー、日中一時の本日の食事内容と同じ役割）。';
comment on column public.leo_day_log.notes is '連絡・報告・備考。その日全体の記録。';

create table if not exists public.leo_meal_record (
  day date not null,
  child text not null check (char_length(child) between 1 and 100),
  meal text check (meal is null or meal in ('あり', 'なし')),
  snack text check (snack is null or snack in ('あり', 'なし')),
  meal_note text check (meal_note is null or char_length(meal_note) <= 500),
  day_note text check (day_note is null or char_length(day_note) <= 2000),
  author text check (author is null or char_length(author) <= 100),
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (day, child)
);
comment on table public.leo_meal_record is '児童ごとの食事提供の記録。leo_nikki.meal / snack（シートの料金列）とは別。実績の日付・時間は leo_jisseki のまま。';
comment on column public.leo_meal_record.meal is '食事提供の有無。あり／なし。';
comment on column public.leo_meal_record.meal_note is '食事の内容（何をどのくらい食べたか）。';
comment on column public.leo_meal_record.snack is 'おやつ提供の有無。金額は入れない。';
comment on column public.leo_meal_record.day_note is 'その子のその日の記録。活動記録（LINE）とは別。';

alter table public.leo_day_log enable row level security;
alter table public.leo_meal_record enable row level security;

drop policy if exists ldl_read on public.leo_day_log;
create policy ldl_read on public.leo_day_log for select to authenticated
  using (public.my_office() = 'レオ' or public.can_bill());
drop policy if exists ldl_ins on public.leo_day_log;
create policy ldl_ins on public.leo_day_log for insert to authenticated
  with check (public.my_office() = 'レオ');
drop policy if exists ldl_upd on public.leo_day_log;
create policy ldl_upd on public.leo_day_log for update to authenticated
  using (public.my_office() = 'レオ') with check (public.my_office() = 'レオ');

drop policy if exists lmr_read on public.leo_meal_record;
create policy lmr_read on public.leo_meal_record for select to authenticated
  using (public.my_office() = 'レオ' or public.can_bill());
drop policy if exists lmr_ins on public.leo_meal_record;
create policy lmr_ins on public.leo_meal_record for insert to authenticated
  with check (public.my_office() = 'レオ');
drop policy if exists lmr_upd on public.leo_meal_record;
create policy lmr_upd on public.leo_meal_record for update to authenticated
  using (public.my_office() = 'レオ') with check (public.my_office() = 'レオ');

grant select, insert, update on public.leo_day_log to authenticated;
grant select, insert, update on public.leo_meal_record to authenticated;

notify pgrst, 'reload schema';
