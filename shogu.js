// 処遇改善加算。国保連PDFの記録、職員×月の内訳、下限、1/2要件、ボーナスプール、CSV。
// 権限の本体は supabase/shogu.sql の shogu_can()。画面はそれに合わせて出す。
let SHOGU = { db: null, live: null, draft: null, fy: null, office: '', payMonth: '', payOffice: '', msg: '', file: null };

function shoguDemoSeed() {
  return {
    nextId: 10,
    settings: { id: 1, fy_year: 2026, regular_this: 1, regular_next: 4, freeway_item: '処遇改善手当', freeway_bonus_item: '処遇改善一時金' },
    staff: [
      { id: 1, staff_code: '001', name: '見本 正子', office_id: 'leo', employment: '正社員', contract_yen: 250000, baseline_yen: 250000, active: true, note: '' },
      { id: 2, staff_code: '002', name: '見本 花', office_id: 'leo', employment: '非正規', contract_yen: 180000, baseline_yen: 180000, active: true, note: '' },
      { id: 3, staff_code: '101', name: '見本 茶', office_id: 'chamu', employment: '非正規', contract_yen: 200000, baseline_yen: 200000, active: true, note: '' },
    ],
    receipts: [
      { id: 1, office_id: 'leo', office_name: 'レオ', office_number: '2450000000', service_type: '放課後等デイサービス', target_month: '2026-09-01', amount_yen: 158000, amount_raw: '158,000円', category: 'Ⅱロ', rate_got_ppm: 158000, rate_iv_ppm: 119000, iv_yen: null, iv_manual: false, note: '見本' },
      { id: 2, office_id: 'chamu', office_name: '茶夢', office_number: '', service_type: '生活介護', target_month: '2026-09-01', amount_yen: 80000, amount_raw: '80,000円', category: 'Ⅳ', rate_got_ppm: 67000, rate_iv_ppm: 67000, iv_yen: null, iv_manual: false, note: '見本' },
    ],
    pays: [
      { id: 1, staff_id: 1, target_month: '2026-09-01', gross_yen: 250000, shogu_yen: 40000, lump_yen: 0, note: '' },
      { id: 2, staff_id: 2, target_month: '2026-09-01', gross_yen: 170000, shogu_yen: 20000, lump_yen: 0, note: '' },
      { id: 3, staff_id: 3, target_month: '2026-09-01', gross_yen: 200000, shogu_yen: 40000, lump_yen: 0, note: '' },
    ],
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
function shoguNames() { return Object.fromEntries((C.offices || []).map(o => [o.id, o.name])); }
function shoguYen(n) { return n == null || n === '' ? '—' : Number(n).toLocaleString('ja-JP') + '円'; }
function shoguPrevMonth() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric' }).formatToParts(new Date());
  let y = +parts.find(p => p.type === 'year').value, m = +parts.find(p => p.type === 'month').value - 1;
  if (m === 0) { m = 12; y -= 1; }
  return y + '-' + String(m).padStart(2, '0');
}
function shoguDefaultMonth() {
  const months = ((shoguDb() || {}).pays || []).map(p => Shogu.ym(p.target_month)).filter(Boolean).sort();
  return months.length ? months[months.length - 1] : shoguPrevMonth();
}
function shoguNav(tab) {
  const items = [['', '監査'], ['in', 'PDF投入'], ['pay', '全員明細'], ['staff', '職員の給与'], ['pool', 'ボーナスプール'], ['set', '設定']];
  return `<p class="ptabs">${items.map(([k, l]) => `<button type="button" class="${tab === k ? 'on' : ''}" onclick="location.hash='shogu${k ? '/' + k : ''}'">${l}</button>`).join('')}</p>`;
}
function shoguIntro() {
  return `<p class="note">契約給と支払総額は処遇改善を含んだ総額です。処遇改善分はその内訳で、最低賃金の外に足す額ではありません。記録とCSVの出力までで、行政への提出・送金・フリーウェイへの自動送信はしません。</p>`;
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
  document.body.classList.add('wide-sheet');
  const tab = (parts && parts[0]) || '';
  const back = `<button class="back" type="button" onclick="location.hash='soumu'">← 総務へ</button>`;
  const access = await shoguAccess();
  if (access === 'denied') { $('view').innerHTML = back + '<h3>処遇改善加算</h3><p>事務と管理者だけが見られます。</p>'; return; }
  if (access === 'missing') { $('view').innerHTML = back + '<h3>処遇改善加算</h3><p>データベースにまだ表がありません。Supabase の SQL Editor で supabase/shogu.sql を実行してください。</p>'; return; }
  try { if (!(typeof DEMO !== 'undefined' && DEMO) && !SHOGU.live) SHOGU.live = await shoguFetch(); }
  catch (e) { $('view').innerHTML = back + '<h3>処遇改善加算</h3><p>読み込めませんでした。supabase/shogu.sql を実行したあとに、入り直してください。</p>'; return; }
  const db = shoguDb();
  if (!SHOGU.fy) SHOGU.fy = (db.settings && db.settings.fy_year) || 2026;
  if (!SHOGU.payMonth) SHOGU.payMonth = shoguDefaultMonth();
  if (!SHOGU.payOffice) SHOGU.payOffice = (db.staff[0] && db.staff[0].office_id) || 'leo';
  const body = tab === 'in' ? shoguInView() : tab === 'pay' ? shoguPayView() : tab === 'staff' ? shoguStaffView() : tab === 'pool' ? shoguPoolView() : tab === 'set' ? shoguSetView() : shoguAuditView();
  const msg = SHOGU.msg ? `<p id="shogu_msg">${Shogu.esc(SHOGU.msg)}</p>` : '';
  SHOGU.msg = '';
  $('view').innerHTML = back + '<h3>処遇改善加算</h3>' + shoguNav(tab) + shoguIntro() + msg + body;
}

function shoguAuditView() {
  const db = shoguDb();
  const rows = Shogu.buildAudit({ fy: SHOGU.fy, officeId: SHOGU.office || '', receipts: db.receipts, pays: db.pays, staff: db.staff, officeNames: shoguNames() });
  const shown = rows.filter(r => r.hasData);
  const pool = Shogu.poolSummary({ fy: SHOGU.fy, receipts: db.receipts, pays: db.pays, staff: db.staff });
  const yearOk = pool.monthly + pool.lump >= pool.received;
  const meet = { pass: '達成', fail: '未達', noreceipt: '加算の記録なし' };
  const tr = shown.map(r => {
    const under = r.breaches.length ? `下限割れ ${r.breaches.length}人` : 'なし';
    const bg = r.meet === 'fail' || r.breaches.length || r.half.code === 'fail' ? ' style="background:#fde8e8"' : '';
    return `<tr${bg}><td>${Shogu.esc(r.officeName)}</td><td>${Shogu.esc(r.month)}</td><td>${Shogu.esc((r.services || []).join('・'))}</td><td>${shoguYen(r.received)}</td><td>${r.ivYen == null ? '未確定' : shoguYen(r.ivYen)}</td><td>${shoguYen(r.monthly)}</td><td>${shoguYen(r.lump)}</td><td>${shoguYen(r.wage)}</td><td>${shoguYen(r.diff)}</td><td>${meet[r.meet] || ''}</td><td>${under}</td><td>${Shogu.esc(r.half.label)}</td></tr>`;
  }).join('');
  const years = [2024, 2025, 2026, 2027, 2028];
  if (!years.includes(+SHOGU.fy)) years.push(+SHOGU.fy);
  return `<p>年度の合計: 加算 ${shoguYen(pool.received)} ／ 月額 ${shoguYen(pool.monthly)} ／ 一時金 ${shoguYen(pool.lump)} ／ 差額 ${shoguYen(pool.monthly + pool.lump - pool.received)} ／ <b>${yearOk ? '年度累計は達成' : '年度累計は未達'}</b></p>
    <p class="note">月の「未達」は、その月に払った賃金改善が加算より少ない印です。ボーナスに回した分は下のボーナスプールに残ります。1/2要件は、令和7年4月以降、新加算Ⅳ相当額の半分以上が毎月の内訳（基本給等）に入っているかです。令和8年6月の特例（加算Ⅱロの半分）はここでは判定しません。</p>
    <p class="ptabs"><label>年度 <select id="shogu_fy" style="width:auto" onchange="SHOGU.fy=+this.value;renderShogu([''])">${years.map(y => `<option${y === +SHOGU.fy ? ' selected' : ''}>${y}</option>`).join('')}</select></label>
    <label>事業所 <select id="shogu_office" style="width:auto" onchange="SHOGU.office=this.value;renderShogu([''])"><option value="">すべて</option>${(C.offices || []).map(o => `<option value="${Shogu.esc(o.id)}"${SHOGU.office === o.id ? ' selected' : ''}>${Shogu.esc(o.name)}</option>`).join('')}</select></label>
    <button type="button" onclick="shoguAuditCsv()">監査CSV</button></p>
    <div class="sheet-scroll"><table class="msheet" id="shogu_audit"><thead><tr><th>事業所</th><th>月</th><th>サービス</th><th>加算受領額</th><th>新加算Ⅳ相当</th><th>月額</th><th>一時金</th><th>賃金改善</th><th>差額</th><th>改善≧加算</th><th>下限</th><th>1/2要件</th></tr></thead><tbody>${tr || '<tr><td colspan="12">この年度の記録はまだありません。</td></tr>'}</tbody></table></div>`;
}
function shoguAuditCsv() {
  const db = shoguDb();
  const rows = Shogu.buildAudit({ fy: SHOGU.fy, officeId: SHOGU.office || '', receipts: db.receipts, pays: db.pays, staff: db.staff, officeNames: shoguNames() }).filter(r => r.hasData);
  shoguDownload(`shogu-audit-${SHOGU.fy}.csv`, Shogu.auditCsv(rows), false);
}

function shoguDraft() {
  if (!SHOGU.draft) SHOGU.draft = { office_id: 'leo', service_type: '放課後等デイサービス', target_month: shoguDefaultMonth(), amount: '', amount_raw: '', category: '', rate_got: '', rate_iv: '', iv_manual: false, iv_yen: '', note: '', office_number: '', warnings: [], hits: [], paste: '' };
  return SHOGU.draft;
}
function shoguFillRates(d) {
  const rates = Shogu.lookupRates(d.service_type, d.target_month, d.category);
  d.rate_got = rates.rateGot == null ? '' : Shogu.formatPercent(rates.rateGot);
  d.rate_iv = rates.rateIv == null ? '' : Shogu.formatPercent(rates.rateIv);
}
function shoguInSet(key, value) {
  const d = shoguReadInForm();
  d[key] = value;
  if (key === 'office_id') {
    const sv = Shogu.servicesFor(value);
    if (sv.length && !sv.includes(d.service_type)) d.service_type = sv[0];
  }
  if (key === 'office_id' || key === 'service_type' || key === 'target_month' || key === 'category') shoguFillRates(d);
  renderShogu(['in']);
}
function shoguReadInForm() {
  const d = shoguDraft();
  const g = id => document.getElementById(id);
  if (!g('shogu_office')) return d;
  d.office_id = g('shogu_office').value;
  d.service_type = g('shogu_service').value;
  d.target_month = g('shogu_month').value;
  d.amount = g('shogu_amount').value;
  d.category = g('shogu_category').value;
  d.rate_got = g('shogu_rate_got').value;
  d.rate_iv = g('shogu_rate_iv').value;
  d.iv_manual = g('shogu_iv_manual').checked;
  d.iv_yen = g('shogu_iv') ? g('shogu_iv').value : d.iv_yen;
  d.note = g('shogu_note').value;
  d.office_number = g('shogu_number').value;
  d.paste = g('shogu_paste') ? g('shogu_paste').value : d.paste;
  return d;
}
function shoguApplyNotice(text) {
  const d = shoguReadInForm();
  const n = Shogu.parseNotice(text || '');
  d.warnings = n.warnings; d.hits = n.hits; d.paste = text || '';
  if (n.officeNumber) d.office_number = n.officeNumber;
  if (n.yearMonth) d.target_month = n.yearMonth;
  if (n.serviceType) d.service_type = n.serviceType;
  if (n.category) d.category = n.category;
  d.amount = n.amountYen == null ? '' : String(n.amountYen);
  d.amount_raw = n.amountRaw || '';
  const hit = (C.offices || []).find(o => text && text.includes(o.name));
  if (hit) d.office_id = hit.id;
  shoguFillRates(d);
  SHOGU.msg = text && text.trim() ? '読み取りました。金額と対象月を確認してから記録してください。' : '文字を読めませんでした。金額と対象月を手で入れてください。';
  renderShogu(['in']);
}
function shoguReadPaste() { shoguApplyNotice(document.getElementById('shogu_paste').value); }
function shoguSample() { const d = shoguDraft(); d.paste = Shogu.SAMPLE_NOTICE; shoguApplyNotice(Shogu.SAMPLE_NOTICE); }
function shoguPickHit(i) {
  const h = shoguDraft().hits[i];
  if (!h) return;
  shoguDraft().amount_raw = h.raw;
  shoguDraft().amount = h.yen == null ? '' : String(h.yen);
  if (h.kind === 'decimal') SHOGU.msg = '小数は丸めません。整数の円を手で入れてください。';
  renderShogu(['in']);
}
async function shoguReadBytes(file) {
  return new Uint8Array(await file.arrayBuffer());
}
async function shoguInflate(bytes) {
  const ds = new DecompressionStream('deflate');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function shoguFile(input) {
  const file = input.files && input.files[0];
  SHOGU.file = file || null;
  if (!file) return;
  const bytes = await shoguReadBytes(file);
  if (!(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) { alert('PDFではありません。'); SHOGU.file = null; return; }
  let text = '';
  try { text = await Shogu.extractPdfText(bytes, shoguInflate); } catch (e) { text = ''; }
  shoguApplyNotice(text);
}
function shoguInView() {
  const d = shoguDraft();
  const db = shoguDb();
  const services = Shogu.servicesFor(d.office_id);
  const serviceField = services.length
    ? `<select id="shogu_service" onchange="shoguInSet('service_type', this.value)">${services.map(s => `<option${s === d.service_type ? ' selected' : ''}>${Shogu.esc(s)}</option>`).join('')}</select>`
    : `<input id="shogu_service" value="${Shogu.esc(d.service_type)}">`;
  const cats = Shogu.categoriesFor(d.service_type, d.target_month);
  const cur = Shogu.normCategory(d.category);
  const catList = [''].concat(cats);
  if (cur && !catList.includes(cur)) catList.push(cur);
  const hits = (d.hits || []).map((h, i) => `<button type="button" class="back" onclick="shoguPickHit(${i})">${Shogu.esc(h.raw)}（${h.kind === 'yen' ? '円' : h.kind === 'unit' ? '単位' : h.kind === 'decimal' ? '小数' : '要確認'}）</button>`).join(' ');
  const files = (db.files || []).slice(0, 8).map(f => `<li><button type="button" class="back" onclick="shoguOpenPdf('${Shogu.esc(f.storage_path)}')">${Shogu.esc(f.file_name || f.storage_path)}</button></li>`).join('');
  const saved = (db.receipts || []).slice().sort((a, b) => String(b.target_month).localeCompare(String(a.target_month))).map(r => `<li>${Shogu.esc(r.office_name || shoguOfficeName(r.office_id))} ${Shogu.esc(r.service_type)} ${Shogu.esc(Shogu.ym(r.target_month))} ${shoguYen(r.amount_yen)}（${Shogu.esc(r.category || '区分なし')}）${r.amount_raw ? ' 読み取り: ' + Shogu.esc(r.amount_raw) : ''}</li>`).join('');
  return `<h4>国保連のPDF</h4>
    <p class="note">読み取った金額は仮です。確認してから記録します。小数は切りも入りもせず、空欄のままにします。</p>
    <input id="shogu_file" type="file" accept="application/pdf,.pdf" onchange="shoguFile(this)">
    <p>${SHOGU.file ? '選んだファイル: ' + Shogu.esc(SHOGU.file.name) : 'ファイルはまだです。文字が取れないPDFは、下に文面を貼れます。'}</p>
    <textarea id="shogu_paste" rows="5" style="width:100%;box-sizing:border-box" placeholder="PDFの文字を貼る">${Shogu.esc(d.paste || '')}</textarea>
    <p class="ptabs"><button type="button" onclick="shoguReadPaste()">文面から読み取る</button>${typeof DEMO !== 'undefined' && DEMO ? '<button type="button" onclick="shoguSample()">見本の通知文を入れる</button>' : ''}</p>
    ${(d.warnings || []).map(w => `<p style="color:#a30">${Shogu.esc(w)}</p>`).join('')}
    ${hits ? `<p>見つかった数: ${hits}</p>` : ''}
    <label>事業所</label><select id="shogu_office" onchange="shoguInSet('office_id', this.value)">${(C.offices || []).map(o => `<option value="${Shogu.esc(o.id)}"${o.id === d.office_id ? ' selected' : ''}>${Shogu.esc(o.name)}</option>`).join('')}</select>
    <label>サービス</label>${serviceField}
    <label>対象月（サービスの提供月）</label><input id="shogu_month" type="month" value="${Shogu.esc(d.target_month || '')}" onchange="shoguInSet('target_month', this.value)">
    <label>事業所番号（任意）</label><input id="shogu_number" value="${Shogu.esc(d.office_number || '')}">
    <label>処遇改善加算額（円）</label><input id="shogu_amount" inputmode="numeric" value="${Shogu.esc(d.amount)}" placeholder="158000">
    <p class="note">${d.amount_raw ? '読み取りの原文: ' + Shogu.esc(d.amount_raw) : '原文はまだありません。'}</p>
    <label>加算区分</label><select id="shogu_category" onchange="shoguInSet('category', this.value)">${catList.map(c => `<option value="${Shogu.esc(c)}"${c === cur ? ' selected' : ''}>${c ? Shogu.esc(c) : '（未選択）'}</option>`).join('')}</select>
    <label>取得している加算率（%）</label><input id="shogu_rate_got" value="${Shogu.esc(d.rate_got)}" placeholder="15.8">
    <label>同じサービスの加算Ⅳの率（%）</label><input id="shogu_rate_iv" value="${Shogu.esc(d.rate_iv)}" placeholder="11.9">
    <p class="note">Ⅳ相当額は、加算額 × Ⅳの率 ÷ 取得区分の率です。1円未満は切り捨てます。区分を変えると、告示の率で上の欄を入れ直します。告示と違う届出なら、率を手で直してから記録してください。</p>
    <label style="display:block"><input id="shogu_iv_manual" type="checkbox" style="width:auto" ${d.iv_manual ? 'checked' : ''} onchange="shoguInSet('iv_manual', this.checked)"> Ⅳ相当額を手入力する（計算で出さない）</label>
    ${d.iv_manual ? `<label>新加算Ⅳ相当額（円）</label><input id="shogu_iv" inputmode="numeric" value="${Shogu.esc(d.iv_yen)}">` : '<input id="shogu_iv" type="hidden" value="">'}
    <label>メモ</label><input id="shogu_note" value="${Shogu.esc(d.note || '')}">
    <button type="button" onclick="shoguSaveReceipt()">この内容で記録する</button>
    <h4>記録済み</h4><ul>${saved || '<li>まだありません。</li>'}</ul>
    ${files ? `<h4>保存したPDF</h4><ul>${files}</ul>` : ''}`;
}
async function shoguSaveReceipt() {
  const d = shoguReadInForm();
  const amount = Shogu.parseYenInput(d.amount);
  if (!amount.ok || amount.yen == null) return alert(amount.reason === 'decimal' ? '小数は丸めずに記録できません。円の整数で入れてください。' : '加算額を整数で入れてください。');
  if (!d.service_type || !d.target_month) return alert('サービスと対象月を入れてください。');
  const got = Shogu.parsePercent(d.rate_got), ivr = Shogu.parsePercent(d.rate_iv);
  if (!got.ok || !ivr.ok) return alert('加算率は、告示のように小数第1位か、多くて第4位までにしてください。それより細かい数字は丸めません。');
  let ivYen = null;
  if (d.iv_manual) {
    const iv = Shogu.parseYenInput(d.iv_yen);
    if (!iv.ok || iv.yen == null) return alert('Ⅳ相当額を整数で入れるか、手入力を外してください。');
    ivYen = iv.yen;
  }
  const row = {
    office_id: d.office_id, office_name: shoguOfficeName(d.office_id), office_number: d.office_number || '',
    service_type: d.service_type, target_month: d.target_month + '-01', amount_yen: amount.yen,
    amount_raw: d.amount_raw || String(amount.yen), category: Shogu.normCategory(d.category),
    rate_got_ppm: got.ppm, rate_iv_ppm: ivr.ppm, iv_yen: ivYen, iv_manual: !!d.iv_manual, note: d.note || '',
    updated_at: new Date().toISOString(),
  };
  const preview = Shogu.ivEquivalent(row);
  if (preview.yen == null && !confirm('Ⅳ相当額を計算できません。監査の1/2判定は未判定のままです。このまま記録しますか。')) return;
  try {
    let receiptId;
    if (typeof DEMO !== 'undefined' && DEMO) {
      const db = shoguDb();
      const i = db.receipts.findIndex(r => r.office_id === row.office_id && r.service_type === row.service_type && Shogu.ym(r.target_month) === d.target_month);
      if (i >= 0) { receiptId = db.receipts[i].id; db.receipts[i] = Object.assign({}, db.receipts[i], row); }
      else { receiptId = db.nextId++; db.receipts.push(Object.assign({ id: receiptId }, row)); }
      if (SHOGU.file) SHOGU.msg = '見本モードではPDFファイル自体は保存しません。金額は記録しました。';
    } else {
      const saved = await sb('shogu_receipt?on_conflict=office_id,service_type,target_month', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify(row) });
      receiptId = saved && saved[0] && saved[0].id;
      if (SHOGU.file && receiptId) await shoguUpload(receiptId, SHOGU.file);
      SHOGU.live = null;
    }
    SHOGU.file = null;
    if (!SHOGU.msg) SHOGU.msg = '記録しました。' + (preview.yen == null ? '' : ' Ⅳ相当額は ' + shoguYen(preview.yen) + ' です。');
    renderShogu(['in']);
  } catch (e) { alert('記録できませんでした。 ' + e.message); }
}
async function shoguUpload(receiptId, file) {
  const path = receiptId + '/' + (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())) + '.pdf';
  const s = JSON.parse(localStorage.getItem('sess') || '{}');
  const up = await fetch(C.supabaseUrl + '/storage/v1/object/shogu-pdf/' + path.split('/').map(encodeURIComponent).join('/'), {
    method: 'POST', headers: { apikey: C.supabaseKey, Authorization: 'Bearer ' + s.token, 'Content-Type': 'application/pdf', 'x-upsert': 'false' }, body: file,
  });
  if (!up.ok) throw new Error('PDFの保存に失敗しました（' + up.status + '）');
  const d = shoguDraft();
  await sb('shogu_pdf', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ receipt_id: receiptId, storage_path: path, file_name: file.name, extract_json: { warnings: d.warnings || [], amount_raw: d.amount_raw || '' } }) });
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

function shoguPayView() {
  const db = shoguDb();
  const month = SHOGU.payMonth, office = SHOGU.payOffice;
  const people = db.staff.filter(s => s.office_id === office && s.active !== false);
  const rows = people.map(s => {
    const pay = db.pays.find(p => String(p.staff_id) === String(s.id) && Shogu.ym(p.target_month) === month) || {};
    const floor = Shogu.floorStatus(pay.gross_yen == null ? null : pay.gross_yen, s.baseline_yen);
    const warn = floor.code === 'under' ? ' style="background:#fde8e8"' : '';
    return `<tr${warn}><td>${Shogu.esc(s.staff_code)}</td><td>${Shogu.esc(s.name)}</td><td>${Shogu.esc(s.employment)}</td><td>${shoguYen(s.contract_yen)}</td><td>${shoguYen(s.baseline_yen)}</td>
      <td><input id="sgp_${s.id}_gross" inputmode="numeric" value="${pay.gross_yen == null ? '' : pay.gross_yen}" style="width:8em"></td>
      <td><input id="sgp_${s.id}_shogu" inputmode="numeric" value="${pay.shogu_yen == null ? '' : pay.shogu_yen}" style="width:8em"></td>
      <td><input id="sgp_${s.id}_lump" inputmode="numeric" value="${pay.lump_yen == null ? '' : pay.lump_yen}" style="width:8em"></td>
      <td>${Shogu.esc(floor.label)}${floor.short ? ' ' + shoguYen(floor.short) : ''}</td></tr>`;
  }).join('');
  return `<h4>職員×月の内訳</h4>
    <p class="note">処遇改善の内訳は、支払総額の中の額です。下限はフリーウェイに入っている普段の給与（処遇改善込み）で、下回った月だけ警告します。上回るのはそのままでよいです。</p>
    <p class="ptabs"><label>事業所 <select id="shogu_pay_office" style="width:auto" onchange="SHOGU.payOffice=this.value;renderShogu(['pay'])">${(C.offices || []).map(o => `<option value="${Shogu.esc(o.id)}"${o.id === office ? ' selected' : ''}>${Shogu.esc(o.name)}</option>`).join('')}</select></label>
    <label>月 <input id="shogu_pay_month" type="month" value="${Shogu.esc(month)}" style="width:auto" onchange="SHOGU.payMonth=this.value;renderShogu(['pay'])"></label></p>
    <div class="sheet-scroll"><table class="msheet" id="shogu_pays"><thead><tr><th>従業員番号</th><th>氏名</th><th>雇用</th><th>契約給（込み）</th><th>普段の給与</th><th>今月の支払総額（込み）</th><th>処遇改善の内訳</th><th>一時金</th><th>下限</th></tr></thead><tbody>${rows || '<tr><td colspan="9">この事業所の職員がまだいません。</td></tr>'}</tbody></table></div>
    <p class="ptabs"><label>今月の月額として配る額 <input id="shogu_dist" inputmode="numeric" style="width:8em" placeholder="60000"></label>
    <select id="shogu_dist_mode" style="width:auto"><option value="even">対象者で均等</option><option value="contract">契約給の比</option></select>
    <button type="button" onclick="shoguDistribute()">案を入れる</button>
    <button type="button" onclick="shoguFillGross()">空欄の支払総額を普段の額にする</button></p>
    <button type="button" onclick="shoguSavePays()">この月の内訳を保存する</button>
    <p class="ptabs"><label style="display:inline"><input id="shogu_zero" type="checkbox" style="width:auto" checked> 0円の職員も出す</label>
    <button type="button" onclick="shoguFreewayCsv('shogu_yen')">フリーウェイ取込用CSV（月額）</button>
    <button type="button" onclick="shoguFreewayCsv('lump_yen')">フリーウェイ取込用CSV（一時金）</button>
    <button type="button" onclick="shoguDetailCsv()">内訳一覧CSV</button></p>
    <p class="note">フリーウェイのCSVは4列です。4列目の名前は設定の支給項目名で、会社の支給項目と揃えてから「給与データインポート」で手取り込みします。基本給など他の列は出しません。登録済みの明細への上書きはフリーウェイ側が受け付けません。</p>`;
}
function shoguDistribute() {
  const total = Shogu.parseYenInput(document.getElementById('shogu_dist').value);
  if (!total.ok || total.yen == null) return alert(total.reason === 'decimal' ? '小数は配分しません。整数で入れてください。' : '配る額を整数で入れてください。');
  const office = document.getElementById('shogu_pay_office').value;
  const people = shoguDb().staff.filter(s => s.office_id === office && s.active !== false);
  if (!people.length) return alert('配る職員がいません。');
  const mode = document.getElementById('shogu_dist_mode').value;
  const weights = mode === 'contract' ? people.map(s => s.contract_yen) : people.map(() => 1);
  let shares;
  try { shares = Shogu.splitYen(total.yen, weights).shares; } catch (e) { return alert(e.message); }
  people.forEach((s, i) => { const el = document.getElementById('sgp_' + s.id + '_shogu'); if (el) el.value = String(shares[i]); });
  const sum = shares.reduce((a, b) => a + b, 0);
  alert('案を入れました（合計 ' + sum + '円）。まだ保存していません。');
}
function shoguFillGross() {
  const office = document.getElementById('shogu_pay_office').value;
  shoguDb().staff.filter(s => s.office_id === office && s.active !== false).forEach(s => {
    const el = document.getElementById('sgp_' + s.id + '_gross');
    if (el && el.value.trim() === '') el.value = String(s.baseline_yen);
  });
}
async function shoguSavePays() {
  const month = document.getElementById('shogu_pay_month').value;
  const office = document.getElementById('shogu_pay_office').value;
  SHOGU.payMonth = month; SHOGU.payOffice = office;
  const people = shoguDb().staff.filter(s => s.office_id === office && s.active !== false);
  const rows = [];
  for (const s of people) {
    const gross = Shogu.parseYenInput(document.getElementById('sgp_' + s.id + '_gross').value);
    const shogu = Shogu.parseYenInput(document.getElementById('sgp_' + s.id + '_shogu').value);
    const lump = Shogu.parseYenInput(document.getElementById('sgp_' + s.id + '_lump').value);
    if (!gross.ok || !shogu.ok || !lump.ok) return alert(s.name + ' の金額に、丸められない小数があります。整数で入れ直してください。');
    const shoguYen = shogu.yen == null ? 0 : shogu.yen;
    const lumpYen = lump.yen == null ? 0 : lump.yen;
    if (gross.yen != null && shoguYen > gross.yen) return alert(s.name + ' の処遇改善内訳が、処遇改善込みの支払総額を超えています。');
    rows.push({ staff_id: s.id, target_month: month + '-01', gross_yen: gross.yen, shogu_yen: shoguYen, lump_yen: lumpYen, note: '', updated_at: new Date().toISOString() });
  }
  try {
    if (typeof DEMO !== 'undefined' && DEMO) {
      const db = shoguDb();
      rows.forEach(row => {
        const i = db.pays.findIndex(p => String(p.staff_id) === String(row.staff_id) && Shogu.ym(p.target_month) === month);
        if (i >= 0) db.pays[i] = Object.assign({}, db.pays[i], row);
        else db.pays.push(Object.assign({ id: db.nextId++ }, row));
      });
    } else {
      if (rows.length) await sb('shogu_pay?on_conflict=staff_id,target_month', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows) });
      SHOGU.live = null;
    }
    SHOGU.msg = '保存しました。';
    renderShogu(['pay']);
  } catch (e) { alert('保存できませんでした。 ' + e.message); }
}
async function shoguFreewayCsv(field) {
  const db = shoguDb();
  const month = (document.getElementById('shogu_pay_month') || {}).value || SHOGU.payMonth;
  const includeZero = field === 'shogu_yen' && document.getElementById('shogu_zero') && document.getElementById('shogu_zero').checked;
  const office = (document.getElementById('shogu_pay_office') || {}).value || SHOGU.payOffice;
  const staff = db.staff.filter(s => s.office_id === office);
  const lines = Shogu.freewayRows(staff, db.pays, month, field, !!includeZero);
  const item = field === 'lump_yen' ? (db.settings.freeway_bonus_item || '処遇改善一時金') : (db.settings.freeway_item || '処遇改善手当');
  lines[0][3] = item;
  const name = field === 'lump_yen' ? `shogu-bonus-${month}.csv` : `shogu-meisai-${month}.csv`;
  await shoguDownload(name, Shogu.toCsv(lines), true);
}
function shoguDetailCsv() {
  const db = shoguDb();
  const month = (document.getElementById('shogu_pay_month') || {}).value || SHOGU.payMonth;
  const office = (document.getElementById('shogu_pay_office') || {}).value || SHOGU.payOffice;
  shoguDownload(`shogu-uchiwake-${month}.csv`, Shogu.detailCsv(db.staff.filter(s => s.office_id === office), db.pays, month, shoguNames()), false);
}

function shoguStaffView() {
  const db = shoguDb();
  const rows = db.staff.map(s => `<tr>
    <td><input id="sgs_${s.id}_code" value="${Shogu.esc(s.staff_code)}" style="width:6em"></td>
    <td><input id="sgs_${s.id}_name" value="${Shogu.esc(s.name)}" style="width:8em"></td>
    <td><select id="sgs_${s.id}_office" style="width:auto">${(C.offices || []).map(o => `<option value="${Shogu.esc(o.id)}"${o.id === s.office_id ? ' selected' : ''}>${Shogu.esc(o.name)}</option>`).join('')}</select></td>
    <td><select id="sgs_${s.id}_emp" style="width:auto"><option${s.employment === '正社員' ? ' selected' : ''}>正社員</option><option${s.employment !== '正社員' ? ' selected' : ''}>非正規</option></select></td>
    <td><input id="sgs_${s.id}_contract" inputmode="numeric" value="${s.contract_yen}" style="width:8em"></td>
    <td><input id="sgs_${s.id}_base" inputmode="numeric" value="${s.baseline_yen}" style="width:8em"></td>
    <td><input id="sgs_${s.id}_active" type="checkbox" style="width:auto" ${s.active === false ? '' : 'checked'}></td>
    <td><button type="button" class="back" onclick="shoguDeleteStaff(${s.id})">消す</button></td></tr>`).join('');
  return `<h4>職員の契約給と下限</h4>
    <p class="note">契約給は処遇改善込みの総額です。普段の給与は、フリーウェイに入っている毎月の額（処遇改善込み）で、これを下回る月を警告します。</p>
    <div class="sheet-scroll"><table class="msheet" id="shogu_staff"><thead><tr><th>従業員番号</th><th>氏名</th><th>事業所</th><th>雇用</th><th>契約給（込み）</th><th>普段の給与（込み）</th><th>有効</th><th></th></tr></thead><tbody>${rows || ''}</tbody></table></div>
    <button type="button" onclick="shoguSaveStaff()">職員の給与を保存する</button>
    <h4>追加</h4>
    <input id="shogu_new_code" placeholder="従業員番号" style="width:8em">
    <input id="shogu_new_name" placeholder="氏名">
    <select id="shogu_new_office" style="width:auto">${(C.offices || []).map(o => `<option value="${Shogu.esc(o.id)}">${Shogu.esc(o.name)}</option>`).join('')}</select>
    <select id="shogu_new_emp" style="width:auto"><option>非正規</option><option>正社員</option></select>
    <input id="shogu_new_contract" inputmode="numeric" placeholder="契約給">
    <input id="shogu_new_base" inputmode="numeric" placeholder="普段の給与">
    <button type="button" onclick="shoguAddStaff()">追加する</button>
    <h4>CSVから入れる</h4>
    <p class="note">1行目は「従業員番号,氏名,事業所,雇用,契約給,普段の給与」。事業所は画面の名前（レオ、茶夢など）。小数の行は取り込みません。</p>
    <input id="shogu_staff_csv" type="file" accept=".csv,text/csv" onchange="shoguImportStaff(this)">`;
}
function shoguReadStaffRow(s) {
  const name = document.getElementById('sgs_' + s.id + '_name').value.trim();
  const contract = Shogu.parseYenInput(document.getElementById('sgs_' + s.id + '_contract').value);
  const base = Shogu.parseYenInput(document.getElementById('sgs_' + s.id + '_base').value);
  if (!name) return { error: '氏名が空です' };
  if (!contract.ok || contract.yen == null || !base.ok || base.yen == null) return { error: name + ' の金額が整数ではありません' };
  return { row: {
    staff_code: document.getElementById('sgs_' + s.id + '_code').value.trim(), name,
    office_id: document.getElementById('sgs_' + s.id + '_office').value,
    employment: document.getElementById('sgs_' + s.id + '_emp').value === '正社員' ? '正社員' : '非正規',
    contract_yen: contract.yen, baseline_yen: base.yen,
    active: document.getElementById('sgs_' + s.id + '_active').checked, note: s.note || '',
    updated_at: new Date().toISOString(),
  } };
}
async function shoguSaveStaff() {
  const db = shoguDb();
  const rows = [];
  for (const s of db.staff) {
    const got = shoguReadStaffRow(s);
    if (got.error) return alert(got.error);
    rows.push(Object.assign({ id: s.id }, got.row));
  }
  try {
    if (typeof DEMO !== 'undefined' && DEMO) rows.forEach(row => { const i = db.staff.findIndex(s => s.id === row.id); if (i >= 0) db.staff[i] = Object.assign({}, db.staff[i], row); });
    else {
      for (const row of rows) {
        const id = row.id; const body = Object.assign({}, row); delete body.id;
        await sb('shogu_staff?id=eq.' + id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body) });
      }
      SHOGU.live = null;
    }
    SHOGU.msg = '保存しました。';
    renderShogu(['staff']);
  } catch (e) { alert('保存できませんでした。 ' + e.message); }
}
async function shoguAddStaff() {
  const name = document.getElementById('shogu_new_name').value.trim();
  const contract = Shogu.parseYenInput(document.getElementById('shogu_new_contract').value);
  const baseIn = document.getElementById('shogu_new_base').value;
  const base = Shogu.parseYenInput(baseIn.trim() ? baseIn : document.getElementById('shogu_new_contract').value);
  if (!name) return alert('氏名を入れてください。');
  if (!contract.ok || contract.yen == null || !base.ok || base.yen == null) return alert('契約給と普段の給与は整数です。小数は入れません。');
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
    renderShogu(['staff']);
  } catch (e) { alert('追加できませんでした。 ' + e.message); }
}
async function shoguDeleteStaff(id) {
  if (!confirm('この職員と、月々の内訳を消します。')) return;
  try {
    if (typeof DEMO !== 'undefined' && DEMO) { const db = shoguDb(); db.staff = db.staff.filter(s => s.id !== id); db.pays = db.pays.filter(p => String(p.staff_id) !== String(id)); }
    else { await sb('shogu_staff?id=eq.' + id, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }); SHOGU.live = null; }
    renderShogu(['staff']);
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
  if (!parsed.rows.length) return alert(parsed.errors.join('\n') || '取り込める行がありません。');
  try {
    if (typeof DEMO !== 'undefined' && DEMO) {
      const db = shoguDb();
      parsed.rows.forEach(row => {
        const i = db.staff.findIndex(s => row.staff_code && s.staff_code === row.staff_code);
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
    renderShogu(['staff']);
  } catch (e) { alert('取り込めませんでした。 ' + e.message); }
}

function shoguPoolView() {
  const db = shoguDb();
  const fy = +((db.settings && db.settings.fy_year) || SHOGU.fy || 2026);
  const next = fy + 1;
  const pool = Shogu.poolSummary({ fy, receipts: db.receipts, pays: db.pays, staff: db.staff });
  const now = Shogu.simulatePool(pool.balance, db.settings.regular_this);
  const later = Shogu.simulatePool(pool.balance, db.settings.regular_next);
  const offices = [...new Set(db.staff.map(s => s.office_id).concat(db.receipts.map(r => r.office_id)))];
  const lines = offices.filter(Boolean).map(id => {
    const p = Shogu.poolSummary({ fy, officeId: id, receipts: db.receipts, pays: db.pays, staff: db.staff });
    return `<tr><td>${Shogu.esc(shoguOfficeName(id))}</td><td>${shoguYen(p.received)}</td><td>${shoguYen(p.monthly)}</td><td>${shoguYen(p.lump)}</td><td>${shoguYen(p.balance)}</td></tr>`;
  }).join('');
  const sim = (label, count, result) => result.short
    ? `${label}（${count}人）: プールが ${shoguYen(result.remainder)} 不足しています。配分は出しません。`
    : result.per == null ? `${label}: 人数が0人なので割りません。`
    : `${label}（${count}人）: 1人 ${shoguYen(result.per)}。端数 ${shoguYen(result.remainder)} はプールに残します。`;
  return `<h4>${fy}年度のボーナスプール</h4>
    <p>加算 ${shoguYen(pool.received)} − 月額配分 ${shoguYen(pool.monthly)} = 繰入 ${shoguYen(pool.carried)}。ここから一時金 ${shoguYen(pool.lump)} を引いた残りが <b id="shogu_pool">${shoguYen(pool.balance)}</b> です。</p>
    <p id="shogu_sim_now">${Shogu.esc(sim(fy + '年度の正社員', db.settings.regular_this, now))}</p>
    <p id="shogu_sim_next">${Shogu.esc(sim(next + '年度の正社員（同じプールで試算）', db.settings.regular_next, later))}</p>
    <p class="note">人数は設定で変えます。今の初期値は今年度1人、来年度4人です。これは支払いの確定ではなく、1人あたりの目安です。割れない1円は誰かへ寄せません。</p>
    <div class="sheet-scroll"><table class="msheet"><thead><tr><th>事業所</th><th>加算</th><th>月額</th><th>一時金</th><th>プール残り</th></tr></thead><tbody>${lines}</tbody></table></div>`;
}
function shoguSetView() {
  const s = shoguDb().settings;
  return `<h4>設定</h4>
    <label>今年度（4月始まりの西暦）</label><input id="shogu_set_fy" inputmode="numeric" value="${s.fy_year}">
    <label>今年度の正社員数</label><input id="shogu_set_this" inputmode="numeric" value="${s.regular_this}">
    <label>来年度の正社員数</label><input id="shogu_set_next" inputmode="numeric" value="${s.regular_next}">
    <label>フリーウェイの月額項目名</label><input id="shogu_set_item" value="${Shogu.esc(s.freeway_item)}">
    <label>フリーウェイの一時金項目名</label><input id="shogu_set_bonus" value="${Shogu.esc(s.freeway_bonus_item)}">
    <button type="button" onclick="shoguSaveSettings()">設定を保存する</button>
    <p class="note">加算率の表は画面に持っています（令和6年6月〜令和8年5月と、令和8年6月以降）。届出の率が違う月は、PDF投入の画面でその月だけ直します。</p>`;
}
async function shoguSaveSettings() {
  const fy = +document.getElementById('shogu_set_fy').value;
  const a = +document.getElementById('shogu_set_this').value;
  const b = +document.getElementById('shogu_set_next').value;
  if (!Number.isInteger(fy) || fy < 2020 || fy > 2100) return alert('年度は西暦で入れてください。');
  if (!Number.isInteger(a) || a < 0 || !Number.isInteger(b) || b < 0) return alert('人数は0以上の整数です。');
  const row = { fy_year: fy, regular_this: a, regular_next: b, freeway_item: document.getElementById('shogu_set_item').value.trim() || '処遇改善手当', freeway_bonus_item: document.getElementById('shogu_set_bonus').value.trim() || '処遇改善一時金', updated_at: new Date().toISOString() };
  try {
    if (typeof DEMO !== 'undefined' && DEMO) Object.assign(shoguDb().settings, row);
    else { await sb('shogu_settings?id=eq.1', { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(row) }); SHOGU.live = null; }
    SHOGU.fy = fy;
    SHOGU.msg = '設定を保存しました。';
    renderShogu(['set']);
  } catch (e) { alert('保存できませんでした。 ' + e.message); }
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
