// 会計「台帳」タブ（総勘定元帳・補助元帳・現金/預金出納帳・売掛/買掛(未収入/未払)残高台帳・取引先元帳）。法人管理者のみ（acc.js の認証とRLSの上で動く）。
// 前半は画面に依存しない計算（node から tools/ledger_check.js で検証）。個人名取引先は画面には出すが、印刷・CSVは既定で伏せる。
(function (root) {
  const fyStart = d => { const y = +d.slice(0, 4), m = +d.slice(5, 7); return `${m >= 6 ? y : y - 1}-06-01`; };
  const isDebitNormal = t => t === 'asset' || t === 'expense';
  // lines: [{id,entry_id,side,amount,account_id,dept_id,memo,acc_entries:{entry_date,kind,partner_id,memo,wallet_id}}]
  function prep(lines) {
    const L = lines.map(l => { const e = l.acc_entries || {}; return { id: l.id, eid: l.entry_id, side: l.side, amt: l.amount, acc: l.account_id, dept: l.dept_id || 0, lmemo: l.memo || '', date: e.entry_date, kind: e.kind, pid: e.partner_id || 0, ememo: e.memo || '', wid: e.wallet_id || 0 }; });
    const byE = new Map(); for (const l of L) { let a = byE.get(l.eid); if (!a) byE.set(l.eid, a = []); a.push(l); }
    return { L, byE };
  }
  const isOpenLine = (l, from) => (l.kind === 'opening' && l.date <= from) || l.date < from;
  // 1科目の元帳。filter(l) で部門・取引先を絞る。戻り: {open, rows:[{date,kind,eid,cp,memo,pid,d,c,bal}], dsum, csum, close}
  function ledger(P, acct, from, to, filter) {
    const dn = isDebitNormal(acct.type), pl = acct.type === 'revenue' || acct.type === 'expense', fs0 = fyStart(from);
    const sg = l => (l.side === 'D' ? 1 : -1) * (dn ? 1 : -1);
    let open = 0; const per = [];
    for (const l of P.L) {
      if (l.acc !== acct.id || l.date > to || (filter && !filter(l))) continue;
      if (isOpenLine(l, from)) { if (pl && l.kind !== 'opening' && l.date < fs0) continue; open += l.amt * sg(l); } else per.push(l);
    }
    per.sort((a, b) => a.date.localeCompare(b.date) || a.eid.localeCompare(b.eid) || a.id - b.id);
    let bal = open, dsum = 0, csum = 0;
    const rows = per.map(l => { const opp = (P.byE.get(l.eid) || []).filter(x => x.side !== l.side), ids = [...new Set(opp.map(x => x.acc))];
      const d = l.side === 'D' ? l.amt : 0, c = l.side === 'C' ? l.amt : 0; dsum += d; csum += c; bal += l.amt * sg(l);
      return { date: l.date, kind: l.kind, eid: l.eid, cpIds: ids, memo: [l.ememo, l.lmemo].filter(Boolean).join(' / '), pid: l.pid, dept: l.dept, d, c, bal }; });
    return { open, rows, dsum, csum, close: bal, dn };
  }
  // 残高台帳: 取引先別の期首・発生・決済・期末、発生日別の未決済(先入先出)
  function openItems(P, acct, from, to, side) { // side: 発生側 'C'(未払金/買掛金) or 'D'(未収入金/売掛金)
    const by = new Map();
    for (const l of P.L) { if (l.acc !== acct.id || l.date > to) continue; let p = by.get(l.pid); if (!p) by.set(l.pid, p = { pid: l.pid, open: 0, inc: 0, dec: 0, ev: [], set: 0 });
      const inc = l.side === side, v = l.amt * (inc ? 1 : -1);
      if (isOpenLine(l, from)) p.open += v; else if (inc) p.inc += l.amt; else p.dec += l.amt;
      if (inc) p.ev.push({ date: l.kind === 'opening' ? '' : l.date, od: l.date, amt: l.amt, memo: [l.ememo, l.lmemo].filter(Boolean).join(' / '), eid: l.eid }); else p.set += l.amt; }
    const out = [];
    for (const p of by.values()) { p.close = p.open + p.inc - p.dec; p.ev.sort((a, b) => a.od.localeCompare(b.od)); let s = p.set; p.items = [];
      for (const e of p.ev) { const u = Math.min(s, e.amt); s -= u; if (e.amt - u > 0) p.items.push({ ...e, rest: e.amt - u }); }
      if (s > 0) p.items.push({ date: '', od: '', amt: 0, rest: -s, memo: '（前払・過入金など反対側の残）' }); out.push(p); }
    return out;
  }
  const api = { fyStart, isDebitNormal, prep, ledger, openItems };
  if (typeof module !== 'undefined') module.exports = api; else Object.assign(root, { LG: api });
})(typeof window !== 'undefined' ? window : globalThis);

/* ================= 画面 ================= */
if (typeof window !== 'undefined') (function () {
  const LGC = window.LG;
  const S = { incp: false, data: null, out: null };
  const KINDS = [['gl', '総勘定元帳'], ['sub', '補助元帳'], ['cash', '現金出納帳'], ['bank', '預金出納帳'], ['ar', '売掛金・未収入金'], ['ap', '買掛金・未払金'], ['partner', '取引先元帳']];
  const st = document.createElement('style');
  st.textContent = '.pv{background:#fff7d6}.pmask{display:none}@media print{.pv{display:none;background:none}.pmask{display:inline}body.incp .pv{display:inline}body.incp .pmask{display:none}.lgsec{break-inside:auto}tr{break-inside:avoid}thead{display:table-header-group}}';
  document.head.appendChild(st);
  const pName = id => (+id ? M.partners.find(p => p.id === +id)?.name ?? '取引先' + id : '(取引先なし)');
  const pCell = id => { const p = +id ? M.partners.find(x => x.id === +id) : null; return p && p.is_personal ? { v: p.name, m: '(個人名)' } : pName(id); };
  const mCell = (memo, pid) => { const p = +pid ? M.partners.find(x => x.id === +pid) : null; return p && p.is_personal && memo ? { v: memo, m: '(伏せ字)' } : memo; };
  const aName = id => M.accounts.find(a => a.id === +id)?.name ?? '科目' + id;
  const dName = id => +id ? (M.depts.find(d => d.id === +id)?.name ?? '部門' + id) : '(部門なし)';
  const cpName = ids => ids.length === 1 ? aName(ids[0]) : ids.length ? '諸口' : '';
  const cellHtml = v => typeof v === 'number' ? `<td class="r">${yen(v)}</td>` : v && typeof v === 'object' ? `<td><span class="pv">${esc(v.v)}</span><span class="pmask">${esc(v.m)}</span></td>` : `<td>${esc(v ?? '')}</td>`;
  const cellCsv = v => typeof v === 'number' ? v : v && typeof v === 'object' ? (S.incp ? v.v : v.m) : (v ?? '');
  const num = v => typeof v === 'number';

  async function loadData(to) {
    if (!M.accounts) await loadMasters();
    if (!S.wk) { S.wk = new Map((await sb('acc_wallets?select=id,kind')).map(w => [w.id, w.kind])); }
    M.wallets.forEach(w => { w.kind = S.wk.get(w.id); });
    if (!S.pp) S.pp = new Map((await fetchAll('acc_partners?select=id,is_personal')).map(p => [p.id, p.is_personal]));
    M.partners.forEach(p => { p.is_personal = !!S.pp.get(p.id); });
    if (S.data && S.data.to === to && Date.now() - S.data.t < 60000) return S.data;
    const lines = await fetchAll(`acc_lines?select=id,side,amount,account_id,dept_id,memo,entry_id,acc_entries!inner(entry_date,kind,partner_id,memo,wallet_id)&acc_entries.entry_date=lte.${to}`);
    const rows = lines.map(l => ({ ...l, amount: +l.amount })); S.data = { to, t: Date.now(), P: LGC.prep(rows) }; return S.data;
  }
  const fyOpts = (from) => { const cur = +fiscalYear(todayJST()).from.slice(0, 4), a = []; for (let y = cur; y >= 2021; y--) a.push(`<option value="${y}-06-01|${y + 1}-05-31"${from === `${y}-06-01` ? ' selected' : ''}>第${y - 2020}期（${y}/6〜${y + 1}/5）</option>`); return a.join(''); };

  function sectionHtml(s) {
    return `<div class="card scroll lgsec"><h3>${esc(s.title)}</h3>${s.note ? `<p class="note">${esc(s.note)}</p>` : ''}<table><thead><tr>${s.head.map((h, i) => `<th${s.right?.includes(i) ? ' class="r"' : ''}>${esc(h)}</th>`).join('')}</tr></thead><tbody>${s.rows.map(r => { const cells = r.r || r; return `<tr class="${r.c || ''}">${cells.map(cellHtml).join('')}</tr>`; }).join('')}</tbody></table></div>`;
  }
  const titleCsv = s => s.titleCell ? s.title + (typeof s.titleCell === 'object' ? (S.incp ? s.titleCell.v : s.titleCell.m) : s.titleCell) : s.title;
  function csvOut() {
    if (!S.out) return; const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"', L = [[S.out.title, S.out.period], S.out.flags ? [S.incp ? '個人名を含む' : '個人名は伏せ字'] : []];
    for (const s of S.out.sections) { L.push([], [titleCsv(s)], s.head); s.rows.forEach(r => L.push((r.r || r).map(cellCsv))); }
    const b = new Blob(['\ufeff' + L.map(a => a.map(q).join(',')).join('\r\n')], { type: 'text/csv' }), a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = `ledger_${S.out.key}_${S.out.from}_${S.out.to}.csv`; a.click();
  }
  window.lgCsv = csvOut;
  window.lgIncp = c => { S.incp = c; document.body.classList.toggle('incp', c); };
  window.lgGo = () => { const g = id => document.getElementById(id)?.value, p = new URLSearchParams(); const t = g('lg_t'); for (const [k, id] of [['from', 'lg_f'], ['to', 'lg_to'], ['acct', 'lg_a'], ['dept', 'lg_d'], ['grp', 'lg_g'], ['wal', 'lg_w'], ['pid', 'lg_p']]) { const v = g(id); if (v) p.set(k, v); } location.hash = 'ledger?t=' + t + '&' + p.toString(); };
  window.lgFy = v => { const [f, t] = v.split('|'); $('lg_f').value = f; $('lg_to').value = t; lgGo(); };

  async function vLedger(sp) {
    const fy = fiscalYear(todayJST()), t = KINDS.find(k => k[0] === sp.get('t')) ? sp.get('t') : 'gl', from = sp.get('from') || fy.from, to = sp.get('to') || fy.to;
    const { P } = await loadData(to);
    const acctSel = sp.get('acct') || (t === 'gl' ? 'all' : ''), dept = +sp.get('dept') || 0, grp = sp.get('grp') || 'partner', wal = +sp.get('wal') || 0, pid = sp.get('pid') ?? '';
    const flt = dept ? (l => l.dept === dept) : null, out = [], notes = [];
    const A = id => M.accounts.find(a => a.id === +id);
    const rowOf = r => [r.date, KIND[r.kind] || r.kind, cpName(r.cpIds), mCell(r.memo, r.pid), r.pid ? pCell(r.pid) : '', r.d, r.c, r.bal];
    const GH = ['日付', '種別', '相手科目', '摘要', '取引先', '借方', '貸方', '残高'], GR = [5, 6, 7];
    const glSection = (a, f) => { const g = LGC.ledger(P, a, from, to, f); if (!g.rows.length && !g.open) return null;
      return { s: { title: `${a.name}（${TYPE[a.type]}）`, head: GH, right: GR, rows: [{ r: ['', '', '', '期首残高', '', '', '', g.open], c: 'sec' }, ...g.rows.map(rowOf), { r: ['', '', '', '期間計／期末残高', '', g.dsum, g.csum, g.close], c: 'tot' }] }, g }; };
    let body = '', title = KINDS.find(k => k[0] === t)[1];
    if (t === 'gl') {
      const list = acctSel === 'all' ? M.accounts : [A(acctSel)].filter(Boolean); let tD = 0, tC = 0;
      for (const a of list) { const r = glSection(a, flt); if (r) { out.push(r.s); tD += r.g.dsum; tC += r.g.csum; } }
      // 試算表との照合
      if (acctSel === 'all') { const tb = await sb('rpc/acc_trial_balance', { method: 'POST', body: JSON.stringify({ p_from: from, p_to: to, p_dept: dept || null }) }); let bad = 0;
        for (const a of list) { const g = LGC.ledger(P, a, from, to, flt), x = tb.find(r => r.account_id === a.id); const ex = sd => P.L.filter(l => l.acc === a.id && l.kind === 'opening' && l.date === from && l.side === sd && (!flt || flt(l))).reduce((s, l) => s + l.amt, 0);
          const td = (x?.debit ?? 0), tc = (x?.credit ?? 0), ed = g.dsum + ex('D'), ec = g.csum + ex('C');
          if (td !== ed || tc !== ec) bad++; }
        notes.push(bad ? `⚠ 試算表と合わない科目が ${bad} 件あります` : `✅ 全科目の期間の借方・貸方合計が試算表と一致（借方計 ${yen(tD)} ／ 貸方計 ${yen(tC)}。期首の開始残高仕訳の日付が期首日の場合はその分を含めて比較）`); }
    } else if (t === 'sub') {
      const a = A(acctSel); if (a) { const keys = new Set(P.L.filter(l => l.acc === a.id && l.date <= to).map(l => grp === 'dept' ? l.dept : l.pid));
        const arr = [...keys].map(k => ({ k, name: grp === 'dept' ? dName(k) : pName(k) })).sort((x, y) => x.name.localeCompare(y.name, 'ja'));
        for (const { k } of arr) { const f = l => (grp === 'dept' ? l.dept : l.pid) === k && (!flt || flt(l)), g = LGC.ledger(P, a, from, to, f); if (!g.rows.length && !g.open) continue;
          const row = r => [r.date, KIND[r.kind] || r.kind, cpName(r.cpIds), mCell(r.memo, r.pid), grp === 'dept' ? dName(r.dept) : '', r.d, r.c, r.bal];
          out.push({ title: `${a.name}　${grp === 'dept' ? '部門: ' + dName(k) : '取引先: '}`, titleCell: grp === 'dept' ? null : pCell(k), head: ['日付', '種別', '相手科目', '摘要', grp === 'dept' ? '部門' : '', '借方', '貸方', '残高'], right: GR,
            rows: [{ r: ['', '', '', '期首残高', '', '', '', g.open], c: 'sec' }, ...g.rows.map(row), { r: ['', '', '', '期間計／期末残高', '', g.dsum, g.csum, g.close], c: 'tot' }] }); } }
      else notes.push('科目を選んでください');
    } else if (t === 'cash' || t === 'bank') {
      const ws = M.wallets.filter(w => (t === 'cash' ? w.kind === 'cash' : w.kind === 'bank') && (!wal || w.id === wal)); const tb = await sb('rpc/acc_trial_balance', { method: 'POST', body: JSON.stringify({ p_from: '1900-01-01', p_to: to, p_dept: null }) }); let sum = 0;
      for (const w of ws) { const a = A(w.account_id) || { id: w.account_id, name: w.name, type: 'asset' }, g = LGC.ledger(P, a, from, to, null), x = tb.find(r => r.account_id === a.id), tbBal = (x?.debit ?? 0) - (x?.credit ?? 0); sum += g.close;
        out.push({ title: `${w.name}（科目: ${a.name}）`, head: ['日付', '種別', '相手科目', '摘要', '取引先', '入金', '出金', '残高'], right: GR,
          rows: [{ r: ['', '', '', '前期繰越', '', '', '', g.open], c: 'sec' }, ...g.rows.map(rowOf), { r: ['', '', '', '期間計／期末残高', '', g.dsum, g.csum, g.close], c: 'tot' }, ...(g.close === tbBal ? [] : [{ r: ['', '', '', '⚠ 試算表の残高と不一致', '', '', '', tbBal], c: 'tot' }])] });
        if (g.close !== tbBal) notes.push(`⚠ ${w.name}: 出納帳 ${yen(g.close)} ≠ 口座残高(累計) ${yen(tbBal)}`); }
      if (!notes.length) notes.push(`✅ 各口座の期末残高は試算表（口座科目の累計残高）と一致。${t === 'bank' ? '預金' : '現金'}合計 ${yen(sum)} 円`);
      if (ws.length > 1) out.push({ title: '合計', head: ['口座', '期末残高'], right: [1], rows: [...ws.map((w, i) => [w.name, LGC.ledger(P, A(w.account_id), from, to, null).close]), { r: ['合計', sum], c: 'tot' }] });
    } else if (t === 'ar' || t === 'ap') {
      const names = t === 'ar' ? ['売掛金', '未収入金'] : ['買掛金', '未払金'], side = t === 'ar' ? 'D' : 'C', accs = names.map(n => M.accounts.find(a => a.name === n)).filter(Boolean);
      for (const a of accs) { const arr = LGC.openItems(P, a, from, to, side).filter(p => p.open || p.inc || p.dec || p.close).sort((x, y) => pName(x.pid).localeCompare(pName(y.pid), 'ja'));
        const tot = arr.reduce((s, p) => ({ o: s.o + p.open, i: s.i + p.inc, d: s.d + p.dec, c: s.c + p.close }), { o: 0, i: 0, d: 0, c: 0 });
        out.push({ title: `${a.name}　取引先別 残高台帳`, head: ['取引先', '期首残高', t === 'ar' ? '発生(請求)' : '発生(計上)', t === 'ar' ? '入金' : '支払', '期末残高'], right: [1, 2, 3, 4], rows: [...arr.map(p => [pCell(p.pid), p.open, p.inc, p.dec, p.close]), { r: ['合計', tot.o, tot.i, tot.d, tot.c], c: 'tot' }] });
        const td = new Date(todayJST()), ref = new Date(to) < td ? new Date(to) : td; const items = arr.flatMap(p => p.items.map(i => [pCell(p.pid), i.date || '（期首繰越）', mCell(i.memo, p.pid), i.rest, i.date ? Math.round((ref - new Date(i.date)) / 864e5) : ''])).sort((x, y) => String(x[1]).localeCompare(String(y[1])));
        out.push({ title: `${a.name}　発生日別 未決済残高（先入先出で消込）`, head: ['取引先', '発生日', '摘要', '未決済額', '経過日数'], right: [3, 4], rows: [...items, { r: ['合計', '', '', items.reduce((s, r) => s + r[3], 0), ''], c: 'tot' }] }); }
      if (!accs.length) notes.push('該当の勘定科目がありません');
      else { const tb = await sb('rpc/acc_trial_balance', { method: 'POST', body: JSON.stringify({ p_from: '1900-01-01', p_to: to, p_dept: null }) }); const bad = accs.filter(a => { const x = tb.find(r => r.account_id === a.id), b = (x?.debit ?? 0) - (x?.credit ?? 0); return Math.abs(b) !== Math.abs(LGC.openItems(P, a, from, to, side).reduce((s, p) => s + p.close, 0)); });
        notes.push(bad.length ? '⚠ 試算表と一致しない科目: ' + bad.map(a => a.name).join('、') : '✅ 取引先別の期末残高合計は試算表（累計残高）と一致'); }
    } else if (t === 'partner') {
      const wacc = new Set(M.wallets.map(w => w.account_id));
      if (pid) { const ls = P.L.filter(l => l.pid === +pid && l.date >= from && l.date <= to), byE = new Map(); ls.forEach(l => { (byE.get(l.eid) || byE.set(l.eid, []).get(l.eid)).push(l); });
        const es = [...byE.values()].sort((a, b) => a[0].date.localeCompare(b[0].date)); let D = 0, C = 0; const rows = [];
        for (const e of es) { const all = P.byE.get(e[0].eid), cp = all.filter(l => !wacc.has(l.acc)), shown = cp.length ? cp : all, wn = all.filter(l => wacc.has(l.acc)).map(l => aName(l.acc)).join('・');
          for (const l of shown) { const d = l.side === 'D' ? l.amt : 0, c = l.side === 'C' ? l.amt : 0; D += d; C += c; rows.push([l.date, KIND[l.kind] || l.kind, aName(l.acc), mCell([l.ememo, l.lmemo].filter(Boolean).join(' / '), l.pid), wn, dName(l.dept), d, c]); } }
        out.push({ title: `取引先元帳: `, titleCell: pCell(pid), head: ['日付', '種別', '科目', '摘要', '決済口座', '部門', '借方', '貸方'], right: [6, 7], rows: [...rows, { r: ['', '', '', '合計', '', '', D, C], c: 'tot' }] });
        const dbt = []; for (const [names, side, lab] of [[['売掛金', '未収入金'], 'D', '債権'], [['買掛金', '未払金'], 'C', '債務']]) for (const n of names) { const a = M.accounts.find(x => x.name === n); if (!a) continue; const p = LGC.openItems(P, a, from, to, side).find(x => x.pid === +pid); if (p && (p.open || p.inc || p.dec || p.close)) dbt.push([lab + ' ' + n, p.open, p.inc, p.dec, p.close]); }
        if (dbt.length) out.push({ title: '債権・債務の残高', head: ['科目', '期首', '発生', '決済', '期末'], right: [1, 2, 3, 4], rows: dbt });
      } else { const by = new Map(); for (const l of P.L) { if (!l.pid || l.date < from || l.date > to || wacc.has(l.acc)) continue; const x = by.get(l.pid) || { n: new Set(), d: 0, c: 0 }; x.n.add(l.eid); if (l.side === 'D') x.d += l.amt; else x.c += l.amt; by.set(l.pid, x); }
        const rows = [...by.entries()].sort((a, b) => pName(a[0]).localeCompare(pName(b[0]), 'ja')).map(([k, x]) => [pCell(k), x.n.size, x.d, x.c]); out.push({ title: '取引先別 取引集計（決済口座を除く科目側）', head: ['取引先', '件数', '借方', '貸方'], right: [1, 2, 3], rows: [...rows, { r: ['合計', rows.reduce((s, r) => s + r[1], 0), rows.reduce((s, r) => s + r[2], 0), rows.reduce((s, r) => s + r[3], 0)], c: 'tot' }] }); }
    }
    const period = `${from} 〜 ${to}${dept ? '　部門: ' + dName(dept) : ''}`, hasP = out.some(s => s.rows.some(r => (r.r || r).some(c => c && typeof c === 'object'))) || out.some(s => s.titleCell);
    // タイトルに個人名セルがあるものは title 文字列に展開（画面は名前、印刷・CSVは伏せ）
    const titleHtml = s => s.titleCell ? `${esc(s.title)}<span class="pv">${esc(s.titleCell.v)}</span><span class="pmask">${esc(s.titleCell.m)}</span>` : esc(s.title);
    for (const s of out) if (s.titleCell && typeof s.titleCell === 'string') { s.title += s.titleCell; s.titleCell = null; }
    S.out = { key: t, title, from, to, period, flags: hasP, sections: out };
    const tabsHtml = `<nav>${KINDS.map(([k, l]) => `<a href="#ledger?t=${k}&from=${from}&to=${to}" class="${k === t ? 'on' : ''}">${l}</a>`).join('')}<a href="#journal">仕訳帳 ↗</a><a href="#" onclick="return lgFixed()">固定資産台帳 ↗</a></nav>`;
    const accOpts = (all) => (all ? `<option value="all"${acctSel === 'all' ? ' selected' : ''}>すべての科目</option>` : '<option value="">(選択)</option>') + M.accounts.map(a => `<option value="${a.id}"${String(a.id) === String(acctSel) ? ' selected' : ''}>${esc(a.name)}</option>`).join('');
    const ctl = `<div class="card noprint"><input type="hidden" id="lg_t" value="${t}"><div class="g"><div><label>期</label><select onchange="lgFy(this.value)"><option value="">(期を選ぶ)</option>${fyOpts(from)}</select></div>
      <div><label>開始</label><input type="date" id="lg_f" value="${from}"></div><div><label>終了</label><input type="date" id="lg_to" value="${to}"></div>
      ${t === 'gl' || t === 'sub' ? `<div><label>科目</label><select id="lg_a">${accOpts(t === 'gl')}</select></div><div><label>部門</label><select id="lg_d"><option value="">すべて</option>${opts(M.depts, dept)}</select></div>` : ''}
      ${t === 'sub' ? `<div><label>集計単位</label><select id="lg_g"><option value="partner"${grp === 'partner' ? ' selected' : ''}>取引先別</option><option value="dept"${grp === 'dept' ? ' selected' : ''}>部門別</option></select></div>` : ''}
      ${t === 'cash' || t === 'bank' ? `<div><label>口座</label><select id="lg_w"><option value="">すべて</option>${opts(M.wallets.filter(w => w.kind === (t === 'cash' ? 'cash' : 'bank')), wal)}</select></div>` : ''}
      ${t === 'partner' ? `<div><label>取引先（空=一覧）</label><select id="lg_p"><option value="">一覧</option>${M.partners.map(p => `<option value="${p.id}"${String(p.id) === pid ? ' selected' : ''}>${esc(p.name)}${p.is_personal ? '（個人名）' : ''}</option>`).join('')}</select></div>` : ''}
      <button onclick="lgGo()">表示</button></div>
      <p style="margin:8px 0 0"><button class="sub" onclick="window.print()">🖨 印刷／PDF保存</button> <button class="sub" onclick="lgCsv()">CSV出力</button>
      <label style="display:inline;margin-left:10px"><input type="checkbox" onchange="lgIncp(this.checked)"${S.incp ? ' checked' : ''}> 個人名を出力（印刷・CSV）に含める</label></p>
      <p class="note">個人名の取引先と、その取引の摘要は、画面（黄色）には表示されますが、印刷とCSVでは既定で伏せ字になります。含める場合は上のチェックを入れてください。</p></div>`;
    document.body.classList.toggle('incp', S.incp);
    $('view').innerHTML = `<h2>台帳 — ${esc(title)}</h2>${tabsHtml}${ctl}${notes.map(n => `<p class="${n.startsWith('✅') ? 'ok' : n.startsWith('⚠') ? 'ng' : 'warn'}">${esc(n)}</p>`).join('')}
      <div class="ptitle"><h2>${ENT_NAME} ${esc(title)}</h2><p>${esc(period)}</p></div>${out.map(s => sectionHtml({ ...s, title: '' }).replace('<h3></h3>', `<h3>${titleHtml(s)}</h3>`)).join('') || '<p class="note">該当する明細がありません</p>'}`;
  }
  const ENT_NAME = '一般社団法人 心理社会的リハビリテーション・星心会';
  window.lgFixed = () => { const t = (typeof TABS !== 'undefined' ? TABS : []).find(x => /fix|asset|shisan|kotei|dep/i.test(x[0])); if (t) location.hash = t[0]; else alert('固定資産台帳は別画面で作成中です（公開後にここからリンクします）。'); return false; };
  window.vLedger = vLedger;
})();
