// 法定研修・従業者管理（GAS版 v1.4.0 のSupabase版）。データは Supabase（ht_ の表）。個人データはこのファイルに入れない
// アクセス制御はDB側（RLS・supabase/houtei.sql）。画面はそれに従って見せるだけ
const HT = { tab: 'home', office: 'all', D: null, fy: null };
const HT_TABS = [['home', 'ホーム'], ['staff', '職員'], ['train', '研修'], ['comm', '委員会'], ['cal', '年間カレンダー'], ['set', '設定']];
const htFy = (d = new Date(Date.now() + 9 * 36e5)) => (d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1);
const htNowM = () => new Date(Date.now() + 9 * 36e5).getUTCMonth() + 1;
const htIdx = m => (m + 8) % 12;                       // 4月=0 … 3月=11
const htRe = fy => '令和' + (fy - 2018) + '年度';
const htPassed = r => r.passed === '合格' || r.passed === '参加';
const htEvLabel = r => r.evidence || '手入力（証跡なし）';
const htHasEv = r => /本人確認あり/.test(r.evidence || '');
const htFmtD = d => d ? new Date(d).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric' }) : '';
const htFmtDT = d => d ? new Date(d).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
function htCss() {
  if (document.getElementById('htcss')) return;
  const s = document.createElement('style'); s.id = 'htcss';
  s.textContent = `.ht main,.htw{max-width:980px}.htk{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin:10px 0}.htk div{background:#fff4dc;border:4px solid #1a120c;border-radius:0;padding:12px;box-shadow:4px 4px 0 #1a120c;text-align:center;color:#1c140c}.htk b{display:block;font-size:35px}
  .htt{width:100%;font-size:24px}.htt th{background:#1a2744;color:#fff6e4;position:sticky;top:0}.htt td,.htt th{padding:6px 5px;vertical-align:top}.htw{overflow-x:auto}
  .htb{width:auto!important;display:inline-block;margin:2px 3px 2px 0!important;padding:6px 10px!important;font-size:24px!important}.htb.g{background:#fff4dc;color:#1c140c;border:3px solid #1a120c;box-shadow:3px 3px 0 #1a120c}
  .chip{display:inline-block;border-radius:0;border:2px solid #1a120c;padding:2px 8px;margin:1px;font-size:23px;background:#e6efe9}.chip.late{background:#fbd9d9;color:#900}.chip.now{background:#fff0b3}.chip.ok{background:#d6ecd9}.chip.ng{background:#fde0cc}
  .htm{position:fixed;inset:0;background:#000a;z-index:50;overflow:auto}.htm>div{background:#fff4dc;color:#1c140c;max-width:560px;margin:20px auto;padding:16px;border:4px solid #1a120c;border-radius:0;box-shadow:6px 6px 0 #07060a}.htm p,.htm label{display:block;font-size:24px;color:#4e4336;margin-top:8px}.htm input,.htm select,.htm textarea{margin:2px 0;padding:8px;font-size:26px;width:100%;box-sizing:border-box}.htm input[type=checkbox],.htm input[type=radio]{width:auto}.htm button{font-size:26px}
  .htbar{background:#fff3cd;border:3px solid #1a120c;border-radius:0;padding:8px 10px;font-size:24px;margin:8px 0;color:#1c140c}.htmo{background:#fff4dc;border:3px solid #1a120c;border-radius:0;padding:10px;margin:8px 0;box-shadow:3px 3px 0 #1a120c;color:#1c140c}.htmo.now{border-left:6px solid #e6b800}`;
  document.head.appendChild(s);
}
async function htTry(path) {
  try { return { ok: true, rows: await sb(path) }; } catch (e) { return { ok: false, rows: [] }; }
}
function htMergeAnswers(qs, keys) {
  const map = {};
  (keys || []).forEach(k => { map[k.training_id + '\t' + k.no] = k.answer; });
  return (qs || []).map(q => { const a = map[q.training_id + '\t' + q.no]; return a == null ? q : Object.assign({}, q, { answer: a }); });
}
async function htLoadQuestions() {
  const base = 'training_id,no,question,opt_a,opt_b,opt_c,opt_d,points';
  const keys = await htTry('ht_question_keys?select=training_id,no,answer&order=training_id,no');
  if (keys.ok) return htMergeAnswers(await sb('ht_questions?select=' + base + '&order=training_id,no'), keys.rows || []);
  return sb('ht_questions?select=' + base + ',answer&order=training_id,no');
}
async function htRpc(name, args) {
  let s = JSON.parse(localStorage.getItem('sess') || '{}');
  if (s.exp && s.exp < Date.now() + 30000 && typeof refreshSess === 'function') {
    if (await refreshSess()) s = JSON.parse(localStorage.getItem('sess') || '{}');
  }
  const r = await fetch(C.supabaseUrl + '/rest/v1/rpc/' + name, {
    method: 'POST',
    headers: { apikey: C.supabaseKey, Authorization: 'Bearer ' + (s.token || ''), 'Content-Type': 'application/json' },
    body: JSON.stringify(args || {})
  });
  const tx = await r.text();
  let body = null; try { body = tx ? JSON.parse(tx) : null; } catch (e) { body = null; }
  if (!r.ok) throw new Error((body && body.message) || ('提出できませんでした（' + r.status + '）'));
  return body;
}
async function htMyStaff() {
  try {
    const rows = await htRpc('ht_my_staff', {});
    return Array.isArray(rows) ? (rows[0] || null) : null;
  } catch (e) { return null; }
}
async function htLoad() {
  const g = p => sb(p);
  const staffCols = 'id,name,kana,email,main_office,sub_offices,employment,job,hired,status,retired,note';
  const [off, staff, tr, mat, qs, ev, evl, com, plan, cl, rec, set, acc, myStaff] = await Promise.all([
    g('ht_offices_t?order=sort'), g('ht_staff?select=' + staffCols + '&order=id'), g('ht_trainings?order=id'), g('ht_materials?order=training_id,sort'), htLoadQuestions(),
    g('ht_events?order=id'), g('ht_event_logs?order=done_on.desc'), g('ht_committees?order=id'), g('ht_committee_plan?order=fy,month'), g('ht_committee_logs?order=held_at.desc'),
    g('ht_records?order=taken_at.desc&limit=5000'), g('ht_settings'), g('ht_access'), htMyStaff()]);
  const me = (JSON.parse(localStorage.getItem('sess') || '{}').email || '').toLowerCase();
  const mine = acc.filter(a => a.email === me);
  const isAll = mine.some(a => !a.office_id && a.can_edit), allRead = mine.some(a => !a.office_id);
  const myOffs = allRead ? off.map(o => o.id) : mine.map(a => a.office_id);
  const editOffs = isAll ? off.map(o => o.id) : mine.filter(a => a.can_edit).map(a => a.office_id);
  HT.D = { off: off.filter(o => myOffs.includes(o.id)), allOff: off, staff, tr, mat, qs, ev, evl, com, plan, cl, rec, set: Object.fromEntries(set.map(s => [s.key, s.value])), acc, me, isAll, myOffs, editOffs, myStaff };
  if (HT.office !== 'all' && !myOffs.includes(HT.office)) HT.office = 'all';
  if (myOffs.length === 1) HT.office = myOffs[0];
}
const htScope = () => HT.office === 'all' ? HT.D.off : HT.D.off.filter(o => o.id === HT.office);
const htOffName = id => (HT.D.allOff.find(o => o.id === id) || {}).name || id;
const htApplies = (it, o) => it.target_types.includes('全事業') || it.target_types.some(t => o.types.includes(t));
const htAppliesScope = it => htScope().some(o => htApplies(it, o));
const htStaffOffs = s => [s.main_office, ...(s.sub_offices || [])].filter(Boolean);
const htSelfOffices = (t, s) => !s || s.status !== '在籍' ? [] : htStaffOffs(s).filter(id => HT.D.myOffs.includes(id) && htApplies(t, HT.D.allOff.find(o => o.id === id) || { types: [] }));
const htViewOnly = () => HT.D && !HT.D.isAll && HT.D.editOffs.length === 0;
const htStaffScope = () => { const ids = htScope().map(o => o.id); return HT.D.staff.filter(s => s.status === '在籍' && htStaffOffs(s).some(x => ids.includes(x))); };
const htRecScope = () => { const ids = htScope().map(o => o.id); return HT.D.rec.filter(r => r.fy === HT.fy && r.offices.some(x => ids.includes(x))); };
// 事業所 o で、職員 s が研修 t を FY 内に何回済ませたか
const htDone = (s, t, o) => HT.D.rec.filter(r => r.fy === HT.fy && r.staff_id === s.id && r.training_id === t.id && htPassed(r) && (!o || r.offices.includes(o.id))).length;
const htDue = t => t.months.filter(m => htIdx(m) <= htIdx(htNowM())).length;   // 今月までに済ませる回数
// 事業所 o の研修 t の対象者
const htTargets = (t, o) => HT.D.staff.filter(s => s.status === '在籍' && htStaffOffs(s).includes(o.id) && htApplies(t, o));
function htTrainStat(t) {
  let target = 0, done = 0, late = 0, evOk = 0, evNg = 0, unconf = 0;
  for (const o of htScope()) { if (!htApplies(t, o)) continue; const opened = !o.start_date || o.start_date <= new Date().toISOString().slice(0, 10);
    for (const s of htTargets(t, o)) { target++; const d = htDone(s, t, o); if (d >= 1) done++; if (opened && d < Math.min(htDue(t), t.times_per_year)) late++; } }
  for (const r of htRecScope().filter(r => r.training_id === t.id)) { htHasEv(r) ? evOk++ : evNg++; if (!r.confirmed_at) unconf++; }
  return { target, done, late, evOk, evNg, unconf };
}
function htModal(title, fields, onSave, okText = '保存', extra = null) {
  const m = document.createElement('div'); m.className = 'htm';
  const f = x => { const v = x.val ?? ''; const id = 'htf_' + x.k;
    if (x.type === 'textarea') return `<label>${x.label}${x.req ? ' *' : ''}<textarea id="${id}" rows="3">${esc(v)}</textarea></label>`;
    if (x.type === 'select') return `<label>${x.label}${x.req ? ' *' : ''}<select id="${id}">${x.opts.map(([a, b]) => `<option value="${esc(a)}"${a === v ? ' selected' : ''}>${esc(b)}</option>`).join('')}</select></label>`;
    if (x.type === 'checks') return `<label>${x.label}</label>${x.opts.map(([a, b]) => `<label style="display:inline-block;margin-right:10px;color:#222"><input type="checkbox" data-k="${x.k}" value="${esc(a)}"${(v || []).includes(a) ? ' checked' : ''}> ${esc(b)}</label>`).join('')}`;
    return `<label>${x.label}${x.req ? ' *' : ''}<input id="${id}" type="${x.type || 'text'}" value="${esc(v)}"></label>`; };
  m.innerHTML = `<div><h3 style="margin-top:0">${title}</h3>${fields.map(f).join('')}<p id="htmsg" style="color:#c00"></p>${extra ? `<button id="htex" class="htb g" style="width:100%!important">${extra[0]}</button>` : ''}<button id="htok">${okText}</button><button class="back" style="width:100%" id="htcancel">やめる</button></div>`;
  document.body.appendChild(m);
  m.querySelector('#htcancel').onclick = () => m.remove();
  const run = async (fn, strict) => {
    const o = {};
    for (const x of fields) { if (x.type === 'checks') o[x.k] = [...m.querySelectorAll(`[data-k="${x.k}"]:checked`)].map(e => e.value); else { const v = m.querySelector('#htf_' + x.k).value.trim(); o[x.k] = v; if (strict && x.req && !v) { m.querySelector('#htmsg').textContent = `「${x.label}」は必須です`; return; } } }
    try { if (await fn(o) === false) return; m.remove(); await htRefresh(); } catch (e) { m.querySelector('#htmsg').textContent = e.message; }
  };
  m.querySelector('#htok').onclick = () => run(onSave, true);
  if (extra) m.querySelector('#htex').onclick = () => run(extra[1], false);
  return m;
}
async function htRefresh() { await htLoad(); htDraw(); }
async function renderHt() {
  const back = `<button class="back" onclick="location.hash=''">← 事業所えらびへ</button>`;
  htCss();
  if (DEMO) { $('view').innerHTML = back + '<h3>法定研修</h3><p>見本モードでは表示しません（個人情報を扱うため、ログインした方だけが見られます）。</p>'; return; }
  $('view').innerHTML = back + '<p>読み込み中…</p>';
  try { HT.fy = htFy(); await htLoad(); } catch (e) { $('view').innerHTML = back + `<p>${esc(e.message)}</p>`; return; }
  if (!HT.D.myOffs.length && !HT.D.isAll) { $('view').innerHTML = back + '<h3>法定研修</h3><p>このアカウントには、法定研修を見る権限がありません。研修統括責任者に権限の追加を頼んでください。</p>'; return; }
  const hp = decodeURIComponent(location.hash.slice(1)).split('?')[0].split('/');
  if (hp[0] === 'ht' && HT_TABS.some(([k]) => k === hp[1])) HT.tab = hp[1];
  htDraw();
  if (hp[0] === 'ht' && hp[1] === 'train' && hp[2]) { const r = document.getElementById('httr_' + hp[2]); if (r) { r.style.outline = '4px solid #E8833A'; r.scrollIntoView({ block: 'center' }); } }
}
function htDraw() {
  const D = HT.D, back = `<button class="back" onclick="location.hash=''">← 事業所えらびへ</button>`;
  const test = (D.set['テストモード'] || '').toUpperCase() === 'TRUE';
  const sw = D.off.length > 1 ? `<select onchange="HT.office=this.value;htDraw()" style="width:auto;display:inline-block">${[['all', '全事業所（統括ビュー）'], ...D.off.map(o => [o.id, o.name])].map(([a, b]) => `<option value="${a}"${a === HT.office ? ' selected' : ''}>${esc(b)}</option>`).join('')}</select>` : `<b>${esc(D.off[0]?.name || '事業所未登録')}</b>`;
  const body = { home: htHome, staff: htStaff, train: htTrain, comm: htComm, cal: htCal, set: htSet }[HT.tab]();
  $('view').innerHTML = back + `<div class="htw"><h3 style="margin:8px 0">🎓 法定研修・従業者管理　<small>${htRe(HT.fy)}</small></h3>
    <div class="htbar">${test ? '🧪 テストモード：このページからメール・チャットは送りません。' : ''}${D.isAll ? '統括責任者として全事業所を見ています。' : '見られる事業所：' + esc(D.off.map(o => o.name).join('、')) + (D.editOffs.length ? '' : '（見るだけ）')}</div>
    <p>事業所：${sw}</p>
    <p class="ptabs">${HT_TABS.map(([k, l]) => `<button class="${k === HT.tab ? 'on' : ''}" onclick="HT.tab='${k}';htDraw()">${l}</button>`).join('')}</p>${body}</div>`;
}
// ---------- ホーム
function htHome() {
  const D = HT.D, sc = htScope(), m = htNowM(), staff = htStaffScope(), recs = htRecScope();
  const trs = D.tr.filter(t => t.active && htAppliesScope(t));
  const stats = trs.map(t => [t, htTrainStat(t)]);
  const late = stats.reduce((n, [, s]) => n + s.late, 0), noEv = recs.filter(r => !htHasEv(r)).length, unconf = recs.filter(r => !r.confirmed_at).length;
  const todo = [];
  stats.filter(([t, s]) => t.months.includes(m) && s.target).forEach(([t, s]) => todo.push(`今月の研修：<b>${esc(t.name)}</b>（受講済 ${s.done}/${s.target}人）`));
  stats.filter(([t, s]) => s.late).forEach(([t, s]) => todo.push(`<span style="color:#c00">遅れ：${esc(t.name)}　${s.late}人</span>`));
  D.ev.filter(e => e.active && e.months.includes(m) && sc.some(o => htApplies(e, o))).forEach(e => todo.push(`今月の${esc(e.kind)}：${esc(e.name)}`));
  D.plan.filter(p => p.fy === HT.fy && p.month === m).forEach(p => todo.push(`今月の委員会：${esc(p.committee_ids.map(id => (D.com.find(c => c.id === id) || {}).name || id).join('・'))}${p.planned_on ? '（' + p.planned_on + '）' : ''}`));
  if (noEv) todo.push(`証跡なし（手入力）の受講記録が ${noEv} 件。紙の出席簿などを保管してください`);
  if (D.isAll && unconf) todo.push(`統括確認が未了の記録が ${unconf} 件（研修タブで確認できます）`);
  const cmp = HT.office === 'all' && sc.length > 1 ? `<h4>事業所別の比較</h4><div class="htw"><table class="htt"><tr><th>事業所</th><th>種別</th><th>職員</th><th>受講率</th><th>遅れ</th><th>証跡なし</th><th>統括確認待ち</th></tr>${sc.map(o => {
    const st = D.staff.filter(s => s.status === '在籍' && htStaffOffs(s).includes(o.id)); let tg = 0, dn = 0, lt = 0;
    const opened = !o.start_date || o.start_date <= new Date().toISOString().slice(0, 10);
    D.tr.filter(t => t.active && htApplies(t, o)).forEach(t => st.forEach(s => { tg++; const d = htDone(s, t, o); if (d >= 1) dn++; if (opened && d < Math.min(htDue(t), t.times_per_year)) lt++; }));
    const rs = D.rec.filter(r => r.fy === HT.fy && r.offices.includes(o.id));
    return `<tr><td><b>${esc(o.name)}</b>${opened ? '' : '<br><small>開所前（' + esc(o.start_date) + '〜）</small>'}</td><td>${esc(o.types.join('・') || '未設定')}</td><td>${st.length}</td><td>${tg ? Math.round(dn / tg * 100) + '%' : '-'}（${dn}/${tg}）</td><td>${lt || '-'}</td><td>${rs.filter(r => !htHasEv(r)).length || '-'}</td><td>${rs.filter(r => !r.confirmed_at).length || '-'}</td></tr>`; }).join('')}</table></div>` : '';
  return `<div class="htk"><div><b>${staff.length}</b>在籍職員</div><div><b>${trs.length}</b>対象の研修</div><div><b style="color:${late ? '#c00' : '#2e6b4f'}">${late}</b>遅れ（人×研修）</div><div><b>${recs.length}</b>受講記録</div><div><b>${noEv}</b>証跡なし</div>${D.isAll ? `<div><b>${unconf}</b>統括確認待ち</div>` : ''}</div>
  <h4>今月（${m}月）のやること</h4>${todo.length ? '<ul>' + todo.map(x => `<li>${x}</li>`).join('') + '</ul>' : '<p>特にありません。</p>'}${cmp}
  ${sc.filter(o => o.start_date && o.start_date > new Date().toISOString().slice(0, 10)).map(o => `<p class="note">${esc(o.name)}は ${esc(o.start_date)} 開所予定。職員の研修・委員会への参加はそれ以降です。</p>`).join('')}`;
}
// ---------- 職員
function htStaff() {
  const D = HT.D, sc = htScope(), list = htStaffScope(), canAdd = D.editOffs.length > 0;
  const rows = list.map(s => { const offs = htStaffOffs(s).filter(x => sc.some(o => o.id === x)); let tg = 0, dn = 0;
    sc.filter(o => offs.includes(o.id)).forEach(o => D.tr.filter(t => t.active && htApplies(t, o)).forEach(t => { tg++; if (htDone(s, t, o) >= 1) dn++; }));
    return `<tr><td>${esc(s.id)}</td><td><b>${esc(s.name)}</b><br><small>${esc(s.kana || '')}</small></td><td>${esc(htOffName(s.main_office))}${s.sub_offices.length ? '<br><small>兼務：' + esc(s.sub_offices.map(htOffName).join('、')) + '</small>' : ''}</td><td>${esc(s.job || '')}<br><small>${esc(s.employment || '')}</small></td><td>${esc(s.email || '未登録')}</td><td>${dn}/${tg}</td><td><button class="htb g" onclick="htKarte('${s.id}')">カルテ</button>${D.editOffs.includes(s.main_office) ? `<button class="htb g" onclick="htStaffForm('${s.id}')">編集</button>` : ''}</td></tr>`; }).join('');
  return `${canAdd ? '<button class="htb" onclick="htStaffForm()">＋職員を追加</button>' : ''}<div class="htw"><table class="htt"><tr><th>ID</th><th>氏名</th><th>所属</th><th>職種</th><th>メール</th><th>受講済</th><th></th></tr>${rows}</table></div>
  <p class="note">兼務の職員は、所属するそれぞれの事業所に載ります。メールが未登録の職員は、本人確認つきの受講記録が作れません。</p>`;
}
function htStaffForm(id) {
  const D = HT.D, s = id ? D.staff.find(x => x.id === id) : { sub_offices: [], status: '在籍' };
  const next = 'S' + String(Math.max(0, ...D.staff.map(x => +x.id.slice(1) || 0)) + 1).padStart(4, '0');
  const ofs = D.allOff.filter(o => D.editOffs.includes(o.id)).map(o => [o.id, o.name]);
  htModal(id ? '職員を直す' : '職員を追加', [
    { k: 'name', label: '氏名', req: 1, val: s.name }, { k: 'kana', label: 'フリガナ', val: s.kana }, { k: 'email', label: 'メールアドレス', type: 'email', val: s.email },
    { k: 'main_office', label: '所属事業所（主）', type: 'select', opts: ofs, val: s.main_office || ofs[0][0] },
    { k: 'sub_offices', label: '兼務事業所', type: 'checks', opts: D.allOff.map(o => [o.id, o.name]), val: s.sub_offices },
    { k: 'employment', label: '雇用形態', type: 'select', opts: ['常勤', '非常勤'].map(x => [x, x]), val: s.employment || '常勤' },
    { k: 'job', label: '職種', val: s.job }, { k: 'hired', label: '入社年月日', type: 'date', val: s.hired },
    { k: 'status', label: 'ステータス', type: 'select', opts: ['在籍', '休職', '退職'].map(x => [x, x]), val: s.status },
    { k: 'note', label: '備考', type: 'textarea', val: s.note }], async o => {
    const row = { ...o, email: (o.email || '').toLowerCase() || null, hired: o.hired || null, kana: o.kana || null, note: o.note || null, sub_offices: o.sub_offices.filter(x => x !== o.main_office) };
    if (id) await sb('ht_staff?id=eq.' + id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(row) });
    else await sb('ht_staff', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ id: next, ...row }) });
  });
}
function htKarte(id) {
  const D = HT.D, s = D.staff.find(x => x.id === id), ids = htScope().map(o => o.id);
  const recs = D.rec.filter(r => r.staff_id === id && r.offices.some(x => ids.includes(x)));
  const m = document.createElement('div'); m.className = 'htm';
  m.innerHTML = `<div><h3 style="margin-top:0">${esc(s.name)} さんのカルテ</h3><p>${esc(s.job || '')}／${esc(htOffName(s.main_office))}${s.sub_offices.length ? '（兼務：' + esc(s.sub_offices.map(htOffName).join('、')) + '）' : ''}</p>
  <table class="htt"><tr><th>受講日</th><th>研修</th><th>点数</th><th>結果</th><th>証跡</th></tr>${recs.map(r => `<tr><td>${htFmtD(r.taken_at)}</td><td>${esc(r.training_name)}<br><small>${esc(r.offices.map(htOffName).join('、'))}</small></td><td>${r.rate ?? '-'}</td><td>${esc(r.passed || '')}</td><td>${esc(htEvLabel(r))}${r.confirmed_at ? '<br><small>統括確認 ' + htFmtD(r.confirmed_at) + '</small>' : ''}</td></tr>`).join('') || '<tr><td colspan=5>まだ受講記録がありません</td></tr>'}</table>
  <p><button class="htb" onclick="htCert('${id}')">受講証明書</button> <button class="htb g" onclick="this.closest('.htm').remove()">閉じる</button></p></div>`;
  document.body.appendChild(m);
}
// ---------- 研修
function htTrain() {
  const D = HT.D, m = htNowM(), canEdit = D.editOffs.length > 0, trs = D.tr.filter(t => t.active && htAppliesScope(t));
  const rows = trs.map(t => { const s = htTrainStat(t), mats = D.mat.filter(x => x.training_id === t.id && x.active);
    const canQuiz = canEdit || htSelfOffices(t, D.myStaff).length > 0;
    const chips = t.months.map(x => `<span class="chip ${x === m ? 'now' : htIdx(x) < htIdx(m) && s.late ? 'late' : ''}">${x}月</span>`).join('');
    return `<tr id="httr_${esc(t.id)}"><td><b>${esc(t.id)} ${esc(t.name)}</b><br><small>${esc(t.category || '')}</small><br>${chips}<br><small>${esc(t.frequency || '')}</small></td>
    <td>${s.done}/${s.target}人${s.late ? `<br><span class="chip late">遅れ ${s.late}人</span>` : ''}</td>
    <td><span class="chip ok">証跡あり ${s.evOk}</span><br><span class="chip ng">証跡なし ${s.evNg}</span>${s.unconf ? `<br><small>未確認 ${s.unconf}</small>` : ''}</td>
    <td>${mats.map(x => `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.kind)}</a>`).join('　')}</td>
    <td><button class="htb g" onclick="htImpl('${t.id}')">実施記録PDF</button><button class="htb g" onclick="htCert()">受講証明書</button>
    ${canEdit ? `<button class="htb" onclick="htRecForm('${t.id}')">記録を入力</button>` : ''}
    ${canQuiz ? `<button class="htb" onclick="htQuiz('${t.id}')">テストを受ける</button>` : ''}
    ${D.isAll ? `<button class="htb" onclick="htConfirm('${t.id}')"${s.unconf ? '' : ' disabled style="opacity:.4"'}>統括責任者確認</button>` : ''}</td></tr>`; }).join('');
  const ev = D.ev.filter(e => e.active && htAppliesScope(e)).map(e => {
    const logs = D.evl.filter(l => l.event_id === e.id && l.done_on >= HT.fy + '-04-01' && l.done_on <= (HT.fy + 1) + '-03-31' && htScope().some(o => o.id === l.office_id));
    return `<tr><td><b>${esc(e.id)} ${esc(e.name)}</b><br><small>${esc(e.kind)}</small></td><td>${e.months.map(x => `<span class="chip ${x === m ? 'now' : ''}">${x}月</span>`).join('')}</td><td>${logs.length}/${e.times_per_year}回${logs.length ? '<br><small>' + logs.map(l => htFmtD(l.done_on) + ' ' + esc(htOffName(l.office_id))).join('<br>') + '</small>' : ''}</td><td>${D.editOffs.length ? `<button class="htb" onclick="htEvForm('${e.id}')">実施を記録</button>` : ''}</td></tr>`; }).join('');
  return `<div class="htw"><table class="htt"><tr><th>研修</th><th>受講</th><th>証跡</th><th>教材</th><th></th></tr>${rows}</table></div>
  <p class="note">「実施記録PDF」「受講証明書」は印刷画面が開きます（「PDFに保存」を選べます）。事業所を選んでいるときはその事業所分、「全事業所」のときは事業所ごとに1枚ずつ出ます。手入力の記録は「証跡なし」と区別して表示されます。</p>
  <h4>訓練・点検・計画見直し</h4><div class="htw"><table class="htt"><tr><th>項目</th><th>予定月</th><th>実施</th><th></th></tr>${ev}</table></div>${htLogList('rec')}${htLogList('evl')}`;
}
function htRecForm(tid) {
  const D = HT.D, t = D.tr.find(x => x.id === tid);
  const cand = D.staff.filter(s => s.status === '在籍' && htStaffOffs(s).some(o => D.editOffs.includes(o) && htApplies(t, D.allOff.find(x => x.id === o))));
  if (!cand.length) return alert('入力できる対象職員がいません');
  const today0 = new Date(Date.now() + 9 * 36e5).toISOString().slice(0, 10);
  htModal(`${esc(t.name)}：受講記録を入力`, [
    { k: 'staff', label: '職員', type: 'select', opts: cand.map(s => [s.id, s.name + '（' + htOffName(s.main_office) + '）']), val: cand[0].id },
    { k: 'day', label: '受講日', type: 'date', req: 1, val: today0 },
    { k: 'kind', label: '結果', type: 'select', opts: [['test', '確認テストの点数から判定'], ['参加', '参加（訓練など・点数なし）']], val: 'test' },
    { k: 'rate', label: '得点率（%）', type: 'number', val: '' },
    { k: 'impression', label: '所感・気づき', type: 'textarea', req: 1 }, { k: 'plan', label: '現場実践計画', type: 'textarea', req: 1 }], async o => {
    const s = D.staff.find(x => x.id === o.staff); const offs = htStaffOffs(s).filter(x => D.editOffs.includes(x) && htApplies(t, D.allOff.find(y => y.id === x)));
    let passed = '参加', rate = null; if (o.kind === 'test') { rate = +o.rate; if (o.rate === '' || isNaN(rate)) throw new Error('得点率を入れてください'); passed = rate >= t.pass_score ? '合格' : '不合格'; }
    await sb('ht_records', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ taken_at: o.day + 'T12:00:00+09:00', fy: htFy(new Date(o.day + 'T12:00:00+09:00')), training_id: t.id, training_name: t.name, staff_id: s.id, staff_name: s.name, email: s.email,
      offices: offs, score: rate, max_score: rate == null ? null : 100, rate, passed, impression: o.impression, plan: o.plan, source: '手入力' }) });
  });
}
// ポータルで受講。閲覧のみはサーバが本人の行だけ採点して入れる。編集者の代理入力は従来どおり。
function htQuiz(tid) {
  const D = HT.D, t = D.tr.find(x => x.id === tid), qs = D.qs.filter(q => q.training_id === tid);
  const viewOnly = htViewOnly();
  let cand;
  if (viewOnly) {
    const mine = D.myStaff && D.myStaff.status === '在籍' ? D.myStaff : null;
    if (!mine) return alert('名簿とログインが結びついていません。管理者に連絡してください。');
    if (!htSelfOffices(t, mine).length) return alert('この研修の対象ではありません。');
    cand = [mine];
  } else {
    const mine = D.staff.find(s => (s.email || '').toLowerCase() === D.me);
    cand = mine ? [mine] : D.staff.filter(s => s.status === '在籍' && htStaffOffs(s).some(o => D.editOffs.includes(o)));
  }
  if (!cand.length) return alert('受講できる職員がいません');
  const m = document.createElement('div'); m.className = 'htm';
  const mats = D.mat.filter(x => x.training_id === tid && x.active);
  const who = viewOnly
    ? `<p><b>受講する職員</b><br>${esc(cand[0].name)}</p>`
    : `<label>受講する職員<select id="qz_s">${cand.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label>`;
  m.innerHTML = `<div><h3 style="margin-top:0">${esc(t.name)}　確認テスト</h3><p class="note">教材：${mats.map(x => `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.kind)}</a>`).join('　') || 'なし'}<br>${viewOnly ? 'ログイン中のアカウントが本人確認として記録されます。提出できるのは、名簿で結びついた本人の分だけです。' : 'ログインしているメール（' + esc(D.me) + '）が本人確認として記録されます。'}理解度テスト・所感・実践計画は必須です。</p>
  ${who}
  ${qs.map(q => `<p><b>問${q.no}．${esc(q.question)}</b></p>${['a', 'b', 'c', 'd'].filter(c => q['opt_' + c]).map(c => `<label style="color:#222"><input type="radio" name="qz${q.no}" value="${c.toUpperCase()}"> ${c.toUpperCase()}．${esc(q['opt_' + c])}</label>`).join('')}`).join('') || '<p>この研修にはテストがありません。</p>'}
  <label>所感・気づき *<textarea id="qz_i" rows="3"></textarea></label><label>現場実践計画 *<textarea id="qz_p" rows="2"></textarea></label><p id="qz_m" style="color:#c00"></p>
  <button id="qz_ok">提出する</button><button class="back" style="width:100%" onclick="this.closest('.htm').remove()">やめる</button></div>`;
  document.body.appendChild(m);
  m.querySelector('#qz_ok').onclick = async () => {
    const msg = m.querySelector('#qz_m');
    const answers = {};
    for (const q of qs) { const a = m.querySelector(`input[name=qz${q.no}]:checked`); if (!a) { msg.textContent = `問${q.no}に答えてください`; return; } answers[String(q.no)] = a.value; }
    const i = m.querySelector('#qz_i').value.trim(), p = m.querySelector('#qz_p').value.trim(); if (!i || !p) { msg.textContent = '所感と実践計画は必須です'; return; }
    try {
      if (viewOnly) {
        const res = await htRpc('ht_submit_own_quiz', { p_training_id: t.id, p_answers: answers, p_impression: i, p_plan: p });
        const rate = res && res.rate, passed = res && res.passed;
        m.remove(); alert(`提出しました。得点 ${rate ?? '-'}%（${passed === '合格' ? '合格' : '不合格・再受講してください'}）`);
      } else {
        let sc = 0, mx = 0;
        for (const q of qs) { mx += q.points; if (answers[String(q.no)] === q.answer) sc += q.points; }
        const s = D.staff.find(x => x.id === m.querySelector('#qz_s').value), rate = mx ? Math.round(sc / mx * 100) : null;
        const offs = htStaffOffs(s).filter(x => D.editOffs.includes(x) && htApplies(t, D.allOff.find(y => y.id === x)));
        await sb('ht_records', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ fy: htFy(), training_id: t.id, training_name: t.name, staff_id: s.id, staff_name: s.name, email: s.email, offices: offs, score: sc, max_score: mx, rate,
          passed: rate == null || rate >= t.pass_score ? '合格' : '不合格', impression: i, plan: p, source: 'ポータル' }) });
        m.remove(); alert(`提出しました。得点 ${rate ?? '-'}%（${rate == null || rate >= t.pass_score ? '合格' : '不合格・再受講してください'}）`);
      }
      await htRefresh();
    } catch (e) { msg.textContent = e.message; }
  };
}
function htEvForm(eid) {
  const D = HT.D, e = D.ev.find(x => x.id === eid), ofs = D.allOff.filter(o => D.editOffs.includes(o.id) && htApplies(e, o));
  if (!ofs.length) return alert('この項目の対象事業所に入力権限がありません');
  htModal(`${esc(e.name)}：実施を記録`, [{ k: 'office_id', label: '事業所', type: 'select', opts: ofs.map(o => [o.id, o.name]), val: HT.office !== 'all' ? HT.office : ofs[0].id },
    { k: 'done_on', label: '実施日', type: 'date', req: 1, val: new Date(Date.now() + 9 * 36e5).toISOString().slice(0, 10) }, { k: 'headcount', label: '参加者数', type: 'number' },
    { k: 'members', label: '参加者・担当', type: 'textarea' }, { k: 'result', label: '内容・結果', type: 'textarea', req: 1 }, { k: 'issues', label: '課題・改善点', type: 'textarea' }], async o => {
    await sb('ht_event_logs', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ event_id: eid, ...o, headcount: o.headcount ? +o.headcount : null, members: o.members || null, issues: o.issues || null }) });
  });
}
async function htConfirm(tid) {
  const D = HT.D, t = D.tr.find(x => x.id === tid), ids = htRecScope().filter(r => r.training_id === tid && !r.confirmed_at).map(r => r.id);
  if (!ids.length) return;
  const who = D.set['研修統括責任者 氏名'] || D.me;
  if (!confirm(`${t.name}：未確認の ${ids.length} 件に、統括責任者（${who}）の確認日時を記録します。よろしいですか？`)) return;
  try { await sb('ht_records?id=in.(' + ids.map(i => '"' + i + '"').join(',') + ')', { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ confirmed_at: new Date().toISOString(), confirmed_by: who }) }); await htRefresh(); } catch (e) { alert(e.message); }
}
// ---------- 委員会
function htComm() {
  const D = HT.D, sc = htScope(), m = htNowM(), coms = D.com.filter(c => htAppliesScope(c));
  const logsOf = id => D.cl.filter(l => htFixed(l) && l.committee_id === id && l.office_ids.some(x => sc.some(o => o.id === x)));
  const rows = coms.map(c => { const lg = logsOf(c.id), last = lg[0] ? lg[0].held_at : c.last_held, due = c.next_due;
    const pl = D.plan.filter(p => p.fy === HT.fy && p.committee_ids.includes(c.id));
    return `<tr><td><b>${esc(c.id)} ${esc(c.name)}</b><br><small>${c.interval_months}か月ごと${c.grp ? '・一体開催' + esc(c.grp) : ''}</small></td><td>${last ? htFmtD(last) : '未開催'}</td><td>${due ? esc(due) : '-'}</td><td>${pl.map(p => `<span class="chip ${p.month === m ? 'now' : ''}">${p.month}月${p.planned_on ? ' ' + esc(p.planned_on.slice(5)) : ''}</span>`).join('')}</td><td>${D.editOffs.length ? `<button class="htb" onclick="htCommForm('${c.id}')">開催を記録</button>` : ''}</td></tr>`; }).join('');
  const logs = D.cl.filter(l => l.office_ids.some(x => sc.some(o => o.id === x))).map(l => { const c = D.com.find(x => x.id === l.committee_id) || {};
    const fx = htFixed(l);
    return `<tr><td>${fx ? '' : '<span class="chip now">下書き</span><br>'}${htFmtDT(l.held_at)}${fx ? '' : '<br><small>（予定）</small>'}</td><td>${esc(c.name || '')}</td><td>${esc(l.office_ids.map(htOffName).join('、'))}</td><td>${esc(l.decisions || '')}</td><td>${fx ? `<button class="htb g" onclick="htMinutes('${l.id}')">議事録PDF</button>` : `<button class="htb" onclick="htCommOpen('${l.id}')">開く</button>`}</td></tr>`; }).join('');
  return `<div class="htw"><table class="htt"><tr><th>委員会</th><th>前回開催</th><th>次回期限</th><th>今年度の予定</th><th></th></tr>${rows}</table></div>
  <h4>開催記録（議事録）</h4><div class="htw"><table class="htt"><tr><th>日時</th><th>委員会</th><th>対象事業所</th><th>決定事項</th><th></th></tr>${logs || '<tr><td colspan=5>まだ開催記録がありません</td></tr>'}</table></div>${htLogList('cl')}
  <p class="note">「下書き」は開催前の議題・議事録の案です。前回開催・期限・議事録PDFには数えません。当日に内容を直して「確定する」と開催記録になります。議事録は事業所ごとに分かれて保存されます。一体開催の場合は参加した事業所すべてにチェックを入れてください（事業所ごとの議事録PDFが出ます）。</p>`;
}
const htFixed = l => (l.status || '確定') === '確定';
function htCommOpen(lid) {
  const D = HT.D, l = D.cl.find(x => x.id === lid); if (!l) return;
  if (htEditable('cl', l)) return htCommForm(l.committee_id, lid);
  const c = D.com.find(x => x.id === l.committee_id) || {}, m = document.createElement('div'); m.className = 'htm';
  m.innerHTML = `<div><h3 style="margin-top:0"><span class="chip now">下書き</span> ${esc(c.name || '')}</h3>${[['開催予定', htFmtDT(l.held_at)], ['場所/方法', l.place], ['対象事業所', l.office_ids.map(htOffName).join('、')], ['出席者', l.attendees], ['欠席者', l.absent], ['議題', l.agenda], ['検討内容', l.discussion], ['決定事項', l.decisions], ['次回予定', l.next_plan], ['周知方法', l.notice_method], ['備考', l.note]].map(([k, v]) => `<p><b>${k}</b><br>${esc(v || '').replace(/\n/g, '<br>')}</p>`).join('')}<button class="back" style="width:100%">閉じる</button></div>`;
  document.body.appendChild(m); m.querySelector('button').onclick = () => m.remove();
}
function htCommForm(cid, lid) {
  const D = HT.D, c = D.com.find(x => x.id === cid), l = lid ? D.cl.find(x => x.id === lid) : null, r = l || {};
  const ofs = D.allOff.filter(o => D.editOffs.includes(o.id) && htApplies(c, o));
  const dt = r.held_at ? new Date(new Date(r.held_at).getTime() + 9 * 36e5).toISOString().slice(0, 16) : new Date(Date.now() + 9 * 36e5).toISOString().slice(0, 16);
  const save = status => async o => {
    if (!o.office_ids.length) throw new Error('対象事業所を選んでください');
    if (!o.held) throw new Error('開催日時（予定）を入れてください');
    if (status === '確定' && !confirm('開催記録として確定します。前回開催・議事録PDFに反映されます。よろしいですか？')) return false;
    const body = { committee_id: cid, held_at: o.held + ':00+09:00', place: o.place || null, office_ids: o.office_ids, attendees: o.attendees || null, absent: o.absent || null, agenda: o.agenda || null,
      discussion: o.discussion || null, decisions: o.decisions || null, next_plan: o.next_plan || null, notice_method: o.notice_method || null, notice_on: o.notice_on || null, note: o.note || null, status };
    if (l) { const res = await sb('ht_committee_logs?id=eq.' + encodeURIComponent(l.id), { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(body) }); if (!Array.isArray(res) || res.length !== 1) throw new Error('保存できませんでした。権限を確認してください。'); }
    else await sb('ht_committee_logs', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body) });
  };
  htModal(`${l ? '<span class="chip now">下書き</span> ' : ''}${esc(c.name)}：${l ? '議事録の下書き' : '開催を記録'}`, [{ k: 'held', label: '開催日時（下書きは予定日時）', type: 'datetime-local', req: 1, val: dt }, { k: 'place', label: '場所/方法', val: r.place },
    { k: 'office_ids', label: '対象事業所', type: 'checks', opts: ofs.map(o => [o.id, o.name]), val: l ? l.office_ids : HT.office !== 'all' ? [HT.office] : ofs.map(o => o.id) },
    { k: 'attendees', label: '出席者', type: 'textarea', val: r.attendees }, { k: 'absent', label: '欠席者', val: r.absent }, { k: 'agenda', label: '議題', type: 'textarea', val: r.agenda }, { k: 'discussion', label: '検討内容', type: 'textarea', val: r.discussion }, { k: 'decisions', label: '決定事項', type: 'textarea', req: 1, val: r.decisions },
    { k: 'next_plan', label: '次回予定', val: r.next_plan }, { k: 'notice_method', label: '周知方法', val: r.notice_method }, { k: 'notice_on', label: '周知日', type: 'date', val: r.notice_on }, { k: 'note', label: '備考', type: 'textarea', val: r.note }],
    save('確定'), '確定する', ['下書き保存', save('下書き')]);
}
// ---------- 年間カレンダー
function htCal() {
  const D = HT.D, sc = htScope(), m = htNowM(), months = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];
  return months.map(mm => {
    const tr = D.tr.filter(t => t.active && t.months.includes(mm) && htAppliesScope(t)), ev = D.ev.filter(e => e.active && e.months.includes(mm) && htAppliesScope(e)), pl = D.plan.filter(p => p.fy === HT.fy && p.month === mm && p.committee_ids.some(id => htAppliesScope(D.com.find(c => c.id === id) || { target_types: [] })));
    const yr = mm >= 4 ? HT.fy : HT.fy + 1, opens = sc.filter(o => o.start_date && o.start_date.slice(0, 7) === yr + '-' + String(mm).padStart(2, '0'));
    return `<div class="htmo ${mm === m ? 'now' : ''}"><b>${mm}月</b>${mm === m ? '（今月）' : ''}${opens.map(o => ` <span class="chip now">${esc(o.name)} 開所</span>`).join('')}<br>
      ${tr.map(t => `<span class="chip">📘 ${esc(t.name)}</span>`).join('')}${ev.map(e => `<span class="chip" style="background:#e3e8f5">🛠 ${esc(e.name.slice(0, 22))}</span>`).join('')}${pl.map(p => `<span class="chip" style="background:#f3e6f5">👥 ${esc(p.committee_ids.map(id => (D.com.find(c => c.id === id) || {}).name || id).join('・'))}${p.planned_on ? ' ' + esc(p.planned_on.slice(5)) : ''}</span>`).join('')}
      ${tr.length + ev.length + pl.length ? '' : '<small class="note">予定なし</small>'}</div>`; }).join('');
}
// ---------- 設定
function htSet() {
  const D = HT.D;
  const sets = Object.entries(D.set).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${D.isAll ? `<input value="${esc(v)}" onchange="htSetSave('${esc(k).replace(/'/g, "\\'")}',this.value)" style="padding:4px;margin:0">` : esc(v)}</td></tr>`).join('');
  const offs = D.off.map(o => `<tr><td>${esc(o.name)}</td><td>${esc(o.types.join('・') || '未設定')}</td><td>${esc(o.start_date || '')}</td><td>${esc(o.note || '')}</td></tr>`).join('');
  return `<h4>設定${D.isAll ? '' : '（見るだけ）'}</h4><div class="htw"><table class="htt">${sets}</table></div>
  <h4>事業所</h4><div class="htw"><table class="htt"><tr><th>事業所</th><th>サービス種別</th><th>開所</th><th>備考</th></tr>${offs}</table></div>${D.isAll ? htMasterLists() : ''}
  <h4>アクセス権限</h4><div class="htw"><table class="htt"><tr><th>メール</th><th>範囲</th><th>入力</th><th>メモ</th></tr>${(D.isAll ? D.acc : D.acc.filter(a => a.email === D.me)).map(a => `<tr><td>${esc(a.email)}</td><td>${a.office_id ? esc(htOffName(a.office_id)) + 'のみ' : '全事業所（統括）'}</td><td>${a.can_edit ? '○' : '見るだけ'}</td><td>${esc(a.note || '')}</td></tr>`).join('')}</table></div>
  <p class="note">権限は事業所ごとに分かれています。統括責任者は全事業所を見て直せます。事業所の担当者は、その事業所の記録だけ見られ・入力できます（統括確認は統括責任者のみ）。統括責任者は設定画面で権限を追加・変更できます。削除には確認が出ます。</p>`;
}
async function htSetSave(k, v) { try { await sb('ht_settings?key=eq.' + encodeURIComponent(k), { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ value: v }) }); HT.D.set[k] = v; } catch (e) { alert(e.message); } }
// ---------- PDF（印刷画面。「PDFに保存」を選ぶ）
function htPrint(title, pages) {
  const w = window.open('', '_blank'); if (!w) return alert('ポップアップがブロックされました。許可してもう一度押してください');
  w.document.write(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font-family:"Hiragino Mincho ProN","Yu Mincho",serif;font-size:12px;color:#000}.pg{page-break-after:always;padding:6mm}.pg:last-child{page-break-after:auto}
    h1{font-size:20px;text-align:center;margin:0 0 10px}table{border-collapse:collapse;width:100%;margin:6px 0}td,th{border:1px solid #000;padding:4px;vertical-align:top;font-size:11px}th{background:#eee;width:22%;text-align:left}.l td,.l th{width:auto}.sg td{height:46px}.nt{font-size:10px;color:#444}@media print{.np{display:none}}</style></head><body>
    <p class="np"><button onclick="print()">印刷する（PDFに保存も選べます）</button></p>${pages.join('')}</body></html>`);
  w.document.close();
}
const htKV = rows => '<table>' + rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('') + '</table>';
function htImpl(tid) {
  const D = HT.D, t = D.tr.find(x => x.id === tid), corp = D.set['法人名'] || '', now = htFmtDT(new Date());
  const pages = htScope().filter(o => htApplies(t, o)).map(o => {
    const recs = D.rec.filter(r => r.fy === HT.fy && r.training_id === tid && r.offices.includes(o.id)), targets = htTargets(t, o), doneIds = new Set(recs.filter(htPassed).map(r => r.staff_id));
    const un = targets.filter(s => !doneIds.has(s.id)), mats = D.mat.filter(x => x.training_id === tid && x.active), conf = recs.filter(r => r.confirmed_at).sort((a, b) => b.confirmed_at.localeCompare(a.confirmed_at))[0];
    const fmt = mats.some(x => x.kind === '動画') ? (mats.some(x => x.kind !== '動画') ? '動画視聴＋資料学習＋確認テスト' : '動画視聴＋確認テスト') : '資料学習＋確認テスト';
    return `<div class="pg"><h1>研修実施記録</h1>${htKV([['法人名', esc(corp)], ['事業所', esc(o.name) + '（' + esc(o.types.join('・')) + '）'], ['研修名', esc(t.name)], ['法定根拠', esc(t.basis || '')], ['年度', htRe(HT.fy)], ['実施期間', recs.length ? htFmtD(recs[recs.length - 1].taken_at) + ' 〜 ' + htFmtD(recs[0].taken_at) : '（記録なし）'], ['形式', fmt], ['講師・教材', esc(t.owner || '')], ['使用資料', mats.map(x => esc(x.title) + '<br><span class="nt">' + esc(x.url) + '</span>').join('<br>') || '—']])}
      <b>参加者一覧</b><table class="l"><tr><th>氏名</th><th>職種</th><th>受講日時</th><th>送信アカウント（本人確認）</th><th>点数</th><th>合否</th><th>証跡</th><th>所感</th></tr>${recs.map(r => { const s = D.staff.find(x => x.id === r.staff_id) || {}; return `<tr><td>${esc(r.staff_name)}</td><td>${esc(s.job || '')}</td><td>${htFmtDT(r.taken_at)}</td><td>${esc(r.submit_email || '')}</td><td>${r.rate ?? '-'}</td><td>${esc(r.passed || '')}</td><td>${esc(htEvLabel(r))}</td><td>${esc(r.impression || '')}</td></tr>`; }).join('') || '<tr><td colspan=8>なし</td></tr>'}</table>
      <b>未受講者</b><p>${un.map(s => esc(s.name)).join('、') || 'なし'}</p>
      <table class="sg"><tr><th>統括責任者 確認日</th><td>${conf ? htFmtDT(conf.confirmed_at) : ''}</td><th>氏名</th><td>${esc(conf ? conf.confirmed_by : '')}</td></tr></table><p class="nt">作成日時 ${now}　※「証跡なし」の記録は、紙の出席簿など別の証拠を保管してください。</p></div>`; });
  htPrint(t.name + ' 実施記録', pages.length ? pages : ['<p>対象の事業所がありません</p>']);
}
function htCert(sid) {
  const D = HT.D, corp = D.set['法人名'] || '', signer = D.set['証明者（職名・氏名）'] || '', ids = htScope().map(o => o.id), pages = [];
  const staff = sid ? [D.staff.find(x => x.id === sid)] : htStaffScope();
  for (const s of staff) for (const oid of htStaffOffs(s).filter(x => ids.includes(x))) {
    const o = D.allOff.find(x => x.id === oid), recs = D.rec.filter(r => r.fy === HT.fy && r.staff_id === s.id && r.offices.includes(oid) && htPassed(r)).reverse();
    if (!recs.length) continue;
    pages.push(`<div class="pg"><h1>受講証明書</h1><p>${esc(s.name)} 殿は、${htRe(HT.fy)}に下記の法定研修を受講したことを証明します。</p>${htKV([['法人名', esc(corp)], ['事業所', esc(o.name)], ['氏名', esc(s.name)], ['職種', esc(s.job || '')]])}
      <table class="l"><tr><th>研修名</th><th>受講日</th><th>点数</th><th>合否</th><th>証跡</th></tr>${recs.map(r => `<tr><td>${esc(r.training_name)}</td><td>${htFmtD(r.taken_at)}</td><td>${r.rate ?? '-'}</td><td>${esc(r.passed || '')}</td><td>${esc(htEvLabel(r))}${r.confirmed_at ? '<br>統括確認 ' + htFmtD(r.confirmed_at) : ''}</td></tr>`).join('')}</table>
      <p style="text-align:right">発行日 ${htFmtD(new Date())}<br>${esc(corp)}<br>${esc(signer)}</p></div>`);
  }
  htPrint('受講証明書', pages.length ? pages : ['<p>受講記録がありません</p>']);
}
function htMinutes(lid) {
  if (!htFixed(HT.D.cl.find(x => x.id === lid) || {})) return alert('下書きは議事録PDFになりません。「確定する」と出せます。');
  const D = HT.D, l = D.cl.find(x => x.id === lid), c = D.com.find(x => x.id === l.committee_id) || {}, corp = D.set['法人名'] || '', ids = htScope().map(o => o.id);
  const pages = l.office_ids.filter(x => ids.includes(x)).map(oid => `<div class="pg"><h1>${esc(c.name || '委員会')} 議事録</h1>${htKV([['法人名', esc(corp)], ['事業所', esc(htOffName(oid)) + (l.office_ids.length > 1 ? '（一体開催：' + esc(l.office_ids.map(htOffName).join('、')) + '）' : '')], ['開催日時', htFmtDT(l.held_at)], ['場所/方法', esc(l.place || '')], ['出席者', esc(l.attendees || '')], ['欠席者', esc(l.absent || '')], ['議題', esc(l.agenda || '')], ['検討内容', esc(l.discussion || '')], ['決定事項', esc(l.decisions || '')], ['次回予定', esc(l.next_plan || '')], ['周知', esc((l.notice_method || '') + ' ' + (l.notice_on || ''))]])}</div>`);
  htPrint('議事録', pages);
}

// 手で管理する画面。列は実DBのスキーマと対応。証跡・作成者は編集対象にしない。
const HT_EDIT = {
  off: ['事業所', 'ht_offices_t', 'id', 'id:管理番号:required name:事業所名:required code:コード types:サービス種別:types start_date:開所日:date sort:並び順:int note:備考:textarea'],
  tr: ['研修マスタ', 'ht_trainings', 'id', 'id:管理番号:required name:研修名:required category:分類 target_types:対象サービス:types frequency:頻度 months:予定月:months times_per_year:年間回数:positive newhire:新入職員向け:bool pass_score:合格点:percent active:使用する:bool basis:法定根拠:textarea owner:担当 prep:準備:textarea url1:資料URL1 kind1:資料種類1 url2:資料URL2 kind2:資料種類2 url_checked:URL確認日:date note:備考:textarea'],
  ev: ['訓練項目', 'ht_events', 'id', 'id:管理番号:required name:項目名:required kind:種類 target_types:対象サービス:types months:予定月:months times_per_year:年間回数:positive active:使用する:bool basis:法定根拠:textarea prep:準備:textarea owner:担当 note:備考:textarea'],
  com: ['委員会', 'ht_committees', 'id', 'id:管理番号:required name:委員会名:required target_types:対象サービス:types interval_months:開催間隔（月）:positive basis:法定根拠:textarea owner:担当 last_held:前回開催日:date next_due:次回期限:date url:資料URL grp:一体開催グループ prep:準備:textarea note:備考:textarea'],
  plan: ['委員会の開催予定', 'ht_committee_plan', 'id', 'fy:年度（西暦）:year month:予定月:month committee_ids:委員会:committees joint:一体開催:bool planned_on:予定日:date place:場所 note:備考:textarea'],
  mat: ['教材', 'ht_materials', 'id', 'id:管理番号:required training_id:研修:trainings kind:種類 title:題名:required url:資料URL:required minutes:時間（分）:int descr:説明:textarea sort:並び順:int active:使用する:bool note:備考:textarea'],
  qs: ['確認テストの問題', 'ht_questions', 'training_id,no', 'training_id:研修:trainings no:問題番号:positive question:問題文:required opt_a:選択肢A:required opt_b:選択肢B:required opt_c:選択肢C opt_d:選択肢D answer:正解:answer points:点数:positive'],
  acc: ['アクセス権限', 'ht_access', 'email,office_id', 'email:メールアドレス:email office_id:対象事業所:accessOffice can_edit:入力・編集を許可:bool note:メモ:textarea'],
  rec: ['受講記録', 'ht_records', 'id', 'training_id:研修:trainings staff_id:職員:staff taken_at:受講日時:datetime fy:年度（西暦）:year offices:計上事業所:offices round:受講回数:int score:得点:int max_score:満点:int rate:得点率:percent passed:結果:passed impression:所感・気づき:textarea plan:現場実践計画:textarea'],
  evl: ['訓練・点検の実施記録', 'ht_event_logs', 'id', 'event_id:訓練項目:events office_id:事業所:office done_on:実施日:dateRequired headcount:参加者数:int members:参加者・担当:textarea result:内容・結果:required issues:課題・改善点:textarea url:資料URL note:備考:textarea'],
  cl: ['委員会開催記録', 'ht_committee_logs', 'id', 'committee_id:委員会:committee held_at:開催日時:datetime office_ids:対象事業所:offices place:場所・方法 attendees:出席者:textarea absent:欠席者:textarea agenda:議題:textarea discussion:検討内容:textarea decisions:決定事項:required next_plan:次回予定 notice_method:周知方法 notice_on:周知日:date note:備考:textarea']
};
const htAdminKeys = ['off', 'tr', 'ev', 'com', 'plan', 'mat', 'qs', 'acc'];
const htEditable = (key, row, deleting = false) => {
  if (HT.D.isAll) return true;
  if (htAdminKeys.includes(key) || !row) return false;
  if (key === 'rec' && (deleting || row.confirmed_at)) return false;
  const ids = key === 'rec' ? row.offices : key === 'cl' ? row.office_ids : [row.office_id];
  return ids.length > 0 && ids.every(id => HT.D.editOffs.includes(id));
};
function htEditButtons(key, i) {
  const row = HT.D[key][i];
  return `${htEditable(key, row) ? `<button class="htb g" onclick="htEditForm('${key}',${i})">編集</button>` : ''}${htEditable(key, row, true) ? `<button class="htb g" onclick="htDeleteRow('${key}',${i})">削除</button>` : ''}`;
}
function htLogList(key) {
  const ids = htScope().map(o => o.id), cfg = HT_EDIT[key];
  const rows = HT.D[key].map((r, i) => ({ r, i })).filter(({r}) => (key === 'rec' ? r.offices : key === 'cl' ? r.office_ids : [r.office_id]).some(id => ids.includes(id)));
  return `<h4>${cfg[0]}の編集</h4><div class="htw"><table class="htt"><tr><th>日付</th><th>内容</th><th>操作</th></tr>${rows.map(({r,i}) => `<tr><td>${key === 'cl' && !htFixed(r) ? '<span class="chip now">下書き</span><br>' : ''}${htFmtDT(r.taken_at || r.held_at || r.done_on)}</td><td>${esc(key === 'rec' ? r.staff_name + '／' + r.training_name : key === 'evl' ? (HT.D.ev.find(e => e.id === r.event_id) || {}).name || r.event_id : (HT.D.com.find(c => c.id === r.committee_id) || {}).name || r.committee_id)}<br>${esc(r.result || r.decisions || r.impression || '')}</td><td>${htEditButtons(key,i)}</td></tr>`).join('') || '<tr><td colspan="3">記録なし</td></tr>'}</table></div>`;
}
function htMasterLists() {
  return '<p class="note">ここで追加・編集・削除できます。管理番号は追加時だけ設定します。参照されている項目は削除できません。研修・訓練は「使用する」を「いいえ」にして残せます。</p>' + htAdminKeys.map(key => {
    const cfg = HT_EDIT[key];
    return `<h4>${cfg[0]}を管理</h4><button class="htb" onclick="htEditForm('${key}')">＋追加</button><table class="htt"><tr><th>項目</th><th>操作</th></tr>${HT.D[key].map((r,i) => `<tr><td>${esc(r.name || r.title || r.question || r.email || (r.fy + '年度 ' + r.month + '月'))}${key === 'acc' ? '<br>' + esc(r.office_id ? htOffName(r.office_id) : '全事業所') + (r.can_edit ? '（編集可）' : '（見るだけ）') : ''}${r.months ? '<br>' + esc(r.months.join('・')) + '月' : ''}${r.active === false ? '（使用しない）' : ''}</td><td>${htEditButtons(key,i)}</td></tr>`).join('')}</table>`;
  }).join('');
}
function htRowFilter(key, row) {
  return HT_EDIT[key][2].split(',').map(k => k + (row[k] == null ? '=is.null' : '=eq.' + encodeURIComponent(row[k]))).join('&');
}
async function htWrite(key, row, old) {
  const result = await sb(HT_EDIT[key][1] + (old ? '?' + htRowFilter(key, old) : ''), { method: old ? 'PATCH' : 'POST', headers: {Prefer:'return=representation'}, body: JSON.stringify(row) });
  if (!Array.isArray(result) || result.length !== 1) throw new Error('保存できませんでした。権限を確認して再読み込みしてください。');
}
function htAccessCheck(old, row) {
  if (!old || old.office_id || !old.can_edit) return;
  const loses = !row || row.email !== old.email || row.office_id !== null || !row.can_edit;
  if (loses && old.email === HT.D.me) throw new Error('自分の全事業所の管理者権限は外せません');
  if (loses && HT.D.acc.filter(a => !a.office_id && a.can_edit).length <= 1) throw new Error('最後の全事業所管理者は外せません');
}
async function htDeleteRow(key, i) {
  const row = HT.D[key][i];
  if (!htEditable(key,row,true)) return alert('削除権限がありません');
  try {
    if (key === 'acc') htAccessCheck(row,null);
    if (!confirm(`${HT_EDIT[key][0]}「${row.name || row.title || row.email || row.id}」を削除しますか？元に戻せません。`)) return;
    const result = await sb(HT_EDIT[key][1] + '?' + htRowFilter(key,row), {method:'DELETE',headers:{Prefer:'return=representation'}});
    if (!Array.isArray(result) || result.length !== 1) throw new Error('削除できませんでした。権限を確認してください。');
    await htRefresh();
  } catch(e) { alert('削除できません：' + e.message); }
}
function htEditForm(key, i) {
  const cfg = HT_EDIT[key], old = i == null ? null : HT.D[key][i], r = old || {};
  if (!htEditable(key, old)) return alert('編集権限がありません');
  const specs = cfg[3].split(' ').map(s => s.split(':'));
  const pick = (arr) => arr.map(x => [x.id, x.name]);
  const fields = specs.filter(([k]) => !old || !cfg[2].split(',').includes(k) || key === 'acc').map(([k,label,type]) => {
    let val = r[k], opts, kind = type || 'text';
    if (type === 'bool') { kind = 'select'; opts = [['true','はい'],['false','いいえ']]; val = String(val ?? ['active'].includes(k)); }
    if (type === 'months') { kind='checks'; opts=[4,5,6,7,8,9,10,11,12,1,2,3].map(m=>[String(m),m+'月']); val=(val || []).map(String); }
    if (type === 'types') { kind='text'; label += '（読点またはカンマで区切る。全対象は「全事業」）'; val=(val || []).join('、'); }
    if (['offices','committees'].includes(type)) {kind='checks';opts=pick(type === 'offices' ? HT.D.allOff.filter(o=>HT.D.editOffs.includes(o.id)) : HT.D.com);val=val || [];}
    const list = {trainings:HT.D.tr,events:HT.D.ev,committee:HT.D.com,staff:HT.D.staff,office:HT.D.allOff.filter(o=>HT.D.editOffs.includes(o.id)),accessOffice:HT.D.allOff}[type];
    if (list) {kind='select';opts=pick(list);if(type==='accessOffice') opts.unshift(['','全事業所']);val=val ?? (opts[0] || [''])[0];}
    if(type==='passed') {kind='select';opts=['合格','不合格','参加'].map(v=>[v,v]);val=val || '参加';}
    if(type==='answer') {kind='select';opts=['A','B','C','D'].map(v=>[v,v]);val=val || 'A';}
    if(type==='month') {kind='select';opts=Array.from({length:12},(_,n)=>[String(n+1),(n+1)+'月']);val=String(val || 4);}
    if(['int','positive','percent','year'].includes(type)) {kind='number';val=val ?? (type==='year'?HT.fy:type==='positive'?1:type==='percent'?75:'');}
    if(type==='datetime') {kind='datetime-local';val=new Date(new Date(val || Date.now()).getTime()+9*36e5).toISOString().slice(0,16);}
    if(type==='dateRequired') kind='date';
    if(type==='required') kind='text';
    return {k,label,type:kind,opts,val,req:['required','email','datetime','dateRequired','year','positive'].includes(type)};
  });
  htModal(cfg[0] + (old ? 'を編集' : 'を追加'),fields,async o => {
    const row={};
    for(const [k,,type] of specs) {
      if(!(k in o)) continue;
      let v=o[k];
      if(type==='bool') v=v==='true';
      else if(type==='months') v=v.map(Number);
      else if(type==='types') v=[...new Set(v.split(/[、,\n]/).map(x=>x.trim()).filter(Boolean))];
      else if(['int','positive','percent','year','month'].includes(type)) { v=v===''?null:Number(v);if(v!==null && (!Number.isInteger(v) || (type==='positive' && v<1) || (type==='percent' && (v<0||v>100)) || (type==='year' && (v<2000||v>2200)) || (type==='int' && v<0))) throw new Error('数値の範囲を確認してください'); }
      else if(type==='datetime') v=v+':00+09:00';
      else if(type==='email') {v=v.toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new Error('メールアドレスを確認してください');}
      else if(!Array.isArray(v)) v=v || null;
      row[k]=v;
    }
    for(const k of ['offices','office_ids','committee_ids','target_types','types']) if(k in row && !row[k].length) throw new Error('対象を1つ以上選んでください');
    if(key==='plan' && row.planned_on) {const d=new Date(row.planned_on+'T12:00:00+09:00');if(htFy(d)!==row.fy || Number(row.planned_on.slice(5,7))!==row.month) throw new Error('予定日と年度・予定月を合わせてください');}
    if(key==='acc') htAccessCheck(old,row);
    if(key==='qs') {
      if(!row.answer || !['A','B','C','D'].includes(row.answer)) throw new Error('正解を選んでください');
      const tid = row.training_id || (old && old.training_id), no = row.no != null ? row.no : (old && old.no);
      const qrow = Object.assign({}, row); delete qrow.answer;
      const keys = await htTry('ht_question_keys?select=training_id&limit=1');
      if(keys.ok) {
        await htWrite(key, qrow, old);
        const saved = await sb('ht_question_keys?on_conflict=training_id,no', { method:'POST', headers:{ Prefer:'resolution=merge-duplicates,return=representation' }, body: JSON.stringify({ training_id: tid, no, answer: row.answer }) });
        if(!Array.isArray(saved) || saved.length !== 1) throw new Error('正解を保存できませんでした');
        return;
      }
    }
    if(key==='rec') {
      const t=HT.D.tr.find(t=>t.id===row.training_id),s=HT.D.staff.find(s=>s.id===row.staff_id);
      row.training_name=t.name;row.staff_name=s.name;row.email=s.email;
      if(row.fy!==htFy(new Date(row.taken_at))) throw new Error('受講日と年度を合わせてください');
      // DB側で編集後の証跡と確認日時を更新する。
    }
    await htWrite(key,row,old);
  });
}
