// 茶夢（生活介護）。職員が入れるのは業務日誌だけ。保存すると実績記録票へ自動転記し、署名済みだけ国保連CSVの対象。
// 請求の計算は rydeen-billing-lib.js のサービス種類22（生活介護）。B型の bp_* は使わない。
const CM = { st: {}, files: null, can: false, bill: false, pad: null, loaded: {} };
const CM_NAV = [['journal', '業務日誌'], ['records', '実績記録票'], ['billing', '国保連CSV'], ['users', '利用者']];

/* cm-pure */
var ChamuLib = (() => {
  const WEATHER = ['晴れ', 'くもり', '雨', '雪'];
  const TRANSPORT = ['往復', '片道', 'なし'];
  const MEAL = ['あり', 'なし'];
  const BANDS = ['3時間未満', '3時間以上4時間未満', '4時間以上5時間未満', '5時間以上6時間未満', '6時間以上7時間未満', '7時間以上8時間未満', '8時間以上9時間未満'];
  const DEFAULTS = {
    office_no: '2410202663', office_name: '茶夢', service_type: '22', region_code: '06', unit_price: '10.37',
    shogu_rate: '0.096', shogu_item: '5175', capacity_scale: '11-20', standard_band: '6時間以上7時間未満',
    default_start: '10:00', default_end: '16:00', ishi_gen: true,
  };
  const clip = (s, n) => String(s == null ? '' : s).trim().slice(0, n);
  const time = v => {
    const m = /^(\d{1,2}):(\d{2})/.exec(String(v || '').trim());
    if (!m) return '';
    const h = +m[1], min = +m[2];
    if (h > 23 || min > 59) return '';
    return String(h).padStart(2, '0') + ':' + String(min).padStart(2, '0');
  };
  const minutes = t => { const s = time(t); if (!s) return null; const [h, m] = s.split(':').map(Number); return h * 60 + m; };
  const bandOf = (start, end, fallback) => {
    const a = minutes(start), b = minutes(end);
    if (a == null || b == null) return fallback || DEFAULTS.standard_band;
    let d = b - a; if (d < 0) d += 1440;
    const h = d / 60;
    if (h < 3) return BANDS[0];
    if (h < 4) return BANDS[1];
    if (h < 5) return BANDS[2];
    if (h < 6) return BANDS[3];
    if (h < 7) return BANDS[4];
    if (h < 8) return BANDS[5];
    return BANDS[6];
  };
  const ymd = v => {
    const s = String(v || '').trim();
    if (!s) return '';
    if (/^\d{8}$/.test(s)) return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8);
    return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
  };
  const settingsOf = row => {
    const s = { ...DEFAULTS };
    if (!row) return s;
    for (const k of Object.keys(DEFAULTS)) {
      if (k === 'ishi_gen') continue;
      if (row[k] != null && String(row[k]).trim() !== '') s[k] = String(row[k]).trim();
    }
    if (row.ishi_gen != null) s.ishi_gen = !!row.ishi_gen;
    return s;
  };
  const lastDay = ym => {
    const [y, m] = String(ym).split('-').map(Number);
    return String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0');
  };
  const prepareLine = (line, defaults) => {
    const d = defaults || DEFAULTS;
    if (!line || !line.present) return { present: false, start_time: null, end_time: null, transport: null, meal: null, support_note: null, filled: false };
    let start = time(line.start_time), end = time(line.end_time), filled = false;
    if (!start || !end) { filled = true; start = start || time(d.default_start) || DEFAULTS.default_start; end = end || time(d.default_end) || DEFAULTS.default_end; }
    return { present: true, start_time: start, end_time: end, transport: line.transport, meal: line.meal, support_note: clip(line.support_note, 2000), filled };
  };
  const validateJournal = (form, defaults) => {
    const err = [];
    if (!form || !/^\d{4}-\d{2}-\d{2}$/.test(form.journal_date || '')) err.push('日付が正しくありません');
    const staff = clip(form && form.staff_name, 60);
    if (!staff) err.push('記入者を入れてください');
    if (form && form.weather && WEATHER.indexOf(form.weather) < 0) err.push('天気が正しくありません');
    if (form && clip(form.menu, 10000).length > 500) err.push('献立は500文字以内にしてください');
    if (form && clip(form.note, 10000).length > 2000) err.push('全体申し送りは2000文字以内にしてください');
    (form && form.users || []).forEach(u => {
      if (!u) return;
      const n = (u.name || '利用者') + 'さん: ';
      if (u.present == null) { err.push(n + '出欠を選んでください'); return; }
      if (!u.present) return;
      const p = prepareLine(u, defaults);
      const a = minutes(p.start_time), b = minutes(p.end_time);
      if (a == null || b == null) err.push(n + '開始と終了を確認してください');
      else if (b <= a) err.push(n + '終了は開始より後にしてください');
      if (TRANSPORT.indexOf(u.transport) < 0) err.push(n + '送迎を選んでください');
      if (MEAL.indexOf(u.meal) < 0) err.push(n + '食事を選んでください');
      if (clip(u.support_note, 10000).length > 2000) err.push(n + '支援内容は2000文字以内にしてください');
    });
    return err;
  };
  const sameRecord = (cur, want) => time(cur.start_time) === time(want.start_time) && time(cur.end_time) === time(want.end_time)
    && (cur.transport || '') === (want.transport || '') && (cur.meal || '') === (want.meal || '') && String(cur.support_note || '') === String(want.support_note || '');
  // 出席だけ実績にする。署名済みで内容が変わったら署名を外す。欠席に変わった署名済みは残す。
  const syncPlan = (lines, existing, defaults) => {
    const notes = [], upsert = [], del = [];
    const by = {};
    (existing || []).forEach(r => { by[r.user_id] = r; });
    (lines || []).forEach(line => {
      const name = line.name || '利用者', cur = by[line.user_id], prep = prepareLine(line, defaults);
      if (prep.filled) notes.push(`${name}: 時刻空欄→${prep.start_time}-${prep.end_time}補完`);
      if (!prep.present) {
        if (cur) { if (cur.signed_at) notes.push(`${name}: 署名済みの記録票があるため残しています（日誌が欠席に変わっています）。`); else del.push(cur.id); }
        return;
      }
      const want = { user_id: line.user_id, start_time: prep.start_time, end_time: prep.end_time, transport: prep.transport, meal: prep.meal, support_note: prep.support_note || '' };
      if (cur && sameRecord(cur, want)) return;
      if (cur && cur.signed_at) notes.push(`${name}: 内容が変わったため、署名を取り直してください。`);
      upsert.push({ ...want, signature_data: null, signed_at: null });
    });
    return { upsert, del, notes };
  };
  const tripsOf = t => t === '往復' ? { sog: '両', go: 1, back: 1 } : t === '片道' ? { sog: '往', go: 1, back: 0 } : { sog: 'なし', go: 0, back: 0 };
  const buildBillingInput = (year, month, src) => {
    const settings = settingsOf(src && src.settings);
    const ym = String(year) + String(month).padStart(2, '0');
    const prefix = ym.slice(0, 4) + '-' + ym.slice(4);
    const blocking = [], warnings = [];
    if (!/^\d{10}$/.test(settings.office_no)) blocking.push('事業所番号は半角数字10桁にしてください。');
    if (settings.service_type !== '22') blocking.push('サービス種類コードは22（生活介護）だけに対応しています。');
    if (settings.capacity_scale !== '11-20') blocking.push('ポータルのサービスコード表は定員11〜20人だけです。');
    const records = (src && src.records) || [];
    const inMonth = records.filter(r => String(r.service_date || '').startsWith(prefix));
    const signed = inMonth.filter(r => r.signed_at);
    const office = {
      事業所番号: settings.office_no, 事業所名: settings.office_name, サービス種類コード: '22', 地域区分コード: settings.region_code,
      地域区分単価: settings.unit_price, 処遇改善加算率: settings.shogu_rate, 処遇改善サービスコード項目: settings.shogu_item,
      利用定員規模: settings.capacity_scale, 標準提供時間帯: settings.standard_band, 既定開始時刻: settings.default_start, 既定終了時刻: settings.default_end,
      医師未配置減算: settings.ishi_gen ? 'あり' : 'なし',
    };
    const by = {};
    signed.forEach(r => { (by[r.user_id] = by[r.user_id] || []).push(r); });
    const users = [], agg = [], preview = [];
    ((src && src.users) || []).forEach(u => {
      const days = by[u.id] || [];
      const unsigned = inMonth.filter(r => r.user_id === u.id && !r.signed_at).length;
      if (!days.length && !unsigned) return;
      preview.push({ id: u.id, name: u.name || '', signed: days.length, unsigned });
      if (!days.length) return;
      const rn = String(u.recipient_no || '').trim(), city = String(u.city_no || '').trim();
      if (!/^\d{1,10}$/.test(rn)) blocking.push(`${u.name}: 受給者証番号が未設定または不正です。`);
      if (!/^\d{1,6}$/.test(city)) blocking.push(`${u.name}: 支給決定市町村番号が未設定または不正です。`);
      const kubun = Number(u.support_level);
      if (!(kubun >= 1 && kubun <= 6)) blocking.push(`${u.name}: 障害支援区分を1〜6で入れてください。`);
      if (!u.kana) warnings.push(`${u.name}: 氏名カナが空です（請求CSVのカナ欄は空になります）。`);
      users.push({
        利用者ID: u.id, 受給者証番号: rn, 支給決定市町村番号: city, 氏名: u.name || '', 氏名カナ: u.kana || '', 障害支援区分: u.support_level ?? '',
        上限管理有無: u.cap_management || '無', 上限月額: Number(u.cap_amount) || 0, 上限額管理事業所番号: u.cap_office_no || '',
        決定サービスコード: u.decision_code || '221000', 契約支給量_日: u.contract_days || '原則',
        契約開始年月日: ymd(u.contract_start), 契約終了年月日: ymd(u.contract_end), サービス開始年月日: ymd(u.service_start),
        事業者記入欄番号: u.provider_entry_no || '1', 食事提供体制加算対象: u.meal_addon === false ? '非対象' : '対象', 送迎加算区分: u.transport_class || '2',
      });
      const row = { 対象年月: ym, 利用者ID: u.id, 利用日数: days.length, 送迎往回数: 0, 送迎復回数: 0, 食事回数: 0 };
      days.forEach(r => {
        const day = Number(String(r.service_date).slice(8, 10)), k = String(day).padStart(2, '0');
        const st = time(r.start_time) || settings.default_start, en = time(r.end_time) || settings.default_end;
        if (!time(r.start_time) || !time(r.end_time)) warnings.push(`${u.name} ${r.service_date}: 開始/終了が空欄のため既定時刻で補完。`);
        const tr = tripsOf(r.transport);
        const mealOn = u.meal_addon !== false && r.meal === 'あり';
        row['利用_' + k] = '1';
        row['時間_' + k] = bandOf(st, en, settings.standard_band);
        row['送迎_' + k] = tr.sog;
        row['食事_' + k] = mealOn ? '1' : '0';
        row['開始_' + k] = st;
        row['終了_' + k] = en;
        row.送迎往回数 += tr.go;
        row.送迎復回数 += tr.back;
        if (mealOn) row.食事回数 += 1;
      });
      agg.push(row);
    });
    return { office, users, agg, settings, blocking, warnings, signedCount: signed.length, unsignedCount: inMonth.length - signed.length, preview };
  };
  return { WEATHER, TRANSPORT, MEAL, BANDS, DEFAULTS, time, bandOf, settingsOf, lastDay, prepareLine, validateJournal, syncPlan, buildBillingInput };
})();
/* /cm-pure */

const cmEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cmToday = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
const cmShift = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const cmV = id => { const e = document.getElementById(id); return e ? e.value : ''; };
const cmC = id => { const e = document.getElementById(id); return !!(e && e.checked); };
const cmShow = html => { const v = document.getElementById('view'); if (v) v.innerHTML = html; };
const cmBack = () => '<button class="back noprint" onclick="location.hash=\'chamu\'">← 茶夢へ</button>';
const cmNav = cur => `<div class="cm-nav noprint">${CM_NAV.filter(([k]) => k !== 'billing' || CM.bill).map(([k, l]) => `<a href="#chamu/${k}" class="${k === cur ? 'on' : ''}">${l}</a>`).join('')}</div>`;
const cmFrame = (cur, html) => cmShow(`<div class="cm">${cmBack()}${cmNav(cur)}<div id="cm_m"></div>${html}</div>`);
const cmMsg = (text, ok) => { const m = document.getElementById('cm_m'); if (m) m.innerHTML = `<div class="${ok ? 'okb' : 'ng'}">${cmEsc(text).replace(/\n/g, '<br>')}</div>`; };
async function cmGo(fn) { try { await fn(); } catch (e) { cmMsg(e.message || e); } }
(function () {
  const st = document.createElement('style');
  st.textContent = `.cm-nav{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 14px}.cm-nav a{background:#fff;border:1px solid #bbb;border-radius:8px;padding:8px 12px;text-decoration:none;color:#333}
.cm-nav a.on{background:var(--main);color:#fff;border-color:var(--main)}
.cm label.l{display:block;font-size:14px;color:#555;margin-top:8px}.cm textarea,.cm select{width:100%;box-sizing:border-box;font-size:17px;padding:10px;border:1px solid #bbb;border-radius:8px;margin:4px 0}.cm textarea{min-height:72px}
.cm .row{display:flex;gap:10px;flex-wrap:wrap}.cm .row>*{flex:1;min-width:140px}
.cm button.sec{background:#fff;color:#333;border:1px solid #bbb}.cm button.inl{width:auto;padding:8px 14px;margin:2px}
.cm input[type=checkbox]{width:auto;transform:scale(1.2);margin-right:6px}
.cm .jr{border:1px solid #ddd;border-radius:10px;padding:10px;margin:8px 0;background:#fff}
.cm .ng{background:#fde8e8;border-radius:8px;padding:8px 10px;margin:6px 0;white-space:pre-wrap}.cm .okb{background:#e6f4ea;border-radius:8px;padding:8px 10px;margin:6px 0}.cm .wn{background:#fff6d6;border-radius:8px;padding:8px 10px;margin:6px 0}
.cm .note{color:#555}.cm img.cm-sg{width:260px;max-width:100%;border:1px solid #bbb;background:#fff}
.cm .pad{height:200px;touch-action:none}.cm .pad canvas{width:100%;height:100%;display:block;background:#fff;border:2px dashed #888;border-radius:8px;touch-action:none}
@media print{header,.back,.cm-nav,.noprint,#help,#out{display:none!important}body{background:#fff}main{max-width:none;padding:0}}`;
  document.head.appendChild(st);
})();

async function cmRest(path, opt, retried) {
  let s = {}; try { s = JSON.parse(localStorage.getItem('sess') || '{}'); } catch (e) { s = {}; }
  if (s.exp && s.exp < Date.now() + 30000 && !retried && typeof refreshSess === 'function') {
    if (await refreshSess()) { try { s = JSON.parse(localStorage.getItem('sess') || '{}'); } catch (e) { s = {}; } }
  }
  const r = await fetch(C.supabaseUrl + '/rest/v1/' + path, { ...(opt || {}), headers: { apikey: C.supabaseKey, Authorization: 'Bearer ' + (s.token || ''), 'Content-Type': 'application/json', ...((opt && opt.headers) || {}) } });
  if (r.status === 401 && !retried && typeof refreshSess === 'function' && await refreshSess()) return cmRest(path, opt, true);
  if (!r.ok) {
    let msg = '保存できませんでした（' + r.status + '）';
    try { const j = await r.json(); if (j.message) msg = j.message; } catch (e) { /* 本文なし */ }
    if (r.status === 401 || r.status === 403 || /row-level security|permission denied/i.test(msg)) msg = 'この操作の権限がありません。';
    throw new Error(msg);
  }
  if (r.status === 204) return null;
  const tx = await r.text();
  return tx ? JSON.parse(tx) : null;
}
const cmRpc = fn => cmRest('rpc/' + fn, { method: 'POST', body: '{}' });
async function cmNow() { try { const t = await cmRpc('chamu_now'); return t || new Date().toISOString(); } catch (e) { return new Date().toISOString(); } }
async function cmUsers(all) { return await cmRest('chamu_users?' + (all ? '' : 'active=eq.true&') + 'select=*&order=sort.asc,name.asc') || []; }
async function cmSettingsRow() { const rows = await cmRest('chamu_billing_settings?id=eq.1&select=*') || []; return rows[0] || null; }
async function cmStaffName() { try { const p = await cmRest('staff_profiles?select=nikki_name'); return (p && p[0] && p[0].nikki_name) || ''; } catch (e) { return ''; } }
function cmScript(src) {
  if (src.indexOf('encoding') >= 0 && window.Encoding) return Promise.resolve();
  if (src.indexOf('rydeen-billing') >= 0 && window.RydBilling) return Promise.resolve();
  return CM.loaded[src] || (CM.loaded[src] = new Promise((ok, ng) => {
    const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => { delete CM.loaded[src]; ng(new Error('部品を読み込めませんでした')); }; document.head.appendChild(s);
  }));
}
function cmSel(id, list, cur, blank) {
  const opts = (blank ? [`<option value="">${cmEsc(blank)}</option>`] : []).concat(list.map(o => {
    const v = Array.isArray(o) ? o[0] : o, l = Array.isArray(o) ? o[1] : o;
    return `<option value="${cmEsc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${cmEsc(l)}</option>`;
  }));
  return `<select id="${id}">${opts.join('')}</select>`;
}
const cmInp = (id, label, val, type, extra) => `<div><label class="l">${label}</label><input id="${id}" type="${type || 'text'}" value="${cmEsc(val ?? '')}" ${extra || ''}></div>`;

async function renderChamu(sub) {
  sub = sub || 'journal';
  if (typeof DEMO !== 'undefined' && DEMO) return cmShow(cmBack() + '<div class="card"><p>見本モードでは、茶夢の日誌は使えません。ログインしてお使いください。</p></div>');
  cmShow(cmBack() + '<p>読み込み中…</p>');
  try {
    CM.can = await cmRpc('chamu_can');
    CM.bill = await cmRpc('chamu_can_bill');
  } catch (e) { return cmShow(cmBack() + `<div class="card"><p>${cmEsc(e.message || e)}</p><p class="note">茶夢の表がまだないときは、supabase/chamu.sql を適用してください。</p></div>`); }
  if (CM.can !== true) return cmShow(cmBack() + '<div class="card"><p>茶夢の記録は、茶夢の職員と、事務・会長が使えます。</p><p class="note">茶夢の職員として使うには、管理者に所属（staff_profiles の office）を「茶夢」にしてもらってください。</p></div>');
  if (sub === 'billing' && CM.bill !== true) return cmFrame('billing', '<div class="card"><p>国保連CSVは、事務・茶夢の管理者・会長だけが作れます。</p></div>');
  const page = { journal: cmJournal, records: cmRecords, billing: cmBilling, users: cmUsersPage }[sub] || cmJournal;
  try { await page(); } catch (e) { cmFrame(sub, `<div class="ng">${cmEsc(e.message || e)}</div>`); }
}

async function cmJournal() {
  const date = CM.st.date || cmToday();
  const [users, day, settings, staff] = await Promise.all([
    cmUsers(false),
    cmRest(`chamu_journal?journal_date=eq.${date}&select=*,chamu_journal_line(*)`).then(a => (a && a[0]) || null),
    cmSettingsRow(), cmStaffName(),
  ]);
  const lines = (day && day.chamu_journal_line) || [];
  const by = {}; lines.forEach(l => { by[l.user_id] = l; });
  CM.st.date = date;
  const card = u => {
    const l = by[u.id] || {}, chosen = l.user_id ? (l.present ? '出席' : '欠席') : '', k = u.id;
    return `<div class="jr"><div class="row" style="align-items:end"><div style="flex:0 0 160px"><b>${cmEsc(u.name)}</b></div><div><label class="l">出欠</label>${cmSel('p_' + k, ['出席', '欠席'], chosen, '選択')}</div></div>
      <div id="det_${k}" class="row" style="${chosen === '出席' ? '' : 'display:none'}">${cmInp('s_' + k, '開始', (l.start_time || '').slice(0, 5), 'time')}${cmInp('e_' + k, '終了', (l.end_time || '').slice(0, 5), 'time')}
        <div><label class="l">送迎</label>${cmSel('t_' + k, ChamuLib.TRANSPORT, l.transport || '往復')}</div>
        <div><label class="l">食事</label>${cmSel('m_' + k, ChamuLib.MEAL, l.meal || 'あり')}</div>
        <div style="flex:1 1 100%"><label class="l">支援内容・ご様子</label><textarea id="n_${k}">${cmEsc(l.support_note || '')}</textarea></div></div></div>`;
  };
  cmFrame('journal', `<h3>業務日誌　${cmEsc(date)}</h3><p class="note">職員が入力するのはここだけです。保存すると、出席した日は実績記録票に自動で転記されます。</p>
    <p class="noprint"><button class="sec inl" onclick="CM.st.date='${cmShift(date, -1)}';renderChamu('journal')">＜ 前日</button>
    <button class="sec inl" onclick="CM.st.date='${cmToday()}';renderChamu('journal')">今日</button>
    <button class="sec inl" onclick="CM.st.date='${cmShift(date, 1)}';renderChamu('journal')">翌日 ＞</button>
    <input type="date" id="j_date" value="${date}" style="width:auto" onchange="CM.st.date=this.value;renderChamu('journal')"></p>
    <div class="card">${cmInp('j_staff', '記入者', (day && day.staff_name) || staff)}
      <div class="row"><div><label class="l">天気</label>${cmSel('j_weather', ChamuLib.WEATHER, (day && day.weather) || '', '（未選択）')}</div>${cmInp('j_menu', '献立', (day && day.menu) || '')}</div>
      <label class="l">全体申し送り</label><textarea id="j_note">${cmEsc((day && day.note) || '')}</textarea></div>
    <p class="noprint"><button class="sec inl" onclick="cmBulk()">予定どおり全員を一括入力</button></p>
    ${users.map(card).join('') || '<div class="card">利用者がまだいません。<a href="#chamu/users">利用者</a>から登録してください。</div>'}
    <button onclick="cmSaveJournal()">保存して記録票に転記</button>`);
  users.forEach(u => { const el = document.getElementById('p_' + u.id); if (el) el.onchange = () => cmToggle(u.id); });
  CM.st.users = users;
  CM.st.defaults = ChamuLib.settingsOf(settings);
}
function cmToggle(id) { const det = document.getElementById('det_' + id); if (det) det.style.display = cmV('p_' + id) === '出席' ? '' : 'none'; }
function cmBulk() {
  const d = CM.st.defaults || ChamuLib.DEFAULTS;
  (CM.st.users || []).forEach(u => {
    const p = document.getElementById('p_' + u.id), s = document.getElementById('s_' + u.id), e = document.getElementById('e_' + u.id), t = document.getElementById('t_' + u.id), m = document.getElementById('m_' + u.id);
    if (p) p.value = '出席'; if (s && !s.value) s.value = d.default_start; if (e && !e.value) e.value = d.default_end; if (t) t.value = '往復'; if (m) m.value = 'あり'; cmToggle(u.id);
  });
}
function cmReadJournal(date) {
  return {
    journal_date: date, staff_name: cmV('j_staff'), weather: cmV('j_weather'), menu: cmV('j_menu'), note: cmV('j_note'),
      users: (CM.st.users || []).map(u => ({
      user_id: u.id, name: u.name, present: cmV('p_' + u.id) === '' ? null : cmV('p_' + u.id) === '出席', start_time: cmV('s_' + u.id), end_time: cmV('e_' + u.id),
      transport: cmV('t_' + u.id), meal: cmV('m_' + u.id), support_note: cmV('n_' + u.id),
    })),
  };
}
async function cmSaveJournal() {
  await cmGo(async () => {
    const date = CM.st.date || cmToday(), defaults = CM.st.defaults || ChamuLib.DEFAULTS, form = cmReadJournal(date);
    const errs = ChamuLib.validateJournal(form, defaults);
    if (errs.length) throw new Error(errs.join('\n'));
    const prepared = form.users.map(u => ({ user_id: u.user_id, name: u.name, ...ChamuLib.prepareLine(u, defaults) }));
    const dayRows = await cmRest('chamu_journal?on_conflict=journal_date', {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({ journal_date: date, staff_name: form.staff_name.trim(), weather: form.weather || null, menu: form.menu.trim() || null, note: form.note.trim() || null, updated_at: new Date().toISOString() }),
    });
    const day = dayRows[0];
    if (prepared.length) await cmRest('chamu_journal_line?on_conflict=journal_id,user_id', {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(prepared.map(u => ({
        journal_id: day.id, user_id: u.user_id, present: u.present, start_time: u.start_time, end_time: u.end_time,
        transport: u.transport, meal: u.meal, support_note: u.present ? (u.support_note || '') : null,
      }))),
    });
    const notes = prepared.filter(u => u.filled).map(u => `${u.name}: 時刻空欄→${u.start_time}-${u.end_time}補完`).concat(await cmApplySync(date, prepared, defaults));
    await cmJournal();
    cmMsg('保存しました。' + (notes.length ? '\n' + notes.join('\n') : '\n実績記録票に転記しました。'), true);
  });
}
async function cmApplySync(date, prepared, defaults) {
  const recs = await cmRest(`chamu_service_records?service_date=eq.${date}&select=*`) || [];
  const plan = ChamuLib.syncPlan(prepared, recs, defaults);
  if (plan.upsert.length) await cmRest('chamu_service_records?on_conflict=user_id,service_date', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(plan.upsert.map(r => ({ ...r, service_date: date, updated_at: new Date().toISOString() }))),
  });
  for (const id of plan.del) await cmRest('chamu_service_records?id=eq.' + id, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  return plan.notes.filter(n => n.indexOf('時刻空欄') < 0);
}

async function cmRecords() {
  if (CM.st.rec) return cmRecordOne(CM.st.rec);
  const month = CM.st.month || cmToday().slice(0, 7);
  const users = await cmUsers(true);
  const uid = CM.st.user || (users.find(u => u.active) || users[0] || {}).id || '';
  const last = ChamuLib.lastDay(month);
  const recs = uid ? await cmRest(`chamu_service_records?user_id=eq.${uid}&service_date=gte.${month}-01&service_date=lte.${month}-${last}&select=*&order=service_date`) || [] : [];
  const un = recs.filter(r => !r.signed_at).length, name = (users.find(u => u.id === uid) || {}).name || '';
  cmFrame('records', `<h3>サービス提供実績記録票</h3><p class="note">日誌から自動で転記されます（職員の入力は不要）。利用者に署名をもらうと、国保連CSVの対象になります。未署名はCSVに入りません。</p>
    <div class="row noprint"><div><label class="l">利用者</label>${cmSel('r_u', users.map(u => [u.id, u.name + (u.active ? '' : '（停止）')]), uid)}</div>
      ${cmInp('r_m', '月', month, 'month')}<div style="align-self:end"><button class="sec inl" onclick="CM.st.user=cmV('r_u');CM.st.month=cmV('r_m');renderChamu('records')">表示</button></div></div>
    <div class="card"><p><b>${cmEsc(name)}</b>　${cmEsc(month)}　${recs.length}日　未署名 ${un}日</p>
      <table><tr><th>日付</th><th>時間</th><th>送迎</th><th>食事</th><th>支援</th><th>署名</th><th class="noprint"></th></tr>
      ${recs.map(r => `<tr><td>${r.service_date}</td><td>${cmEsc((r.start_time || '').slice(0, 5))}–${cmEsc((r.end_time || '').slice(0, 5))}</td><td>${cmEsc(r.transport)}</td><td>${cmEsc(r.meal)}</td><td>${cmEsc((r.support_note || '').slice(0, 24))}</td><td>${r.signed_at ? '✔ 署名済' : '未署名'}</td><td class="noprint"><button class="inl sec" onclick="CM.st.rec='${r.id}';renderChamu('records')">記録票・署名</button></td></tr>`).join('')}
      </table>${recs.length ? '' : '<p>この月の記録票はまだありません（業務日誌を入力してください）。</p>'}
      ${recs.filter(r => r.signature_data && String(r.signature_data).indexOf('data:image/png;base64,') === 0).map(r => `<p><b>${r.service_date}</b><br><img class="cm-sg" src="${r.signature_data}" alt="署名"></p>`).join('')}
      <p class="noprint"><button class="sec inl" onclick="cmResync('${month}')">この月を日誌から転記し直す</button> <button class="sec inl" onclick="window.print()">印刷／PDFにする</button></p></div>`);
}
async function cmResync(month) {
  await cmGo(async () => {
    const [users, settings] = await Promise.all([cmUsers(false), cmSettingsRow()]);
    const defaults = ChamuLib.settingsOf(settings), last = ChamuLib.lastDay(month);
    const days = await cmRest(`chamu_journal?journal_date=gte.${month}-01&journal_date=lte.${month}-${last}&select=journal_date,chamu_journal_line(*)`) || [];
    let notes = [];
    for (const j of days) {
      const prepared = users.map(u => {
        const line = (j.chamu_journal_line || []).find(x => x.user_id === u.id) || { present: false };
        return { user_id: u.id, name: u.name, ...ChamuLib.prepareLine({ ...line, name: u.name }, defaults) };
      });
      notes = notes.concat(await cmApplySync(j.journal_date, prepared, defaults));
    }
    await cmRecords();
    cmMsg(`${days.length}日分を転記し直しました。` + (notes.length ? '\n' + notes.join('\n') : ''), true);
  });
}
async function cmRecordOne(id) {
  const rows = await cmRest(`chamu_service_records?id=eq.${id}&select=*`) || [];
  const r = rows[0]; if (!r) { CM.st.rec = null; return cmRecords(); }
  const users = await cmUsers(true), name = (users.find(u => u.id === r.user_id) || {}).name || '';
  const img = r.signature_data && String(r.signature_data).indexOf('data:image/png;base64,') === 0 ? `<img class="cm-sg" src="${r.signature_data}" alt="署名"><br><small>${cmEsc(r.signed_at)}</small>` : '未署名';
  cmFrame('records', `<button class="back noprint" onclick="CM.st.rec=null;renderChamu('records')">← 一覧</button><h3>サービス提供実績記録票</h3>
    <div class="card"><table><tr><th>利用者</th><td>${cmEsc(name)}</td></tr><tr><th>提供日</th><td>${r.service_date}</td></tr>
      <tr><th>時間</th><td>${cmEsc((r.start_time || '').slice(0, 5))} – ${cmEsc((r.end_time || '').slice(0, 5))}</td></tr>
      <tr><th>送迎</th><td>${cmEsc(r.transport)}</td></tr><tr><th>食事</th><td>${cmEsc(r.meal)}</td></tr>
      <tr><th>支援内容・ご様子</th><td>${cmEsc(r.support_note)}</td></tr><tr><th>利用者署名</th><td>${img}</td></tr></table></div>
    <div class="card noprint"><p><b>${r.signed_at ? '署名を取り直す' : '利用者に署名してもらう（端末を利用者に渡してください）'}</b></p>
      <div class="pad"><canvas id="cm_cv"></canvas></div><p><button class="sec inl" type="button" onclick="if(CM.pad)CM.pad.clear()">書き直す</button></p>
      <button onclick="cmSign('${id}')">署名を保存</button></div>
    <p class="noprint"><button class="sec inl" onclick="window.print()">印刷／PDFにする</button></p>`);
  setTimeout(() => { const cv = document.getElementById('cm_cv'); if (cv && typeof createSignPad === 'function') CM.pad = createSignPad(cv); }, 30);
}
async function cmSign(id) {
  await cmGo(async () => {
    if (!CM.pad || !CM.pad.isDrawn()) throw new Error('署名してください');
    const sig = CM.pad.toDataURL();
    if (!sig || sig.indexOf('data:image/png;base64,') !== 0) throw new Error('署名を読み取れませんでした');
    if (sig.length > 300000) throw new Error('署名が大きすぎます。書き直してください');
    await cmRest('chamu_service_records?id=eq.' + id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ signature_data: sig, signed_at: await cmNow() }) });
    await cmRecords();
    cmMsg('署名を保存しました。国保連CSVの対象になります。', true);
  });
}

async function cmBilling() {
  await Promise.all([cmScript('vendor/encoding.min.js'), cmScript('rydeen-billing-lib.js')]);
  const month = CM.st.bmonth || cmToday().slice(0, 7), [y, m] = month.split('-').map(Number), last = ChamuLib.lastDay(month);
  const [settingsRow, users, recs] = await Promise.all([
    cmSettingsRow(), cmUsers(true),
    cmRest(`chamu_service_records?service_date=gte.${month}-01&service_date=lte.${month}-${last}&select=*&order=service_date`) || [],
  ]);
  const input = ChamuLib.buildBillingInput(y, m, { settings: settingsRow, users, records: recs });
  let files = null, err = '';
  if (input.agg.length && !input.blocking.length && window.RydBilling) {
    try { files = RydBilling.buildBillingFiles(y, m, { office: input.office, users: input.users, agg: input.agg }); }
    catch (e) { err = e.message || String(e); }
  }
  CM.files = files;
  const s = input.settings, blocked = input.blocking.length > 0 || !!err || !files || (files && files.issues.length > 0);
  const setForm = CM.bill ? `<div class="card"><h4>事業所の請求設定</h4><p class="note">初期値は日誌シートの事業所マスタ（事業所番号 2410202663、種類22、地域06、単価10.37、処遇改善Ⅱロ 9.6%・項目5175、定員11-20、10:00–16:00、医師未配置減算あり）です。</p>
    <div class="row">${cmInp('bs_office_no', '事業所番号', s.office_no)}${cmInp('bs_office_name', '事業所名', s.office_name)}
      ${cmInp('bs_region_code', '地域区分コード', s.region_code)}${cmInp('bs_unit_price', '地域区分単価', s.unit_price)}
      ${cmInp('bs_shogu_rate', '処遇改善加算率', s.shogu_rate)}${cmInp('bs_shogu_item', '処遇改善のサービスコード項目', s.shogu_item)}
      <div><label class="l">標準提供時間帯</label>${cmSel('bs_band', ChamuLib.BANDS, s.standard_band)}</div>
      ${cmInp('bs_start', '既定開始', s.default_start, 'time')}${cmInp('bs_end', '既定終了', s.default_end, 'time')}</div>
    <p>サービス種類は 22（生活介護）、定員規模は 11-20 です。コード表はこの組み合わせだけを持っています。</p>
    <label><input type="checkbox" id="bs_ishi" ${s.ishi_gen ? 'checked' : ''}> 医師未配置減算あり</label>
    <button onclick="cmSaveSettings()">設定を保存</button></div>` : '';
  cmFrame('billing', `<h3>国保連CSV（生活介護）</h3>
    <div class="card"><div class="row">${cmInp('b_m', 'サービス提供月', month, 'month')}<div style="align-self:end"><button class="sec inl" onclick="CM.st.bmonth=cmV('b_m');renderChamu('billing')">切替</button></div></div>
    <p>対象: ${cmEsc(month)} の<b>署名済み</b>の実績記録票 ${input.signedCount} 件（未署名 ${input.unsignedCount} 件は除外）。ダウンロードするだけで、国保連へは送りません。</p>
    ${files ? `<p>利用者 ${files.summary.users}名 / 総単位数 ${files.summary.totalUnits} / 費用額 ${files.summary.totalCost}円 / 給付費 ${files.summary.totalBenefit}円 / 利用者負担 ${files.summary.totalBurden}円 / 処理対象年月 ${files.summary.billingYm}${files.summary.ishiGen ? ' / 医師未配置減算' : ''}</p>` : ''}
    ${input.preview.map(p => `<p>${cmEsc(p.name)}　署名済 ${p.signed}日${p.unsigned ? `　未署名 ${p.unsigned}日（CSV対象外）` : ''}</p>`).join('')}
    ${input.blocking.map(b => `<div class="ng">${cmEsc(b)}</div>`).join('')}${err ? `<div class="ng">${cmEsc(err)}</div>` : ''}
    ${(files ? files.issues : []).map(b => `<div class="ng">${cmEsc(b)}</div>`).join('')}
    ${files && !files.issues.length ? '<div class="okb">形式チェックの指摘はありません。</div>' : ''}
    ${input.warnings.map(b => `<div class="wn">${cmEsc(b)}</div>`).join('')}
    ${input.agg.length ? '' : '<p>この月に署名済みの記録がありません。</p>'}
    <p>${blocked ? '' : `<button class="inl" onclick="cmDownload('j111')">請求書・明細書（${cmEsc(files.j111.name)}）</button> <button class="inl" onclick="cmDownload('j611')">実績記録票（${cmEsc(files.j611.name)}）</button>`}</p>
    <p class="note">時間帯×障害支援区分で基本報酬（定員11-20・医師未配置のときは医減コード）、食事は対象者の提供日だけ、送迎は往復=2回・片道=1回、処遇改善は所定単位×加算率です。</p></div>${setForm}`);
}
function cmDownload(which) {
  const f = CM.files && CM.files[which]; if (!f) return;
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([f.bytes], { type: 'text/csv' })); a.download = f.name; document.body.appendChild(a); a.click(); a.remove();
}
async function cmSaveSettings() {
  await cmGo(async () => {
    const office = cmV('bs_office_no').trim();
    if (!/^\d{10}$/.test(office)) throw new Error('事業所番号は半角数字10桁にしてください');
    const row = {
      office_no: office, office_name: cmV('bs_office_name').trim() || '茶夢', service_type: '22', region_code: cmV('bs_region_code').trim() || '06',
      unit_price: cmV('bs_unit_price').trim() || '10.37', shogu_rate: cmV('bs_shogu_rate').trim() || '0.096', shogu_item: cmV('bs_shogu_item').trim() || '5175',
      capacity_scale: '11-20', standard_band: cmV('bs_band') || ChamuLib.DEFAULTS.standard_band, default_start: ChamuLib.time(cmV('bs_start')) || '10:00',
      default_end: ChamuLib.time(cmV('bs_end')) || '16:00', ishi_gen: cmC('bs_ishi'), updated_at: new Date().toISOString(),
    };
    const saved = await cmRest('chamu_billing_settings?id=eq.1', { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row) });
    if (!saved || !saved.length) throw new Error('請求設定がありません。supabase/chamu.sql を適用してください');
    await cmBilling();
    cmMsg('設定を保存しました。', true);
  });
}

async function cmUsersPage() {
  if (CM.st.edit) return cmUserForm(CM.st.edit);
  const users = await cmUsers(true);
  cmFrame('users', `<h3>利用者</h3><p class="note">日誌と請求に使う項目です。受給者証・障害支援区分・決定サービスコード（221000）・食事提供・送迎加算を入れてください。いまシートにいる3人は、管理者が supabase/chamu_seed.sql を実行するか、ここから登録します。</p>
    <p><button class="inl" onclick="CM.st.edit='new';renderChamu('users')">利用者を追加</button></p>
    <div class="card"><table><tr><th>氏名</th><th>区分</th><th>食事</th><th>送迎</th><th></th></tr>
      ${users.map(u => `<tr><td>${cmEsc(u.name)}${u.active ? '' : '（停止）'}</td><td>${u.support_level ?? ''}</td><td>${u.meal_addon ? '対象' : '非対象'}</td><td>${cmEsc(u.transport_class)}</td><td><button class="inl sec" onclick="CM.st.edit='${u.id}';renderChamu('users')">編集</button></td></tr>`).join('')}
    </table>${users.length ? '' : '<p>まだ登録がありません。</p>'}</div>`);
}
async function cmUserForm(id) {
  const row = id === 'new' ? { name: '', kana: '', sort: 0, active: true, recipient_no: '', city_no: '', support_level: '', cap_management: '無', cap_amount: 0, cap_office_no: '', decision_code: '221000', contract_days: '原則', contract_start: '', contract_end: '', service_start: '', provider_entry_no: '1', meal_addon: true, transport_class: '2' }
    : ((await cmRest('chamu_users?id=eq.' + id + '&select=*')) || [])[0];
  if (!row) { CM.st.edit = null; return cmUsersPage(); }
  const d = v => v ? String(v).slice(0, 10) : '';
  cmFrame('users', `<button class="back" onclick="CM.st.edit=null;renderChamu('users')">← 一覧</button><h3>${id === 'new' ? '利用者を追加' : cmEsc(row.name)}</h3>
    <div class="card"><div class="row">${cmInp('u_name', '氏名', row.name)}${cmInp('u_kana', '氏名カナ', row.kana)}${cmInp('u_sort', '並び', row.sort, 'number')}</div>
      <label><input type="checkbox" id="u_active" ${row.active ? 'checked' : ''}> 利用中</label>
      <div class="row">${cmInp('u_rec', '受給者証番号', row.recipient_no)}${cmInp('u_city', '支給決定市町村番号', row.city_no)}
        <div><label class="l">障害支援区分</label>${cmSel('u_lv', [['', '未設定'], '1', '2', '3', '4', '5', '6'], row.support_level ?? '')}</div></div>
      <div class="row"><div><label class="l">上限管理</label>${cmSel('u_cap', ['無', '有'], row.cap_management || '無')}</div>${cmInp('u_capamt', '上限月額', row.cap_amount, 'number')}${cmInp('u_capoff', '上限額管理事業所番号', row.cap_office_no)}</div>
      <div class="row">${cmInp('u_dec', '決定サービスコード', row.decision_code || '221000')}${cmInp('u_qty', '契約支給量（日）', row.contract_days || '原則')}${cmInp('u_ent', '事業者記入欄番号', row.provider_entry_no || '1')}</div>
      <div class="row">${cmInp('u_cs', '契約開始', d(row.contract_start), 'date')}${cmInp('u_ce', '契約終了', d(row.contract_end), 'date')}${cmInp('u_ss', 'サービス開始', d(row.service_start), 'date')}</div>
      <label><input type="checkbox" id="u_meal" ${row.meal_addon !== false ? 'checked' : ''}> 食事提供体制加算の対象</label>
      <div><label class="l">送迎加算</label>${cmSel('u_tr', [['I', '送迎加算Ⅰ'], ['2', '送迎加算Ⅱ'], ['重度', '送迎加算（重度）'], ['なし', 'なし']], row.transport_class || '2')}</div>
      <button onclick="cmSaveUser('${id}')">保存</button>
      ${id === 'new' ? '' : `<button class="sec" onclick="cmDeleteUser('${id}')">削除</button>`}</div>`);
}
function cmNull(s) { s = String(s || '').trim(); return s ? s : null; }
async function cmSaveUser(id) {
  await cmGo(async () => {
    const name = cmV('u_name').trim();
    if (!name) throw new Error('氏名を入れてください');
    const body = {
      name, kana: cmNull(cmV('u_kana')), sort: Number(cmV('u_sort')) || 0, active: cmC('u_active'),
      recipient_no: cmNull(cmV('u_rec')), city_no: cmNull(cmV('u_city')), support_level: cmV('u_lv') === '' ? null : Number(cmV('u_lv')),
      cap_management: cmV('u_cap') || '無', cap_amount: Number(cmV('u_capamt')) || 0, cap_office_no: cmNull(cmV('u_capoff')),
      decision_code: cmV('u_dec').trim() || '221000', contract_days: cmV('u_qty').trim() || '原則', provider_entry_no: cmV('u_ent').trim() || '1',
      contract_start: cmNull(cmV('u_cs')), contract_end: cmNull(cmV('u_ce')), service_start: cmNull(cmV('u_ss')),
      meal_addon: cmC('u_meal'), transport_class: cmV('u_tr') || '2', updated_at: new Date().toISOString(),
    };
    if (id === 'new') await cmRest('chamu_users', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body) });
    else await cmRest('chamu_users?id=eq.' + id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body) });
    CM.st.edit = null; await cmUsersPage(); cmMsg('保存しました。', true);
  });
}
async function cmDeleteUser(id) {
  if (!confirm('この利用者を削除しますか？日誌や実績があると削除できません。そのときは「利用中」を外してください。')) return;
  await cmGo(async () => {
    await cmRest('chamu_users?id=eq.' + id, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    CM.st.edit = null; await cmUsersPage();
  });
}
