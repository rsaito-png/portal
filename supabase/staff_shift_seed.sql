-- 実態のシフトの初期値（2026-11-11 齊藤さん指定）。実績表・茶夢配置表からは取らない。
-- 中村文の開始は10月のカレンダー（あや先生 14:00／15:30／14:30）より。終了17:00は仮。
-- 何度流しても同じ結果（既にある型・変更は上書きしない）。
with s(name, dow, st, en, note) as (values
  ('安藤尚子', 1, '10:30', '14:30', null), ('安藤尚子', 5, '10:30', '14:30', null),
  ('加藤幸弘', 5, '15:00', '17:00', null),
  ('横田祥',   1, '10:00', '12:00', null),
  ('中村文',   1, '14:00', '17:00', '終了は仮'), ('中村文', 2, '15:30', '17:00', '終了は仮'),
  ('中村文',   4, '14:30', '17:00', '終了は仮'), ('中村文', 5, '14:00', '17:00', '終了は仮'))
insert into public.staff_shift_base (user_id, dow, start_time, end_time, note)
select p.user_id, s.dow, s.st::time, s.en::time, s.note from s
join public.staff_profiles p on p.active and p.office = 'レオ' and replace(replace(p.full_name, '　', ''), ' ', '') = s.name
on conflict (user_id, dow, start_time) do nothing;

-- その日だけ：11/27 安藤 休み（齊藤さん）。11/13 中村文 休み（予定カレンダーの「あや先生休み」より）
insert into public.staff_shift_day (day, user_id, kind, note)
select d.day::date, p.user_id, '休み', d.note from (values ('2026-11-27', '安藤尚子', '安藤先生休み'), ('2026-11-13', '中村文', 'あや先生休み')) d(day, name, note)
join public.staff_profiles p on p.active and p.office = 'レオ' and replace(replace(p.full_name, '　', ''), ' ', '') = d.name
on conflict do nothing;
