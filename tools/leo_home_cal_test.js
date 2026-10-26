// レオホームの月間カレンダーと日の時刻軸。node tools/leo_home_cal_test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const sandbox = { DEMO: false, console, setInterval() { return 0; } };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'leo_name.js'), 'utf8'), sandbox, { filename: 'leo_name.js' });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'leo_home_cal.js'), 'utf8'), sandbox, { filename: 'leo_home_cal.js' });

const { sgGrid, sgLayout, sgStaffPaint, sgMonthHtml, sgDayHtml, sgSplit, sgName, SG_STAFF_COLOR } = sandbox;

assert.strictEqual(sgName('山根\u3000一輝'), '山根 一輝');
assert.strictEqual(sgName('  山根  一輝 \n'), '山根 一輝');

const g = sgGrid('2026-10');
assert.strictEqual(g.start, '2026-09-28');
assert.strictEqual(g.end, '2026-11-01');

const laid = sgLayout([
  { id: 'a', start: 600, end: 840 },
  { id: 'b', start: 630, end: 680 },
  { id: 'c', start: 900, end: 960 },
]);
const byId = Object.fromEntries(laid.map(e => [e.id, e]));
assert.strictEqual(byId.a.col, 0);
assert.strictEqual(byId.b.col, 1);
assert.strictEqual(byId.a.cols, 2);
assert.strictEqual(byId.c.col, 0);
assert.strictEqual(byId.c.cols, 1, '重ならない予定は幅いっぱい');

const paint = sgStaffPaint('山田\u3000太郎');
assert.strictEqual(paint.mapped, false);
assert.strictEqual(paint.hex, '#616161');
SG_STAFF_COLOR['山田 太郎'] = 7;
const hit = sgStaffPaint('山田\u3000太郎');
assert.strictEqual(hit.mapped, true);
assert.strictEqual(hit.hex, '#039be5');
assert.strictEqual(hit.ink, '#fff');
delete SG_STAFF_COLOR['山田 太郎'];
assert.strictEqual(sgStaffPaint('職員X', { demo: true }).hex, '#039be5');
assert.strictEqual(sgStaffPaint('職員Y', { demo: true }).hex, '#f4511e');

const evs = [
  { day: '2026-10-26', kind: '利用', child: '山根\u3000一輝', start_time: '10:30', end_time: '14:30' },
  { day: '2026-10-26', kind: '利用', child: '児童B', start_time: '15:50', end_time: '17:00' },
  { day: '2026-10-26', kind: '利用', child: '児童C', start_time: '16:15', end_time: '17:00' },
  { day: '2026-10-26', kind: '迎え', staff: '職員X', kids: ['山根\u3000一輝'], start_time: '10:10', end_time: '10:40', kid_places: { '山根\u3000一輝': '下野小学校' }, kid_times: { '山根\u3000一輝': '10:20' } },
  { day: '2026-10-26', kind: '送り', staff: '職員Y', kids: ['児童B'], start_time: '17:00', end_time: '17:30', kid_places: { '児童B': '自宅' } },
  { day: '2026-10-26', kind: '休み', child: '児童D' },
  { day: '2026-10-24', kind: '休所', title: '土曜日' },
  { day: '2026-10-27', kind: '迎え', staff: '', kids: ['児童C'], start_time: '', end_time: '' },
];
const month = sgMonthHtml('2026-10', evs, '2026-10-26');
assert.ok(month.includes('2026年10月'), '月の見出し');
assert.ok(month.includes("sgOpenDay('2026-10-26')"), '日を開ける');
assert.ok(month.includes('>26</b>'), '今日の日付');
assert.ok(month.includes('3人'), '利用人数');
assert.ok(month.includes('class="sub off">休'), '休所');
assert.ok(month.includes('class="today"'), '今日の印');
assert.ok(!month.includes('毎日やる'), 'ホームのボタンはカレンダーに含めない');

const { allDay, timed } = sgSplit(evs.filter(e => e.day === '2026-10-26'));
assert.ok(allDay.some(e => e.kind === '休み'));
assert.ok(timed.every(e => e.kind !== '休み' && e.e));
assert.ok(timed.some(e => e.e.kind === '迎え' && e.col !== timed.find(x => x.e.kind === '利用' && x.e.child.startsWith('山根')).col), '重なる迎えと利用は別の列');

const day = sgDayHtml('2026-10-26', evs, { '山根一輝': '助手席' }, { demo: true, today: '2026-10-26', nowMin: 13 * 60 + 40 });
assert.ok(day.includes('山根 一輝'), '半角スペースの氏名');
assert.ok(day.includes('下野小学校'));
assert.ok(day.includes('#039be5'), '職員Xは Peacock');
assert.ok(day.includes('#f4511e'), '職員Yは Tangerine');
assert.ok(day.includes('☆ 迎え'));
assert.ok(day.includes('★ 送り'));
assert.ok(day.includes('data-sg-now'), '今日は現在時刻の線');
assert.ok(day.includes('終日'));
assert.ok(day.includes('児童D'));
assert.ok(day.includes('sg-ev neutral'), '利用は担当色にしない');
assert.ok(day.includes('class="sg-ev drop"') || day.includes('sg-ev drop'), '送りは下線で区別');

const bare = sgDayHtml('2026-10-27', evs, {}, { demo: false, today: '2026-10-26' });
assert.ok(bare.includes('終日'), '時刻のない予定は終日');
assert.ok(bare.includes('未定'));
assert.ok(!bare.includes('data-sg-now'), '今日以外に現在時刻の線は出さない');

console.log('leo_home_cal_test ok');
