// 出退勤打刻（#dakoku）。スマホ向け。出勤・退勤だけ。
// 記録先は Supabase（dakoku_* RPC）のみ。Google シート／GAS は使わない。
// ログインは法人ポータルの sess。本番は dakoku_staff.email と一致する本人だけ自動選択（他人は選べない）。
const DK = { data: null, office: '', staffId: '', pos: null, posError: '', locating: false, msg: '', bad: false, busy: false, lunch: false, recent: [], month: '', monthRows: [], monthErr: '', monthBusy: false, sess: { email: '', demo: false },
  req: { loaded: false, admin: false, mine: [], pending: [], done: [], err: '', busy: false, open: false, msg: '', bad: false, form: { date: '', kind: '退勤', time: '', reason: '' } } };
let DK_LOC_SEQ = 0;

(function () {
  if (document.getElementById('dk_css')) return;
  const st = document.createElement('style');
  st.id = 'dk_css';
  st.textContent = `.dk h3{color:#9ecbff;text-shadow:2px 2px 0 #000}.dk select{font-size:18px;width:100%;box-sizing:border-box;padding:12px;margin:6px 0;border-radius:0;border:3px solid #1a120c;background:#fffef8}
.dk .go{font-size:22px;padding:18px;margin-top:8px;scroll-margin-bottom:96px}.dk .go:disabled{opacity:.45}.dk .out{background:#3a7bd5}.dk .loc{background:#fff4dc;color:#1c140c;border:3px solid #1a120c;box-shadow:3px 3px 0 #1a120c}
.dk .okb{background:#e6f4ea;border:3px solid #1a120c;border-radius:0;padding:10px;margin:8px 0;font-size:16px;line-height:1.5;color:#1c140c}.dk .ng{background:#fde8e8;border:3px solid #1a120c;border-radius:0;padding:10px;margin:8px 0;font-size:16px;line-height:1.5;color:#1c140c}.dk .wn{background:#fff6d6;border:3px solid #1a120c;border-radius:0;padding:10px;margin:8px 0;font-size:16px;line-height:1.5;color:#1c140c}
.dk .meta{color:#ead9b4;font-size:16px}.dk ul{padding-left:1.2em;margin:6px 0}
.dk .monnav{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:8px 0}
.dk .monnav button{font-size:16px;padding:8px 14px;border:3px solid #1a120c;background:#fff4dc;color:#1c140c;box-shadow:3px 3px 0 #1a120c}
.dk .monnav b{color:#fffef8;font-size:18px}
.dk .mon{overflow-x:auto;-webkit-overflow-scrolling:touch;margin-top:6px}
.dk table.dkm{width:100%;min-width:280px;border-collapse:collapse;font-size:14px;background:#fffef8;color:#1c140c}
.dk table.dkm th,.dk table.dkm td{border:2px solid #1a120c;padding:7px 5px;text-align:center;white-space:nowrap}
.dk table.dkm th{background:#ead9b4}
.dk table.dkm .miss{background:#fde8e8;font-weight:700}
.dk table.dkm .proxy{display:inline-block;margin-left:4px;font-size:12px;background:#fff6d6;border:2px solid #1a120c;padding:0 4px}
.dk table.dkm .reqb{display:inline-block;margin-left:4px;font-size:12px;padding:1px 6px;border:2px solid #1a120c;background:#fff4dc;color:#1c140c;box-shadow:2px 2px 0 #1a120c}
.dk .req label{display:block;margin:8px 0 2px;color:inherit;font-weight:700}.dk .req .rqh{color:inherit;opacity:.85;font-size:15px;margin:8px 0 4px}.dk .req input,.dk .req textarea{font-size:18px;width:100%;box-sizing:border-box;padding:10px;border:3px solid #1a120c;border-radius:0;background:#fffef8;color:#1c140c}
.dk .req textarea{min-height:70px}.dk .req .send{margin-top:10px}.dk .req .open{background:#fff4dc;color:#1c140c;border:3px solid #1a120c;box-shadow:3px 3px 0 #1a120c}
.dk .rq{border:2px solid #1a120c;background:#fffef8;color:#1c140c;padding:8px;margin:6px 0;font-size:15px;line-height:1.5}.dk .rq .st{display:inline-block;font-size:12px;border:2px solid #1a120c;padding:0 4px;margin-left:4px}
.dk .rq .st.pending{background:#fff6d6}.dk .rq .st.approved{background:#e6f4ea}.dk .rq .st.rejected{background:#fde8e8}.dk .rq .btns{display:flex;gap:8px;margin-top:6px}.dk .rq .btns button{flex:1;font-size:16px;padding:10px}.dk .rq .btns .ng2{background:#b23b3b}
.dk .montotal{margin:8px 0 0;font-size:16px;color:#1c140c;background:#e6f4ea;border:3px solid #1a120c;padding:8px}`;
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
// 見本：所属＋兼務で絞る。本番：ログインメール一致の所属事業所だけ。
function dkAssigned(all) {
  const mine = typeof MY_OFFICE === 'string' ? MY_OFFICE : '';
  const extra = typeof EXTRA_OFFICES !== 'undefined' && Array.isArray(EXTRA_OFFICES) ? EXTRA_OFFICES : [];
  const names = [mine, ...extra].filter((n, i, a) => n && a.indexOf(n) === i);
  const hit = names.map(n => all.find(o => o.name === n)).filter(Boolean);
  return hit.length ? hit : all;
}
function dkOffices() {
  const all = Dakoku.visibleOffices(DK.data && DK.data.offices);
  if (DK.sess.demo) return dkAssigned(all);
  const pack = Dakoku.officesForEmail(DK.data && DK.data.offices, DK.data && DK.data.staff, DK.sess.email);
  return pack.offices;
}
function dkAllowPick() {
  return !!(DK.sess && DK.sess.demo);
}
function dkRemember(office, email, id) {
  try { sessionStorage.setItem('dakoku:' + office + ':' + email, id); } catch (e) { /* 記憶できなくても打刻はできる */ }
}
function dkRecall(office, email) {
  try { return sessionStorage.getItem('dakoku:' + office + ':' + email) || ''; } catch (e) { return ''; }
}
// Supabase RPC のみ。失敗したらエラー（Google へは落とさない）。
async function dkRpc(payload) {
  const action = payload.action || 'bootstrap';
  if (typeof sb !== 'function') throw new Error('打刻の接続先が未設定です。ログインし直してください。');
  if (action === 'bootstrap') {
    const j = await sb('rpc/dakoku_bootstrap', { method: 'POST', body: '{}' });
    if (j && j.ok && Array.isArray(j.offices)) return j;
    if (j && j.error) throw new Error(j.error);
    throw new Error('打刻の初期データを読めませんでした');
  }
  if (action === 'recent') {
    const j = await sb('rpc/dakoku_recent', { method: 'POST', body: JSON.stringify({ p_staff_id: payload.staffId }) });
    if (j && j.ok) return j;
    if (j && j.error) throw new Error(j.error);
    throw new Error('最近の打刻を読めませんでした');
  }
  if (action === 'month') {
    const j = await sb('rpc/dakoku_month', { method: 'POST', body: JSON.stringify({ p_staff_id: payload.staffId, p_month: payload.month }) });
    if (j && j.ok) return j;
    if (j && j.error) throw new Error(j.error);
    throw new Error('月の打刻を読めませんでした');
  }
  if (action === 'req-submit') {
    const j = await sb('rpc/dakoku_request_submit', { method: 'POST', body: JSON.stringify({ p_staff_id: payload.staffId, p_date: payload.date, p_kind: payload.kind, p_time: payload.time, p_reason: payload.reason }) });
    if (j && j.ok) return j;
    if (j && j.error) throw new Error(j.error);
    throw new Error('申告を送れませんでした');
  }
  if (action === 'req-list') {
    const j = await sb('rpc/dakoku_request_list', { method: 'POST', body: '{}' });
    if (j && j.ok) return j;
    if (j && j.error) throw new Error(j.error);
    throw new Error('申告の一覧を読めませんでした');
  }
  if (action === 'req-decide') {
    const j = await sb('rpc/dakoku_request_decide', { method: 'POST', body: JSON.stringify({ p_id: Number(payload.id), p_approve: !!payload.approve, p_note: payload.note || null }) });
    if (j && j.ok) return j;
    if (j && j.error) throw new Error(j.error);
    throw new Error('承認・却下できませんでした');
  }
  if (action === 'punch') {
    const j = await sb('rpc/dakoku_punch', { method: 'POST', body: JSON.stringify({
      p_office: payload.office, p_staff_id: payload.staffId, p_kind: payload.kind,
      p_lat: payload.lat ?? null, p_lng: payload.lng ?? null, p_accuracy: payload.accuracy ?? null,
      p_lunch: payload.lunch === true || payload.lunch === 'はい', p_memo: payload.memo || null
    }) });
    if (j && j.ok) return j;
    if (j && j.error) throw new Error(j.error);
    throw new Error('打刻を記録できませんでした');
  }
  throw new Error('不明な操作です');
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
  const offices = dkOffices();
  const office = offices.find(o => o.name === DK.office) || null;
  let resolved = { staff: null, mode: 'pick', list: [] };
  if (!DK.sess.demo && !String(DK.sess.email || '').trim()) {
    resolved = { staff: null, mode: 'noemail', list: [] };
  } else if (!DK.sess.demo && Dakoku.staffByEmail(DK.data && DK.data.staff, DK.sess.email).length === 0) {
    resolved = { staff: null, mode: 'unregistered', list: [] };
  } else if (office) {
    resolved = Dakoku.resolveStaff({
      email: DK.sess.email, staff: DK.data.staff, office: office.name, chosenId: DK.staffId, allowPick: dkAllowPick(),
    });
  }
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
    else if (act === 'mon-prev') dkChangeMonth(-1);
    else if (act === 'mon-next') dkChangeMonth(1);
    else if (act === 'req-open') { DK.req.open = !DK.req.open; DK.req.msg = ''; dkPaint(); }
    else if (act === 'req-fill') dkReqFill(b.getAttribute('data-day'), b.getAttribute('data-kind'));
    else if (act === 'req-send') dkReqSend();
    else if (act === 'req-ok') dkReqDecide(b.getAttribute('data-id'), true);
    else if (act === 'req-ng') dkReqDecide(b.getAttribute('data-id'), false);
  };
  const rf = DK.req.form;
  [['dk_rq_date', 'date'], ['dk_rq_kind', 'kind'], ['dk_rq_time', 'time'], ['dk_rq_reason', 'reason']].forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (el) el.oninput = el.onchange = () => { rf[key] = el.value; };
  });
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
  if (v.mode === 'unregistered' || v.mode === 'noemail') officeHtml = '';
  else if (!v.offices.length) officeHtml = '<div class="wn">打刻できる事業所がありません。名簿の所属か事業所の有効設定を確認してください。</div>';
  else if (v.offices.length === 1 && v.office) officeHtml = `<p><b>${dkEsc(v.office.name)}</b>` + (Dakoku.gpsRequired(v.office) ? ` <span class="meta">許可半径 ${Math.round(v.office.radius || 0)}m</span>` : ` <span class="meta">位置情報不要</span>`) + `</p>`;
  else if (v.offices.length > 1) officeHtml = `<label class="meta">事業所</label><select id="dk_office">${v.offices.map(o => `<option value="${dkEsc(o.name)}"${o.name === DK.office ? ' selected' : ''}>${dkEsc(o.name)}</option>`).join('')}</select>`;
  let staffHtml = '';
  if (v.mode === 'noemail') staffHtml = '<div class="ng">ログイン中のメールがありません。ポータルにログインし直してください。</div>';
  else if (v.mode === 'unregistered') staffHtml = '<div class="ng">ログイン用メールが名簿に未登録です。管理者へ連絡してください。</div>';
  else if (v.staff && (v.mode === 'email' || (v.mode === 'ambiguous' && v.list.length === 1))) {
    const offLabel = v.office ? v.office.name : (v.staff.office || '');
    staffHtml = `<p><b>${dkEsc(v.staff.name)}さん</b>（${dkEsc(offLabel)}） <span class="meta">本人（ログインメール）</span></p>`;
  } else if (v.office && v.mode === 'ambiguous' && v.list.length > 1) {
    staffHtml = `<div class="wn">同じメールの職員が複数います。本人を選んでください。</div><label class="meta">職員</label><select id="dk_staff"><option value="">選んでください</option>${v.list.map(s => `<option value="${dkEsc(s.id)}"${s.id === (v.staff && v.staff.id) ? ' selected' : ''}>${dkEsc(s.name)}</option>`).join('')}</select>`;
  } else if (v.office && dkAllowPick() && v.list.length) {
    staffHtml = `<div class="wn">見本モード：名前を選んでください。</div><label class="meta">職員</label><select id="dk_staff"><option value="">選んでください</option>${v.list.map(s => `<option value="${dkEsc(s.id)}"${s.id === (v.staff && v.staff.id) ? ' selected' : ''}>${dkEsc(s.name)}</option>`).join('')}</select>`;
  } else if (v.office && v.mode !== 'unregistered' && v.mode !== 'noemail') staffHtml = '<div class="ng">この事業所で打刻できる本人がいません。</div>';
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
  const demoBtn = DK.sess.demo && v.office && needGps ? '<button type="button" class="loc" data-dk="demo">見本の位置で試す（記録しない） / Testar com local de exemplo</button>' : '';
  const locBtn = needGps ? '<button type="button" class="loc" data-dk="loc">位置を取り直す / Atualizar localização</button>' : '';
  const showPunch = !!(v.office && v.mode !== 'unregistered' && v.mode !== 'noemail');
  const monthHtml = showPunch ? dkMonthHtml(v) : '';
  root.innerHTML = `<h3>出退勤打刻 <small>Registrar entrada/saída</small></h3><p class="meta">${dkEsc(who)}</p>${msg}${officeHtml}${staffHtml}${showPunch ? geo : ''}
    ${showPunch ? `<label class="dk-lunch" style="display:flex;align-items:center;gap:.5em;margin:.6em 0;font-size:1.05em"><input type="checkbox" id="dk_lunch" style="width:1.4em;height:1.4em"${DK.lunch ? ' checked' : ''}> 昼食提供を受けた / Recebeu refeição (almoço)</label>
    <button type="button" class="go" data-dk="in"${dis}>出勤<br><small>Entrada</small></button>
    <button type="button" class="go out" data-dk="out"${dis}>退勤<br><small>Saída</small></button>
    ${locBtn}${demoBtn}
    <p class="meta">押し忘れたら、下の「打刻忘れを申告」から送れます（管理者が承認すると記録に入ります）。<br>Esqueceu de registrar? Use “Informar registro esquecido” abaixo (entra no registro após aprovação).</p>
    ${monthHtml}${dkReqHtml(v)}` : ''}${dkReqAdminHtml()}`;
  dkBind();
}
function dkMonthHtml(v) {
  const ym = DK.month || Dakoku.currentMonthJst();
  const nav = `<div class="monnav"><button type="button" data-dk="mon-prev" aria-label="前月">◀</button><b>${dkEsc(ym)}</b><button type="button" data-dk="mon-next" aria-label="翌月">▶</button></div>`;
  if (!v.staff) return `<div class="card"><h4>月別一覧 / Registro mensal</h4>${nav}<p class="meta">職員が決まると表示されます。 / Aparece quando o funcionário for definido.</p></div>`;
  if (DK.monthBusy) return `<div class="card"><h4>月別一覧 / Registro mensal</h4>${nav}<p class="meta">読み込み中… / Carregando…</p></div>`;
  if (DK.monthErr) return `<div class="card"><h4>月別一覧 / Registro mensal</h4>${nav}<div class="ng">${dkEsc(DK.monthErr)}</div></div>`;
  const packed = Dakoku.pairMonth(DK.monthRows || []);
  if (!packed.pairs.length) return `<div class="card"><h4>月別一覧 / Registro mensal</h4>${nav}<p class="meta">この月の打刻はまだありません。 / Nenhum registro neste mês.</p></div>`;
  const rows = packed.pairs.map(pr => {
    const dayLabel = pr.day.slice(5).replace('-', '/');
    const proxy = pr.proxy ? '<span class="proxy">代理 / Proxy</span>' : '';
    const reqTag = '<span class="proxy">申告 / Declarado</span>';
    const canReq = !DK.sess.demo && Dakoku.canRequestDay(pr.day);
    const fillBtn = kind => canReq ? `<button type="button" class="reqb" data-dk="req-fill" data-day="${dkEsc(pr.day)}" data-kind="${kind}">申告 / Informar</button>` : '';
    const inCell = pr.inAt ? dkEsc(pr.inAt) + (pr.proxy ? proxy : '') + (pr.inReq ? reqTag : '') : '<span class="miss">出勤なし / Sem entrada</span>' + fillBtn('出勤');
    const outCell = pr.outAt ? dkEsc(pr.outAt) + (pr.proxy && !pr.inAt ? proxy : '') + (pr.outReq ? reqTag : '') : '<span class="miss">退勤なし / Sem saída</span>' + fillBtn('退勤');
    const hrs = pr.missing ? '<span class="miss">—</span>' : dkEsc(Dakoku.formatHours(pr.minutes));
    const missClass = pr.missing ? ' class="miss"' : '';
    return `<tr${missClass}><td>${dkEsc(dayLabel)}</td><td>${inCell}</td><td>${outCell}</td><td>${hrs}</td></tr>`;
  }).join('');
  const total = `<p class="montotal"><b>月合計 / Total do mês</b>：${dkEsc(Dakoku.formatHours(packed.totalMinutes))}</p>`;
  return `<div class="card"><h4>月別一覧 / Registro mensal</h4>${nav}<div class="mon"><table class="dkm"><thead><tr><th>日付<br><small>Data</small></th><th>出勤<br><small>Entrada</small></th><th>退勤<br><small>Saída</small></th><th>勤務時間<br><small>Horas</small></th></tr></thead><tbody>${rows}</tbody></table></div>${total}</div>`;
}
// 打刻忘れ申告（本人）。記録は管理者承認後に dakoku_punches へ入る。
function dkReqHtml(v) {
  const R = DK.req;
  const head = '<h4>打刻忘れを申告 / Informar registro esquecido</h4>';
  if (DK.sess.demo) return `<div class="card req">${head}<p class="meta">見本モードでは申告できません。 / Indisponível no modo de demonstração.</p></div>`;
  if (!v.staff) return '';
  const msg = R.msg ? `<div class="${R.bad ? 'ng' : 'okb'}">${dkEsc(R.msg)}</div>` : '';
  const today = Dakoku.todayJst();
  const f = R.form;
  const form = R.open ? `<label for="dk_rq_date">日付 / Data</label><input type="date" id="dk_rq_date" value="${dkEsc(f.date)}" min="${Dakoku.addDays(today, -Dakoku.REQ_MAX_DAYS)}" max="${today}">
    <label for="dk_rq_kind">出勤・退勤 / Entrada ou saída</label><select id="dk_rq_kind"><option value="出勤"${f.kind === '出勤' ? ' selected' : ''}>出勤 / Entrada</option><option value="退勤"${f.kind === '退勤' ? ' selected' : ''}>退勤 / Saída</option></select>
    <label for="dk_rq_time">時刻 / Horário</label><input type="time" id="dk_rq_time" value="${dkEsc(f.time)}" step="60">
    <label for="dk_rq_reason">理由 / Motivo</label><textarea id="dk_rq_reason" maxlength="200" placeholder="例：押し忘れた / Ex.: esqueci de registrar">${dkEsc(f.reason)}</textarea>
    <button type="button" class="go send" data-dk="req-send"${R.busy ? ' disabled' : ''}>申告を送る<br><small>Enviar</small></button>
    <p class="meta">管理者が承認すると月別一覧に「申告」と付いて入ります。 / Após aprovação aparece no registro mensal com “Declarado”.</p>` : '';
  const toggle = `<button type="button" class="open" data-dk="req-open">${R.open ? '閉じる / Fechar' : '打刻忘れを申告する / Informar registro esquecido'}</button>`;
  const mine = (R.mine || []).filter(r => r.staffId === v.staff.id);
  const list = mine.length ? '<p class="rqh">自分の申告 / Meus pedidos</p>' + mine.map(r => `<div class="rq">${dkEsc(r.date.slice(5).replace('-', '/'))} ${dkEsc(r.kind)} ${dkEsc(r.time)}<span class="st ${dkEsc(r.status)}">${dkEsc(Dakoku.reqStatusLabel(r.status))}</span><br><small>${dkEsc(r.reason)}${r.note ? '／' + dkEsc(r.note) : ''}${r.decidedBy ? '（' + dkEsc(r.decidedBy) + '）' : ''}</small></div>`).join('') : '';
  const err = R.err ? `<div class="ng">${dkEsc(R.err)}</div>` : '';
  return `<div class="card req" id="dk_req">${head}${msg}${toggle}${form}${err}${list}</div>`;
}
// 管理者：承認待ち一覧
function dkReqAdminHtml() {
  const R = DK.req;
  if (DK.sess.demo || !R.admin) return '';
  const pend = R.pending || [];
  const rows = pend.length ? pend.map(r => `<div class="rq"><b>${dkEsc(r.name)}</b>（${dkEsc(r.office)}） ${dkEsc(r.date.slice(5).replace('-', '/'))} ${dkEsc(r.kind)} <b>${dkEsc(r.time)}</b><br><small>理由：${dkEsc(r.reason)}　申告 ${dkEsc(r.createdAt)}</small>
    <div class="btns"><button type="button" data-dk="req-ok" data-id="${dkEsc(r.id)}"${R.busy ? ' disabled' : ''}>承認</button><button type="button" class="ng2" data-dk="req-ng" data-id="${dkEsc(r.id)}"${R.busy ? ' disabled' : ''}>却下</button></div></div>`).join('') : '<p class="rqh">承認待ちはありません。</p>';
  const done = (R.done || []).length ? '<p class="rqh">最近の処理</p>' + R.done.map(r => `<div class="rq">${dkEsc(r.name)} ${dkEsc(r.date.slice(5).replace('-', '/'))} ${dkEsc(r.kind)} ${dkEsc(r.time)}<span class="st ${dkEsc(r.status)}">${dkEsc(Dakoku.reqStatusLabel(r.status))}</span>${r.note ? '<br><small>' + dkEsc(r.note) + '</small>' : ''}</div>`).join('') : '';
  return `<div class="card req" id="dk_req_admin"><h4>打刻忘れ申告の承認（管理者） <small>${pend.length}件</small></h4>${R.adminMsg ? `<div class="${R.adminBad ? 'ng' : 'okb'}">${dkEsc(R.adminMsg)}</div>` : ''}${rows}${done}</div>`;
}
async function dkLoadRequests() {
  if (DK.sess.demo) return;
  try {
    const j = await dkRpc({ action: 'req-list' });
    DK.req.mine = j.mine || []; DK.req.admin = !!j.admin; DK.req.pending = j.pending || []; DK.req.done = j.recentDone || []; DK.req.err = '';
  } catch (e) { DK.req.err = e.message || '申告の一覧を読めませんでした'; }
  DK.req.loaded = true;
  dkPaint();
}
function dkReqFill(day, kind) {
  DK.req.open = true; DK.req.msg = '';
  DK.req.form.date = day || ''; DK.req.form.kind = Dakoku.kindOk(kind) ? kind : '退勤';
  dkPaint();
  const box = document.getElementById('dk_req');
  if (box && box.scrollIntoView) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const t = document.getElementById('dk_rq_time');
  if (t) setTimeout(() => t.focus(), 300);
}
async function dkReqSend() {
  const v = dkView();
  if (DK.req.busy || !v.staff || DK.sess.demo) return;
  const c = Dakoku.checkRequest(DK.req.form);
  if (!c.ok) { DK.req.msg = c.error; DK.req.bad = true; dkPaint(); return; }
  DK.req.busy = true; DK.req.msg = ''; dkPaint();
  try {
    await dkRpc({ action: 'req-submit', staffId: v.staff.id, date: c.date, kind: c.kind, time: c.time, reason: c.reason });
    DK.req.msg = '申告を送りました。管理者の承認を待ってください。 / Pedido enviado. Aguarde a aprovação.';
    DK.req.bad = false; DK.req.open = false;
    DK.req.form = { date: '', kind: '退勤', time: '', reason: '' };
  } catch (e) {
    DK.req.msg = e.message || '申告を送れませんでした / Não foi possível enviar'; DK.req.bad = true;
  }
  DK.req.busy = false;
  await dkLoadRequests();
}
async function dkReqDecide(id, approve) {
  if (DK.req.busy || !id) return;
  const r = (DK.req.pending || []).find(x => String(x.id) === String(id));
  const label = r ? `${r.name} ${r.date} ${r.kind} ${r.time}` : '';
  let note = null;
  if (approve) { if (!window.confirm(label + ' を承認して記録に入れますか？')) return; }
  else { note = window.prompt(label + ' を却下します。理由（任意）', ''); if (note === null) return; }
  DK.req.busy = true; DK.req.adminMsg = ''; dkPaint();
  try {
    const j = await dkRpc({ action: 'req-decide', id: id, approve: approve, note: note });
    DK.req.adminMsg = approve ? (j.skipped ? '承認しました（同じ日の同じ打刻が既にあるため追加はしていません）' : '承認して記録しました（' + (j.at || '') + '）') : '却下しました';
    DK.req.adminBad = false;
  } catch (e) { DK.req.adminMsg = e.message || '処理できませんでした'; DK.req.adminBad = true; }
  DK.req.busy = false;
  await dkLoadRequests();
  dkLoadMonth();
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
  const office = dkOffices().find(o => o.name === DK.office);
  if (!office || office.lat == null) return;
  DK_LOC_SEQ++;
  DK.pos = { lat: office.lat, lng: office.lng, accuracy: 5, demo: true };
  DK.posError = ''; DK.locating = false;
  dkPaint();
}
function dkPickOffice(name) {
  DK.office = name;
  DK.staffId = dkRecall(name, DK.sess.email);
  DK.recent = []; DK.monthRows = []; DK.monthErr = ''; DK.msg = '';
  DK.posError = '';
  const office = (DK.data && dkOffices().find(o => o.name === name)) || null;
  if (office && Dakoku.gpsRequired(office)) {
    DK.pos = null;
    dkLocate();
  } else {
    DK_LOC_SEQ++;
    DK.pos = null;
    DK.locating = false;
    dkPaint();
  }
  dkLoadMonth();
}
function dkPickStaff(id) {
  DK.staffId = id;
  dkRemember(DK.office, DK.sess.email, id);
  DK.msg = '';
  dkPaint();
  dkLoadMonth();
}
async function dkRecent() {
  const v = dkView();
  if (!v.staff || DK.sess.demo) return;
  try {
    const j = await dkRpc({ action: 'recent', staffId: v.staff.id });
    if (v.staff.id === (dkView().staff && dkView().staff.id)) DK.recent = j.rows || [];
  } catch (e) { /* 一覧が取れなくても打刻はできる */ }
}
function dkChangeMonth(delta) {
  DK.month = Dakoku.shiftMonth(DK.month || Dakoku.currentMonthJst(), delta);
  dkLoadMonth();
}
async function dkLoadMonth() {
  const v = dkView();
  if (!DK.month) DK.month = Dakoku.currentMonthJst();
  if (!v.staff) { DK.monthRows = []; DK.monthErr = ''; dkPaint(); return; }
  if (DK.sess.demo) {
    DK.monthRows = [];
    DK.monthErr = '';
    DK.monthBusy = false;
    dkPaint();
    return;
  }
  const staffId = v.staff.id;
  const month = DK.month;
  DK.monthBusy = true; DK.monthErr = '';
  dkPaint();
  try {
    const j = await dkRpc({ action: 'month', staffId: staffId, month: month });
    if (staffId === (dkView().staff && dkView().staff.id) && month === DK.month) {
      DK.monthRows = j.rows || [];
      DK.monthErr = '';
    }
  } catch (e) {
    if (staffId === (dkView().staff && dkView().staff.id) && month === DK.month) {
      DK.monthRows = [];
      DK.monthErr = e.message || '月の打刻を読めませんでした';
    }
  }
  DK.monthBusy = false;
  dkPaint();
}
async function dkPunch(kind) {
  if (DK.busy || !Dakoku.kindOk(kind)) return;
  const v = dkView();
  if (v.mode === 'unregistered' || v.mode === 'noemail') { DK.msg = v.mode === 'unregistered' ? 'ログイン用メールが名簿に未登録です。管理者へ連絡してください。' : 'ログインし直してください。'; DK.bad = true; dkPaint(); return; }
  if (!v.staff) { DK.msg = '職員を特定できません'; DK.bad = true; dkPaint(); return; }
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
    await dkLoadMonth();
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
  DK.month = Dakoku.currentMonthJst(); DK.monthRows = []; DK.monthErr = ''; DK.monthBusy = false;
  DK.pos = null; DK.posError = ''; DK.locating = false;
  DK.req = { loaded: false, admin: false, mine: [], pending: [], done: [], err: '', busy: false, open: false, msg: '', bad: false, adminMsg: '', adminBad: false, form: { date: '', kind: '退勤', time: '', reason: '' } };
  try {
    DK.data = DK.sess.demo ? Dakoku.sample() : await dkRpc({ action: 'bootstrap' });
  } catch (e) {
    $('view').innerHTML = back + `<div class="dk"><h3>出退勤打刻 <small>Registrar entrada/saída</small></h3><div class="ng">${dkEsc(e.message || e)}</div><p class="meta">設定は総務の「打刻設定」から直せます。</p></div>`;
    return;
  }
  const offices = dkOffices();
  if (!DK.office || !offices.some(o => o.name === DK.office)) DK.office = offices.length ? offices[0].name : '';
  const auto = DK.office ? Dakoku.resolveStaff({ email: DK.sess.email, staff: DK.data.staff, office: DK.office, chosenId: '', allowPick: dkAllowPick() }) : null;
  if (auto && auto.staff) DK.staffId = auto.staff.id;
  else if (!DK.staffId) DK.staffId = dkRecall(DK.office, DK.sess.email);
  const cur = offices.find(o => o.name === DK.office);
  const needGps = !!(cur && Dakoku.gpsRequired(cur));
  if (needGps) DK.locating = true;
  dkPaint();
  if (needGps) dkLocate();
  if (offices.length) dkLoadMonth();
  dkLoadRequests();
}
