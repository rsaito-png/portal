// 架空データ：Python版と同じ結果になるか
require('../leo_billing.js'); const L = globalThis.LeoBilling, fs = require('fs');
const kids = { 'テスト児童Ａ': { jukyusha_no: '9900000001', city_no: '999999', kind: '放デイ', cap_monthly: 4600, kana: 'ﾃｽﾄｼﾞﾄﾞｳA', contract_days: 23, contract_start: '20260401' },
  'テスト児童Ｂ': { jukyusha_no: '9900000002', city_no: '999999', kind: '児発', cap_monthly: 4600, mushouka: true, kana: 'ﾃｽﾄｼﾞﾄﾞｳB', contract_days: 23, contract_start: '20260401' } };
const R = []; for (const d of [2, 4, 6]) R.push({ day: `2099-01-0${d}`, child: 'テスト児童Ａ', status: '出席', start: '15:00', end: '17:00', pick: true, drop: true });
R.push({ day: '2099-01-07', child: 'テスト児童Ａ', status: '出席', start: '10:00', end: '15:30', pick: true, holiday: true });
R.push({ day: '2099-01-08', child: 'テスト児童Ａ', status: '出席', start: '16:00', end: '17:00', kosodate: true });
for (const d of [9, 10, 11, 12, 13]) R.push({ day: `2099-01-${String(d).padStart(2, '0')}`, child: 'テスト児童Ａ', status: '欠席', absent_support: true });
R.push({ day: '2099-01-05', child: 'テスト児童Ｂ', status: '出席', start: '10:00', end: '14:00', pick: true, drop: true });
const o = L.build('209901', '9999999999', kids, R);
const py = f => require('child_process').execSync(`python3 -c "print(open('${f}','rb').read().decode('cp932'),end='')"`, { cwd: __dirname }).toString();
const same = (a, b, n) => { if (a !== b) { console.log('DIFF', n); process.exit(1); } };
same(L.toCsv(o.claim), py('TJ111.CSV'), 'J111'); same(L.toCsv(o.jisseki), py('TJ611.CSV'), 'J611');
console.log('JS=Python 一致', o.bills.map(b => b.units).join(','), o.warn);
