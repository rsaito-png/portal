// 第5期 別表十六(一)(二)(六) 申告書（写真から転記）と台帳計算の資産別限度額を照合: SUPABASE_SERVICE_KEY=… node tools/b16_check.js
const D = require('../depcalc.js'), U = 'https://zvrardoyxocmqhvyddnf.supabase.co/rest/v1', K = process.env.SUPABASE_SERVICE_KEY, H = { apikey: K, Authorization: 'Bearer ' + K };
// id: [期末帳簿, 当期償却限度額(=損金経理額)]
const PHOTO = { 7: [569130, 40870], 9: [222673, 13167], 1: [132691, 33172], 11: [1, 0], 13: [1304406, 651224], 2: [45827, 22981], 6: [121882, 81254], 3: [1, 0], 8: [375000, 125000] };
const PHOTO6 = { prev: 50000, cur: 166283 }; // 別表十六(六): 前期分150,000×12/36、当期分498,850×12/36
(async () => {
  const a = await (await fetch(U + '/acc_fixed_assets?select=*&order=id', { headers: H })).json(); let ok = true, lim = 0;
  for (const id in PHOTO) { const x = a.find(z => z.id == id), s = D.schedule(x, 2025)[2025], r = [s.close, s.dep], p = PHOTO[id], m = r[0] === p[0] && r[1] === p[1]; ok = ok && m; lim += p[1]; console.log(m ? 'OK' : 'NG', x.name.slice(0, 12), '計算', r.join('/'), '申告書', p.join('/')); }
  const k = a.find(z => z.id == 10), s10 = D.schedule(k, 2025)[2025].dep, a18 = D.schedule(a.find(z => z.id == 18), 2025)[2025].dep;
  console.log(s10 === PHOTO6.cur ? 'OK' : 'NG', '看板(一括・当期分)', s10, PHOTO6.cur); console.log('一括(前期分) 台帳18の第5期帳簿償却', a18, '申告書(六)', PHOTO6.prev, '差', a18 - PHOTO6.prev);
  const tot = D.depForYear(a, 2025).total, taxLim = lim + PHOTO6.prev + PHOTO6.cur; console.log('帳簿償却費', tot, '申告書の限度額合計(一+二+六)', taxLim, '差', tot - taxLim, '/ 申告書 別表四・五(一)の償却超過額 232,383 → 未説明', 232383 - (tot - taxLim));
  if (!ok) process.exit(1);
})();
