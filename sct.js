// ストレスチェック実施者養成研修の運営画面（#sct）。受講者は sct.html。
// 権限は sct_is_admin（app_metadata.role が 事務 または sct_admin）。判定の正は DB の sct_progress。
const SCT = { tab: 'sessions', D: null, back: '', edit: null, form: null, year: '' };
const SCT_TABS = [['sessions', '開催'], ['people', '受講者・出席'], ['pay', '入金・返金'], ['ledger', '帳簿'], ['meet', 'Meet受信'], ['report', '年次CSV'], ['teachers', '講師']];
const SCT_SST = { draft: '下書き', open: '募集中', closed: '締切', cancelled: '中止', done: '実施済' };
const SCT_BST = { reserved: '予約', cancelled: '取消', attended: '出席', excluded: '出席外し', no_show: '無断欠席' };
const SCT_PST = { pending: '未入金', paid: '入金済', failed: '失敗', waived: '課金なし', refund_pending: '返金手続き中', refunded_full: '全額返金', refunded_half: '半額返金', refund_none: '返金なし' };
const SCT_PLAN = { bundle: '3科目', exempt_s1: '科目1免除', exempt_all: '全免除' };
const sctEsc = s => (window.Sct ? Sct.esc(s) : String(s ?? ''));
function sctCss() {
  if (document.getElementById('sctcss')) return;
  const s = document.createElement('style'); s.id = 'sctcss';
  s.textContent = `.sctw{overflow-x:auto} .sctt{width:100%;font-size:16px;background:#fff4dc;color:#1c140c} .sctt th{background:#1a2744;color:#fff6e4} .sctt td,.sctt th{padding:6px 4px;vertical-align:top}
  .sctb{width:auto;display:inline-block;margin:2px 4px 2px 0;padding:8px 12px;font-size:16px} .sctb.g{background:#fff4dc;color:#1c140c;border:3px solid #1a120c;box-shadow:3px 3px 0 #1a120c}
  .sctf label{display:block;font-size:16px;color:#4e4336;margin-top:6px} .sctf input,.sctf select,.sctf textarea{width:100%;box-sizing:border-box;font-size:17px}
  .scttabs button{width:auto;margin:0 6px 8px 0} .sctnote{color:#ead9b4;font-size:16px}
  a.sctman{color:var(--px-gold,#f2c14e);font-weight:700;font-size:17px}`;
  document.head.appendChild(s);
}
function sctJstInput(iso) {
  if (!iso) return '';
  const s = new Date(iso).toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo' });
  return s.replace(' ', 'T').slice(0, 16);
}
const sctFromInput = v => v ? v + ':00+09:00' : null;
const sctYen = n => (n == null ? '—' : Number(n).toLocaleString('ja-JP') + '円');
async function sctSb(path, opt = {}, retried) {
  let s = JSON.parse(localStorage.getItem('sess') || '{}');
  if (s.exp && s.exp < Date.now() + 30000 && !retried && typeof refreshSess === 'function') { if (await refreshSess()) s = JSON.parse(localStorage.getItem('sess') || '{}'); }
  const r = await fetch(C.supabaseUrl + '/rest/v1/' + path, { ...opt, headers: { apikey: C.supabaseKey, Authorization: 'Bearer ' + s.token, 'Content-Type': 'application/json', ...(opt.headers || {}) } });
  if (r.status === 401 && !retried && typeof refreshSess === 'function' && await refreshSess()) return sctSb(path, opt, true);
  const tx = await r.text();
  if (!r.ok) { let msg = tx; try { msg = JSON.parse(tx).message || tx; } catch (e) { /* 本文のまま */ } throw new Error(msg || ('エラー ' + r.status)); }
  if (!tx) return null;
  return JSON.parse(tx);
}
function sctDemo() {
  const ins = '11111111-1111-4111-8111-111111111111';
  const sessions = [
    { id: 's1', subject_id: 1, instructor_id: ins, instructor_name: '西岡愛梨', starts_at: '2026-11-20T10:00:00+09:00', ends_at: '2026-11-20T12:00:00+09:00', capacity: 20, status: 'done', meet_url: 'https://meet.google.com/demo-sct-sub1', meet_space: 'spaces/demo1', note: '' },
    { id: 's2', subject_id: 2, instructor_id: ins, instructor_name: '西岡愛梨', starts_at: '2026-11-21T10:00:00+09:00', ends_at: '2026-11-21T11:30:00+09:00', capacity: 20, status: 'open', meet_url: 'https://meet.google.com/demo-sct-sub2', meet_space: 'spaces/demo2', note: '' },
    { id: 's3', subject_id: 3, instructor_id: ins, instructor_name: '西岡愛梨', starts_at: '2026-11-22T10:00:00+09:00', ends_at: '2026-11-22T11:30:00+09:00', capacity: 20, status: 'open', meet_url: 'https://meet.google.com/demo-sct-sub3', meet_space: 'spaces/demo3', note: '' },
  ];
  return {
    subjects: Sct.SUBJECTS.map(s => ({ id: s.id, name: s.name, min_minutes: s.minMinutes })),
    instructors: [{ id: ins, name: '西岡愛梨', active: true, note: '実務年数は運用で照合' }],
    settings: { '返金': Sct.REFUND_POLICY, '法人名': '一般社団法人 心理社会的リハビリテーション・星心会', '証明者': '代表理事 齊藤連' },
    profiles: [
      { user_id: 'u1', full_name: '見本 花子', email: 'hana@example.com', license_type: '看護師', exemption: 'none', exemption_status: 'none', identity_status: 'verified' },
      { user_id: 'u2', full_name: '見本 太郎', email: 'taro@example.com', license_type: '公認心理師', exemption: 'subject1', exemption_status: 'pending', identity_status: 'pending', exemption_proof_path: 'demo' },
    ],
    sessions,
    bookings: [
      { id: 'b1', user_id: 'u1', session_id: 's1', status: 'attended' },
      { id: 'b2', user_id: 'u1', session_id: 's2', status: 'attended' },
      { id: 'b4', user_id: 'u1', session_id: 's3', status: 'attended' },
      { id: 'b3', user_id: 'u2', session_id: 's2', status: 'reserved' },
    ],
    attendance: [
      { id: 'a1', booking_id: 'b1', joined_at: '2026-11-20T10:00:00+09:00', left_at: '2026-11-20T12:00:00+09:00', camera_off: false, source: 'manual' },
      { id: 'a2', booking_id: 'b2', joined_at: '2026-11-21T10:00:00+09:00', left_at: '2026-11-21T11:30:00+09:00', camera_off: false, source: 'manual' },
      { id: 'a3', booking_id: 'b4', joined_at: '2026-11-22T10:00:00+09:00', left_at: '2026-11-22T11:30:00+09:00', camera_off: false, source: 'manual' },
    ],
    payments: [
      { id: 'p1', user_id: 'u1', plan: 'bundle', amount_yen: 12800, method: 'square', status: 'paid', paid_at: '2026-10-01T10:00:00+09:00', square_payment_id: 'sq_demo', square_order_id: 'order_demo' },
      { id: 'p2', user_id: 'u2', plan: 'bundle', amount_yen: 12800, method: 'bank', status: 'pending' },
    ],
    certificates: [],
    meets: [{ id: 'm1', received_at: '2026-11-21T01:05:00Z', event_type: 'google.workspace.meet.participant.v2.joined', display_name: '見本 太郎', start_time: '2026-11-21T01:00:00Z', end_time: '2026-11-21T02:30:00Z', resource_name: 'conferenceRecords/demo/participants/p/participantSessions/s', space_name: 'spaces/demo2' }],
  };
}
function sctShape(raw) {
  const inst = Object.fromEntries((raw.instructors || []).map(i => [i.id, i.name]));
  const access = Object.fromEntries((raw.access || []).map(a => [a.session_id, a]));
  raw.sessions = (raw.sessions || []).map(s => ({ ...s, instructor_name: inst[s.instructor_id] || '', meet_url: (access[s.id] || {}).meet_url || '', meet_space: (access[s.id] || {}).meet_space || '' }));
  if (Array.isArray(raw.settings)) raw.settings = Object.fromEntries(raw.settings.map(s => [s.key, s.value]));
  return raw;
}
async function sctLoad() {
  const [subjects, instructors, settings, profiles, sessions, access, bookings, payments, attendance, certificates, meets] = await Promise.all([
    sctSb('sct_subjects?order=id'), sctSb('sct_instructors?order=name'), sctSb('sct_settings'),
    sctSb('sct_profiles?order=created_at.desc'), sctSb('sct_sessions?order=starts_at.desc'), sctSb('sct_session_access'),
    sctSb('sct_bookings?order=created_at.desc'), sctSb('sct_payments?order=created_at.desc'),
    sctSb('sct_attendance?order=created_at.desc'), sctSb('sct_certificates?order=issued_at.desc'),
    sctSb('sct_meet_events?order=received_at.desc&limit=100'),
  ]);
  SCT.D = sctShape({ subjects, instructors, settings, profiles, sessions, access, bookings, payments, attendance, certificates, meets });
}
function sctProg(uid) {
  const p = SCT.D.profiles.find(x => x.user_id === uid) || { user_id: uid };
  return Sct.progress({
    profile: p,
    subjects: SCT.D.subjects.map(s => ({ id: s.id, name: s.name, minMinutes: s.min_minutes })),
    sessions: SCT.D.sessions, bookings: SCT.D.bookings, attendance: SCT.D.attendance,
  });
}
const sctName = uid => (SCT.D.profiles.find(p => p.user_id === uid) || {}).full_name || '（無名）';
const sctSub = id => (SCT.D.subjects.find(s => s.id === id) || {}).name || '';
const sctSess = id => SCT.D.sessions.find(s => s.id === id) || {};
function sctPayOf(uid) { return (SCT.D.payments || []).find(p => p.user_id === uid && p.status !== 'failed') || null; }
async function sctRefresh() { if (typeof DEMO === 'undefined' || !DEMO) await sctLoad(); sctDraw(); }
async function renderSct() {
  document.body.classList.add('wide-sheet');
  sctCss();
  SCT.back = `<button class="back" onclick="location.hash=''">← トップへ</button>`;
  if (typeof DEMO !== 'undefined' && DEMO) {
    if (typeof ROLE === 'undefined' || (ROLE !== '事務' && ROLE !== 'sct_admin')) { $('view').innerHTML = SCT.back + '<h3>実施者養成研修</h3><p>見本では、事務の見え方にしてから開いてください。</p>'; return; }
    SCT.D = sctDemo(); SCT.year = SCT.year || '2026'; return sctDraw();
  }
  const admin = typeof sctIsAdmin === 'function' && await sctIsAdmin();
  if (!admin) { $('view').innerHTML = SCT.back + '<h3>実施者養成研修</h3><p>事務または sct_admin だけが使えます。権限を付けたあとは入り直してください。受講者の入口は <a href="sct.html">sct.html</a> です。</p>'; return; }
  try { await sctLoad(); if (!SCT.year) SCT.year = Sct.jstYear(new Date()); sctDraw(); }
  catch (e) { $('view').innerHTML = SCT.back + `<h3>実施者養成研修</h3><p>読み込めませんでした。supabase/sct.sql の適用を確認してください。</p><p>${sctEsc(e.message)}</p>`; }
}
function sctDraw() {
  const tabs = `<p class="scttabs">${SCT_TABS.map(([k, l]) => `<button class="sctb ${SCT.tab === k ? '' : 'g'}" onclick="SCT.tab='${k}';SCT.form=null;sctDraw()">${l}</button>`).join('')}</p>`;
  const body = { sessions: sctViewSessions, people: sctViewPeople, pay: sctViewPay, ledger: sctViewLedger, meet: sctViewMeet, report: sctViewReport, teachers: sctViewTeachers }[SCT.tab]();
  const preview = SCT.preview ? `<div class="card" id="sctcert">${SctCert.fragment(SCT.preview)}</div>` : '';
  $('view').innerHTML = `${SCT.back}<h3>ストレスチェック実施者養成（運営）</h3><p><a class="sctman" href="sct-ops.html">運用マニュアル</a></p><p class="sctnote">受講者の入口は <a href="sct.html">sct.html</a>。オンデマンドは不可。ビデオONは運営が目視し、2分を超えてカメラが切れていた回は出席から外します。${typeof DEMO !== 'undefined' && DEMO ? ' 見本データです。' : ''}</p>${tabs}<div id="sctmsg"></div>${preview}${body}`;
}
function sctMsg(t, bad) { const el = document.getElementById('sctmsg'); if (el) el.innerHTML = `<p class="${bad ? 'ng' : 'ok'}" style="background:${bad ? '#fde2e2' : '#dff3e4'};padding:8px;border-radius:8px">${sctEsc(t)}</p>`; }
function sctViewSessions() {
  const ins = SCT.D.instructors.filter(i => i.active);
  const e = SCT.edit ? sctSess(SCT.edit) : {};
  const opt = (list, id, label) => list.map(x => `<option value="${x.id}" ${String(x.id) === String(id) ? 'selected' : ''}>${sctEsc(label(x))}</option>`).join('');
  const form = `<div class="card sctf"><h4>${SCT.edit ? '開催を直す' : '開催を追加'}</h4>
    <label>科目<select id="sc_sub">${opt(SCT.D.subjects, e.subject_id || 1, s => s.name)}</select></label>
    <label>講師<select id="sc_ins"><option value="">（未設定）</option>${opt(ins, e.instructor_id || (ins[0] && ins[0].id), s => s.name)}</select></label>
    <label>開始（日本時間）<input id="sc_start" type="datetime-local" value="${sctEsc(sctJstInput(e.starts_at))}"></label>
    <label>終了（日本時間）<input id="sc_end" type="datetime-local" value="${sctEsc(sctJstInput(e.ends_at))}"></label>
    <label>定員<input id="sc_cap" type="number" min="1" value="${e.capacity || 20}"></label>
    <label>状態<select id="sc_st">${Object.entries(SCT_SST).map(([k, v]) => `<option value="${k}" ${(e.status || 'draft') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    <label>Meet URL<input id="sc_meet" value="${sctEsc(e.meet_url || '')}" placeholder="https://meet.google.com/..."></label>
    <label>Meet space 名<input id="sc_space" value="${sctEsc(e.meet_space || '')}" placeholder="spaces/..."></label>
    <label>メモ<textarea id="sc_note" rows="2">${sctEsc(e.note || '')}</textarea></label>
    <p><button class="sctb" onclick="sctSaveSession()">保存</button>${SCT.edit ? '<button class="sctb g" onclick="SCT.edit=null;sctDraw()">やめる</button>' : ''}</p></div>`;
  const rows = SCT.D.sessions.map(s => `<tr><td>${sctEsc(sctSub(s.subject_id))}</td><td>${sctEsc(s.instructor_name)}</td><td>${sctEsc(sctJstInput(s.starts_at).replace('T', ' '))}</td><td>${SCT_SST[s.status] || ''}</td><td>${s.capacity}</td><td>${sctEsc(s.meet_space || '')}</td><td><button class="sctb g" onclick="SCT.edit='${s.id}';sctDraw()">直す</button></td></tr>`).join('');
  return form + `<div class="sctw"><table class="sctt"><tr><th>科目</th><th>講師</th><th>開始</th><th>状態</th><th>定員</th><th>space</th><th></th></tr>${rows || '<tr><td colspan="7">まだありません</td></tr>'}</table></div>`;
}
async function sctSaveSession() {
  const row = { subject_id: +document.getElementById('sc_sub').value, instructor_id: document.getElementById('sc_ins').value || null, starts_at: sctFromInput(document.getElementById('sc_start').value), ends_at: sctFromInput(document.getElementById('sc_end').value), capacity: +document.getElementById('sc_cap').value, status: document.getElementById('sc_st').value, note: document.getElementById('sc_note').value || null };
  if (!row.starts_at || !row.ends_at || !(row.capacity > 0)) return sctMsg('日時と定員を入れてください', true);
  const meet = { meet_url: document.getElementById('sc_meet').value.trim() || null, meet_space: document.getElementById('sc_space').value.trim() || null };
  if (meet.meet_url && !Sct.safeUrl(meet.meet_url)) return sctMsg('Meet URL は https にしてください', true);
  try {
    if (typeof DEMO !== 'undefined' && DEMO) {
      const ins = SCT.D.instructors.find(i => i.id === row.instructor_id);
      const base = { ...row, instructor_name: ins ? ins.name : '', ...meet };
      if (SCT.edit) Object.assign(sctSess(SCT.edit), base); else SCT.D.sessions.unshift({ id: 's' + Date.now(), ...base });
    } else if (SCT.edit) {
      await sctSb('sct_sessions?id=eq.' + SCT.edit, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(row) });
      await sctSb('sct_session_access', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ session_id: SCT.edit, ...meet }) });
    } else {
      const made = await sctSb('sct_sessions', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row) });
      await sctSb('sct_session_access', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ session_id: made[0].id, ...meet }) });
    }
    SCT.edit = null; await sctRefresh();
  } catch (e) { sctMsg(e.message, true); }
}
function sctViewPeople() {
  const people = SCT.D.profiles.map(p => {
    const g = sctProg(p.user_id), pay = sctPayOf(p.user_id);
    const mins = g.subjects.filter(s => s.required).map(s => `${s.id}:${s.minutes}/${s.min_minutes}`).join(' ') || '対象なし';
    return `<tr><td>${sctEsc(p.full_name)}<br><span class="sctnote">${sctEsc(p.email || '')}</span></td><td>${sctEsc(p.license_type || '')}</td><td>${p.exemption}${p.exemption_status ? ' / ' + p.exemption_status : ''}${p.exemption_proof_path ? `<br><button class="sctb g" onclick="sctProof('${p.user_id}','exemption')">免除の証明</button>` : ''}</td><td>${p.identity_status}${p.identity_proof_path ? `<br><button class="sctb g" onclick="sctProof('${p.user_id}','identity')">本人確認書類</button>` : ''}</td><td>${pay ? SCT_PST[pay.status] : 'なし'}</td><td>${sctEsc(mins)}<br>${g.complete ? '修了可' : sctEsc(g.blocked_reason || '')}</td>
      <td><button class="sctb g" onclick="sctSetIdentity('${p.user_id}','verified')">本人確認済</button><button class="sctb g" onclick="sctSetIdentity('${p.user_id}','rejected')">本人差戻し</button><button class="sctb g" onclick="sctSetExemption('${p.user_id}','approved')">免除を認める</button><button class="sctb g" onclick="sctSetExemption('${p.user_id}','rejected')">免除を却下</button><button class="sctb" onclick="sctIssue('${p.user_id}')">修了処理</button></td></tr>`;
  }).join('');
  const books = SCT.D.bookings.map(b => {
    const s = sctSess(b.session_id);
    const logs = SCT.D.attendance.filter(a => a.booking_id === b.id && !a.camera_off && a.joined_at);
    const last = logs[logs.length - 1] || {};
    return `<tr><td>${sctEsc(sctName(b.user_id))}</td><td>${sctEsc(sctSub(s.subject_id))}<br>${sctEsc(sctJstInput(s.starts_at).replace('T', ' '))}</td><td>${SCT_BST[b.status] || b.status}</td><td>${Sct.countedMinutes(s, b, SCT.D.attendance)}分</td>
      <td><button class="sctb g" onclick="sctOpenAttend('${b.id}','${sctEsc(sctJstInput(last.joined_at))}','${sctEsc(sctJstInput(last.left_at))}')">入退室</button>
      <button class="sctb g" onclick="sctCam('${b.id}')">カメラOFFで出席外し</button>
      <button class="sctb g" onclick="sctBookStatus('${b.id}','attended')">出席</button>
      <button class="sctb g" onclick="sctBookStatus('${b.id}','no_show')">無断欠席</button></td></tr>`;
  }).join('');
  const form = SCT.form && SCT.form.kind === 'attend' ? `<div class="card sctf"><h4>入退室（日本時間）</h4><label>入室<input id="at_in" type="datetime-local" value="${sctEsc(SCT.form.join)}"></label><label>退室<input id="at_out" type="datetime-local" value="${sctEsc(SCT.form.leave)}"></label><p><button class="sctb" onclick="sctSaveAttend()">記録する</button><button class="sctb g" onclick="SCT.form=null;sctDraw()">やめる</button></p><p class="sctnote">Meetの自動出席はまだ使いません。受信タブの時刻を見て、ここへ記録してください。</p></div>` : '';
  return `${form}<h4>受講者</h4><div class="sctw"><table class="sctt"><tr><th>氏名</th><th>資格</th><th>免除</th><th>本人</th><th>入金</th><th>視聴</th><th></th></tr>${people || '<tr><td colspan="7">なし</td></tr>'}</table></div>
    <h4>予約</h4><div class="sctw"><table class="sctt"><tr><th>氏名</th><th>開催</th><th>状態</th><th>視聴</th><th></th></tr>${books || '<tr><td colspan="5">なし</td></tr>'}</table></div>`;
}
function sctOpenAttend(id, join, leave, source) { SCT.form = { kind: 'attend', id, join, leave, source: source || 'manual' }; SCT.tab = 'people'; sctDraw(); }
async function sctSaveAttend() {
  const f = SCT.form; if (!f) return;
  const joined_at = sctFromInput(document.getElementById('at_in').value), left_at = sctFromInput(document.getElementById('at_out').value);
  if (!joined_at || !left_at) return sctMsg('入室と退室を入れてください', true);
  try {
    const source = f.source || 'manual';
    if (typeof DEMO !== 'undefined' && DEMO) SCT.D.attendance.push({ id: 'a' + Date.now(), booking_id: f.id, joined_at, left_at, camera_off: false, source });
    else await sctSb('sct_attendance', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ booking_id: f.id, joined_at, left_at, source, camera_off: false }) });
    SCT.form = null; await sctRefresh();
  } catch (e) { sctMsg(e.message, true); }
}
async function sctCam(id) {
  if (!confirm('この回を、カメラOFF（2分超）として出席から外します。')) return;
  try {
    if (typeof DEMO !== 'undefined' && DEMO) { const b = SCT.D.bookings.find(x => x.id === id); if (b) b.status = 'excluded'; SCT.D.attendance.push({ booking_id: id, camera_off: true, source: 'manual' }); }
    else await sctSb('sct_attendance', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ booking_id: id, camera_off: true, source: 'manual', note: 'カメラOFF 2分超' }) });
    await sctRefresh();
  } catch (e) { alert(e.message); }
}
async function sctBookStatus(id, status) {
  try {
    if (typeof DEMO !== 'undefined' && DEMO) { const b = SCT.D.bookings.find(x => x.id === id); if (b) b.status = status; }
    else await sctSb('sct_bookings?id=eq.' + id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status }) });
    await sctRefresh();
  } catch (e) { alert(e.message); }
}
async function sctPatchProfile(uid, row) {
  try {
    if (typeof DEMO !== 'undefined' && DEMO) Object.assign(SCT.D.profiles.find(p => p.user_id === uid), row);
    else await sctSb('sct_profiles?user_id=eq.' + uid, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(row) });
    await sctRefresh();
  } catch (e) { alert(e.message); }
}
function sctSetIdentity(uid, status) { return sctPatchProfile(uid, { identity_status: status }); }
function sctSetExemption(uid, status) { return sctPatchProfile(uid, { exemption_status: status }); }
async function sctProof(uid, kind) {
  const p = SCT.D.profiles.find(x => x.user_id === uid) || {};
  const path = kind === 'identity' ? p.identity_proof_path : p.exemption_proof_path;
  if (!path || path === 'demo' || typeof DEMO !== 'undefined' && DEMO) return alert('見本のためファイルはありません。');
  const s = JSON.parse(localStorage.getItem('sess') || '{}');
  const r = await fetch(C.supabaseUrl + '/storage/v1/object/sign/sct-proofs/' + path.split('/').map(encodeURIComponent).join('/'), { method: 'POST', headers: { apikey: C.supabaseKey, Authorization: 'Bearer ' + s.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 300 }) });
  const j = await r.json();
  if (!r.ok) return alert('ファイルを開けません');
  window.open(C.supabaseUrl + '/storage/v1' + j.signedURL, '_blank');
}
async function sctIssue(uid) {
  try {
    if (typeof DEMO !== 'undefined' && DEMO) {
      const g = sctProg(uid);
      if (!g.complete) return alert(g.blocked_reason);
      if (SCT.D.certificates.some(c => c.user_id === uid)) return alert('発行済みです');
      const subjects = g.subjects.filter(s => s.required).map(s => ({ id: s.id, name: s.name }));
      const instructors = [...new Set(g.subjects.filter(s => s.required).flatMap(s => s.instructors))];
      const snap = { full_name: g.full_name, issued_on: Sct.jstDate(new Date()), subjects, instructors, org: SCT.D.settings['法人名'], signer: SCT.D.settings['証明者'], license_type: g.license_type };
      SCT.D.certificates.push({ user_id: uid, subjects, snapshot: snap });
      SCT.preview = snap;
      sctShowCert(snap); await sctRefresh(); return;
    }
    const id = await sctSb('rpc/sct_issue_certificate', { method: 'POST', body: JSON.stringify({ p_user: uid }) });
    const rows = await sctSb('sct_certificates?id=eq.' + id + '&select=snapshot');
    SCT.preview = rows[0].snapshot;
    sctShowCert(rows[0].snapshot); await sctRefresh();
  } catch (e) { alert(e.message); }
}
function sctShowCert(snap) {
  const w = window.open('', '_blank');
  const html = SctCert.html(snap);
  if (w) { w.document.write(html); w.document.close(); }
  else {
    const blob = new Blob([html], { type: 'text/html' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'sct-certificate.html'; a.click();
  }
}
function sctViewPay() {
  const policy = (SCT.D.settings && SCT.D.settings['返金']) || Sct.REFUND_POLICY;
  const rows = SCT.D.payments.map(p => `<tr><td>${sctEsc(sctName(p.user_id))}</td><td>${SCT_PLAN[p.plan] || p.plan}</td><td>${sctYen(p.amount_yen)}</td><td>${sctEsc(Sct.methodLabel(p.method))}</td><td>${SCT_PST[p.status] || p.status}</td><td>${sctEsc(p.note || '')}</td>
    <td>${p.status === 'pending' && p.method === 'bank' ? `<button class="sctb" onclick="sctMarkPaid('${p.id}')">入金確認</button>` : ''}${p.status === 'pending' ? `<button class="sctb g" onclick="sctFailPay('${p.id}')">無効</button>` : ''}${p.status === 'paid' ? `<button class="sctb g" onclick="sctOpenRefund('${p.id}')">返金を記録</button>` : ''}</td></tr>`).join('');
  const opts = SCT.D.profiles.map(p => `<option value="${p.user_id}">${sctEsc(p.full_name)}</option>`).join('');
  const refund = SCT.form && SCT.form.kind === 'refund' ? sctRefundForm() : '';
  return `<p class="sctnote">${sctEsc(policy)}</p>${refund}<div class="card sctf"><h4>振込を記録</h4><label>受講者<select id="bk_user">${opts}</select></label><label>メモ<input id="bk_note" placeholder="振込人名など"></label><p><button class="sctb" onclick="sctSaveBank()">未入金として記録</button></p><p class="sctnote">金額はプロフィールの免除区分から決まります。Squareの未完了があるときは先に無効にしてください。</p></div>
    <div class="sctw"><table class="sctt"><tr><th>氏名</th><th>区分</th><th>金額</th><th>方法</th><th>状態</th><th>メモ</th><th></th></tr>${rows || '<tr><td colspan="7">なし</td></tr>'}</table></div>`;
}
function sctRefundForm() {
  const p = SCT.D.payments.find(x => x.id === SCT.form.id);
  const seats = SCT.D.bookings.filter(b => b.user_id === p.user_id && b.status !== 'cancelled').map(b => sctSess(b.session_id).starts_at).filter(Boolean).sort();
  const sug = Sct.refundSuggestion({ amountYen: p.amount_yen, feeYen: 0, sessionStartsAt: seats[0], now: new Date(), plan: p.plan });
  return `<div class="card sctf"><h4>${sctEsc(sctName(p.user_id))} の返金</h4><p>提案: ${sctEsc(sug.label)} → ${sctYen(sug.amount)}。${sug.preferTransfer ? '振替を優先してください。' : ''}</p>
    <label>区分<select id="rf_kind"><option value="refunded_full">全額（主催都合、または7日前まで）</option><option value="refunded_half">半額</option><option value="refund_none">返金なし</option><option value="refund_pending">手続き中</option></select></label>
    <label>返金額<input id="rf_amt" type="number" value="${sug.amount}"></label>
    <label>手数料実費（記録のみ）<input id="rf_fee" type="number" value="0"></label>
    <label>理由<input id="rf_why" value="${sctEsc(sug.label)}"></label>
    <p><button class="sctb" onclick="sctSaveRefund()">記録する</button><button class="sctb g" onclick="SCT.form=null;sctDraw()">やめる</button></p></div>`;
}
function sctOpenRefund(id) { SCT.form = { kind: 'refund', id }; SCT.tab = 'pay'; sctDraw(); }
async function sctSaveBank() {
  const uid = document.getElementById('bk_user').value;
  const p = SCT.D.profiles.find(x => x.user_id === uid);
  const plan = Sct.pricePlan(p.exemption, p.exemption_status);
  if (!plan.plan) return sctMsg(plan.blocked, true);
  const row = { user_id: uid, plan: plan.plan, amount_yen: plan.amountYen, method: plan.amountYen ? 'bank' : 'none', status: plan.amountYen ? 'pending' : 'waived', note: document.getElementById('bk_note').value || null };
  try {
    if (typeof DEMO !== 'undefined' && DEMO) {
      if (SCT.D.payments.some(x => x.user_id === uid && x.status !== 'failed' && x.status !== 'refunded_full')) return sctMsg('有効な決済がすでにあります', true);
      SCT.D.payments.unshift({ id: 'p' + Date.now(), ...row });
    } else await sctSb('sct_payments', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(row) });
    await sctRefresh();
  } catch (e) { sctMsg(e.message, true); }
}
async function sctMarkPaid(id) { await sctPayPatch(id, { status: 'paid' }); }
async function sctFailPay(id) { await sctPayPatch(id, { status: 'failed', note: '運営が無効化' }); }
async function sctSaveRefund() {
  const id = SCT.form.id;
  const row = { status: document.getElementById('rf_kind').value, refund_amount_yen: +document.getElementById('rf_amt').value, processor_fee_yen: +document.getElementById('rf_fee').value, refund_reason: document.getElementById('rf_why').value };
  SCT.form = null;
  await sctPayPatch(id, row);
}
async function sctPayPatch(id, row) {
  try {
    if (typeof DEMO !== 'undefined' && DEMO) Object.assign(SCT.D.payments.find(p => p.id === id), row);
    else await sctSb('sct_payments?id=eq.' + id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(row) });
    await sctRefresh();
  } catch (e) { alert(e.message); }
}
function sctPayRef(p) { return p.square_payment_id || p.square_order_id || p.stripe_session_id || ''; }
function sctViewLedger() {
  const rows = SCT.D.payments.map(p => `<tr><td>${sctEsc((p.paid_at || p.created_at || '').slice(0, 10))}</td><td>${sctEsc(sctName(p.user_id))}</td><td>${SCT_PLAN[p.plan] || ''}</td><td>${sctYen(p.amount_yen)}</td><td>${sctEsc(Sct.methodLabel(p.method))}</td><td>${SCT_PST[p.status] || ''}</td><td>${sctYen(p.refund_amount_yen)}</td><td>${sctEsc(sctPayRef(p))}</td><td>${sctEsc(p.refund_reason || p.note || '')}</td></tr>`).join('');
  return `<p class="sctnote">この一覧は削除しません。返金も行を消さず状態を変えます。返金の実行は Square のダッシュボードで行い、ここには結果だけを残します。</p><div class="sctw"><table class="sctt"><tr><th>日付</th><th>氏名</th><th>区分</th><th>金額</th><th>方法</th><th>状態</th><th>返金</th><th>決済ID</th><th>メモ</th></tr>${rows || '<tr><td colspan="9">なし</td></tr>'}</table></div>`;
}
function sctViewMeet() {
  const rows = (SCT.D.meets || []).map(m => `<tr><td>${sctEsc(sctJstInput(m.received_at).replace('T', ' '))}</td><td>${sctEsc(m.event_type || '')}</td><td>${sctEsc(m.display_name || '')}</td><td>${sctEsc(sctJstInput(m.start_time).replace('T', ' '))}</td><td>${sctEsc(sctJstInput(m.end_time).replace('T', ' '))}</td><td>${sctEsc(m.space_name || '')}</td><td><button class="sctb g" onclick="sctUseMeet('${m.id}')">出席に転記</button></td></tr>`).join('');
  return `<p class="sctnote">受信した入退室です。自動では出席になりません。本人と開催を確認してから転記してください。リソース名は Meet の participantSessions です。</p><div class="sctw"><table class="sctt"><tr><th>受信</th><th>種類</th><th>表示名</th><th>開始</th><th>終了</th><th>space</th><th></th></tr>${rows || '<tr><td colspan="7">まだ受信していません</td></tr>'}</table></div>`;
}
function sctUseMeet(id) {
  const m = SCT.D.meets.find(x => x.id === id);
  const hit = SCT.D.bookings.filter(b => sctName(b.user_id) && m.display_name && sctName(b.user_id) === m.display_name);
  if (hit.length !== 1) return alert('表示名が予約1件と一致しません。受講者・出席タブで手入力してください。');
  sctOpenAttend(hit[0].id, sctJstInput(m.start_time), sctJstInput(m.end_time), 'meet');
}
function sctViewReport() {
  const rows = Sct.annualRows({ year: SCT.year || Sct.jstYear(new Date()), sessions: SCT.D.sessions, bookings: SCT.D.bookings, attendance: SCT.D.attendance, certificates: SCT.D.certificates, subjects: SCT.D.subjects.map(s => ({ id: s.id, name: s.name })) });
  SCT._rows = rows;
  const body = rows.map(r => `<tr><td>${r.year}</td><td>${r.subject_id}</td><td>${sctEsc(r.subject_name)}</td><td>${sctEsc(r.instructor_name)}</td><td>${r.sessions}</td><td>${r.graduates}</td></tr>`).join('');
  return `<p class="sctnote">開催年は開始日時の日本時間。中止は回数に入れません。修了者数は、その開催で視聴が1分以上あり、その科目を含む修了証がある人数です。</p>
    <label>年 <input id="sc_year" type="number" value="${sctEsc(SCT.year || Sct.jstYear(new Date()))}" style="width:8em"></label> <button class="sctb g" onclick="SCT.year=document.getElementById('sc_year').value;sctDraw()">表示</button> <button class="sctb" onclick="sctCsv()">CSV</button>
    <div class="sctw"><table class="sctt"><tr><th>開催年</th><th>科目ID</th><th>科目名</th><th>講師名</th><th>開催回数</th><th>修了者数</th></tr>${body || '<tr><td colspan="6">なし</td></tr>'}</table></div>`;
}
function sctCsv() {
  const csv = Sct.toCsv(SCT._rows || []);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `sct-annual-${SCT.year || 'year'}.csv`; a.click();
}
function sctViewTeachers() {
  const rows = SCT.D.instructors.map(i => `<tr><td>${sctEsc(i.name)}</td><td>${i.active ? '有効' : '停止'}</td><td>${sctEsc(i.note || '')}</td></tr>`).join('');
  return `<div class="card sctf"><h4>講師を追加</h4><label>氏名<input id="tc_name"></label><label>メモ<input id="tc_note" placeholder="実務年数の照合メモ"></label><p><button class="sctb" onclick="sctSaveTeacher()">追加</button></p><p class="sctnote">既定は西岡愛梨。実務年数の要件はここで自動判定しません。</p></div>
    <table class="sctt"><tr><th>氏名</th><th>状態</th><th>メモ</th></tr>${rows}</table>`;
}
async function sctSaveTeacher() {
  const name = document.getElementById('tc_name').value.trim();
  if (!name) return;
  const row = { name, note: document.getElementById('tc_note').value || null, active: true };
  try {
    if (typeof DEMO !== 'undefined' && DEMO) SCT.D.instructors.push({ id: 'i' + Date.now(), ...row });
    else await sctSb('sct_instructors', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(row) });
    await sctRefresh();
  } catch (e) { alert(e.message); }
}
