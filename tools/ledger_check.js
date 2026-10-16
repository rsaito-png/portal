// 台帳の検証: SUPABASE_SERVICE_KEY=… node tools/ledger_check.js 2025  （第5期=2025）
const LG = require('../ledger.js'); const U = 'https://zvrardoyxocmqhvyddnf.supabase.co/rest/v1', K = process.env.SUPABASE_SERVICE_KEY, H = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' };
const get = async p => { const o = []; for (let off = 0; ; off += 1000) { const r = await (await fetch(`${U}/${p}${p.includes('?') ? '&' : '?'}order=id&limit=1000&offset=${off}`, { headers: H })).json(); o.push(...r); if (r.length < 1000) break; } return o; };
(async () => {
  const y = +(process.argv[2] || 2025), from = `${y}-06-01`, to = `${y + 1}-05-31`;
  const accs = await get('acc_accounts?select=id,name,type'), wal = await get('acc_wallets?select=id,name,kind,account_id');
  const lines = await get(`acc_lines?select=id,side,amount,account_id,dept_id,memo,entry_id,acc_entries!inner(entry_date,kind,partner_id,memo,wallet_id)&acc_entries.entry_date=lte.${to}`);
  const P = LG.prep(lines); const tb = await (await fetch(`${U}/rpc/acc_trial_balance`, { method: 'POST', headers: H, body: JSON.stringify({ p_from: from, p_to: to, p_dept: null }) })).json();
  const tbAll = await (await fetch(`${U}/rpc/acc_trial_balance`, { method: 'POST', headers: H, body: JSON.stringify({ p_from: '1900-01-01', p_to: to, p_dept: null }) })).json();
  let bad = 0, td = 0, tc = 0;
  for (const a of accs) { const g = LG.ledger(P, a, from, to), x = tb.find(r => r.account_id === a.id), z = tbAll.find(r => r.account_id === a.id);
    const ex = sd => P.L.filter(l => l.acc === a.id && l.kind === 'opening' && l.date === from && l.side === sd).reduce((s, l) => s + l.amt, 0);
    const ed = g.dsum + ex('D'), ec = g.csum + ex('C'); td += g.dsum; tc += g.csum;
    if (ed !== (x?.debit ?? 0) || ec !== (x?.credit ?? 0)) { bad++; console.log('NG期間', a.name, ed, x?.debit, ec, x?.credit); }
    const cum = z ? (LG.isDebitNormal(a.type) ? z.debit - z.credit : z.credit - z.debit) : 0, isPL = a.type === 'revenue' || a.type === 'expense';
    if (!isPL && g.close !== cum) { bad++; console.log('NG残高', a.name, g.close, cum); }
    if (isPL) { const per = x ? (LG.isDebitNormal(a.type) ? x.debit - x.credit : x.credit - x.debit) : 0; if (g.close !== per) { bad++; console.log('NG損益', a.name, g.close, per); } } }
  console.log('科目', accs.length, '不一致', bad, '借方計', td, '貸方計', tc);
  let sum = 0, cash = 0; for (const w of wal.filter(w => w.kind !== 'card')) { const a = accs.find(x => x.id === w.account_id), g = LG.ledger(P, a, from, to); console.log(w.kind, w.name, g.close); sum += g.close; }
  console.log('預金・現金 期末合計', sum, sum === 4911339 && y === 2025 ? 'OK(4,911,339)' : '');
  const ap = accs.filter(a => a.name === '未払金' || a.name === '未収入金' || a.name === '買掛金' || a.name === '売掛金');
  for (const a of ap) { const side = a.name === '未払金' || a.name === '買掛金' ? 'C' : 'D', it = LG.openItems(P, a, from, to, side), cl = it.reduce((s, p) => s + p.close, 0), g = LG.ledger(P, a, from, to), items = it.reduce((s, p) => s + p.items.reduce((q, i) => q + i.rest, 0), 0); console.log(a.name, '取引先別期末', cl, '元帳', g.close, '発生日別合計', items); }
})();
