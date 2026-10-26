// 日中一時支援（星心会レスパイトスタジオ）。#nicchu/log 一覧・その日の記録。
// 署名はポータルでは受けない（印刷して市役所へ出す）。金斗雲の訪問記録（kin_visit）とは別。
const NC = { month: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 7), shown: [], dayId: null, mem: null, flash: '', busy: false };
const NC_PLACE = '星心会レスパイトスタジオ（四日市市あさけが丘2-1-12）';
const NC_HELPERS = ['山川美恵子', '大坪シズカ', '齊藤連'];

/* nc-pure */
const NC_WEATHER = ['晴れ', 'くもり', '雨', '雪'];
const NC_TRANSPORT = ['往復', '迎えのみ', '送りのみ', 'なし'];
const NC_MEAL = ['あり', 'なし'];
function ncClip(s, n) { return String(s == null ? '' : s).trim().slice(0, n); }
function ncMin(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '').trim());
  if (!m) return NaN;
  const h = +m[1], min = +m[2];
  if (h > 23 || min > 59) return NaN;
  return h * 60 + min;
}
function ncWeekday(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ''));
  if (!m) return '';
  const y = +m[1], mo = +m[2], da = +m[3];
  const d = new Date(Date.UTC(y, mo - 1, da));
  if (d.getUTCFullYear() !== y || d.getUTCMonth() !== mo - 1 || d.getUTCDate() !== da) return '';
  return '日月火水木金土'.charAt(d.getUTCDay());
}
function ncFmtDay(d) {
  const w = ncWeekday(d);
  if (!w) return String(d || '');
  return `${+String(d).slice(5, 7)}/${+String(d).slice(8, 10)}（${w}）`;
}
function ncNextMonth(m) {
  return new Date(Date.UTC(+String(m).slice(0, 4), +String(m).slice(5, 7), 1)).toISOString().slice(0, 10);
}
function ncValidate(f) {
  const err = [];
  if (!f || typeof f !== 'object') return ['データがありません'];
  const staff = String(f.staff_name || '').trim();
  if (!staff) err.push('記入者を入れてください');
  else if (staff.length > 60) err.push('記入者は60文字以内にしてください');
  if (!ncWeekday(f.service_date)) err.push('日付が正しくありません');
  if (f.weather && NC_WEATHER.indexOf(f.weather) < 0) err.push('天気が正しくありません');
  if (String(f.meal_menu || '').trim().length > 500) err.push('本日の食事内容は500文字以内にしてください');
  if (String(f.general_notes || '').trim().length > 2000) err.push('全体申し送りは2000文字以内にしてください');
  const users = (f.users || []).filter(u => u && u.present);
  if (!users.length) err.push('利用した方が1人もいません');
  (f.users || []).forEach(u => {
    if (!u || !u.present) return;
    const n = (u.name || '利用者') + 'さん: ';
    const s = ncMin(u.start_time), e = ncMin(u.end_time);
    if (Number.isNaN(s)) err.push(n + '来所時刻を入れてください');
    if (Number.isNaN(e)) err.push(n + '退所時刻を入れてください');
    if (!Number.isNaN(s) && !Number.isNaN(e) && e <= s) err.push(n + '退所は来所より後にしてください');
    if (NC_TRANSPORT.indexOf(u.transport) < 0) err.push(n + '送迎を選んでください');
    if (NC_MEAL.indexOf(u.meal_served) < 0) err.push(n + '食事提供を選んでください');
    const activity = String(u.activity || '').trim(), state = String(u.state || '').trim();
    if (!activity) err.push(n + '活動内容を入れてください');
    else if (activity.length > 2000) err.push(n + '活動内容は2000文字以内にしてください');
    if (!state) err.push(n + 'ご様子を入れてください');
    else if (state.length > 2000) err.push(n + 'ご様子は2000文字以内にしてください');
  });
  return err;
}
function ncRecordBody(u) {
  const blank = { signer_kind: null, sign_reason: null, signature: null, sign_status: null, signed_at: null };
  if (!u.present) {
    return { user_id: u.user_id, present: false, start_time: null, end_time: null, transport: null, meal_served: null, activity: null, state: null, ...blank };
  }
  return {
    user_id: u.user_id, present: true, start_time: u.start_time, end_time: u.end_time, transport: u.transport, meal_served: u.meal_served,
    activity: ncClip(u.activity, 2000), state: ncClip(u.state, 2000), ...blank
  };
}
const NC_KUBUN = ['区分１', '区分２', '区分３'];
const NC_JISSEKI_ROWS = 20;
function ncReiwa(year) {
  const y = +year;
  if (y === 2019) return '元';
  if (y > 2019) return String(y - 2018);
  return '';
}
function ncJissekiMinutes(start, end) {
  const s = ncMin(start), e = ncMin(end);
  if (Number.isNaN(s) || Number.isNaN(e) || e <= s) return null;
  return e - s;
}
function ncJissekiBand(minutes) {
  if (minutes == null) return '';
  return minutes < 240 ? 'under' : 'over';
}
function ncJissekiMeal(v) { return v === 'あり' ? '1' : ''; }
function ncJissekiTransport(v) {
  if (v === '往復') return '2';
  if (v === '迎えのみ' || v === '送りのみ') return '1';
  return '';
}
function ncJissekiLines(records) {
  return (records || []).filter(r => r && r.present !== false && r.service_date).map(r => {
    const minutes = ncJissekiMinutes(r.start_time, r.end_time);
    return {
      date: r.service_date,
      dayLabel: (+String(r.service_date).slice(8, 10)) + '日',
      weekday: ncWeekday(r.service_date),
      start: String(r.start_time || '').slice(0, 5),
      end: String(r.end_time || '').slice(0, 5),
      minutes,
      band: ncJissekiBand(minutes),
      meal: ncJissekiMeal(r.meal_served),
      transport: ncJissekiTransport(r.transport)
    };
  }).filter(r => r.weekday).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
}
function ncJissekiSheet(records) {
  const lines = ncJissekiLines(records);
  const totals = { under: 0, over: 0, meal: 0, transport: 0 };
  lines.forEach(r => {
    if (r.band === 'under') totals.under++;
    if (r.band === 'over') totals.over++;
    if (r.meal) totals.meal += +r.meal;
    if (r.transport) totals.transport += +r.transport;
  });
  const pages = [];
  const n = Math.max(1, Math.ceil(lines.length / NC_JISSEKI_ROWS));
  for (let p = 0; p < n; p++) {
    const slice = lines.slice(p * NC_JISSEKI_ROWS, (p + 1) * NC_JISSEKI_ROWS);
    while (slice.length < NC_JISSEKI_ROWS) slice.push(null);
    pages.push(slice);
  }
  return { lines, totals, pages };
}
function ncJissekiMasterErrors(p) {
  const err = [];
  const no = String((p && p.recipient_no) || '').trim();
  const ono = String((p && p.office_no) || '').trim();
  const kubun = String((p && p.kubun) || '').trim();
  const quota = String((p && p.monthly_quota) == null ? '' : p.monthly_quota).trim();
  if (no && !/^[0-9]{1,10}$/.test(no)) err.push('受給者番号は10桁までの数字にしてください');
  if (ono && !/^[0-9]{1,10}$/.test(ono)) err.push('事業所番号は10桁までの数字にしてください');
  if (kubun && NC_KUBUN.indexOf(kubun) < 0) err.push('区分を選んでください');
  if (quota && (!/^\d+$/.test(quota) || +quota < 1 || +quota > 31)) err.push('支給量は1から31の回数にしてください');
  if (String((p && p.guardian_name) || '').trim().length > 100) err.push('保護者氏名は100文字以内にしてください');
  if (String((p && p.office_name) || '').trim().length > 200) err.push('事業所名は200文字以内にしてください');
  return err;
}
/* /nc-pure */

function ncIsDemo() { return typeof DEMO !== 'undefined' && DEMO; }
function ncToday() { return typeof today === 'function' ? today() : new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); }
function ncHashDate() {
  const q = (location.hash.split('?')[1] || '');
  const d = new URLSearchParams(q).get('d') || '';
  return ncWeekday(d) ? d : '';
}
function ncPt(s) { return `<small class="nc-pt">${esc(s)}</small>`; }
function ncDemoInit() {
  if (NC.mem) return;
  NC.mem = {
    users: [
      { id: 1, name: '利用者A', kana: 'りようしゃ えー', active: true, sort: 1 },
      { id: 2, name: '利用者B', kana: 'りようしゃ びー', active: true, sort: 2 }
    ],
    helpers: NC_HELPERS.map((name, i) => ({ id: i + 1, name, active: true, sort: i + 1 })),
    office: { office_no: '', office_name: '一般社団法人 心理社会的リハビリテーション・星心会\n星心会レスパイトスタジオ' },
    days: [], recs: [], seq: 10
  };
}
function ncCleanup() {}
function ncEnsureStyle() {
  if (document.getElementById('nc_style')) return;
  const st = document.createElement('style');
  st.id = 'nc_style';
  st.textContent = `.nc-card{background:#fff;border-radius:12px;padding:14px;margin:10px 0;box-shadow:0 1px 3px #0002}
.nc-card label{display:block;margin-top:8px}
.nc-row{display:flex;justify-content:space-between;gap:8px;align-items:center}
.nc-row label{display:flex;align-items:center;gap:6px;margin:0;width:auto}
.nc-card textarea,.nc-card select{width:100%;box-sizing:border-box;font-size:17px;padding:10px;border:1px solid #bbb;border-radius:8px}
.nc-pt{display:block;color:#777;font-size:12px;font-weight:normal}
.nc-chips{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}
button.nc-chip,button.nc-mini{width:auto;display:inline-block;margin:4px 4px 4px 0;padding:8px 12px;background:#fff;color:#222;border:1px solid #bbb;border-radius:999px}
button.nc-chip.on{background:var(--main);color:#fff;border-color:var(--main)}
.nc-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.nc-msg{white-space:pre-wrap;color:#c00}
.nc-ok{color:#2e6b4f}
.nc-form{font-family:"Hiragino Mincho ProN","Yu Mincho","MS PMincho",serif;color:#000;background:#fff;padding:8px 4px;overflow-x:auto}
.nc-form h2{font-size:16px;text-align:center;margin:4px 0 8px;font-weight:normal}
.nc-form .nc-era{text-align:right;font-size:14px;margin:0 0 6px}
.nc-form .nc-sub{font-size:11px;margin:0}
.nc-form table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:11px;background:#fff}
.nc-form td{border:1px solid #222;padding:2px 3px;text-align:center;vertical-align:middle;line-height:1.25}
.nc-form td.lab{font-size:10px;background:#fff}
.nc-form td.nm{text-align:left;white-space:pre-wrap}
.nc-form .digits{display:flex}
.nc-form .digits i{flex:1;border-left:1px solid #222;font-style:normal;min-height:1.4em}
.nc-form .digits i:first-child{border-left:0}
.nc-ring{border:1.5px solid #000;border-radius:10px;padding:0 3px}
.nc-sheet{margin:0 0 16px}
@media print{
  header,.noprint,#out{display:none!important}
  body{background:#fff!important}
  main,#home,#view{max-width:none!important;padding:0!important;margin:0!important}
  .nc-sheet{page-break-after:always}
  .nc-sheet:last-child{page-break-after:auto}
}
@page{size:A4 portrait;margin:8mm}
`;
  document.head.appendChild(st);
}
async function ncRest(path, opt, retried) {
  let s = JSON.parse(localStorage.getItem('sess') || '{}');
  if (s.exp && s.exp < Date.now() + 30000 && !retried && typeof refreshSess === 'function') {
    if (await refreshSess()) s = JSON.parse(localStorage.getItem('sess') || '{}');
  }
  const r = await fetch(C.supabaseUrl + '/rest/v1/' + path, { ...opt, headers: { apikey: C.supabaseKey, Authorization: 'Bearer ' + (s.token || ''), 'Content-Type': 'application/json', Prefer: 'return=representation', ...(opt && opt.headers || {}) } });
  if (r.status === 401 && !retried && typeof refreshSess === 'function' && await refreshSess()) return ncRest(path, opt, true);
  if (!r.ok) {
    let msg = '読み込めませんでした（' + r.status + '）';
    try { const j = await r.json(); if (j.message) msg = j.message; if (j.code) msg += ' ' + j.code; } catch (e) { /* 本文なし */ }
    if (r.status === 401 || r.status === 403 || /row-level security/i.test(msg)) msg = 'この操作は日中一時支援の担当職員だけができます。';
    else if (/nicchu_record_|check constraint|23514/i.test(msg)) msg = '入力が不足しています。来所・退所・送迎・食事・活動・ご様子を確認してください。';
    throw new Error(msg);
  }
  if (r.status === 204) return null;
  const tx = await r.text();
  if (!tx) return null;
  return JSON.parse(tx);
}
async function ncCan() { return (await ncRest('rpc/nicchu_can', { method: 'POST', body: '{}' })) === true; }
function ncDenied() {
  return `<div class="nc-card"><p>日中一時支援の記録は、担当の職員と、事務・管理者・児発管・会長が読み書きできます。</p>${ncPt('担当にするには、管理者に staff_profiles の nicchu を有効にしてもらってください。')}</div>`;
}
function ncDemoNote() { return ncIsDemo() ? `<p class="nc-pt">見本モードです。この端末の中だけに残り、サーバには保存しません。</p>` : ''; }
async function ncUsers(all) {
  if (ncIsDemo()) { ncDemoInit(); return NC.mem.users.filter(u => all || u.active).slice().sort((a, b) => a.sort - b.sort || a.id - b.id); }
  return await ncRest('nicchu_user?' + (all ? '' : 'active=eq.true&') + 'select=id,name,kana,active,sort,recipient_no,kubun,monthly_quota,guardian_name&order=sort.asc,id.asc');
}
async function ncHelpers() {
  if (ncIsDemo()) { ncDemoInit(); return NC.mem.helpers.filter(h => h.active).slice(); }
  return await ncRest('nicchu_helper?active=eq.true&select=id,name,sort&order=sort.asc,id.asc');
}
async function ncHelperNames() {
  return (await ncHelpers()).map(h => h.name);
}
function ncNormDay(d) { return d ? { ...d, records: d.records || d.nicchu_record || [] } : null; }
async function ncMonth(m) {
  const next = ncNextMonth(m);
  if (ncIsDemo()) {
    ncDemoInit();
    return NC.mem.days.filter(d => d.service_date >= m + '-01' && d.service_date < next).sort((a, b) => a.service_date < b.service_date ? 1 : -1).map(d => ({ ...d, records: NC.mem.recs.filter(r => r.day_id === d.id) }));
  }
  const rows = await ncRest(`nicchu_day?service_date=gte.${m}-01&service_date=lt.${next}&select=id,service_date,staff_name,weather,nicchu_record(user_id,present,start_time,end_time,transport)&order=service_date.desc`);
  return rows.map(ncNormDay);
}
async function ncGetDay(date) {
  if (ncIsDemo()) {
    ncDemoInit();
    const day = NC.mem.days.find(d => d.service_date === date);
    return day ? { ...day, records: NC.mem.recs.filter(r => r.day_id === day.id) } : null;
  }
  const rows = await ncRest(`nicchu_day?service_date=eq.${date}&select=id,service_date,staff_name,weather,meal_menu,general_notes,nicchu_record(id,user_id,present,start_time,end_time,transport,meal_served,activity,state)`);
  return rows.length ? ncNormDay(rows[0]) : null;
}
async function ncSaveDay(form) {
  const errs = ncValidate(form);
  if (errs.length) return { ok: false, errs };
  const staff = ncClip(form.staff_name, 60);
  const dayBody = { service_date: form.service_date, staff_name: staff, weather: form.weather || null, meal_menu: ncClip(form.meal_menu, 500) || null, general_notes: ncClip(form.general_notes, 2000) || null, updated_at: new Date().toISOString() };
  if (ncIsDemo()) {
    ncDemoInit();
    let day = NC.mem.days.find(d => d.service_date === form.service_date);
    if (!day) { day = { id: ++NC.mem.seq, service_date: form.service_date }; NC.mem.days.push(day); }
    Object.assign(day, dayBody);
    form.users.forEach(u => {
      const body = ncRecordBody(u);
      let rec = NC.mem.recs.find(r => r.day_id === day.id && r.user_id === u.user_id);
      if (!rec) { rec = { id: ++NC.mem.seq, day_id: day.id }; NC.mem.recs.push(rec); }
      Object.assign(rec, body);
    });
    return { ok: true };
  }
  const dayRows = await ncRest('nicchu_day?on_conflict=service_date', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify(dayBody) });
  const day = dayRows[0];
  for (let i = 0; i < form.users.length; i++) {
    const body = ncRecordBody(form.users[i]);
    await ncRest('nicchu_record?on_conflict=day_id,user_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify({ day_id: day.id, ...body, updated_at: new Date().toISOString() }) });
  }
  return { ok: true };
}
async function ncDeleteDay(id) {
  if (ncIsDemo()) { ncDemoInit(); NC.mem.days = NC.mem.days.filter(d => d.id !== id); NC.mem.recs = NC.mem.recs.filter(r => r.day_id !== id); return; }
  await ncRest('nicchu_day?id=eq.' + id, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
}
async function ncAddUser(name, kana) {
  name = ncClip(name, 100); kana = ncClip(kana, 100);
  if (!name) throw new Error('氏名を入れてください');
  if (ncIsDemo()) {
    ncDemoInit();
    if (NC.mem.users.some(u => u.name === name)) throw new Error('同じ名前がすでにあります');
    NC.mem.users.push({ id: ++NC.mem.seq, name, kana, active: true, sort: 100 });
    return;
  }
  try {
    await ncRest('nicchu_user', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ name, kana: kana || null, sort: 100 }) });
  } catch (e) {
    if (/duplicate|23505|unique/i.test(e.message)) throw new Error('同じ名前がすでにあります');
    throw e;
  }
}
async function ncUserActive(id, active) {
  if (!active && !confirm('この利用者を休止にしますか？過去の記録は残ります。')) return;
  if (ncIsDemo()) { ncDemoInit(); const u = NC.mem.users.find(x => x.id === id); if (u) u.active = active; }
  else await ncRest('nicchu_user?id=eq.' + id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ active: active, updated_at: new Date().toISOString() }) });
  renderNicchu();
}
function ncChips(name, values, current) {
  return `<div class="nc-chips">${values.map(v => `<button type="button" class="nc-chip${v === current ? ' on' : ''}" data-name="${esc(name)}" data-value="${esc(v)}" onclick="ncChipClick(this)">${esc(v)}</button>`).join('')}</div>`;
}
function ncChipClick(btn) {
  const name = btn.dataset.name;
  document.querySelectorAll('.nc-chip').forEach(b => { if (b.dataset.name === name) b.classList.toggle('on', b === btn); });
}
function ncVal(name) {
  const all = document.querySelectorAll('.nc-chip');
  for (let i = 0; i < all.length; i++) if (all[i].dataset.name === name && all[i].classList.contains('on')) return all[i].dataset.value;
  return '';
}
function ncPresentUI(uid) {
  const body = document.getElementById('body_' + uid), box = document.getElementById('p_' + uid);
  if (body && box) body.hidden = !box.checked;
}
function ncUserAdmin(users) {
  const active = users.filter(u => u.active), off = users.filter(u => !u.active);
  return `<details class="nc-card"><summary>利用者（${active.length}人）</summary>
    ${active.map(u => `<p>${esc(u.name)} ${ncPt(u.kana || '')}<button type="button" class="nc-mini" onclick="ncUserActive(${u.id}, false)">休止</button></p>`).join('') || '<p>まだいません。下から追加してください。</p>'}
    ${off.map(u => `<p>${esc(u.name)} <button type="button" class="nc-mini" onclick="ncUserActive(${u.id}, true)">再開</button></p>`).join('')}
    <label>氏名<input id="nc_new_name" maxlength="100" placeholder="氏名"></label>
    <label>ふりがな<input id="nc_new_kana" maxlength="100" placeholder="ふりがな"></label>
    <button type="button" onclick="ncAddUserClick()">利用者を追加</button><p id="nc_user_msg" class="nc-msg"></p></details>`;
}
async function ncAddUserClick() {
  const msg = document.getElementById('nc_user_msg');
  try { await ncAddUser(document.getElementById('nc_new_name').value, document.getElementById('nc_new_kana').value); renderNicchu(); }
  catch (e) { if (msg) msg.textContent = e.message; }
}
function ncOpenDate() {
  const d = document.getElementById('nc_open_date').value;
  if (!ncWeekday(d)) { alert('日付を選んでください'); return; }
  location.hash = 'nicchu/log?d=' + d;
}
function ncPerson(u, rec) {
  const id = u.id;
  const present = rec ? !!rec.present : true;
  const start = rec && rec.start_time ? String(rec.start_time).slice(0, 5) : '07:00';
  const end = rec && rec.end_time ? String(rec.end_time).slice(0, 5) : '13:00';
  const transport = rec && rec.transport || '往復';
  const meal = rec && rec.meal_served || 'あり';
  return `<div class="nc-card"><div class="nc-row"><div><b>${esc(u.name)} さん</b>${ncPt(u.kana || '')}</div>
    <label><input id="p_${id}" type="checkbox" style="width:auto" ${present ? 'checked' : ''} onchange="ncPresentUI(${id})"> 利用あり</label></div>
    <div id="body_${id}" ${present ? '' : 'hidden'}>
      <div class="nc-grid"><label>来所 ${ncPt('Entrada')}<input id="st_${id}" type="time" value="${esc(start)}"></label><label>退所 ${ncPt('Saída')}<input id="en_${id}" type="time" value="${esc(end)}"></label></div>
      <div>送迎 ${ncPt('Transporte')}${ncChips('tr_' + id, NC_TRANSPORT, transport)}</div>
      <div>食事提供 ${ncPt('Refeição')}${ncChips('ml_' + id, NC_MEAL, meal)}</div>
      <label>活動内容 ${ncPt('Atividades')}<textarea id="ac_${id}" rows="3">${esc(rec && rec.activity || '')}</textarea></label>
      <label>ご様子 ${ncPt('Estado')}<textarea id="stt_${id}" rows="3">${esc(rec && rec.state || '')}</textarea></label>
    </div></div>`;
}
function ncReadForm() {
  return {
    service_date: NC.editDate, staff_name: document.getElementById('nc_staff').value, weather: ncVal('weather'), meal_menu: document.getElementById('nc_menu').value, general_notes: document.getElementById('nc_notes').value,
    users: NC.shown.map(u => ({
      user_id: u.id, name: u.name, present: document.getElementById('p_' + u.id).checked,
      start_time: document.getElementById('st_' + u.id).value, end_time: document.getElementById('en_' + u.id).value,
      transport: ncVal('tr_' + u.id), meal_served: ncVal('ml_' + u.id), activity: document.getElementById('ac_' + u.id).value, state: document.getElementById('stt_' + u.id).value
    }))
  };
}
async function ncSaveClick() {
  const msg = document.getElementById('nc_msg');
  if (NC.busy) return;
  NC.busy = true;
  try {
    const res = await ncSaveDay(ncReadForm());
    if (!res.ok) { msg.textContent = res.errs.join('\n'); return; }
    try { localStorage.setItem('nicchu.staff', ncClip(document.getElementById('nc_staff').value, 60)); } catch (e) { /* 端末に残せなくても保存は済んでいる */ }
    NC.flash = '保存しました';
    if (location.hash.split('?')[0] === '#nicchu/log' && !ncHashDate()) renderNicchu();
    else location.hash = 'nicchu/log';
  } catch (e) { msg.textContent = e.message; }
  finally { NC.busy = false; }
}
async function ncDeleteClick() {
  if (!NC.dayId || !confirm('この日の記録を削除しますか？')) return;
  try { await ncDeleteDay(NC.dayId); NC.flash = '削除しました'; location.hash = 'nicchu/log'; } catch (e) { document.getElementById('nc_msg').textContent = e.message; }
}
async function ncPaintList() {
  const [days, users] = await Promise.all([ncMonth(NC.month), ncUsers(true)]);
  const nm = {};
  users.forEach(u => { nm[u.id] = u.name; });
  const cards = days.map(d => `<div class="nc-card"><b>${esc(ncFmtDay(d.service_date))}</b>　記入 ${esc(d.staff_name)}
    ${(d.records || []).map(r => `<div>${esc(nm[r.user_id] || '')}　${r.present ? `${esc(String(r.start_time || '').slice(0, 5))}〜${esc(String(r.end_time || '').slice(0, 5))} ${esc(r.transport || '')}` : '利用なし'}</div>`).join('') || '<div class="nc-pt">利用者の行がありません</div>'}
    <button type="button" class="nc-mini" onclick="location.hash='nicchu/log?d=${d.service_date}'">開く</button></div>`).join('');
  const flash = NC.flash ? `<p class="nc-ok">${esc(NC.flash)}</p>` : '';
  NC.flash = '';
  document.getElementById('view').innerHTML = `<button class="back" type="button" onclick="location.hash='nicchu'">← 日中一時支援へ</button>
    <h3 style="color:#1f7a6b">日中一時支援</h3>
    <p class="nc-pt">${esc(NC_PLACE)}　ふだん 7:00–13:00。どの曜日でも記録できます。金斗雲の訪問記録とは別です。署名は受け取らず、印刷して市役所へ出します。</p>
    ${ncDemoNote()}${flash}
    <div class="nc-card"><label>月<input type="month" id="nc_month" value="${esc(NC.month)}" onchange="NC.month=this.value||NC.month;renderNicchu()"></label>
      <label>この日を書く<input type="date" id="nc_open_date" value="${esc(ncToday())}"></label>
      <button type="button" onclick="ncOpenDate()">この日の記録</button></div>
    ${cards || '<p>この月の記録はありません。</p>'}
    ${ncUserAdmin(users)}`;
}
async function ncPaintEdit(date) {
  const [users, names, day] = await Promise.all([ncUsers(true), ncHelperNames(), ncGetDay(date)]);
  const recs = day ? day.records : [];
  const byId = {};
  users.forEach(u => { byId[u.id] = u; });
  const shown = users.filter(u => u.active);
  recs.forEach(r => { if (!shown.some(u => u.id === r.user_id) && byId[r.user_id]) shown.push(byId[r.user_id]); });
  shown.sort((a, b) => a.sort - b.sort || a.id - b.id);
  NC.shown = shown;
  NC.editDate = date;
  NC.dayId = day ? day.id : null;
  const staffNames = names.slice();
  if (day && day.staff_name && staffNames.indexOf(day.staff_name) < 0) staffNames.push(day.staff_name);
  let picked = day ? day.staff_name : '';
  if (!picked) { try { picked = localStorage.getItem('nicchu.staff') || ''; } catch (e) { picked = ''; } }
  if (staffNames.indexOf(picked) < 0) picked = '';
  const w = ncWeekday(date);
  document.getElementById('view').innerHTML = `<button class="back" type="button" onclick="location.hash='nicchu/log'">← 一覧へ</button>
    <h3 style="color:#1f7a6b">${esc(ncFmtDay(date))}の支援記録</h3>
    <p class="nc-pt">${esc(NC_PLACE)}${w === '日' ? '' : '　日曜以外でも保存できます。'}　印刷して市役所へ出します。</p>${ncDemoNote()}
    ${shown.length ? `<div class="nc-card">
      <label>記入者 ${ncPt('Funcionário')}<select id="nc_staff"><option value="">選んでください</option>${staffNames.map(n => `<option value="${esc(n)}" ${n === picked ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
      <div>天気 ${ncPt('Tempo')}${ncChips('weather', NC_WEATHER, day && day.weather || '')}</div>
      <label>本日の食事内容 ${ncPt('Cardápio')}<textarea id="nc_menu" rows="2">${esc(day && day.meal_menu || '')}</textarea></label>
      <label>全体申し送り ${ncPt('Recados')}<textarea id="nc_notes" rows="2">${esc(day && day.general_notes || '')}</textarea></label>
    </div>
    ${shown.map(u => ncPerson(u, recs.find(r => r.user_id === u.id))).join('')}
    <p><button type="button" onclick="ncSaveClick()">保存</button> ${day ? '<button type="button" class="back" onclick="ncDeleteClick()">この日を削除</button>' : ''}</p>` : `<div class="nc-card"><p>利用者がまだいません。追加してから、この日の記録を書いてください。</p></div>`}
    <p id="nc_msg" class="nc-msg"></p>
    ${shown.length ? '<p class="nc-pt">利用者の追加・休止は、一覧の下でできます。</p>' : ncUserAdmin(users)}`;
}
async function renderNicchu() {
  ncEnsureStyle();
  const back = `<button class="back" type="button" onclick="location.hash='nicchu'">← 日中一時支援へ</button>`;
  document.getElementById('view').innerHTML = back + '<p>読み込み中…</p>';
  try {
    if (!ncIsDemo() && !(await ncCan())) { document.getElementById('view').innerHTML = back + ncDenied(); return; }
    const d = ncHashDate();
    if (d) await ncPaintEdit(d);
    else await ncPaintList();
  } catch (e) { document.getElementById('view').innerHTML = back + `<p>${esc(e.message)}</p>`; }
}
async function renderNicchuSign() {
  ncEnsureStyle();
  const back = `<button class="back" type="button" onclick="location.hash='nicchu'">← 日中一時支援へ</button>`;
  document.getElementById('view').innerHTML = `${back}<h3 style="color:#1f7a6b">日中一時支援</h3>
    <div class="nc-card"><p>署名はポータルでは受け付けていません。記録を印刷して、市役所へ提出します。</p>
    <p><button type="button" class="nc-mini" onclick="location.hash='nicchu/log'">支援記録へ</button></p></div>`;
}
function ncDemoOffice() {
  ncDemoInit();
  if (!NC.mem.office) NC.mem.office = { office_no: '', office_name: '一般社団法人 心理社会的リハビリテーション・星心会\n星心会レスパイトスタジオ' };
  return NC.mem.office;
}
async function ncOffice() {
  if (ncIsDemo()) return ncDemoOffice();
  const rows = await ncRest('nicchu_office?id=eq.1&select=office_no,office_name');
  return (rows && rows[0]) || { office_no: '', office_name: '' };
}
async function ncJissekiRecords(month, userId) {
  const next = ncNextMonth(month);
  if (ncIsDemo()) {
    ncDemoInit();
    return NC.mem.recs.filter(r => r.user_id === userId && r.present).map(r => {
      const day = NC.mem.days.find(d => d.id === r.day_id);
      return day ? { service_date: day.service_date, start_time: r.start_time, end_time: r.end_time, transport: r.transport, meal_served: r.meal_served, present: true } : null;
    }).filter(r => r && r.service_date >= month + '-01' && r.service_date < next);
  }
  const rows = await ncRest('nicchu_record?user_id=eq.' + userId + '&present=eq.true&select=start_time,end_time,transport,meal_served,nicchu_day!inner(service_date)&nicchu_day.service_date=gte.' + month + '-01&nicchu_day.service_date=lt.' + next);
  return (rows || []).map(r => ({ service_date: (r.nicchu_day || {}).service_date, start_time: r.start_time, end_time: r.end_time, transport: r.transport, meal_served: r.meal_served, present: true }));
}
function ncHm(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || ''));
  return m ? [String(+m[1]), m[2]] : ['', ''];
}
function ncFw(s) { return String(s == null ? '' : s).replace(/\d/g, d => '０１２３４５６７８９'[d]); }
function ncDigits(s) {
  const chars = String(s || '').replace(/\D/g, '').slice(0, 10).split('');
  while (chars.length < 10) chars.push('');
  return `<div class="digits">${chars.map(c => `<i>${esc(c)}</i>`).join('')}</div>`;
}
function ncBandCell(band) {
  const under = band === 'under' ? 'nc-ring' : '', over = band === 'over' ? 'nc-ring' : '';
  return `<span class="${under}">4時間未満</span>　／　<span class="${over}">4時間以上</span>`;
}
function ncJissekiDoc(sheet, head) {
  const names = (head.guardian ? head.guardian + '\n' : '') + (head.child || '');
  const quota = head.quota ? `${ncFw(head.quota)}　回／月` : '　　回／月';
  const totalBand = sheet.lines.length ? `${ncFw(sheet.totals.under)}　／　${ncFw(sheet.totals.over)}` : '／';
  return sheet.pages.map((page, pi) => `<section class="nc-sheet">
    <p class="nc-sub">第８号様式（第１０条関係）${sheet.pages.length > 1 ? '　' + (pi + 1) + '／' + sheet.pages.length : ''}</p>
    <h2>四日市市障害者（児）日中一時支援サービス提供実績記録票</h2>
    <p class="nc-era">令和 ${esc(ncFw(head.reiwa))} 年　${esc(ncFw(head.month))}　月 分</p>
    <table>
      <colgroup><col style="width:18%"><col style="width:28%"><col style="width:10%"><col style="width:14%"><col style="width:12%"><col style="width:18%"></colgroup>
      <tr><td class="lab">受給者番号</td><td>${ncDigits(head.recipientNo)}</td><td class="lab">区分</td><td>${esc(head.kubun || '')}</td><td class="lab">事業所番号</td><td>${ncDigits(head.officeNo)}</td></tr>
      <tr><td class="lab">支給決定障害者（保護者）氏名（児童氏名）</td><td class="nm">${esc(names)}</td><td class="lab">支給量</td><td>${esc(quota)}</td><td class="lab">事業者及びその事業所の名称</td><td class="nm">${esc(head.officeName || '')}</td></tr>
    </table>
    <table style="margin-top:6px">
      <colgroup><col style="width:8%"><col style="width:6%"><col style="width:7%"><col style="width:3%"><col style="width:7%"><col style="width:7%"><col style="width:3%"><col style="width:7%"><col style="width:28%"><col style="width:8%"><col style="width:6%"><col style="width:5%"><col style="width:5%"></colgroup>
      <tr><td class="lab" colspan="2">実施日</td><td class="lab" colspan="6">利用時間</td><td class="lab">時間数（いずれかに○）</td><td class="lab">食事提供</td><td class="lab">送迎</td><td class="lab">入浴</td><td class="lab">利用者確認印</td></tr>
      <tr><td class="lab">日付</td><td class="lab">曜日</td><td class="lab" colspan="3">開始時間</td><td class="lab" colspan="3">終了時間</td><td></td><td></td><td></td><td></td><td></td></tr>
      ${page.map(r => {
        const sh = ncHm(r && r.start), eh = ncHm(r && r.end);
        return `<tr><td>${r ? esc(ncFw(r.dayLabel)) : ''}</td><td>${r ? esc(r.weekday) : ''}</td><td>${esc(ncFw(sh[0]))}</td><td>：</td><td>${esc(ncFw(sh[1]))}</td><td>${esc(ncFw(eh[0]))}</td><td>：</td><td>${esc(ncFw(eh[1]))}</td><td>${ncBandCell(r && r.band)}</td><td>${r ? esc(r.meal) : ''}</td><td>${r ? esc(r.transport) : ''}</td><td></td><td></td></tr>`;
      }).join('')}
      <tr><td class="lab" colspan="8">合　　計</td><td>${esc(totalBand)}</td><td>${sheet.totals.meal ? esc(ncFw(sheet.totals.meal)) : ''}</td><td>${sheet.totals.transport ? esc(ncFw(sheet.totals.transport)) : ''}</td><td></td><td></td></tr>
    </table>
  </section>`).join('');
}
async function ncSaveJissekiMaster() {
  const msg = document.getElementById('nc_msg');
  const profile = {
    recipient_no: document.getElementById('nc_recv').value.trim(),
    kubun: document.getElementById('nc_kubun').value,
    monthly_quota: document.getElementById('nc_quota').value.trim(),
    guardian_name: document.getElementById('nc_guard').value.trim(),
    office_no: document.getElementById('nc_offno').value.trim(),
    office_name: document.getElementById('nc_offname').value.trim()
  };
  const errs = ncJissekiMasterErrors(profile);
  if (errs.length) { msg.textContent = errs.join('\n'); return; }
  const quota = profile.monthly_quota ? +profile.monthly_quota : null;
  try {
    if (ncIsDemo()) {
      ncDemoInit();
      const u = NC.mem.users.find(x => x.id === NC.jissekiUid);
      if (u) Object.assign(u, { recipient_no: profile.recipient_no, kubun: profile.kubun, monthly_quota: quota, guardian_name: profile.guardian_name });
      Object.assign(ncDemoOffice(), { office_no: profile.office_no, office_name: profile.office_name });
    } else {
      await ncRest('nicchu_user?id=eq.' + NC.jissekiUid, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ recipient_no: profile.recipient_no || null, kubun: profile.kubun || null, monthly_quota: quota, guardian_name: profile.guardian_name || null, updated_at: new Date().toISOString() }) });
      await ncRest('nicchu_office?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ id: 1, office_no: profile.office_no || null, office_name: profile.office_name || null, updated_at: new Date().toISOString() }) });
    }
    NC.flash = '請求の情報を保存しました';
    renderNicchuJisseki();
  } catch (e) { msg.textContent = e.message; }
}
async function renderNicchuJisseki() {
  ncEnsureStyle();
  document.body.classList.add('wide-sheet');
  const back = `<button class="back noprint" type="button" onclick="location.hash='nicchu'">← 日中一時支援へ</button>`;
  document.getElementById('view').innerHTML = back + '<p>読み込み中…</p>';
  try {
    if (!ncIsDemo() && !(await ncCan())) { document.getElementById('view').innerHTML = back + ncDenied(); return; }
    const users = (await ncUsers(true)).slice().sort((a, b) => a.sort - b.sort || a.id - b.id);
    if (!users.length) { document.getElementById('view').innerHTML = back + '<div class="nc-card"><p>利用者がまだいません。支援記録の一覧から追加してください。</p></div>'; return; }
    if (!users.some(u => u.id === NC.jissekiUid)) NC.jissekiUid = (users.find(u => u.active) || users[0]).id;
    const user = users.find(u => u.id === NC.jissekiUid);
    const office = await ncOffice();
    const records = await ncJissekiRecords(NC.month, user.id);
    const sheet = ncJissekiSheet(records);
    const y = +NC.month.slice(0, 4), mo = +NC.month.slice(5, 7);
    const flash = NC.flash ? `<p class="nc-ok">${esc(NC.flash)}</p>` : '';
    NC.flash = '';
    document.getElementById('view').innerHTML = `${back}
      <div class="noprint"><h3 style="color:#1f7a6b">実績記録票（第８号様式）</h3>
      <p class="nc-pt">紙に印刷して、市役所へ郵送します。電子提出でも、ポータル上の署名でもありません。利用者確認印は空欄です（あとから押します）。入浴の欄は記録にないので空欄です。</p>
      ${ncDemoNote()}${flash}
      <div class="nc-card">
        <label>利用者<select id="nc_ju" onchange="NC.jissekiUid=+this.value;renderNicchuJisseki()">${users.map(u => `<option value="${u.id}" ${u.id === user.id ? 'selected' : ''}>${esc(u.name)}${u.active ? '' : '（休止）'}</option>`).join('')}</select></label>
        <label>月<input type="month" value="${esc(NC.month)}" onchange="NC.month=this.value||NC.month;renderNicchuJisseki()"></label>
        <p><button type="button" onclick="window.print()">印刷 / PDF保存</button></p>
        <p class="nc-pt">印刷ダイアログで A4・縦、「PDFに保存」を選べます。${sheet.lines.length ? sheet.lines.length + '日分を入れています。' : 'この月の利用はありません。'}${sheet.pages.length > 1 ? '1枚に20行までなので、次のページに続きます。' : ''}</p>
      </div>
      <details class="nc-card"><summary>請求に書く情報（一度入れれば残ります）</summary>
        <label>受給者番号<input id="nc_recv" inputmode="numeric" maxlength="10" value="${esc(user.recipient_no || '')}" placeholder="10桁までの数字"></label>
        <label>区分<select id="nc_kubun"><option value="">未設定</option>${NC_KUBUN.map(k => `<option ${user.kubun === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
        <label>支給量（回／月）<input id="nc_quota" type="number" min="1" max="31" value="${user.monthly_quota || ''}"></label>
        <label>保護者氏名（児童と別に書くとき）<input id="nc_guard" maxlength="100" value="${esc(user.guardian_name || '')}"></label>
        <label>事業所番号<input id="nc_offno" inputmode="numeric" maxlength="10" value="${esc(office.office_no || '')}" placeholder="10桁までの数字"></label>
        <label>事業者及びその事業所の名称<textarea id="nc_offname" rows="2" maxlength="200">${esc(office.office_name || '')}</textarea></label>
        <button type="button" onclick="ncSaveJissekiMaster()">この情報を保存</button>
        <p id="nc_msg" class="nc-msg"></p>
      </details></div>
      <div class="nc-form">${ncJissekiDoc(sheet, { reiwa: ncReiwa(y), month: String(mo), recipientNo: user.recipient_no || '', kubun: user.kubun || '', quota: user.monthly_quota || '', guardian: user.guardian_name || '', child: user.name || '', officeNo: office.office_no || '', officeName: office.office_name || '' })}</div>`;
  } catch (e) { document.getElementById('view').innerHTML = back + `<p>${esc(e.message)}</p>`; }
}
