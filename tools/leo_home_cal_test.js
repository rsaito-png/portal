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

const { sgGrid, sgLayout, sgStaffPaint, sgStaffShow, sgMonthHtml, sgDayHtml, sgSplit, sgName, SG_STAFF_COLOR } = sandbox;

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
assert.strictEqual(paint.hex, '#d50000', '一覧に無い担当は赤');
SG_STAFF_COLOR['山田 太郎'] = 7;
const hit = sgStaffPaint('山田\u3000太郎');
assert.strictEqual(hit.mapped, true);
assert.strictEqual(hit.hex, '#039be5');
assert.strictEqual(hit.ink, '#fff');
delete SG_STAFF_COLOR['山田 太郎'];
assert.strictEqual(sgStaffPaint('職員X', { demo: true }).hex, '#039be5');
assert.strictEqual(sgStaffPaint('職員Y', { demo: true }).hex, '#f4511e');

const staffHex = {
  'れん': '#1a237e', '連': '#1a237e', 'れん先生': '#1a237e', '齊藤　連': '#1a237e', '斎藤連': '#1a237e', '斉藤 連': '#1a237e', '齋藤連': '#1a237e', '山田連': '#1a237e',
  'ゆか': '#33b679', 'ゆか先生': '#33b679', '友香': '#33b679', '鈴木　友香': '#33b679',
  'あや': '#8e24aa', 'あやさん': '#8e24aa',
  'さち': '#e67c73', 'さち先生': '#e67c73', '祥': '#e67c73', '鈴木祥': '#e67c73',
  'なお': '#7986cb', 'なお先生': '#7986cb', '尚': '#7986cb', '尚先生': '#7986cb',
  '宮本': '#d81b60', '宮本さん': '#d81b60', '宮本　花': '#d81b60',
  '加藤': '#4fc3f7', '加藤先生': '#4fc3f7', '加藤　花': '#4fc3f7',
};
for (const [name, hex] of Object.entries(staffHex)) {
  const p = sgStaffPaint(name);
  assert.strictEqual(p.hex, hex, name);
  assert.strictEqual(p.mapped, true, name);
}
assert.strictEqual(sgStaffPaint('連先生').ink, '#fff', '紺は白い文字');
assert.notStrictEqual(sgStaffPaint('尚先生').hex, sgStaffPaint('連先生').hex);
assert.notStrictEqual(sgStaffPaint('加藤先生').hex, sgStaffPaint('連先生').hex);
assert.strictEqual(sgStaffShow('斉藤　連'), '連先生');
assert.strictEqual(sgStaffShow('れん'), '連先生');
assert.strictEqual(sgStaffShow('ゆか'), '友香先生');
assert.strictEqual(sgStaffShow('友香'), '友香先生');
assert.strictEqual(sgStaffShow('さち'), '祥先生');
assert.strictEqual(sgStaffShow('祥'), '祥先生');
assert.strictEqual(sgStaffShow('なお先生'), '尚先生');
assert.strictEqual(sgStaffShow('尚'), '尚先生');
assert.strictEqual(sgStaffShow('あや'), 'あや', 'あやは漢字にしない');
assert.strictEqual(sgStaffShow('あや先生'), 'あや先生');
assert.strictEqual(sgStaffPaint('加藤先生').ink, '#222', '水色は暗い文字');
assert.strictEqual(sgStaffPaint('宮本さん').ink, '#fff', 'ピンクは白い文字');
assert.strictEqual(sgStaffPaint('加藤 湊').mapped, false, '児童の加藤湊は担当でも加藤先生にしない');
assert.strictEqual(sgStaffPaint('加藤湊').hex, '#d50000');
assert.strictEqual(sgStaffPaint('加藤みなと').mapped, false);

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
assert.ok(month.includes('sub use'), '利用人数は山吹色');
assert.ok(month.includes('background:#f8b500') && month.includes('.sub.use{color:#222'), '人数は黄地に黒文字');
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
assert.ok(/background:#f8b500;color:#222/.test(day), '利用児童は山吹色に黒文字');
assert.ok(day.includes('#f4511e'), '見本の職員Yは Tangerine のまま');
assert.ok(day.includes('利用児童'));
assert.ok(!day.includes('sg-ev neutral'), '時刻のある利用は山吹色');
assert.ok(day.includes('☆ 迎え'));
assert.ok(day.includes('★ 送り'));
assert.ok(day.includes("sgOpenMonth('2026-10-26')"), '表示中の日の月を開く');
assert.ok(/月<\/button><button type="button" onclick="sgOpenDay\(/.test(day), '月は今日のとなり');
assert.ok(day.includes('data-sg-now'), '今日は現在時刻の線');
assert.ok(day.includes('終日'));
assert.ok(day.includes('児童D'));
assert.ok(day.includes('class="sg-ev drop"') || day.includes('sg-ev drop'), '送りは下線で区別');

const named = [
  { day: '2026-10-26', kind: '利用', child: '加藤 湊', start_time: '10:00', end_time: '12:00' },
  { day: '2026-10-26', kind: '迎え', staff: '加藤先生', kids: ['加藤 湊'], start_time: '09:40', end_time: '10:10', kid_places: { '加藤 湊': '小学校' } },
  { day: '2026-10-26', kind: '迎え', staff: '斉藤　連', kids: ['児童A'], start_time: '10:10', end_time: '10:40' },
  { day: '2026-10-26', kind: '送り', staff: 'れん', kids: ['児童A'], start_time: '10:45', end_time: '11:10' },
  { day: '2026-10-26', kind: '送り', staff: 'ゆか', kids: ['児童B'], start_time: '12:10', end_time: '12:40' },
  { day: '2026-10-26', kind: '送り', staff: 'あや先生', kids: ['児童C'], start_time: '13:00', end_time: '13:30' },
  { day: '2026-10-26', kind: '迎え', staff: 'さち', kids: ['児童D'], start_time: '14:00', end_time: '14:30' },
  { day: '2026-10-26', kind: '送り', staff: 'なお先生', kids: ['児童E'], start_time: '15:00', end_time: '15:30' },
  { day: '2026-10-26', kind: '迎え', staff: '宮本さん', kids: ['児童F'], start_time: '16:00', end_time: '16:30' },
  { day: '2026-10-26', kind: '送り', staff: '外部の人', kids: ['児童G'], start_time: '17:00', end_time: '17:30' },
];
const colored = sgDayHtml('2026-10-26', named, {}, { demo: false, today: '2026-10-27' });
assert.ok(colored.includes('#f8b500') && colored.includes('加藤 湊'), '加藤湊の利用は山吹色');
assert.ok(colored.includes('#4fc3f7'), '加藤先生の送迎は水色');
assert.ok(colored.includes('#1a237e') && colored.includes('#33b679') && colored.includes('#8e24aa'));
assert.ok(colored.includes('#e67c73') && colored.includes('#7986cb') && colored.includes('#d81b60'));
assert.ok(colored.includes('連先生') && colored.includes('友香先生') && colored.includes('祥先生') && colored.includes('尚先生'));
assert.ok(!colored.includes('斉藤'), '斉藤　連は連先生と出す');
assert.ok(!colored.includes('ゆか'), 'ゆかは友香先生と出す');
const legend = colored.slice(colored.indexOf('class="sg-leg"'), colored.indexOf('class="sg-cal"'));
assert.strictEqual((legend.match(/連先生/g) || []).length, 1, 'れんの表記ゆれは凡例で1つ');
assert.ok(colored.includes('#d50000') && colored.includes('その他'), '一覧外の担当は赤');
const useBlock = colored.match(/<div class="sg-ev[^"]*" style="[^"]*background:(#[0-9a-f]{6});color:(#[0-9a-f]{3,6})[^"]*" title="利用[^"]*加藤 湊/);
assert.ok(useBlock && useBlock[1] === '#f8b500' && useBlock[2] === '#222', '利用は山吹色に黒文字');
const ride = colored.match(/<div class="sg-ev[^"]*" style="[^"]*background:(#[0-9a-f]{6})[^"]*" title="[^"]*加藤先生"/);
assert.ok(ride && ride[1] === '#4fc3f7', '担当が加藤先生の送迎だけ水色');

const nov = sgDayHtml('2026-11-17', [], {}, { demo: false, today: '2026-10-26' });
assert.ok(nov.includes("sgOpenMonth('2026-11-17')"), '11月17日の月ボタンはその日');
assert.ok(nov.includes('11/17（火）'));
vm.runInContext(`
  location = { _h: '#leo/day/2026-11-17', get hash() { return this._h; }, set hash(v) { this._h = String(v).charAt(0) === '#' ? String(v) : '#' + v; } };
  SG_HOME_MONTH = '2026-10';
  sgOpenMonth('2026-11-17');
  if (SG_HOME_MONTH !== '2026-11') throw new Error('month ' + SG_HOME_MONTH);
  if (location.hash !== '#leo') throw new Error('hash ' + location.hash);
  sgOpenMonth('bad');
  if (SG_HOME_MONTH !== '2026-11') throw new Error('bad date changed month');
  globalThis.__home = 0;
  leoHomeCal = () => { __home += 1; };
  sgOpenMonth('2026-11-17');
  if (location.hash !== '#leo' || __home !== 1 || SG_HOME_MONTH !== '2026-11') throw new Error('redraw ' + __home + ' ' + SG_HOME_MONTH);
`, sandbox);

const bare = sgDayHtml('2026-10-27', evs, {}, { demo: false, today: '2026-10-26' });
assert.ok(bare.includes('終日'), '時刻のない予定は終日');
assert.ok(bare.includes('未定'));
assert.ok(!bare.includes('data-sg-now'), '今日以外に現在時刻の線は出さない');

console.log('leo_home_cal_test ok');
