// 処遇改善加算の計算・PDF文面の読み取り・CSV。画面（shogu.js）と node tools/shogu_check.js が共用する。
// 金額は円の整数だけ。抽出した小数は丸めず、記録しない。
(function (root) {
  const PPM = 1000000; // 加算率。13.4% = 134000 / 1000000
  // 告示の加算率。'13.4' のように百分率の文字から整数化する（浮動小数の掛け算はしない）。出典は rateTable の注。
  const fill = (a, b, c, d) => ({ 'Ⅰ': a, 'Ⅱ': b, 'Ⅲ': c, 'Ⅳ': d });
  const fill8 = (ai, ar, bi, br, c, d) => ({ 'Ⅰイ': ai, 'Ⅰロ': ar, 'Ⅱイ': bi, 'Ⅱロ': br, 'Ⅲ': c, 'Ⅳ': d });
  const p = text => {
    const [a, b = '0'] = String(text).split('.');
    if (!/^\d+$/.test(a) || !/^\d$/.test(b)) throw new Error('加算率は小数第1位まで: ' + text);
    return Number(a) * 10000 + Number(b) * 1000;
  };
  const RATES = {
    '児童発達支援': { r6: fill(p('13.1'), p('12.8'), p('11.8'), p('9.6')), r8: fill8(p('15.2'), p('15.8'), p('14.9'), p('15.5'), p('13.9'), p('11.7')) },
    '放課後等デイサービス': { r6: fill(p('13.4'), p('13.1'), p('12.1'), p('9.8')), r8: fill8(p('15.5'), p('16.1'), p('15.2'), p('15.8'), p('14.2'), p('11.9')) },
    '生活介護': { r6: fill(p('8.1'), p('8.0'), p('6.7'), p('5.5')), r8: fill8(p('9.3'), p('9.7'), p('9.2'), p('9.6'), p('7.9'), p('6.7')) },
    '居宅介護': { r6: fill(p('41.7'), p('40.2'), p('34.7'), p('27.3')), r8: fill8(p('44.6'), p('45.6'), p('43.1'), p('44.1'), p('37.6'), p('30.2')) },
    '就労継続支援Ｂ型': { r6: fill(p('9.3'), p('9.1'), p('7.6'), p('6.2')), r8: fill8(p('10.5'), p('10.9'), p('10.3'), p('10.7'), p('8.8'), p('7.4')) },
    // 令和8年6月新設。区分Ⅰ〜Ⅳは無い。
    '計画相談支援': { r6: null, r8: { '新設': p('5.1') } },
    '障害児相談支援': { r6: null, r8: { '新設': p('5.1') } },
    '日中一時支援': { r6: null, r8: null },
  };
  const SERVICES = {
    leo: ['児童発達支援', '放課後等デイサービス'],
    nicchu: ['日中一時支援'],
    chamu: ['生活介護'],
    kintoun: ['居宅介護'],
    rydeen: ['就労継続支援Ｂ型'],
    suishodama: ['計画相談支援', '障害児相談支援'],
  };
  const SERVICE_ORDER = ['医療型児童発達支援', '放課後等デイサービス', '児童発達支援', '就労継続支援Ｂ型', '就労継続支援B型', '生活介護', '居宅介護', '計画相談支援', '障害児相談支援', '日中一時支援'];
  const HALF_FROM = '2025-04'; // 月額賃金改善要件Ⅰの本適用（令和7年4月）

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const zenDigit = s => String(s ?? '').replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/．/g, '.').replace(/，/g, ',').replace(/　/g, ' ');
  const ym = d => { const s = String(d || ''); const m = s.match(/(\d{4})-(\d{2})/); return m ? m[1] + '-' + m[2] : ''; };
  const monthDate = ymStr => ymStr && /^\d{4}-\d{2}$/.test(ymStr) ? ymStr + '-01' : '';
  function fiscalYearOf(month) {
    const s = ym(month); if (!s) return null;
    const y = +s.slice(0, 4), m = +s.slice(5, 7);
    return m >= 4 ? y : y - 1;
  }
  function monthsOfFy(fy) {
    const y = +fy; const out = [];
    for (let m = 4; m <= 12; m++) out.push(y + '-' + String(m).padStart(2, '0'));
    for (let m = 1; m <= 3; m++) out.push((y + 1) + '-' + String(m).padStart(2, '0'));
    return out;
  }
  function sumYen(list) {
    let n = 0n;
    for (const v of list) {
      if (v == null || v === '') continue;
      if (!Number.isSafeInteger(+v)) throw new Error('円ではない値');
      n += BigInt(v);
    }
    if (n > BigInt(Number.MAX_SAFE_INTEGER) || n < -BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('金額が大きすぎます');
    return Number(n);
  }
  function biNum(n) {
    if (n > BigInt(Number.MAX_SAFE_INTEGER) || n < -BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('金額が大きすぎます');
    return Number(n);
  }

  // 空欄は null。整数と、小数部が全部0のものだけ円にする。それ以外の小数は丸めない。
  function parseYenInput(s) {
    if (s == null || String(s).trim() === '') return { ok: true, yen: null, raw: '' };
    const raw = String(s).trim();
    let t = zenDigit(raw).replace(/[円¥￥,\s]/g, '');
    if (/^\d+$/.test(t)) {
      if (t.length > 15) return { ok: false, yen: null, raw, reason: 'huge' };
      const yen = Number(t);
      return Number.isSafeInteger(yen) ? { ok: true, yen, raw } : { ok: false, yen: null, raw, reason: 'huge' };
    }
    if (/^\d+\.0+$/.test(t)) return parseYenInput(t.slice(0, t.indexOf('.')));
    if (/^\d+\.\d+$/.test(t)) return { ok: false, yen: null, raw, reason: 'decimal' };
    return { ok: false, yen: null, raw, reason: 'invalid' };
  }
  function parsePercent(s) {
    if (s == null || String(s).trim() === '') return { ok: true, ppm: null };
    const t = zenDigit(s).replace(/%/g, '').trim();
    if (!/^\d+(\.\d+)?$/.test(t)) return { ok: false, ppm: null, reason: 'invalid' };
    const [a, b = ''] = t.split('.');
    if (b.length > 4) return { ok: false, ppm: null, reason: 'decimal' };
    const ppm = Number(a) * 10000 + Number(b.padEnd(4, '0'));
    if (!Number.isSafeInteger(ppm)) return { ok: false, ppm: null, reason: 'huge' };
    return { ok: true, ppm };
  }
  function formatPercent(ppm) {
    if (ppm == null || ppm === '') return '';
    const n = Math.abs(+ppm);
    const int = Math.floor(n / 10000);
    const frac = String(n % 10000).padStart(4, '0').replace(/0+$/, '');
    return (ppm < 0 ? '-' : '') + int + (frac ? '.' + frac : '');
  }

  function canonicalService(name) {
    const t = String(name || '').replace(/B型/g, 'Ｂ型').replace(/\s/g, '');
    if (RATES[t]) return t;
    if (t === '児発') return '児童発達支援';
    if (t === '放デイ') return '放課後等デイサービス';
    if (t === 'Ｂ型' || t === '就労Ｂ' || t === '就労B') return '就労継続支援Ｂ型';
    return t;
  }
  function servicesFor(officeId) { return (SERVICES[officeId] || []).slice(); }

  // 令和6年6月〜令和8年5月は表1-1（このポータルの請求コードが「令和8年5月まで」と呼ぶ率）。
  // 令和8年6月以降は表1-2。根拠: 「福祉・介護職員等処遇改善加算等に関する基本的考え方並びに事務処理手順及び様式例の提示について」（令和8年度分）別紙1。
  function ratePeriod(month) {
    const s = ym(month);
    if (!s || s < '2024-06') return null;
    return s < '2026-06' ? 'r6' : 'r8';
  }
  function rateTable(service, month) {
    const key = canonicalService(service);
    const period = ratePeriod(month);
    if (!period || !RATES[key]) return null;
    return RATES[key][period];
  }
  function categoriesFor(service, month) {
    const t = rateTable(service, month);
    return t ? Object.keys(t) : [];
  }
  function lookupRates(service, month, category) {
    const t = rateTable(service, month);
    if (!t) return { rateGot: null, rateIv: null };
    const cat = normCategory(category);
    const rateGot = Object.prototype.hasOwnProperty.call(t, cat) ? t[cat] : null;
    const rateIv = Object.prototype.hasOwnProperty.call(t, 'Ⅳ') ? t['Ⅳ'] : null;
    return { rateGot, rateIv };
  }
  function normCategory(s) {
    let t = zenDigit(s).replace(/[\s　()（）加算区分処遇改善]/g, '');
    t = t.replace(/Ⅰロ|Iロ/i, 'Ⅰロ').replace(/Ⅰイ|Iイ/i, 'Ⅰイ').replace(/Ⅱロ|IIロ/i, 'Ⅱロ').replace(/Ⅱイ|IIイ/i, 'Ⅱイ');
    t = t.replace(/IV/i, 'Ⅳ').replace(/III/i, 'Ⅲ').replace(/II/i, 'Ⅱ').replace(/I/i, 'Ⅰ');
    t = t.replace(/４/g, 'Ⅳ').replace(/３/g, 'Ⅲ').replace(/２/g, 'Ⅱ').replace(/１/g, 'Ⅰ');
    if (t === '新設' || t === '相談') return '新設';
    const m = t.match(/Ⅰロ|Ⅰイ|Ⅱロ|Ⅱイ|Ⅲ|Ⅳ|Ⅱ|Ⅰ/);
    return m ? m[0] : String(s || '').trim();
  }

  // 新加算Ⅳ相当額。手入力があればその整数。加算Ⅳなら受領額そのもの。それ以外は 受領額×Ⅳの率÷取得区分の率（1円未満切り捨て）。
  function ivEquivalent(rec) {
    if (!rec) return { yen: null, how: 'missing' };
    if (rec.iv_manual) {
      const p = parseYenInput(rec.iv_yen);
      return p.ok && p.yen != null ? { yen: p.yen, how: 'manual' } : { yen: null, how: 'manual-blank' };
    }
    const amount = parseYenInput(rec.amount_yen);
    if (!amount.ok || amount.yen == null) return { yen: null, how: 'no-amount' };
    const cat = normCategory(rec.category);
    if (cat === 'Ⅳ') return { yen: amount.yen, how: 'category-iv' };
    const got = rec.rate_got_ppm != null ? +rec.rate_got_ppm : null;
    const iv = rec.rate_iv_ppm != null ? +rec.rate_iv_ppm : null;
    if (got == null || iv == null || got <= 0) return { yen: null, how: 'no-rate' };
    return { yen: biNum((BigInt(amount.yen) * BigInt(iv)) / BigInt(got)), how: 'ratio' };
  }
  // 毎月の配分×2 が Ⅳ相当額以上か。半分に満たない1円も未達（奇数は切り上げ側）。
  function halfStatus(month, ivYen, monthlyYen) {
    const m = ym(month);
    if (!m) return { code: 'nodata', label: '未判定' };
    if (m < HALF_FROM) return { code: 'exempt', label: '対象外（令和7年3月まで経過措置）' };
    if (ivYen == null) return { code: 'unknown', label: '未判定（Ⅳ相当額が未確定）' };
    const need = biNum((BigInt(ivYen) + 1n) / 2n);
    const ok = BigInt(monthlyYen || 0) * 2n >= BigInt(ivYen);
    return { code: ok ? 'pass' : 'fail', label: ok ? '達成' : '未達', need };
  }
  function floorStatus(grossYen, baselineYen) {
    if (grossYen == null || grossYen === '') return { code: 'blank', label: '支払総額の未入力' };
    if (baselineYen == null || baselineYen === '') return { code: 'nobase', label: '普段の給与が未入力' };
    const g = +grossYen, b = +baselineYen;
    if (g < b) return { code: 'under', label: '下限割れ', short: b - g };
    if (g > b) return { code: 'over', label: '普段の額を上回る' };
    return { code: 'same', label: '普段の額と同じ' };
  }

  // 指定した円を重みで分ける。合計は指定額と一致し、1円未満は出さない。余りは最大剰余法で1円ずつ配る。
  function splitYen(total, weights) {
    const parsed = parseYenInput(total);
    if (!parsed.ok || parsed.yen == null) throw new Error('配分する額が整数ではありません');
    const t = BigInt(parsed.yen);
    const w = weights.map(x => {
      const p = parseYenInput(x);
      if (!p.ok || p.yen == null || p.yen < 0) throw new Error('重みが整数ではありません');
      return BigInt(p.yen);
    });
    const sum = w.reduce((a, b) => a + b, 0n);
    if (t < 0n) throw new Error('負の額は配分できません');
    if (sum <= 0n) return { shares: w.map(() => 0), leftover: biNum(t) };
    const shares = w.map(x => (t * x) / sum);
    let left = t - shares.reduce((a, b) => a + b, 0n);
    const order = w.map((x, i) => ({ i, r: (t * x) % sum })).sort((a, b) => (a.r === b.r ? a.i - b.i : (a.r > b.r ? -1 : 1)));
    for (const o of order) {
      if (left <= 0n) break;
      shares[o.i] += 1n;
      left -= 1n;
    }
    return { shares: shares.map(biNum), leftover: biNum(left) };
  }
  function splitEven(total, count) {
    const n = +count;
    if (!Number.isInteger(n) || n < 0) throw new Error('人数が不正です');
    if (n === 0) return splitYen(total, []);
    return splitYen(total, Array(n).fill(1));
  }
  function simulatePool(balance, count) {
    if (typeof balance === 'number' && Number.isSafeInteger(balance) && balance < 0) {
      const n = +count;
      return { per: null, remainder: balance, short: true, count: Number.isInteger(n) && n >= 0 ? n : 0 };
    }
    const b = parseYenInput(balance);
    if (!b.ok || b.yen == null) return { per: null, remainder: null, short: false, count: +count || 0 };
    const n = +count;
    if (!Number.isInteger(n) || n < 0) return { per: null, remainder: b.yen, short: false, count: 0 };
    if (n === 0) return { per: null, remainder: b.yen, short: b.yen < 0, count: 0 };
    if (b.yen < 0) return { per: null, remainder: b.yen, short: true, count: n };
    const per = biNum(BigInt(b.yen) / BigInt(n));
    const remainder = biNum(BigInt(b.yen) - BigInt(per) * BigInt(n));
    return { per, remainder, short: false, count: n };
  }

  function staffOffice(pay, staff) {
    if (pay.office_id) return pay.office_id;
    const s = staff.find(x => String(x.id) === String(pay.staff_id));
    return s ? s.office_id : '';
  }
  function poolSummary({ fy, receipts, pays, staff, officeId }) {
    const months = new Set(monthsOfFy(fy));
    const rec = (receipts || []).filter(r => months.has(ym(r.target_month)) && (!officeId || r.office_id === officeId));
    const lines = (pays || []).filter(p => months.has(ym(p.target_month)) && (!officeId || staffOffice(p, staff || []) === officeId));
    const received = sumYen(rec.map(r => r.amount_yen || 0));
    const monthly = sumYen(lines.map(p => p.shogu_yen || 0));
    const lump = sumYen(lines.map(p => p.lump_yen || 0));
    return { fy: +fy, received, monthly, lump, carried: received - monthly, balance: received - monthly - lump };
  }
  function auditRow({ month, officeId, officeName, receipts, pays, staff }) {
    const m = ym(month);
    const recs = (receipts || []).filter(r => r.office_id === officeId && ym(r.target_month) === m);
    const people = (staff || []).filter(s => s.office_id === officeId);
    const byId = Object.fromEntries(people.map(s => [String(s.id), s]));
    const lines = (pays || []).filter(p => ym(p.target_month) === m && byId[String(p.staff_id)]);
    const received = sumYen(recs.map(r => r.amount_yen || 0));
    const monthly = sumYen(lines.map(p => p.shogu_yen || 0));
    const lump = sumYen(lines.map(p => p.lump_yen || 0));
    const wage = monthly + lump;
    const ivs = recs.map(ivEquivalent);
    const ivYen = recs.length && ivs.every(x => x.yen != null) ? sumYen(ivs.map(x => x.yen)) : (recs.length ? null : null);
    const breaches = [];
    let blankGross = 0;
    for (const s of people.filter(x => x.active !== false)) {
      const line = lines.find(p => String(p.staff_id) === String(s.id));
      const st = floorStatus(line ? line.gross_yen : null, s.baseline_yen);
      if (st.code === 'under') breaches.push({ staffId: s.id, name: s.name, short: st.short, gross: line.gross_yen, baseline: s.baseline_yen });
      if (!line || st.code === 'blank') blankGross += 1;
    }
    let half;
    if (!recs.length) half = { code: 'noreceipt', label: '加算の記録なし' };
    else half = halfStatus(m, ivYen, monthly);
    let meet = 'noreceipt';
    if (recs.length) meet = wage >= received ? 'pass' : 'fail';
    return {
      month: m, officeId, officeName: officeName || officeId,
      services: recs.map(r => r.service_type),
      received, monthly, lump, wage, diff: wage - received, meet,
      ivYen, half, breaches, blankGross, hasData: !!(recs.length || lines.length),
    };
  }
  function buildAudit({ fy, officeId, receipts, pays, staff, officeNames }) {
    const months = monthsOfFy(fy);
    const ids = new Set();
    (receipts || []).forEach(r => { if (months.includes(ym(r.target_month))) ids.add(r.office_id); });
    (staff || []).forEach(s => ids.add(s.office_id));
    (pays || []).forEach(p => { const id = staffOffice(p, staff || []); if (id && months.includes(ym(p.target_month))) ids.add(id); });
    let list = [...ids].filter(Boolean);
    if (officeId) list = list.filter(id => id === officeId);
    list.sort((a, b) => String((officeNames || {})[a] || a).localeCompare(String((officeNames || {})[b] || b), 'ja'));
    const rows = [];
    for (const id of list) for (const month of months) {
      rows.push(auditRow({ month, officeId: id, officeName: (officeNames || {})[id], receipts, pays, staff }));
    }
    return rows;
  }

  function csvCell(v) {
    const s = v == null ? '' : String(v);
    const guarded = /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
    return '"' + guarded.replace(/"/g, '""') + '"';
  }
  function toCsv(rows) {
    return rows.map(line => line.map(csvCell).join(',')).join('\r\n') + '\r\n';
  }
  function freewayRows(staff, pays, month, itemYen, includeZero) {
    const m = ym(month);
    const header = ['従業員番号', '氏名', '支給年月', '金額'];
    const lines = [header];
    const people = (staff || []).filter(s => s.active !== false).slice().sort((a, b) => String(a.staff_code || '').localeCompare(String(b.staff_code || ''), 'ja'));
    for (const s of people) {
      const pay = (pays || []).find(p => String(p.staff_id) === String(s.id) && ym(p.target_month) === m);
      const yen = pay ? (+pay[itemYen] || 0) : 0;
      if (!includeZero && yen === 0) continue;
      lines.push([s.staff_code || '', s.name || '', m, String(yen)]);
    }
    return lines;
  }
  function detailCsv(staff, pays, month, officeNames) {
    const m = ym(month);
    const header = ['従業員番号', '氏名', '事業所', '雇用', '対象月', '契約給_処遇改善込み', '普段の給与_処遇改善込み', '支払総額_処遇改善込み', '処遇改善内訳', '一時金の処遇改善分', '下限'];
    const lines = [header];
    const people = (staff || []).filter(s => s.active !== false).slice().sort((a, b) => String(a.staff_code || '').localeCompare(String(b.staff_code || ''), 'ja'));
    for (const s of people) {
      const pay = (pays || []).find(p => String(p.staff_id) === String(s.id) && ym(p.target_month) === m);
      const floor = floorStatus(pay ? pay.gross_yen : null, s.baseline_yen);
      lines.push([
        s.staff_code || '', s.name || '', (officeNames || {})[s.office_id] || s.office_id || '', s.employment || '', m,
        String(s.contract_yen ?? ''), String(s.baseline_yen ?? ''),
        pay && pay.gross_yen != null ? String(pay.gross_yen) : '',
        pay ? String(pay.shogu_yen || 0) : '0',
        pay ? String(pay.lump_yen || 0) : '0',
        floor.label,
      ]);
    }
    return toCsv(lines);
  }
  function auditCsv(rows) {
    const header = ['事業所', '対象月', 'サービス', '加算受領額', '新加算Ⅳ相当額', '賃金改善額_月額', '賃金改善額_一時金', '賃金改善額_合計', '差額', '賃金改善が加算以上', '下限割れ人数', '支払総額の未入力', '月額2分の1'];
    const meetLabel = { pass: '達成', fail: '未達', noreceipt: '加算の記録なし' };
    const body = rows.filter(r => r.hasData || r.received || r.monthly || r.lump).map(r => [
      r.officeName, r.month, (r.services || []).join('・'),
      String(r.received), r.ivYen == null ? '' : String(r.ivYen),
      String(r.monthly), String(r.lump), String(r.wage), String(r.diff),
      meetLabel[r.meet] || r.meet, String(r.breaches.length), String(r.blankGross), r.half.label,
    ]);
    return toCsv([header, ...body]);
  }

  function squashCjk(s) {
    return String(s || '').replace(/([\u3040-\u9fff])[ \t]+(?=[\u3040-\u9fff])/g, '$1');
  }
  function parseJpMonth(slice) {
    const t = zenDigit(slice).replace(/\s/g, '');
    let m = t.match(/令和(\d{1,2})年(\d{1,2})月/);
    if (m) return ymOf(2018 + +m[1], +m[2]);
    m = t.match(/平成(\d{1,2})年(\d{1,2})月/);
    if (m) return ymOf(1988 + +m[1], +m[2]);
    m = t.match(/R(\d{1,2})[年./](\d{1,2})月?/);
    if (m) return ymOf(2018 + +m[1], +m[2]);
    m = t.match(/(20\d{2})年(\d{1,2})月/);
    if (m) return ymOf(+m[1], +m[2]);
    m = t.match(/(20\d{2})[/.](\d{1,2})/);
    if (m) return ymOf(+m[1], +m[2]);
    return '';
  }
  function ymOf(y, m) {
    if (y < 1989 || y > 2100 || m < 1 || m > 12) return '';
    return y + '-' + String(m).padStart(2, '0');
  }
  function labeledMonth(text, labelRe) {
    const re = new RegExp(labelRe.source, 'g');
    let m, found = '';
    while ((m = re.exec(text))) {
      const got = parseJpMonth(text.slice(m.index, m.index + 48));
      if (got) found = got;
    }
    return found;
  }
  function detectServices(text) {
    const t = text.replace(/B型/g, 'Ｂ型');
    const found = [];
    for (const name of SERVICE_ORDER) {
      const n = name.replace(/B型/g, 'Ｂ型');
      if (t.includes(n) && !found.includes(canonicalService(n))) found.push(canonicalService(n));
    }
    return found;
  }
  function detectCategory(text) {
    const t = squashCjk(text);
    const win = [];
    const re = /処遇改善[^。\n]{0,24}/g;
    let m; while ((m = re.exec(t))) win.push(m[0]);
    const blob = win.join('\n') || t;
    const ordered = ['Ⅰロ', 'Ⅰイ', 'Ⅱロ', 'Ⅱイ', 'Ⅲ', 'Ⅳ', 'Ⅱ', 'Ⅰ'];
    for (const c of ordered) if (blob.includes(c)) return c;
    return '';
  }
  function findAmounts(line) {
    const src = zenDigit(line);
    const out = [];
    const re = /([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)(\.[0-9]+)?/g;
    let m;
    while ((m = re.exec(src))) {
      const raw = m[0];
      const after = src.slice(m.index + raw.length, m.index + raw.length + 8);
      const before = src.slice(Math.max(0, m.index - 4), m.index);
      const parsed = parseYenInput(raw);
      let kind = 'unmarked';
      if (/円/.test(after) || /[¥￥]/.test(before)) kind = parsed.ok ? 'yen' : 'decimal';
      else if (/単位/.test(after)) kind = 'unit';
      else if (!parsed.ok && parsed.reason === 'decimal') kind = 'decimal';
      out.push({ raw, yen: parsed.ok ? parsed.yen : null, kind });
    }
    return out;
  }
  function parseNotice(text) {
    const src = squashCjk(zenDigit(text)).replace(/\r/g, '');
    const warnings = [];
    const serviceMonth = labeledMonth(src, /サービス提供年月|対象年月|提供年月|サービス提供月/);
    const billMonth = labeledMonth(src, /請求年月|支払決定年月|支払年月/);
    if (serviceMonth && billMonth && serviceMonth !== billMonth) warnings.push('提供年月と請求年月が違います。対象月は提供年月を仮に入れています。確認してください。');
    const yearMonth = serviceMonth || billMonth || parseJpMonth(src);
    const officeNumber = (src.match(/事業所番号[^0-9]{0,10}([0-9]{10})/) || [])[1] || '';
    const services = detectServices(src);
    if (services.length > 1) warnings.push('サービスが複数あります。記録するサービスを選んでください。');
    const hits = [];
    for (const line of src.split('\n')) {
      if (!/処遇改善/.test(line)) continue;
      for (const a of findAmounts(line)) hits.push({ raw: a.raw, yen: a.yen, kind: a.kind, line: line.trim().slice(0, 180) });
    }
    if (hits.some(h => h.kind === 'decimal')) warnings.push('小数の記載があります。円未満は丸めず、金額欄は空にしています。整数で入れ直してください。');
    const yenHits = hits.filter(h => h.kind === 'yen' && h.yen != null);
    let chosen = null;
    if (yenHits.length === 1) chosen = yenHits[0];
    else if (yenHits.length > 1) warnings.push('円の金額が複数あります。どれを記録するか選んでください。');
    else if (hits.length === 1 && hits[0].yen != null && hits[0].kind !== 'decimal') {
      chosen = hits[0];
      if (hits[0].kind !== 'yen') warnings.push('金額のあとに「円」がありません。単位数の可能性があります。確認してください。');
    } else if (hits.length > 1) warnings.push('処遇改善の近くに金額が複数あります。選ぶか、手で入れてください。');
    else if (!hits.length) warnings.push('処遇改善の金額を読み取れませんでした。手で入れてください。');
    return {
      officeNumber, services, serviceType: services.length === 1 ? services[0] : '',
      yearMonth, serviceMonth, billMonth,
      amountYen: chosen ? chosen.yen : null,
      amountRaw: chosen ? chosen.raw : '',
      category: detectCategory(src),
      hits, warnings,
    };
  }

  function latin1(bytes) {
    const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let s = '';
    const chunk = 0x8000;
    for (let i = 0; i < u.length; i += chunk) s += String.fromCharCode.apply(null, u.subarray(i, i + chunk));
    return s;
  }
  function pdfStreams(bytes) {
    const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const raw = latin1(u);
    const out = [];
    let i = 0;
    while ((i = raw.indexOf('stream', i)) !== -1) {
      if (raw.slice(Math.max(0, i - 3), i) === 'end') { i += 6; continue; }
      let start = i + 6;
      if (raw.charCodeAt(start) === 13) start++;
      if (raw.charCodeAt(start) === 10) start++;
      const end = raw.indexOf('endstream', start);
      if (end < 0) break;
      const dict = raw.slice(Math.max(0, raw.lastIndexOf('<<', i)), i);
      out.push({ dict, data: u.slice(start, end) });
      i = end + 9;
    }
    return out;
  }
  function parseToUnicode(latin) {
    const map = new Map();
    const rangeRe = /beginbfrange([\s\S]*?)endbfrange/g;
    const charRe = /beginbfchar([\s\S]*?)endbfchar/g;
    let m;
    const put = (src, dst) => { if (dst) map.set(src.toUpperCase(), dst); };
    while ((m = charRe.exec(latin))) {
      const row = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
      let r; while ((r = row.exec(m[1]))) put(r[1], utf16be(r[2]));
    }
    while ((m = rangeRe.exec(latin))) {
      const row = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
      let r; while ((r = row.exec(m[1]))) {
        const a = parseInt(r[1], 16), b = parseInt(r[2], 16), width = r[1].length;
        let dest = parseInt(r[3], 16);
        for (let n = a; n <= b && n - a < 500; n++) {
          put(n.toString(16).padStart(width, '0'), String.fromCharCode(dest));
          dest++;
        }
      }
    }
    let width = 4;
    if (map.size) width = [...map.keys()][0].length;
    return { map, width };
  }
  function utf16be(hex) {
    const h = String(hex || '').replace(/\s/g, '');
    if (!h || h.length % 4) return '';
    let s = '';
    for (let i = 0; i < h.length; i += 4) s += String.fromCharCode(parseInt(h.slice(i, i + 4), 16));
    if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
    return s;
  }
  function unescapePdf(s) {
    let o = '';
    for (let i = 0; i < s.length; i++) {
      if (s[i] !== '\\') { o += s[i]; continue; }
      const n = s[++i];
      if (n == null) break;
      if (n === 'n') o += '\n';
      else if (n === 'r') o += '\r';
      else if (n === 't') o += '\t';
      else if (n >= '0' && n <= '7') {
        let oct = n;
        while (oct.length < 3 && s[i + 1] >= '0' && s[i + 1] <= '7') oct += s[++i];
        o += String.fromCharCode(parseInt(oct, 8));
      } else o += n;
    }
    return o;
  }
  function decodeLiteral(s) {
    const raw = unescapePdf(s);
    if (raw.charCodeAt(0) === 0xFE && raw.charCodeAt(1) === 0xFF) {
      let o = '';
      for (let i = 2; i + 1 < raw.length; i += 2) o += String.fromCharCode((raw.charCodeAt(i) << 8) | raw.charCodeAt(i + 1));
      return o;
    }
    return raw;
  }
  function applyCmap(hex, cmap) {
    const h = hex.replace(/\s/g, '').toUpperCase();
    if (h.startsWith('FEFF')) return utf16be(h);
    if (!cmap || !cmap.map || !cmap.map.size || !cmap.width || h.length % cmap.width) return '';
    let s = '';
    for (let i = 0; i < h.length; i += cmap.width) {
      const ch = cmap.map.get(h.slice(i, i + cmap.width));
      if (ch == null) return '';
      s += ch;
    }
    return s;
  }
  function extractShowing(latin, cmap) {
    let out = '';
    const lit = /\(((?:\\.|[^\\)])*)\)/g;
    let m; while ((m = lit.exec(latin))) out += decodeLiteral(m[1]) + '\n';
    const hex = /<([0-9A-Fa-f\s]+)>/g;
    while ((m = hex.exec(latin))) {
      const text = applyCmap(m[1], cmap) || (m[1].replace(/\s/g, '').toUpperCase().startsWith('FEFF') ? utf16be(m[1]) : '');
      if (text) out += text + '\n';
    }
    return out;
  }
  async function extractPdfText(bytes, inflateAsync) {
    const streams = pdfStreams(bytes);
    const decoded = [];
    for (const s of streams) {
      let data = s.data;
      if (/FlateDecode/.test(s.dict)) {
        if (!inflateAsync) continue;
        try { data = await inflateAsync(data); } catch (e) { continue; }
        if (!(data instanceof Uint8Array)) data = new Uint8Array(data);
      }
      decoded.push(latin1(data));
    }
    const cmap = decoded.map(parseToUnicode).reduce((a, b) => {
      b.map.forEach((v, k) => a.map.set(k, v));
      if (b.map.size) a.width = b.width;
      return a;
    }, { map: new Map(), width: 4 });
    return decoded.map(t => extractShowing(t, cmap)).join('\n');
  }

  function parseCsv(text) {
    const rows = []; let row = [], cur = '', q = false;
    const src = String(text || '').replace(/^\uFEFF/, '');
    for (let i = 0; i < src.length; i++) {
      const c = src[i];
      if (q) {
        if (c === '"') { if (src[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && src[i + 1] === '\n') i++;
        row.push(cur);
        if (row.some(x => String(x).trim())) rows.push(row);
        row = []; cur = '';
      } else cur += c;
    }
    row.push(cur);
    if (row.some(x => String(x).trim())) rows.push(row);
    return rows;
  }
  function parseStaffSheet(text, officeIdsByName) {
    const rows = parseCsv(text);
    if (!rows.length) return { rows: [], errors: ['中身がありません'] };
    const head = rows[0].map(c => String(c).trim());
    const col = name => head.findIndex(c => c === name);
    const iCode = col('従業員番号'), iName = col('氏名'), iOffice = col('事業所');
    const iEmp = col('雇用'), iContract = col('契約給'), iBase = col('普段の給与');
    const errors = [];
    if (iCode < 0 || iName < 0 || iOffice < 0 || iBase < 0) {
      return { rows: [], errors: ['1行目に 従業員番号,氏名,事業所,普段の給与 が必要です。契約給と雇用は任意です。'] };
    }
    const out = [];
    rows.slice(1).forEach((r, idx) => {
      const name = String(r[iName] || '').trim();
      const code = String(r[iCode] || '').trim();
      const officeRaw = String(r[iOffice] || '').trim();
      const officeId = (officeIdsByName || {})[officeRaw] || officeRaw;
      const base = parseYenInput(r[iBase]);
      const contract = iContract >= 0 && String(r[iContract] || '').trim() ? parseYenInput(r[iContract]) : base;
      if (!name || !officeId) { errors.push((idx + 2) + '行目: 氏名と事業所が必要です'); return; }
      if (!base.ok || base.yen == null) { errors.push((idx + 2) + '行目: 普段の給与が整数ではありません（小数は取り込みません）'); return; }
      if (!contract.ok || contract.yen == null) { errors.push((idx + 2) + '行目: 契約給が整数ではありません'); return; }
      const emp = iEmp >= 0 && String(r[iEmp] || '').trim() === '正社員' ? '正社員' : '非正規';
      out.push({ staff_code: code, name, office_id: officeId, employment: emp, contract_yen: contract.yen, baseline_yen: base.yen, active: true, note: '' });
    });
    return { rows: out, errors };
  }

  const SAMPLE_NOTICE = [
    '障害福祉サービス費等支払決定額内訳書',
    '事業所番号 2450000000',
    '事業所名 レオ',
    'サービス種類 放課後等デイサービス',
    'サービス提供年月 令和8年9月',
    '請求年月 令和8年10月',
    '福祉・介護職員等処遇改善加算（Ⅱロ） 158,000円',
  ].join('\n');

  const api = {
    PPM, RATES, SERVICES, HALF_FROM, esc, ym, monthDate, fiscalYearOf, monthsOfFy, sumYen,
    parseYenInput, parsePercent, formatPercent, canonicalService, servicesFor, ratePeriod, rateTable,
    categoriesFor, lookupRates, normCategory, ivEquivalent, halfStatus, floorStatus,
    splitYen, splitEven, simulatePool, poolSummary, auditRow, buildAudit,
    csvCell, toCsv, freewayRows, detailCsv, auditCsv, parseCsv, parseStaffSheet, parseNotice, extractPdfText, pdfStreams, SAMPLE_NOTICE,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Shogu = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
