// 食事提供・総合日誌・児童別の月次実績。node tools/leo_meal_test.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const M = require('../leo_meal.js');

assert.strictEqual(M.leoMealFlag('あり'), 'あり');
assert.strictEqual(M.leoMealFlag('なし'), 'なし');
assert.strictEqual(M.leoMealFlag('無し'), 'なし');
assert.strictEqual(M.leoMealFlag('○'), 'あり');
assert.strictEqual(M.leoMealFlag('190'), '');
assert.strictEqual(M.leoMealFlag('１４５'), '');
assert.strictEqual(M.leoMealFlag('145円'), '');
assert.strictEqual(M.leoMealFlag(''), '');
assert.strictEqual(M.leoMealPrefill('', 'あり'), 'あり');
assert.strictEqual(M.leoMealPrefill('なし', 'あり'), 'なし');
assert.strictEqual(M.leoMealPrefill('', '190'), '');

const menu = M.leoDayLogBody({ meal_menu: ' 白米、餃子 ', notes: '午後はホール' });
assert.deepStrictEqual(menu.err, []);
assert.strictEqual(menu.body.meal_menu, '白米、餃子');
assert.strictEqual(menu.body.notes, '午後はホール');
assert.ok(M.leoDayLogBody({ meal_menu: 'あ'.repeat(501), notes: '' }).err.length);

const meal = M.leoMealBody({ meal: 'あり', snack: '', meal_note: '皮を6枚' });
assert.deepStrictEqual(meal.err, []);
assert.strictEqual(meal.body.meal, 'あり');
assert.strictEqual(meal.body.snack, null);
assert.strictEqual(meal.body.meal_note, '皮を6枚');
assert.ok(!('day_note' in meal.body), '日誌の保存は日次メモを消さない');
assert.ok(M.leoMealBody({ meal: '190', snack: 'あり', meal_note: '' }).err.length);
const day = M.leoMealBody({ meal: 'なし', snack: 'あり', meal_note: '', day_note: '静かに過ごせた' });
assert.strictEqual(day.body.day_note, '静かに過ごせた');

const month = '2026-11';
const jisseki = [
  { day: '2026-11-02', child: '児童A', status: '出席', start_time: '14:45', end_time: '17:00', source: 'ポータル' },
  { day: '2026-11-03', child: '児童A', status: '欠席', start_time: '', end_time: '', source: 'ポータル' },
  { day: '2026-11-02', child: '児童B', status: '出席', start_time: '15:00', end_time: '17:30', source: 'ポータル' },
  { day: '2026-10-31', child: '児童A', status: '出席', start_time: '10:00', end_time: '12:00', source: 'ポータル' },
];
const nikki = [
  { day: '2026-11-02', child: '児童 A', kind: '利用', row_no: 9, service: '放デイ', start_time: '14:45', end_time: '17:00', pick_driver: '職員X', drop_driver: '職員Y', meal: 'あり', snack: '190', activity: '公園' },
  { day: '2026-11-03', child: '児童A', kind: '欠席', row_no: 20 },
];
const meals = [
  { day: '2026-11-02', child: '児童A', meal: 'あり', snack: 'なし', meal_note: '餃子', day_note: 'にこにこ' },
  { day: '2026-11-02', child: '児童B', meal: 'なし', snack: '', meal_note: '', day_note: '' },
];
const names = M.leoJissekiChildren(month, jisseki, nikki);
assert.deepStrictEqual(names, ['児童 A', '児童B']);
const a = M.leoChildMonth('児童A', month, jisseki, nikki, meals);
assert.strictEqual(a.days.length, 2);
assert.strictEqual(a.use, 1);
assert.strictEqual(a.abs, 1);
assert.strictEqual(a.days[0].day, '2026-11-02');
assert.strictEqual(a.days[0].meal, 'あり');
assert.strictEqual(a.days[0].meal_note, '餃子');
assert.strictEqual(a.days[0].sheet_snack, '190');
assert.strictEqual(a.days[0].row_no, 9);
assert.strictEqual(a.days[0].pick_driver, '職員X');
assert.ok(!a.days.some(d => d.day.startsWith('2026-10')), '他の月は出さない');
const b = M.leoChildMonth('児童B', month, jisseki, nikki, meals);
assert.strictEqual(b.days.length, 1);
assert.strictEqual(b.days[0].meal, 'なし');
assert.ok(!b.days[0].activity);

const root = path.join(__dirname, '..');
const leo = fs.readFileSync(path.join(root, 'leo.js'), 'utf8');
const sql = fs.readFileSync(path.join(root, 'supabase/leo_meal_log.sql'), 'utf8');
const flow = fs.readFileSync(path.join(root, 'supabase/leo_record_flow.sql'), 'utf8');
assert.ok(leo.includes('leoDayLogHtml'));
assert.ok(leo.includes('data-kind="meal"'));
assert.ok(leo.includes("i.dataset.kind === 'meal'"));
assert.ok(!flow.includes('leo_meal_record'), '予定→実績の関数は食事記録を触らない');
assert.ok(!flow.includes('leo_day_log'));
assert.ok(sql.includes("meal in ('あり', 'なし')"));
assert.ok(leo.includes('rpc/leo_record_span'));
assert.ok(leo.includes('rpc/leo_nikki_apply'));
assert.ok(leo.includes('JIS_CHILD'));
assert.ok(!leo.includes('<th>日付</th><th>児童</th>'), '全員を1枚の表に並べない');

console.log('leo_meal_test: ok');
