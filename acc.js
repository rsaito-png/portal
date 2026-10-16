// 会計（簡易）。法人管理者(bp_corp_admins)だけ。データは Supabase の acc_* テーブル（RLSで制限）
const C = window.PORTAL_CONFIG;
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const yen = n => (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('ja-JP');
const todayJST = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
function fiscalYear(d) { const y = +d.slice(0, 4), m = +d.slice(5, 7), s = m >= 6 ? y : y - 1; return { from: `${s}-06-01`, to: `${s + 1}-05-31`, label: `${s}年6月〜${s + 1}年5月期` }; }
const KIND = { income: '収入', expense: '支出', transfer: '振替', manual: '振替伝票', opening: '開始残高' };
const TYPE = { asset: '資産', liability: '負債', equity: '純資産', revenue: '収益', expense: '費用' };
const nn = v => (v === '' || v == null ? null : Number(v));

/* ---- Supabase（ポータルと同じ流儀: localStorage の sess を使う） ---- */
const sess = () => JSON.parse(localStorage.getItem('sess') || 'null');
async function refreshSess() {
  const s = sess(); if (!s || !s.refresh) return false;
  try { const r = await fetch(C.supabaseUrl + '/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: { apikey: C.supabaseKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: s.refresh }) });
    if (!r.ok) return false; const j = await r.json();
    localStorage.setItem('sess', JSON.stringify({ ...s, token: j.access_token, refresh: j.refresh_token || s.refresh, exp: Date.now() + j.expires_in * 1000 })); return true; } catch (e) { return false; }
}
async function api(url, opt = {}, retried) {
  let s = sess() || {};
  if (s.exp && s.exp < Date.now() + 30000 && !retried) { if (await refreshSess()) s = sess(); }
  const r = await fetch(C.supabaseUrl + url, { ...opt, headers: { apikey: C.supabaseKey, Authorization: 'Bearer ' + s.token, ...(opt.json === false ? {} : { 'Content-Type': 'application/json' }), ...(opt.headers || {}) } });
  if (r.status === 401 && !retried && await refreshSess()) return api(url, opt, true);
  if (r.status === 401) throw new Error('ログインの有効期限が切れました。ページを再読み込みしてください');
  return r;
}
async function sb(path, opt = {}) {
  const r = await api('/rest/v1/' + path, opt);
  if (!r.ok) { let m = ''; try { m = (await r.json()).message || ''; } catch (e) {} throw new Error((m || '読み込めませんでした') + '（' + r.status + '）'); }
  const t = await r.text(); return t ? JSON.parse(t) : null;
}
const post = (t, body, ret = 'return=representation') => sb(t, { method: 'POST', headers: { Prefer: ret }, body: JSON.stringify(body) });

async function accLogin() {
  $('msg').textContent = '';
  const r = await fetch(C.supabaseUrl + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: C.supabaseKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: $('em').value.trim(), password: $('pw').value }) });
  const j = await r.json();
  if (!r.ok) { $('msg').textContent = 'ログインできませんでした。メールとパスワードを確認してください。'; return; }
  localStorage.setItem('sess', JSON.stringify({ token: j.access_token, refresh: j.refresh_token, email: j.user.email, role: (j.user.app_metadata || {}).role || C.defaultRole, exp: Date.now() + j.expires_in * 1000 }));
  boot();
}

/* ---- キャッシュフロー（資金=現金・銀行・カード口座。口座間の振替は合計から除外） ---- */
async function fetchAll(q) { const out = []; for (let o = 0; ; o += 1000) { const p = await sb(q + `&order=id&limit=1000&offset=${o}`); out.push(...p); if (p.length < 1000) break; } return out; }
let CF = null;
const cfPrevFY = () => { const f = fiscalYear(todayJST()), y = +f.from.slice(0, 4) - 1; return { from: `${y}-06-01`, to: `${y + 1}-05-31` }; };
function cfSvg(rows) {
  const W = 760, H = 240, pl = 64, pr = 10, pt = 14, pb = 28, n = rows.length; if (!n) return '';
  const ends = rows.map(r => r.total.end), maxB = Math.max(...rows.flatMap(r => [r.total.in, r.total.out]), 1);
  const lo = Math.min(0, ...ends), hi = Math.max(1, ...ends, maxB), y = v => pt + (H - pt - pb) * (1 - (v - lo) / (hi - lo)), bw = (W - pl - pr) / n, x = i => pl + bw * (i + .5), f = v => Math.abs(v) >= 1e4 ? Math.round(v / 1e4) + '万' : v;
  let g = ''; for (let k = 0; k <= 4; k++) { const v = lo + (hi - lo) * k / 4; g += `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" stroke="#eee"/><text x="${pl - 4}" y="${y(v) + 4}" font-size="10" text-anchor="end" fill="#777">${f(Math.round(v))}</text>`; }
  const bars = rows.map((r, i) => `<rect x="${x(i) - bw * .36}" y="${y(r.total.in)}" width="${bw * .34}" height="${Math.max(0, y(0) - y(r.total.in))}" fill="#6bb58a"/><rect x="${x(i)}" y="${y(r.total.out)}" width="${bw * .34}" height="${Math.max(0, y(0) - y(r.total.out))}" fill="#e39a8c"/><text x="${x(i)}" y="${H - 10}" font-size="10" text-anchor="middle" fill="#555">${+r.month.slice(5)}月</text>`).join('');
  const line = ends.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:${W}px">${g}${bars}<path d="${line}" fill="none" stroke="#2e5fa8" stroke-width="2"/>${ends.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="3" fill="#2e5fa8"/>`).join('')}</svg>
    <p class="note"><span style="color:#2e5fa8">━</span> 月末残高　<span style="color:#6bb58a">■</span> 入金　<span style="color:#e39a8c">■</span> 出金</p>`;
}
async function vCash(sp) {
  if (!M.accounts) await loadMasters();
  const fy = fiscalYear(todayJST()), from = sp.get('from') || fy.from, to = sp.get('to') || fy.to, pf = cfPrevFY();
  const lines = await fetchAll(`acc_lines?select=id,side,amount,account_id,dept_id,entry_id,acc_entries!inner(entry_date,kind,partner_id)&acc_entries.entry_date=lte.${to}`);
  const wal = M.wallets, r = cfCompute(lines, wal, from, to), aName = id => M.accounts.find(a => a.id === +id)?.name ?? '科目' + id, dName = id => +id ? (M.depts.find(d => d.id === +id)?.name ?? '部門' + id) : '(部門なし)';
  const tot = r.rows.reduce((s, x) => ({ in: s.in + x.total.in, out: s.out + x.total.out }), { in: 0, out: 0 }), first = r.rows[0]?.total.open ?? 0, last = r.rows.at(-1)?.total.end ?? 0;
  const mon = m => m.replace('-', '年') + '月';
  // 未決済
  const accs = M.accounts.filter(a => a.name === '未払金' || a.name === '未収入金').map(a => ({ id: a.id, name: a.name, side: a.name === '未払金' ? 'C' : 'D' }));
  const wk = lines.filter(l => accs.some(a => a.id === l.account_id)), open = cfOpen(wk, accs).sort((a, b) => a.date.localeCompare(b.date));
  const today = todayJST(), age = d => Math.round((new Date(today) - new Date(d)) / 864e5), pay = open.filter(o => o.side === 'C'), rcv = open.filter(o => o.side === 'D');
  const cardBal = wal.filter(w => w.kind === 'card').map(w => ({ name: w.name, bal: -lines.filter(l => l.account_id === w.account_id && l.acc_entries.entry_date <= today).reduce((s, l) => s + (l.side === 'D' ? l.amount : -l.amount), 0) }));
  const openTbl = (t, a) => a.length ? `<table><tr><th>発生日</th><th>科目</th><th class="r">経過日数</th><th class="r">金額</th></tr>${a.map(o => `<tr><td>${o.date}</td><td>${esc(o.account)}</td><td class="r">${age(o.date)}</td><td class="r">${yen(o.amount)}</td></tr>`).join('')}<tr class="tot"><td colspan="3">${t}合計</td><td class="r">${yen(a.reduce((s, o) => s + o.amount, 0))}</td></tr></table>` : `<p class="note">${t}はありません。</p>`;
  const monthOf = a => { const g = {}; a.forEach(o => g[o.date.slice(0, 7)] = (g[o.date.slice(0, 7)] || 0) + o.amount); return Object.entries(g).map(([m, v]) => `${mon(m)} ${yen(v)}`).join(' ／ '); };
  const breakdown = (src, nameOf, m) => { const ks = Object.keys(src).filter(k => src[k][m]); if (!ks.length) return '<p class="note">なし</p>';
    return `<table><tr><th></th><th class="r">入金</th><th class="r">出金</th></tr>${ks.sort((a, b) => (src[b][m].in + src[b][m].out) - (src[a][m].in + src[a][m].out)).map(k => `<tr><td>${esc(nameOf(k))}</td><td class="r">${yen(src[k][m].in)}</td><td class="r">${yen(src[k][m].out)}</td></tr>`).join('')}</table>`; };
  CF = { r, from, to, open, cardBal, aName, dName };
  $('view').innerHTML = `<h2>キャッシュフロー</h2><div class="card"><div class="g"><div><label>期間 開始</label><input type="date" id="c_f" value="${from}"></div><div><label>終了</label><input type="date" id="c_t" value="${to}"></div>
    <button class="sub" onclick="location.hash='cash?from='+$('c_f').value+'&to='+$('c_t').value">表示</button>
    <button class="sub" onclick="location.hash='cash'">今期</button><button class="sub" onclick="location.hash='cash?from=${pf.from}&to=${pf.to}'">前期</button><button class="sub" onclick="cfCsv()">CSV出力</button></div>
    <p class="note">資金＝現金・銀行・カード口座（カードは未払分がマイナス）。口座間の振替は合計から除外（口座別には「振替」列で表示）。決済済みの入出金のみ（未払金・未収入金は下の「今後の見込み」）。</p></div>
    <div class="card"><h3>期間合計</h3><p>期首残高 <b>${yen(first)}</b> ＋ 入金 <b>${yen(tot.in)}</b> − 出金 <b>${yen(tot.out)}</b> ＝ 期末残高 <b>${yen(last)}</b>（差引 ${yen(tot.in - tot.out)}）</p>${cfSvg(r.rows)}</div>
    <div class="card scroll"><h3>月次推移（合計）</h3><table><tr><th>月</th><th class="r">月初残高</th><th class="r">入金合計</th><th class="r">出金合計</th><th class="r">月末残高</th></tr>
    ${r.rows.map(x => `<tr><td>${mon(x.month)}</td><td class="r">${yen(x.total.open)}</td><td class="r">${yen(x.total.in)}</td><td class="r">${yen(x.total.out)}</td><td class="r">${yen(x.total.end)}</td></tr>`).join('')}</table></div>
    <div class="card scroll"><h3>口座別</h3>${wal.map(w => `<details><summary>${esc(w.name)}　期末 ${yen(r.rows.at(-1)?.wallets[w.id].end ?? 0)}</summary><table><tr><th>月</th><th class="r">月初</th><th class="r">入金</th><th class="r">出金</th><th class="r">振替</th><th class="r">月末</th></tr>
      ${r.rows.map(x => { const c = x.wallets[w.id]; return `<tr><td>${mon(x.month)}</td><td class="r">${yen(c.open)}</td><td class="r">${yen(c.in)}</td><td class="r">${yen(c.out)}</td><td class="r">${yen(c.tr)}</td><td class="r">${yen(c.end)}</td></tr>`; }).join('')}</table></details>`).join('')}</div>
    <div class="card"><h3>月別の内訳（クリックで展開）</h3>${r.rows.map(x => `<details><summary>${mon(x.month)}　入金 ${yen(x.total.in)} ／ 出金 ${yen(x.total.out)}</summary><div class="cols"><div><b>科目別</b>${breakdown(r.byAcc, aName, x.month)}</div><div><b>部門別</b>${breakdown(r.byDept, dName, x.month)}</div></div></details>`).join('')}</div>
    <div class="card"><h3>今後の見込み（未決済）</h3><p class="note">未払金・未収入金は期日の項目がないため、発生日の古い順に、支払・入金済み分を先入先出で消し込んだ残りを表示します（期日別＝発生月ごとの合計）。</p>
    <div class="cols"><div><b>未払金（支出の見込み）</b>${openTbl('未払金', pay)}<p class="note">${monthOf(pay)}</p></div><div><b>未収入金（収入の見込み）</b>${openTbl('未収入金', rcv)}<p class="note">${monthOf(rcv)}</p></div></div>
    <b>クレジットカード未払（本日時点の残高）</b><table>${cardBal.map(c => `<tr><td>${esc(c.name)}</td><td class="r">${yen(c.bal)}</td></tr>`).join('')}<tr class="tot"><td>カード未払合計</td><td class="r">${yen(cardBal.reduce((s, c) => s + c.bal, 0))}</td></tr></table>
    <p><b>支出見込み合計 ${yen(pay.reduce((s, o) => s + o.amount, 0) + cardBal.reduce((s, c) => s + Math.max(0, c.bal), 0))} 円　／　収入見込み合計 ${yen(rcv.reduce((s, o) => s + o.amount, 0))} 円</b></p></div>`;
}
function cfCsv() {
  if (!CF) return; const { r, open, cardBal, aName, dName } = CF, q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"', L = [];
  L.push(['資金推移（合計）'], ['月', '月初残高', '入金合計', '出金合計', '月末残高']); r.rows.forEach(x => L.push([x.month, x.total.open, x.total.in, x.total.out, x.total.end]));
  L.push([], ['口座別'], ['口座', '月', '月初', '入金', '出金', '振替', '月末']); M.wallets.forEach(w => r.rows.forEach(x => { const c = x.wallets[w.id]; L.push([w.name, x.month, c.open, c.in, c.out, c.tr, c.end]); }));
  for (const [t, src, nm] of [['科目別', r.byAcc, aName], ['部門別', r.byDept, dName]]) { L.push([], [t + '内訳'], [t, '月', '入金', '出金']); Object.keys(src).forEach(k => r.months.forEach(m => src[k][m] && L.push([nm(k), m, src[k][m].in, src[k][m].out]))); }
  L.push([], ['未決済（見込み）'], ['種別', '発生日', '金額']); open.forEach(o => L.push([o.account, o.date, o.amount])); cardBal.forEach(c => L.push(['カード未払 ' + c.name, '', c.bal]));
  const b = new Blob(['\ufeff' + L.map(a => a.map(q).join(',')).join('\r\n')], { type: 'text/csv' }), a = document.createElement('a');
  a.href = URL.createObjectURL(b); a.download = `cashflow_${CF.from}_${CF.to}.csv`; a.click();
}

/* ---- マスタ ---- */
let M = {};
async function loadMasters() {
  const [accounts, taxes, depts, items, partners, wallets] = await Promise.all([
    sb('acc_accounts?select=id,name,type,category,sort,available&available=eq.true&order=sort&limit=1000'), sb('acc_taxes?select=code,name,rate&order=sort'),
    sb('acc_depts?select=id,name&available=eq.true&order=sort'), sb('acc_items?select=id,name&available=eq.true&order=name&limit=1000'),
    sb('acc_partners?select=id,name&available=eq.true&order=name&limit=1000'), sb('acc_wallets?select=id,name,account_id&available=eq.true&order=id')]);
  M = { accounts, taxes, depts, items, partners, wallets };
}
const opts = (arr, sel, label = 'name', val = 'id') => arr.map(x => `<option value="${esc(x[val])}"${String(x[val]) === String(sel) ? ' selected' : ''}>${esc(x[label])}</option>`).join('');
const msgBox = (m, cls = 'ok') => m ? `<p class="${cls}">${esc(m)}</p>` : '';

/* ---- 登録の共通処理（借方=貸方はDBのトリガでも検査） ---- */
async function saveEntry(e, lines) {
  const [ent] = await post('acc_entries', e);
  try { await post('acc_lines', lines.map(l => ({ side: l.side, account_id: l.account_id, amount: l.amount, tax_code: l.tax_code ?? null, dept_id: l.dept_id ?? null, item_id: l.item_id ?? null, memo: l.memo ?? null, entry_id: ent.id })), 'return=minimal'); }
  catch (err) { await sb('acc_entries?id=eq.' + ent.id, { method: 'DELETE' }); throw err; }
  return ent.id;
}
const accByName = async name => (await sb('acc_accounts?select=id&name=eq.' + encodeURIComponent(name)))[0]?.id;

/* ---- 画面ルーター ---- */
const TABS = [['deal', '取引入力'], ['journal', '仕訳帳'], ['transfer', '振替'], ['bank', 'CSV取込'], ['report', '試算表'], ['cash', 'キャッシュフロー'], ['master', 'マスタ']];
let FLASH = '', FLASHCLS = 'ok', FLASHT = 0;
function flash(m, cls) { FLASH = m; FLASHCLS = cls || 'ok'; FLASHT = Date.now(); }
async function route() {
  const [t, q] = (location.hash.slice(1) || 'deal').split('?'); const tab = TABS.find(x => x[0] === t) ? t : 'deal'; const sp = new URLSearchParams(q || '');
  $('nav').innerHTML = TABS.map(([k, l]) => `<a href="#${k}" class="${k === tab ? 'on' : ''}">${l}</a>`).join('');
  $('view').innerHTML = '<p class="note">読み込み中…</p>';
  try { await ({ deal: vDeal, journal: vJournal, transfer: vTransfer, bank: vBank, report: vReport, cash: vCash, master: vMaster })[tab](sp); }
  catch (e) { $('view').innerHTML = `<p class="ng">${esc(e.message)}</p>`; }
}
window.addEventListener('hashchange', route);
const go = h => { if (location.hash.slice(1) === h) route(); else location.hash = h; };
const done = () => Date.now() - FLASHT < 4000 ? msgBox(FLASH, FLASHCLS) : '';

/* ---- 取引入力（収入/支出・複数行・OCR） ---- */
let D = { kind: 'expense', lines: [], file: null, ocr: '', date: '', memo: '' };
const blankLine = () => ({ account_id: '', amount: '', tax_code: '', dept_id: '', item_id: '' });
function dealAccts() { return M.accounts.filter(a => D.kind === 'income' ? a.type === 'revenue' : ['expense', 'asset', 'liability'].includes(a.type)); }
async function vDeal() {
  if (!M.accounts) await loadMasters();
  if (!D.lines.length) D.lines = [blankLine()]; if (!D.date) D.date = todayJST();
  const ac = dealAccts();
  const lns = D.lines.map((l, i) => `<div class="ln"><select onchange="D.lines[${i}].account_id=this.value"><option value="">勘定科目</option>${opts(ac, l.account_id)}</select>
    <input type="number" inputmode="numeric" placeholder="金額（税込）" value="${esc(l.amount)}" oninput="D.lines[${i}].amount=this.value;dealTotal()">
    <select onchange="D.lines[${i}].tax_code=this.value"><option value="">税区分</option>${opts(M.taxes, l.tax_code, 'name', 'code')}</select>
    <select onchange="D.lines[${i}].dept_id=this.value"><option value="">部門</option>${opts(M.depts, l.dept_id)}</select>
    <select onchange="D.lines[${i}].item_id=this.value"><option value="">品目</option>${opts(M.items, l.item_id)}</select>
    <button class="sub" onclick="D.lines.length>1&&D.lines.splice(${i},1);vDeal()">削除</button></div>`).join('');
  $('view').innerHTML = done() + `<h2>取引入力</h2><div class="card">
    <div>${[['expense', '支出'], ['income', '収入']].map(([k, l]) => `<button class="${D.kind === k ? '' : 'sub'}" onclick="D.kind='${k}';D.lines=[blankLine()];vDeal()">${l}</button>`).join(' ')}</div>
    <label>レシート・領収書（スマホはカメラが起動。選ぶと日付・金額・店名・税率を読み取ります）</label>
    <input type="file" id="rc" accept="image/*" capture="environment" onchange="onReceipt(this.files[0])"><div id="ocr" class="note">${esc(D.ocr)}</div>
    <div class="g"><div><label>発生日</label><input type="date" id="d_date" value="${D.date}" onchange="D.date=this.value"></div>
    <div><label>取引先</label><select id="d_partner"><option value="">(なし)</option>${opts(M.partners)}</select></div>
    <div><label>決済</label><select id="d_settle">${M.wallets.map(w => `<option value="${w.id}">${esc(w.name)}（決済済み）</option>`).join('')}<option value="unsettled">未決済（${D.kind === 'expense' ? '未払金' : '未収入金'}）</option></select></div></div>
    <label>摘要</label><input id="d_memo" value="${esc(D.memo)}" oninput="D.memo=this.value"></div>
    <div class="card"><h3>明細（税込金額）</h3>${lns}<p><button class="sub" onclick="D.lines.push(blankLine());vDeal()">＋ 行を追加</button> <b id="d_tot"></b></p></div>
    <button onclick="saveDeal()" style="font-size:18px;padding:12px 28px">登録する</button> <span id="d_msg"></span>`;
  dealTotal();
  D._partner = null;
}
const dealTotal = () => { const e = $('d_tot'); if (e) e.textContent = '合計 ' + yen(D.lines.reduce((s, l) => s + (Number(l.amount) || 0), 0)) + ' 円'; };
// 画像を縮小して JPEG(base64) に
function shrink(file, max = 1600) { return new Promise((ok, ng) => { const im = new Image(), u = URL.createObjectURL(file);
  im.onload = () => { const k = Math.min(1, max / Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = im.width * k; c.height = im.height * k; c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(u); ok(c.toDataURL('image/jpeg', 0.85).split(',')[1]); };
  im.onerror = () => ng(new Error('画像を開けませんでした')); im.src = u; }); }
async function onReceipt(f) {
  D.file = f || null; if (!f) return; const o = $('ocr'); o.textContent = '読み取り中…';
  try {
    const img = await shrink(f);
    const r = await api('/functions/v1/acc-ocr', { method: 'POST', body: JSON.stringify({ image: img }) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 501 || r.status === 404) { D.ocr = 'OCRは未設定です。手入力してください（画像は登録時に保存されます）。'; o.textContent = D.ocr; return; }
    if (!r.ok) { D.ocr = '⚠ ' + (j.error || '読み取れませんでした') + '（手入力してください）'; o.textContent = D.ocr; return; }
    if (j.date) { D.date = j.date; $('d_date').value = j.date; } if (j.store) { D.memo = j.store; $('d_memo').value = j.store; }
    if (j.amount) D.lines[0].amount = String(j.amount); if (j.tax_rate) D.lines[0].tax_code = j.tax_rate === 8 ? 'P8R' : 'P10';
    D.ocr = `✅ 読み取り結果を入れました（日付 ${j.date ?? '?'} / 金額 ${j.amount ?? '?'} / 店名 ${j.store ?? '?'} / 税率 ${j.tax_rate ?? '?'}%）。必ず確認してください。`;
    const keep = D.file; await vDeal(); D.file = keep;
  } catch (e) { D.ocr = '⚠ 読み取りに失敗しました。手入力してください'; o.textContent = D.ocr; }
}
async function saveDeal() {
  const m = $('d_msg'); m.textContent = '登録中…';
  try {
    const kind = D.kind, date = $('d_date').value, settle = $('d_settle').value;
    const lines = D.lines.filter(l => l.account_id && Number(l.amount) > 0).map(l => ({ account_id: +l.account_id, amount: Math.round(+l.amount), tax_code: l.tax_code || null, dept_id: nn(l.dept_id), item_id: nn(l.item_id) }));
    if (!date || !lines.length) throw new Error('日付と明細（科目・金額）が必要です');
    let wallet = null, counter;
    if (settle === 'unsettled') counter = await accByName(kind === 'expense' ? '未払金' : '未収入金');
    else { wallet = +settle; counter = M.wallets.find(w => w.id === wallet).account_id; }
    if (!counter) throw new Error('相手科目（未払金/未収入金）が見つかりません');
    let receipt = null;
    if (D.file) { receipt = `${date.slice(0, 7)}/${crypto.randomUUID()}-${D.file.name.replace(/[^\w.\-]/g, '_')}`;
      const r = await api('/storage/v1/object/acc-receipts/' + receipt.split('/').map(encodeURIComponent).join('/'), { method: 'POST', json: false, headers: { 'Content-Type': D.file.type || 'application/octet-stream' }, body: D.file });
      if (!r.ok) throw new Error('領収書の保存に失敗しました（' + r.status + '）'); }
    const total = lines.reduce((s, l) => s + l.amount, 0), s1 = kind === 'expense' ? 'D' : 'C', s2 = kind === 'expense' ? 'C' : 'D';
    await saveEntry({ entry_date: date, kind, partner_id: nn($('d_partner').value), wallet_id: wallet, memo: $('d_memo').value || null, receipt_path: receipt },
      [...lines.map(l => ({ ...l, side: s1 })), { side: s2, account_id: counter, amount: total, dept_id: lines[0].dept_id }]);
    D = { kind, lines: [], file: null, ocr: '', date: '', memo: '' }; flash('✅ 登録しました'); go('journal');
  } catch (e) { m.innerHTML = `<span class="ng">${esc(e.message)}</span>`; }
}

/* ---- 仕訳帳 ---- */
async function vJournal(sp) {
  if (!M.accounts) await loadMasters();
  const fy = fiscalYear(todayJST()), from = sp.get('from') || fy.from, to = sp.get('to') || fy.to;
  const data = await sb(`acc_entries?select=id,entry_date,kind,memo,receipt_path,is_test,acc_partners(name),acc_lines(side,amount,tax_code,acc_accounts(name),acc_depts(name))&entry_date=gte.${from}&entry_date=lte.${to}&order=entry_date.desc,created_at.desc&limit=300`);
  const nm = ls => ls.map(l => `${esc(l.acc_accounts.name)}${l.acc_depts ? '[' + esc(l.acc_depts.name) + ']' : ''}${l.tax_code ? '(' + esc(l.tax_code) + ')' : ''} ${yen(l.amount)}`).join('<br>');
  $('view').innerHTML = done() + `<h2>仕訳帳</h2><div class="card"><div class="g"><div><label>開始</label><input type="date" id="j_f" value="${from}"></div><div><label>終了</label><input type="date" id="j_t" value="${to}"></div>
    <button class="sub" onclick="location.hash='journal?from='+$('j_f').value+'&to='+$('j_t').value">表示</button></div></div>
    <div class="card scroll"><table><tr><th>日付</th><th>種別</th><th>借方</th><th>貸方</th><th class="r">金額</th><th>摘要/取引先</th><th></th></tr>
    ${data.map(e => { const Dd = e.acc_lines.filter(l => l.side === 'D'), Cc = e.acc_lines.filter(l => l.side === 'C');
      return `<tr><td style="white-space:nowrap">${e.entry_date}</td><td>${KIND[e.kind]}${e.is_test ? ' TEST' : ''}</td><td>${nm(Dd)}</td><td>${nm(Cc)}</td><td class="r">${yen(Dd.reduce((s, l) => s + l.amount, 0))}</td>
      <td>${esc(e.memo)}${e.acc_partners ? ' / ' + esc(e.acc_partners.name) : ''}${e.receipt_path ? ` <a href="#" onclick="openReceipt('${esc(e.receipt_path)}');return false">📎</a>` : ''}</td>
      <td><button class="red" onclick="delEntry('${e.id}')">削除</button></td></tr>`; }).join('')}</table>${data.length ? '' : '<p class="note">この期間の仕訳はありません。</p>'}</div>`;
}
async function openReceipt(p) {
  const w = window.open('', '_blank');
  try { const r = await api('/storage/v1/object/sign/acc-receipts/' + p.split('/').map(encodeURIComponent).join('/'), { method: 'POST', body: JSON.stringify({ expiresIn: 300 }) });
    const j = await r.json(); if (!r.ok) throw new Error(); w.location = C.supabaseUrl + '/storage/v1' + j.signedURL; } catch (e) { w.close(); alert('領収書を開けませんでした'); }
}
async function delEntry(id) {
  if (!confirm('この仕訳を削除します。よろしいですか？')) return;
  try { await sb('acc_bank_rows?entry_id=eq.' + id, { method: 'PATCH', body: JSON.stringify({ status: 'pending', entry_id: null }) });
    await sb('acc_entries?id=eq.' + id, { method: 'DELETE' }); flash('削除しました'); route(); } catch (e) { alert(e.message); }
}

/* ---- 振替・振替伝票 ---- */
async function vTransfer() {
  if (!M.accounts) await loadMasters();
  const t = todayJST(), w = M.wallets;
  $('view').innerHTML = done() + `<h2>口座振替・振替伝票</h2><div class="card"><h3>口座間の振替</h3><div class="g">
    <div><label>日付</label><input type="date" id="t_d" value="${t}"></div><div><label>振替元</label><select id="t_f">${opts(w)}</select></div>
    <div><label>振替先</label><select id="t_t">${opts(w, w[1]?.id)}</select></div><div><label>金額</label><input type="number" id="t_a"></div></div>
    <input id="t_m" placeholder="摘要（任意）"><button onclick="saveTransfer()">登録</button> <span id="t_msg"></span></div>
    <div class="card"><h3>振替伝票（借方1・貸方1）／ 開始残高</h3><div class="g">
    <div><label>日付</label><input type="date" id="m_d" value="${t}"></div><div><label>借方科目</label><select id="m_dr">${opts(M.accounts)}</select></div>
    <div><label>貸方科目</label><select id="m_cr">${opts(M.accounts)}</select></div><div><label>金額</label><input type="number" id="m_a"></div>
    <div><label>部門</label><select id="m_p"><option value="">(なし)</option>${opts(M.depts)}</select></div></div>
    <input id="m_m" placeholder="摘要（任意）"><label style="display:inline"><input type="checkbox" id="m_o"> 開始残高</label> <button onclick="saveManual()">登録</button> <span id="m_msg"></span></div>`;
}
async function saveTransfer() {
  const m = $('t_msg'); try { const f = +$('t_f').value, t = +$('t_t').value, amount = Math.round(+$('t_a').value), date = $('t_d').value;
    if (!f || !t || f === t || !(amount > 0) || !date) throw new Error('日付・別々の口座・金額を入力してください');
    const a = id => M.wallets.find(w => w.id === id).account_id;
    await saveEntry({ entry_date: date, kind: 'transfer', memo: $('t_m').value || null }, [{ side: 'D', account_id: a(t), amount }, { side: 'C', account_id: a(f), amount }]);
    flash('✅ 登録しました'); go('journal'); } catch (e) { m.innerHTML = `<span class="ng">${esc(e.message)}</span>`; }
}
async function saveManual() {
  const m = $('m_msg'); try { const d = +$('m_dr').value, c = +$('m_cr').value, amount = Math.round(+$('m_a').value), date = $('m_d').value;
    if (!d || !c || d === c || !(amount > 0) || !date) throw new Error('日付・借方・貸方・金額を入力してください');
    const dept = nn($('m_p').value);
    await saveEntry({ entry_date: date, kind: $('m_o').checked ? 'opening' : 'manual', memo: $('m_m').value || null }, [{ side: 'D', account_id: d, amount, dept_id: dept }, { side: 'C', account_id: c, amount, dept_id: dept }]);
    flash('✅ 登録しました'); go('journal'); } catch (e) { m.innerHTML = `<span class="ng">${esc(e.message)}</span>`; }
}

/* ---- 銀行・カードCSV ---- */
function decodeCsv(buf) { try { return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^\uFEFF/, ''); } catch (e) { return new TextDecoder('shift_jis').decode(buf); } }
function parseCsvText(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) { const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); if (row.some(x => x.trim())) rows.push(row); row = []; cur = ''; }
    else cur += c; }
  row.push(cur); if (row.some(x => x.trim())) rows.push(row); return rows;
}
const numOf = s => { const t = (s ?? '').replace(/[,\s円¥]/g, ''); return t && /^-?\d+$/.test(t) ? parseInt(t, 10) : null; };
function normDate(s) {
  let m = s.trim().match(/^(\d{4})[\/\-.年](\d{1,2})[\/\-.月](\d{1,2})/); if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.trim().match(/^R?(\d{1,2})[\/.](\d{1,2})[\/.](\d{1,2})$/); if (m) return `${2018 + +m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`; return null;
}
async function sha256(s) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
async function parseBankCsv(text, walletId) {
  const all = parseCsvText(text), errors = [];
  const hi = all.findIndex(r => r.some(c => /日付|取引日|年月日|日　付/.test(c)) && r.some(c => /残高|金額|出金|入金|支払|預入|引出/.test(c)));
  if (hi < 0) return { rows: [], errors: ['ヘッダ行（日付・金額/出金/入金・残高）が見つかりません'] };
  const h = all[hi].map(c => c.trim()), f = re => h.findIndex(c => re.test(c));
  const iD = f(/日付|取引日|年月日/), iT = f(/摘要|内容|取引内容|お取引|振込人|備考/), iO = f(/出金|支払|引出|お支払/), iI = f(/入金|預入|お預|お預入/), iA = f(/^金額|取引金額/), iB = f(/残高/);
  const seen = new Map(), rows = [];
  for (const r of all.slice(hi + 1)) {
    const date = normDate(r[iD] ?? ''); if (!date) { if (r.join('').trim()) errors.push(`日付を読めない行: ${r.join(',').slice(0, 60)}`); continue; }
    let amount = null;
    if (iO >= 0 || iI >= 0) { const o = numOf(r[iO]), i = numOf(r[iI]); if (o || i) amount = (i ?? 0) - (o ?? 0); } else if (iA >= 0) amount = numOf(r[iA]);
    if (amount === null || amount === 0) { errors.push(`金額を読めない行: ${r.join(',').slice(0, 60)}`); continue; }
    const descr = (iT >= 0 ? r[iT] : r.filter((_, k) => k !== iD).join(' ')).trim(), balance = iB >= 0 ? numOf(r[iB]) : null;
    const base = [walletId, date, amount, descr, balance ?? ''].join('|'), n = (seen.get(base) ?? 0) + 1; seen.set(base, n);
    rows.push({ date, descr, amount, balance, hash: await sha256(base + '|' + n) });
  }
  return { rows, errors };
}
async function vBank() {
  if (!M.accounts) await loadMasters();
  const rows = await sb('acc_bank_rows?select=*,acc_wallets(name)&status=eq.pending&order=row_date&limit=100');
  $('view').innerHTML = done() + `<h2>銀行・カードCSV取り込みと未処理明細</h2><div class="card"><h3>CSVを取り込む</h3><div class="g">
    <div><label>口座・カード</label><select id="b_w">${opts(M.wallets)}</select></div><div><label>CSVファイル（Shift_JIS/UTF-8）</label><input type="file" id="b_f" accept=".csv,text/csv"></div>
    <button onclick="importBank()">取り込む</button></div><div id="b_msg"></div>
    <p class="note">日付・摘要・出金/入金（または金額）・残高の列を見出しから自動判定します。同じ内容を再度取り込んでも重複しません。</p></div>
    <div class="card"><h3>未処理の明細（${rows.length}件${rows.length >= 100 ? '以上・先頭100件' : ''}）</h3>
    ${rows.map(r => `<div class="ln" id="br_${r.id}" style="grid-template-columns:repeat(auto-fit,minmax(110px,1fr))"><div><b>${r.row_date}</b> ${esc(r.acc_wallets.name)}<br>${esc(r.descr)}</div>
    <div class="r" style="color:${r.amount < 0 ? '#b00' : '#176b2f'};font-weight:bold">${yen(r.amount)}</div>
    <select class="b_a"><option value="">科目…</option>${opts(M.accounts.filter(x => r.amount < 0 ? x.type !== 'revenue' : x.type !== 'expense'), r.sug_account_id)}</select>
    <select class="b_t"><option value="">税区分</option>${opts(M.taxes, r.sug_tax_code, 'name', 'code')}</select>
    <select class="b_d"><option value="">部門</option>${opts(M.depts, r.sug_dept_id)}</select>
    <select class="b_p"><option value="">取引先</option>${opts(M.partners)}</select>
    <div><button onclick="regRow('${r.id}')">登録</button> <button class="sub" onclick="ignoreRow('${r.id}')">無視</button></div></div>`).join('')}
    ${rows.length ? '' : '<p class="note">未処理の明細はありません。</p>'}</div>`;
}
async function importBank() {
  const m = $('b_msg'), wid = +$('b_w').value, f = $('b_f').files[0]; if (!wid || !f) { m.innerHTML = '<p class="ng">口座とCSVファイルを選んでください</p>'; return; }
  m.textContent = '取り込み中…';
  try {
    const { rows, errors } = await parseBankCsv(decodeCsv(await f.arrayBuffer()), wid);
    const rules = await sb('acc_rules?select=*');
    const recs = rows.map(r => { const rule = rules.find(x => r.descr.includes(x.keyword));
      return { wallet_id: wid, row_date: r.date, descr: r.descr, amount: r.amount, balance: r.balance, hash: r.hash, sug_account_id: rule?.account_id ?? null, sug_tax_code: rule?.tax_code ?? null, sug_dept_id: rule?.dept_id ?? null }; });
    let added = 0;
    for (let i = 0; i < recs.length; i += 200) { const d = await sb('acc_bank_rows?on_conflict=wallet_id,hash&select=id', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify(recs.slice(i, i + 200)) }); added += d.length; }
    flash(`${rows.length}行を読み取り: 新規 ${added}件 / 重複スキップ ${rows.length - added}件` + (errors.length ? ` / 読めない行 ${errors.length}件（${errors[0]}）` : ''), errors.length && !rows.length ? 'ng' : 'ok'); route();
  } catch (e) { m.innerHTML = `<p class="ng">取込エラー: ${esc(e.message)}</p>`; }
}
async function regRow(id) {
  const el = $('br_' + id), g = c => el.querySelector('.' + c).value, acct = +g('b_a');
  if (!acct) { alert('勘定科目を選んでください'); return; }
  try { const [r] = await sb(`acc_bank_rows?select=*,acc_wallets(account_id)&id=eq.${id}`); if (!r || r.status !== 'pending') { route(); return; }
    const amt = Math.abs(r.amount), out = r.amount < 0, dept = nn(g('b_d')), tax = g('b_t') || null, wacc = r.acc_wallets.account_id;
    const eid = await saveEntry({ entry_date: r.row_date, kind: out ? 'expense' : 'income', wallet_id: r.wallet_id, partner_id: nn(g('b_p')), memo: r.descr, bank_row_id: r.id, is_test: r.is_test },
      [{ side: out ? 'D' : 'C', account_id: acct, amount: amt, tax_code: tax, dept_id: dept }, { side: out ? 'C' : 'D', account_id: wacc, amount: amt, dept_id: dept }]);
    await sb('acc_bank_rows?id=eq.' + id, { method: 'PATCH', body: JSON.stringify({ status: 'done', entry_id: eid }) }); el.remove();
  } catch (e) { alert(e.message); }
}
async function ignoreRow(id) { try { await sb('acc_bank_rows?id=eq.' + id, { method: 'PATCH', body: JSON.stringify({ status: 'ignored' }) }); $('br_' + id).remove(); } catch (e) { alert(e.message); } }

/* ---- 試算表（PL・BS） ---- */
async function vReport(sp) {
  if (!M.accounts) await loadMasters();
  const fy = fiscalYear(todayJST()), from = sp.get('from') || fy.from, to = sp.get('to') || fy.to, dept = sp.get('dept') ? +sp.get('dept') : null;
  const rpc = (f, t) => sb('rpc/acc_trial_balance', { method: 'POST', body: JSON.stringify({ p_from: f, p_to: t, p_dept: dept }) });
  const [tb, all] = await Promise.all([rpc(from, to), rpc('1900-01-01', to)]);
  const rows = tb.sort((a, b) => a.sort - b.sort);
  const bal = r => (r.type === 'asset' || r.type === 'expense' ? r.debit - r.credit : r.credit - r.debit);
  const sum = (t, src = rows) => src.filter(r => r.type === t).reduce((s, r) => s + bal(r), 0);
  const rev = sum('revenue'), exp = sum('expense'), profit = rev - exp, cum = sum('revenue', all) - sum('expense', all), A = sum('asset'), L = sum('liability'), E = sum('equity'), diff = A - (L + E + cum);
  const sec = (title, t, total) => `<tr class="sec"><td colspan="2">${title}</td></tr>${rows.filter(r => r.type === t).map(r => `<tr><td style="padding-left:14px">${esc(r.name)}</td><td class="r">${yen(bal(r))}</td></tr>`).join('')}<tr class="tot"><td>${title}合計</td><td class="r">${yen(total)}</td></tr>`;
  $('view').innerHTML = `<h2>試算表（損益計算書・貸借対照表）</h2><div class="card"><div class="g"><div><label>期間 開始</label><input type="date" id="r_f" value="${from}"></div><div><label>終了</label><input type="date" id="r_t" value="${to}"></div>
    <div><label>部門</label><select id="r_d"><option value="">すべて</option>${opts(M.depts, dept)}</select></div>
    <button class="sub" onclick="location.hash='report?from='+$('r_f').value+'&to='+$('r_t').value+'&dept='+$('r_d').value">表示</button></div>
    <p class="note">既定は今期（${fy.label}）。損益=期間内、貸借=終了日までの累計。部門を選ぶと、その部門の明細に紐づく金額のみ集計します（貸借は部門で一致しない場合があります）。</p></div>
    <div class="cols"><div class="card"><h3>損益計算書（PL）</h3><table>${sec('収益', 'revenue', rev)}${sec('費用', 'expense', exp)}<tr class="tot" style="background:#e6f4ea"><td>当期純損益</td><td class="r">${yen(profit)}</td></tr></table></div>
    <div class="card"><h3>貸借対照表（BS）</h3><table>${sec('資産', 'asset', A)}${sec('負債', 'liability', L)}${sec('純資産', 'equity', E)}<tr><td style="padding-left:14px">繰越損益・当期純損益（累計）</td><td class="r">${yen(cum)}</td></tr><tr class="tot"><td>負債・純資産合計</td><td class="r">${yen(L + E + cum)}</td></tr></table>
    <p class="${diff === 0 ? 'ok' : 'warn'}">${diff === 0 ? '✅ 貸借一致（資産 = 負債 + 純資産）' : `⚠ 差額 ${yen(diff)} 円${dept ? '（部門指定のため）' : ''}`}</p></div></div>`;
}

/* ---- マスタ ---- */
const MT = { acc_accounts: '勘定科目', acc_taxes: '税区分', acc_partners: '取引先', acc_items: '品目', acc_depts: '部門', acc_wallets: '口座', acc_rules: '自動仕訳ルール' };
async function vMaster(sp) {
  if (!M.accounts) await loadMasters();
  const t = MT[sp.get('t')] ? sp.get('t') : 'acc_accounts', order = t === 'acc_accounts' || t === 'acc_depts' || t === 'acc_taxes' ? 'sort' : t === 'acc_rules' ? 'id' : 'name';
  const sel = '*' + (t === 'acc_wallets' ? ',acc_accounts(name)' : t === 'acc_rules' ? ',acc_accounts(name),acc_depts(name)' : '');
  const data = await sb(`${t}?select=${sel}&order=${order}&limit=500`);
  const add = t === 'acc_taxes' ? '' : `<div class="card"><h3>${MT[t]}を追加</h3><div class="g">
    ${t === 'acc_rules' ? '<input id="ma_k" placeholder="摘要に含む語（例: ガス）">' : '<input id="ma_n" placeholder="名前">'}
    ${t === 'acc_accounts' ? `<select id="ma_ty">${Object.entries(TYPE).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select><input id="ma_c" placeholder="区分（任意）">` : ''}
    ${t === 'acc_wallets' ? `<select id="ma_ki"><option value="bank">銀行</option><option value="card">カード</option><option value="cash">現金</option></select><select id="ma_ac">${opts(M.accounts)}</select>` : ''}
    ${t === 'acc_rules' ? `<select id="ma_ac">${opts(M.accounts)}</select><select id="ma_tx"><option value="">税区分なし</option>${opts(M.taxes, '', 'name', 'code')}</select><select id="ma_dp"><option value="">部門なし</option>${opts(M.depts)}</select>` : ''}
    ${t === 'acc_partners' ? '<label style="display:inline"><input type="checkbox" id="ma_p"> 個人名（利用者・職員）</label>' : ''}
    <button onclick="addMaster('${t}')">追加</button></div></div>`;
  $('view').innerHTML = done() + `<h2>マスタ</h2><nav>${Object.entries(MT).map(([k, l]) => `<a href="#master?t=${k}" class="${k === t ? 'on' : ''}">${l}</a>`).join('')}</nav>${add}
    <div class="card scroll"><table>${data.map(r => `<tr><td>${esc(r.name ?? r.keyword)}${r.available === false ? ' <span class="note">(無効)</span>' : ''}</td>
    <td>${t === 'acc_accounts' ? esc(TYPE[r.type] + ' ' + (r.category ?? '')) : t === 'acc_taxes' ? r.rate + '%' : t === 'acc_wallets' ? esc(r.kind + ' / ' + (r.acc_accounts?.name ?? '')) : t === 'acc_rules' ? esc('→ ' + (r.acc_accounts?.name ?? '') + ' ' + (r.tax_code ?? '') + ' ' + (r.acc_depts?.name ?? '')) : t === 'acc_partners' && r.is_personal ? '個人名' : ''}</td>
    <td class="r">${t === 'acc_taxes' ? '' : `<button class="sub" onclick="toggleMaster('${t}',${r.id},${r.available === false})">${t === 'acc_rules' ? '削除' : r.available === false ? '有効に戻す' : '無効にする'}</button>`}</td></tr>`).join('')}</table></div>`;
}
async function addMaster(t) {
  const v = id => ($(id)?.value ?? '').trim(); let rec = { name: v('ma_n') };
  if (t === 'acc_accounts') rec = { name: v('ma_n'), type: v('ma_ty'), category: v('ma_c') || null };
  if (t === 'acc_wallets') rec = { name: v('ma_n'), kind: v('ma_ki'), account_id: +v('ma_ac') };
  if (t === 'acc_partners') rec.is_personal = $('ma_p').checked;
  if (t === 'acc_rules') rec = { keyword: v('ma_k'), account_id: +v('ma_ac'), tax_code: v('ma_tx') || null, dept_id: nn(v('ma_dp')) };
  if ((t !== 'acc_rules' && !rec.name) || (t === 'acc_rules' && !rec.keyword)) return;
  try { await post(t, rec, 'return=minimal'); M = {}; flash('追加しました'); route(); } catch (e) { alert(e.message); }
}
async function toggleMaster(t, id, avail) {
  try { if (t === 'acc_rules') await sb(`${t}?id=eq.${id}`, { method: 'DELETE' }); else await sb(`${t}?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ available: avail }) }); M = {}; route(); } catch (e) { alert(e.message); }
}

/* ---- 起動：ログイン確認→法人管理者か確認 ---- */
async function boot() {
  $('boot').hidden = false; $('login').hidden = $('app').hidden = $('deny').hidden = true;
  const s = sess();
  if (!s || (s.exp < Date.now() && !(await refreshSess()))) { localStorage.removeItem('sess'); $('boot').hidden = true; $('login').hidden = false; return; }
  let ok = false;
  try { const r = await api('/rest/v1/rpc/acc_is_admin', { method: 'POST', body: '{}' }); ok = r.ok && (await r.json()) === true; } catch (e) {}
  $('boot').hidden = true;
  if (!ok) { $('deny').hidden = false; return; }
  $('app').hidden = false; route();
}
$('pw').addEventListener('keydown', e => { if (e.key === 'Enter') accLogin(); });
boot();
