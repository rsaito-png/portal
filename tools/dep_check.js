// 減価償却の検証/登録: SUPABASE_SERVICE_KEY=… node tools/dep_check.js [--apply]
//  台帳から計算した各期の償却費を freee の実績（会計士入力）と比べる。--apply で決算整理仕訳を生成・登録（冪等: dep:<期>、旧補正仕訳を置換）
const D = require('../depcalc.js'), U = 'https://zvrardoyxocmqhvyddnf.supabase.co/rest/v1', K = process.env.SUPABASE_SERVICE_KEY, H = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' };
const FREEE = { 2025: { total: 1243951, acc: { 193: 253492, 177: 651224, 72: 229235, 7: 110000 }, dept: { 11: 81254, 1: 54037 } }, 2026: { total: 849342, acc: { 193: 249492, 177: 434367, 72: 165483 }, dept: {} } };
const get = async p => (await fetch(`${U}/${p}`, { headers: H })).json();
(async () => {
  const assets = await get('acc_fixed_assets?select=*&order=id&limit=1000'), apply = process.argv.includes('--apply');
  for (const fy of [2025, 2026]) {
    const R = D.depForYear(assets, fy), F = FREEE[fy]; console.log(`\n第${fy - 2020}期 計算 ${R.total} / freee ${F.total}`, R.total === F.total ? 'OK' : 'NG');
    for (const k of Object.keys(F.acc)) console.log(' 科目', k, R.byAcc[k] || 0, F.acc[k], (R.byAcc[k] || 0) === F.acc[k] ? 'OK' : 'NG', ' 差額行の必要額', F.acc[k] - (R.byAcc[k] || 0) + (assets.filter(a => a.is_adjust && a.book_account_id == k).reduce((s, a) => s + +((a.dep_override || {})[fy] || 0), 0)));
    for (const k of Object.keys(F.dept)) console.log(' 部門', k, R.byDept[k] || 0, F.dept[k]);
    if (R.missing.length) console.log(' 科目未設定', R.missing.map(a => a.name));
  }
  if (apply) {
    for (const fy of [2025, 2026]) {
      const today = new Date(Date.now() + 9 * 36e5).toISOString().slice(0, 10), E = D.depEntry(assets, fy, { exp: 125, accum: 124 }, today);
      const old = await get(`acc_entries?select=id,freee_key,entry_date&entry_date=gte.${fy}-06-01&entry_date=lte.${fy + 1}-05-31&memo=like.${encodeURIComponent('[決算整理] 減価償却')}*`);
      console.log('置換対象', old.map(o => o.freee_key + ' ' + o.entry_date));
      const ins = await (await fetch(`${U}/acc_entries`, { method: 'POST', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify({ ...E.entry, freee_key: E.entry.freee_key + ':new' }) })).json();
      if (!ins[0]) { console.log('登録失敗', ins); process.exit(1); }
      const r = await fetch(`${U}/acc_lines`, { method: 'POST', headers: H, body: JSON.stringify(E.lines.map(l => ({ ...l, entry_id: ins[0].id }))) });
      if (!r.ok) { console.log('明細失敗', await r.text()); await fetch(`${U}/acc_entries?id=eq.${ins[0].id}`, { method: 'DELETE', headers: H }); process.exit(1); }
      for (const o of old) await fetch(`${U}/acc_entries?id=eq.${o.id}`, { method: 'DELETE', headers: H });
      await fetch(`${U}/acc_entries?id=eq.${ins[0].id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ freee_key: E.entry.freee_key }) });
      console.log('登録', fy, E.entry.entry_date, E.lines.length + '行');
    }
  }
})();
