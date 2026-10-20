/* 銀行・カード明細CSVの形式判定と読み取り（ブラウザ/Node共用） */
(function (G) {
  function parseCsvText(text) {
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) { const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true; else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); if (row.some(x => x.trim())) rows.push(row); row = []; cur = ''; }
      else cur += c; }
    row.push(cur); if (row.some(x => x.trim())) rows.push(row); return rows;
  }
  const numOf = s => { const t = String(s ?? '').replace(/[,\s円¥￥\\]/g, '').replace(/^▲/, '-'); return t && /^-?\d+$/.test(t) ? parseInt(t, 10) : null; };
  function normDate(s) {
    s = String(s ?? '').trim();
    let m = s.match(/^(\d{4})[\/\-.年](\d{1,2})[\/\-.月](\d{1,2})/); if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    m = s.match(/^(\d{4})(\d{2})(\d{2})$/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/^R?(\d{1,2})[\/.](\d{1,2})[\/.](\d{1,2})$/); if (m) return `${2018 + +m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`; return null;
  }
  const clean = s => String(s ?? '').replace(/\s+$/, '').replace(/^\s+/, '');
  const last4 = s => { const m = String(s).match(/\*{4}-\*{4}-\*{4}-(\d{4})/); return m ? m[1] : ''; };

  /* 三十三銀行（レコード区分 1=口座, 2=明細, 8=合計。ヘッダなし） */
  function p33(all) {
    const rows = [], errors = []; let fin = null;
    for (const r of all) { if (r[0].trim() !== '2') continue;
      const date = normDate(r[1]), o = numOf(r[3]), i = numOf(r[4]), b = numOf(r[5]);
      if (!date || !(o || i)) { errors.push('読めない行: ' + r.join(',').slice(0, 60)); continue; }
      rows.push({ date, descr: clean(r[2]), amount: (i ?? 0) - (o ?? 0), balance: b }); fin = b; }
    return { format: '三十三銀行', kind: 'bank', rows, errors, finalBalance: fin };
  }
  /* JCB法人カード（百五JCB・ANA JCB）WEB明細 */
  function pJcb(all, hi) {
    const h = all[hi].map(c => c.trim()), f = re => h.findIndex(c => re.test(c));
    const iU = f(/^ご利用者/), iD = f(/^ご利用日/), iS = f(/^ご利用先/), iA = f(/^ご利用金額/), iP = f(/^お支払い金額/), iX = f(/^摘要/);
    const pay = all.find(r => r.some(c => /今回のお支払日/.test(c))), payDate = pay ? normDate(pay[pay.length - 1]) : null;
    const tot = all.find(r => r.some(c => /^今回のお支払金額合計/.test(c.trim()))), total = tot ? numOf(tot[tot.length - 1]) : null;
    const rows = [], errors = [];
    for (const r of all.slice(hi + 1)) { if (r.length < 5) continue;
      let date = normDate(r[iD]); const a = numOf(r[iA]) ?? numOf(r[iP]);
      if (!a) { errors.push('金額を読めない行: ' + r.join(',').slice(0, 60)); continue; }
      let descr = clean(r[iS]); if (!date) { date = payDate; descr += '（支払日で計上・利用日なし）'; }
      if (!date) { errors.push('日付を読めない行: ' + r.join(',').slice(0, 60)); continue; }
      const k = last4(r[iU]), x = iX >= 0 ? clean(r[iX]) : '';
      rows.push({ date, descr: (k ? `[${k}] ` : '') + descr + (x ? ' ' + x : ''), amount: -a, balance: null, card: k }); }
    return { format: 'JCB法人カード', kind: 'card', rows, errors, finalBalance: null, payDate, payTotal: total };
  }
  /* freee Mastercard（ライフカード）明細 */
  function pLife(all, hi) {
    const h = all[hi].map(c => c.trim()), f = re => h.findIndex(c => re.test(c));
    const iD = f(/^利用日/), iS = f(/^利用先/), iA = f(/^利用金額/);
    const pay = all.find(r => r[0].trim() === '支払日'), payDate = pay ? normDate(pay[1]) : null;
    const tot = all.find(r => /^当月ご請求金額\s*合計/.test(r[0].trim())), total = tot ? numOf(tot[1]) : null;
    const rows = [], errors = [];
    for (const r of all.slice(hi + 1)) { const date = normDate(r[iD] ?? ''); if (!date) break;
      const a = numOf(r[iA]); if (!a) { errors.push('金額を読めない行: ' + r.join(',').slice(0, 60)); continue; }
      rows.push({ date, descr: clean(r[iS]), amount: -a, balance: null }); }
    return { format: 'freee Mastercard（ライフカード）', kind: 'card', rows, errors, finalBalance: null, payDate, payTotal: total };
  }
  /* 汎用（住信SBIなど 見出し: 日付・内容・出金・入金・残高） */
  function pGeneric(all) {
    const errors = [];
    const hi = all.findIndex(r => r.some(c => /日付|取引日|年月日|日　付/.test(c)) && r.some(c => /残高|金額|出金|入金|支払|預入|引出/.test(c)));
    if (hi < 0) return { format: '不明', rows: [], errors: ['ヘッダ行（日付・金額/出金/入金・残高）が見つかりません'] };
    const h = all[hi].map(c => c.trim()), f = re => h.findIndex(c => re.test(c));
    const iD = f(/日付|取引日|年月日/), iT = f(/摘要|内容|取引内容|お取引|振込人|備考/), iO = f(/出金|支払|引出|お支払/), iI = f(/入金|預入|お預|お預入/), iA = f(/^金額|取引金額/), iB = f(/残高/);
    const rows = [];
    for (const r of all.slice(hi + 1)) {
      const date = normDate(r[iD] ?? ''); if (!date) { if (r.join('').trim()) errors.push(`日付を読めない行: ${r.join(',').slice(0, 60)}`); continue; }
      let amount = null;
      if (iO >= 0 || iI >= 0) { const o = numOf(r[iO]), i = numOf(r[iI]); if (o || i) amount = (i ?? 0) - (o ?? 0); } else if (iA >= 0) amount = numOf(r[iA]);
      if (amount === null || amount === 0) { errors.push(`金額を読めない行: ${r.join(',').slice(0, 60)}`); continue; }
      rows.push({ date, descr: clean(iT >= 0 ? r[iT] : r.filter((_, k) => k !== iD).join(' ')), amount, balance: iB >= 0 ? numOf(r[iB]) : null });
    }
    // 最終残高: 日付が最も新しい行（新しい順のCSVにも対応）
    let fin = null; if (rows.length && rows.some(r => r.balance !== null)) { const desc = rows[0].date > rows[rows.length - 1].date; fin = (desc ? rows[0] : rows[rows.length - 1]).balance; }
    return { format: h.includes('メモ') && h.includes('残高(円)') ? '住信SBIネット銀行' : '汎用', kind: 'bank', rows, errors, finalBalance: fin };
  }
  function parseStatement(text) {
    const all = parseCsvText(text);
    if (all.length && all[0][0].trim() === '1' && all.some(r => r[0].trim() === '2' && normDate(r[1]))) return p33(all);
    let hi = all.findIndex(r => r.some(c => /^ご利用日$/.test(c.trim())) && r.some(c => /^ご利用先/.test(c.trim())));
    if (hi >= 0) return pJcb(all, hi);
    hi = all.findIndex(r => r.some(c => c.trim() === '利用日') && r.some(c => c.trim() === '利用先') && r.some(c => c.trim() === '利用金額'));
    if (hi >= 0) return pLife(all, hi);
    return pGeneric(all);
  }
  const api = { parseCsvText, numOf, normDate, parseStatement };
  if (typeof module !== 'undefined') module.exports = api; else Object.assign(G, api);
})(this);
