// 受付に来た依頼・報告の一覧（データは Supabase の uketsuke 表）
// 見られる範囲は DB 側（RLS）で決まる：職員＝自分の事業所だけ／事務＝全部。状態の変更だけできる
// 画面の「分からないことを送る」も、ここのフォームと同じ uketsuke_submit に送る（別の行き先は作らない）
const UK_STATUS = ['未対応', '対応中', '完了'];
const UK_CATS = ['その他', '日誌', '送迎', '請求', '計画', '記録'];
const UK_DEMO = [
  { id: 3, created_at: new Date().toISOString(), sender_name: '職員X', office: 'レオ', category: '送迎', body: '（見本）明日の児童Aのお迎えを15:00に変更お願いします', status: '未対応' },
  { id: 2, created_at: new Date().toISOString(), sender_name: '職員Y', office: 'レオ', category: '日誌', body: '（見本）昨日の日誌、児童Bの終了時刻が違っています', status: '対応中' },
  { id: 1, created_at: new Date().toISOString(), sender_name: '職員Z', office: '茶夢', category: 'その他', body: '（見本）コピー用紙が残り少ないです', status: '完了' },
];
let UK_FILTER = '未完了';
async function renderUketsuke() {
  const back = `<button class="back" onclick="location.hash=''">← トップへ</button>`;
  $('view').innerHTML = back + '<p>読み込み中…</p>';
  try {
    let rows = (typeof DEMO !== 'undefined' && DEMO) ? UK_DEMO.filter(r => ROLE === '事務' || r.office === 'レオ') : await sb('uketsuke?order=id.desc&limit=200');
    if (UK_FILTER === '未完了') rows = rows.filter(r => r.status !== '完了');
    const groups = {}; rows.forEach(r => (groups[r.office || '事業所未設定'] = groups[r.office || '事業所未設定'] || []).push(r));
    const tabs = ['未完了', 'すべて'].map(f => `<button class="${f === UK_FILTER ? 'on' : ''}" onclick="UK_FILTER='${f}';renderUketsuke()">${f}</button>`).join('');
    $('view').innerHTML = back + `<h3>受付</h3>${typeof DEMO !== 'undefined' && DEMO ? '<p class="note">見本データです（架空）</p>' : ''}
      <p class="note">ポータルから送られた依頼・報告です。${ROLE === '事務' ? '事務なので全事業所を表示しています。' : '自分の事業所の分だけ表示しています。'}対応したら状態を変えてください。どの画面からでも、右下の「分からないことを送る」で、いまのページのまま同じ受付に送れます。</p>
      <div class="card"><h4>✏️ ここから送る</h4>
      <select id="uk_c">${UK_CATS.map(c => `<option>${c}</option>`).join('')}</select>
      <textarea id="uk_b" rows="3" maxlength="4000" style="width:100%;font-size:16px" placeholder="依頼・報告を書いてください"></textarea>
      <button onclick="ukSend()" style="font-size:18px;padding:10px 24px">送る</button> <span id="uk_m" class="note"></span></div>
      <p class="ptabs">${tabs}</p>` + (rows.length ? Object.entries(groups).map(([o, rs]) => `<h4>${esc(o)}（${rs.length}件）</h4><table>
      <tr><th>No・日時</th><th>分類・送った人</th><th>内容</th><th>状態</th></tr>${rs.map(r => `<tr${r.status === '未対応' ? ' style="background:#fff6e5"' : ''}>
      <td>${r.id}<br><small>${new Date(r.created_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</small></td>
      <td>${esc(r.category)}<br><small>${esc(r.sender_name)}</small></td><td style="white-space:pre-wrap">${esc(r.body)}</td>
      <td><select onchange="ukStatus(${r.id}, this)">${UK_STATUS.map(s => `<option${s === r.status ? ' selected' : ''}>${s}</option>`).join('')}</select></td></tr>`).join('')}</table>`).join('')
      : '<p>表示する受付はありません。</p>');
  } catch (e) { $('view').innerHTML = back + `<p>${esc(e.message)}</p>`; }
}
async function ukStatus(id, sel) {
  if (typeof DEMO !== 'undefined' && DEMO) { alert('見本モードなので保存しません'); return; }
  try { await sb(`uketsuke?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ status: sel.value }), headers: { Prefer: 'return=minimal' } }); }
  catch (e) { alert(e.message); renderUketsuke(); }
}
async function ukSend() {
  const b = $('uk_b').value.trim(), m = $('uk_m');
  if (!b) { m.textContent = '内容を書いてください。'; return; }
  const made = ukComposeBody(b, ukCurrentContext());
  if (made.tooLong) { m.textContent = '内容が長すぎます。短くしてください。'; return; }
  if (typeof DEMO !== 'undefined' && DEMO) { m.textContent = '見本モードなので送りません'; return; }
  try { await ukPost($('uk_c').value, made.body); renderUketsuke(); }
  catch (e) { m.textContent = e.message; }
}

// 送信元（ページ）と、その画面が一人の児童・利用者のときは名前。本文の先頭に付ける（表の列は増やさない）
function ukDecodeHash(hash) {
  const raw = String(hash || '').replace(/^#/, '').split('?')[0];
  try { return decodeURIComponent(raw); } catch (e) { return raw; }
}
function ukRouteFrom(pathname, hash, cfg) {
  const C = cfg || (typeof window !== 'undefined' && window.PORTAL_CONFIG) || {};
  const file = (String(pathname || '').split('/').pop()) || 'index.html';
  const h = ukDecodeHash(hash);
  if (file === 'esign-help.html') return { route: 'esign-help.html', label: '電子サインの使い方' };
  if (file === 'acc.html') {
    const tab = h.split('/')[0];
    const names = { deal: '取引入力', journal: '仕訳帳', transfer: '振替', bank: 'CSV取込', report: '試算表', cash: 'キャッシュフロー', ledger: '台帳', tax: '申告', dep: '償却資産', master: 'マスタ' };
    return { route: 'acc.html' + (h ? '#' + h : ''), label: '会計（簡易）' + (names[tab] ? ' / ' + names[tab] : (tab ? ' / ' + tab : '')) };
  }
  if (file && file !== 'index.html') return { route: file + (h ? '#' + h : ''), label: file + (h ? ' / ' + h : '') };
  if (!h) return { route: 'index.html', label: 'トップ' };
  const [id, sub] = h.split('/');
  const fixed = { uketsuke: '受付', sign: '書類の確認と署名', dakoku: '出退勤打刻', ht: '法定研修', chair: '評定所', banto: '番頭さん', soudan: '人事労務の相談所', leaderboard: '評定所', mgr: '管理者' };
  if (id === 'clerk' && sub === 'docs') return { route: 'index.html#' + h, label: '書類管理' };
  const o = (C.offices || []).find(x => x.id === id);
  if (o) {
    if (!sub) return { route: 'index.html#' + h, label: o.name };
    if (/^g\d+$/.test(sub) && o.groups) {
      const g = o.groups[+sub.slice(1)];
      return { route: 'index.html#' + h, label: o.name + ' / ' + (g ? g[1] : sub) };
    }
    const tile = (o.tiles || []).find(t => t[2] === '#' + h);
    return { route: 'index.html#' + h, label: o.name + ' / ' + (tile ? tile[1] : sub) };
  }
  const shared = ((C.shared && C.shared.tiles) || []).find(t => t[2] === '#' + id || t[2] === '#' + h);
  if (shared) return { route: 'index.html#' + h, label: shared[1] };
  if (fixed[h] || fixed[id]) return { route: 'index.html#' + h, label: fixed[h] || fixed[id] };
  return { route: 'index.html#' + h, label: h };
}
function ukGlobals() {
  return {
    UI: typeof UI !== 'undefined' ? UI : null,
    KIN: typeof KIN !== 'undefined' ? KIN : null,
    KL: typeof KL !== 'undefined' ? KL : null,
    KV: typeof KV !== 'undefined' ? KV : null,
    KPR: typeof KPR !== 'undefined' ? KPR : null,
    SUI: typeof SUI !== 'undefined' ? SUI : null,
    RYD: typeof RYD !== 'undefined' ? RYD : null,
  };
}
function ukOneLine(s) { return String(s || '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim(); }
function ukIdeoParts(text) { return String(text || '').replace(/[\r\n]+/g, '').split('　').map(ukOneLine).filter(Boolean); }
function ukOptText(sel) {
  if (!sel || sel.selectedIndex < 0 || !sel.options) return '';
  return ukOneLine(sel.options[sel.selectedIndex].textContent);
}
function ukSubjectOf(hash, state, root) {
  const S = state || ukGlobals();
  const doc = root || (typeof document !== 'undefined' ? document : null);
  const h = ukDecodeHash(hash);
  const [id, sub] = h.split('/');
  const q = (sel, base) => { const r = base || doc; return r && r.querySelectorAll ? [...r.querySelectorAll(sel)] : []; };
  const byId = i => (doc && doc.getElementById ? doc.getElementById(i) : null);

  if (id === 'leo' && sub === 'userinfo' && S.UI && S.UI.sel) return { kind: '児童', name: ukOneLine(S.UI.sel) };
  if (id === 'leo' && sub === 'cal') {
    const inp = byId('cf_child');
    if (inp && ukOneLine(inp.value)) return { kind: '児童', name: ukOneLine(inp.value) };
  }
  if (id === 'leo' && sub === 'plan') {
    const eh = byId('plan_editor');
    const h3 = eh && eh.querySelector ? eh.querySelector('h3') : null;
    const head = h3 ? ukIdeoParts(h3.textContent) : [];
    if (head[0]) return { kind: '児童', name: head[0] };
    const open = q('#view .card details[open]');
    if (open.length === 1) {
      const b = open[0].closest && open[0].closest('.card') && open[0].closest('.card').querySelector('b');
      if (b && ukOneLine(b.textContent)) return { kind: '児童', name: ukOneLine(b.textContent) };
    }
  }
  if (id === 'leo' && (sub === 'diary' || sub === 'line')) {
    const open = q('#view details[open] summary b');
    if (open.length === 1) return { kind: '児童', name: ukOneLine(open[0].textContent).replace(/^■/, '') };
  }
  if (id === 'kintoun' && sub === 'consent' && S.KIN && S.KIN.name) return { kind: '利用者', name: ukOneLine(S.KIN.name) };
  if (id === 'kintoun' && sub === 'ledger' && S.KL && S.KL.id) {
    const hs = q('#view h3').map(x => ukOneLine(x.textContent)).filter(t => t && !/台帳/.test(t));
    if (hs[0]) return { kind: '利用者', name: hs[0] };
  }
  if (id === 'kintoun' && sub === 'visit' && S.KV && S.KV.id) {
    const name = ukOptText(byId('kv_user_id'));
    if (name) return { kind: '利用者', name };
  }
  if (id === 'kintoun' && sub === 'print' && S.KPR && S.KPR.uid) {
    const name = ukOptText(q('#view select')[0]);
    if (name) return { kind: '利用者', name };
  }
  if (id === 'suishodama' && sub === 'ledger' && S.SUI && S.SUI.edit && S.SUI.edit !== 'new') {
    const hs = q('#view h3').map(x => ukOneLine(x.textContent)).filter(t => t && !/台帳|追加/.test(t));
    if (hs[0]) return { kind: '利用者', name: hs[0] };
  }
  if (id === 'suishodama' && sub === 'plan' && S.SUI && S.SUI.uid) {
    const name = ukOptText(q('#view select')[0]);
    if (name) return { kind: '利用者', name };
    const h3 = q('#view h3')[0];
    if (h3) {
      const parts = ukIdeoParts(h3.textContent);
      const v = parts.findIndex(p => /^v\d+/.test(p));
      if (v > 0) return { kind: '利用者', name: parts[v - 1] };
    }
  }
  if (id === 'rydeen' && sub === 'users' && S.RYD && S.RYD.st && S.RYD.st.user) {
    const inp = byId('u_name');
    if (inp && ukOneLine(inp.value)) return { kind: '利用者', name: ukOneLine(inp.value) };
  }
  return null;
}
function ukCurrentContext() {
  return { ...ukRouteFrom(location.pathname, location.hash), subject: ukSubjectOf(location.hash) };
}
function ukComposeBody(text, ctx) {
  const label = ctx && ctx.label ? ctx.label : '（ページ不明）';
  const route = ctx && ctx.route ? ctx.route : '';
  const lines = ['【送信元】' + label + (route ? '（' + route + '）' : '')];
  const sub = ctx && ctx.subject;
  if (sub && ukOneLine(sub.name)) lines.push('【' + (sub.kind || '児童') + '】' + ukOneLine(sub.name));
  const head = lines.join('\n');
  const written = String(text || '').trim();
  const body = head + '\n\n' + written;
  return { head, body, empty: written === '', tooLong: body.length > 4000 };
}
function ukCfg() { return (typeof window !== 'undefined' && window.PORTAL_CONFIG) || (typeof C !== 'undefined' ? C : null); }
async function ukRefreshToken() {
  if (typeof refreshSess === 'function') return refreshSess();
  const Cfg = ukCfg();
  let s = {};
  try { s = JSON.parse(localStorage.getItem('sess') || '{}'); } catch (e) { return false; }
  if (!Cfg || !s.refresh) return false;
  try {
    const r = await fetch(Cfg.supabaseUrl + '/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: { apikey: Cfg.supabaseKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: s.refresh }) });
    if (!r.ok) return false;
    const j = await r.json();
    localStorage.setItem('sess', JSON.stringify({ ...s, token: j.access_token, refresh: j.refresh_token || s.refresh, exp: Date.now() + j.expires_in * 1000 }));
    return true;
  } catch (e) { return false; }
}
async function ukPost(category, body) {
  const Cfg = ukCfg();
  if (!Cfg) throw new Error('送れませんでした。');
  const send = async () => {
    let s = {};
    try { s = JSON.parse(localStorage.getItem('sess') || '{}'); } catch (e) { s = {}; }
    if (!s.token) return { ok: false, status: 401, message: 'ログインしてから送ってください。' };
    const r = await fetch(Cfg.supabaseUrl + '/rest/v1/rpc/uketsuke_submit', { method: 'POST', headers: { apikey: Cfg.supabaseKey, Authorization: 'Bearer ' + s.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_category: category, p_body: body }) });
    let message = '';
    let id = null;
    if (r.ok) { try { id = await r.json(); } catch (e) { id = null; } }
    else { try { message = (await r.json()).message || ''; } catch (e) { message = ''; } }
    return { ok: r.ok, status: r.status, message, id };
  };
  let res = await send();
  if (res.status === 401 && await ukRefreshToken()) res = await send();
  if (!res.ok) throw new Error(res.message || (res.status === 401 ? 'ログインしてから送ってください。' : '送れませんでした（' + res.status + '）'));
  return res.id;
}

const UK_ASK_CSS = `#uk_fab,#uk_help_btn{background:var(--main,#2e6b4f);color:#fff;border:0;cursor:pointer}
#uk_fab{position:fixed;right:16px;bottom:16px;z-index:80;width:auto;max-width:calc(100% - 32px);margin:0;padding:12px 16px;font-size:16px;border-radius:999px;box-shadow:0 2px 8px #0004}
#uk_help_btn{width:100%;display:block;box-sizing:border-box;margin:8px 0;padding:12px 14px;font-size:16px;border-radius:8px}
#uk_ask{position:fixed;inset:0;z-index:90;background:#0006;display:flex;align-items:flex-end;justify-content:center;padding:12px}
#uk_ask[hidden]{display:none}
#uk_ask .uk_panel{width:min(560px,100%);max-height:92vh;overflow:auto;margin:0;background:#fff;color:#222;border-radius:12px;padding:18px;box-shadow:0 1px 3px #0002;font-family:system-ui,"Hiragino Sans",sans-serif}
#uk_ask h3{margin:0 0 8px;font-size:20px;color:#333}
#uk_ask .note{color:#555;font-size:14px;line-height:1.6}
#uk_ask select,#uk_ask textarea{width:100%;box-sizing:border-box;font-size:16px;padding:10px;margin:6px 0;border:1px solid #bbb;border-radius:8px;background:#fff;color:#222}
#uk_ask .uk_actions{display:flex;gap:8px}
#uk_ask .uk_actions button{width:auto;flex:1;margin:0;padding:12px;font-size:16px;border-radius:8px}
#uk_ask_close{background:#fff;color:#333;border:1px solid #bbb}
#uk_ask_m{min-height:1.2em}
#uk_ask_m a{color:var(--main,#2e6b4f)}
@media print{#uk_fab,#uk_ask,#uk_help_btn{display:none!important}}`;

function ukInstallAsk() {
  if (typeof document === 'undefined') return;
  if (!document.getElementById('uk_ask_css')) {
    const st = document.createElement('style');
    st.id = 'uk_ask_css';
    st.textContent = UK_ASK_CSS;
    document.head.appendChild(st);
  }
  if (!document.getElementById('uk_ask')) {
    const ask = document.createElement('div');
    ask.id = 'uk_ask';
    ask.hidden = true;
    ask.innerHTML = `<div class="card uk_panel" role="dialog" aria-modal="true" aria-labelledby="uk_ask_title">
      <h3 id="uk_ask_title">受付に送る</h3>
      <p class="note" id="uk_ask_from"></p>
      <label>分類<br><select id="uk_ask_c">${UK_CATS.map(c => `<option>${c}</option>`).join('')}</select></label>
      <textarea id="uk_ask_b" rows="5" maxlength="3800" placeholder="分からないこと・依頼・報告を書いてください"></textarea>
      <div class="uk_actions"><button type="button" id="uk_ask_send">送る</button><button type="button" id="uk_ask_close" class="back">閉じる</button></div>
      <p id="uk_ask_m" class="note"></p></div>`;
    document.body.appendChild(ask);
    ask.addEventListener('click', e => { if (e.target === ask) ukCloseAsk(); });
    document.getElementById('uk_ask_close').addEventListener('click', ukCloseAsk);
    document.getElementById('uk_ask_send').addEventListener('click', ukAskSend);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !document.getElementById('uk_ask').hidden) ukCloseAsk(); });
  }
  if (!document.getElementById('uk_fab')) {
    const fab = document.createElement('button');
    fab.type = 'button';
    fab.id = 'uk_fab';
    fab.textContent = '分からないことを送る';
    fab.addEventListener('click', ukOpenAsk);
    document.body.appendChild(fab);
    document.body.style.paddingBottom = '72px';
  }
  const help = document.getElementById('help');
  if (help && !document.getElementById('uk_help_btn')) {
    help.appendChild(document.createTextNode(' '));
    const b = document.createElement('button');
    b.type = 'button';
    b.id = 'uk_help_btn';
    b.textContent = '分からないことを送る';
    help.appendChild(b);
  }
  const inline = document.getElementById('uk_help_btn');
  if (inline && !inline.dataset.uk) { inline.dataset.uk = '1'; inline.addEventListener('click', ukOpenAsk); }
  if (!window.__ukAskHash) {
    window.__ukAskHash = true;
    window.addEventListener('hashchange', () => {
      const box = document.getElementById('uk_ask');
      if (box && !box.hidden) ukFillAskContext();
    });
  }
}
function ukFillAskContext() {
  const ctx = ukCurrentContext();
  const from = document.getElementById('uk_ask_from');
  if (!from) return ctx;
  const who = ctx.subject && ctx.subject.name ? ctx.subject.kind + '：' + ctx.subject.name : '';
  from.textContent = 'このページのまま、受付へ送ります。担当者が見る内容の先頭に、送信元「' + ctx.label + '」（' + ctx.route + '）' + (who ? 'と ' + who : '') + ' が自動で付きます。';
  return ctx;
}
function ukOpenAsk() {
  ukInstallAsk();
  const ctx = ukFillAskContext();
  const ta = document.getElementById('uk_ask_b');
  const key = ctx.route + '|' + (ctx.subject && ctx.subject.name ? ctx.subject.kind + ':' + ctx.subject.name : '');
  if (ta.dataset.key !== key) { ta.value = ''; ta.dataset.key = key; }
  document.getElementById('uk_ask_m').textContent = '';
  const box = document.getElementById('uk_ask');
  box.hidden = false;
  ta.focus();
}
function ukCloseAsk() {
  const box = document.getElementById('uk_ask');
  if (box) box.hidden = true;
}
function ukNeedLogin(m) {
  m.textContent = '';
  m.appendChild(document.createTextNode('ログインしてから送ってください。'));
  const a = document.createElement('a');
  a.href = 'index.html';
  a.textContent = 'ポータルを開く';
  m.appendChild(document.createTextNode(' '));
  m.appendChild(a);
}
async function ukAskSend() {
  const m = document.getElementById('uk_ask_m');
  const btn = document.getElementById('uk_ask_send');
  const made = ukComposeBody(document.getElementById('uk_ask_b').value, ukCurrentContext());
  if (made.empty) { m.textContent = '内容を書いてください。'; return; }
  if (made.tooLong) { m.textContent = '内容が長すぎます。短くしてください。'; return; }
  if (typeof DEMO !== 'undefined' && DEMO) { m.textContent = '見本モードなので送りません。受付の一覧には届きません。'; return; }
  if (!ukSessionOk() && !(await ukRefreshToken())) { ukNeedLogin(m); return; }
  btn.disabled = true;
  try {
    const id = await ukPost(document.getElementById('uk_ask_c').value, made.body);
    document.getElementById('uk_ask_b').value = '';
    m.textContent = '送りました' + (id != null ? '（受付 No.' + id + '）' : '') + '。担当者は受付の一覧で見ます。このページのままです。';
    if ((location.hash || '').split('?')[0] === '#uketsuke' && typeof renderUketsuke === 'function') renderUketsuke();
  } catch (e) { m.textContent = e.message; }
  finally { btn.disabled = false; }
}
function ukPageFile() { return (location.pathname.split('/').pop() || 'index.html'); }
function ukSessionOk() {
  try { const s = JSON.parse(localStorage.getItem('sess') || 'null'); return !!(s && s.token && s.exp > Date.now()); }
  catch (e) { return false; }
}
function ukMaybeInstall() {
  const file = ukPageFile();
  if (file === 'index.html' || file === '') return;
  if (file === 'esign-help.html' || ukSessionOk()) ukInstallAsk();
}
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ukMaybeInstall);
  else ukMaybeInstall();
}

const ukAskApi = { UK_CATS, ukRouteFrom, ukComposeBody, ukSubjectOf, ukDecodeHash };
if (typeof module !== 'undefined' && module.exports) module.exports = ukAskApi;
