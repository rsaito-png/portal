// 第5期 別表十六・償却超過（堤会計「償却超過.xlsx」）と台帳計算の照合: SUPABASE_SERVICE_KEY=… node tools/b16_check.js
const D = require('../depcalc.js'), U = 'https://zvrardoyxocmqhvyddnf.supabase.co/rest/v1', K = process.env.SUPABASE_SERVICE_KEY, H = { apikey: K, Authorization: 'Bearer ' + K };
const PHOTO = { 7: [569130, 40870], 9: [222673, 13167], 1: [132691, 33172], 11: [1, 0], 13: [1304406, 651224], 2: [45827, 22981], 6: [121882, 81254], 8: [375000, 125000] }; // [期末帳簿, 帳簿償却]
// 償却超過.xlsx: 期: [定率 償却, 定率 簿価, 定額 償却, 定額 簿価, 償却超過(G), 累計(H)]
const XLSX = { 2021: [17050, 323950, 8525, 332475, 8525, 8525], 2022: [64790, 259160, 34100, 298375, 39215, 47740], 2023: [51832, 207328, 34100, 264275, 56947, 104687], 2024: [41465, 165863, 34100, 230175, 64312, 168999], 2025: [33172, 132691, 34100, 196075, 63384, 232383] };
let ok = true; const chk = (c, ...m) => { ok = ok && c; console.log(c ? 'OK' : 'NG', ...m); };
(async () => {
  const a = await (await fetch(U + '/acc_fixed_assets?select=*&order=id', { headers: H })).json();
  for (const id in PHOTO) { const x = a.find(z => z.id == id), s = D.schedule(x, 2025)[2025]; chk(s.close === PHOTO[id][0] && s.dep === PHOTO[id][1], x.name.slice(0, 12), s.close, s.dep); }
  const s1 = a.find(z => z.id == 1), tr = D.excessTrack(s1, 2032); let cumH = 0;
  for (const f in XLSX) { const t = tr[f], x = XLSX[f]; cumH += t.gap; chk(t.book === x[0] && t.bookBv === x[1] && t.limit === x[2] && t.taxBv === x[3] && t.gap === x[4] && cumH === x[5], '城山 xlsx', f, [t.book, t.bookBv, t.limit, t.taxBv, t.gap, cumH].join('/')); }
  const B5 = D.b16(a, 2025, {}, k => '' + k);
  chk(B5.totalExcess === 232383, '第5期 償却超過（別表四加算・別表五(一)増）', B5.totalExcess);
  chk(B5.ikkatsu.map(x => x.limit).join() === '50000,166283' || B5.ikkatsu.reduce((s, x) => s + x.limit, 0) === 216283, '別表十六(六) 限度額', B5.ikkatsu.map(x => x.name + ':' + x.book + '/' + x.limit + (x.lagBook ? '(遅れ' + x.lagBook + ')' : '')).join(' '));
  chk(D.depForYear(a, 2025).total === 1243951 && D.depForYear(a, 2026).total === 849342, '帳簿償却費は不変', D.depForYear(a, 2025).total, D.depForYear(a, 2026).total);
  for (const f of [2026, 2027, 2028, 2029, 2030, 2031, 2032]) { const t = tr[f]; console.log('城山', f, '帳簿', t.book, '限度', t.limit, '加算', t.add, '認容', t.nin, '超過残', t.close, '税法簿価', t.taxBv, '帳簿簿価', t.bookBv); }
  const B6 = D.b16(a, 2026, {}, k => '' + k); console.log('第6期 期首超過', B6.excessOpen, '加算', B6.totalExcess, '認容', B6.totalNin, '期末', B6.excessClose);
  if (!ok) process.exit(1);
})();
