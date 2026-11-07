// 出退勤打刻（#dakoku）。スマホ向け。出勤・退勤だけ。
// シートへの書き込みは GAS ウェブアプリ経由（config.js の dakoku.gasUrl / dakoku.token）。秘密鍵は置かない。
// ログインは法人ポータルの sess。メールが職員シートと一致すれば本人、空欄なら名前を選ぶ暫定。
const DK = { data: null, office: '', staffId: '', pos: null, posError: '', locating: false, msg: '', bad: false, busy: false, lunch: false, recent: [], sess: { email: '', demo: false } };
let DK_LOC_SEQ = 0;

(function () {
  if (document.getElementById('dk_css')) return;
  const st = document.createElement('style');
  st.id = 'dk_css';
  st.textContent = `.dk h3{color:#9ecbff;text-shadow:2px 2px 0 #000}.dk select{font-size:18px;width:100%;box-sizing:border-box;padding:12px;margin:6px 0;border-radius:0;border:3px solid #1a120c;background:#fffef8}
.dk .go{font-size:22px;padding:18px;margin-top:8px;scroll-margin-bottom:96px}.dk .go:disabled{opacity:.45}.dk .out{background:#3a7bd5}.dk .loc{background:#fff4dc;color:#1c140c;border:3px solid #1a120c;box-shadow:3px 3px 0 #1a120c}
.dk .okb{background:#e6f4ea;border:3px solid #1a120c;border-radius:0;padding:10px;margin:8px 0;font-size:16px;line-height:1.5;color:#1c140c}.dk .ng{background:#fde8e8;border:3px solid #1a120c;border-radius:0;padding:10px;margin:8px 0;font-size:16px;line-height:1.5;color:#1c140c}.dk .wn{background:#fff6d6;border:3px solid #1a120c;border-radius:0;padding:10px;margin:8px 0;font-size:16px;line-height:1.5;color:#1c140c}
.dk .meta{color:#ead9b4;font-size:16px}.dk ul{padding-left:1.2em;margin:6px 0}`;
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
// 職員の割り当て事業所（所属＋兼務）で打刻対象を絞る。1つなら固定、複数なら選択（初期は所属）、0なら従来どおり全件。
function dkAssigned(all) {
  const mine = typeof MY_OFFICE === 'string' ? MY_OFFICE : '';
  const extra = typeof EXTRA_OFFICES !== 'undefined' && Array.isArray(EXTRA_OFFICES) ? EXTRA_OFFICES : [];
  const names = [mine, ...extra].filter((n, i, a) => n && a.indexOf(n) === i);
  const hit = names.map(n => all.find(o => o.name === n)).filter(Boolean);
  return hit.length ? hit : all;
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
  const action = payload.action || 'bootstrap';
  // Supabase が正。ログイン済みなら RPC を使う。
  if (!DK.sess.demo && typeof sb === 'function') {
    try {
      if (action === 'bootstrap') {
        const j = await sb('rpc/dakoku_bootstrap', { method: 'POST', body: '{}' });
        if (j && j.ok && Array.isArray(j.offices) && j.offices.length) return j;
      } else if (action === 'recent') {
        const j = await sb('rpc/dakoku_recent', { method: 'POST', body: JSON.stringify({ p_staff_id: payload.staffId }) });
        if (j && j.ok) return j;
        if (j && j.error) throw new Error(j.error);
      } else if (action === 'punch') {
        const j = await sb('rpc/dakoku_punch', { method: 'POST', body: JSON.stringify({
          p_office: payload.office, p_staff_id: payload.staffId, p_kind: payload.kind,
          p_lat: payload.lat ?? null, p_lng: payload.lng ?? null, p_accuracy: payload.accuracy ?? null,
          p_lunch: payload.lunch === true || payload.lunch === 'はい', p_memo: payload.memo || null
        }) });
        if (j && j.ok) return j;
        if (j && j.error) throw new Error(j.error);
        throw new Error('打刻を記録できませんでした');
      }
    } catch (e) {
      // 表が未作成などのときだけ GAS へ。punch の失敗は GAS に流さない（二重記録防止）
      if (action === 'punch') throw e;
      if (!/読み込めません|404|PGRST|ログイン/.test(String(e.message || e))) throw e;
    }
  }
  // フォールバック：旧 GAS（設定がまだ Supabase に無いとき）
  const c = dkCfg();
  if (!c.gasUrl || !c.token) throw new Error('打刻の接続先が未設定です。Supabase の dakoku 表、または GAS を確認してください。');
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
  if (!j || j.ok === false) throw new Error((j && j.error) || '打刻サーバーに接続できませんでした');
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
  const offices = dkAssigned(Dakoku.visibleOffices(DK.data && DK.data.offices));
  const office = offices.find(o => o.name === DK.office) || null;
  const resolved = office ? Dakoku.resolveStaff({ email: DK.sess.email, staff: DK.data.staff, office: office.name, chosenId: DK.staffId }) : { staff: null, mode: 'pick', list: [] };
  const judge = office ? Dakoku.judge(DK.locating ? null : DK.pos, office) : { ok: false, distance: null, reason: offices.length ? '事業所を選んでください / Escolha o local' : '打刻できる事業所がありません / Nenhum local disponível para registro' };
  if (DK.locating && office) judge.reason = '位置を確認しています… / Verificando localização…';
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
  const lu = document.getElementById('dk_lunch');
  if (lu) lu.onchange = () => { DK.lunch = !!lu.checked; };
  const sel = document.getElementById('dk_staff');
  if (sel) sel.onchange = () => dkPickStaff(sel.value);
  const off = document.getElementById('dk_office');
  if (off) off.onchange = () => dkPickOffice(off.value);
}
function dkPaint() {
  const root = document.getElementById('dk_root');
  if (!root || !DK.data) return;
  const v = dkView();
  const who = DK.sess.demo ? '見本モードです。シートには書きません。 / Modo de demonstração: nada é gravado.' : (DK.sess.email ? 'ログイン中 / Conectado: ' + DK.sess.email : 'ログイン中のメールがありません。 / Sem e-mail de login.');
  let officeHtml = '';
  if (!v.offices.length) officeHtml = '<div class="wn">打刻できる事業所がありません。設定シートの「有効」が TRUE の事業所だけ出ます（いま有効なのは RYDEEN の想定です）。</div>';
  else if (v.offices.length === 1) officeHtml = `<p><b>${dkEsc(v.office.name)}</b>` + (Dakoku.gpsRequired(v.office) ? ` <span class="meta">許可半径 / Raio permitido ${Math.round(v.office.radius || 0)}m</span>` : ` <span class="meta">位置情報不要 / Sem localização</span>`) + `</p>`;
  else officeHtml = `<label class="meta">事業所 / Local</label><select id="dk_office">${v.offices.map(o => `<option value="${dkEsc(o.name)}"${o.name === DK.office ? ' selected' : ''}>${dkEsc(o.name)}</option>`).join('')}</select>`;
  let staffHtml = '';
  if (v.office && v.mode === 'email' && v.staff) staffHtml = `<p>職員 / Funcionário: <b>${dkEsc(v.staff.name)}</b> <span class="meta">（ログインのメールで本人を特定 / identificado pelo e-mail）</span></p>`;
  else if (v.office && v.list.length) {
    const note = v.mode === 'ambiguous' ? '同じメールの職員が複数います。本人を選んでください。 / Há vários funcionários com o mesmo e-mail. Escolha seu nome.' : 'ログイン用メールが空（または一致しない）ため、名前を選んでいます。職員シートにメールを入れると自動で本人になります。 / Escolha seu nome na lista.';
    staffHtml = `<div class="wn">${dkEsc(note)}</div><label class="meta">職員 / Funcionário</label><select id="dk_staff"><option value="">選んでください / Escolha</option>${v.list.map(s => `<option value="${dkEsc(s.id)}"${s.id === (v.staff && v.staff.id) ? ' selected' : ''}>${dkEsc(s.name)}</option>`).join('')}</select>`;
  } else if (v.office) staffHtml = '<div class="ng">この事業所の有効な職員がいません。 / Não há funcionários ativos neste local.</div>';
  const needGps = !!(v.office && Dakoku.gpsRequired(v.office));
  let geo = '';
  if (v.office) {
    if (!needGps) geo = `<div class="okb">この事業所は位置情報不要です。 / Sem localização. ${v.staff ? '打刻できます。 / Pode registrar.' : '職員を選ぶとボタンが押せます。 / Escolha o funcionário para liberar os botões.'}</div>`;
    else if (DK.locating) geo = '<div class="wn">位置を確認しています… / Verificando localização…</div>';
    else if (DK.posError) geo = `<div class="ng">${dkEsc(DK.posError)}</div>`;
    else if (v.judge.ok) geo = `<div class="okb">事業所まで / Distância ${Math.round(v.judge.distance)}m（許可 / permitido ${Math.round(v.office.radius)}m）。${v.staff ? '打刻できます。 / Pode registrar.' : '職員を選ぶとボタンが押せます。 / Escolha o funcionário para liberar os botões.'}${DK.pos && DK.pos.demo ? ' 見本の位置（事業所の中心）です。' : ''}${DK.pos && DK.pos.accuracy != null ? ' <span class="meta">精度 ±' + Math.round(DK.pos.accuracy) + 'm</span>' : ''}</div>`;
    else geo = `<div class="ng">${dkEsc(v.judge.reason || '打刻できません / Não é possível registrar')}</div>`;
  }
  const can = !!(v.judge.ok && v.staff && !DK.busy && !(needGps && DK.locating));
  const dis = can ? '' : ' disabled';
  const msg = DK.msg ? `<div class="${DK.bad ? 'ng' : 'okb'}">${dkEsc(DK.msg)}</div>` : '';
  const recent = DK.recent.length ? `<ul>${DK.recent.map(r => `<li>${dkEsc(r.at)} ${dkEsc(r.kind)}${r.lunch === 'はい' ? ' 🍱昼食あり / com almoço' : ''}</li>`).join('')}</ul>` : '<p class="meta">まだありません。 / Nenhum registro ainda.</p>';
  const demoBtn = DK.sess.demo && v.office && needGps ? '<button type="button" class="loc" data-dk="demo">見本の位置で試す（記録しない） / Testar com local de exemplo</button>' : '';
  const locBtn = needGps ? '<button type="button" class="loc" data-dk="loc">位置を取り直す / Atualizar localização</button>' : '';
  root.innerHTML = `<h3>出退勤打刻 <small>Registrar entrada/saída</small></h3><p class="meta">${dkEsc(who)}</p>${msg}${officeHtml}${staffHtml}${geo}
    ${v.office ? `<label class="dk-lunch" style="display:flex;align-items:center;gap:.5em;margin:.6em 0;font-size:1.05em"><input type="checkbox" id="dk_lunch" style="width:1.4em;height:1.4em"${DK.lunch ? ' checked' : ''}> 昼食提供を受けた / Recebeu refeição (almoço)</label>
    <button type="button" class="go" data-dk="in"${dis}>出勤<br><small>Entrada</small></button>
    <button type="button" class="go out" data-dk="out"${dis}>退勤<br><small>Saída</small></button>
    ${locBtn}${demoBtn}
    <p class="meta">押し忘れを直す画面は、まだありません。責任者に伝えてください。<br>Esqueceu de registrar? Avise o responsável.</p>
    <div class="card"><h4>最近の打刻 / Registros recentes</h4>${recent}</div>` : ''}`;
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
  const office = dkAssigned(Dakoku.visibleOffices(DK.data.offices)).find(o => o.name === DK.office);
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
  const office = (DK.data && dkAssigned(Dakoku.visibleOffices(DK.data.offices)).find(o => o.name === name)) || null;
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
  if (!v.staff) { DK.msg = '職員を選んでください / Escolha o funcionário'; DK.bad = true; dkPaint(); return; }
  if (!v.judge.ok) { DK.msg = v.judge.reason || '打刻できません / Não é possível registrar'; DK.bad = true; dkPaint(); return; }
  if (DK.sess.demo) {
    const at = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo' }).replace('T', ' ');
    DK.recent.unshift({ at: at, kind: kind, office: v.office.name, lunch: DK.lunch ? 'はい' : 'いいえ' });
    DK.msg = '見本モードです。' + kind + 'は記録していません。 / Modo de demonstração: ' + (kind === '出勤' ? 'entrada' : 'saída') + ' não gravada.';
    DK.bad = false;
    dkPaint();
    return;
  }
  DK.busy = true; DK.msg = ''; dkPaint();
  try {
    const needGps = Dakoku.gpsRequired(v.office);
    const payload = {
      action: 'punch', office: v.office.name, staffId: v.staff.id, kind: kind,
      email: DK.sess.email, lunch: DK.lunch ? 'はい' : 'いいえ',
      memo: ('昼食=' + (DK.lunch ? 'はい' : 'いいえ') + '; ' + (navigator.userAgent || '')).slice(0, 160),
    };
    if (needGps && DK.pos) {
      payload.lat = DK.pos.lat;
      payload.lng = DK.pos.lng;
      payload.accuracy = DK.pos.accuracy == null ? '' : DK.pos.accuracy;
    }
    const j = await dkRpc(payload);
    DK.msg = kind + 'を記録しました（' + (j.at || '') + '） / ' + (kind === '出勤' ? 'Entrada' : 'Saída') + ' registrada';
    DK.bad = false;
    DK.busy = false;
    await dkRecent();
  } catch (e) {
    DK.msg = e.message || '記録できませんでした / Não foi possível registrar';
    DK.bad = true; DK.busy = false;
    dkPaint();
  }
}
async function renderDakoku() {
  const back = '<button class="back" type="button" onclick="location.hash=\'\'">← ポータルへ / Voltar ao portal</button>';
  $('view').innerHTML = back + '<div class="dk" id="dk_root"><h3>出退勤打刻 <small>Registrar entrada/saída</small></h3><p>読み込み中… / Carregando…</p></div>';
  DK.sess = dkSession();
  DK.msg = ''; DK.bad = false; DK.busy = false; DK.recent = [];
  DK.pos = null; DK.posError = ''; DK.locating = false;
  try {
    DK.data = DK.sess.demo ? Dakoku.sample() : await dkRpc({ action: 'bootstrap' });
  } catch (e) {
    $('view').innerHTML = back + `<div class="dk"><h3>出退勤打刻 <small>Registrar entrada/saída</small></h3><div class="ng">${dkEsc(e.message || e)}</div><p class="meta">設定は総務の「打刻設定」から直せます。</p></div>`;
    return;
  }
  const offices = dkAssigned(Dakoku.visibleOffices(DK.data.offices));
  if (!DK.office || !offices.some(o => o.name === DK.office)) DK.office = offices.length ? offices[0].name : '';
  if (!DK.staffId) DK.staffId = dkRecall(DK.office, DK.sess.email);
  const cur = offices.find(o => o.name === DK.office);
  const needGps = !!(cur && Dakoku.gpsRequired(cur));
  if (needGps) DK.locating = true;
  dkPaint();
  if (needGps) dkLocate();
  if (offices.length) dkRecent();
}
