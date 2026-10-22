// 算定加算を「なし」にする行: 利用者名があり、Pが空欄で、数式でない行だけ。
const assert = (c, m) => { if (!c) throw new Error(m || 'fail'); };
const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, 'leo_nikki_kasan_gas.js'), 'utf8');
const start = src.indexOf('function rowsNeedingKasanNashi_');
const end = src.indexOf('function fillBlankKasanNamed_');
if (start < 0 || end < 0) throw new Error('rowsNeedingKasanNashi_ not found');
eval(src.slice(start, end));

const names = ['西山　琴', '', '山根 一輝', '日置　大智', '  ', '湯上　奏輔'];
const values = ['', '', 'なし', '家族支援', '', '  '];
const formulas = ['', '', '', '', '', ''];
const rows = rowsNeedingKasanNashi_(names, values, formulas);
assert(rows.join(',') === '0,5', 'named blank rows only, got ' + rows.join(','));

const withFormula = rowsNeedingKasanNashi_(
  ['西山　琴', '山根 一輝'],
  ['', ''],
  ['=IF(B9="","","なし")', '']
);
assert(withFormula.join(',') === '1', 'formula cell is skipped, got ' + withFormula.join(','));

const none = rowsNeedingKasanNashi_(['', '', ''], ['', '', ''], ['', '', '']);
assert(none.length === 0, 'nameless rows stay blank');

const kept = rowsNeedingKasanNashi_(
  ['市川　碧音', '下宮　蒼偉'],
  ['子育てサポート', '関係機関連携'],
  ['', '']
);
assert(kept.length === 0, 'existing add-ons are not overwritten');

console.log('leo_kasan_sheet_rows_test ok');
