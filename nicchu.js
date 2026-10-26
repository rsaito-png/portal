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
  return await ncRest('nicchu_user?' + (all ? '' : 'active=eq.true&') + 'select=id,name,kana,active,sort&order=sort.asc,id.asc');
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
