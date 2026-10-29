// 電子サイン（労働契約書・秘密情報の保持に関する誓約書）。データは Supabase の staff_docs / doc_signatures（supabase/esign.sql）
// 職員: #sign で読んで手書き署名／事務: #clerk/docs で職員別一覧・紙の締結済み登録・発行・印刷
// 見えるものは DB 側（RLS）で決まる。画面で隠すだけの所はない。個人データはこのファイルに書かない
const ES = () => C.esign || { enabled: false, docTypes: {} };
const ES_TYPE = t => (ES().docTypes || {})[t] || t;
const ES_STATUS = { draft: '下書き', issued: '署名待ち', signed: '署名済み', paper: '紙で締結済み', superseded: '更新前', void: '取消' };
const esDate = s => s ? new Date(s).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric' }) : '—';
const esDT = s => s ? new Date(s).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
async function esSha(text) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
// RPC はサーバーのエラー文をそのまま出す（署名がない、氏名未登録などを伝えるため）
async function esRpc(fn, args) {
  const s = JSON.parse(localStorage.getItem('sess') || '{}');
  const r = await fetch(C.supabaseUrl + '/rest/v1/rpc/' + fn, { method: 'POST',
    headers: { apikey: C.supabaseKey, Authorization: 'Bearer ' + s.token, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  const t = await r.text();
  if (!r.ok) { let m = ''; try { m = JSON.parse(t).message; } catch (e) { } throw new Error(m || ('失敗しました（' + r.status + '）')); }
  try { return JSON.parse(t); } catch (e) { return null; }
}
const ES_PRINT_CSS = '<style>@media print{header,.back,.noprint,#help,.ptabs,#esOv{display:none!important}body{background:#fff}main{max-width:none}.card{box-shadow:none}.esdoc{break-inside:avoid;page-break-after:always}}.esdoc{white-space:pre-wrap;line-height:1.7;font-size:15px;border:1px solid #ccc;border-radius:8px;padding:14px;background:#fff;max-height:none}.esbox{max-height:340px;overflow:auto}.esrec{font-size:13px;color:#333;background:#f1f6f3;border-radius:8px;padding:8px 10px;margin:8px 0}.essig{display:block;max-width:280px;max-height:110px;background:#fff;border:1px solid #ccc;border-radius:6px;margin:4px 0 6px}#esPrev{border:2px dashed #888;border-radius:8px;min-height:90px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#666;background:#fff;padding:8px;cursor:pointer;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent}#esPrev img{max-width:100%;max-height:120px;background:#fff}</style>';

// ---- 見本データ（架空） ----
const ES_DEMO_TXT = '労働条件通知書兼雇用契約書（見本）\n\n契約締結日：令和8年10月15日\n氏名：見本 花子\n\n雇用期間：期間の定めあり（令和8年10月15日から令和9年10月14日）\n試用期間：なし\n就業の場所：レオ\n仕事の内容：（見本）\n賃金：基本給 1,000円（時給）\n割増賃金率：就業規則による\n\n（見本データです。実際の文面ではありません）';
const ES_DEMO_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAARgAAABQCAYAAADC8mo5AAADl0lEQVR4nO3cUW7rOBBE0Swi+9+qgwe8AILh2JTI6q6i7gHmc6xmh7o25mO+HgAg8tU9AIB9ERgAMgQGgAyBASBDYADIEBgAMgQGgAyBASBDYADIEBgAMgQGgAyBASBDYADIEBgAMgQGgAyBASBDYADIEBgAMgQGgAyBKfL9/d09AlCOwBT4F5fff4A7ITBix7gQmrXYoz8CI/RXXIjMPPaYgcAIfQoML8c17DEHgREZiQsvx3nsMYt9YBIvzrsXgJdjDrHOYh2Y1Ivz6eLzclzDL8I8loFJvjyjcyefr/PZRCaLXWDSL8+ZedPO1znjuz2l7fFOrAKT/g11Zc6U83XOOLKjlD2OSp//l01g3l2QhMszM+Pu51M8223GVXY4w5FFYHb4hpqdzf18j6ZfMWf3krDHV1J/tX/SHpgzy3Rd/Kq5XM/3q2O+K89z3uErI3FJOcuz1sBcWaDj0lfO43i+o8rZZp7lvMOjs3FxP8+ztsDMLM1p4Yo5nM73SsVsK3aQtsPnOXeITEtgVJeneuHqGRzOODqX6zPc9nclGsmhKQ/MygV1Lzvlm1whJaxO+5uNRGJoygKjWkrXsiuf6XiZqgOz+vO6v4iuzjLyWd1346gkMBVL2P2Fd7xIinlUZ+zanyoEKaGRB2bHF7/rD+l2iZICo/7s0edVnMnpjkgDs+M3ffcfsPv5I/M4fJbbM7q+XLvviCwwnYdUPtvhD+d0gVbN0v0yqj63+m/kMMORJDAOB1PM0H2mT7M4RabjMzqf5/RSj8xTNdPywLgsePUsTudym2l2jo5zVNwN1/tROd/SwKQtefZzHLjsfHVgKqjC6HQ/Hs1zLgtM6pLV/24Fh/muzpA4t8Mvgys65l0SmJQlp74EIxz+Bqte1Gpn5kgMy1HcL5i0RZ+dd+ezdT/fabefZk/91fKXqpmX/4JJMPuN5az78s/+Eug0EhG3md0t/W8wSUYuS/Jlco+M624Jy1rt/0e7Tu8uzg6Xqmvu9HATl3VuHZjHDb6xuuZOD/du96DL7QPz4BtL4kxgXKXM6YzA/Edg1tvhl6H7fO4IzEHiC+AsPS6YR2Be4AVYh7jcG4H5Ay/AGgTm3ggM5IjLfREYlCAu90RgUIa43A+BASBDYADIEBgAMgQGgAyBASBDYADIEBgAMgQGgAyBASBDYADIEBgAMgQGgAyBASBDYADIEBgAMgQGgAyBASBDYADIEBgAMgQGgAyBASBDYADIEBgAMj9/P2Ez3ejpZQAAAABJRU5ErkJggg==';
const ES_DEMO = {
  docs: [
    { id: 1, doc_type: 'labor_contract', method: 'electronic', status: 'issued', rendered_text: ES_DEMO_TXT, issued_at: new Date().toISOString(), period_end: '2027-10-14' },
    { id: 2, doc_type: 'confidentiality', method: 'electronic', status: 'signed', rendered_text: '秘密情報の保持に関する誓約書（見本）\n\n（見本データです）', issued_at: '2026-10-01T00:00:00Z' },
  ],
  sigs: [{ doc_id: 2, typed_name: '見本 花子', text_sha256: 'a'.repeat(64), template_version: 1, signed_at: '2026-10-02T03:00:00Z', signature_png: ES_DEMO_PNG }],
  overview: [
    { user_id: 'u1', full_name: '見本 花子', office: 'レオ', contract_status: 'issued', contract_method: 'electronic', contract_doc: 1, contract_end: '2027-10-14', pledge_status: 'signed', pledge_doc: 2, pledge_date: '2026-10-02' },
    { user_id: 'u2', full_name: '見本 太郎', office: 'レオ', contract_status: 'paper', contract_method: 'paper', contract_doc: 3, contract_date: '2025-12-19', contract_end: '2026-12-18', pledge_status: 'paper', pledge_method: 'paper', pledge_doc: 4, pledge_date: '2025-12-19' },
    { user_id: 'u3', full_name: '見本 次郎', office: '茶夢', contract_status: null, pledge_status: null },
  ],
};

// ---- トップのバッジ（未署名があれば出す） ----
async function esignBadge() {
  if (!ES().enabled) return;
  try {
    const docs = DEMO ? ES_DEMO.docs : await sb('staff_docs?select=id,status&status=eq.issued');
    const n = docs.filter(d => d.status === 'issued').length;
    const a = document.querySelector('a[href="#sign"]');
    if (a && n) a.insertAdjacentHTML('afterbegin', `<span class="badge">署名待ち ${n}</span>`);
  } catch (e) { }
}

// ---- 職員：書類の確認と署名 ----
let ES_OPEN = null;
async function renderSign() {
  esPadHide();
  const back = `<button class="back" onclick="location.hash=''">← トップへ</button>`;
  $('view').innerHTML = ES_PRINT_CSS + back + '<p>読み込み中…</p>';
  try {
    const docs = DEMO ? ES_DEMO.docs : await sb('staff_docs?select=id,doc_type,method,status,rendered_text,paper_date,period_end,issued_at&order=id.desc');
    const sigs = DEMO ? ES_DEMO.sigs : await sb('doc_signatures?select=doc_id,typed_name,signature_png,text_sha256,template_version,signed_at');
    const sg = Object.fromEntries(sigs.map(s => [s.doc_id, s]));
    const mine = docs.filter(d => d.status !== 'superseded');
    const rows = mine.map(d => `<div class="card" style="margin:10px 0"><b>${esc(ES_TYPE(d.doc_type))}</b>
      <span class="badge" style="background:${d.status === 'issued' ? '#d33' : '#2e6b4f'}">${ES_STATUS[d.status] || d.status}</span>
      ${d.status === 'signed' ? `<br><small>${esDT(sg[d.id]?.signed_at)} に署名</small>` : ''}${d.status === 'paper' ? `<br><small>紙で締結済み（${esDate(d.paper_date)}）</small>` : ''}
      ${d.rendered_text ? `<button style="margin-top:8px" onclick="esOpenDoc(${d.id})">${d.status === 'issued' ? '内容を確認して署名する' : '内容を見る'}</button>` : ''}</div>`).join('');
    const open = mine.find(d => d.id === ES_OPEN);
    $('view').innerHTML = ES_PRINT_CSS + back + `<h3>書類の確認と署名</h3>${DEMO ? '<p class="note">見本データです（架空）</p>' : ''}` +
      (open ? await esDocView(open, sg[open.id]) : (rows || '<p>いま確認する書類はありません。</p>'));
  } catch (e) { $('view').innerHTML = ES_PRINT_CSS + back + `<p>${esc(e.message)}</p>`; }
}
function esOpenDoc(id) {
  if (ES_OPEN !== id) esSigData = null;
  ES_OPEN = id;
  renderSign();
}
function esBackDocs() {
  esSigData = null;
  ES_OPEN = null;
  renderSign();
}
async function esDocView(d, s) {
  const sha = s ? await esSha(d.rendered_text) : '';
  const rec = s ? `<div class="esrec">${esSigImg(s)}署名者：${esc(s.typed_name)}／署名日時：${esDT(s.signed_at)}／文面の版：${s.template_version}<br>
    文面の指紋(SHA-256)：<code>${s.text_sha256.slice(0, 16)}…</code> ${DEMO ? '' : (sha === s.text_sha256 ? '✅ 文面は署名時から変わっていません' : '⚠️ 文面が署名時と一致しません。事務に連絡してください')}</div>` : '';
  const sign = d.status === 'issued' ? `<div class="noprint"><label><input type="checkbox" id="esRead" style="width:auto"> 最後まで読み、内容を確認しました</label>
    <p style="margin:12px 0 6px">署名（下の枠をタップすると、画面いっぱいで書けます）</p>
    <div id="esPrev" onclick="esOpenPad()">${esPrevHtml()}</div>
    <p class="note" style="font-size:14px">署名者の氏名は、登録されている氏名で記録されます。</p>
    <button id="esBtn" onclick="esSign(${d.id})">同意して署名する</button><div id="esMsg" style="color:#c00"></div></div>` : '';
  return `<button class="back noprint" onclick="esBackDocs()">← 書類一覧へ</button>
    <h4>${esc(ES_TYPE(d.doc_type))}</h4><div class="esdoc ${d.status === 'issued' ? 'esbox' : ''}">${esc(d.rendered_text)}</div>${rec}
    ${sign}${s ? '<button class="noprint" onclick="window.print()" style="background:#fff;color:#333;border:1px solid #bbb">印刷／PDFにする</button>' : ''}`;
}
async function esSign(id) {
  if (!$('esRead').checked) { $('esMsg').textContent = '「内容を確認しました」にチェックしてください。'; return; }
  if (!esPngOk(esSigData)) { $('esMsg').textContent = '署名を書いてください。'; return; }
  if (DEMO) { alert('見本モードなので保存しません'); return; }
  if (!confirm('この内容に同意して署名します。よろしいですか？')) return;
  $('esBtn').disabled = true;
  try { await esRpc('doc_sign', { p_doc: id, p_signature: esSigData }); esSigData = null; ES_OPEN = id; renderSign(); }
  catch (e) { $('esMsg').textContent = e.message; $('esBtn').disabled = false; }
}
// 手書き署名。金斗雲の契約署名（contract_sign.html）と同じく、signpad.js を全画面で使う
function esPngOk(s) {
  return typeof s === 'string' && s.length <= 300000 && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(s);
}
function esSigImg(s) {
  return s && esPngOk(s.signature_png) ? `<img class="essig" src="${s.signature_png}" alt="手書き署名">` : '';
}
function esPrevHtml() {
  return esPngOk(esSigData) ? `<img src="${esSigData}" alt="署名"><div style="font-size:13px;color:#777">タップして書き直し</div>` : 'タップして署名を書く';
}
let esPad = null, esSigData = null, esScrollY = 0;
function esEnsurePad() {
  if (document.getElementById('esOv')) return;
  const st = document.createElement('style');
  st.id = 'esPadCss';
  st.textContent = 'body.lock{overflow:hidden;position:fixed;width:100%;touch-action:none}body.lock #uk_fab{display:none!important}#esOv,#esCv{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent}#esOv{position:fixed;left:0;top:0;right:0;bottom:0;width:100%;height:100%;max-height:100dvh;box-sizing:border-box;background:#fff;z-index:120;touch-action:none;display:flex;flex-direction:column;overflow:hidden}#esOv[hidden]{display:none}#esCvw{flex:1;min-height:0;position:relative;overflow:hidden}#esCv{position:absolute;left:0;top:0;width:100%;height:100%;touch-action:none;display:block}#esOvb{flex:none;box-sizing:border-box;padding:8px 10px;padding-bottom:max(env(safe-area-inset-bottom),12px);background:#fff;display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;border-top:1px solid #ccc}#esOvb span{color:#888;font-size:14px}#esOv button{margin:0}#esOv .esSub{background:#fff;color:#333;border:1px solid #bbb;width:auto;padding:6px 14px;font-size:14px}#esOv .esOk{width:auto;padding:10px 18px;font-size:16px}';
  document.head.appendChild(st);
  const ov = document.createElement('div');
  ov.id = 'esOv';
  ov.hidden = true;
  ov.innerHTML = '<div id="esCvw"><canvas id="esCv"></canvas></div><div id="esOvb"><span>指で書いてください</span><button type="button" class="esSub" onclick="esPadClr()">書き直す</button><button type="button" class="esSub" onclick="esPadClose(false)">閉じる</button><button type="button" class="esOk" onclick="esPadClose(true)">これでよい</button></div>';
  document.body.appendChild(ov);
}
function esLock() {
  if (document.body.classList.contains('lock')) return;
  esScrollY = window.scrollY;
  document.body.style.top = (-esScrollY) + 'px';
  document.body.classList.add('lock');
  document.documentElement.style.overscrollBehavior = 'none';
}
function esPadHide() {
  const ov = document.getElementById('esOv');
  if (ov) ov.hidden = true;
  if (!document.body || !document.body.classList.contains('lock')) return;
  document.body.classList.remove('lock');
  document.body.style.top = '';
  document.documentElement.style.overscrollBehavior = '';
  window.scrollTo(0, esScrollY);
}
function esPadRemeasure() { if (esPad && document.getElementById('esOv') && !document.getElementById('esOv').hidden) esPad.remeasure(); }
function esOpenPad() {
  if (typeof createSignPad !== 'function') { const m = document.getElementById('esMsg'); if (m) m.textContent = '署名欄を読み込めませんでした。ページを読み込み直してください。'; return; }
  esEnsurePad();
  esLock();
  document.getElementById('esOv').hidden = false;
  if (!esPad) esPad = createSignPad(document.getElementById('esCv'));
  esPad.clear();
  esPad.remeasure();
  requestAnimationFrame(esPadRemeasure);
}
function esPadClr() { if (esPad) esPad.clear(); esSigData = null; }
function esCropPng(cv) {
  const g0 = cv.getContext('2d'), W = cv.width, H = cv.height, d = g0.getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; if (d[i] < 200) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
  if (x1 < x0) return null;
  const p = 16, sx = Math.max(0, x0 - p), sy = Math.max(0, y0 - p), sw = Math.min(W - sx, x1 - x0 + 2 * p), sh = Math.min(H - sy, y1 - y0 + 2 * p), sc = Math.min(1, 600 / sw);
  const t = document.createElement('canvas'); t.width = Math.max(1, Math.round(sw * sc)); t.height = Math.max(1, Math.round(sh * sc));
  const g = t.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, t.width, t.height); g.drawImage(cv, sx, sy, sw, sh, 0, 0, t.width, t.height);
  return t.toDataURL('image/png');
}
function esShowPrev() { const p = document.getElementById('esPrev'); if (p) p.innerHTML = esPrevHtml(); }
function esPadClose(ok) {
  esPadHide();
  if (ok && esPad && esPad.isDrawn()) {
    const png = esCropPng(document.getElementById('esCv'));
    esSigData = esPngOk(png) ? png : null;
  }
  esShowPrev();
}
if (typeof window !== 'undefined') {
  window.addEventListener('resize', esPadRemeasure);
  window.addEventListener('orientationchange', () => { esPadRemeasure(); setTimeout(esPadRemeasure, 300); });
  window.addEventListener('hashchange', () => {
    const h = decodeURIComponent(location.hash.slice(1)).split('?')[0].split('/')[0];
    if (h !== 'sign') esPadHide();
  });
}

// ---- 事務：書類管理 ----
let ES_SEL = null, ES_FILTER = 'すべて';
async function renderDocsAdmin() {
  const back = `<button class="back" onclick="location.hash=''">← トップへ</button>`;
  if (ROLE !== '事務') { $('view').innerHTML = back + '<p>事務の方だけが見られます。</p>'; return; }
  $('view').innerHTML = ES_PRINT_CSS + back + '<p>読み込み中…</p>';
  try {
    const ov = DEMO ? ES_DEMO.overview : await sb('v_doc_overview?select=*&order=office,full_name');
    if (ES_SEL) return esAdminDetail(ov.find(x => x.user_id === ES_SEL), back);
    const cell = (st, m, d, extra) => st ? `${st === 'paper' ? '📄 紙で締結済み' : st === 'signed' ? '✅ 署名済み' : st === 'issued' ? '⏳ 署名待ち' : '📝 下書き'}<br><small>${esDate(d)}${extra || ''}</small>` : '<span class="badge">未</span>';
    const need = x => !['signed', 'paper'].includes(x.contract_status) || !['signed', 'paper'].includes(x.pledge_status);
    const soon = x => x.contract_end && (new Date(x.contract_end) - Date.now()) / 864e5 <= 90;
    let rows = ov; if (ES_FILTER === '未完了') rows = ov.filter(need); if (ES_FILTER === '期限90日以内') rows = ov.filter(soon);
    const tabs = ['すべて', '未完了', '期限90日以内'].map(f => `<button class="${f === ES_FILTER ? 'on' : ''}" onclick="ES_FILTER='${f}';renderDocsAdmin()">${f}</button>`).join('');
    $('view').innerHTML = ES_PRINT_CSS + back + `<h3>書類管理（契約書・誓約書）</h3>${DEMO ? '<p class="note">見本データです（架空）</p>' : ''}
      <p class="note"><a href="esign-help.html">使い方</a>／職員を選ぶと、全文と署名の記録が1枚で出ます（印刷・PDF可）。紙で締結済みの分は、署名なしで日付と備考だけ登録します。</p>
      <div class="noprint">${esFormButtons(null)}</div><p class="ptabs">${tabs}</p><table><tr><th>氏名</th><th>契約書</th><th>契約終了日</th><th>誓約書</th></tr>
      ${rows.map(x => `<tr style="cursor:pointer;${need(x) ? 'background:#fff6e5' : ''}" onclick="ES_SEL='${esc(x.user_id)}';renderDocsAdmin()"><td>${esc(x.full_name || '（氏名未登録）')}<br><small>${esc(x.office)}</small></td>
      <td>${cell(x.contract_status, x.contract_method, x.contract_date, x.contract_version ? '・第' + x.contract_version + '版' : '')}</td>
      <td>${esDate(x.contract_end)}${soon(x) ? ' <span class="badge">近い</span>' : ''}</td><td>${cell(x.pledge_status, x.pledge_method, x.pledge_date)}</td></tr>`).join('')}</table>`;
  } catch (e) { $('view').innerHTML = ES_PRINT_CSS + back + `<p>${esc(e.message)}</p>`; }
}
async function esAdminDetail(x, back) {
  if (!x) { ES_SEL = null; return renderDocsAdmin(); }
  const docs = DEMO ? ES_DEMO.docs : await sb(`staff_docs?user_id=eq.${encodeURIComponent(x.user_id)}&select=*&order=id.desc`);
  const sigs = DEMO ? ES_DEMO.sigs : await sb(`doc_signatures?user_id=eq.${encodeURIComponent(x.user_id)}&select=*`);
  const sg = Object.fromEntries(sigs.map(s => [s.doc_id, s]));
  const blocks = [];
  for (const d of docs.filter(d => d.status !== 'draft' && d.status !== 'void')) {
    const s = sg[d.id];
    const body = d.method === 'paper'
      ? `<div class="esrec">📄 <b>紙で締結済み</b>（電子署名はありません）／締結日：${esDate(d.paper_date)}${d.period_end ? '／期間：〜' + esDate(d.period_end) : ''}<br>備考：${esc(d.note || '—')}</div>`
      : `<div class="esdoc">${esc(d.rendered_text)}</div>` + (s ? `<div class="esrec">${esSigImg(s)}電子署名：${esc(s.typed_name)}／${esDT(s.signed_at)}／第${s.template_version}版<br>
         SHA-256：<code style="word-break:break-all">${s.text_sha256}</code><br>再計算：${DEMO ? '（見本では行いません）' : (await esSha(d.rendered_text)) === s.text_sha256 ? '✅ 一致（文面は署名時のまま）' : '⚠️ 不一致'}</div>` : '<div class="esrec">⏳ 署名待ち</div>');
    blocks.push(`<div class="esdoc-wrap"><h4>${esc(ES_TYPE(d.doc_type))}（${ES_STATUS[d.status]}）</h4>${body}</div>`);
  }
  const hist = docs.length;
  $('view').innerHTML = ES_PRINT_CSS + back + `<button class="back noprint" onclick="ES_SEL=null;renderDocsAdmin()">← 一覧へ</button>
    <h3>${esc(x.full_name || '')}（${esc(x.office)}）の契約書類${DEMO ? '（見本）' : ''}</h3>
    <p class="noprint"><button style="width:auto" onclick="window.print()">印刷／PDFにする</button></p>
    ${blocks.join('') || '<p>登録された書類はありません。</p>'}
    <div class="noprint">${esFormButtons(x.user_id)}</div><p class="note noprint">書類 ${hist} 件</p>`;
}
const esOpts = t => Object.entries(ES().docTypes || {}).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
function esPaperForm(x) {
  return `<h4>紙で締結済みを登録（署名なし）</h4><div class="card">
    <select id="pgType" style="width:100%;padding:10px">${esOpts()}</select>
    <label class="note">紙で締結した日</label><input id="pgDate" type="date">
    <label class="note">雇用期間の終了日（契約書のみ・無期なら空）</label><input id="pgEnd" type="date">
    <input id="pgNote" placeholder="備考（例：原本はファイル棚）。個人情報は書かない">
    <button onclick="esPaper($('fmUser').value)">「紙で締結済み」として登録</button><div id="pgMsg" style="color:#c00"></div></div>`;
}
async function esPaper(uid) {
  if (!uid) { $('pgMsg').textContent = '職員を選んでください。'; return; }
  const date = $('pgDate').value; if (!date) { $('pgMsg').textContent = '締結日を入れてください。'; return; }
  if (DEMO) { alert('見本モードなので保存しません'); return; }
  try { await esRpc('doc_register_paper', { p_user: uid, p_type: $('pgType').value, p_date: date, p_note: $('pgNote').value || null, p_start: null, p_end: $('pgEnd').value || null }); ES_SEL = null; location.hash = '#clerk/docs'; renderDocsAdmin(); }
  catch (e) { $('pgMsg').textContent = e.message; }
}
// 新しい書類を作る（下書き）→ 発行。契約書は既定値入りの入力欄、誓約書は日付だけ
const ES_FIELDS = [['period', '雇用期間（例：期間の定めあり（令和8年12月19日から令和9年12月18日））'], ['probation', '試用期間'], ['place', '就業の場所'], ['job', '仕事の内容'], ['hours', '就業時間'],
  ['overtime', '所定時間外・休日労働'], ['holidays', '休日'], ['leave', '休暇'], ['retire', '退職に関する事項'], ['wage', '賃金（基本給・単位・交通費）'], ['premium', '割増賃金率'],
  ['pay', '締切日・支払日・支払方法'], ['bonus', '賞与'], ['raise', '昇給'], ['retirement_pay', '退職金'], ['insurance', '社会保険・雇用保険'], ['remarks', '備考']];
function esDraftForm(x) {
  const E = ES(), D = { ...(E.defaults || {}), ...((E.officeDefaults || {})[x.office] || {}) };
  return `<h4>電子署名の書類を作る</h4><div class="card"><select id="dfType" style="width:100%;padding:10px" onchange="$('dfFields').hidden=this.value!=='labor_contract'">${esOpts()}</select>
    <label class="note">契約締結日（文面に入る日付）</label><input id="dfDate" placeholder="例：令和8年12月19日">
    <div id="dfFields">${ES_FIELDS.map(([k, l]) => `<label class="note">${l}</label><input id="df_${k}" value="${esc(D[k] || '')}">`).join('')}
    <label class="note">雇用期間の開始日・終了日（更新通知に使う。無期なら空）</label><input id="dfS" type="date"><input id="dfE" type="date"></div>
    <p class="note">マイナンバー・口座・生年月日・住所は入れません。</p>
    <button onclick="esDraft($('fmUser').value)">下書きを作って発行（本人に通知）</button><div id="dfMsg" style="color:#c00"></div></div>`;
}
async function esDraft(uid) {
  if (!uid) { $('dfMsg').textContent = '職員を選んでください。'; return; }
  const type = $('dfType').value, E = ES();
  if (!$('dfDate').value.trim()) { $('dfMsg').textContent = '契約締結日を入れてください。'; return; }
  const terms = { sign_date: $('dfDate').value.trim(), employer_name: E.employer.name, employer_address: E.employer.address, employer_rep: E.employer.rep };
  if (type === 'labor_contract') ES_FIELDS.forEach(([k]) => terms[k] = $('df_' + k).value.trim() || (k === 'remarks' ? 'なし' : ''));
  if (DEMO) { alert('見本モードなので保存しません'); return; }
  if (!confirm('この内容で発行し、本人に通知します。よろしいですか？')) return;
  try {
    const t = await sb(`doc_templates?doc_type=eq.${type}&retired_at=is.null&order=version.desc&limit=1&select=id`);
    if (!t[0]) throw new Error('文面（テンプレート）が登録されていません');
    const prev = await sb(`staff_docs?user_id=eq.${encodeURIComponent(uid)}&doc_type=eq.${type}&status=in.(signed,paper)&order=id.desc&limit=1&select=id`);
    const sess = JSON.parse(localStorage.getItem('sess') || '{}');
    const resp = await fetch(C.supabaseUrl + '/rest/v1/staff_docs', { method: 'POST', headers: { apikey: C.supabaseKey, Authorization: 'Bearer ' + sess.token, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ user_id: uid, doc_type: type, template_id: t[0].id, terms,
      period_start: $('dfS').value || null, period_end: $('dfE').value || null, prev_doc_id: prev[0]?.id || null, status: 'draft' }) });
    if (!resp.ok) throw new Error('下書きを作れませんでした（' + resp.status + '）');
    const r = await resp.json();
    await esRpc('doc_issue', { p_doc: r[0].id }); ES_SEL = null; location.hash = '#clerk/docs'; renderDocsAdmin();
  } catch (e) { $('dfMsg').textContent = e.message; }
}

// ---- 事務：作成画面（個別ページとは別。#clerk/docs/new ＝電子署名の書類 ／ #clerk/docs/paper ＝紙で締結済み） ----
let ES_FORM_UID = null;
function esFormButtons(uid) {
  return `<p><button style="width:auto" onclick="ES_FORM_UID=${uid ? "'" + esc(uid) + "'" : 'null'};location.hash='#clerk/docs/new'">✍️ 電子署名の書類を作る</button>
    <button style="width:auto;background:#666" onclick="ES_FORM_UID=${uid ? "'" + esc(uid) + "'" : 'null'};location.hash='#clerk/docs/paper'">📄 紙で締結済みを登録</button></p>`;
}
async function renderDocsForm(kind) {
  const back = `<button class="back" onclick="ES_SEL=null;location.hash='#clerk/docs'">← 書類管理へ戻る</button>`;
  if (ROLE !== '事務') { $('view').innerHTML = back + '<p>事務の方だけが見られます。</p>'; return; }
  $('view').innerHTML = ES_PRINT_CSS + back + '<p>読み込み中…</p>';
  try {
    const ov = DEMO ? ES_DEMO.overview : await sb('v_doc_overview?select=user_id,full_name,office&order=office,full_name');
    const sel = ES_FORM_UID && ov.find(x => x.user_id === ES_FORM_UID) ? ES_FORM_UID : '';
    const x = ov.find(o => o.user_id === sel) || ov[0] || { office: 'レオ' };
    const pick = `<label class="note">対象の職員</label><select id="fmUser" style="width:100%;padding:10px" onchange="ES_FORM_UID=this.value">
      <option value="">（職員を選んでください）</option>${ov.map(o => `<option value="${esc(o.user_id)}" ${o.user_id === sel ? 'selected' : ''}>${esc(o.full_name || '（氏名未登録）')}（${esc(o.office)}）</option>`).join('')}</select>`;
    const form = kind === 'paper' ? esPaperForm(x) : esDraftForm(x);
    $('view').innerHTML = ES_PRINT_CSS + back + `<h3>${kind === 'paper' ? '紙で締結済みを登録' : '電子署名の書類を作る'}</h3><div class="card">${pick}</div>${form}`;
  } catch (e) { $('view').innerHTML = ES_PRINT_CSS + back + `<p>${esc(e.message)}</p>`; }
}
