// レオ 請求CSV（児発61・放デイ63）— billing/leo_billing.py と同じ計算（テストで一致を確認）。提出はしない：ファイルを作るだけ
(function (G) {
const SVC = { '61区分1': ['1511', 901], '61区分2': ['JH16', 928], '61区分3': ['JH34', 980],
  '63区分1': ['H574', 574], '63区分2': ['H592', 609], '63区分3': ['H610', 666] };
const ADDON = { 欠席: ['5495', 94], 送迎: ['6240', 54], 子育て: ['5701', 80] };
const KIND = { 児発: '61', 放デイ: '63' }, UNIT_PRICE = 10.36;
const q = v => v === '' || v == null ? '' : '"' + String(v).replace(/"/g, '""') + '"';
const toCsv = rows => rows.map(r => r.map(q).join(',')).join('\r\n') + '\r\n';
const rec = (n, o) => { const r = Array(n).fill(''); for (const k in o) r[k - 1] = o[k] == null ? '' : String(o[k]); return r; };
const nextYm = ym => { let y = +ym.slice(0, 4), m = +ym.slice(4) + 1; if (m > 12) { y++; m = 1; } return y + String(m).padStart(2, '0'); };
const wrap = (d, kind, office, ymn) => [['1', '1', '0', String(d.length), kind, '0', office, '0', '1', ymn, ''], ...d.map((p, i) => ['2', String(i + 2), ...p]), ['3', String(d.length + 2)]];
const mins = t => { if (!t) return null; const [h, m] = String(t).split(':'); return +h * 60 + +m; };
function band(k, s, e, hol) { const a = mins(s), b = mins(e); if (a == null || b == null || b <= a) return null; const d = b - a;
  if (d < 30) return null; if (d <= 90) return '区分1'; if (d <= 180) return '区分2'; if (k === '63' && !hol) return '区分2'; return '区分3'; }
const pad = (n, w) => String(n).padStart(w, '0'), fl = Math.floor;
// children: {名前:{jukyusha_no, city_no, kind, cap_monthly, mushouka, kana, contract_days, contract_start(YYYYMMDD)}}
// records: [{day:'YYYY-MM-DD', child, status:'出席'|'欠席', start, end, pick:bool, drop:bool, holiday, absent_support, kosodate}]
function build(ym, office, children, records) {
  const by = {}; for (const r of records) if (r.day.replace(/-/g, '').slice(0, 6) === ym && children[r.child]) (by[r.child] ||= []).push(r);
  const bills = [], warn = [];
  for (const name of Object.keys(by).sort()) {
    const c = children[name], k = KIND[c.kind], det = {}; let use = 0, absn = 0, kos = 0; const days = [];
    const add = (code, u) => { (det[code] ||= [u, 0])[1]++; };
    for (const r of by[name].sort((a, b) => a.day < b.day ? -1 : 1)) {
      if (r.status === '出席') { const b = band(k, r.start, r.end, r.holiday);
        if (!b) { warn.push(`${name} ${r.day}：時間が無いか30分未満なので算定していません`); continue; }
        add(...SVC[k + b]); use++; if (r.kosodate) { if (kos < 4) { kos++; add(...ADDON.子育て); } else warn.push(`${name} ${r.day}：子育てサポート加算は月4回までなので算定外`); } days.push([r, b]); }
      else if (r.status === '欠席' && r.absent_support) { if (absn < 4) { absn++; add(...ADDON.欠席); days.push([r, '欠席']); } else warn.push(`${name} ${r.day}：欠席時対応は月4回までなので算定外`); }
    }
    const trips = days.filter(([, x]) => x !== '欠席').reduce((s, [r]) => s + !!r.pick + !!r.drop, 0);
    if (trips) { det[ADDON.送迎[0]] = [ADDON.送迎[1], trips]; }
    const units = Object.values(det).reduce((s, [u, t]) => s + u * t, 0), cost = fl(units * UNIT_PRICE);
    const burden = c.mushouka ? 0 : Math.min(fl(cost * 0.1), +c.cap_monthly);
    bills.push({ name, units, cost, burden, benefit: cost - burden, use, k, det, days, c, trips });
  }
  const claims = [], jis = [], cities = {};
  for (const b of bills) (cities[b.c.city_no] ||= []).push(b);
  const S = (a, f) => a.reduce((s, x) => s + x[f], 0);
  for (const city of Object.keys(cities).sort()) { const bs = cities[city];
    claims.push(rec(23, { 1: 'J111', 2: '01', 3: ym, 4: city, 5: office, 6: S(bs, 'benefit'), 7: bs.length, 8: S(bs, 'units'), 9: S(bs, 'cost'), 10: S(bs, 'benefit'), 12: S(bs, 'burden'),
      17: bs.length, 18: S(bs, 'units'), 19: S(bs, 'cost'), 20: S(bs, 'benefit'), 22: S(bs, 'burden') }));
    for (const k of [...new Set(bs.map(b => b.k))].sort()) { const kb = bs.filter(b => b.k === k);
      claims.push(rec(14, { 1: 'J111', 2: '02', 3: ym, 4: city, 5: office, 6: '1', 7: k, 8: kb.length, 9: S(kb, 'units'), 10: S(kb, 'cost'), 11: S(kb, 'benefit'), 13: S(kb, 'burden') })); }
    for (const b of bs) { const c = b.c, h = pad(c.jukyusha_no, 10), first = b.days.length ? Math.min(...b.days.map(([r]) => +r.day.slice(8))) : 1;
      claims.push(rec(35, { 1: 'J121', 2: '01', 3: ym, 4: city, 5: office, 6: h, 8: c.kana || '', 10: '', 11: '1', 12: c.cap_monthly, 13: '1', 20: b.units, 21: b.cost, 22: b.burden, 25: b.burden, 27: b.burden, 28: b.benefit }));
      claims.push(rec(12, { 1: 'J121', 2: '02', 3: ym, 4: city, 5: office, 6: h, 7: b.k, 8: c.contract_start || ym + pad(first, 2), 10: b.use }));
      for (const code of Object.keys(b.det).sort()) { const [u, t] = b.det[code];
        claims.push(rec(11, { 1: 'J121', 2: '03', 3: ym, 4: city, 5: office, 6: h, 7: b.k + code, 8: u, 9: t, 10: u * t })); }
      claims.push(rec(33, { 1: 'J121', 2: '04', 3: ym, 4: city, 5: office, 6: h, 7: b.k, 8: '1', 9: b.use, 10: b.units, 11: Math.round(UNIT_PRICE * 1000), 12: '0', 13: b.cost,
        14: fl(b.cost * 0.1), 15: fl(b.cost * 0.1), 16: b.burden, 21: b.burden, 22: b.benefit }));
      claims.push(rec(11, { 1: 'J121', 2: '05', 3: ym, 4: city, 5: office, 6: h, 7: b.k + '0000', 8: pad((+c.contract_days || 23) * 100, 5), 9: c.contract_start || '', 11: '1' }));
      jis.push(rec(172, { 1: 'J611', 2: '01', 3: ym, 4: city, 5: office, 6: h, 7: '0' + b.k + '1', 34: b.trips || '' }));
      for (const [r, x] of b.days) { const hm = t => t ? t.replace(':', '').padStart(4, '0') : '', ab = x === '欠席';
        jis.push(rec(113, { 1: 'J611', 2: '02', 3: ym, 4: city, 5: office, 6: h, 7: '0' + b.k + '1', 9: r.day.slice(8), 10: ab ? '2' : '', 14: ab ? '' : hm(r.start), 15: ab ? '' : hm(r.end),
          21: !ab && r.pick ? '1' : '', 22: !ab && r.drop ? '1' : '' })); } } }
  return { claim: wrap(claims, 'J11', office, nextYm(ym)), jisseki: wrap(jis, 'J61', office, nextYm(ym)), bills, warn };
}
G.LeoBilling = { build, toCsv, UNIT_PRICE };
})(typeof window !== 'undefined' ? window : globalThis);
