// 児童別表示の合計が、実績記録（leoChildMonth）と送迎・食事の既存ルールと一致すること。
// node tools/leo_jidobetsu_test.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const M = require('../leo_meal.js');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const leo = read('leo.js');
const between = (src, a, b) => src.slice(src.indexOf(a), src.indexOf(b));

// leo.js の isTrip と同じ式。ここを写して、画面側が別ルールになっていないことを見る。
const isTrip = d => !!d && !/送迎なし|保護者|なし/.test(d);
assert.ok(leo.includes('const isTrip = d => !!d && !/送迎なし|保護者|なし/.test(d)'));
['職員X', '齊藤連', '母の迎え'].forEach(n => assert.strictEqual(M.leoTripMark(n), isTrip(n), n));
['', '保護者', '送迎なし', 'なし', '保護者送迎'].forEach(n => assert.strictEqual(M.leoTripMark(n), false, n));
assert.strictEqual(M.LEO_LUNCH_YEN, 300);
assert.ok(read('supabase/leo_jippi_from_nikki.sql').includes('select 300'), '昼食は実費と同じ300円');

const month = '2026-11';
const useDays = [2, 3, 5, 6, 9, 10, 12];
const jisseki = [];
const nikki = [];
const meals = [];
useDays.forEach((n, i) => {
  const day = month + '-' + String(n).padStart(2, '0');
  const start = i % 2 ? '14:45:00' : '10:00';
  const end = i % 2 ? '17:00' : '13:00';
  jisseki.push({ day, child: '児童C', status: '出席', start_time: start, end_time: end, source: 'ポータル' });
  nikki.push({ day, child: '児童 C', kind: '利用', row_no: n, service: '児発', start_time: '09:00', end_time: '12:00', pick_driver: '職員X', drop_driver: '職員Y', meal: 'あり', snack: '' });
  meals.push({ day, child: '児童C', meal: 'あり', snack: 'なし', snack_yen: null, day_note: n === 5 ? '（見本）静かに過ごせた' : '' });
});
jisseki.push({ day: month + '-04', child: '児童C', status: '欠席', start_time: '10:00', end_time: '13:00', source: 'ポータル' });
nikki.push({ day: month + '-04', child: '児童C', kind: '欠席', row_no: 40, service: '児発', start_time: '10:00', end_time: '13:00', pick_driver: '職員X', drop_driver: '職員Y' });
jisseki.push({ day: '2026-10-31', child: '児童C', status: '出席', start_time: '10:00', end_time: '12:00' });
meals.push({ day: '2026-10-31', child: '児童C', meal: 'あり', snack: 'あり', snack_yen: 500, day_note: '' });
jisseki.push({ day: month + '-02', child: '児童A', status: '出席', start_time: '15:00', end_time: '17:30' });
nikki.push({ day: month + '-02', child: '児童A', kind: '利用', row_no: 2, service: '放デイ', pick_driver: '職員Y', drop_driver: '保護者', start_time: '15:00', end_time: '17:30' });
meals.push({ day: month + '-02', child: '児童A', meal: 'なし', snack: 'あり', snack_yen: '150', day_note: '' });
jisseki.push({ day: month + '-08', child: '児童A', status: '出席', start_time: '10:00', end_time: '12:00' });
nikki.push({ day: month + '-08', child: '児童A', kind: '利用', row_no: 8, service: '放デイ', pick_driver: '送迎なし', drop_driver: '送迎なし', start_time: '10:00', end_time: '12:00' });
meals.push({ day: month + '-08', child: '児童A', meal: 'あり', snack: 'なし', snack_yen: null, day_note: '' });

function expectFromJisseki(child, burden) {
  const base = M.leoChildMonth(child, month, jisseki, nikki, meals);
  let lunch = 0, snack = 0, pick = 0, drop = 0;
  base.days.forEach(d => {
    if (d.meal === 'あり') lunch += M.LEO_LUNCH_YEN;
    if (d.snack === 'あり') snack += Number(d.snack_yen || 0);
    if (d.status !== '欠席') {
      if (isTrip(d.pick_driver)) pick += 1;
      if (isTrip(d.drop_driver)) drop += 1;
    }
  });
  return { use: base.use, abs: base.abs, lunch, snack, pick, drop, burden, total: lunch + snack + burden, days: base.days };
}

const exp = expectFromJisseki('児童C', 2589);
assert.strictEqual(exp.use, 7);
assert.strictEqual(exp.abs, 1);
assert.strictEqual(exp.pick, 7);
assert.strictEqual(exp.drop, 7);
assert.strictEqual(exp.lunch, 2100);
assert.strictEqual(exp.snack, 0);
assert.strictEqual(exp.total, 4689);

const sheet = M.leoJidoBetsu('児童 C', month, jisseki, nikki, meals, { burden: 2589 });
assert.strictEqual(sheet.use, exp.use);
assert.strictEqual(sheet.abs, exp.abs);
assert.strictEqual(sheet.pick, exp.pick);
assert.strictEqual(sheet.drop, exp.drop);
assert.strictEqual(sheet.lunch, exp.lunch);
assert.strictEqual(sheet.snack, exp.snack);
assert.strictEqual(sheet.burden, 2589);
assert.strictEqual(sheet.total, exp.total);
assert.strictEqual(sheet.era, '令和8年11月');
assert.strictEqual(sheet.days.length, exp.days.length);
sheet.days.forEach(d => {
  const src = exp.days.find(x => x.day === d.day);
  assert.ok(src, d.day);
  if (d.absent) {
    assert.strictEqual(d.start, '');
    assert.strictEqual(d.end, '');
    assert.strictEqual(d.pick, false);
    assert.strictEqual(d.drop, false);
    assert.strictEqual(d.status, '欠席');
  } else {
    assert.strictEqual(d.start, M.leoJidoHm(src.start_time));
    assert.strictEqual(d.end, M.leoJidoHm(src.end_time));
    assert.notStrictEqual(d.start, '09:00', '時刻は実績記録（jisseki）を優先');
  }
});
assert.strictEqual(sheet.days.find(d => d.day === month + '-03').start, '14:45');
assert.strictEqual(sheet.days.find(d => d.day === month + '-02').start, '10:00');
assert.ok(!sheet.days.some(d => d.day.startsWith('2026-10')));

const other = expectFromJisseki('児童A', 1000);
const sheetA = M.leoJidoBetsu('児童A', month, jisseki, nikki, meals, { burden: '1000' });
assert.strictEqual(sheetA.use, other.use);
assert.strictEqual(sheetA.abs, other.abs);
assert.strictEqual(sheetA.pick, 1, '保護者・送迎なしは送迎に数えない');
assert.strictEqual(sheetA.drop, 0);
assert.strictEqual(sheetA.lunch, 300);
assert.strictEqual(sheetA.snack, 150);
assert.strictEqual(sheetA.total, other.total);
assert.notStrictEqual(sheetA.total, sheet.total, '児童を変えると合計が変わる');
assert.notStrictEqual(sheetA.use, sheet.use);

const html = M.leoJidoHtml({ month, child: '児童C', names: ['児童A', '児童C'], service: '児童発達支援', sheet });
const attrs = {};
html.replace(/data-(use|abs|pick|drop|lunch|snack|burden|total)="(\d+)"/g, (_, k, n) => { attrs[k] = Number(n); return _; });
assert.deepStrictEqual(attrs, { use: sheet.use, abs: sheet.abs, pick: sheet.pick, drop: sheet.drop, lunch: sheet.lunch, snack: sheet.snack, burden: sheet.burden, total: sheet.total });
assert.ok(html.includes('サービス提供実績のご確認　レオ'));
assert.ok(html.includes('class="jd-bar"'));
assert.ok(html.includes('令和8年11月'));
assert.ok(html.includes('児童発達支援'));
assert.ok(html.includes('ご利用日数') && html.includes('<b>7日</b>'));
assert.ok(html.includes('欠席') && html.includes('<b>1日</b>'));
assert.ok(html.includes('行き <b>7回</b>'));
assert.ok(html.includes('帰り <b>7回</b>'));
assert.ok(html.includes('2,100円'));
assert.ok(html.includes('0円'));
assert.ok(html.includes('2,589円'));
assert.ok(html.includes('class="jd-total">4,689円') || html.includes('jd-total">4,689円'));
assert.ok(!html.includes('内容に相違がないかご確認ください'), '確認の注釈は出さない');
assert.ok(html.includes('jd-child"><select'), 'お子さまのマスが児童の選択');
assert.ok(html.includes('<th>送迎（行き）</th>') && html.includes('<th>備考</th>'));
assert.ok(html.includes('11月2日') && html.includes('300円'));
assert.ok(html.includes('jd-abs'));
const absRow = html.split('<tr class="jd-abs">')[1].split('</tr>')[0];
assert.ok(absRow.includes('欠席') && absRow.includes('11月4日'));
assert.ok(!absRow.includes(':'), '欠席の行に時刻を出さない');
assert.ok(!absRow.includes('○') && !absRow.includes('送迎'), '欠席の行に送迎を出さない');
assert.ok(!html.includes('kakunin'));
assert.ok(!html.includes('leo_confirm'));
const htmlA = M.leoJidoHtml({ month, child: '児童A', names: ['児童A', '児童C'], service: '放課後等デイサービス', sheet: sheetA });
assert.ok(htmlA.includes('1,450円'));
assert.ok(htmlA.includes('放課後等デイサービス'));
assert.ok(!htmlA.includes('4,689円'));

const view = between(leo, 'LEO_VIEWS.jidobetsu', '// 保護者の実績・実費の確認');
assert.ok(view.includes('leoLoadJissekiMonth'), '実績記録と同じ読み込み');
assert.ok(view.includes('leoJidoBetsu'));
assert.ok(view.includes('filingTripDrivers'));
assert.ok(view.includes('leo_jippi?ym='), '利用者負担は実費請求の金額');
assert.ok(!view.includes("status === '出席'"), '日数を画面側で数え直さない');
assert.ok(!view.includes('kakunin.html'));
assert.ok(!view.includes('leo_confirm'));
assert.ok(between(leo, 'async jisseki()', '// 保護者の実績・実費の確認').includes('leoLoadJissekiMonth'));
assert.ok(between(leo, 'async jisseki()', 'LEO_VIEWS.kakunin').includes('rpc/leo_record_span'));
assert.ok(leo.includes('href="#leo/jidobetsu"') && leo.includes('onclick="jdFromJisseki()"'), '実績記録に入口');
assert.ok(read('leo_jissekihyo.js').includes('href="#leo/jidobetsu"'));
assert.ok(!read('kakunin.html').includes('jidobetsu'), '保護者ページは変えない');

global.window = {};
require('../config.js');
const office = global.window.PORTAL_CONFIG.offices.find(o => o.id === 'leo');
const tile = office.tiles.find(t => t[1] === 'サービス提供実績記録');
assert.strictEqual(tile[2], '#leo/jidobetsu');
assert.strictEqual(tile[6], '児発管');
assert.ok(!office.tiles.some(t => t[1] === 'サービス提供実績記録' && t[2] !== '#leo/jidobetsu'), '同じ名前の別ボタンはない');
assert.ok(office.groups[1][2].includes('サービス提供実績記録'));
assert.ok(office.groups[1][2].indexOf('サービス提供実績記録') + 1 === office.groups[1][2].indexOf('実績記録（請求元）'), '請求元のとなり');
assert.ok(office.who[0][1].includes('サービス提供実績記録'), 'ホームは中村友香担当');
assert.ok(office.who[0][1].indexOf('サービス提供実績記録') < office.who[0][1].indexOf('受給者証の入力（保護者から）'));
assert.ok(office.who[1][1].includes('サービス提供実績記録表'), '事務担当の記録表はそのまま');
assert.strictEqual(office.who[1][1].filter(n => n === 'サービス提供実績記録').length, 0, '事務担当には同名の入口を置かない');
assert.ok(read('index.html').includes('leo.js?v=20261113calfix'));
assert.ok(read('index.html').includes('leo_meal.js?v=20261112sheet'));
assert.ok(read('index.html').includes('pc-scale.js?v=20261113cal'));
assert.ok(read('index.html').includes('config.js?v=20261112rec'));
assert.ok(leo.includes('>サービス提供実績記録</a>'), '実績記録の画面の上に入口');

console.log('leo_jidobetsu_test: ok');
