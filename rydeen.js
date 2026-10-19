// RYDEEN（就労継続支援B型）。b-portal(Next.js) を、法人ポータルと同じ素のHTML/JSで作り直したもの。
// ログインは法人ポータルのセッション(localStorage 'sess')をそのまま使う。権限は bp_profiles(admin/worker, office=RYDEEN)。
// 画面側でも遮断するが、本体は Supabase の RLS（supabase/schema は b-portal の schema.sql ＋ supabase/rydeen_journal.sql）。
// 個人データはこのファイルに書かない（リポジトリは公開）。
const RYD = { me: null, st: {}, loaded: {} };
const RV = {};            // 管理画面の各ページ: RV[名前] = async () => html を描画
const RW = {};            // 利用者画面の各ページ
const RY_ADMIN_NAV = [['home', 'ホーム'], ['journal', '業務日誌'], ['records', '実績記録票'], ['billing', '国保連CSV'], ['users', '利用者'], ['contracts', '契約・重説'], ['plans', '個別支援計画'],
  ['staff', '勤務実績表'], ['tasks', '作業タスク'], ['manuals', 'マニュアル'], ['reports', '日報'], ['notes', 'メモ・ファイル']];
const RY_WORKER_NAV = [['home', '今日の作業'], ['manuals', 'マニュアル'], ['report', '日報を書く']];
const RY_FILES = { journal: 'rydeen-journal.js', records: 'rydeen-journal.js', contracts: 'rydeen-docs.js', plans: 'rydeen-docs.js', staff: 'rydeen-staff.js', billing: 'rydeen-bill.js' };

// ---------- 共通の小物 ----------
const ryEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ryToday = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
const ryShift = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const ryDT = s => s ? new Date(s).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '—';
const ryV = id => { const e = document.getElementById(id); return e ? e.value : ''; };
const ryC = id => { const e = document.getElementById(id); return !!(e && e.checked); };
const ryNull = s => { s = String(s ?? '').trim(); return s === '' ? null : s; };
const ryTok = () => JSON.parse(localStorage.getItem('sess') || '{}');
const ryUid = () => { try { return JSON.parse(atob(ryTok().token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub; } catch (e) { return null; } };
const ryAuthH = () => ({ apikey: C.supabaseKey, Authorization: 'Bearer ' + ryTok().token });
async function ryErr(r) { let m = ''; try { const j = await r.json(); m = j.message || j.error || ''; } catch (e) { } return new Error((m || '失敗しました') + '（' + r.status + '）'); }
// REST。opt.prefer で Prefer ヘッダ。結果は JSON（本文なしは null）
// 法人管理者は RLS で全事業所が見えるが、画面は自分の事業所だけを扱う（b-portal の scopeToOffice と同じ）。読み・更新・削除に office を付け、追加には office を入れる
const ryScope = path => (RYD.me && /^bp_[a-z_]+\?/.test(path) && !/[?&]office=/.test(path)) ? path + '&office=eq.' + encodeURIComponent(RYD.me.office) : path;
const ryWithOffice = body => !RYD.me ? body : Array.isArray(body) ? body.map(r => ({ office: RYD.me.office, ...r })) : { office: RYD.me.office, ...body };
async function rb(path, opt = {}) {
  const method = opt.method || 'GET'; if (method === 'POST') { if (opt.body !== undefined && /^bp_/.test(path)) opt = { ...opt, body: ryWithOffice(opt.body) }; } else path = ryScope(path);
  const h = { ...ryAuthH(), 'Content-Type': 'application/json' }; if (opt.prefer) h.Prefer = opt.prefer;
  const r = await fetch(C.supabaseUrl + '/rest/v1/' + path, { method, headers: h, body: opt.body === undefined ? undefined : JSON.stringify(opt.body) });
  if (!r.ok) throw await ryErr(r);
  const t = await r.text(); return t ? JSON.parse(t) : null;
}
const rIns = (t, rows, ret) => rb(t, { method: 'POST', body: rows, prefer: ret ? 'return=representation' : 'return=minimal' });
const rUps = (t, rows, conflict, ret) => rb(`${t}?on_conflict=${conflict}`, { method: 'POST', body: rows, prefer: 'resolution=merge-duplicates,' + (ret ? 'return=representation' : 'return=minimal') });
const rUpd = (t, filter, patch, ret) => rb(`${t}?${filter}`, { method: 'PATCH', body: patch, prefer: ret ? 'return=representation' : 'return=minimal' });
const rDel = (t, filter) => rb(`${t}?${filter}`, { method: 'DELETE', prefer: 'return=minimal' });
async function rCount(t, filter) {
  const r = await fetch(`${C.supabaseUrl}/rest/v1/${ryScope(`${t}?select=id${filter ? '&' + filter : ''}&limit=1`)}`, { headers: { ...ryAuthH(), Prefer: 'count=exact' } });
  if (!r.ok) throw await ryErr(r); return Number((r.headers.get('content-range') || '').split('/')[1]) || 0;
}
async function rRpc(fn, args) {
  const r = await fetch(C.supabaseUrl + '/rest/v1/rpc/' + fn, { method: 'POST', headers: { ...ryAuthH(), 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  const t = await r.text(); if (!r.ok) { let m = ''; try { m = JSON.parse(t).message; } catch (e) { } throw new Error(m || ('失敗しました（' + r.status + '）')); }
  try { return JSON.parse(t); } catch (e) { return null; }
}
// Storage（マニュアル画像=公開バケット、職員ファイル=非公開バケット）
async function ryUpload(bucket, file) {
  const ext = (file.name.split('.').pop() || 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'bin';
  const path = `${RYD.me.office}/${crypto.randomUUID()}${bucket === 'bp-staff-files' ? '-' + file.name.replace(/[^\w.\-]/g, '_') : '.' + ext}`;
  const r = await fetch(`${C.supabaseUrl}/storage/v1/object/${bucket}/${path}`, { method: 'POST', headers: { ...ryAuthH(), 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'false' }, body: file });
  if (!r.ok) throw await ryErr(r); return path;
}
const ryPublicUrl = p => `${C.supabaseUrl}/storage/v1/object/public/bp-manual-images/${p.split('/').map(encodeURIComponent).join('/')}`;
async function rySignedUrl(bucket, path) {
  const r = await fetch(`${C.supabaseUrl}/storage/v1/object/sign/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`, { method: 'POST', headers: { ...ryAuthH(), 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 3600 }) });
  if (!r.ok) return null; const j = await r.json(); return C.supabaseUrl + '/storage/v1' + j.signedURL;
}
async function ryRemoveObjects(bucket, paths) {
  if (!paths.length) return; await fetch(`${C.supabaseUrl}/storage/v1/object/${bucket}`, { method: 'DELETE', headers: { ...ryAuthH(), 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: paths }) });
}
// サーバー時刻（署名・説明の記録に使う。取れないときは端末の時刻）
const ryNow = async () => { try { const t = await rRpc('bp_now', {}); return t || new Date().toISOString(); } catch (e) { return new Date().toISOString(); } };
// 部品の読み込み（rydeen-lib.js など。画面を開いたときだけ）
const ryScript = src => RYD.loaded[src] || (RYD.loaded[src] = new Promise((ok, ng) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => { delete RYD.loaded[src]; ng(new Error('部品を読み込めませんでした: ' + src)); }; document.head.appendChild(s); }));
const ryLib = () => window.RydLib ? Promise.resolve() : ryScript('rydeen-lib.js');
const ryTBD = '【要確認】';

// ---------- 権限 ----------
// bp_profiles が本体。無い人は、既存の staff_profiles の RYDEEN 職員を管理者として扱う（RLS の bp_is_admin と同じ規則）
async function ryMe() {
  if (RYD.me) return RYD.me;
  const uid = ryUid(); if (!uid) return null;
  const p = await rb(`bp_profiles?id=eq.${uid}&select=role,display_name,office`);
  if (p.length) RYD.me = { uid, role: p[0].role, name: p[0].display_name, office: p[0].office };
  else { const s = await rb('staff_profiles?select=office,nikki_name').catch(() => []); const m = s.find(x => x.office === 'RYDEEN'); if (m) RYD.me = { uid, role: 'admin', name: m.nikki_name || ryTok().email || '', office: 'RYDEEN' }; }
  return RYD.me;
}
const ryLoadNames = async () => { const w = await rb('bp_profiles?role=eq.worker&select=id,display_name&order=display_name'); RYD.workers = w; RYD.wname = Object.fromEntries(w.map(x => [x.id, x.display_name])); return w; };

// ---------- 画面の枠 ----------
(function () {
  const st = document.createElement('style');
  st.textContent = `.ry-nav{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 14px}.ry-nav a{background:#fff;border:1px solid #bbb;border-radius:8px;padding:8px 12px;text-decoration:none;color:#333;font-size:14px}.ry-nav a.on{background:var(--main);color:#fff;border-color:var(--main)}
  .ry label.l{display:block;font-size:13px;color:#555;margin-top:8px}.ry textarea,.ry select{width:100%;box-sizing:border-box;font-size:16px;padding:10px;border:1px solid #bbb;border-radius:8px;margin:4px 0}.ry textarea{min-height:90px}
  .ry input[type=checkbox],.ry input[type=radio]{width:auto;margin-right:6px;transform:scale(1.3)}.ry .row{display:flex;gap:10px;flex-wrap:wrap}.ry .row>*{flex:1;min-width:140px}.ry button.sec{background:#fff;color:#333;border:1px solid #bbb}.ry button.del{background:#fff;color:#c00;border:1px solid #c00}.ry button.inl{width:auto;padding:8px 14px;margin:2px}
  .ry .aib{display:inline-block;background:#d98a00;color:#fff;font-size:12px;border-radius:10px;padding:1px 8px;margin-left:6px}
  .ry .ng{background:#fde8e8;border-radius:8px;padding:8px 10px;margin:6px 0}.ry .okb{background:#e6f4ea;border-radius:8px;padding:8px 10px;margin:6px 0}.ry .wn{background:#fff6d6;border-radius:8px;padding:8px 10px;margin:6px 0;font-size:14px}
  .ry table.tbl{font-size:14px}.ry .jr{border:1px solid #ddd;border-radius:10px;padding:10px;margin:8px 0;background:#fff}.ry .big{font-size:22px}.ry.rw{font-size:20px}.ry.rw button{font-size:22px;padding:16px}.ry.rw .card{padding:22px}.ry .pre{white-space:pre-wrap;line-height:1.7}
  .ry canvas.sig{border:2px dashed #888;background:#fff;width:100%;max-width:600px;touch-action:none;border-radius:8px}.ry .mono{font-family:ui-monospace,monospace;word-break:break-all;font-size:12px}.ry img.sg{border:1px solid #bbb;background:#fff;width:260px;max-width:100%}
  @media print{header,.back,#help{display:none!important}body{background:#fff}main{max-width:none}.card{box-shadow:none}.ry-nav,.noprint{display:none!important}}`;
  document.head.appendChild(st);
})();
const ryNav = (list, cur) => `<div class="ry-nav noprint">${list.map(([k, l]) => `<a href="#rydeen/${k}" class="${k === cur ? 'on' : ''}">${l}</a>`).join('')}</div>`;
const ryBack = '<button class="back noprint" onclick="location.hash=\'rydeen\'">← RYDEENへ</button>';
const ryErrBox = e => `<div class="ng">${ryEsc(e.message || e)}</div>`;
const ryMsg = (html, ok) => { const m = document.getElementById('ry_m'); if (m) m.innerHTML = `<div class="${ok ? 'okb' : 'ng'}">${html}</div>`; };
const ryShow = html => { $('view').innerHTML = html; };
const ryWorkerSelect = (id, sel) => `<select id="${id}">${(RYD.workers || []).map(w => `<option value="${w.id}" ${w.id === sel ? 'selected' : ''}>${ryEsc(w.display_name)}</option>`).join('')}</select>`;
async function ryGo(fn) { try { await fn(); } catch (e) { ryMsg(ryEsc(e.message || e)); } }

// 手書き署名（PNG data URL）。ryPad('id') で枠、ryPadData('id') で取得
function ryPad(id) { setTimeout(() => { const cv = document.getElementById(id); if (!cv) return; const g = cv.getContext('2d'); g.lineWidth = 3; g.lineCap = 'round'; g.strokeStyle = '#000'; let dn = false;
  const pt = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; };
  cv.onpointerdown = e => { dn = true; cv.dirty = true; const [x, y] = pt(e); g.beginPath(); g.moveTo(x, y); cv.setPointerCapture(e.pointerId); };
  cv.onpointermove = e => { if (!dn) return; const [x, y] = pt(e); g.lineTo(x, y); g.stroke(); }; cv.onpointerup = () => { dn = false; }; }, 0);
  return `<canvas class="sig" id="${id}" width="600" height="200"></canvas><p><button class="sec inl" type="button" onclick="ryPadClear('${id}')">書き直す</button> <small class="note">枠内に指またはペンで署名してください</small></p>`; }
const ryPadClear = id => { const cv = document.getElementById(id); cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); cv.dirty = false; };
const ryPadData = id => { const cv = document.getElementById(id); if (!cv || !cv.dirty) return null; const d = cv.toDataURL('image/png'); return d.length > 500000 ? null : d; };

// ---------- 入口（index.html の render() から呼ばれる） ----------
async function renderRydeen(sub) {
  sub = sub || 'home';
  if (DEMO) return ryShow(ryBack + '<div class="card"><p>見本モードでは、RYDEEN（B型）の画面は使えません。ログインしてお使いください。</p></div>');
  ryShow(ryBack + '<p>読み込み中…</p>');
  try {
    const me = await ryMe();
    if (!me) return ryShow(ryBack + '<div class="card ry"><p class="big">B型の利用権限がありません。</p><p>管理者に、B型への登録を依頼してください。</p></div>');
    if (me.role === 'worker') {
      if (!RW[sub]) sub = 'home';
      return await RW[sub](sub);
    }
    if (RY_FILES[sub] && !RV[sub]) await ryScript(RY_FILES[sub]);
    if (!RV[sub]) sub = 'home';
    await ryLoadNames();
    await RV[sub](sub);
  } catch (e) { ryShow(ryBack + `<div class="ry">${ryErrBox(e)}</div>`); }
}
const ryAdminFrame = (cur, html) => ryShow(`<div class="ry">${cur === 'home' ? ryBack : '<button class="back noprint" onclick="RYD.st.user=null;location.hash=\'rydeen/home\'">← RYDEENホームへ</button>'}<h3 style="color:#3a7bd5;font-size:20px">RYDEEN（B型）${cur === 'home' ? '職員画面' : ryEsc((RY_ADMIN_NAV.find(n => n[0] === cur) || [0, ''])[1])}　<small>${ryEsc(RYD.me.name)}</small></h3><div id="ry_m"></div>${html}</div>`);
const ryWorkerFrame = (cur, html) => ryShow(`<div class="ry rw">${ryBack}<p class="big"><b>${ryEsc(RYD.me.name || 'あなた')}さん、こんにちは</b></p>${ryNav(RY_WORKER_NAV, cur)}<div id="ry_m"></div>${html}</div>`);

// ---------- 職員: ホーム ----------
RV.home = async () => {
  const t = ryToday();
  const [w, r, k, j, u] = await Promise.all([rCount('bp_profiles', 'role=eq.worker'), rCount('bp_daily_reports', 'report_date=eq.' + t), rCount('bp_tasks', 'task_date=eq.' + t), rCount('bp_journal', `journal_date=eq.${t}&status=neq.`), rCount('bp_service_records', 'signed_at=is.null')]);
  const card = (n, l, h) => `<a class="tile" href="#rydeen/${h}"><span class="big">${n}</span>${l}</a>`;
  ryAdminFrame('home', `<h4>きょうの状況（${t}）</h4><div class="grid">${card(w, '利用者数', 'users')}${card(j, '本日の日誌 入力済み', 'journal')}${card(u, '署名待ちの実績記録票', 'records')}${card(r, '本日の日報', 'reports')}${card(k, '本日のタスク', 'tasks')}</div>
    ${[['毎日やること', '職員が入力するのは、ここだけです', ['journal', 'reports', 'tasks']], ['月末にやること', '日誌から自動で転記・集計されます。確認して請求します', ['records', 'billing', 'staff']], ['利用者まわり', '', ['users', 'contracts', 'plans']], ['資料', '', ['manuals', 'notes']]].map(([t, n, ks]) => `<h4>${t}</h4>${n ? `<p class="note">${n}</p>` : ''}<div class="grid">${ks.map(k2 => `<a class="tile" href="#rydeen/${k2}">${(RY_ADMIN_NAV.find(x => x[0] === k2) || [0, k2])[1]}</a>`).join('')}</div>`).join('')}`);
};

// ---------- 職員: 利用者 ----------
const RY_PRIV = ['recipient_number', 'municipality_code', 'birth_date', 'address', 'phone', 'emergency_contact', 'name_kana', 'support_level', 'cap_management', 'cap_amount', 'cap_office_no', 'decision_service_code', 'contract_days', 'contract_start', 'contract_end', 'service_start_date', 'provider_entry_no'];
const ryPrivFromForm = () => ({ recipient_number: ryNull(ryV('u_recipient_number')), municipality_code: ryNull(ryV('u_municipality_code')), birth_date: ryNull(ryV('u_birth_date')), address: ryNull(ryV('u_address')), phone: ryNull(ryV('u_phone')), emergency_contact: ryNull(ryV('u_emergency_contact')),
  name_kana: ryNull(ryV('u_name_kana')), support_level: ryV('u_support_level') === '' ? null : Number(ryV('u_support_level')), cap_management: ryV('u_cap_management') === '有' ? '有' : '無', cap_amount: Number(ryV('u_cap_amount') || 0), cap_office_no: ryNull(ryV('u_cap_office_no')),
  decision_service_code: ryNull(ryV('u_decision_service_code')) || '461000', contract_days: ryNull(ryV('u_contract_days')) || '原則', contract_start: ryNull(ryV('u_contract_start')), contract_end: ryNull(ryV('u_contract_end')), service_start_date: ryNull(ryV('u_service_start_date')), provider_entry_no: ryNull(ryV('u_provider_entry_no')) || '1' });
const ryInp = (id, label, val, type, extra) => `<div><label class="l" for="${id}">${label}</label><input id="${id}" type="${type || 'text'}" value="${ryEsc(val ?? '')}" ${extra || ''}></div>`;
RV.users = async () => {
  const id = RYD.st.user;
  if (id) return ryUserDetail(id);
  const prof = await rb('bp_profiles?role=eq.worker&select=id,display_name,created_at&order=created_at');
  ryAdminFrame('users', `<h3>利用者一覧</h3><div class="card"><table class="tbl"><tr><th>氏名</th><th>登録日</th><th></th></tr>${prof.map(u => `<tr><td>${ryEsc(u.display_name || '(未設定)')}</td><td>${u.created_at.slice(0, 10)}</td><td><button class="inl sec" onclick="RYD.st.user='${u.id}';renderRydeen('users')">詳細・個人情報</button></td></tr>`).join('')}</table>${prof.length ? '' : '<p>まだ登録がありません。</p>'}</div>
    <div class="card"><h4>利用者アカウントを追加</h4><p class="note">利用者はこのメールとパスワードで法人ポータルにログインし、RYDEENの利用者画面に入ります。</p><div class="row">${ryInp('n_name', '氏名', '')}${ryInp('n_email', 'メール', '', 'email')}${ryInp('n_pw', '初期パスワード(8文字以上)', '', 'password')}</div>
    <div class="row">${ryInp('u_recipient_number', '受給者証番号', '', 'text', 'maxlength=10')}${ryInp('u_municipality_code', '支給市町村番号', '', 'text', 'maxlength=6')}${ryInp('u_birth_date', '生年月日', '', 'date')}</div><div class="row">${ryInp('u_address', '住所', '')}${ryInp('u_phone', '電話', '')}${ryInp('u_emergency_contact', '緊急連絡先', '')}</div>
    <button onclick="ryAddWorker()">追加</button></div>`);
};
async function ryAddWorker() { ryGo(async () => {
  const name = ryV('n_name').trim(), email = ryV('n_email').trim(), pw = ryV('n_pw');
  if (!name || !email) throw new Error('氏名とメールを入れてください');
  const id = await rRpc('bp_create_worker', { p_email: email, p_password: pw, p_name: name });
  const p = ryPrivFromForm(); delete p.decision_service_code; await rUps('bp_worker_private', { user_id: id, ...p, decision_service_code: '461000' }, 'user_id');
  RYD.st.user = null; await renderRydeen('users'); ryMsg(ryEsc(name) + ' さんを追加しました。', true); }); }
const ryUserDetail = async id => {
  const [p, x] = await Promise.all([rb(`bp_profiles?id=eq.${id}&role=eq.worker&select=id,display_name`), rb(`bp_worker_private?user_id=eq.${id}`)]);
  if (!p.length) { RYD.st.user = null; return RV.users('users'); }
  const v = x[0] || {}, sel = (i, list, cur) => `<div><label class="l">${i[1]}</label><select id="${i[0]}">${list.map(o => `<option ${o === cur ? 'selected' : ''}>${o}</option>`).join('')}</select></div>`;
  ryAdminFrame('users', `<button class="back" onclick="RYD.st.user=null;renderRydeen('users')">← 利用者一覧</button><h3>${ryEsc(p[0].display_name)}</h3><div class="card">
    <div class="row">${ryInp('u_name', '氏名', p[0].display_name)}${ryInp('u_recipient_number', '受給者証番号', v.recipient_number, 'text', 'maxlength=10')}${ryInp('u_municipality_code', '支給市町村番号', v.municipality_code, 'text', 'maxlength=6')}</div>
    <div class="row">${ryInp('u_birth_date', '生年月日', v.birth_date, 'date')}${ryInp('u_address', '住所', v.address)}${ryInp('u_phone', '電話', v.phone)}${ryInp('u_emergency_contact', '緊急連絡先', v.emergency_contact)}</div>
    <h4>国保連請求用の項目</h4><div class="row">${ryInp('u_name_kana', '氏名カナ', v.name_kana)}${ryInp('u_support_level', '障害支援区分(0〜6・B型は不要)', v.support_level, 'number', 'min=0 max=6')}${sel(['u_cap_management', '上限額管理'], ['無', '有'], v.cap_management || '無')}</div>
    <div class="row">${ryInp('u_cap_amount', '負担上限月額(円)', v.cap_amount ?? 0, 'number')}${ryInp('u_cap_office_no', '上限額管理事業所番号', v.cap_office_no, 'text', 'maxlength=10')}${ryInp('u_decision_service_code', '決定サービスコード', v.decision_service_code && v.decision_service_code !== '221000' ? v.decision_service_code : '461000')}</div>
    <div class="row">${ryInp('u_contract_days', '契約支給量(日)「原則」または数字', v.contract_days || '原則')}${ryInp('u_provider_entry_no', '事業者記入欄番号', v.provider_entry_no || '1')}${ryInp('u_contract_start', '契約開始日', v.contract_start, 'date')}</div>
    <div class="row">${ryInp('u_contract_end', '契約終了日', v.contract_end, 'date')}${ryInp('u_service_start_date', 'サービス開始日(最初の提供日)', v.service_start_date, 'date')}</div>
    <button onclick="rySaveUser('${id}')">保存</button></div>`);
};
async function rySaveUser(id) { ryGo(async () => { await rUpd('bp_profiles', 'id=eq.' + id, { display_name: ryV('u_name').trim() }); await rUps('bp_worker_private', { user_id: id, ...ryPrivFromForm(), updated_at: new Date().toISOString() }, 'user_id'); ryMsg('保存しました。', true); }); }

// ---------- 職員: 作業タスク ----------
const ryTaskForm = (t, today) => `<div class="row">${ryInp('t_title', 'タイトル', t.title)}${ryInp('t_date', '日付', t.task_date || today, 'date')}<div><label class="l">担当</label><select id="t_to"><option value="">全員</option>${RYD.workers.map(w => `<option value="${w.id}" ${w.id === t.assigned_to ? 'selected' : ''}>${ryEsc(w.display_name)}</option>`).join('')}</select></div></div>
  <label class="l">内容</label><textarea id="t_desc">${ryEsc(t.description || '')}</textarea>`;
const ryTaskBody = () => ({ title: ryV('t_title').trim(), description: ryV('t_desc'), task_date: ryV('t_date'), assigned_to: ryNull(ryV('t_to')) });
RV.tasks = async () => {
  const eid = RYD.st.task;
  if (eid !== undefined && eid !== null) { const t = eid === 'new' ? {} : (await rb(`bp_tasks?id=eq.${eid}`))[0];
    return ryAdminFrame('tasks', `<button class="back" onclick="RYD.st.task=null;renderRydeen('tasks')">← 戻る</button><h3>${eid === 'new' ? '新規作成' : 'タスク編集'}</h3><div class="card">${ryTaskForm(t || {}, ryToday())}<button onclick="rySaveTask('${eid}')">保存</button> ${eid === 'new' ? '' : `<button class="del inl" onclick="ryDelTask('${eid}')">削除</button>`}</div>`); }
  const tasks = await rb('bp_tasks?select=id,title,task_date,assigned_to&order=task_date.desc&limit=100');
  ryAdminFrame('tasks', `<h3>作業タスク</h3><button onclick="RYD.st.task='new';renderRydeen('tasks')">新規作成</button><div class="card"><table class="tbl"><tr><th>日付</th><th>タイトル</th><th>担当</th><th></th></tr>${tasks.map(t => `<tr><td>${t.task_date}</td><td>${ryEsc(t.title)}</td><td>${ryEsc(RYD.wname[t.assigned_to] || '全員')}</td><td><button class="inl sec" onclick="RYD.st.task='${t.id}';renderRydeen('tasks')">編集</button></td></tr>`).join('')}</table></div>`);
};
async function rySaveTask(id) { ryGo(async () => { const b = ryTaskBody(); if (!b.title) throw new Error('タイトルを入れてください');
  if (id === 'new') await rIns('bp_tasks', { ...b, created_by: RYD.me.uid }); else await rUpd('bp_tasks', 'id=eq.' + id, b); RYD.st.task = null; await renderRydeen('tasks'); }); }
async function ryDelTask(id) { if (!confirm('このタスクを削除しますか？')) return; ryGo(async () => { await rDel('bp_tasks', 'id=eq.' + id); RYD.st.task = null; await renderRydeen('tasks'); }); }

// ---------- 職員: マニュアル（PDF不要・Web上で作成） ----------
RV.manuals = async () => {
  const eid = RYD.st.manual;
  if (eid !== undefined && eid !== null) { const m = eid === 'new' ? { published: true, image_paths: [] } : (await rb(`bp_manuals?id=eq.${eid}`))[0]; RYD.st.mcur = m;
    return ryAdminFrame('manuals', `<button class="back" onclick="RYD.st.manual=null;renderRydeen('manuals')">← 戻る</button><h3>${eid === 'new' ? 'マニュアルを新規作成' : 'マニュアル編集'}</h3><div class="card">${ryInp('m_title', 'タイトル', m.title)}
      <label class="l">本文（改行はそのまま表示されます）</label><textarea id="m_body" style="min-height:200px">${ryEsc(m.body || '')}</textarea>
      <div class="row">${(m.image_paths || []).map(p => `<label><img src="${ryPublicUrl(p)}" style="width:100%;border:1px solid #ccc;border-radius:8px"><input type="checkbox" class="m_rm" value="${ryEsc(p)}"> 削除</label>`).join('')}</div>
      <label class="l">画像を追加（複数可）</label><input id="m_img" type="file" accept="image/*" multiple>
      <label class="l"><input id="m_pub" type="checkbox" ${m.published ? 'checked' : ''}> 利用者に公開する</label>
      <button onclick="rySaveManual('${eid}')">保存</button> ${eid === 'new' ? '' : `<button class="del inl" onclick="ryDelManual('${eid}')">マニュアルを削除</button>`}</div>`); }
  const list = await rb('bp_manuals?select=id,title,published,updated_at&order=updated_at.desc');
  ryAdminFrame('manuals', `<h3>マニュアル</h3><button onclick="RYD.st.manual='new';renderRydeen('manuals')">新規作成</button><div class="card"><table class="tbl"><tr><th>タイトル</th><th>公開</th><th>更新</th><th></th></tr>${list.map(m => `<tr><td>${ryEsc(m.title)}</td><td>${m.published ? '公開' : '非公開'}</td><td>${m.updated_at.slice(0, 10)}</td><td><button class="inl sec" onclick="RYD.st.manual='${m.id}';renderRydeen('manuals')">編集</button></td></tr>`).join('')}</table></div>`);
};
async function rySaveManual(id) { ryGo(async () => {
  const title = ryV('m_title').trim(); if (!title) throw new Error('タイトルを入れてください');
  const cur = RYD.st.mcur || {}, rm = [...document.querySelectorAll('.m_rm:checked')].map(e => e.value);
  await ryRemoveObjects('bp-manual-images', rm);
  const added = []; for (const f of document.getElementById('m_img').files) if (f.type.startsWith('image/')) added.push(await ryUpload('bp-manual-images', f));
  const row = { title, body: ryV('m_body'), published: ryC('m_pub'), image_paths: [...(cur.image_paths || []).filter(p => !rm.includes(p)), ...added] };
  if (id === 'new') await rIns('bp_manuals', row); else await rUpd('bp_manuals', 'id=eq.' + id, { ...row, updated_at: new Date().toISOString() });
  RYD.st.manual = null; await renderRydeen('manuals'); }); }
async function ryDelManual(id) { if (!confirm('このマニュアルを削除しますか？')) return; ryGo(async () => { const m = (await rb(`bp_manuals?id=eq.${id}&select=image_paths`))[0]; await ryRemoveObjects('bp-manual-images', m ? m.image_paths : []); await rDel('bp_manuals', 'id=eq.' + id); RYD.st.manual = null; await renderRydeen('manuals'); }); }

// ---------- 職員: 職員専用メモ・共有ファイル ----------
RV.notes = async () => {
  const [notes, files] = await Promise.all([rb('bp_staff_notes?select=id,title,body,created_at,worker_id&order=created_at.desc'), rb('bp_files?select=id,name,storage_path,size_bytes,created_at&order=created_at.desc')]);
  const urls = {}; for (const f of files) urls[f.id] = await rySignedUrl('bp-staff-files', f.storage_path);
  ryAdminFrame('notes', `<h3>職員専用メモ・共有ファイル <small class="note">（利用者には完全に非公開）</small></h3>
    <div class="card"><h4>メモを追加</h4>${ryInp('nt_title', 'タイトル', '')}<label class="l">対象の利用者（任意）</label><select id="nt_w"><option value="">指定なし</option>${RYD.workers.map(w => `<option value="${w.id}">${ryEsc(w.display_name)}</option>`).join('')}</select>
    <label class="l">内容</label><textarea id="nt_body"></textarea><button onclick="ryAddNote()">保存</button></div>
    ${notes.map(n => `<div class="card"><div style="display:flex;justify-content:space-between"><b>${ryEsc(n.title)}</b><span class="note">${n.created_at.slice(0, 10)} ${ryEsc(RYD.wname[n.worker_id] || '')}</span></div><p class="pre">${ryEsc(n.body)}</p><button class="del inl" onclick="ryDelNote('${n.id}')">削除</button></div>`).join('')}
    <div class="card"><h4>共有ファイル</h4><input id="nf_file" type="file"><button onclick="ryUploadFile()">アップロード</button><ul>${files.map(f => `<li>${urls[f.id] ? `<a href="${urls[f.id]}" target="_blank" rel="noopener">${ryEsc(f.name)}</a>` : ryEsc(f.name)} <small>${Math.round((f.size_bytes || 0) / 1024)}KB</small> <button class="del inl" onclick="ryDelFile('${f.id}')">削除</button></li>`).join('')}</ul></div>`);
};
async function ryAddNote() { ryGo(async () => { const t = ryV('nt_title').trim(); if (!t) throw new Error('タイトルを入れてください'); await rIns('bp_staff_notes', { title: t, body: ryV('nt_body'), worker_id: ryNull(ryV('nt_w')) }); await renderRydeen('notes'); }); }
async function ryDelNote(id) { if (!confirm('このメモを削除しますか？')) return; ryGo(async () => { await rDel('bp_staff_notes', 'id=eq.' + id); await renderRydeen('notes'); }); }
async function ryUploadFile() { ryGo(async () => { const f = document.getElementById('nf_file').files[0]; if (!f) throw new Error('ファイルを選んでください');
  const path = await ryUpload('bp-staff-files', f); await rIns('bp_files', { name: f.name, storage_path: path, size_bytes: f.size }); await renderRydeen('notes'); }); }
async function ryDelFile(id) { if (!confirm('このファイルを削除しますか？')) return; ryGo(async () => { const f = (await rb(`bp_files?id=eq.${id}&select=storage_path`))[0]; if (f) await ryRemoveObjects('bp-staff-files', [f.storage_path]); await rDel('bp_files', 'id=eq.' + id); await renderRydeen('notes'); }); }

// ---------- 職員: 提出された日報 ----------
const RY_COND = { good: '😊 元気', normal: '😐 ふつう', bad: '😣 つらい' };
RV.reports = async () => {
  const d = await rb('bp_daily_reports?select=id,report_date,worker_id,work_content,condition,reflection&order=report_date.desc&limit=100');
  ryAdminFrame('reports', `<h3>提出された日報</h3>${d.map(r => `<div class="card"><p><b>${r.report_date}　${ryEsc(RYD.wname[r.worker_id] || '')}　${RY_COND[r.condition] || ''}</b></p><p class="pre"><b>作業:</b> ${ryEsc(r.work_content)}</p>${r.reflection ? `<p class="pre"><b>ふりかえり:</b> ${ryEsc(r.reflection)}</p>` : ''}</div>`).join('') || '<div class="card">日報はまだありません。</div>'}`);
};

// ================= 利用者（worker）の画面 =================
RW.home = async () => {
  const t = await rb(`bp_tasks?task_date=eq.${ryToday()}&select=id,title,description&order=created_at`);   // RLS: 本日・自分宛/全員宛のみ
  ryWorkerFrame('home', `<h2>今日の作業（${ryToday()}）</h2>${t.length ? t.map((x, i) => `<div class="card" style="margin:12px 0"><p class="big"><b>${i + 1}. ${ryEsc(x.title)}</b></p>${x.description ? `<p class="pre">${ryEsc(x.description)}</p>` : ''}</div>`).join('') : '<div class="card">今日の作業はまだありません。</div>'}`);
};
RW.manuals = async () => {
  const id = RYD.st.wmanual;
  if (id) { const m = (await rb(`bp_manuals?id=eq.${id}&select=title,body,image_paths`))[0]; if (m) return ryWorkerFrame('manuals', `<button class="back" onclick="RYD.st.wmanual=null;renderRydeen('manuals')">← 一覧にもどる</button><h2>${ryEsc(m.title)}</h2><div class="card pre">${ryEsc(m.body)}</div>${(m.image_paths || []).map(p => `<img src="${ryPublicUrl(p)}" style="width:100%;border-radius:10px;border:1px solid #ccc;margin:8px 0" alt="">`).join('')}`); }
  const l = await rb('bp_manuals?select=id,title&order=title');
  ryWorkerFrame('manuals', `<h2>作業マニュアル</h2>${l.length ? l.map(m => `<a class="tile" style="display:block;text-align:left;margin:10px 0;font-size:22px" href="#rydeen/manuals" onclick="RYD.st.wmanual='${m.id}';renderRydeen('manuals');return false">${ryEsc(m.title)}</a>`).join('') : '<div class="card">マニュアルはまだありません。</div>'}`);
};
RW.report = async () => {
  const me = (await rb(`bp_daily_reports?worker_id=eq.${RYD.me.uid}&report_date=eq.${ryToday()}&select=work_content,condition,reflection`))[0];
  const done = RYD.st.reportDone; RYD.st.reportDone = false;
  ryWorkerFrame('report', `<h2>日報</h2>${done ? '<div class="okb">送信しました。おつかれさまでした！</div>' : me ? '<div class="okb">今日の日報は送信済みです。直すこともできます。</div>' : ''}
    <label class="l big">今日の作業内容</label><textarea id="r_work" style="font-size:20px">${ryEsc(me ? me.work_content : '')}</textarea>
    <label class="l big">今日の体調</label><div class="grid">${Object.entries(RY_COND).map(([k, l]) => `<label class="tile" style="font-size:22px"><input type="radio" name="r_cond" value="${k}" ${me && me.condition === k ? 'checked' : ''}>${l}</label>`).join('')}</div>
    <label class="l big">ふりかえり</label><textarea id="r_ref" style="font-size:20px">${ryEsc(me ? me.reflection : '')}</textarea><button onclick="rySendReport()">送信する</button>`);
};
async function rySendReport() { ryGo(async () => {
  const work = ryV('r_work').trim(), c = document.querySelector('input[name=r_cond]:checked');
  if (!work) throw new Error('作業内容を入力してください'); if (!c) throw new Error('体調を選んでください');
  await rUps('bp_daily_reports', { worker_id: RYD.me.uid, report_date: ryToday(), work_content: work, condition: c.value, reflection: ryV('r_ref') }, 'worker_id,report_date');
  RYD.st.reportDone = true; await renderRydeen('report'); }); }
