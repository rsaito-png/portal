// 三重県の勤務実績。node tools/leo_kinmu_test.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const K = new Function(fs.readFileSync(path.join(__dirname, '..', 'leo_kinmu_lib.js'), 'utf8') + '\nreturn KinmuLib;')();

assert.strictEqual(K.reiwa('2026-11'), '令和8年11月分の勤務実績及び利用者の実績表');
assert.strictEqual(K.norm('9:00'), '09:00');
assert.strictEqual(K.hoursNorm('3:00'), '3:00');
assert.strictEqual(K.spanHours('10:00', '18:00'), '8:00');
assert.strictEqual(K.spanHours('11:00', '14:30'), '3:30');
assert.strictEqual(K.spanHours('14:00', '17:00'), '3:00');

const roster = K.seedRoster();
const by = (name, job) => roster.find(l => l.name === name && l.job === job);
assert.strictEqual(K.patternWeekMinutes(by('中村文', '指導')), 15 * 60, '文は週15時間');
assert.ok(K.patternWeekMinutes(by('中村文', '指導')) * 4 < K.FUMI_MONTH_MIN, '週15時間は月の枠の内側');
assert.strictEqual(K.FUMI_WEEK_LABEL.includes('16.2'), true);
assert.ok(!JSON.stringify(roster).includes('11.5'), '11.5時間上限は使わない');
assert.ok(!JSON.stringify(roster).includes('1600'), '1,600円換算は使わない');
assert.deepStrictEqual(by('安藤尚子', '指導').week[4], ['11:00', '14:00'], '木曜の安藤');
assert.strictEqual(by('安藤尚子', '指導').week[3], undefined, '水曜の安藤はなし');
assert.deepStrictEqual(by('安藤尚子', '指導').week[5], ['11:00', '14:30']);
assert.deepStrictEqual(by('加藤幸弘', '指導').week[3], ['11:00', '14:00']);
assert.strictEqual(Object.keys(by('加藤幸弘', '指導').week).join(','), '3');
[1, 2, 3, 4, 5].forEach(wd => {
  assert.deepStrictEqual(by('齊藤連', '管理').week[wd], ['10:00', '18:00'], '齊藤は水も含め月〜金');
  assert.deepStrictEqual(by('齊藤連', '児管').week[wd], ['10:00', '18:00']);
  assert.deepStrictEqual(by('中村友香', '保育').week[wd], ['10:00', '18:00']);
  assert.deepStrictEqual(by('中村文', '指導').week[wd], ['14:00', '17:00']);
});
assert.strictEqual(by('中村友香', '保育').cls, 'A');
assert.strictEqual(by('中村友香', '保育').qual, '保育士');
assert.strictEqual(by('齊藤連', '管理').cls, 'B');
assert.strictEqual(by('安藤尚子', '指導').cls, 'C');

const lines = K.monthLines('2026-11');
const days = K.daysOf('2026-11');
const cell = (name, job, dow) => {
  const day = days.find(d => d.dow === dow).day;
  return lines.find(l => l.name === name && l.job === job).cells[day];
};
assert.deepStrictEqual(cell('安藤尚子', '指導', '月'), { start: '11:00', end: '14:00', hours: '3:00' });
assert.deepStrictEqual(cell('中村文', '指導', '月'), { start: '14:00', end: '17:00', hours: '3:00' });
assert.deepStrictEqual(cell('安藤尚子', '指導', '木'), { start: '11:00', end: '14:00', hours: '3:00' });
assert.deepStrictEqual(cell('中村文', '指導', '木'), { start: '14:00', end: '17:00', hours: '3:00' });
assert.deepStrictEqual(cell('加藤幸弘', '指導', '水'), { start: '11:00', end: '14:00', hours: '3:00' });
assert.deepStrictEqual(cell('安藤尚子', '指導', '水'), { start: '', end: '', hours: '' });
assert.deepStrictEqual(cell('齊藤連', '管理', '水'), { start: '10:00', end: '18:00', hours: '8:00' });
assert.deepStrictEqual(cell('齊藤連', '児管', '水'), { start: '10:00', end: '18:00', hours: '8:00' });
assert.deepStrictEqual(cell('中村友香', '保育', '水'), { start: '10:00', end: '18:00', hours: '8:00' });
assert.deepStrictEqual(cell('安藤尚子', '指導', '金'), { start: '11:00', end: '14:30', hours: '3:30' });
assert.deepStrictEqual(cell('中村文', '指導', '金'), { start: '14:00', end: '17:00', hours: '3:00' });
assert.deepStrictEqual(cell('中村文', '指導', '土'), { start: '', end: '', hours: '' });
assert.deepStrictEqual(cell('齊藤連', '管理', '日'), { start: '', end: '', hours: '' });

const fumi = lines.find(l => l.name === '中村文');
const weekdays = days.filter(d => d.wd >= 1 && d.wd <= 5);
assert.strictEqual(weekdays.filter(d => fumi.cells[d.day].hours === '3:00').length, weekdays.length, '文は平日すべて3時間。短い日で削らない');
assert.ok(K.lineMinutes(fumi) <= K.FUMI_MONTH_MIN, '2026-11の文は月の枠以内');
assert.strictEqual(K.lineMinutes(fumi), weekdays.length * 180);

const bad = JSON.parse(JSON.stringify(lines));
bad[0].cells[1] = { start: '18:00', end: '10:00', hours: '' };
assert.ok(K.validate(bad, '2026-11').includes('後'));
assert.strictEqual(K.validate(lines, '2026-11'), '');

const counted = K.tallyNikki([
  { day: '2026-11-02', child: '児童A', service: '児発', kind: '利用' },
  { day: '2026-11-02', child: '児童A', service: '児発', kind: '利用' },
  { day: '2026-11-02', child: '児童 B', service: '児発', kind: '利用' },
  { day: '2026-11-02', child: '児童C', service: '放デイ', kind: '利用' },
  { day: '2026-11-02', child: '児童D', service: '', kind: '利用' },
  { day: '2026-11-03', child: '児童A', service: '児発', kind: '欠席' },
], 'jido');
assert.strictEqual(counted[2], 2);
assert.strictEqual(counted[3], undefined);

const rec = K.tallyRecords([
  { service_date: '2026-11-04', user_id: 'u1' },
  { service_date: '2026-11-04', user_id: 'u1' },
  { service_date: '2026-11-04', user_id: 'u2' },
]);
assert.strictEqual(rec[4], 2);

const model = K.sheetModel('2026-11', 'jido', lines, { 2: 4 });
const csv = K.csvOf(model);
assert.ok(csv.charCodeAt(0) === 0xFEFF);
assert.ok(csv.includes('令和8年11月分の勤務実績及び利用者の実績表'));
assert.ok(csv.includes('利用者数'));
assert.ok(csv.includes('中村文'));
assert.ok(csv.includes('14:00'));
const html = K.sheetHtml(model);
assert.ok(html.includes('利用者数') && html.includes('rowspan="3"') && html.includes('生活') === false);
assert.ok(html.includes('児童発達支援'));
assert.strictEqual(K.sheetModel('2026-11', 'seikatsu', lines, {}).officeName, '茶夢');

const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const cfg = fs.readFileSync(path.join(__dirname, '..', 'config.js'), 'utf8');
const chamu = fs.readFileSync(path.join(__dirname, '..', 'chamu.js'), 'utf8');
const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'kinmu.sql'), 'utf8');
assert.ok(index.includes('leo_kinmu.js?v=20261102kinmu'));
assert.ok(index.includes("sub === 'kinmu'"));
assert.ok(fs.readFileSync(path.join(__dirname, '..', 'leo.js'), 'utf8').includes("name === 'kinmu'"));
assert.ok(cfg.includes("#leo/kinmu") && cfg.includes("#chamu/kinmu"));
assert.ok(cfg.includes('勤務実績及び利用者の実績表'));
assert.ok(chamu.includes("sub === 'kinmu'") && chamu.includes("['kinmu', '勤務実績']"));
assert.ok(sql.includes('enable row level security'));
assert.ok(sql.includes('kinmu_can_read') && sql.includes('kinmu_can_write'));
assert.ok(sql.includes("my_office() in ('レオ', '茶夢')"));
assert.ok(!sql.includes('中村文'), '実名の初期行はSQLに置かない');

console.log('leo_kinmu_test ok');
