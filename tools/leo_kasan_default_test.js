// 算定加算: 空欄は「なし」。入っている値は変えない。表示だけの「なし」は保存しない。
const assert = (c, m) => { if (!c) throw new Error(m || 'fail'); };
const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'leo.js'), 'utf8');
const start = src.indexOf('const NIKKI_KASAN_DEFAULT');
const end = src.indexOf('const NIKKI_FIELDS');
if (start < 0 || end < 0) throw new Error('kasan helpers not found');
eval(src.slice(start, end));

assert(nikkiKasanValue('') === 'なし', 'empty string');
assert(nikkiKasanValue(null) === 'なし', 'null');
assert(nikkiKasanValue(undefined) === 'なし', 'undefined');
assert(nikkiKasanValue('   ') === 'なし', 'whitespace');
assert(nikkiKasanValue('なし') === 'なし', 'already なし');
assert(nikkiKasanValue('家族支援') === '家族支援', 'keep 家族支援');
assert(nikkiKasanValue(' 子育てサポート ') === '子育てサポート', 'trim keeps value');

const known = nikkiKasanOptions('なし');
assert(known[0] === 'なし' && known.includes('家族支援') && !known.includes('その他加算'), 'known options');
const extra = nikkiKasanOptions('強度行動');
assert(extra[0] === '強度行動' && extra.includes('なし'), 'unknown value stays selectable');

// 空欄の行は表示が「なし」でも、職員が変えていなければ送らない
const untouched = nikkiEditChanges([
  { row: '9', field: 'kasan', value: 'なし', raw: '', old: 'なし' },
  { row: '10', field: 'kasan', value: '家族支援', raw: '家族支援', old: '家族支援' },
  { row: '11', field: 'kasan', value: 'なし', raw: 'なし', old: 'なし' },
  { row: '9', field: 'pick_time', value: '14:30', old: '14:30', raw: '' },
]);
assert(untouched.length === 0, 'blank display and set values are not saved');

// 空欄から別の加算へ変えたときだけ、元の空欄を old にして送る（シートの別の値は old が違うので衝突になり上書きされない）
const changed = nikkiEditChanges([
  { row: '9', field: 'kasan', value: '子育てサポート', raw: '', old: 'なし' },
  { row: '10', field: 'kasan', value: 'なし', raw: '家族支援', old: '家族支援' },
  { row: '9', field: 'end_time', value: '17:30', old: '17:00', raw: '' },
]);
assert(changed.length === 3, 'three real edits');
assert(changed[0].row === '9' && changed[0].field === 'kasan' && changed[0].old_value === '' && changed[0].new_value === '子育てサポート', 'blank to addon');
assert(changed[1].old_value === '家族支援' && changed[1].new_value === 'なし', 'set value can be changed by staff');
assert(changed[2].field === 'end_time' && changed[2].old_value === '17:00' && changed[2].new_value === '17:30', 'other fields still diff');

console.log('leo_kasan_default_test ok');
