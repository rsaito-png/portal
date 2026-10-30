// 処遇改善加算。月の作業は1画面。配分は自動で、事務は金額を決めない。
// 権限の本体は supabase/shogu.sql の shogu_can()。
let SHOGU = { db: null, live: null, month: '', office: '', msg: '', file: null, edits: null, forceAuto: true, adjustOpen: false, fixAmount: false, pendingService: '', lastWarnings: [] };

function shoguDemoSeed() {
  return {
    nextId: 10,
    settings: { id: 1, fy_year: 2026, regular_this: 1, regular_next: 4, freeway_item: '処遇改善手当', freeway_bonus_item: '処遇改善一時金' },
    staff: [
      { id: 1, staff_code: '001', name: '見本 正子', office_id: 'leo', employment: '正社員', contract_yen: 250000, baseline_yen: 250000, active: true, note: '' },
      { id: 2, staff_code: '002', name: '見本 花', office_id: 'leo', employment: '非正規', contract_yen: 180000, baseline_yen: 180000, active: true, note: '' },
      { id: 3, staff_code: '101', name: '見本 茶', office_id: 'chamu', employment: '非正規', contract_yen: 200000, baseline_yen: 200000, active: true, note: '' },
    ],
    receipts: [],
    pays: [],
    files: [],
  };
}
function shoguDb() {
  if (typeof DEMO !== 'undefined' && DEMO) { if (!SHOGU.db) SHOGU.db = shoguDemoSeed(); return SHOGU.db; }
  return SHOGU.live;
}
async function shoguAccess() {
  if (typeof DEMO !== 'undefined' && DEMO) return (typeof ROLE !== 'undefined' && ROLE === '事務') || (typeof DUTY !== 'undefined' && DUTY === '管理者') ? 'ok' : 'denied';
  try {
    const s = JSON.parse(localStorage.getItem('sess') || 'null');
    if (!s || !s.token) return 'denied';
    const r = await fetch(C.supabaseUrl + '/rest/v1/rpc/shogu_can', { method: 'POST', headers: { apikey: C.supabaseKey, Authorization: 'Bearer ' + s.token, 'Content-Type': 'application/json' }, body: '{}' });
    if (r.status === 404) return 'missing';
    if (r.ok && (await r.json()) === true) return 'ok';
    return 'denied';
  } catch (e) { return 'denied'; }
}
async function shoguUiCan() { return (await shoguAccess()) === 'ok'; }
function shoguOfficeName(id) { const o = (C.offices || []).find(x => x.id === id); return o ? o.name : (id || ''); }
function shoguComma(n) {
  const neg = Number(n) < 0;
  const s = String(Math.abs(Math.trunc(Number(n))));
  return (neg ? '-' : '') + s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
function shoguYen(n) { return n == null || n === '' ? '—' : shoguComma(n) + '円'; }
function shoguPrevMonth() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric' }).formatToParts(new Date());
  let y = +parts.find(p => p.type === 'year').value, m = +parts.find(p => p.type === 'month').value - 1;
  if (m === 0) { m = 12; y -= 1; }
  return y + '-' + String(m).padStart(2, '0');
}
function shoguDefaultMonth() {
  const db = shoguDb() || { receipts: [], pays: [] };
  const months = [].concat((db.receipts || []).map(r => Shogu.ym(r.target_month)), (db.pays || []).map(p => Shogu.ym(p.target_month))).filter(Boolean).sort();
  return months.length ? months[months.length - 1] : shoguPrevMonth();
}
function shoguMonthReceipts() {
  const db = shoguDb() || { receipts: [] };
  return (db.receipts || []).filter(r => r.office_id === SHOGU.office && Shogu.ym(r.target_month) === SHOGU.month);
}
async function shoguFetch() {
  const [settings, staff, receipts, pays, files] = await Promise.all([
    sb('shogu_settings?select=*'),
    sb('shogu_staff?select=*&order=staff_code'),
    sb('shogu_receipt?select=*&order=target_month.desc'),
    sb('shogu_pay?select=*'),
    sb('shogu_pdf?select=*&order=uploaded_at.desc'),
  ]);
  return {
    settings: (settings && settings[0]) || { fy_year: 2026, regular_this: 1, regular_next: 4, freeway_item: '処遇改善手当', freeway_bonus_item: '処遇改善一時金' },
    staff: staff || [], receipts: receipts || [], pays: pays || [], files: files || [], nextId: 1,
  };
}
async function renderShogu(parts) {
  if (!parts) {
    const route = decodeURIComponent(location.hash.slice(1)).split('?')[0].split('/');
    parts = route[0] === 'shogu' ? route.slice(1) : [];
  }
  const settings = parts[0] === 'set';
  const back = settings
    ? `<div class="sg-top"><button class="back" type="button" onclick="location.hash='shogu'">← 月の作業へ</button></div>`
    : `<div class="sg-top"><button class="back" type="button" onclick="location.hash='soumu'">← 総務へ</button><button class="back" type="button" onclick="location.hash='shogu/set'">設定</button></div>`;
  const denied = back + '<h3>処遇改善加算（試作）</h3>';
  const access = await shoguAccess();
  if (access === 'denied') { $('view').innerHTML = `<div class="sg">${denied}<p>事務と管理者だけが見られます。</p></div>`; return; }
  if (access === 'missing') { $('view').innerHTML = `<div class="sg">${denied}<p>データベースにまだ表がありません。Supabase の SQL Editor で supabase/shogu.sql を実行してください。</p></div>`; return; }
  try { if (!(typeof DEMO !== 'undefined' && DEMO) && !SHOGU.live) SHOGU.live = await shoguFetch(); }
  catch (e) { $('view').innerHTML = `<div class="sg">${denied}<p>読み込めませんでした。supabase/shogu.sql を実行したあとに、入り直してください。</p></div>`; return; }
  const db = shoguDb();
  if (!SHOGU.month) SHOGU.month = shoguDefaultMonth();
  if (!SHOGU.office) SHOGU.office = ((db.staff || []).find(s => s.active !== false) || {}).office_id || ((C.offices || [])[0] || {}).id || 'leo';
  const msg = `<p id="sg_msg" class="sg-msg">${SHOGU.msg ? Shogu.esc(SHOGU.msg) : ''}</p>`;
  SHOGU.msg = '';
  const body = settings ? shoguSettingsView() : shoguFlowView();
  const proto = '<p class="note">国保連PDF→自動配分案→フリーウェイCSV。本番運用前の試作</p>';
  const lead = settings ? '' : '<p class="note">金額は自動で出します。提出・送金・フリーウェイへの送信はしません。</p>';
  $('view').innerHTML = `<div class="sg">${back}<h3>${settings ? '設定（試作）' : '処遇改善加算（試作）'}</h3>${proto}${lead}${msg}${body}</div>`;
}

function shoguWorking(plan) {
  const edits = SHOGU.edits || {};
  const pays = (shoguDb() || {}).pays || [];
  const showSaved = SHOGU.forceAuto === false;
  const shares = [], grosses = [], lumps = [];
  plan.people.forEach((s, i) => {
    const ed = edits[s.id] || {};
    const saved = pays.find(p => String(p.staff_id) === String(s.id) && Shogu.ym(p.target_month) === plan.month);
    const base = Number(s.baseline_yen) || 0;
    let share;
    if (ed.shogu != null) share = ed.shogu;
    else if (showSaved && saved && saved.shogu_yen != null) share = Number(saved.shogu_yen);
    else share = plan.shares[i];
    let gross;
    if (ed.gross != null) gross = ed.gross;
    else if (showSaved && saved && saved.gross_yen != null) gross = Number(saved.gross_yen);
    else gross = Math.max(base, share);
    shares.push(share);
    grosses.push(gross);
    lumps.push(saved ? (Number(saved.lump_yen) || 0) : 0);
  });
  return { shares, grosses, lumps, monthly: shares.reduce((a, b) => a + b, 0), lump: lumps.reduce((a, b) => a + b, 0) };
}
function shoguSavedMatches(plan, working) {
  if (!plan || plan.noReceipt || plan.noStaff || plan.ivUnknown || !plan.people.length) return false;
  const pays = (shoguDb() || {}).pays || [];
  return plan.people.every((s, i) => {
    const pay = pays.find(p => String(p.staff_id) === String(s.id) && Shogu.ym(p.target_month) === plan.month);
    if (!pay || pay.gross_yen == null) return false;
    return Number(pay.shogu_yen) === Number(working.shares[i]) && Number(pay.gross_yen) === Number(working.grosses[i]);
  });
}
function shoguDiffers(plan, working) {
  if (!plan || !plan.people.length || plan.noReceipt) return false;
  const pays = (shoguDb() || {}).pays || [];
  const any = plan.people.some(s => pays.some(p => String(p.staff_id) === String(s.id) && Shogu.ym(p.target_month) === plan.month));
  return any && !shoguSavedMatches(plan, working);
}
function shoguCurrent() {
  const plan = SHOGU.plan;
  if (!plan) return null;
  const working = shoguWorking(plan);
  const people = plan.people.map((s, i) => ({ name: s.name, gross: working.grosses[i], baseline: s.baseline_yen }));
  const judge = Shogu.judgeMonth({ month: plan.month, received: plan.received, ivYen: plan.ivYen, monthly: working.monthly, lump: working.lump, people });
  return { plan, working, judge, saved: shoguSavedMatches(plan, working) };
}
function shoguTone(cur) {
  const plan = cur.plan;
  if (!plan || plan.noReceipt || plan.received == null || plan.noStaff || plan.ivUnknown) return 'wait';
  return cur.judge.tone;
}
function shoguHeadline(cur) {
  const plan = cur.plan;
  if (!plan || plan.noReceipt || plan.received == null) return '国保連のPDFを入れると、判定が出ます';
  if (plan.noStaff) return '先に設定で職員を入れてください';
  if (plan.ivUnknown || cur.judge.tone === 'wait') return '通知の区分が読めないので、まだ判定できません';
  if (cur.judge.tone === 'red') return 'あと' + shoguComma(cur.judge.short) + '円足りない';
  if (cur.judge.tone === 'yellow') return cur.judge.breaches.map(b => b.name + 'さんの支払総額が普段の給与を下回っている').join('、');
  if (cur.judge.half && cur.judge.half.code === 'exempt') return 'OK（賃金改善が加算以上です）';
  return 'OK（賃金改善が加算以上／1/2達成）';
}
function shoguSub(cur) {
  if (shoguTone(cur) !== 'red') return '';
  const bits = ['給与に載せる分を、あと' + shoguComma(cur.judge.short) + '円増やしてください。'];
  cur.judge.breaches.forEach(b => bits.push(b.name + 'さんの支払総額が普段の給与を下回っている'));
  return bits.join('');
}
function shoguPoolText(cur) {
  if (shoguTone(cur) === 'wait') return '';
  const count = Shogu.regularCount(cur.plan.month, (shoguDb() || {}).settings || {});
  const pool = cur.judge.pool == null ? 0 : Math.max(0, cur.judge.pool);
  const yen = shoguYen(pool);
  if (!count) return `賞与に回せる残り ${yen}（正社員が0人です）`;
  const sim = Shogu.simulatePool(pool, count);
  return `賞与に回せる残り ${yen}（正社員${count}人なら1人あたり約${shoguComma(sim.per)}円）`;
}
function shoguPaint() {
  const cur = shoguCurrent();
  if (!cur) return;
  const tone = shoguTone(cur);
  cur.plan.people.forEach((s, i) => {
    const el = document.querySelector('[data-sg-yen="' + s.id + '"]');
    if (el) el.textContent = shoguYen(cur.working.shares[i]);
  });
  const sum = document.getElementById('sg_plan_sum');
  if (sum) sum.textContent = shoguYen(cur.working.monthly);
  const card = document.getElementById('sg_card');
  if (card) card.className = 'sg-card ' + tone;
  const h = document.getElementById('sg_card_h');
  if (h) h.textContent = shoguHeadline(cur);
  const sub = document.getElementById('sg_card_sub');
  if (sub) sub.textContent = shoguSub(cur);
  const pool = document.getElementById('sg_pool');
  if (pool) { pool.textContent = shoguPoolText(cur); pool.hidden = tone === 'wait'; }
  const csv = document.getElementById('sg_csv');
  if (csv) csv.hidden = !(tone === 'green' && cur.saved);
  const diff = document.getElementById('sg_diff');
  if (diff) diff.hidden = tone === 'wait' || !shoguDiffers(cur.plan, cur.working);
}
function shoguOfficeOptions(selected) {
  return (C.offices || []).map(o => `<option value="${Shogu.esc(o.id)}"${o.id === selected ? ' selected' : ''}>${Shogu.esc(o.name)}</option>`).join('');
}
function shoguServiceLine(plan) {
  if (!plan.services.length) return '';
  if (plan.services.length === 1) return `<p class="sg-quiet">${Shogu.esc(plan.services[0].service)}</p>`;
  return `<p class="sg-quiet">${plan.services.map(s => Shogu.esc(s.service) + ' ' + shoguYen(s.yen)).join('、')}</p>`;
}
function shoguManualBox(plan) {
  if (!SHOGU.fixAmount) return `<p><button type="button" class="back" id="sg_fix" onclick="shoguShowManual()">${plan.received == null ? '金額を手で入れる' : '金額を手で直す'}</button></p>`;
  const services = Shogu.servicesFor(SHOGU.office);
  const pending = SHOGU.pendingService || '';
  const opts = services.slice();
  if (pending && opts.indexOf(pending) < 0) opts.push(pending);
  const have = shoguMonthReceipts();
  const selected = pending || (have[0] && have[0].service_type) || opts[0] || '';
  const serviceField = opts.length === 0
    ? `<label>サービス<input id="sg_manual_service" value="${Shogu.esc(selected)}"></label>`
    : opts.length > 1
      ? `<label>サービス<select id="sg_manual_service">${opts.map(s => `<option${s === selected ? ' selected' : ''}>${Shogu.esc(s)}</option>`).join('')}</select></label>`
      : `<input id="sg_manual_service" type="hidden" value="${Shogu.esc(selected)}">`;
  return `<div><p class="sg-quiet">金額が読めないときは、円の整数を入れます。</p>
    <label>もらった加算（円）<input id="sg_amount_in" inputmode="numeric" autocomplete="off"></label>
    ${serviceField}
    <button type="button" class="back" onclick="shoguSaveManual()">この金額にする</button></div>`;
}
function shoguCategoryFields() {
  return shoguMonthReceipts().filter(r => Shogu.ivEquivalent(r).yen == null).map(r => {
    const cats = Shogu.categoriesFor(r.service_type, r.target_month);
    const cur = Shogu.normCategory(r.category);
    const opts = [''].concat(cats);
    if (cur && opts.indexOf(cur) < 0) opts.push(cur);
    const id = Number(r.id);
    if (!Number.isInteger(id)) return '';
    return `<label>${Shogu.esc(r.service_type)}の通知書に書いてある区分<select onchange="shoguPickCategory(${id}, this.value)">${opts.map(c => `<option value="${Shogu.esc(c)}"${c === cur ? ' selected' : ''}>${c ? Shogu.esc(c) : '選ぶ'}</option>`).join('')}</select></label>`;
  }).join('');
}
function shoguFlowView() {
  const db = shoguDb();
  const plan = Shogu.monthlyProposal({ month: SHOGU.month, officeId: SHOGU.office, receipts: db.receipts, staff: db.staff });
  SHOGU.plan = plan;
  const cur = shoguCurrent();
  const tone = shoguTone(cur);
  const ready = tone !== 'wait';
  const list = !ready
    ? (plan.noStaff && !plan.noReceipt ? '<p><button type="button" class="back" onclick="location.hash=\'shogu/set\'">設定を開く</button></p>' : '')
    : `<ul class="sg-list" id="sg_plan">${plan.people.map((s, i) => `<li><span>${Shogu.esc(s.name)}</span><b data-sg-yen="${s.id}">${shoguYen(cur.working.shares[i])}</b></li>`).join('')}<li class="sum"><span>合計</span><b id="sg_plan_sum">${shoguYen(cur.working.monthly)}</b></li></ul>`;
  const adjust = ready ? `<details id="sg_adjust"${SHOGU.adjustOpen ? ' open' : ''} ontoggle="SHOGU.adjustOpen=this.open"><summary>調整する</summary>
    <p id="sg_adj_msg" class="sg-msg"></p>
    ${plan.people.map((s, i) => `<div class="sg-person"><b>${Shogu.esc(s.name)}</b>
      <label>給与に載せる額<input id="sga_${s.id}_shogu" inputmode="numeric" autocomplete="off" value="${cur.working.shares[i]}" oninput="shoguAdjust(${Number(s.id)},'shogu',this.value)"></label>
      <label>今月の支払総額<input id="sga_${s.id}_gross" inputmode="numeric" autocomplete="off" value="${cur.working.grosses[i]}" oninput="shoguAdjust(${Number(s.id)},'gross',this.value)"></label>
      <p class="sg-quiet">普段の給与 ${shoguYen(s.baseline_yen)}</p></div>`).join('')}
    <button type="button" class="back" id="sg_reset" onclick="shoguResetAdjust()">案に戻す</button></details>` : '';
  const demoBtn = typeof DEMO !== 'undefined' && DEMO ? '<button type="button" class="back" id="sg_sample" onclick="shoguSample()">見本の通知を読み込む</button>' : '';
  return `<p class="sg-step">1. 月と事業所</p>
    <div class="sg-row">
      <label>月<input id="sg_month" type="month" value="${Shogu.esc(SHOGU.month)}" onchange="shoguPickMonth(this.value)"></label>
      <label>事業所<select id="sg_office" onchange="shoguPickOffice(this.value)">${shoguOfficeOptions(SHOGU.office)}</select></label>
    </div>
    <p class="sg-step">2. 国保連のPDF</p>
    <label class="sg-drop" ondragover="shoguDrag(event)" ondrop="shoguDrop(event)"><span>国保連のPDFを入れる</span>
      <input id="sg_file" type="file" accept="application/pdf,.pdf" onchange="shoguFile(this)"></label>
    ${demoBtn}
    <div class="sg-amount"><span>もらった加算</span><b id="sg_amount">${plan.received == null ? 'まだありません' : shoguYen(plan.received)}</b>${shoguServiceLine(plan)}</div>
    ${shoguManualBox(plan)}
    ${shoguCategoryFields()}
    <p class="sg-step">3. 給与に載せる案</p>
    ${list}
    <p id="sg_diff" class="note"${tone === 'wait' || !shoguDiffers(plan, cur.working) ? ' hidden' : ''}>前に確定した金額と違います。この案で確定すると上書きします。</p>
    ${ready ? '<button type="button" class="sg-go" id="sg_confirm" onclick="shoguConfirm()">この案で確定</button>' : ''}
    ${adjust}
    <p class="sg-step">4. 判定</p>
    <div id="sg_card" class="sg-card ${tone}"><p class="sg-h" id="sg_card_h">${Shogu.esc(shoguHeadline(cur))}</p><p id="sg_card_sub">${Shogu.esc(shoguSub(cur))}</p><p class="sg-pool" id="sg_pool"${tone === 'wait' ? ' hidden' : ''}>${Shogu.esc(shoguPoolText(cur))}</p></div>
    <button type="button" class="sg-go" id="sg_csv" onclick="shoguFreewayCsv('shogu_yen')"${tone === 'green' && cur.saved ? '' : ' hidden'}>フリーウェイ用CSVを出す</button>`;
}
function shoguPickMonth(v) { SHOGU.month = v; SHOGU.edits = null; SHOGU.forceAuto = true; SHOGU.adjustOpen = false; SHOGU.fixAmount = false; renderShogu(); }
function shoguPickOffice(v) { SHOGU.office = v; SHOGU.edits = null; SHOGU.forceAuto = true; SHOGU.adjustOpen = false; SHOGU.fixAmount = false; SHOGU.pendingService = ''; renderShogu(); }
function shoguShowManual() { SHOGU.fixAmount = true; renderShogu(); }
function shoguDrag(e) { e.preventDefault(); }
async function shoguDrop(e) { e.preventDefault(); const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) await shoguFile({ files: [f] }); }
function shoguAdjust(id, field, raw) {
  const parsed = Shogu.parseYenInput(raw);
  const msg = document.getElementById('sg_adj_msg');
  if (!parsed.ok) {
    if (msg) msg.textContent = parsed.reason === 'decimal' ? '小数は丸めません。整数で入れてください。' : '整数で入れてください。';
    return;
  }
  if (msg) msg.textContent = '';
  if (!SHOGU.edits) SHOGU.edits = {};
  if (!SHOGU.edits[id]) SHOGU.edits[id] = {};
  SHOGU.edits[id][field] = parsed.yen;
  shoguPaint();
}
function shoguResetAdjust() { SHOGU.edits = null; SHOGU.forceAuto = true; SHOGU.adjustOpen = true; renderShogu(); }

function shoguReceiptBody(row) {
  const month = Shogu.ym(row.target_month) || SHOGU.month;
  return {
    office_id: row.office_id, office_name: row.office_name || shoguOfficeName(row.office_id), office_number: row.office_number || '',
    service_type: row.service_type, target_month: month + '-01', amount_yen: row.amount_yen, amount_raw: row.amount_raw || String(row.amount_yen),
    category: row.category || '', rate_got_ppm: row.rate_got_ppm == null ? null : row.rate_got_ppm, rate_iv_ppm: row.rate_iv_ppm == null ? null : row.rate_iv_ppm,
    iv_yen: row.iv_yen == null ? null : row.iv_yen, iv_manual: !!row.iv_manual, note: row.note || '', updated_at: new Date().toISOString(),
  };
}
async function shoguUpsertReceipt(row) {
  const body = shoguReceiptBody(row);
  if (typeof DEMO !== 'undefined' && DEMO) {
    const db = shoguDb();
    const month = Shogu.ym(body.target_month);
    const i = db.receipts.findIndex(r => r.office_id === body.office_id && r.service_type === body.service_type && Shogu.ym(r.target_month) === month);
    if (i >= 0) db.receipts[i] = Object.assign({}, db.receipts[i], body);
    else db.receipts.push(Object.assign({ id: db.nextId++ }, body));
    SHOGU.file = null;
    return;
  }
  const saved = await sb('shogu_receipt?on_conflict=office_id,service_type,target_month', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify(body) });
  const receiptId = saved && saved[0] && saved[0].id;
  if (SHOGU.file && receiptId) await shoguUpload(receiptId, SHOGU.file);
  SHOGU.file = null;
  SHOGU.live = null;
}
async function shoguTakeNotice(text, file) {
  const n = Shogu.parseNotice(text || '');
  SHOGU.file = file || null;
  SHOGU.lastWarnings = n.warnings || [];
  const offices = (C.offices || []).filter(o => text && o.name && String(text).includes(o.name)).sort((a, b) => b.name.length - a.name.length);
  if (offices[0]) SHOGU.office = offices[0].id;
  if (n.yearMonth) SHOGU.month = n.yearMonth;
  SHOGU.edits = null;
  SHOGU.forceAuto = true;
  SHOGU.pendingService = n.serviceType || '';
  const service = n.serviceType || (Shogu.servicesFor(SHOGU.office)[0] || '');
  const msgs = [];
  if (file && typeof DEMO !== 'undefined' && DEMO) msgs.push('見本モードではPDFファイル自体は保存しません。');
  if (n.amountYen == null || !service || !SHOGU.month) {
    SHOGU.fixAmount = true;
    SHOGU.file = null;
    if (!String(text || '').trim()) msgs.push('文字が読めませんでした。金額を手で入れてください。');
    else if ((n.warnings || []).some(w => /小数/.test(w))) msgs.push('小数は丸めません。円の整数を手で入れてください。');
    else msgs.push('金額が読めませんでした。円の整数を手で入れてください。');
    SHOGU.msg = msgs.join('');
    renderShogu();
    return;
  }
  const rates = Shogu.lookupRates(service, SHOGU.month, n.category);
  try {
    await shoguUpsertReceipt({
      office_id: SHOGU.office, office_name: shoguOfficeName(SHOGU.office), office_number: n.officeNumber || '',
      service_type: service, target_month: SHOGU.month + '-01', amount_yen: n.amountYen, amount_raw: n.amountRaw || String(n.amountYen),
      category: Shogu.normCategory(n.category || ''), rate_got_ppm: rates.rateGot, rate_iv_ppm: rates.rateIv, iv_yen: null, iv_manual: false, note: '',
    });
    SHOGU.fixAmount = false;
    msgs.unshift('読みました。');
    SHOGU.msg = msgs.join('');
  } catch (e) { alert('記録できませんでした。 ' + e.message); return; }
  renderShogu();
}
function shoguSample() { return shoguTakeNotice(Shogu.SAMPLE_NOTICE, null); }
async function shoguSaveManual() {
  const el = document.getElementById('sg_amount_in');
  const amount = Shogu.parseYenInput(el ? el.value : '');
  if (!amount.ok || amount.yen == null) {
    SHOGU.fixAmount = true;
    SHOGU.msg = amount.reason === 'decimal' ? '小数は丸めません。円の整数を手で入れてください。' : '金額を整数で入れてください。';
    renderShogu();
    return;
  }
  const serviceEl = document.getElementById('sg_manual_service');
  const service = serviceEl ? serviceEl.value : (SHOGU.pendingService || (Shogu.servicesFor(SHOGU.office)[0] || ''));
  if (!service || !SHOGU.month) { SHOGU.msg = '月とサービスを選んでください。'; renderShogu(); return; }
  const existing = shoguMonthReceipts().find(r => r.service_type === service);
  const cat = existing ? (existing.category || '') : '';
  const rates = Shogu.lookupRates(service, SHOGU.month, cat);
  SHOGU.edits = null;
  SHOGU.forceAuto = true;
  SHOGU.fixAmount = false;
  try {
    await shoguUpsertReceipt({
      office_id: SHOGU.office, office_name: shoguOfficeName(SHOGU.office), office_number: existing ? (existing.office_number || '') : '',
      service_type: service, target_month: SHOGU.month + '-01', amount_yen: amount.yen, amount_raw: String(amount.yen),
      category: cat, rate_got_ppm: cat ? rates.rateGot : null, rate_iv_ppm: cat ? rates.rateIv : null, iv_yen: null, iv_manual: false, note: '',
    });
  } catch (e) { alert('記録できませんでした。 ' + e.message); return; }
  renderShogu();
}
async function shoguPickCategory(id, category) {
  const rec = ((shoguDb() || {}).receipts || []).find(r => String(r.id) === String(id));
  if (!rec) return;
  const cat = Shogu.normCategory(category);
  const rates = Shogu.lookupRates(rec.service_type, rec.target_month, cat);
  SHOGU.forceAuto = true;
  SHOGU.edits = null;
  try {
    await shoguUpsertReceipt(Object.assign({}, rec, { category: cat, rate_got_ppm: rates.rateGot, rate_iv_ppm: rates.rateIv, iv_manual: false, iv_yen: null }));
  } catch (e) { alert('記録できませんでした。 ' + e.message); return; }
  renderShogu();
}
async function shoguReadBytes(file) { return new Uint8Array(await file.arrayBuffer()); }
async function shoguInflate(bytes) {
  const ds = new DecompressionStream('deflate');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function shoguFile(input) {
  const file = input.files && input.files[0];
  if (input && 'value' in input) input.value = '';
  if (!file) return;
  const bytes = await shoguReadBytes(file);
  if (!(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) { SHOGU.msg = 'PDFではありません。'; renderShogu(); return; }
  let text = '';
  try { text = await Shogu.extractPdfText(bytes, shoguInflate); } catch (e) { text = ''; }
  await shoguTakeNotice(text, file);
}
async function shoguUpload(receiptId, file) {
  const path = receiptId + '/' + (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())) + '.pdf';
  const s = JSON.parse(localStorage.getItem('sess') || '{}');
  const up = await fetch(C.supabaseUrl + '/storage/v1/object/shogu-pdf/' + path.split('/').map(encodeURIComponent).join('/'), {
    method: 'POST', headers: { apikey: C.supabaseKey, Authorization: 'Bearer ' + s.token, 'Content-Type': 'application/pdf', 'x-upsert': 'false' }, body: file,
  });
  if (!up.ok) throw new Error('PDFの保存に失敗しました（' + up.status + '）');
  await sb('shogu_pdf', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ receipt_id: receiptId, storage_path: path, file_name: file.name, extract_json: { warnings: SHOGU.lastWarnings || [] } }) });
}
async function shoguOpenPdf(path) {
  if (typeof DEMO !== 'undefined' && DEMO) return alert('見本モードではPDFファイルはありません。');
  const s = JSON.parse(localStorage.getItem('sess') || '{}');
  const r = await fetch(C.supabaseUrl + '/storage/v1/object/sign/shogu-pdf/' + path.split('/').map(encodeURIComponent).join('/'), {
    method: 'POST', headers: { apikey: C.supabaseKey, Authorization: 'Bearer ' + s.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 120 }),
  });
  if (!r.ok) return alert('PDFを開けませんでした。');
  const j = await r.json();
  window.open(C.supabaseUrl + '/storage/v1' + j.signedURL, '_blank');
}
async function shoguUpsertPays(rows) {
  if (typeof DEMO !== 'undefined' && DEMO) {
    const db = shoguDb();
    rows.forEach(row => {
      const i = db.pays.findIndex(p => String(p.staff_id) === String(row.staff_id) && Shogu.ym(p.target_month) === Shogu.ym(row.target_month));
      if (i >= 0) db.pays[i] = Object.assign({}, db.pays[i], row);
      else db.pays.push(Object.assign({ id: db.nextId++ }, row));
    });
    return;
  }
  if (rows.length) await sb('shogu_pay?on_conflict=staff_id,target_month', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows) });
  SHOGU.live = null;
}
async function shoguConfirm() {
  const plan = SHOGU.plan;
  if (!plan || plan.noStaff || plan.noReceipt || plan.ivUnknown) return;
  const rows = [];
  for (let i = 0; i < plan.people.length; i++) {
    const s = plan.people[i];
    const shoguEl = document.getElementById('sga_' + s.id + '_shogu');
    const grossEl = document.getElementById('sga_' + s.id + '_gross');
    const shogu = Shogu.parseYenInput(shoguEl ? shoguEl.value : String(plan.shares[i]));
    const grossIn = Shogu.parseYenInput(grossEl ? grossEl.value : '');
    if (!shogu.ok || !grossIn.ok) { SHOGU.adjustOpen = true; SHOGU.msg = '小数は丸めません。整数で入れてください。'; renderShogu(); return; }
    if (shogu.yen == null) { SHOGU.adjustOpen = true; SHOGU.msg = s.name + ' の金額が空です。'; renderShogu(); return; }
    const base = Number(s.baseline_yen) || 0;
    const gross = grossIn.yen == null ? Math.max(base, shogu.yen) : grossIn.yen;
    if (shogu.yen > gross) { SHOGU.adjustOpen = true; SHOGU.msg = s.name + ' の支払総額は、給与に載せる額以上にしてください。'; renderShogu(); return; }
    const saved = ((shoguDb() || {}).pays || []).find(p => String(p.staff_id) === String(s.id) && Shogu.ym(p.target_month) === plan.month);
    rows.push({ staff_id: s.id, target_month: plan.month + '-01', gross_yen: gross, shogu_yen: shogu.yen, lump_yen: saved ? (Number(saved.lump_yen) || 0) : 0, note: '', updated_at: new Date().toISOString() });
  }
  try {
    await shoguUpsertPays(rows);
    SHOGU.edits = null;
    SHOGU.forceAuto = false;
    SHOGU.msg = '';
    renderShogu();
  } catch (e) { alert('保存できませんでした。 ' + e.message); }
}
async function shoguFreewayCsv(field) {
  const db = shoguDb();
  const staff = (db.staff || []).filter(s => s.office_id === SHOGU.office);
  const lines = Shogu.freewayRows(staff, db.pays, SHOGU.month, field, false);
  const item = field === 'lump_yen' ? (db.settings.freeway_bonus_item || '処遇改善一時金') : (db.settings.freeway_item || '処遇改善手当');
  lines[0][3] = item;
  const name = field === 'lump_yen' ? `shogu-bonus-${SHOGU.month}.csv` : `shogu-meisai-${SHOGU.month}.csv`;
  await shoguDownload(name, Shogu.toCsv(lines), true);
}

function shoguSettingsView() {
  const db = shoguDb();
  const s = db.settings || { fy_year: 2026, regular_this: 1, regular_next: 4, freeway_item: '処遇改善手当', freeway_bonus_item: '処遇改善一時金' };
  const people = (db.staff || []).map(st => `<div class="sg-person">
    <label>従業員番号<input id="sgs_${st.id}_code" value="${Shogu.esc(st.staff_code)}"></label>
    <label>氏名<input id="sgs_${st.id}_name" value="${Shogu.esc(st.name)}"></label>
    <label>事業所<select id="sgs_${st.id}_office">${shoguOfficeOptions(st.office_id)}</select></label>
    <label>雇用<select id="sgs_${st.id}_emp"><option${st.employment === '正社員' ? ' selected' : ''}>正社員</option><option${st.employment !== '正社員' ? ' selected' : ''}>非正規</option></select></label>
    <label>契約給（処遇改善込み）<input id="sgs_${st.id}_contract" inputmode="numeric" autocomplete="off" value="${st.contract_yen}"></label>
    <label>普段の給与（下限）<input id="sgs_${st.id}_base" inputmode="numeric" autocomplete="off" value="${st.baseline_yen}"></label>
    <label><input id="sgs_${st.id}_active" type="checkbox" style="width:auto" ${st.active === false ? '' : 'checked'}> 有効</label>
    <button type="button" class="back" onclick="shoguDeleteStaff(${Number(st.id)})">消す</button></div>`).join('');
  const files = (db.files || []).slice(0, 8).map(f => `<li><button type="button" class="back" onclick="shoguOpenPdf('${Shogu.esc(f.storage_path)}')">${Shogu.esc(f.file_name || f.storage_path)}</button></li>`).join('');
  return `<p class="note">契約給と普段の給与は、処遇改善を含んだ額です。普段の給与を下回る月は警告します。正社員の人数は、賞与の1人あたりの目安にだけ使います。</p>
    <label>今年度（4月始まりの西暦）<input id="shogu_set_fy" inputmode="numeric" value="${s.fy_year}"></label>
    <label>今年度の正社員数<input id="shogu_set_this" inputmode="numeric" value="${s.regular_this}"></label>
    <label>来年度の正社員数<input id="shogu_set_next" inputmode="numeric" value="${s.regular_next}"></label>
    <label>フリーウェイの月額項目名<input id="shogu_set_item" value="${Shogu.esc(s.freeway_item)}"></label>
    <label>フリーウェイの一時金項目名<input id="shogu_set_bonus" value="${Shogu.esc(s.freeway_bonus_item)}"></label>
    <button type="button" class="sg-go" onclick="shoguSaveSettings()">設定を保存する</button>
    <p class="sg-step">職員</p>
    ${people || '<p>先に設定で職員を入れてください。</p>'}
    <button type="button" class="sg-go" onclick="shoguSaveStaff()">職員を保存する</button>
    <p class="sg-step">追加</p>
    <label>従業員番号<input id="shogu_new_code" autocomplete="off"></label>
    <label>氏名<input id="shogu_new_name" autocomplete="off"></label>
    <label>事業所<select id="shogu_new_office">${shoguOfficeOptions(SHOGU.office)}</select></label>
    <label>雇用<select id="shogu_new_emp"><option>非正規</option><option>正社員</option></select></label>
    <label>契約給（処遇改善込み）<input id="shogu_new_contract" inputmode="numeric" autocomplete="off"></label>
    <label>普段の給与（下限）<input id="shogu_new_base" inputmode="numeric" autocomplete="off"></label>
    <button type="button" class="back" onclick="shoguAddStaff()">追加する</button>
    <p class="sg-step">CSVから入れる</p>
    <p class="note">1行目は「従業員番号,氏名,事業所,雇用,契約給,普段の給与」。小数の行は取り込みません。</p>
    <input id="shogu_staff_csv" type="file" accept=".csv,text/csv" onchange="shoguImportStaff(this)">
    <p><button type="button" class="back" onclick="shoguFreewayCsv('lump_yen')">賞与用CSV（この月）</button></p>
    ${files ? `<p class="sg-step">保存したPDF</p><ul>${files}</ul>` : ''}`;
}
async function shoguSaveSettings() {
  const fy = +document.getElementById('shogu_set_fy').value;
  const a = +document.getElementById('shogu_set_this').value;
  const b = +document.getElementById('shogu_set_next').value;
  if (!Number.isInteger(fy) || fy < 2020 || fy > 2100) { SHOGU.msg = '年度は西暦で入れてください。'; renderShogu(['set']); return; }
  if (!Number.isInteger(a) || a < 0 || !Number.isInteger(b) || b < 0) { SHOGU.msg = '人数は0以上の整数です。'; renderShogu(['set']); return; }
  const row = { fy_year: fy, regular_this: a, regular_next: b, freeway_item: document.getElementById('shogu_set_item').value.trim() || '処遇改善手当', freeway_bonus_item: document.getElementById('shogu_set_bonus').value.trim() || '処遇改善一時金', updated_at: new Date().toISOString() };
  try {
    if (typeof DEMO !== 'undefined' && DEMO) Object.assign(shoguDb().settings, row);
    else { await sb('shogu_settings?id=eq.1', { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(row) }); SHOGU.live = null; }
    SHOGU.msg = '設定を保存しました。';
    renderShogu(['set']);
  } catch (e) { alert('保存できませんでした。 ' + e.message); }
}
function shoguReadStaffRow(st) {
  const name = document.getElementById('sgs_' + st.id + '_name').value.trim();
  const contract = Shogu.parseYenInput(document.getElementById('sgs_' + st.id + '_contract').value);
  const base = Shogu.parseYenInput(document.getElementById('sgs_' + st.id + '_base').value);
  if (!name) return { error: '氏名が空です' };
  if (!contract.ok || contract.yen == null || !base.ok || base.yen == null) return { error: (name || '職員') + ' の金額が整数ではありません' };
  return { row: {
    staff_code: document.getElementById('sgs_' + st.id + '_code').value.trim(), name,
    office_id: document.getElementById('sgs_' + st.id + '_office').value,
    employment: document.getElementById('sgs_' + st.id + '_emp').value === '正社員' ? '正社員' : '非正規',
    contract_yen: contract.yen, baseline_yen: base.yen,
    active: document.getElementById('sgs_' + st.id + '_active').checked, note: st.note || '',
    updated_at: new Date().toISOString(),
  } };
}
async function shoguSaveStaff() {
  const db = shoguDb();
  const rows = [];
  for (const st of db.staff) {
    const got = shoguReadStaffRow(st);
    if (got.error) { SHOGU.msg = got.error; renderShogu(['set']); return; }
    rows.push(Object.assign({ id: st.id }, got.row));
  }
  try {
    if (typeof DEMO !== 'undefined' && DEMO) rows.forEach(row => { const i = db.staff.findIndex(st => st.id === row.id); if (i >= 0) db.staff[i] = Object.assign({}, db.staff[i], row); });
    else {
      for (const row of rows) {
        const id = row.id; const body = Object.assign({}, row); delete body.id;
        await sb('shogu_staff?id=eq.' + id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body) });
      }
      SHOGU.live = null;
    }
    SHOGU.msg = '保存しました。';
    renderShogu(['set']);
  } catch (e) { alert('保存できませんでした。 ' + e.message); }
}
async function shoguAddStaff() {
  const name = document.getElementById('shogu_new_name').value.trim();
  const contract = Shogu.parseYenInput(document.getElementById('shogu_new_contract').value);
  const baseIn = document.getElementById('shogu_new_base').value;
  const base = Shogu.parseYenInput(baseIn.trim() ? baseIn : document.getElementById('shogu_new_contract').value);
  if (!name) { SHOGU.msg = '氏名を入れてください。'; renderShogu(['set']); return; }
  if (!contract.ok || contract.yen == null || !base.ok || base.yen == null) { SHOGU.msg = '契約給と普段の給与は整数です。小数は入れません。'; renderShogu(['set']); return; }
  const row = {
    staff_code: document.getElementById('shogu_new_code').value.trim(), name,
    office_id: document.getElementById('shogu_new_office').value,
    employment: document.getElementById('shogu_new_emp').value === '正社員' ? '正社員' : '非正規',
    contract_yen: contract.yen, baseline_yen: base.yen, active: true, note: '', updated_at: new Date().toISOString(),
  };
  try {
    if (typeof DEMO !== 'undefined' && DEMO) shoguDb().staff.push(Object.assign({ id: shoguDb().nextId++ }, row));
    else { await sb('shogu_staff', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(row) }); SHOGU.live = null; }
    SHOGU.msg = '追加しました。';
    renderShogu(['set']);
  } catch (e) { alert('追加できませんでした。 ' + e.message); }
}
async function shoguDeleteStaff(id) {
  if (!confirm('この職員と、月々の内訳を消します。')) return;
  try {
    if (typeof DEMO !== 'undefined' && DEMO) { const db = shoguDb(); db.staff = db.staff.filter(st => st.id !== id); db.pays = db.pays.filter(p => String(p.staff_id) !== String(id)); }
    else { await sb('shogu_staff?id=eq.' + id, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }); SHOGU.live = null; }
    renderShogu(['set']);
  } catch (e) { alert('消せませんでした。 ' + e.message); }
}
async function shoguImportStaff(input) {
  const file = input.files && input.files[0]; if (!file) return;
  const buf = await file.arrayBuffer();
  let text = '';
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); }
  catch (e) { text = new TextDecoder('shift_jis').decode(buf); }
  const map = {};
  (C.offices || []).forEach(o => { map[o.name] = o.id; map[o.id] = o.id; });
  const parsed = Shogu.parseStaffSheet(text, map);
  if (!parsed.rows.length) { SHOGU.msg = parsed.errors.join(' / ') || '取り込める行がありません。'; renderShogu(['set']); return; }
  try {
    if (typeof DEMO !== 'undefined' && DEMO) {
      const db = shoguDb();
      parsed.rows.forEach(row => {
        const i = db.staff.findIndex(st => row.staff_code && st.staff_code === row.staff_code);
        if (i >= 0) db.staff[i] = Object.assign({}, db.staff[i], row);
        else db.staff.push(Object.assign({ id: db.nextId++ }, row));
      });
    } else {
      for (const row of parsed.rows) {
        if (row.staff_code) {
          const found = await sb('shogu_staff?staff_code=eq.' + encodeURIComponent(row.staff_code) + '&select=id');
          if (found && found[0]) await sb('shogu_staff?id=eq.' + found[0].id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(row) });
          else await sb('shogu_staff', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(row) });
        } else await sb('shogu_staff', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(row) });
      }
      SHOGU.live = null;
    }
    SHOGU.msg = parsed.rows.length + '人を入れました。' + (parsed.errors.length ? ' 飛ばした行: ' + parsed.errors.join(' / ') : '');
    renderShogu(['set']);
  } catch (e) { alert('取り込めませんでした。 ' + e.message); }
}
function shoguDownload(name, text, sjis) {
  const go = bytes => {
    const blob = bytes ? new Blob([bytes], { type: 'text/csv' }) : new Blob(['\ufeff' + text], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  };
  if (!sjis) return go(null);
  const run = () => go(new Uint8Array(Encoding.convert(Encoding.stringToCode(text), { to: 'SJIS', from: 'UNICODE' })));
  if (window.Encoding) return run();
  const s = document.createElement('script');
  s.src = 'vendor/encoding.min.js'; s.onload = run; s.onerror = () => go(null);
  document.head.appendChild(s);
}
