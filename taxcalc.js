// 申告（決算書・内訳・法人税・消費税）の計算ロジック。画面に依存しない純粋関数。acc.js / tax.js から使う（node でも検証できる）。
// 根拠（2026-10 時点で確認。税率改正時は TAXRATES を更新）:
//  法人税率(中小 15%/23.2%) https://www.nta.go.jp/taxes/shiraberu/taxanswer/hojin/5759.htm
//  地方法人税 10.3% https://www.nta.go.jp/taxes/shiraberu/taxanswer/hojin/5759.htm
//  防衛特別法人税 (基準法人税額-500万)×4%・令和8年4月1日以後開始事業年度 https://www.nta.go.jp/publication/pamph/pdf/0025004-109_1.pdf / https://laws.e-gov.go.jp/law/505AC0000000069
//  三重県 法人事業税 3.5/5.3/7.0% https://www.pref.mie.lg.jp/ZEIMU/HP/16336017880.htm
//  三重県 法人県民税 均等割・法人税割1.0% https://www.pref.mie.lg.jp/ZEIMU/HP/16338017882.htm
//  四日市市 法人市民税 均等割・法人税割7.2%(超過税率) https://www.city.yokkaichi.lg.jp/www/contents/1001000000675/index.html
//  特別法人事業税 37%（所得割の標準税率で計算した額×37%） https://www.soumu.go.jp/main_sosiki/jichi_zeisei/czaisei/czaisei_seido/150790_01.html
//  消費税 国7.8%(軽減6.24%)+地方22/78、簡易課税みなし仕入率、インボイス経過措置80%/70% https://www.nta.go.jp/taxes/shiraberu/zeimokubetsu/shohi/keigenzeiritsu/pdf/0023001-111.pdf / https://www.nta.go.jp/taxes/shiraberu/zeimokubetsu/shohi/keigenzeiritsu/invoice_about.htm
//  交際費(中小法人 定額控除800万円 or 飲食費50%) https://www.nta.go.jp/taxes/shiraberu/taxanswer/hojin/5265.htm
(function (root) {
  const fl = Math.floor, fK = v => fl(v / 1000) * 1000, fH = v => fl(v / 100) * 100;
  const TAXRATES = {
    corp: { low: 0.15, high: 0.232, lowLimit: 8000000 },           // 中小法人（年800万円以下15%・租特 令和9年3月31日まで）
    chihou: 0.103,                                                  // 地方法人税
    boei: { rate: 0.04, deduct: 5000000, from: '2026-04-01' },      // 防衛特別法人税
    mieBiz: [[4000000, 0.035], [8000000, 0.053], [Infinity, 0.07]], // 三重県 法人事業税（所得割・普通法人・資本金1億円以下）
    special: 0.37,                                                  // 特別法人事業税
    mieKinto: [[10e6, 22000], [100e6, 55000], [1e9, 143000], [5e9, 594000], [Infinity, 880000]], // 三重県 均等割（資本金等）
    mieHojin: 0.01,                                                 // 県 法人税割
    ykKinto: [[10e6, 50000, 120000], [100e6, 130000, 150000], [1e9, 160000, 400000], [5e9, 410000, 1750000], [Infinity, 410000, 3000000]], // 四日市市 均等割（50人以下, 50人超）
    ykHojin: 0.072,                                                 // 市 法人税割(超過税率)
    cons: { nat: 0.078, natR: 0.0624, loc: 22 / 78, deemed: { 1: 0.9, 2: 0.8, 3: 0.7, 4: 0.6, 5: 0.5, 6: 0.4 } }
  };
  const bsType = t => t === 'asset' || t === 'liability' || t === 'equity';
  const nat = (type, d, c) => (type === 'asset' || type === 'expense' ? d - c : c - d);

  // lines: [{side,amount,account_id,tax_code,acc_entries:{entry_date,partner_id,memo}}]
  function ledger(lines, accs, from, to) {
    const A = new Map(accs.map(a => [a.id, { ...a, d: 0, c: 0, pd: 0, pc: 0, fd: 0, fc: 0 }]));
    // d/c: 期末累計(BS)・期間内(PL), pd/pc: 期首前の累計(BS用)、fd/fc: 期間内
    let plBefore = 0;
    for (const l of lines) {
      const a = A.get(l.account_id), dt = l.acc_entries?.entry_date; if (!a || !dt || dt > to) continue;
      const D = l.side === 'D' ? l.amount : 0, Cc = l.side === 'C' ? l.amount : 0, before = dt < from || l.acc_entries.kind === 'opening';
      if (bsType(a.type)) { a.d += D; a.c += Cc; if (before) { a.pd += D; a.pc += Cc; } else { a.fd += D; a.fc += Cc; } }
      else if (before) plBefore += nat(a.type, D, Cc) * (a.type === 'revenue' ? 1 : -1);
      else { a.d += D; a.c += Cc; a.fd += D; a.fc += Cc; }
    }
    const rows = [...A.values()].map(a => ({ id: a.id, name: a.name, type: a.type, category: a.category || '', sort: a.sort || 0, bal: nat(a.type, a.d, a.c), open: bsType(a.type) ? nat(a.type, a.pd, a.pc) : 0, flow: nat(a.type, a.fd, a.fc) }))
      .filter(r => r.bal || r.open || r.flow).sort((x, y) => x.sort - y.sort);
    return { rows, plBefore };
  }

  const COST_CATS = ['期首商品棚卸', '当期商品仕入', '他勘定振替高(商)'];
  function statements(lg) {
    const R = lg.rows, sum = f => R.filter(f).reduce((s, r) => s + r.bal, 0), by = f => R.filter(f);
    const revSales = by(r => r.type === 'revenue' && r.category === '売上高');
    const costRows = by(r => r.type === 'expense' && COST_CATS.includes(r.category)), endInv = by(r => r.type === 'revenue' && r.category === '期末商品棚卸');
    const sgaRows = by(r => r.type === 'expense' && r.category === '販売管理費');
    const nonOpIn = by(r => r.type === 'revenue' && r.category === '営業外収益'), nonOpOut = by(r => r.type === 'expense' && r.category === '営業外費用');
    const spIn = by(r => r.type === 'revenue' && r.category === '特別利益'), spOut = by(r => r.type === 'expense' && r.category === '特別損失');
    const taxRows = by(r => r.type === 'expense' && (r.category === '法人税等' || r.category === '法人税等調整額'));
    const known = new Set([...revSales, ...costRows, ...endInv, ...sgaRows, ...nonOpIn, ...nonOpOut, ...spIn, ...spOut, ...taxRows].map(r => r.id));
    const otherRev = by(r => r.type === 'revenue' && !known.has(r.id)), otherExp = by(r => r.type === 'expense' && !known.has(r.id));
    const t = a => a.reduce((s, r) => s + r.bal, 0);
    const sales = t(revSales), cogs = t(costRows) - t(endInv), gross = sales - cogs, sga = t(sgaRows) + t(otherExp), opInc = gross - sga;
    const nIn = t(nonOpIn) + t(otherRev), nOut = t(nonOpOut), ordinary = opInc + nIn - nOut, spI = t(spIn), spO = t(spOut), pretax = ordinary + spI - spO, tax = t(taxRows), net = pretax - tax;
    const pl = { revSales, costRows, endInv, sgaRows: [...sgaRows, ...otherExp], nonOpIn: [...nonOpIn, ...otherRev], nonOpOut, spIn, spOut, taxRows, sales, cogs, gross, sga, opInc, nIn, nOut, ordinary, spI, spO, pretax, tax, net };
    // 貸借対照表
    const bsr = R.filter(r => bsType(r.type)), cum = lg.plBefore + net; // 繰越損益（累計）= 前期までの損益 + 当期純損益
    const A = bsr.filter(r => r.type === 'asset'), L = bsr.filter(r => r.type === 'liability'), E = bsr.filter(r => r.type === 'equity');
    const totA = t(A), totL = t(L), totE = t(E);
    const retainedOpen = (E.find(r => r.category === '繰越利益剰余金')?.open ?? 0) + lg.plBefore; // 期首の繰越利益剰余金（前期までの損益込み）
    const bs = { A, L, E, totA, totL, totE, plBefore: lg.plBefore, net, cumPL: cum, totalLE: totL + totE + cum, diff: totA - (totL + totE + cum), retainedOpen };
    // 社員資本等変動計算書: 列=資本金/資本剰余金/利益剰余金(繰越・その他)/評価・その他/合計
    const colOf = r => r.category === '資本金' ? 'cap' : /資本準備金|その他資本剰余金|新株式申込証拠金/.test(r.category) ? 'cs' : /繰越利益剰余金|利益準備金|任意積立金/.test(r.category) ? 're' : 'oth';
    const eq = { cap: { open: 0, close: 0 }, cs: { open: 0, close: 0 }, re: { open: lg.plBefore, close: cum }, oth: { open: 0, close: 0 } };
    for (const r of E) { const c = eq[colOf(r)]; c.open += r.open; c.close += r.bal; }
    for (const k of Object.keys(eq)) { const c = eq[k]; c.ni = k === 're' ? net : 0; c.other = c.close - c.open - c.ni; }
    return { pl, bs, eq };
  }

  // 勘定科目内訳明細書用: 科目名の配列について 取引先別/摘要別 の残高(bal)または期間発生額(flow)
  function breakdown(lines, accs, names, from, to, mode, key) {
    const ids = new Map(accs.filter(a => names.some(n => typeof n === 'string' ? a.name === n : n.test(a.name))).map(a => [a.id, a]));
    const m = new Map();
    for (const l of lines) {
      const a = ids.get(l.account_id), e = l.acc_entries; if (!a || !e || e.entry_date > to) continue;
      if (mode === 'flow' && e.entry_date < from) continue;
      const k = key === 'memo' ? (e.memo || '(摘要なし)') : key === 'acct' ? a.name : (e.partner_id ?? 0), v = nat(a.type, l.side === 'D' ? l.amount : 0, l.side === 'C' ? l.amount : 0);
      const o = m.get(k) || { key: k, amount: 0, accts: new Set() }; o.amount += v; o.accts.add(a.name); m.set(k, o);
    }
    return [...m.values()].filter(o => o.amount).map(o => ({ ...o, accts: [...o.accts].join('・') })).sort((x, y) => Math.abs(y.amount) - Math.abs(x.amount));
  }

  // ---------------- 法人税・地方税 ----------------
  const tier = (tbl, v) => tbl.find(t => v <= t[0]);
  function bizTax(income) { let r = 0, prev = 0; for (const [lim, rate] of TAXRATES.mieBiz) { if (income > prev) r += (Math.min(income, lim) - prev) * rate; prev = lim; } return fH(r); }
  function corpTax(income, months) {
    const lim = TAXRATES.corp.lowLimit * months / 12, i = fK(Math.max(0, income));
    return fl(Math.min(i, lim) * TAXRATES.corp.low + Math.max(0, i - lim) * TAXRATES.corp.high); // 申告書の法人税額欄は端数処理前（確定額は別表一13で千円未満切捨て）
  }
  // inp: {preTax, taxBooked, adds:[{label,amount,kind}], subs:[...], loss, capital, emp50, months, fyStart, ...}
  function hojin(inp, fs, fyStart) {
    const months = inp.months || 12;
    const ent = entertain(inp, fs, months), dep = inp.dep || [], depExcess = dep.reduce((s, r) => s + Math.max(0, (+r.dep || 0) - (+r.limit || 0)), 0);
    const cr0 = +inp.credit || 0;
    const autoAdds = [{ label: '損金経理をした納税充当金（帳簿の法人税等から所得税額控除分を除く）', amount: fs.pl.tax - cr0, kind: '留保', auto: true }];
    if (cr0) autoAdds.push({ label: '法人税額から控除される所得税額（別表四 29・別表六）', amount: cr0, kind: '社外流出', auto: true });
    if (ent.disallow) autoAdds.push({ label: '交際費等の損金不算入額（別表十五）', amount: ent.disallow, kind: '社外流出', auto: true });
    if (depExcess) autoAdds.push({ label: '減価償却の償却超過額（別表十六）', amount: depExcess, kind: '留保', auto: true });
    const adds = [...autoAdds, ...(inp.adds || [])], subs = inp.subs || [];
    const sA = adds.reduce((s, r) => s + (+r.amount || 0), 0), sS = subs.reduce((s, r) => s + (+r.amount || 0), 0);
    const preTax = fs.pl.net; // 当期純利益（税等控除後）
    const sub1 = preTax + sA - sS, loss = +inp.loss || 0, income0 = sub1 - loss, income = Math.max(0, fK(income0));
    const hz = corpTax(income, months), chihou = fl(fK(hz) * TAXRATES.chihou); // 別表一31は端数処理前（確定額40は100円未満切捨て）
    const boeiOn = fyStart >= TAXRATES.boei.from, boei = boeiOn ? fH(Math.max(0, fK(hz) - TAXRATES.boei.deduct * months / 12) * TAXRATES.boei.rate) : 0;
    const cap = +inp.capital || 0, emp50 = inp.emp50 !== false;
    const kintoPref = tier(TAXRATES.mieKinto, cap)[1], kintoCity = tier(TAXRATES.ykKinto, cap)[emp50 ? 1 : 2], mm = months / 12;
    const ovP = inp.kintoPrefOv !== '' && inp.kintoPrefOv != null ? +inp.kintoPrefOv : null, ovC = inp.kintoCityOv !== '' && inp.kintoCityOv != null ? +inp.kintoCityOv : null;
    const kPref = ovP != null ? ovP : fl(kintoPref * mm), kCity = ovC != null ? ovC : fl(kintoCity * mm);
    const zHzPref = fH(fK(hz) * TAXRATES.mieHojin), zHzCity = fH(fK(hz) * TAXRATES.ykHojin);
    const biz = bizTax(income), spBiz = fH(biz * TAXRATES.special);
    const credit0 = +inp.credit || 0, hzNet = fK(Math.max(0, hz - credit0));
    const total = hzNet + fH(chihou) + boei + kPref + kCity + zHzPref + zHzCity + biz + spBiz;
    // 別表一 の中間納付・税額控除
    const credit = +inp.credit || 0, interim = +inp.interim || 0;
    return { months, ent, depExcess, adds, subs, sA, sS, preTax, sub1, loss, income0, income, hz, chihou, boei, boeiOn, kPref, kCity, zHzPref, zHzCity, biz, spBiz, total, credit, interim,
      kintoPref, kintoCity, hzNet, final: Math.max(0, hzNet - interim) };
  }
  function entertain(inp, fs, months) {
    const acct = fs.pl.sgaRows.filter(r => r.name === '交際費').reduce((s, r) => s + r.bal, 0), total = inp.entertainTotal != null && inp.entertainTotal !== '' ? +inp.entertainTotal : acct;
    const small = +inp.entSmall || 0, meal = +inp.entMeal || 0, target = Math.max(0, total - small);
    const lim1 = 8000000 * months / 12, d1 = Math.max(0, target - lim1), d2 = Math.max(0, target - meal * 0.5);
    const disallow = meal > 0 ? Math.min(d1, d2) : d1;
    return { acct, total, small, meal, target, lim1, d1, d2, disallow, method: meal > 0 && d2 < d1 ? '接待飲食費の50%' : '定額控除限度額(800万円)' };
  }

  // ---------------- 消費税（税込経理） ----------------
  function shohi(lines, accs, from, to, inp, fyEnd) {
    const A = new Map(accs.map(a => [a.id, a])), s = { S10: 0, S8R: 0, EXEMPT: 0, NA_REV: 0, P10: 0, P8R: 0 };
    const byAcc = {};
    for (const l of lines) {
      const e = l.acc_entries, a = A.get(l.account_id); if (!e || !a || e.entry_date < from || e.entry_date > to || !l.tax_code) continue;
      const cr = l.side === 'C' ? l.amount : -l.amount;
      if (a.type === 'revenue') { if (l.tax_code === 'S10' || l.tax_code === 'S8R' || l.tax_code === 'EXEMPT') { s[l.tax_code] += cr; (byAcc[a.name + '|' + l.tax_code] ??= 0); byAcc[a.name + '|' + l.tax_code] += cr; } else s.NA_REV += cr; }
      else if (a.type === 'expense' || a.type === 'asset') { if (l.tax_code === 'P10' || l.tax_code === 'P8R') { s[l.tax_code] -= cr; byAcc[a.name + '|' + l.tax_code] = (byAcc[a.name + '|' + l.tax_code] || 0) - cr; } }
    }
    const C = TAXRATES.cons;
    const base10 = fK(s.S10 * 100 / 110), base8 = fK(s.S8R * 100 / 108), taxSales10 = fl(base10 * C.nat), taxSales8 = fl(base8 * C.natR), salesTax = taxSales10 + taxSales8;
    const taxableSalesEx = s.S10 * 100 / 110 + s.S8R * 100 / 108, denom = taxableSalesEx + s.EXEMPT, ratio = denom > 0 ? taxableSalesEx / denom : 1;
    const p10 = s.P10, p8 = s.P8R;
    const tax10 = p10 * 7.8 / 110, tax8 = p8 * 6.24 / 108, totPurTax = tax10 + tax8;
    const u80 = +inp.u80 || 0, u70 = +inp.u70 || 0, reduce = u80 * 7.8 / 110 * 0.2 + u70 * 7.8 / 110 * 0.3;
    const creditAll = Math.max(0, totPurTax - reduce), factor = totPurTax > 0 ? creditAll / totPurTax : 1;
    const A_ = (+inp.pA || 0), B_ = (+inp.pB || 0), tA = A_ * 7.8 / 110, tB = B_ * 7.8 / 110, tC = Math.max(0, totPurTax - tA - tB);
    const full = ratio >= 0.95 && taxableSalesEx <= 500e6;
    const creditProp = full ? creditAll : creditAll * ratio, creditInd = full ? creditAll : (tA + tC * ratio) * factor;
    const best = Math.max(creditProp, creditInd), method = full ? '全額控除（課税売上割合95%以上）' : creditInd >= creditProp ? '個別対応方式' : '一括比例配分方式';
    const mk = (credit) => { const n = salesTax - fl(credit), nat_ = fH(n); const loc = fH(nat_ * C.loc); return { credit: fl(credit), nat: nat_, loc, total: nat_ + loc }; };
    const gen = mk(best), genProp = mk(creditProp), genInd = mk(creditInd);
    const kind = +inp.kind || 5, rate = C.deemed[kind], simpCredit = fl(salesTax * rate), simp = mk(simpCredit); simp.rate = rate; simp.kind = kind;
    const interim = +inp.interimC || 0, taxable = inp.taxable !== false;
    return { s, base10, base8, taxSales10, taxSales8, salesTax, taxableSalesEx, ratio, p10, p8, tax10, tax8, totPurTax, reduce, creditAll, creditProp, creditInd, tA, tB, tC, full, method, gen, genProp, genInd, simp, interim, taxable, byAcc,
      preferred: gen.total <= simp.total ? '原則課税' : '簡易課税' };
  }

  // 同族会社判定（社員・株主ごとの議決権/株式数, グループ番号）
  function doozoku(rows) {
    const g = new Map(); let tot = 0;
    for (const r of rows || []) { const v = +r.votes || 0; if (!v) continue; tot += v; const k = String(r.group || r.name || '?'); g.set(k, (g.get(k) || 0) + v); }
    const top = [...g.entries()].sort((a, b) => b[1] - a[1])[0];
    return { total: tot, groups: [...g.entries()].sort((a, b) => b[1] - a[1]), topShare: tot && top ? top[1] / tot : 0, isDoozoku: tot > 0 && top[1] / tot > 0.5 };
  }

  const api = { TAXRATES, ledger, statements, breakdown, hojin, entertain, shohi, doozoku, corpTax, bizTax, fK, fH };
  if (typeof module !== 'undefined') module.exports = api; else Object.assign(root, { TX: api });
})(typeof window !== 'undefined' ? window : globalThis);
