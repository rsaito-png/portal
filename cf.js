// キャッシュフロー計算（画面に依存しない純粋ロジック）。acc.js から使う。
// lines: [{side,amount,account_id,dept_id,entry_id,acc_entries:{entry_date,kind,partner_id}}]
// wallets: [{id,name,kind,account_id}]
(function (root) {
  const monthsOf = (from, to) => { const r = []; let y = +from.slice(0, 4), m = +from.slice(5, 7); const ey = +to.slice(0, 4), em = +to.slice(5, 7);
    while (y < ey || (y === ey && m <= em)) { r.push(`${y}-${String(m).padStart(2, '0')}`); if (++m > 12) { m = 1; y++; } } return r; };
  function cfCompute(lines, wallets, from, to) {
    const wacc = new Map(wallets.map(w => [w.account_id, w.id])), months = monthsOf(from, to);
    const ents = new Map();
    for (const l of lines) { const e = l.acc_entries; if (!e || e.entry_date > to) continue; let x = ents.get(l.entry_id); if (!x) ents.set(l.entry_id, x = { date: e.kind === 'opening' ? '0000-01-01' : e.entry_date, kind: e.kind, ls: [] }); x.ls.push(l); }
    const z = () => ({ open: 0, in: 0, out: 0, tr: 0 });
    const W = {}; wallets.forEach(w => W[w.id] = Object.fromEntries(months.map(m => [m, z()]))); const open = {}; wallets.forEach(w => open[w.id] = 0);
    const T = Object.fromEntries(months.map(m => [m, { in: 0, out: 0 }]));
    const byAcc = {}, byDept = {}; // key -> month -> {in,out}
    const bump = (o, k, m, dir, v) => { ((o[k] ??= {})[m] ??= { in: 0, out: 0 })[dir] += v; };
    for (const x of ents.values()) {
      const wl = x.ls.filter(l => wacc.has(l.account_id)); if (!wl.length) continue;
      const cl = x.ls.filter(l => !wacc.has(l.account_id)), internal = cl.length === 0, m = x.date.slice(0, 7);
      if (x.date < from) { for (const l of wl) open[wacc.get(l.account_id)] += l.side === 'D' ? l.amount : -l.amount; continue; }
      for (const l of wl) { const c = W[wacc.get(l.account_id)][m], v = l.side === 'D' ? l.amount : -l.amount;
        if (internal) c.tr += v; else if (v > 0) c.in += v; else c.out += -v; }
      for (const l of cl) { const v = l.side === 'C' ? l.amount : -l.amount, dir = v > 0 ? 'in' : 'out', a = Math.abs(v);
        T[m][dir] += a; bump(byAcc, l.account_id, m, dir, a); bump(byDept, l.dept_id ?? 0, m, dir, a); }
    }
    const rows = months.map((m, i) => { const per = {}; let po = 0, pe = 0;
      for (const w of wallets) { const prev = i ? per0(W, w.id, months[i - 1]) : open[w.id]; const c = W[w.id][m]; per[w.id] = { open: prev, in: c.in, out: c.out, tr: c.tr, end: prev + c.in - c.out + c.tr }; W[w.id][m].end = per[w.id].end; po += prev; pe += per[w.id].end; }
      return { month: m, wallets: per, total: { open: po, in: T[m].in, out: T[m].out, end: pe } }; });
    return { months, rows, byAcc, byDept };
  }
  const per0 = (W, id, m) => W[id][m].end;
  // 未決済(未払金/未収入金): 口座ごとに発生(未払金=貸方 / 未収入金=借方)を古い順に、決済(反対側)で先入先出消込
  function cfOpen(lines, acctIds) { // acctIds: [{id,name,side:'C'|'D'}]  side=発生側
    const out = [];
    for (const a of acctIds) {
      const ev = lines.filter(l => l.account_id === a.id && l.acc_entries).sort((p, q) => p.acc_entries.entry_date.localeCompare(q.acc_entries.entry_date) || p.id - q.id);
      let settle = ev.filter(l => l.side !== a.side).reduce((s, l) => s + l.amount, 0);
      for (const l of ev.filter(l => l.side === a.side)) { const use = Math.min(settle, l.amount); settle -= use; const rest = l.amount - use;
        if (rest > 0) out.push({ account: a.name, side: a.side, date: l.acc_entries.entry_date, partner_id: l.acc_entries.partner_id, entry_id: l.entry_id, amount: rest }); }
    }
    return out;
  }
  const api = { cfCompute, cfOpen, monthsOf };
  if (typeof module !== 'undefined') module.exports = api; else Object.assign(root, api);
})(typeof window !== 'undefined' ? window : globalThis);
