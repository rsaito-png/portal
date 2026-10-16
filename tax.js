// 会計「申告」タブ（決算書・勘定科目内訳明細書・法人税の別表・消費税の概算）。法人管理者のみ（acc.js の認証・RLSの上で動く）。
// 計算ロジックと根拠URLは taxcalc.js。入力値は acc_tax_inputs（期ごと, RLS=法人管理者のみ）。
// ※ 本出力は概算。電子申告(e-Tax/eLTAX)は税理士または本人が行い、数字は必ず税理士が確認する。
const TXS = { fy: null, sub: 'fs', cache: null, accs: null, partners: null, data: {}, calc: null };
const TXSUBS = [['fs', '決算書'], ['ns', '内訳明細書'], ['hj', '法人税・地方税'], ['sh', '消費税'], ['vf', '検証']];
const fyOf = y => ({ y, from: `${y}-06-01`, to: `${y + 1}-05-31`, no: y - 2020, label: `第${y - 2020}期（${y}年6月〜${y + 1}年5月）` });
const TXCSV = [];
const nfmt = v => (typeof v === 'number' ? yen(Math.round(v)) : esc(v ?? ''));
const pct = (v, d = 2) => (v * 100).toFixed(d) + '%';
const ENT = '一般社団法人 心理社会的リハビリテーション・星心会';

function tSec(title, head, rows, opt = {}) { // rows: [cells] or {r:[cells],c:'sec'|'tot'}
  TXCSV.push([title], head, ...rows.map(r => (r.r || r).map(v => typeof v === 'number' ? Math.round(v) : v)), []);
  const cell = v => typeof v === 'number' ? `<td class="r">${nfmt(v)}</td>` : `<td>${v == null ? '' : opt.raw ? v : esc(v)}</td>`;
  return `<div class="card scroll tsec"><h3>${esc(title)}</h3>${opt.note ? `<p class="note">${opt.note}</p>` : ''}<table><tr>${head.map((h, i) => `<th${i && opt.num !== false ? ' class="r"' : ''}>${esc(h)}</th>`).join('')}</tr>${rows.map(r => `<tr class="${r.c || ''}">${(r.r || r).map(cell).join('')}</tr>`).join('')}</table></div>`;
}
function txCsvDownload(name) {
  const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"', b = new Blob(['\ufeff' + TXCSV.map(a => a.map(q).join(',')).join('\r\n')], { type: 'text/csv' }), a = document.createElement('a');
  a.href = URL.createObjectURL(b); a.download = `${name}_${TXS.fy.from}_${TXS.fy.to}.csv`; a.click();
}
// 入力欄: data-k=キー, data-t=n(数値)/s(文字)/b(真偽)
const iN = (k, label, def, hint) => `<div><label>${label}</label><input data-k="${k}" data-t="n" inputmode="numeric" value="${esc(TXS.data[k] ?? def ?? '')}">${hint ? `<span class="note">${hint}</span>` : ''}</div>`;
const iS = (k, label, def) => `<div><label>${label}</label><input data-k="${k}" data-t="s" value="${esc(TXS.data[k] ?? def ?? '')}"></div>`;
const iSel = (k, label, optsArr, def) => `<div><label>${label}</label><select data-k="${k}" data-t="s">${optsArr.map(([v, l]) => `<option value="${v}"${String(TXS.data[k] ?? def) === String(v) ? ' selected' : ''}>${l}</option>`).join('')}</select></div>`;
function iRows(key, cols, extra = 2, auto = []) { // cols: [[field,label,type,width]]
  const rows = [...(TXS.data[key] || []), ...Array(extra).fill({})];
  return `<table class="noprint-inputs"><tr>${cols.map(c => `<th>${c[1]}</th>`).join('')}</tr>${auto.map(a => `<tr style="background:#f6f6f6">${cols.map(c => `<td>${esc(a[c[0]] ?? '')}${c[0] === 'amount' ? '' : ''}</td>`).join('')}</tr>`).join('')}
  ${rows.map((r, i) => `<tr data-arr="${key}">${cols.map(c => `<td><input data-f="${c[0]}" data-t="${c[2]}" value="${esc(r[c[0]] ?? '')}" style="${c[3] ? 'min-width:' + c[3] : ''}"></td>`).join('')}</tr>`).join('')}</table>`;
}
function txGather() {
  const d = TXS.data;
  document.querySelectorAll('#view [data-k]').forEach(el => { const t = el.dataset.t, v = el.value.trim(); d[el.dataset.k] = t === 'n' ? (v === '' ? '' : +v.replace(/[,，円]/g, '') || 0) : v; });
  const arrs = {}; document.querySelectorAll('#view tr[data-arr]').forEach(tr => { const o = {}; let any = false;
    tr.querySelectorAll('[data-f]').forEach(el => { const v = el.value.trim(); o[el.dataset.f] = el.dataset.t === 'n' ? (v === '' ? '' : +v.replace(/[,，円]/g, '') || 0) : v; if (v !== '') any = true; });
    if (any) (arrs[tr.dataset.arr] ??= []).push(o); });
  new Set([...document.querySelectorAll('#view tr[data-arr]')].map(t => t.dataset.arr)).forEach(k => { d[k] = arrs[k] || []; });
}
async function txSave(rerun = true) {
  txGather();
  try { await sb('acc_tax_inputs?on_conflict=fy_start', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ fy_start: TXS.fy.from, data: TXS.data, updated_at: new Date().toISOString() }) });
    flash('入力を保存して再計算しました', 'ok'); } catch (e) { alert('保存できませんでした: ' + e.message); return; }
  if (rerun) route();
}
function txCalc() {
  const { fy, cache, accs } = TXS, d = TXS.data;
  const lg = TX.ledger(cache.lines, accs, fy.from, fy.to), fs = TX.statements(lg);
  const cap = fs.bs.E.filter(r => /資本金|資本準備金|その他資本剰余金|新株式申込証拠金/.test(r.category)).reduce((s, r) => s + r.bal, 0);
  const hjIn = { months: 12, capital: d.capital === '' || d.capital == null ? cap : d.capital, emp50: (d.emp50 ?? '1') !== '0', loss: d.loss, credit: d.credit, interim: d.interim, kintoCityOv: d.kintoCityOv, kintoPrefOv: d.kintoPrefOv, entertainTotal: d.entertainTotal, entSmall: d.entSmall, entMeal: d.entMeal, adds: d.adds, subs: d.subs, dep: d.dep };
  const hj = TX.hojin(hjIn, fs, fy.from), sh = TX.shohi(cache.lines, accs, fy.from, fy.to, { taxable: (d.taxable ?? '0') === '1', kind: d.kind || 5, pA: d.pA, pB: d.pB, u80: d.u80, u70: d.u70, interimC: d.interimC }, fy.to);
  const pfy = fyOf(fy.y - 1), shPrev = TX.shohi(cache.lines, accs, pfy.from, pfy.to, {}, pfy.to);
  TXS.calc = { lg, fs, hj, sh, cap, shPrev, pfy };
}
// 第5期（令和7.6.1〜8.5.31）の実際の申告書（税理士作成・電子申告済み・令和8.7.28決算確定）の値。写真(別表一・四・五(一))から転記。
const ACT5 = { b4: { net: 2222843, nouzei: 868200, depEx: 232383, addSub: 1100583, jigyo: 14100, kari: 3309326, shotoku: 346, income: 3309672 },
  b1: { income: 3309672, hz: 496350, credit: 346, diff: 496000, interim: 0, final: 496000, chihouBase: 496000, chihou: 51088, chihouFinal: 51000 },
  b5: { ret: [-114403, -114403, 2108440, 2108440], nouzeiJ: [167500, 167500, 868200, 868200], hojin: [-48900, -48900, -547000, -547000], ken: [-22400, -22400, -26900, -26900], shi: [-82100, -82100, -135700, -135700], total: [-100303, -100303, 2499423, 2499423] },
  ken: 26900, shi: 135700, jigyoTotal: 158600 /* 868,200−547,000−26,900−135,700（別表五から逆算。事業税＋特別法人事業税） */, paid: 868200, fixedDate: '2026-07-28' };
const SEED5 = { subs: [{ label: '納税充当金から支出した事業税等の金額（前期事業税の認容・別表四13）', amount: 14100 }], credit: 346, interim: 0, dep: [{ name: '償却超過額（申告書 別表四10・別表五(一)3 より）', cost: '', dep: 232383, limit: 0 }], kintoCityOv: 100000,
  b5: [{ label: '未納法人税（未納地方法人税を含む）', open: -48900, dec: -48900, inc: -547000 }, { label: '未納道府県民税（均等割を含む）', open: -22400, dec: -22400, inc: -26900 }, { label: '未納市町村民税（均等割を含む）', open: -82100, dec: -82100, inc: -135700 }] };
const pName = id => +id ? (TXS.partners.get(+id) || '取引先' + id) : '(取引先未設定)';

/* ---- 画面本体 ---- */
async function vTax(sp) {
  if (!M.accounts) await loadMasters();
  const y = +(sp.get('fy') || 2025), fy = fyOf(y); TXS.sub = TXSUBS.find(x => x[0] === sp.get('s')) ? sp.get('s') : 'fs';
  const change = !TXS.fy || TXS.fy.y !== y; TXS.fy = fy;
  if (!TXS.accs) TXS.accs = await sb('acc_accounts?select=id,name,type,category,sort&limit=1000');
  if (!TXS.partners) TXS.partners = new Map((await fetchAll('acc_partners?select=id,name')).map(p => [p.id, p.name]));
  if (!TXS.cache || TXS.cache.to !== fy.to || sp.get('reload')) TXS.cache = { to: fy.to, lines: await fetchAll(`acc_lines?select=id,side,amount,account_id,tax_code,entry_id,acc_entries!inner(entry_date,kind,partner_id,memo)&acc_entries.entry_date=lte.${fy.to}`) };
  if (change || sp.get('reload')) { const r = await sb(`acc_tax_inputs?select=data&fy_start=eq.${fy.from}`); TXS.data = r[0]?.data || {}; TXS.seeded = false; if (y === 2025 && !r[0]) { TXS.data = JSON.parse(JSON.stringify(SEED5)); TXS.seeded = true; } }
  txCalc(); TXCSV.length = 0;
  const body = await ({ fs: txFs, ns: txNs, hj: txHj, sh: txSh, vf: txVf })[TXS.sub]();
  const fyOpts = [2024, 2025, 2026].map(v => `<option value="${v}"${v === y ? ' selected' : ''}>${fyOf(v).label}</option>`).join('');
  $('view').innerHTML = `<div class="noprint"><h2>申告（決算書・法人税・消費税）</h2>
    <div class="warn"><b>電子申告（e-Tax／eLTAX）は税理士または本人が行います。本出力は概算で、必ず税理士の確認が必要です。</b>この画面から税務署・自治体へ送信することはありません。</div>
    ${done()}<div class="card"><div class="g"><div><label>事業年度</label><select id="tx_fy" onchange="location.hash='tax?s='+TXS.sub+'&fy='+this.value">${fyOpts}</select></div>
    <button class="sub" onclick="window.print()">🖨 印刷／PDF保存</button><button class="sub" onclick="txCsvDownload('${TXS.sub}')">⬇ この画面をCSV</button></div>
    ${fy.from < '2025-06-01' ? '<p class="ng">第4期以前の取引はまだ移行していないため、この期の数字は不完全です。</p>' : ''}
    <nav style="margin:8px 0 0">${TXSUBS.map(([k, l]) => `<a href="#tax?s=${k}&fy=${y}" class="${k === TXS.sub ? 'on' : ''}">${l}</a>`).join('')}</nav></div></div>
    <div class="ptitle"><b>${ENT}</b>　${fy.label}　${TXSUBS.find(x => x[0] === TXS.sub)[1]}（概算・税理士確認前）</div>${body}
    <p class="note noprint">根拠: 税率・様式は国税庁・三重県・四日市市の公開情報（URLは taxcalc.js 冒頭の注記と README の「申告タブ」）。税率改正時は taxcalc.js の TAXRATES を更新します。</p>`;
}
const saveBar = () => `<div class="card noprint"><button onclick="txSave()">💾 入力を保存して再計算</button> <span class="note">入力値はこの期の分としてDB（acc_tax_inputs）に保存されます。</span></div>`;

/* ---- (1) 決算書 ---- */
function txFs() {
  const { fs, lg } = TXS.calc, p = fs.pl, b = fs.bs, eq = fs.eq, d = TXS.data;
  const list = (arr, ind = true) => arr.filter(r => r.bal).map(r => [(ind ? '　' : '') + r.name, r.bal]);
  const sumRows = (t, arr) => ({ r: [t, arr.reduce((s, r) => s + r.bal, 0)], c: 'tot' });
  const bsGroup = (title, arr) => { const cats = [...new Set(arr.map(r => r.category))].filter(c => arr.some(r => r.category === c && r.bal)); return [{ r: [title, ''], c: 'sec' }, ...cats.flatMap(c => [{ r: ['　' + c, arr.filter(r => r.category === c).reduce((s, r) => s + r.bal, 0)] }, ...arr.filter(r => r.category === c && r.bal).map(r => ['　　' + r.name, r.bal])]), sumRows(title + 'の部合計', arr)]; };
  const bsRows = [...bsGroup('資産', b.A), ...bsGroup('負債', b.L), { r: ['純資産', ''], c: 'sec' }, ...b.E.filter(r => r.bal).map(r => ['　' + r.name, r.bal]),
    ['　繰越損益（前期までの累計）', b.plBefore], ['　当期純利益', b.net], { r: ['純資産の部合計', b.totE + b.cumPL], c: 'tot' }, { r: ['負債・純資産合計', b.totalLE], c: 'tot' }];
  const plRows = [{ r: ['売上高', p.sales], c: 'tot' }, ...list(p.revSales), { r: ['売上原価（仕入高等−期末棚卸）', p.cogs], c: '' }, { r: ['売上総利益', p.gross], c: 'tot' }, { r: ['販売費及び一般管理費（内訳は下表）', p.sga] }, { r: ['営業利益', p.opInc], c: 'tot' },
    { r: ['営業外収益', p.nIn] }, ...list(p.nonOpIn), { r: ['営業外費用', p.nOut] }, ...list(p.nonOpOut), { r: ['経常利益', p.ordinary], c: 'tot' }, { r: ['特別利益', p.spI] }, { r: ['特別損失', p.spO] }, { r: ['税引前当期純利益', p.pretax], c: 'tot' },
    { r: ['法人税、住民税及び事業税', p.tax] }, { r: ['当期純利益', p.net], c: 'tot' }];
  const sgaRows = [...p.sgaRows.filter(r => r.bal).sort((x, y) => y.bal - x.bal).map(r => [r.name, r.bal, p.sga ? pct(r.bal / p.sga, 1) : '']), { r: ['販売費及び一般管理費 合計', p.sga, ''], c: 'tot' }];
  const E = (k, l) => [l, eq.cap[k] ?? 0];
  const col = k => [eq.cap[k], eq.cs[k], eq.re[k], eq.oth[k]];
  const eqRows = [['当期首残高', ...col('open'), col('open').reduce((s, v) => s + v, 0)], ['当期変動額（当期純利益）', 0, 0, eq.re.ni, 0, eq.re.ni], ['当期変動額（その他）', eq.cap.other, eq.cs.other, eq.re.other, eq.oth.other, eq.cap.other + eq.cs.other + eq.re.other + eq.oth.other],
    { r: ['当期末残高', ...col('close'), col('close').reduce((s, v) => s + v, 0)], c: 'tot' }];
  const notes = ['重要な会計方針（資産の評価基準・減価償却の方法・消費税等の会計処理：税込方式 等）', '会計方針の変更', '貸借対照表に関する注記（担保資産、保証債務、関係会社に対する金銭債権債務、役員等との取引 等）', '損益計算書に関する注記（関連当事者との取引 等）', '社員資本等変動計算書に関する注記', '継続企業の前提', '重要な後発事象', 'その他'];
  const defaults = ['固定資産の減価償却は定率法／定額法（要確認）。消費税等の会計処理は税込方式。', '', '', '', '', '', '', ''];
  const diffMsg = b.diff === 0 ? '<p class="ok">✅ 貸借一致（資産 = 負債 + 純資産）</p>' : `<p class="ng">⚠ 貸借差額 ${yen(b.diff)} 円</p>`;
  return `<div class="cols">${tSec('貸借対照表', ['科目', '金額（円）'], bsRows)}${tSec('損益計算書', ['科目', '金額（円）'], plRows)}</div>${diffMsg}
    ${tSec('販売費及び一般管理費の内訳', ['科目', '金額（円）', '構成比'], sgaRows)}
    ${tSec('社員資本等変動計算書（株主資本等変動計算書相当）', ['', '資本金', '資本剰余金', '利益剰余金', '評価・換算等', '純資産合計'], eqRows, { note: '一般社団法人は株主がいないため、株主資本を「社員資本」と読み替えた様式です。' })}
    <div class="card"><h3>個別注記表（雛形）</h3><p class="note">中小法人は計算書類の注記を一部省略できます。必要な項目だけ記入し、税理士に確認してください。</p>
    ${notes.map((n, i) => `<label>${i + 1}. ${n}</label><textarea data-k="note${i}" data-t="s" rows="${i ? 2 : 3}" style="width:100%">${esc(d['note' + i] ?? defaults[i])}</textarea>`).join('')}<button class="noprint" onclick="txSave()">💾 注記を保存</button></div>`;
}

/* ---- (2) 勘定科目内訳明細書 ---- */
function txNs() {
  const { cache, accs, fy } = TXS, { fs } = TXS.calc, B = (names, mode, key) => TX.breakdown(cache.lines, accs, names, fy.from, fy.to, mode, key);
  const show = (arr, nameF = o => pName(o.key)) => { const top = arr.slice(0, 40), rest = arr.slice(40).reduce((s, o) => s + o.amount, 0); return [...top.map(o => [nameF(o), o.accts, o.amount]), ...(rest ? [['その他（' + (arr.length - 40) + '件）', '', rest]] : []), { r: ['合計', '', arr.reduce((s, o) => s + o.amount, 0)], c: 'tot' }]; };
  const H = ['相手先・内容', '科目', '期末残高'], HF = ['相手先・内容', '科目', '当期発生額'];
  const banks = fs.bs.A.filter(r => r.category === '現金・預金' && r.bal && r.name !== '現金').map(r => [r.name.replace(/（API）/, ''), '預金', r.bal]);
  const sec = [];
  sec.push(tSec('① 預貯金等の内訳書', ['金融機関名・口座', '種類', '期末現在高'], [...banks, { r: ['合計', '', banks.reduce((s, r) => s + r[2], 0)], c: 'tot' }], { note: `支店名・口座番号は金融機関の残高証明書で補ってください（現金は対象外・BS上の現金 ${yen(fs.bs.A.find(r => r.name === '現金')?.bal ?? 0)}円）。` }));
  sec.push(tSec('④ 売掛金（未収入金）の内訳書', H, show(B(['売掛金', '未収入金'], 'bal', 'partner')), { note: '「取引先未設定」は期首残高（freee第5期の試算表から移行した額）で、取引先別に分かれていません。期首の取引先別明細を入力するか、請求書から補ってください。' }));
  sec.push(tSec('⑤ 仮払金（前渡金）の内訳書', H, show(B(['仮払金', '前渡金', '立替金', '貸付金', '短期貸付金', '長期貸付金'], 'bal', 'partner'))));
  sec.push(tSec('⑪ 買掛金（未決済の仕入債務）の内訳書', H, show(B(['買掛金'], 'bal', 'partner'))));
  sec.push(tSec('⑫ 未払金・未払費用の内訳書', H, show(B(['未払金', '長期未払金', '未払費用'], 'bal', 'partner')), { note: 'クレジットカード未払は科目ごとに残高があります（カード会社名＝口座名）。' }));
  sec.push(tSec('カード・預り金等（参考）', H, show(B([/カード|JCB|MasterCard/, '預り金'], 'bal', 'acct'), o => o.key)));
  sec.push(tSec('⑮ 借入金及び受取利息の内訳書（借入金・貸主別）', H, show(B(['短期借入金', '長期借入金', '役員借入金'], 'bal', 'partner'))));
  sec.push(tSec('⑯ 役員給与等の内訳書（役員報酬）', HF, show(B(['役員報酬'], 'flow', 'partner')), { note: '定期同額給与かどうか（期中の改定）は別途確認してください。' }));
  sec.push(tSec('人件費（給料手当・法定福利費）', HF, show(B(['給料手当', '法定福利費', '福利厚生費'], 'flow', 'acct'), o => o.key)));
  sec.push(tSec('⑯ 地代家賃等の内訳書', HF, show(B(['地代家賃'], 'flow', 'partner')), { note: '賃借物件の所在地・賃借期間・契約内容は支払先ごとに追記してください。' }));
  sec.push(tSec('⑯ 雑益、雑損失等の内訳書（雑収入）', HF, show(B(['雑収入', '受取利息'], 'flow', 'partner'))));
  sec.push(tSec('雑損失・雑費', HF, show(B(['雑費', '寄付金', '支払利息'], 'flow', 'acct'), o => o.key)));
  sec.push(tSec('租税公課（参考）', HF, show(B(['租税公課'], 'flow', 'memo'), o => o.key)));
  sec.push(tSec('固定資産・その他の資産（参考・別表十六の入力元）', H, show(B(['工具器具備品', '車両運搬具', '附属設備', '一括償却資産', '敷金', '建物', '機械装置', 'ソフトウェア'], 'bal', 'acct'), o => o.key)));
  return `<p class="note noprint">残高から自動作成した主要様式です。法人税申告書に添付する様式（別紙）の体裁へは税理士が整えます。取引先は個人名を含むため取扱注意です。</p>${sec.join('')}`;
}

/* ---- (3) 法人税・地方税 ---- */
function txHj() {
  const { fs, hj, cap, sh: sh0 } = TXS.calc, d = TXS.data, T = TX.TAXRATES, e = hj.ent, y = TXS.fy;
  const dz = TX.doozoku(d.dz), kinds = [['留保', '留保'], ['社外流出', '社外流出']];
  const b1 = [['所得金額（別表四 差引計）', hj.income], ['法人税額（税率: 年800万円以下15%／超23.2%）', hj.hz], ['税額控除（所得税額控除等・入力）', hj.credit], ['差引所得に対する法人税額（1,000円未満切捨て）', hj.hzNet], ['中間納付額（入力）', hj.interim], { r: ['差引確定法人税額（納付）', hj.final], c: 'tot' },
    ['課税標準法人税額（別表一28→30・1,000円未満切捨て）', TX.fK(hj.hz)], ['地方法人税額（10.3%）', hj.chihou], { r: ['防衛特別法人税（' + (hj.boeiOn ? '(基準法人税額−500万円)×4%' : '令和8年4月1日以後開始事業年度から。この期は対象外') + '）', hj.boei], c: '' }];
  const b4 = [['当期利益又は当期欠損の額（税引後の当期純利益）', hj.preTax, ''], { r: ['【加算】', '', ''], c: 'sec' }, ...hj.adds.map(r => [r.label, +r.amount || 0, r.kind]), { r: ['加算 小計', hj.sA, ''], c: 'tot' }, { r: ['【減算】', '', ''], c: 'sec' }, ...hj.subs.map(r => [r.label, +r.amount || 0, r.kind || '']), { r: ['減算 小計', hj.sS, ''], c: 'tot' },
    ['仮計', hj.sub1, ''], ['（繰越欠損金の当期控除額 別表七(一)）', -hj.loss, ''], { r: ['所得金額又は欠損金額（千円未満切捨て）', hj.income, ''], c: 'tot' }];
  // 別表五(一)
  const so = fs.bs.L.find(r => r.name === '未払法人税等'), taxOpen = so?.open ?? 0, taxClose = so?.bal ?? 0, taxFinal = hj.hzNet - hj.interim + hj.chihou + hj.boei + hj.kPref + hj.kCity + hj.zHzPref + hj.zHzCity;
  const retO = fs.bs.retainedOpen;
  const retClose = fs.eq.re.close, o5 = d.b5 || [], o5sum = o5.reduce((s, r) => s + (+r.open || 0), 0), o5inc = o5.reduce((s, r) => s + (+r.inc || 0), 0), o5dec = o5.reduce((s, r) => s + (+r.dec || 0), 0);
  const depEx = hj.depExcess;
  const r5 = [
    ['繰越損益金（損は赤）', retO, retO, retClose, retClose],
    ['納税充当金（未払法人税等）', taxOpen, taxOpen, taxClose, taxClose],
    ['減価償却超過額（別表十六 入力分）', 0, 0, depEx, depEx],
    ...o5.map(r => [r.label, +r.open || 0, +r.dec || 0, +r.inc || 0, (+r.open || 0) - (+r.dec || 0) + (+r.inc || 0)]),
  ];
  const r5tot = [0, 1, 2, 3].map(i => r5.reduce((s, r) => s + r[i + 1], 0));
  const capRows = fs.bs.E.filter(r => /資本金|資本準備金|その他資本剰余金|新株式申込証拠金/.test(r.category) && (r.bal || r.open)).map(r => [r.name, r.open, 0, r.bal - r.open, r.bal]);
  const capTot = [0, 1, 2, 3].map(i => capRows.reduce((s, r) => s + r[i + 1], 0));
  // 別表十五 / 十六
  const b15 = [['支出交際費等の額（交際費勘定。会議費は含まない）', e.total], ['うち1人5,000円以下の飲食費（別表十五で除外・入力）', e.small], ['交際費等の額（対象）', e.target], ['① 定額控除限度額（800万円×月数/12）', e.lim1], ['① による損金不算入額', e.d1], ['② 接待飲食費の50%（接待飲食費 入力）', e.meal * 0.5], ['② による損金不算入額', e.meal > 0 ? e.d2 : '（未入力）'], { r: ['損金不算入額（有利な方を採用: ' + e.method + '）', e.disallow], c: 'tot' }];
  const dep = (d.dep || []), b16 = dep.map(r => [r.name || '', +r.cost || 0, +r.dep || 0, +r.limit || 0, Math.max(0, (+r.dep || 0) - (+r.limit || 0))]);
  const book = fs.pl.sgaRows.find(r => r.name === '減価償却費')?.bal ?? 0;
  const ratesTbl = [['法人税（中小法人）', '年800万円以下 15% / 超 23.2%', 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/hojin/5759.htm'], ['地方法人税', '法人税額×10.3%', 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/hojin/5759.htm'],
    ['防衛特別法人税', '(基準法人税額−500万円)×4%（令和8年4月1日以後開始事業年度〜）', 'https://www.nta.go.jp/publication/pamph/pdf/0025004-109_1.pdf'], ['三重県 法人事業税', '所得 400万以下 3.5% / 400〜800万 5.3% / 超 7.0%', 'https://www.pref.mie.lg.jp/ZEIMU/HP/16336017880.htm'],
    ['特別法人事業税', '事業税所得割（標準税率で計算）×37%', 'https://www.soumu.go.jp/main_sosiki/jichi_zeisei/czaisei/czaisei_seido/150790_01.html'], ['三重県 法人県民税', '均等割 資本金等1千万円以下 22,000円（みえ森と緑の県民税2,000円を含む）／法人税割 1.0%', 'https://www.pref.mie.lg.jp/ZEIMU/HP/16338017882.htm'],
    ['四日市市 法人市民税', '均等割 資本金等1千万円以下・従業者50人以下 50,000円／法人税割 7.2%（標準6.0%＋超過1.2%）', 'https://www.city.yokkaichi.lg.jp/www/contents/1001000000675/index.html']];
  const est = [['法人税（所得税額控除後・1,000円未満切捨て）', hj.hzNet], ['地方法人税（100円未満切捨て）', TX.fH(hj.chihou)], ['防衛特別法人税', hj.boei], ['法人事業税（所得割）', hj.biz], ['特別法人事業税', hj.spBiz], ['県民税 均等割', hj.kPref], ['県民税 法人税割（1.0%）', hj.zHzPref], ['市民税 均等割', hj.kCity], ['市民税 法人税割（7.2%）', hj.zHzCity], { r: ['法人税等の概算 合計', hj.total], c: 'tot' }, ['（参考）帳簿の法人税、住民税及び事業税', fs.pl.tax], ['差（概算 − 帳簿）', hj.total - fs.pl.tax]];

  // 実際の申告書との比較（第5期のみ）
  const A5 = ACT5, ck = (l, mine, act) => ({ r: [l, mine, act, mine === act ? '✅ 一致' : '⚠ 差 ' + yen(mine - act)] });
  const addNz = (hj.adds.find(r => r.auto && /納税充当金/.test(r.label)) || {}).amount || 0, kenM = hj.kPref + hj.zHzPref, shiM = hj.kCity + hj.zHzCity, jigM = hj.biz + hj.spBiz;
  const cmpRows = y.y === 2025 ? [{ r: ['【別表四】', '', '', ''], c: 'sec' }, ck('当期利益（税引後）', hj.preTax, A5.b4.net), ck('加算: 損金経理した納税充当金（5）', addNz, A5.b4.nouzei), ck('加算: 減価償却超過額（10）', hj.depExcess, A5.b4.depEx), ck('減算: 納税充当金から支出した事業税等（13）', hj.sS, A5.b4.jigyo),
    ck('仮計（26）', hj.sub1 - hj.adds.filter(r => /^法人税額から控除/.test(r.label)).reduce((t, r) => t + (+r.amount || 0), 0), A5.b4.kari), ck('法人税額から控除される所得税額（29）', hj.credit, A5.b4.shotoku), ck('所得金額（52）', hj.income0, A5.b4.income),
    { r: ['【別表一・地方税】', '', '', ''], c: 'sec' }, ck('法人税額（千円未満切捨て後の所得×15%）', hj.hz, A5.b1.hz), ck('所得税額控除', hj.credit, A5.b1.credit), ck('差引所得に対する法人税額（13）', hj.hzNet, A5.b1.diff), ck('中間納付額', hj.interim, A5.b1.interim), ck('確定法人税額（15）', hj.final, A5.b1.final),
    ck('地方法人税額（31）', hj.chihou, A5.b1.chihou), ck('地方法人税 確定（100円未満切捨て・40）', TX.fH(hj.chihou), A5.b1.chihouFinal), ck('道府県民税（均等割＋法人税割）', kenM, A5.ken), ck('市町村民税（均等割＋法人税割）', shiM, A5.shi),
    ck('事業税＋特別法人事業税（別表五から逆算）', jigM, A5.jigyoTotal), ck('納税充当金（納付見込の総額）', hj.final + TX.fH(hj.chihou) + kenM + shiM + jigM, A5.paid),
    { r: ['【別表五(一)】', '', '', ''], c: 'sec' }, ck('繰越損益金 期末', retClose, A5.b5.ret[3]), ck('納税充当金 期末', taxClose, A5.b5.nouzeiJ[3]), ck('差引合計額 期末', r5tot[3], A5.b5.total[3]),
    { r: ['【消費税】', '', '', ''], c: 'sec' }, ['消費税の申告書', '—', '申告なし（免税事業者）', '免税事業者のため申告・納付なし'] ] : [];
  const addCols = [['label', '項目', 's', '260px'], ['amount', '金額', 'n'], ['kind', '処分（留保/社外流出）', 's']], subCols = [['label', '項目（例: 前期の事業税の認容、受取配当等の益金不算入）', 's', '260px'], ['amount', '金額', 'n']];
  return `<div class="card noprint"><h3>入力（この期）</h3><div class="g">${iN('capital', '資本金等の額（円）※空欄=貸借対照表から', '', `BS上の自動値: ${yen(cap)}円。一般社団法人は基金等がなければ0。`)}
    ${iSel('emp50', '市内の従業者数', [['1', '50人以下'], ['0', '50人超']], '1')}${iN('loss', '繰越欠損金の当期控除額（別表七(一)）', 0)}${iN('credit', '所得税額控除・外国税額控除（別表六）', 0, '利息の源泉所得税は帳簿の少額な法人税等に含まれます')}${iN('interim', '法人税の中間納付額', 0)}${iN('kintoCityOv', '市民税 均等割の実額（空欄=資本金等・従業者数から自動）', '', '第5期の申告書から逆算: 100,000円（市民税135,700−法人税割35,700）。要確認')}${iN('kintoPrefOv', '県民税 均等割の実額（空欄=自動）', '')}</div>
    <h4>別表四 加算（自動分は下に表示。ここには追加分を入力）</h4>${iRows('adds', addCols, 3)}<h4>別表四 減算</h4>${iRows('subs', subCols, 3)}
    <h4>別表十五 交際費（入力）</h4><div class="g">${iN('entertainTotal', '支出交際費等の額（空欄=交際費勘定）', '')}${iN('entSmall', '1人5,000円以下の飲食費', 0)}${iN('entMeal', '接待飲食費（②50%基準を使う場合）', 0)}</div>
    <h4>別表十六 減価償却資産（資産ごとに入力。限度額は償却方法に応じ計算した額）</h4>${iRows('dep', [['name', '資産名', 's', '160px'], ['cost', '取得価額', 'n'], ['dep', '当期の償却費計上額', 'n'], ['limit', '償却限度額', 'n']], 3)}<p class="note">帳簿の減価償却費: ${yen(book)}円</p>
    <h4>別表五(一) その他の利益積立金（期首／減／増の入力）</h4>${iRows('b5', [['label', '項目', 's', '200px'], ['open', '期首現在', 'n'], ['dec', '当期減', 'n'], ['inc', '当期増', 'n']], 2)}
    <h4>別表二 同族会社の判定（社員・株主ごと）</h4>${iRows('dz', [['name', '氏名', 's'], ['votes', '議決権数（持株数）', 'n'], ['group', '同族グループ番号', 's']], 3)}
    <button onclick="txSave()">💾 入力を保存して再計算</button></div>
    ${y.y === 2025 ? tSec('実際の申告書（第5期・税理士作成・電子申告済・令和8.7.28決算確定）と本システムの計算の比較', ['項目', '本システム', '実際の申告書', '結果'], cmpRows, { num: true, note: '申告書の値は別表一・四・五(一)の写真から転記して保存したものです（コード内 ACT5）。「入力」欄の初期値（前期事業税の認容14,100・所得税額控除346・償却超過232,383・市民税均等割100,000・別表五の未納税額）も申告書から設定しています。' + (TXS.seeded ? ' <b>まだDBに保存されていません。「入力を保存して再計算」を押すと確定します。</b>' : '') }) : ''}
    ${tSec('別表一（各事業年度の所得に係る法人税額の計算）の概算', ['項目', '金額（円）'], b1)}
    ${tSec('別表四（所得の金額の計算に関する明細書）', ['区分', '金額（円）', '処分'], b4, { num: false, note: '自動加算: 納税充当金繰入（帳簿の法人税等の全額）、交際費不算入、償却超過額。<b>前期分の事業税の認容など減算は未入力のままです。</b>' })}
    ${tSec('別表五(一) 利益積立金額の計算に関する明細書（簡易）', ['区分', '期首現在', '当期減', '当期増', '差引翌期首'], [...r5, { r: ['差引合計額（利益積立金額）', ...r5tot], c: 'tot' }], { note: '繰越損益金は帳簿の期首・期末の繰越利益剰余金。未納法人税等の行は確定税額が決まったら「その他」に入力してください。' })}
    ${tSec('別表五(一)Ⅱ 資本金等の額の計算に関する明細書', ['区分', '期首現在', '当期減', '当期増', '差引翌期首'], [...capRows, { r: ['差引合計額（資本金等の額）', ...capTot], c: 'tot' }])}
    ${tSec('別表十五 交際費等の損金算入に関する明細書（中小法人）', ['項目', '金額（円）'], b15)}
    ${tSec('別表十六 減価償却資産の償却額の計算に関する明細書（入力集計）', ['資産', '取得価額', '償却費計上額', '償却限度額', '償却超過額'], b16.length ? b16 : [['（未入力）', 0, 0, 0, 0]])}
    ${tSec('別表二 同族会社等の判定に関する明細書', ['区分', '議決権数', '割合'], [...dz.groups.map(([g, v]) => ['グループ ' + g, v, dz.total ? pct(v / dz.total, 1) : '']), { r: ['合計', dz.total, ''], c: 'tot' }, { r: ['最大グループの割合', '', pct(dz.topShare, 1)], c: '' }, { r: ['判定（50%超で同族会社）', '', dz.total ? (dz.isDoozoku ? '同族会社' : '同族会社に該当しない') : '（未入力）'], c: 'tot' }], { note: '一般社団法人は社員1人1議決権が原則です。判定は法人税法2条10号に基づく簡易判定（特定同族会社・留保金課税は対象外）。' })}
    ${tSec('法人税・地方税の概算（三重県四日市市・資本金等・従業者数による）', ['税目', '概算額（円）'], est)}
    <div class="card"><h3>使用した税率・根拠</h3><table>${ratesTbl.map(r => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td class="note noprint"><a href="${r[2]}" target="_blank" rel="noopener">根拠</a></td></tr>`).join('')}</table>
    <p class="note">事業税は翌期に損金算入されるため、帳簿の税額（納税充当金）と当期の概算は一致しません。非営利型でない普通法人として、収益事業以外も含め全所得が課税対象です。</p></div>`;
}

/* ---- (4) 消費税 ---- */
function txSh() {
  const { sh } = TXS.calc, d = TXS.data, s = sh.s, taxLabel = { P10: '課税仕入 10%', P8R: '課税仕入 軽減8%' };
  const t1 = [['課税売上 10%（税込）', s.S10, sh.base10, sh.taxSales10], ['課税売上 軽減8%（税込）', s.S8R, sh.base8, sh.taxSales8], { r: ['課税売上 合計（課税標準額=税抜・1,000円未満切捨て）', s.S10 + s.S8R, sh.base10 + sh.base8, sh.salesTax], c: 'tot' }, ['非課税売上（利用料・利息等）', s.EXEMPT, '', ''], ['対象外（不課税）の収入', s.NA_REV, '', '']];
  const t2 = [['課税仕入 10%（税込）', sh.p10, Math.floor(sh.tax10)], ['課税仕入 軽減8%（税込）', sh.p8, Math.floor(sh.tax8)], { r: ['課税仕入 合計', sh.p10 + sh.p8, Math.floor(sh.totPurTax)], c: 'tot' }, ['経過措置による控除減（未登録事業者分）', '', -Math.floor(sh.reduce)], { r: ['仕入税額控除の対象（全額控除した場合）', '', Math.floor(sh.creditAll)], c: 'tot' }];
  const cmp = [['課税売上高（税抜）', Math.round(sh.taxableSalesEx), Math.round(sh.taxableSalesEx)], ['課税売上割合', pct(sh.ratio, 3), '—'], ['課税標準額に対する消費税額（国税7.8%/6.24%）', sh.salesTax, sh.salesTax], ['控除対象仕入税額', sh.gen.credit, sh.simp.credit],
    ['（簡易課税 みなし仕入率・事業区分）', '—', pct(sh.simp.rate, 0) + '・第' + sh.simp.kind + '種'],
    ['納付する消費税（国税・100円未満切捨て）', sh.gen.nat, sh.simp.nat], ['地方消費税（国税×22/78）', sh.gen.loc, sh.simp.loc], { r: ['納付税額の概算（国税+地方）', sh.gen.total, sh.simp.total], c: 'tot' }, ['中間納付額（入力）', sh.interim, sh.interim], { r: ['差引納付（還付）概算', sh.gen.total - sh.interim, sh.simp.total - sh.interim], c: 'tot' }];
  const ps = TXS.calc.shPrev, pf = TXS.calc.pfy, L = 10000000, ex = Math.round(sh.taxableSalesEx), pex = Math.round(ps.taxableSalesEx);
  const jd = v => v > L ? '1,000万円超（課税事業者の可能性）' : '1,000万円以下';
  const jud = [['今期 ' + TXS.fy.label, ex, ex - L, jd(ex)], ['前期 ' + pf.label, pex, pex - L, jd(pex)], ['課税売上割合（今期）', pct(sh.ratio, 3), '', '']];
  const mtd = [['一括比例配分方式', sh.genProp.credit, sh.genProp.total], ['個別対応方式', sh.genInd.credit, sh.genInd.total]];
  const detail = Object.entries(sh.byAcc).map(([k, v]) => { const [n, c] = k.split('|'); return [n, { P10: '課税仕入10%', P8R: '課税仕入8%', S10: '課税売上10%', S8R: '課税売上8%', EXEMPT: '非課税売上' }[c], v]; }).sort((a, b) => a[1].localeCompare(b[1]) || b[2] - a[2]);
  return `<div class="card noprint"><h3>入力（この期）</h3><div class="g">${iSel('taxable', '消費税の事業者区分', [['0', '免税事業者（申告・納付なし）'], ['1', '課税事業者（概算を表示）']], '0')}${iSel('kind', '簡易課税の事業区分', [[1, '第1種 卸売90%'], [2, '第2種 小売80%'], [3, '第3種 製造等70%'], [4, '第4種 その他60%'], [5, '第5種 サービス業等50%'], [6, '第6種 不動産40%']], 5)}
    ${iN('pA', '課税売上のみに対応する課税仕入（税込）', 0, '個別対応方式の区分1')}${iN('pB', '非課税売上のみに対応する課税仕入（税込）', 0, '区分2。残りは共通対応')}
    ${iN('u80', '適格請求書なし仕入（税込）〜2026/9/30 → 80%控除', 0)}${iN('u70', '適格請求書なし仕入（税込）2026/10/1〜2028/9/30 → 70%控除', 0)}${iN('interimC', '消費税の中間納付額', 0)}</div>
    <button onclick="txSave()">💾 入力を保存して再計算</button></div>
    ${sh.taxable ? '' : `<div class="card" style="border-left:4px solid #2e7d32"><h3>免税事業者のため消費税の申告・納付は不要です</h3><p>概算納付額（原則課税・簡易課税）は表示していません。課税事業者に変更した場合のみ、上の「消費税の事業者区分」で切り替えると従来の概算を表示します。以下の集計は参考です。</p></div>`}
    ${tSec('免税の判定の目安（課税売上高 1,000万円超か）', ['期', '課税売上高（税抜）', '1,000万円との差', '判定の目安'], jud, { num: true, note: '免税事業者の判定は<b>基準期間（前々事業年度）</b>の課税売上高が1,000万円以下かどうかで行います（特定期間の判定・インボイス登録の有無も影響）。ここでは今期と前期の課税売上を目安として表示します。正式な判定は税理士に確認してください。' })}
    ${sh.taxable ? `<div class="warn">この法人は課税売上（雑収入等）が小さく、売上の大半が非課税（利用料）です。課税売上割合が極めて低いため、仕入税額控除はほぼ使えません。簡易課税制度選択届出書の提出有無、2割特例の適用可否を税理士に確認してください。</div>` : ''}
    ${tSec('課税売上・非課税売上の集計', ['区分', '税込金額', '課税標準額（税抜）', '消費税額（国税）'], t1, { note: '税区分と取引から集計（税込経理）。税区分が付いていない取引は集計に入りません。' })}
    ${tSec('課税仕入の集計', ['区分', '税込金額', '仕入に係る消費税額（国税分）'], t2)}
    ${sh.taxable ? tSec('原則課税 と 簡易課税 の概算比較', ['項目', '原則課税（' + sh.method + '）', '簡易課税'], cmp, { num: true, note: '有利なのは <b>' + sh.preferred + '</b>（概算）。簡易課税は事前の届出が必要で、基準期間の課税売上高5,000万円以下が条件です。' }) : ''}
    ${sh.taxable ? tSec('（参考）原則課税の控除方式別', ['方式', '控除対象仕入税額', '納付税額（国+地方）'], mtd) : ''}
    ${tSec('集計の明細（科目×税区分）', ['科目', '税区分', '税込金額'], detail)}
    <div class="card"><h3>注意（インボイス）</h3><ul><li>適格請求書（インボイス）の登録番号がない事業者からの課税仕入は、経過措置で仕入税額の<b>80%（〜2026/9/30）、70%（2026/10/1〜2028/9/30）、50%（〜2030/9/30）、30%（〜2031/9/30）</b>のみ控除できます。この画面は取引ごとに登録番号を持たないため、該当額を上の欄に入力してください。</li>
    <li>1万円未満の課税仕入は少額特例（基準期間の課税売上高1億円以下）で請求書なしでも控除できます（令和11年9月30日まで）。</li>
    <li>根拠: <a href="https://www.nta.go.jp/taxes/shiraberu/zeimokubetsu/shohi/keigenzeiritsu/invoice_about.htm" target="_blank" rel="noopener">国税庁 インボイス制度</a>、<a href="https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6505.htm" target="_blank" rel="noopener">簡易課税制度</a>、<a href="https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6355.htm" target="_blank" rel="noopener">仕入税額控除</a>。</li></ul></div>`;
}

/* ---- (6) 検証 ---- */
function txVf() {
  const { fs, hj, sh } = TXS.calc, y = TXS.fy.y, A = n => fs.bs.A.find(r => r.name === n)?.bal ?? 0;
  const cash = fs.bs.A.filter(r => r.category === '現金・預金').reduce((s, r) => s + r.bal, 0), card = fs.bs.L.filter(r => /カード|JCB|MasterCard/.test(r.name)).reduce((s, r) => s + r.bal, 0);
  const ref = y === 2025 ? { net: 2222843, sales: 47379798, cash: 4911339, card: 882178, tax: 868546 } : null;
  const ck = (l, mine, f) => [l, mine, f ?? '', f == null ? '—' : mine === f ? '✅ 一致' : '⚠ 差 ' + yen(mine - f)];
  const rows = ref ? [ck('売上高', fs.pl.sales, ref.sales), ck('当期純利益', fs.pl.net, ref.net), ck('預金・現金の期末残高', cash, ref.cash), ck('カード未払の期末残高', card, ref.card), ck('法人税、住民税及び事業税（帳簿）', fs.pl.tax, ref.tax)] : [['（第5期のみfreeeの確定値と照合）', '', '', '']];
  const tax = [['この画面の概算（法人税・地方法人税・事業税・特別法人事業税・住民税）', hj.total], ['freee帳簿の計上額（2026/5/31 決算整理 868,200円＋利息源泉税等346円）', fs.pl.tax], ['差（概算−帳簿）', hj.total - fs.pl.tax]];
  const pay = [['2026-07-30 未払法人税等の支払（4件）', 547000 + 85700 + 185500 + 50000], ['　547,000円', 547000], ['　185,500円', 185500], ['　85,700円', 85700], ['　50,000円', 50000]];
  const income = hj.income, hz = hj.hz;
  return `${tSec('freee 試算表（確定値）との照合', ['項目', '本システム', 'freee', '結果'], rows, { num: true })}
    ${tSec('法人税等の概算と帳簿の差', ['項目', '金額（円）'], tax)}
    <div class="card"><h3>差の要因（第5期）</h3><ol>
    <li><b>帳簿の868,200円は決算整理で計上された見積り</b>で、翌期（2026/7/30）に4件（547,000円・185,500円・85,700円・50,000円）で納付されています。内訳の科目名は取引に残っていないため、税目の割り当ては税理士の申告書で確認が必要です。</li>
    <li>この画面の概算は、<b>税引前利益 ${yen(fs.pl.pretax)}円</b>に交際費・償却超過などの調整を<b>まだ加算していない</b>状態の所得（${yen(income)}円）で計算しています。帳簿の法人税等が概算より約${yen(Math.round(Math.max(0, fs.pl.tax - hj.total)))}円大きいのは、申告上の加算項目（償却超過額・役員給与・寄付金・交際費・未払金の損金性など）が税理士の計算で加算されている可能性が高いためです。<b>仮に547,000円が法人税だとすると、所得は約364万円</b>（15%で逆算）となり、この画面の所得より約${yen(Math.round(547000 / 0.15 - income))}円多い計算です（あくまで仮定。申告書で確認）。</li>
    <li>前期（第4期）分の事業税は第5期の損金（減算）になりますが、入力が空のため、その分概算は大きめに出ます。逆方向の差です。</li>
    <li>均等割（県22,000円＋市50,000円）は資本金等0円・従業者50人以下の前提です。実際の資本金等・従業者数で変わります。</li>
    <li>税率は上記のとおり令和8年度の公表値（四日市市の法人税割は超過税率7.2%）。<b>消費税の納付は帳簿の法人税等には含まれていません</b>${sh.taxable ? `（${yen(sh.gen.total)}円〜）` : '（免税事業者のため納付なし）'}。</li></ol></div>
    ${tSec('2026/7/30 の納付（freee）', ['項目', '金額（円）'], pay)}
    <div class="card"><h3>次にやること</h3><p>税理士が作成した第5期の申告書（別表一・四・五）の数字を「入力」欄に入れ、概算との差を詰めてください。差が減れば、翌期以降の見積りの精度が上がります。</p></div>`;
}
