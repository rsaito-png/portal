// 型表の入力列は画面の並びだけ変える（node tools/leo_kata_cols_test.js）
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

const leo = fs.readFileSync(path.join(__dirname, '..', 'leo.js'), 'utf8');
const start = leo.indexOf('const KATA_COL_SLOTS');
const end = leo.indexOf('\nLEO_VIEWS.master', start);
assert.ok(start > 0 && end > start, 'orderKataCols');
const ctx = {};
vm.runInNewContext(leo.slice(start, end) + '\nthis.orderKataCols = orderKataCols; this.kataColLabel = kataColLabel;', ctx);

const demo = ['曜日', '児童名', '利用週', '迎え順', '送り順', '利用終了', '利用開始', '迎え場所', '迎え担当', '迎え開始', '送り担当', '送り終了', '保護者送迎', '送り場所（空欄なら自宅）'];
assert.deepStrictEqual([...ctx.orderKataCols(demo)], [
  '曜日', '児童名', '利用週', '利用開始', '利用終了', '迎え順', '迎え開始', '迎え場所', '迎え担当', '送り順', '送り終了', '送り場所（空欄なら自宅）', '送り担当', '保護者送迎',
]);

// 別名だけの列は、その枠に入れる。知らない列は今の順でうしろ。
assert.deepStrictEqual([...ctx.orderKataCols(['メモ', '送り時間', '曜日', '学校お迎え時刻（基準）※空欄なら迎え開始', '送り場所'])], [
  '曜日', '学校お迎え時刻（基準）※空欄なら迎え開始', '送り時間', '送り場所', 'メモ',
]);

// 正式名と別名が両方あるときは正式名を枠に入れ、別名はうしろ（今の順）。
assert.deepStrictEqual([...ctx.orderKataCols(['迎え時間', '迎え開始', '送り場所', '送り終了', '送り場所（空欄なら自宅）'])], [
  '迎え開始', '送り終了', '送り場所（空欄なら自宅）', '迎え時間', '送り場所',
]);

assert.strictEqual(ctx.kataColLabel('迎え開始'), '迎え時間');
assert.strictEqual(ctx.kataColLabel('送り終了'), '送り時間');
assert.strictEqual(ctx.kataColLabel('迎え場所'), '迎え場所');
assert.strictEqual(ctx.kataColLabel('送り場所（空欄なら自宅）'), '送り場所（空欄なら自宅）');
assert.strictEqual(ctx.kataColLabel('学校お迎え時刻（基準）※空欄なら迎え開始'), '学校お迎え時刻');

const school = '学校お迎え時刻（基準）※空欄なら迎え開始';
assert.deepStrictEqual([...ctx.orderKataCols([...demo, school])], [
  '曜日', '児童名', '利用週', '利用開始', '利用終了', '迎え順', '迎え開始', '迎え場所', school, '迎え担当', '送り順', '送り終了', '送り場所（空欄なら自宅）', '送り担当', '保護者送迎',
]);

const master = leo.slice(leo.indexOf('LEO_VIEWS.master'), leo.indexOf('async function saveMaster'));
assert.ok(master.includes("if (MASTER_KIND === 'kata') cols = orderKataCols(cols)"));
assert.ok(master.includes('data-c="${esc(c)}"'));
assert.ok(master.includes("MASTER_KIND === 'kata' ? kataColLabel(c) : c"));
assert.ok(!master.includes('filingDriverName'));

// 保存は列の位置ではなく data-c（列名）で書く
const save = leo.slice(leo.indexOf('async function saveMaster'), leo.indexOf('async function saveCare'));
assert.ok(save.includes('i.dataset.c'));

console.log('leo_kata_cols_test ok');
