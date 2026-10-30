// 処遇改善加算の規則テスト。node tools/shogu_check.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const S = require('../shogu_logic.js');
const root = path.join(__dirname, '..');
let n = 0;
const ok = (cond, msg) => { n++; if (!cond) { console.error('FAIL', msg); process.exit(1); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), msg + ' got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b));

eq(S.parseYenInput('158,000').yen, 158000, 'comma yen');
eq(S.parseYenInput('１５８０００').yen, 158000, 'zenkaku yen');
eq(S.parseYenInput('158000.0').yen, 158000, 'trailing zero is integer');
eq(S.parseYenInput('158,000.4').ok, false, 'decimal is not rounded');
eq(S.parseYenInput('158,000.4').yen, null, 'decimal yen stays empty');
eq(S.parseYenInput('158,000.4').reason, 'decimal', 'decimal reason');
eq(S.parseYenInput('').yen, null, 'blank');
eq(S.parsePercent('15.8').ppm, 158000, 'percent 15.8');
eq(S.parsePercent('11.90').ppm, 119000, 'percent 11.90 same value');
eq(S.parsePercent('9.87654').ok, false, 'extra decimals not rounded');
eq(S.formatPercent(158000), '15.8', 'format 15.8');
eq(S.formatPercent(74000), '7.4', 'format 7.4');

const b4 = S.lookupRates('就労継続支援Ｂ型', '2026-05', 'Ⅳ');
eq(b4.rateGot, 62000, 'B型 R6 Ⅳ 6.2%');
const b8 = S.lookupRates('就労継続支援B型', '2026-09', 'Ⅳ');
eq(b8.rateGot, 74000, 'B型 R8 Ⅳ 7.4%');
eq(S.lookupRates('放課後等デイサービス', '2026-09', 'Ⅱロ').rateGot, 158000, '放デイ Ⅱロ 15.8');
eq(S.lookupRates('放課後等デイサービス', '2026-09', 'Ⅱロ').rateIv, 119000, '放デイ Ⅳ 11.9');
eq(S.rateTable('放課後等デイサービス', '2024-05'), null, '旧3加算は率表なし');
eq(S.categoriesFor('計画相談支援', '2026-09'), ['新設'], '相談は新設のみ');
eq(S.lookupRates('計画相談支援', '2026-09', '新設').rateIv, null, '相談にⅣの率はない');

const ratio = S.ivEquivalent({ amount_yen: 158000, category: 'Ⅱロ', rate_got_ppm: 158000, rate_iv_ppm: 119000, iv_manual: false });
eq(ratio, { yen: 119000, how: 'ratio' }, '158000 * 11.9 / 15.8 = 119000');
const odd = S.ivEquivalent({ amount_yen: 1000, category: 'Ⅱ', rate_got_ppm: 131000, rate_iv_ppm: 98000, iv_manual: false });
eq(odd.yen, 748, '1000 * 9.8 / 13.1 floors to 748');
eq(S.ivEquivalent({ amount_yen: 80000, category: 'Ⅳ', rate_got_ppm: 1, rate_iv_ppm: 1, iv_manual: false }).yen, 80000, 'category IV is the amount itself');
eq(S.ivEquivalent({ amount_yen: 80000, category: 'Ⅱ', iv_manual: true, iv_yen: '12,345' }).yen, 12345, 'manual iv is not recalculated');
eq(S.ivEquivalent({ amount_yen: 80000, category: 'Ⅱ', iv_manual: true, iv_yen: '12.5' }).yen, null, 'manual decimal rejected');

eq(S.halfStatus('2025-03', 1000, 0).code, 'exempt', 'before Reiwa 7 April is exempt');
eq(S.halfStatus('2025-04', 1000, 500).code, 'pass', '500 is half of 1000');
eq(S.halfStatus('2025-04', 1001, 500).code, 'fail', '500*2 < 1001');
eq(S.halfStatus('2025-04', 1001, 501).code, 'pass', '501 meets odd half');
eq(S.halfStatus('2025-04', 1001, 501).need, 501, 'need is ceil half');
eq(S.halfStatus('2026-09', null, 99999).code, 'unknown', 'missing iv is not a pass');

eq(S.floorStatus(180000, 180000).code, 'same', 'equal is not a breach');
eq(S.floorStatus(180001, 180000).code, 'over', 'above is fine');
eq(S.floorStatus(179999, 180000).code, 'under', 'one yen under warns');
eq(S.floorStatus(null, 180000).code, 'blank', 'blank gross is not a breach');

eq(S.splitYen(100, [1, 1, 1]).shares, [34, 33, 33], '100 splits without losing a yen');
eq(S.splitYen(100, [1, 1, 1]).shares.reduce((a, b) => a + b, 0), 100, 'split sum');
eq(S.splitYen(100, [1, 2]).shares, [33, 67], 'weighted split');
eq(S.splitEven(10, 3).shares, [4, 3, 3], 'even split keeps remainder yen');
eq(S.simulatePool(100, 3), { per: 33, remainder: 1, short: false, count: 3 }, 'pool remainder stays');
eq(S.simulatePool(-50, 4).short, true, 'shortfall is not divided');
eq(S.simulatePool(98000, 1).per, 98000, 'one regular employee');
eq(S.simulatePool(98000, 4).per, 24500, 'four regular employees');

const staff = [
  { id: 1, office_id: 'leo', name: '見本 正', staff_code: '001', active: true, baseline_yen: 250000, contract_yen: 250000, employment: '正社員' },
  { id: 2, office_id: 'leo', name: '見本 非', staff_code: '002', active: true, baseline_yen: 180000, contract_yen: 180000, employment: '非正規' },
];
const pays = [
  { staff_id: 1, target_month: '2026-09-01', shogu_yen: 40000, lump_yen: 0, gross_yen: 250000 },
  { staff_id: 2, target_month: '2026-09-01', shogu_yen: 20000, lump_yen: 0, gross_yen: 170000 },
];
const receipts = [{ office_id: 'leo', service_type: '放課後等デイサービス', target_month: '2026-09-01', amount_yen: 158000, category: 'Ⅱロ', rate_got_ppm: 158000, rate_iv_ppm: 119000, iv_manual: false }];
const row = S.auditRow({ month: '2026-09', officeId: 'leo', officeName: 'レオ', receipts, pays, staff });
eq(row.received, 158000, 'received');
eq(row.monthly, 60000, 'monthly breakdown');
eq(row.wage, 60000, 'wage is monthly plus lump');
eq(row.diff, 60000 - 158000, 'diff');
eq(row.meet, 'fail', 'monthly wage under receipt');
eq(row.ivYen, 119000, 'iv equivalent');
eq(row.half.code, 'pass', '60000 >= half of 119000');
eq(row.breaches.length, 1, 'one floor breach');
eq(row.breaches[0].short, 10000, 'short yen');
eq(S.floorStatus(250000, 250000).code, 'same', 'the other staff is not under');

const pool = S.poolSummary({ fy: 2026, receipts, pays, staff });
eq(pool.carried, 98000, 'unallocated monthly goes to the pool');
eq(pool.balance, 98000, 'nothing paid as lump yet');
const paid = S.poolSummary({ fy: 2026, receipts, pays: pays.map(p => p.staff_id === 1 ? { ...p, lump_yen: 98000 } : p), staff });
eq(paid.balance, 0, 'lump payment spends the pool');
eq(paid.lump, 98000, 'lump recorded');

const notice = S.parseNotice(S.SAMPLE_NOTICE);
eq(notice.amountYen, 158000, 'sample amount');
eq(notice.yearMonth, '2026-09', 'service month wins over bill month');
eq(notice.billMonth, '2026-10', 'bill month kept');
eq(notice.serviceType, '放課後等デイサービス', 'service');
eq(notice.category, 'Ⅱロ', 'category Ⅱロ not Ⅱ');
eq(notice.officeNumber, '2450000000', 'office number');
ok(notice.warnings.some(w => /提供年月と請求年月/.test(w)), 'month mismatch warning');

const decimal = S.parseNotice('処遇改善加算 158,000.7円\nサービス提供年月 令和8年9月\n放課後等デイサービス');
eq(decimal.amountYen, null, 'decimal notice does not fill yen');
ok(decimal.warnings.some(w => /小数/.test(w)), 'decimal warning');
const unit = S.parseNotice('処遇改善加算 1,234単位\n処遇改善加算 158,000円\n児童発達支援\n提供年月 令和7年4月');
eq(unit.amountYen, 158000, 'yen wins over units');
eq(unit.yearMonth, '2025-04', 'reiwa 7 april');

function buildPdf(objects) {
  const header = Buffer.from('%PDF-1.4\n');
  let pos = header.length;
  const offsets = [0];
  const parts = [header];
  for (const o of objects) {
    const b = Buffer.isBuffer(o) ? o : Buffer.from(o);
    offsets.push(pos);
    pos += b.length;
    parts.push(b);
  }
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) xref += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  const trailer = `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${pos}\n%%EOF\n`;
  return Buffer.concat(parts.concat(Buffer.from(xref + trailer)));
}
function utf16hex(text) {
  let h = 'FEFF';
  for (const ch of text) h += ch.charCodeAt(0).toString(16).padStart(4, '0');
  return h;
}
(async () => {
  const notice = '処遇改善加算 158,000円\nサービス提供年月 令和8年9月\n放課後等デイサービス';
  const stream = `BT <${utf16hex(notice)}> Tj ET`;
  const objs = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Contents 4 0 R >> endobj\n',
    `4 0 obj << /Length ${Buffer.byteLength(stream)} >> stream\n${stream}\nendstream endobj\n`,
  ];
  const text = await S.extractPdfText(buildPdf(objs));
  const parsed = S.parseNotice(text);
  eq(parsed.amountYen, 158000, 'pdf text amount');
  eq(parsed.yearMonth, '2026-09', 'pdf text month');

  const codes = [...notice];
  let cmap = 'beginbfchar\n', hex = '';
  codes.forEach((ch, i) => {
    const src = (i + 1).toString(16).padStart(4, '0');
    cmap += `<${src}> <${ch.charCodeAt(0).toString(16).padStart(4, '0')}>\n`;
    hex += src;
  });
  cmap += 'endbfchar\n';
  const cmapStream = cmap;
  const content = `BT <${hex}> Tj ET`;
  const flat = zlib.deflateSync(Buffer.from(content));
  const objs2 = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Contents 4 0 R >> endobj\n',
    Buffer.concat([
      Buffer.from(`4 0 obj << /Length ${flat.length} /Filter /FlateDecode >> stream\n`),
      flat,
      Buffer.from('endstream endobj\n'),
    ]),
    `5 0 obj << /Length ${Buffer.byteLength(cmapStream)} >> stream\n${cmapStream}\nendstream endobj\n`,
  ];
  const text2 = await S.extractPdfText(buildPdf(objs2), async u8 => zlib.inflateSync(u8));
  eq(S.parseNotice(text2).amountYen, 158000, 'flate and tounicode');

  const lines = S.freewayRows(staff, pays, '2026-09', 'shogu_yen', true);
  eq(lines[1], ['001', '見本 正', '2026-09', '40000'], 'freeway row integer');
  eq(lines[2][3], '20000', 'second staff');
  ok(!lines[1][3].includes(',') && !lines[1][3].includes('.'), 'no comma or decimal in freeway yen');
  const zero = S.freewayRows([{ id: 9, name: 'ゼロ', staff_code: '009', active: true }], [], '2026-09', 'shogu_yen', false);
  eq(zero.length, 1, 'zero rows can be omitted');
  const csv = S.toCsv([['=cmd', '1']]);
  ok(csv.startsWith('"\'=cmd"'), 'formula guard');
  const audit = S.auditCsv([row]);
  ok(audit.includes('158000') && audit.includes('未達') && audit.includes('達成'), 'audit csv');
  ok(!audit.includes('158,000'), 'audit csv is plain yen');

  const imported = S.parseStaffSheet('従業員番号,氏名,事業所,雇用,契約給,普段の給与\n001,見本 正,レオ,正社員,250000,250000\n002,見本 花,レオ,パート,180000.5,180000\n', { 'レオ': 'leo' });
  eq(imported.rows.length, 1, 'decimal contract row skipped');
  eq(imported.rows[0].office_id, 'leo', 'office name mapped');
  eq(imported.rows[0].contract_yen, 250000, 'imported contract not rounded');
  ok(imported.errors.length === 1, 'decimal row reported');

  const sql = fs.readFileSync(path.join(root, 'supabase/shogu.sql'), 'utf8');
  const fn = sql.slice(sql.indexOf('function public.shogu_can'), sql.indexOf('$$;') + 3);
  ok(sql.includes('enable row level security'), 'rls on');
  ok(fn.includes("role = '事務'") && fn.includes("duty = '管理者'") && fn.includes("rank = '総務奉行'"), 'clerk and manager');
  ok(fn.includes("app_metadata") && !fn.includes('user_metadata'), 'app metadata only');
  ok(!fn.includes('児発管'), 'child development manager is not included');
  ok(sql.includes("'shogu-pdf'") && sql.includes('public') && sql.includes('false'), 'private bucket');
  ok(sql.includes('revoke all on table public.shogu_receipt from anon') && sql.includes('bigint'), 'anon revoked and yen is bigint');
  ok(!/numeric|double precision|real/.test(sql), 'no float money columns');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  ok(html.includes('shogu.js') && html.includes("id === 'shogu'"), 'portal route');
  const cfg = fs.readFileSync(path.join(root, 'config.js'), 'utf8');
  ok(cfg.includes('#shogu'), 'soumu tile');
  console.log('ok', n);
})().catch(e => { console.error(e); process.exit(1); });
