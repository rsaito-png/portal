// 出退勤打刻（#dakoku）。スマホ向け。出勤・退勤だけ。
// シートへの書き込みは GAS ウェブアプリ経由（config.js の dakoku.gasUrl / dakoku.token）。秘密鍵は置かない。
// ログインは法人ポータルの sess。メールが職員シートと一致すれば本人、空欄なら名前を選ぶ暫定。
const DK = { data: null, office: '', staffId: '', pos: null, posError: '', locating: false, msg: '', bad: false, busy: false, recent: [], sess: { email: '', demo: false } };
let DK_LOC_SEQ = 0;

(function () {
  if (document.getElementById('dk_css')) return;
  const st = document.createElement('style');
  st.id = 'dk_css';
  st.textContent = `.dk h3{color:#3a7bd5}.dk select{font-size:18px;width:100%;box-sizing:border-box;padding:12px;margin:6px 0;border-radius:8px;border:1px solid #bbb;background:#fff}
.dk .go{font-size:22px;padding:18px;margin-top:8px;scroll-margin-bottom:96px}.dk .go:disabled{opacity:.45}.dk .out{background:#3a7bd5}.dk .loc{background:#fff;color:#333;border:1px solid #bbb}
.dk .okb{background:#e6f4ea;border-radius:8px;padding:10px;margin:8px 0;font-size:16px;line-height:1.4}.dk .ng{background:#fde8e8;border-radius:8px;padding:10px;margin:8px 0;font-size:16px;line-height:1.4}.dk .wn{background:#fff6d6;border-radius:8px;padding:10px;margin:8px 0;font-size:15px;line-height:1.4}
.dk .meta{color:#555;font-size:15px}.dk ul{padding-left:1.2em;margin:6px 0}`;
  document.head.appendChild(st);
})();

const dkEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function dkSession() {
  if (typeof DEMO !== 'undefined' && DEMO) return { email: '', demo: true };
  try {
    const s = JSON.parse(localStorage.getItem('sess') || 'null');
    return { email: (s && s.email) || '', demo: false };
  } catch (e) { return { email: '', demo: false }; }
}
function dkCfg() {
  const c = (window.PORTAL_CONFIG && window.PORTAL_CONFIG.dakoku) || {};
  return { gasUrl: String(c.gasUrl || '').trim(), token: String(c.token || '').trim() };
}
function dkRemember(office, email, id) {
  try { sessionStorage.setItem('dakoku:' + office + ':' + email, id); } catch (e) { /* 記憶できなくても打刻はできる */ }
}
function dkRecall(office, email) {
  try { return sessionStorage.getItem('dakoku:' + office + ':' + email) || ''; } catch (e) { return ''; }
}
function dkJson(text) {
  const t = String(text || '').replace(/^\)\]\}',?\n/, '').trim();
  try { return JSON.parse(t); } catch (e) { return null; }
}
function dkWrong(action, j) {
  if (!j) return true;
  if (action === 'punch') return !j.at && !j.error;
  if (action === 'recent') return !j.rows && !j.error;
  return !j.offices && !j.error;
}
// GAS は OPTIONS に答えない。POST は text/plain（単純リクエスト）。302 で中身が落ちたら GET に落とす。
async function dkRpc(payload) {
  const c = dkCfg();
  if (!c.gasUrl || !c.token) throw new Error('打刻の接続先が未設定です。GASをデプロイし、config.js の dakoku.gasUrl と dakoku.token を入れてください。');
  const full = Object.assign({}, payload, { token: c.token });
  let text = '';
  try {
    const r = await fetch(c.gasUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(full) });
    text = await r.text();
  } catch (e) { text = ''; }
  let j = dkJson(text);
  if (dkWrong(payload.action, j)) {
    const q = new URLSearchParams();
    Object.keys(full).forEach(k => { if (full[k] !== undefined && full[k] !== null) q.set(k, String(full[k])); });
    const join = c.gasUrl.indexOf('?') >= 0 ? '&' : '?';
    const r = await fetch(c.gasUrl + join + q.toString(), { method: 'GET' });
    text = await r.text();
    j = dkJson(text);
  }
  if (!j) {
    if (/accounts\.google\.com|ServiceLogin|ログイン/.test(text)) throw new Error('GASの公開範囲が「全員」になっているか確認してください。');
    throw new Error('打刻サーバーの応答を読めませんでした。');
  }
  if (!j.ok) throw new Error(j.error || '失敗しました');
  return j;
}
function dkGeo() {
  return new Promise((resolve, reject) => {
    if (!window.isSecureContext) { reject(new Error('位置情報は https（または localhost）で開いたときだけ使えます。')); return; }
    if (!navigator.geolocation) { reject(new Error('このブラウザは位置情報に対応していません。')); return; }
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      e => reject(new Error(e && e.code === 1 ? '位置情報の許可が必要です。ブラウザの設定で、このサイトの位置情報を許可してください。' : '位置情報を取得できませんでした。電波の良い場所でもう一度試してください。')),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  });
}
function dkView() {
  const offices = Dakoku.visibleOffices(DK.data && DK.data.offices);
  const office = offices.find(o => o.name === DK.office) || null;
  const resolved = office ? Dakoku.resolveStaff({ email: DK.sess.email, staff: DK.data.staff, office: office.name, chosenId: DK.staffId }) : { staff: null, mode: 'pick', list: [] };
  const judge = office ? Dakoku.judge(DK.locating ? null : DK.pos, office) : { ok: false, distance: null, reason: offices.length ? '事業所を選んでください' : '打刻できる事業所がありません' };
  if (DK.locating && office) judge.reason = '位置を確認しています…';
  return { offices, office, staff: resolved.staff, mode: resolved.mode, list: resolved.list, judge };
}
function dkBind() {
  const root = document.getElementById('dk_root');
  if (!root) return;
  root.onclick = e => {
    const b = e.target.closest('[data-dk]');
    if (!b || b.disabled) return;
    const act = b.getAttribute('data-dk');
    if (act === 'loc') dkLocate();
    else if (act === 'demo') dkDemoPos();
    else if (act === 'in') dkPunch('出勤');
    else if (act === 'out') dkPunch('退勤');
  };
  const sel = document.getElementById('dk_staff');
  if (sel) sel.onchange = () => dkPickStaff(sel.value);
  const off = document.getElementById('dk_office');
  if (off) off.onchange = () => dkPickOffice(off.value);
}
function dkPaint() {
  const root = document.getElementById('dk_root');
  if (!root || !DK.data) return;
  const v = dkView();
  const who = DK.sess.demo ? '見本モードです。シートには書きません。' : (DK.sess.email ? 'ログイン中: ' + DK.sess.email : 'ログイン中のメールがありません。');
  let officeHtml = '';
  if (!v.offices.length) officeHtml = '<div class="wn">打刻できる事業所がありません。設定シートの「有効」が TRUE の事業所だけ出ます（いま有効なのは RYDEEN の想定です）。</div>';
  else if (v.offices.length === 1) officeHtml = `<p><b>${dkEsc(v.office.name)}</b>` + (Dakoku.gpsRequired(v.office) ? ` <span class="meta">許可半径 ${Math.round(v.office.radius || 0)}m</span>` : ` <span class="meta">位置情報不要</span>`) + `</p>`;
  else officeHtml = `<label class="meta">事業所</label><select id="dk_office">${v.offices.map(o => `<option value="${dkEsc(o.name)}"${o.name === DK.office ? ' selected' : ''}>${dkEsc(o.name)}</option>`).join('')}</select>`;
  let staffHtml = '';
  if (v.office && v.mode === 'email' && v.staff) staffHtml = `<p>職員: <b>${dkEsc(v.staff.name)}</b> <span class="meta">（ログインのメールで本人を特定）</span></p>`;
  else if (v.office && v.list.length) {
    const note = v.mode === 'ambiguous' ? '同じメールの職員が複数います。本人を選んでください。' : 'ログイン用メールが空（または一致しない）ため、名前を選んでいます。職員シートにメールを入れると自動で本人になります。';
    staffHtml = `<div class="wn">${dkEsc(note)}</div><label class="meta">職員</label><select id="dk_staff"><option value="">選んでください</option>${v.list.map(s => `<option value="${dkEsc(s.id)}"${s.id === (v.staff && v.staff.id) ? ' selected' : ''}>${dkEsc(s.name)}</option>`).join('')}</select>`;
  } else if (v.office) staffHtml = '<div class="ng">この事業所の有効な職員がいません。</div>';
  const needGps = !!(v.office && Dakoku.gpsRequired(v.office));
  let geo = '';
  if (v.office) {
    if (!needGps) geo = `<div class="okb">この事業所は位置情報不要です。${v.staff ? '打刻できます。' : '職員を選ぶとボタンが押せます。'}</div>`;
    else if (DK.locating) geo = '<div class="wn">位置を確認しています…</div>';
    else if (DK.posError) geo = `<div class="ng">${dkEsc(DK.posError)}</div>`;
    else if (v.judge.ok) geo = `<div class="okb">事業所まで ${Math.round(v.judge.distance)}m（許可 ${Math.round(v.office.radius)}m）。${v.staff ? '打刻できます。' : '職員を選ぶとボタンが押せます。'}${DK.pos && DK.pos.demo ? ' 見本の位置（事業所の中心）です。' : ''}${DK.pos && DK.pos.accuracy != null ? ' <span class="meta">精度 ±' + Math.round(DK.pos.accuracy) + 'm</span>' : ''}</div>`;
    else geo = `<div class="ng">${dkEsc(v.judge.reason || '打刻できません')}</div>`;
  }
  const can = !!(v.judge.ok && v.staff && !DK.busy && !(needGps && DK.locating));
  const dis = can ? '' : ' disabled';
  const msg = DK.msg ? `<div class="${DK.bad ? 'ng' : 'okb'}">${dkEsc(DK.msg)}</div>` : '';
  const recent = DK.recent.length ? `<ul>${DK.recent.map(r => `<li>${dkEsc(r.at)} ${dkEsc(r.kind)}</li>`).join('')}</ul>` : '<p class="meta">まだありません。</p>';
  const demoBtn = DK.sess.demo && v.office && needGps ? '<button type="button" class="loc" data-dk="demo">見本の位置で試す（記録しない）</button>' : '';
  const locBtn = needGps ? '<button type="button" class="loc" data-dk="loc">位置を取り直す</button>' : '';
  root.innerHTML = `<h3>出退勤打刻</h3><p class="meta">${dkEsc(who)}</p>${msg}${officeHtml}${staffHtml}${geo}
    ${v.office ? `<button type="button" class="go" data-dk="in"${dis}>出勤</button>
    <button type="button" class="go out" data-dk="out"${dis}>退勤</button>
    ${locBtn}${demoBtn}
    <p class="meta">押し忘れを直す画面は、まだありません。責任者に伝えてください。</p>
    <div class="card"><h4>最近の打刻</h4>${recent}</div>` : ''}`;
  dkBind();
}
async function dkLocate() {
  const seq = ++DK_LOC_SEQ;
  DK.locating = true; DK.posError = '';
  dkPaint();
  try {
    const pos = await dkGeo();
    if (seq !== DK_LOC_SEQ) return;
    DK.pos = pos;
  } catch (e) {
    if (seq !== DK_LOC_SEQ) return;
    DK.pos = null; DK.posError = e.message || '位置情報を取得できませんでした';
  }
  if (seq !== DK_LOC_SEQ) return;
  DK.locating = false;
  dkPaint();
}
function dkDemoPos() {
  if (!DK.sess.demo || !DK.data) return;
  const office = Dakoku.visibleOffices(DK.data.offices).find(o => o.name === DK.office);
  if (!office || office.lat == null) return;
  DK_LOC_SEQ++;
  DK.pos = { lat: office.lat, lng: office.lng, accuracy: 5, demo: true };
  DK.posError = ''; DK.locating = false;
  dkPaint();
}
function dkPickOffice(name) {
  DK.office = name;
  DK.staffId = dkRecall(name, DK.sess.email);
  DK.recent = []; DK.msg = '';
  DK.posError = '';
  const office = (DK.data && Dakoku.visibleOffices(DK.data.offices).find(o => o.name === name)) || null;
  if (office && Dakoku.gpsRequired(office)) {
    DK.pos = null;
    dkLocate();
  } else {
    DK_LOC_SEQ++;
    DK.pos = null;
    DK.locating = false;
    dkPaint();
  }
  dkRecent();
}
function dkPickStaff(id) {
  DK.staffId = id;
  dkRemember(DK.office, DK.sess.email, id);
  DK.msg = '';
  dkPaint();
  dkRecent();
}
async function dkRecent() {
  const v = dkView();
  if (!v.staff || DK.sess.demo) return;
  try {
    const j = await dkRpc({ action: 'recent', staffId: v.staff.id });
    if (v.staff.id === (dkView().staff && dkView().staff.id)) DK.recent = j.rows || [];
  } catch (e) { /* 一覧が取れなくても打刻はできる */ }
  dkPaint();
}
async function dkPunch(kind) {
  if (DK.busy || !Dakoku.kindOk(kind)) return;
  const v = dkView();
  if (!v.staff) { DK.msg = '職員を選んでください'; DK.bad = true; dkPaint(); return; }
  if (!v.judge.ok) { DK.msg = v.judge.reason || '打刻できません'; DK.bad = true; dkPaint(); return; }
  if (DK.sess.demo) {
    const at = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo' }).replace('T', ' ');
    DK.recent.unshift({ at: at, kind: kind, office: v.office.name });
    DK.msg = '見本モードです。' + kind + 'は記録していません。';
    DK.bad = false;
    dkPaint();
    return;
  }
  DK.busy = true; DK.msg = ''; dkPaint();
  try {
    const needGps = Dakoku.gpsRequired(v.office);
    const payload = {
      action: 'punch', office: v.office.name, staffId: v.staff.id, kind: kind,
      email: DK.sess.email, memo: (navigator.userAgent || '').slice(0, 160),
    };
    if (needGps && DK.pos) {
      payload.lat = DK.pos.lat;
      payload.lng = DK.pos.lng;
      payload.accuracy = DK.pos.accuracy == null ? '' : DK.pos.accuracy;
    }
    const j = await dkRpc(payload);
    DK.msg = kind + 'を記録しました（' + (j.at || '') + '）';
    DK.bad = false;
    DK.busy = false;
    await dkRecent();
  } catch (e) {
    DK.msg = e.message || '記録できませんでした';
    DK.bad = true; DK.busy = false;
    dkPaint();
  }
}
async function renderDakoku() {
  const back = '<button class="back" type="button" onclick="location.hash=\'\'">← ポータルへ</button>';
  $('view').innerHTML = back + '<div class="dk" id="dk_root"><h3>出退勤打刻</h3><p>読み込み中…</p></div>';
  DK.sess = dkSession();
  DK.msg = ''; DK.bad = false; DK.busy = false; DK.recent = [];
  DK.pos = null; DK.posError = ''; DK.locating = false;
  try {
    DK.data = DK.sess.demo ? Dakoku.sample() : await dkRpc({ action: 'bootstrap' });
  } catch (e) {
    $('view').innerHTML = back + `<div class="dk"><h3>出退勤打刻</h3><div class="ng">${dkEsc(e.message || e)}</div><p class="meta">手順は dakoku-gas/README.md です。</p></div>`;
    return;
  }
  const offices = Dakoku.visibleOffices(DK.data.offices);
  if (!DK.office || !offices.some(o => o.name === DK.office)) DK.office = offices.length ? offices[0].name : '';
  if (!DK.staffId) DK.staffId = dkRecall(DK.office, DK.sess.email);
  const cur = offices.find(o => o.name === DK.office);
  const needGps = !!(cur && Dakoku.gpsRequired(cur));
  if (needGps) DK.locating = true;
  dkPaint();
  if (needGps) dkLocate();
  if (offices.length) dkRecent();
}
