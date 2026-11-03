// 今日の日誌 → 実費（日別と月合計）。PGlite。架空の名前だけ。本番にはつながない。
// 実行: cd tools && npm i @electric-sql/pglite && node leo_jippi_from_nikki_sql_test.mjs
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const db = new PGlite();
const root = new URL('..', import.meta.url).pathname;
const SQL = fs.readFileSync(root + 'supabase/leo_jippi_from_nikki.sql', 'utf8');
const BACK = fs.readFileSync(root + 'supabase/leo_jippi_from_nikki_rollback.sql', 'utf8');
let bad = 0;
const ok = (c, name, info) => { if (c) console.log('ok', name); else { bad++; console.log('NG', name, info ?? ''); } };
ok((SQL.match(/select 300/g) || []).length === 1, '昼食代300円は1か所');
ok(SQL.includes('leo_jippi_lunch_unit'), '昼食代は関数');
ok(/do \$\$[\s\S]*leo_jippi_sync_meal/.test(SQL) && SQL.includes('-- do $$'), '今月の埋め直しはコメントの中');
ok(!/create policy|enable row level security|grant /i.test(SQL), '権限は変えない');
ok(SQL.includes('set lunch = excluded.lunch') && SQL.includes('set lunch = 0, snack = 0'), '月合計は lunch と snack だけ');
ok(!SQL.includes('pay_link =') && !SQL.includes('burden =') && !SQL.includes('guardian =') && !SQL.includes('sent ='), 'リンク・利用料・保護者・送信済みは代入しない');

await db.exec(`
do $$ begin
  create role anon nologin;
  create role authenticated nologin;
exception when duplicate_object then null;
end $$;
create table public.leo_meal_record (
  day date not null,
  child text not null,
  meal text,
  snack text,
  snack_yen integer check (snack_yen is null or snack_yen >= 0),
  primary key (day, child)
);
create table public.leo_jippi (
  ym text not null,
  child text not null,
  guardian text,
  lunch int not null default 0 check (lunch >= 0),
  snack int not null default 0 check (snack >= 0),
  burden int not null default 0 check (burden >= 0),
  pay_link text,
  pay_link_amount int,
  sent boolean not null default false,
  sent_at timestamptz,
  note text,
  imported_at timestamptz not null default now(),
  primary key (ym, child)
);
create table public.leo_jippi_day (
  day date not null,
  child text not null,
  ym text not null,
  lunch integer not null default 0 check (lunch >= 0),
  snack integer not null default 0 check (snack >= 0),
  imported_at timestamptz not null default now(),
  primary key (day, child),
  check (to_char(day, 'YYYY-MM') = ym)
);
alter table public.leo_jippi enable row level security;
alter table public.leo_jippi_day enable row level security;
grant select, insert, update, delete on public.leo_meal_record to authenticated;
`);
await db.exec(SQL);
await db.exec(SQL);
ok(true, 'sql を2回流しても壊れない');
ok((await db.query('select leo_jippi_lunch_unit() n')).rows[0].n === 300, '昼食代は300円');

await db.exec(`
insert into leo_jippi (ym, child, guardian, lunch, snack, burden, pay_link, pay_link_amount, sent, note)
values ('2026-11', '見本A', '保護者A', 900, 900, 4600, 'https://square.link/u/old', 6400, true, 'メモ');
`);
await db.exec(`set role authenticated`);
await db.exec(`insert into leo_meal_record (day, child, meal, snack, snack_yen) values ('2026-11-02', '見本A', 'あり', 'あり', 150)`);
await db.exec(`reset role`);

const day = async () => (await db.query(`select day::text, child, ym, lunch, snack from leo_jippi_day order by day, child`)).rows;
const mon = async (child) => (await db.query(`select lunch, snack, burden, pay_link, pay_link_amount, sent, guardian, note from leo_jippi where child = $1`, [child])).rows[0];
let days = await day();
ok(days.length === 1 && days[0].lunch === 300 && days[0].snack === 150 && days[0].ym === '2026-11', 'ありの日は昼食300・おやつは入力額', JSON.stringify(days));
let m = await mon('見本A');
ok(m.lunch === 300 && m.snack === 150 && m.burden === 4600 && m.pay_link === 'https://square.link/u/old' && m.pay_link_amount === 6400 && m.sent === true && m.guardian === '保護者A' && m.note === 'メモ', '月合計は日別の合計。リンクと利用料はそのまま', JSON.stringify(m));

await db.exec(`update leo_meal_record set snack_yen = 200 where day = '2026-11-02' and child = '見本A'`);
days = await day();
ok(days.length === 1 && days[0].snack === 200 && days[0].lunch === 300, '金額を直すと行は増えず上書き', JSON.stringify(days));
m = await mon('見本A');
ok(m.snack === 200 && m.pay_link_amount === 6400, '月のおやつ代も上書き。リンクの記録額は変えない', JSON.stringify(m));

await db.exec(`insert into leo_meal_record (day, child, meal, snack, snack_yen) values ('2026-11-03', '見本A', 'あり', 'なし', 80)`);
m = await mon('見本A');
ok(m.lunch === 600 && m.snack === 200, '月合計は日の足し算。なしのおやつ金額は使わない', JSON.stringify(m));
ok((await day()).length === 2, '日は2行');

await db.exec(`update leo_meal_record set meal = 'なし', snack = 'なし', snack_yen = null where day = '2026-11-02'`);
days = await day();
ok(days.length === 1 && days[0].day === '2026-11-03' && days[0].lunch === 300 && days[0].snack === 0, 'なしにするとその日は消える', JSON.stringify(days));
m = await mon('見本A');
ok(m.lunch === 300 && m.snack === 0 && m.burden === 4600 && m.sent === true, '消した日の分だけ月合計が減る', JSON.stringify(m));

await db.exec(`update leo_meal_record set child = '見本B' where day = '2026-11-03' and child = '見本A'`);
days = await day();
ok(days.length === 1 && days[0].child === '見本B' && days[0].lunch === 300, '児童名を変えると古い日は残さない', JSON.stringify(days));
ok((await mon('見本A')).lunch === 0 && (await mon('見本A')).pay_link === 'https://square.link/u/old', '元の児童の月合計は0。リンクは残る');
ok((await mon('見本B')).lunch === 300 && (await mon('見本B')).snack === 0 && (await mon('見本B')).burden === 0 && (await mon('見本B')).pay_link == null, '新しい児童は合計だけ。リンクは作らない');

await db.exec(`delete from leo_meal_record where day = '2026-11-03'`);
ok((await day()).length === 0, '日誌の行を消すとその日の実費も消える');
ok((await mon('見本B')).lunch === 0 && (await mon('見本B')).snack === 0, '月合計は0のまま行は残る');

await db.exec(`set role anon`);
let denied = false;
try { await db.query(`select leo_jippi_sync_meal('2026-11-01', '見本A')`); } catch { denied = true; }
await db.exec(`reset role`);
ok(denied, '匿名からは直接呼べない');

await db.exec(BACK);
let gone = false;
try { await db.query('select leo_jippi_lunch_unit()'); } catch { gone = true; }
ok(gone, 'ロールバックで関数は消える');
await db.exec(`insert into leo_meal_record (day, child, meal, snack, snack_yen) values ('2026-11-04', '見本A', 'あり', 'あり', 40)`);
ok((await day()).length === 0, 'トリガーを外すと日誌を保存しても実費は増えない');
ok((await mon('見本A')).burden === 4600, 'ロールバックしても利用料は残る');

if (bad) { console.log(bad + ' NG'); process.exit(1); } else console.log('all ok');
