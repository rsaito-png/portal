// 架空データ：Python版（test_leo_billing.py の出力）とブラウザ版が同じCSVを出すか
require('../leo_billing.js'); const L = globalThis.LeoBilling, fs = require('fs'), path = require('path');
const kids = { 'テスト児童Ａ': { jukyusha_no: '9900000001', city_no: '999999', kind: '放デイ', cap_monthly: 4600, kana: 'テストジドウエー', guardian_kana: 'テスト　ホゴシャ', contract_days: 23, contract_start: '20260401', first_date: '20260403' },
  'テスト児童Ｂ': { jukyusha_no: '9900000002', city_no: '999999', kind: '児発', cap_monthly: 4600, mushouka: true, kana: 'ﾃｽﾄｼﾞﾄﾞｳB', contract_days: 23, contract_start: '20260401', first_date: '20260410' },
  'テスト児童Ｃ': { jukyusha_no: '9900000003', city_no: '999998', kind: '放デイ', cap_monthly: 0, kana: 'テストジドウシー', contract_days: 10, contract_start: '20260501', gensan: ['未計画'] } };
const R = []; for (const d of [2, 4, 6]) R.push({ day: `2099-01-0${d}`, child: 'テスト児童Ａ', status: '出席', start: '15:00', end: '17:00:00', pick: true, drop: true });
R.push({ day: '2099-01-07', child: 'テスト児童Ａ', status: '出席', start: '10:00', end: '15:30', pick: true, holiday: true });
R.push({ day: '2099-01-08', child: 'テスト児童Ａ', status: '出席', start: '16:00', end: '17:00', kosodate: true });
for (const d of [9, 10, 11, 12, 13]) R.push({ day: `2099-01-${String(d).padStart(2, '0')}`, child: 'テスト児童Ａ', status: '欠席', absent_support: true });
R.push({ day: '2099-01-05', child: 'テスト児童Ｂ', status: '出席', start: '10:00', end: '14:00', pick: true, drop: true });
R.push({ day: '2099-01-05', child: 'テスト児童Ｃ', status: '出席', start: '14:30', end: '16:00' });
const o = L.build('209901', '9999999999', kids, R);
const py = f => new TextDecoder('shift_jis').decode(fs.readFileSync(path.join(__dirname, f)));
const same = (a, b, n) => { if (a !== b) { const x = a.split('\r\n'), y = b.split('\r\n'); const i = x.findIndex((l, j) => l !== y[j]); console.log('DIFF', n, '\nJS', x[i], '\nPY', y[i]); process.exit(1); } };
same(L.toCsv(o.claim), py('K1129901.CSV'), 'K11'); same(L.toCsv(o.jisseki), py('K6119901.CSV'), 'K61');
console.log('JS=Python 一致', o.bills.map(b => b.units).join(','), o.warn);
