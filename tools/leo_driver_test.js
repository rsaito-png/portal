// 実運転名と届け出名（node tools/leo_driver_test.js）
// 送迎・予定・みんなの送迎・カレンダーは実運転名のまま。日誌・実績・配置の表示だけ写す。
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const D = require('../leo_driver.js');

assert.strictEqual(D.filingDriverName('横田祥', '2026-11-02'), '齊藤');
assert.strictEqual(D.filingDriverName('横田　祥', '2026-11-02'), '齊藤');
assert.strictEqual(D.filingDriverName(' 横田 祥 ', '2026-11-02'), '齊藤');
assert.strictEqual(D.filingDriverName('祥先生', '2026-11-02'), '齊藤');
assert.strictEqual(D.filingDriverName('祥　先生', '2026-11-02'), '齊藤');
assert.strictEqual(D.filingDriverName('齊藤'), '齊藤');
assert.strictEqual(D.filingDriverName('職員X'), '職員X');
assert.strictEqual(D.filingDriverName('送迎なし'), '送迎なし');
assert.strictEqual(D.filingDriverName('祥先生（代理）'), '祥先生（代理）');
assert.strictEqual(D.filingDriverName(''), '');
assert.strictEqual(D.filingDriverName(null), null);

// 宮本幸子（空白違い・呼び名）は届け出の齊藤連。短い名前も同じ届出名。
assert.strictEqual(D.filingDriverName('宮本幸子'), '齊藤連');
assert.strictEqual(D.filingDriverName('宮本　幸子'), '齊藤連');
assert.strictEqual(D.filingDriverName(' 宮本 幸子 '), '齊藤連');
assert.strictEqual(D.filingDriverName('宮本'), '齊藤連');
assert.strictEqual(D.filingDriverName('宮本さん'), '齊藤連');
assert.strictEqual(D.filingDriverName('宮本　さん'), '齊藤連');
assert.strictEqual(D.filingDriverName('安藤'), '安藤');
assert.strictEqual(D.filingDriverName('安藤尚子'), '安藤尚子');
assert.strictEqual(D.filingDriverName('安藤　尚子'), '安藤　尚子');
assert.strictEqual(D.filingDriverName('宮本幸子（代理）'), '宮本幸子（代理）');
assert.strictEqual(D.filingDriverName('齊藤　連'), '齊藤　連');

// 定例: 月曜朝・碧音くん迎え 10:20。運転は横田祥。2026-11-09 までは届け出の担当は齊藤、11-10 からは横田　祥のまま。
const mondayPick = { dow: '月', child: '碧音', time: '10:20', kind: '迎え', driver: '横田祥' };
assert.strictEqual(mondayPick.driver, '横田祥');
assert.strictEqual(D.filingDriverName(mondayPick.driver, '2026-11-09'), '齊藤');
assert.strictEqual(D.filingDriverName(mondayPick.driver, '2026-11-16'), '横田祥');
assert.deepStrictEqual(D.filingTripDrivers({ day: '2026-11-02', pick_driver: '横田祥', drop_driver: '職員Y' }), { pick: '齊藤', drop: '職員Y' });
// 2026-11-10 から横田はレオ職員。読み替えない
assert.deepStrictEqual(D.filingTripDrivers({ day: '2026-11-16', pick_driver: '横田　祥', drop_driver: '職員Y' }), { pick: '横田　祥', drop: '職員Y' });
assert.strictEqual(D.filingDriverName('横田祥'), '横田祥');
assert.strictEqual(D.filingDriverName('祥先生', '2026/11/10'), '祥先生');
assert.deepStrictEqual(D.filingTripDrivers({ day: '2026-10-30', pick_driver: '祥先生', drop_driver: '送迎なし' }), { pick: '齊藤', drop: '送迎なし' });
assert.deepStrictEqual(D.filingTripDrivers({ pick_driver: '宮本　幸子', drop_driver: '宮本さん' }), { pick: '齊藤連', drop: '齊藤連' });
assert.deepStrictEqual(D.filingTripDrivers({ day: '2026-11-09', pick_driver: '安藤　尚子', drop_driver: '横田祥' }), { pick: '安藤　尚子', drop: '齊藤' });

// 2026-11-10 から：今日の日誌では横田は横田のまま
assert.strictEqual(D.nikkiShownValue('pick_driver', '横田祥'), '横田祥');
assert.strictEqual(D.nikkiShownValue('drop_driver', '横田　祥'), '横田　祥');
assert.strictEqual(D.nikkiShownValue('pick_driver', '宮本　幸子'), '齊藤連');
assert.strictEqual(D.nikkiShownValue('drop_driver', '宮本さん'), '齊藤連');
assert.strictEqual(D.nikkiShownValue('pick_time', '10:20'), '10:20');
assert.strictEqual(D.nikkiShownValue('pick_place', '横田祥'), '横田祥');

// 画面が届け出名のままなら、日誌へは書き戻さない（シート上の実運転名を消さない）
assert.deepStrictEqual(D.nikkiEditValue('pick_driver', '横田祥', '齊藤'), { old_value: '横田祥', new_value: '齊藤' });
assert.strictEqual(D.nikkiEditValue('pick_driver', '横田祥', '横田祥'), null);
assert.deepStrictEqual(D.nikkiEditValue('pick_driver', '横田祥', '横田　祥'), { old_value: '横田祥', new_value: '横田　祥' });
assert.deepStrictEqual(D.nikkiEditValue('pick_driver', '横田祥', '山田'), { old_value: '横田祥', new_value: '山田' });
assert.strictEqual(D.nikkiEditValue('pick_driver', '宮本　幸子', '齊藤連'), null);
assert.strictEqual(D.nikkiEditValue('pick_driver', '宮本　幸子', '宮本幸子'), null);
assert.strictEqual(D.nikkiEditValue('drop_driver', '宮本さん', '齊藤連'), null);
assert.deepStrictEqual(D.nikkiEditValue('pick_driver', '宮本　幸子', '安藤尚子'), { old_value: '宮本　幸子', new_value: '安藤尚子' });
assert.deepStrictEqual(D.nikkiEditValue('pick_driver', '宮本　幸子', '山田'), { old_value: '宮本　幸子', new_value: '山田' });
assert.deepStrictEqual(D.nikkiEditValue('pick_time', '10:20', '10:25'), { old_value: '10:20', new_value: '10:25' });
assert.strictEqual(D.nikkiEditValue('pick_time', '10:20', '10:20'), null);

function between(src, a, b) {
  const i = src.indexOf(a);
  const j = src.indexOf(b, i + a.length);
  assert.ok(i >= 0 && j > i, a + ' .. ' + b);
  return src.slice(i, j);
}
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const leo = read('leo.js');
const cal = read('leo_cal.js');
const yotei = read('leo_yotei.js');
const index = read('index.html');

assert.ok(index.includes('leo_driver.js?v=20261110yokota'));
assert.ok(!cal.includes('filingDriverName'), 'カレンダーは写さない');
assert.ok(!yotei.includes('filingDriverName'), '予定の作成・自分の送迎は写さない');
for (const [a, b] of [
  ['async sougeiall()', 'async kids()'],
  ['async kids()', 'async kata()'],
  ['async kata()', 'async keikaku()'],
]) assert.ok(!between(leo, a, b).includes('filingDriverName'), a);

assert.ok(between(leo, 'async haichi()', 'async edits()').includes('filingDriverName'));
assert.ok(between(leo, 'async nikki()', 'async jisseki()').includes('nikkiShownValue'));
assert.ok(between(leo, 'async jisseki()', '// 保護者の実績・実費の確認').includes('filingTripDrivers'));
assert.ok(between(leo, 'LEO_VIEWS.diary', 'async function saveDiary').includes('filingDriverName'));
assert.ok(between(leo, 'async function saveNikki()', 'async function renderLeoView').includes('nikkiEditValue'));
assert.ok(!between(leo, 'LEO_VIEWS.master', 'async function saveMaster').includes('filingDriverName'));
const checks = between(leo, 'async function billChecks', '// ===== ① LINE報告');
assert.ok(!checks.includes('filingDriverName'));

console.log('leo_driver_test ok');
console.log('例: 月曜朝 碧音くん迎え 10:20 / 実運転 ' + mondayPick.driver + ' / 日誌・実績 ' + D.filingDriverName(mondayPick.driver));
