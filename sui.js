// 水晶玉（計画相談）: 利用者台帳 (#suishodama/ledger) と 計画 (#suishodama/plan)。データは Supabase（sui_user / sui_plan / sui_request）。職員のみ。
const SUI = { uid: null, tab: 'user', edit: null, planId: null, rec: null, on: null, poll: null, seen: {} };
const siIn = (id, v, t = 'text', ex = '') => `<input id="${id}" type="${t}" value="${esc(v ?? '')}" ${ex}>`;
const siV = id => { const e = $(id); const v = e ? e.value.trim() : ''; return v === '' ? null : v; };
const siTa = (id, v, rows = 3) => `<textarea id="${id}" rows="${rows}" style="width:100%">${esc(v ?? '')}</textarea>`;
const siBack = `<button class="back noprint" onclick="location.hash='suishodama'">← 水晶玉へ</button>`;
(function () { const st = document.createElement('style'); st.textContent = SUI_DOC_CSS + `.sui-form .g{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px}.sui-form textarea,.sui-form input[type=text],.sui-form input[type=date]{width:100%;box-sizing:border-box}.sui-form .grid8 td,.sui-form .grid8 th{border:1px solid #bbb;padding:2px}.sui-form .grid8 textarea{min-height:44px;font-size:13px}
@media (orientation:landscape) and (min-width:800px){.sui-big{font-size:18px}.sui-big button,.sui-big select,.sui-big input,.sui-big textarea{font-size:17px}.sui-big button{padding:8px 14px}}
@media print{header,.noprint,#out{display:none!important}body{background:#fff!important}main,#home,#view{padding:0!important;margin:0!important;max-width:none!important}.sui-doc{font-size:10.5px}}`; document.head.appendChild(st); })();
const siPage = (landscape) => { let s = document.getElementById('sui_pg'); if (!s) { s = document.createElement('style'); s.id = 'sui_pg'; document.head.appendChild(s); } s.textContent = `@page{size:A4 ${landscape ? 'landscape' : 'portrait'};margin:10mm}`; };
const siFmtDt = t => t ? new Date(t).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '';

// ===== 利用者台帳 =====
async function renderSuiLedger() {
  if (DEMO) { $('view').innerHTML = siBack + '<p>見本モードでは表示しません（ログイン後に開きます）。</p>'; return; }
  $('view').innerHTML = '<p>読み込み中…</p>';
  try { $('view').innerHTML = siBack + (SUI.edit ? await siUserForm(SUI.edit) : await siUserList()); } catch (e) { $('view').innerHTML = siBack + `<p>${esc(e.message)}</p>`; }
}
async function siUserList() {
  const us = await sb('sui_user?select=*&order=name');
  return `<h3>水晶玉 利用者台帳</h3><p><button onclick="SUI.edit='new';renderSuiLedger()">＋利用者を追加</button></p>` + (us.length ? `<table class="tbl"><tr><th>氏名</th><th>種類</th><th>障害支援区分</th><th>受給者証</th><th>注意</th><th></th></tr>${us.map(u => `<tr><td>${esc(u.name)}</td><td>${esc(u.kind)}</td><td>${esc(u.shien_kubun || '')}</td><td>${[u.jukyusha_fukushi, u.jukyusha_chiiki, u.jukyusha_jido].some(Boolean) ? '✅' : '<span style="color:#b00">⚠空欄</span>'}</td><td>${u.needs_check ? '<b style="color:#c60">⚠要確認</b> ' + esc(u.memo || '') : ''}</td><td><button onclick="SUI.edit=${u.id};renderSuiLedger()">開く</button> <button class="back" onclick="SUI.uid=${u.id};location.hash='suishodama/plan'">計画へ</button></td></tr>`).join('')}</table><p>${us.length}名</p>` : '<p>まだ登録がありません。「＋利用者を追加」から入れてください。</p>');
}
async function siUserForm(id) {
  const u = id === 'new' ? { kind: '障害福祉サービス' } : (await sb(`sui_user?id=eq.${id}&select=*`))[0]; if (!u) return '<p>見つかりません</p>';
  const f = (k, l, t = 'text', ex = '') => `<label>${l}<br>${siIn('su_' + k, u[k], t, ex)}</label>`;
  return `<h3>${id === 'new' ? '利用者の追加' : esc(u.name)}</h3><div class="card sui-form"><div class="g">${f('name', '氏名（児童の場合は児童氏名）')}${f('name_kana', '氏名カナ')}${f('birth', '生年月日', 'date')}
  <label>計画の種類<br><select id="su_kind"><option ${u.kind === '障害福祉サービス' ? 'selected' : ''}>障害福祉サービス</option><option ${u.kind === '障害児' ? 'selected' : ''}>障害児</option></select></label>
  ${f('guardian_name', '保護者氏名')}${f('guardian_relation', '続柄')}${f('shien_kubun', '障害支援区分')}${f('address', '住所')}${f('phone', '電話')}${f('city', '市町村')}
  ${f('jukyusha_fukushi', '受給者証番号（障害福祉サービス）')}${f('jukyusha_chiiki', '受給者証番号（地域相談支援）')}${f('jukyusha_jido', '受給者証番号（障害児通所）')}${f('cap_amount', '利用者負担上限額（円）', 'number', 'min=0')}${f('monitoring_period', 'モニタリング期間（例：6か月）')}</div>
  <p><label><input type="checkbox" id="su_needs_check" style="width:auto" ${u.needs_check ? 'checked' : ''}> ⚠要確認</label></p><label>メモ<br>${siTa('su_memo', u.memo, 2)}</label>
  <p><button onclick="siSaveUser('${id}')">保存</button> <button class="back" onclick="SUI.edit=null;renderSuiLedger()">一覧へ</button> ${id !== 'new' ? `<button class="back" onclick="siDelUser(${id})">削除</button>` : ''} <span id="su_m"></span></p></div>`;
}
async function siSaveUser(id) {
  const b = { name: siV('su_name'), kind: $('su_kind').value, needs_check: $('su_needs_check').checked, updated_at: new Date().toISOString() };
  if (!b.name) return $('su_m').textContent = '氏名は必須です';
  ['name_kana', 'birth', 'guardian_name', 'guardian_relation', 'shien_kubun', 'address', 'phone', 'city', 'jukyusha_fukushi', 'jukyusha_chiiki', 'jukyusha_jido', 'monitoring_period', 'memo'].forEach(k => b[k] = siV('su_' + k));
  b.cap_amount = siV('su_cap_amount') == null ? null : +siV('su_cap_amount');
  try { await sb(id === 'new' ? 'sui_user' : `sui_user?id=eq.${id}`, { method: id === 'new' ? 'POST' : 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(b) }); SUI.edit = null; renderSuiLedger(); } catch (e) { $('su_m').textContent = e.message; }
}
async function siDelUser(id) { if (!confirm('この利用者と、計画・依頼をすべて削除します。よろしいですか？')) return; try { await sb(`sui_user?id=eq.${id}`, { method: 'DELETE' }); SUI.edit = null; renderSuiLedger(); } catch (e) { alert(e.message); } }

// ===== 計画 =====
const siTypeLabel = t => t === '計画1' ? 'サービス等利用計画' : t === '計画2' ? '週間計画表' : 'モニタリング報告書';
function siStat(ps, t, c) { // 計画案/計画ごとの 作成・署名・送付 の状況（その様式の最新版）
  const p = ps.filter(x => x.plan_type === t && x.doc_class === c).sort((x, y) => y.version - x.version)[0];
  if (!p) return '<span style="color:#999">未作成</span>';
  return `v${p.version}${p.status === '確定' ? '🔒' : '（下書き）'}<br>署名：${p.signed_on ? `<span style="color:#2e6b4f">✅${esc(p.signed_on)} ${esc(p.signer_kind || '')}</span>` : '未'}<br>送付：${p.sent_on ? `<span style="color:#2e6b4f">✅${esc(p.sent_on)}</span>` : '未'}`;
}
async function renderSuiPlan() {
  clearInterval(SUI.poll);
  if (DEMO) { $('view').innerHTML = siBack + '<p>見本モードでは表示しません（ログイン後に開きます）。</p>'; return; }
  $('view').innerHTML = '<p>読み込み中…</p>';
  try {
    const us = await sb('sui_user?select=*&order=name'); if (!us.length) { $('view').innerHTML = siBack + '<h3>計画</h3><p>先に「利用者台帳」で利用者を追加してください。</p><p><button onclick="location.hash=\'suishodama/ledger\'">利用者台帳へ</button></p>'; return; }
    if (!SUI.uid || !us.some(u => u.id === SUI.uid)) SUI.uid = us[0].id;
    const u = us.find(x => x.id === SUI.uid);
    if (SUI.planId) return $('view').innerHTML = siBack + await siEditor(u, SUI.planId);
    const [ps, rq] = await Promise.all([sb(`sui_plan?user_id=eq.${u.id}&select=id,plan_type,version,kind,doc_class,status,prev_plan_id,source_id,signed_on,signer_kind,sent_on,updated_at&order=plan_type,version.desc`), sb(`sui_request?user_id=eq.${u.id}&select=id,kind,status,created_at,draft&order=id.desc`)]);
    const pend = await siPendingList(u.id), types = ['計画1', '計画2'];
    $('view').innerHTML = `<div class="sui-big">${siBack}<h3>計画相談</h3><p>利用者 <select onchange="SUI.uid=+this.value;renderSuiPlan()">${us.map(x => `<option value="${x.id}" ${x.id === u.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></p>
    <p class="note">使い方は上から順です。① 面談を録音する → ② できた下書きを取り込む → ③ 書類を仕上げて署名・送付。</p>
    ${siRecPanel(u, rq, pend)}
    <div class="card"><h4>③ 書類（${esc(u.name)}さん）</h4><table class="tbl"><tr><th>書類</th><th>計画案</th><th>計画</th></tr>${types.map(t => `<tr><td>${siTypeLabel(t)}</td><td>${siStat(ps, t, '計画案')}</td><td>${siStat(ps, t, '計画')}</td></tr>`).join('')}</table>
    <p class="note">計画案と計画は別の書類です（内容は同じでよい）。それぞれ署名をもらい、市役所へ紙で送ります。</p>
    ${ps.length ? `<table class="tbl"><tr><th>書類</th><th>区分</th><th>版</th><th>状態</th><th></th></tr>${ps.map(p => `<tr><td>${siTypeLabel(p.plan_type)}</td><td>${esc(p.doc_class || '')}</td><td>v${p.version}（${esc(p.kind)}）</td><td>${p.status === '確定' ? '🔒確定' : '下書き'}</td><td><button onclick="SUI.planId=${p.id};renderSuiPlan()">開く</button> <button class="back" onclick="siCont(${p.id})">次の版を作る</button></td></tr>`).join('')}</table>` : '<p>まだ書類がありません。②で下書きを取り込むか、下のボタンで白紙から作ります。</p>'}
    <details><summary>白紙から作る</summary><p>${types.map(t => `<button class="back" onclick="siNewPlan('${t}','新規')">＋${siTypeLabel(t)}</button>`).join(' ')} <button class="back" onclick="siNewPlan('モニタリング','新規')">＋モニタリング報告書</button></p></details></div></div>`;
    siRestoreTx(u.id); siStartPoll(u.id, rq);
  } catch (e) { $('view').innerHTML = siBack + `<p>${esc(e.message)}</p>`; }
}
const siHdr = u => ({ user_name: u.name, guardian_name: u.guardian_name, guardian_relation: u.guardian_relation, shien_kubun: u.shien_kubun, jukyusha_fukushi: u.jukyusha_fukushi, jukyusha_chiiki: u.jukyusha_chiiki, jukyusha_jido: u.jukyusha_jido, cap_amount: u.cap_amount, monitoring_period: u.monitoring_period });
async function siNewPlan(t, kind, from, cls) {
  try { const u = (await sb(`sui_user?id=eq.${SUI.uid}&select=*`))[0], last = (await sb(`sui_plan?user_id=eq.${u.id}&plan_type=eq.${encodeURIComponent(t)}&select=version&order=version.desc&limit=1`))[0];
    const body = from ? from.body : { header: siHdr(u) }, doc_class = t === 'モニタリング' ? null : (cls || (from && from.doc_class) || '計画案');
    const r = await sb('sui_plan', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ user_id: u.id, plan_type: t, version: last ? last.version + 1 : 1, kind, doc_class, prev_plan_id: from && !from.dup ? from.id : null, source_id: from && from.dup ? from.id : null, status: from && from.status || '下書き', body }) });
    SUI.planId = r[0].id; await renderSuiPlan(); return r[0]; } catch (e) { alert(e.message); }
}
async function siCont(id) { const p = (await sb(`sui_plan?id=eq.${id}&select=*`))[0]; const b = JSON.parse(JSON.stringify(p.body || {})); if (b.header) b.header.created_on = null; await siNewPlan(p.plan_type, '継続', { id: p.id, body: b, doc_class: p.doc_class }); }
// 計画案を確定したら、同じ内容で「計画」を複製（別書類。確定済みで作る）
async function siDup(id) {
  try { const p = (await sb(`sui_plan?id=eq.${id}&select=*`))[0]; if (p.doc_class !== '計画案' || p.status !== '確定') return alert('確定した計画案から複製できます');
    const ex = (await sb(`sui_plan?source_id=eq.${id}&select=id`))[0]; if (ex && !confirm('この計画案からの「計画」は作成済みです。もう一つ作りますか？')) { SUI.planId = ex.id; return renderSuiPlan(); }
    SUI.uid = p.user_id; return await siNewPlan(p.plan_type, p.kind, { id: p.id, body: p.body, dup: true, status: '確定' }, '計画'); } catch (e) { alert(e.message); }
}
async function siEditor(u, id) {
  const p = (await sb(`sui_plan?id=eq.${id}&select=*`))[0]; if (!p) return '<p>見つかりません</p>';
  const b = p.body || {}, h = b.header || {}, lock = p.status === '確定', dis = lock ? 'disabled' : '';
  const hdr = `<div class="g">${SUI_HDR.map(([k, l, t]) => `<label>${l}<br><input id="sh_${k}" type="${t || 'text'}" value="${esc(h[k] ?? '')}" ${dis}></label>`).join('')}</div>`;
  let body = '';
  if (p.plan_type === '計画1') {
    const g = b.goals || [], tx = (k, l, r) => `<label>${l}<br><textarea id="sb_${k}" rows="${r}" ${dis}>${esc(b[k] ?? '')}</textarea></label>`;
    body = `${tx('intent', '1 生活に対する意向', 3)}${tx('policy', '2 総合的な援助の方針', 3)}${tx('long_goal', '3 長期目標', 2)}${tx('short_goal', '4 短期目標', 2)}<h4>5 個別目標</h4>` + [0, 1, 2, 3].map(i => `<div class="card"><b>${i + 1}行目</b><div class="g">${SUI_GOAL.map(([k, l]) => `<label>${l}<br><textarea id="sg_${i}_${k}" rows="2" ${dis}>${esc((g[i] || {})[k] ?? '')}</textarea></label>`).join('')}</div></div>`).join('');
  } else if (p.plan_type === '計画2') {
    const c = b.cells || [], a = b.activities || [];
    body = `<div style="overflow-x:auto"><table class="grid8" style="min-width:900px"><tr><th style="width:56px"></th>${SUI_WD.map(w => `<th>${w}</th>`).join('')}<th>主な日常生活上の活動</th></tr>${SUI_ROWS.map((r, i) => `<tr><th>${r}</th>${SUI_WD.map((w, j) => `<td><textarea id="sc_${i}_${j}" rows="2" ${dis}>${esc((c[i] || [])[j] ?? '')}</textarea></td>`).join('')}<td><textarea id="sa_${i}" rows="2" ${dis}>${esc(a[i] ?? '')}</textarea></td></tr>`).join('')}</table></div>
    <label>週単位以外のサービス<br><textarea id="sb_other" rows="3" ${dis}>${esc(b.other ?? '')}</textarea></label><label>生活の全体像<br><textarea id="sb_overview" rows="4" ${dis}>${esc(b.overview ?? '')}</textarea></label>`;
  } else {
    body = SUI_MON.map(([t, fs]) => `<h4>${t}</h4><div class="g">${fs.map(([k, l, ty]) => ty === 'ta' ? `<label style="grid-column:1/-1">${l}<br><textarea id="sm_${k}" rows="3" ${dis}>${esc(b[k] ?? '')}</textarea></label>` : ty === 'sel' ? `<label>${l}<br><select id="sm_${k}" ${dis}><option value=""></option><option ${b[k] === '要' ? 'selected' : ''}>要</option><option ${b[k] === '不要' ? 'selected' : ''}>不要</option></select></label>` : `<label>${l}<br><input id="sm_${k}" type="${ty || 'text'}" value="${esc(b[k] ?? '')}" ${dis}></label>`).join('')}</div>`).join('');
  }
  return `<div class="sui-big"><h3>${esc(p.doc_class ? p.doc_class + '：' : '')}${siTypeLabel(p.plan_type)}　${esc(u.name)}　v${p.version}（${esc(p.kind)}）${lock ? '🔒確定' : '下書き'}</h3><div class="card sui-form"><h4>ヘッダー</h4>${hdr}${body}
  <p>${lock ? '<span class="note">確定した版は変更できません。続ける場合は「継続」で新しい版を作ります。</span>' : `<button onclick="siSavePlan(${p.id},false)">下書き保存</button> <button onclick="siSavePlan(${p.id},'ver')">新しい版として保存</button> <button onclick="siSavePlan(${p.id},true)">確定する</button>`}
  <button class="back" onclick="siPrint(${p.id})">🖨️ 印刷 / PDF</button> <button class="back" onclick="SUI.planId=null;renderSuiPlan()">一覧へ</button> <span id="sp_m"></span></p></div>
  ${p.doc_class && lock ? `<div class="card"><h4>${esc(p.doc_class)}の署名・送付 <button class="back" style="font-size:.8em" onclick="siSignHelp(event)">？署名の手順</button></h4>
   <p>署名：${p.signed_on ? `<b style="color:#2e6b4f">✅ ${esc(p.signed_on)}　${esc(p.signer_kind || '')}</b>` : '未'}　<button onclick="siOnsite(${p.id})">✍️ その場で署名（タブレットを利用者に渡す）</button> <button class="back" onclick="siLink(${p.id})">署名リンクを発行</button> <button class="back" onclick="siPaper(${p.id})">紙で署名済みを記録</button></p>
   ${p.doc_class === '計画案' ? `<p><button onclick="siDup(${p.id})">この計画案から「計画」を作る（同じ内容を複製）</button></p>` : ''}
   <p>市役所へ紙で送付した日 <input type="date" id="sp_sent" value="${esc(p.sent_on || '')}" style="width:auto"> <button onclick="siSent(${p.id})">保存</button> <span id="sp_sm"></span></p><div id="sp_link"></div></div>` : p.doc_class ? '<p class="note">確定すると、署名・送付の欄が出ます。</p>' : ''}</div>`;
}
function siCollect(t) {
  const b = { header: {} }; SUI_HDR.forEach(([k]) => b.header[k] = siV('sh_' + k)); if (b.header.cap_amount != null) b.header.cap_amount = +b.header.cap_amount;
  if (t === '計画1') { ['intent', 'policy', 'long_goal', 'short_goal'].forEach(k => b[k] = siV('sb_' + k)); b.goals = [0, 1, 2, 3].map(i => Object.fromEntries(SUI_GOAL.map(([k]) => [k, siV(`sg_${i}_${k}`)]))); }
  else if (t === '計画2') { b.cells = SUI_ROWS.map((_, i) => SUI_WD.map((_, j) => siV(`sc_${i}_${j}`))); b.activities = SUI_ROWS.map((_, i) => siV('sa_' + i)); b.other = siV('sb_other'); b.overview = siV('sb_overview'); }
  else SUI_MON.forEach(([, fs]) => fs.forEach(([k]) => b[k] = siV('sm_' + k)));
  return b;
}
async function siSavePlan(id, mode) {
  try { const p = (await sb(`sui_plan?id=eq.${id}&select=*`))[0], body = siCollect(p.plan_type);
    if (mode === 'ver') { const last = (await sb(`sui_plan?user_id=eq.${p.user_id}&plan_type=eq.${encodeURIComponent(p.plan_type)}&select=version&order=version.desc&limit=1`))[0]; const r = await sb('sui_plan', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ user_id: p.user_id, plan_type: p.plan_type, version: last.version + 1, kind: p.kind, doc_class: p.doc_class, prev_plan_id: p.id, body }) }); SUI.planId = r[0].id; return await renderSuiPlan(); }
    if (mode === true && !confirm('確定すると、この版は変更できなくなります。確定しますか？')) return;
    await sb(`sui_plan?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ body, status: mode === true ? '確定' : p.status, updated_by: undefined }) });
    $('sp_m').textContent = '保存しました'; if (mode === true) renderSuiPlan();
  } catch (e) { $('sp_m').textContent = e.message; }
}
// ===== 印刷（A4、ブラウザ印刷でPDF可）=====
async function siPrint(id) {
  const p = (await sb(`sui_plan?id=eq.${id}&select=*`))[0], d = suiDocHtml(p); siPage(d.land);
  $('view').innerHTML = `<div class="noprint"><button class="back" onclick="renderSuiPlan()">← 編集に戻る</button> <button onclick="window.print()">🖨️ 印刷 / PDF保存</button> <span class="note">用紙はA4・${d.land ? '横' : '縦'}です。印刷ダイアログで「PDFに保存」を選ぶとPDFになります。</span></div><div class="sui-doc"><h2>${d.title}　v${p.version}（${esc(p.kind)}）</h2>${d.html}</div>`;
}
// ===== 署名（その場／リンク／紙）・送付 =====
async function siSent(id) { try { await sb(`sui_plan?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ sent_on: siV('sp_sent') }) }); $('sp_sm').textContent = '保存しました'; } catch (e) { $('sp_sm').textContent = e.message; } }
async function siPaper(id) { const d = prompt('紙で署名済みであることを確認しましたか？\n確認済みなら署名日（YYYY-MM-DD）を入れてください。'); if (!d) return; if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return alert('日付は 2026-10-17 の形で入れてください'); const memo = prompt('メモ（任意）', '') || ''; try { await sb('rpc/sui_sign_mark_paper', { method: 'POST', body: JSON.stringify({ p_plan_id: id, p_signed_on: d, p_memo: memo }) }); renderSuiPlan(); } catch (e) { alert(e.message); } }
async function siLink(id) { const ex = prompt('説明した職員の氏名'); if (!ex) return; try { const t = await sb('rpc/sui_sign_issue', { method: 'POST', body: JSON.stringify({ p_plan_id: id, p_explainer: ex }) }); const url = location.origin + location.pathname.replace(/[^/]*$/, '') + 'sui_sign.html?t=' + t; $('sp_link').innerHTML = `<p><b>署名リンク（1回限り・1週間）</b><br><input readonly value="${esc(url)}" style="width:100%" onclick="this.select()"></p><p class="note">このURLをご本人に送ってください。</p>`; } catch (e) { alert(e.message); } }
// その場で署名：同じタブレットを利用者に渡す。計画案→計画の順に、それぞれ署名（signpad）。
async function siOnsite(id) {
  try { const p = (await sb(`sui_plan?id=eq.${id}&select=*`))[0]; let q = [p];
    if (p.doc_class === '計画案') { const dup = (await sb(`sui_plan?source_id=eq.${p.id}&select=*&order=id.desc&limit=1`))[0]; q.push(dup || await (async () => { if (!confirm('署名のため、この計画案と同じ内容の「計画」を作ります。よろしいですか？')) return null; SUI.uid = p.user_id; const r = await siNewPlan(p.plan_type, p.kind, { id: p.id, body: p.body, dup: true, status: '確定' }, '計画'); SUI.planId = null; return r; })()); q = q.filter(Boolean); }
    const ex = prompt('説明した職員の氏名（記録に残ります）', ''); if (!ex) return;
    SUI.on = { q, i: 0, ex, pad: null, sig: false }; siOnStep();
  } catch (e) { alert(e.message); }
}
async function siOnStep() {
  const O = SUI.on, p = O.q[O.i]; if (!p) { SUI.planId = null; return renderSuiPlan(); }
  const d = suiDocHtml(p); siPage(d.land);
  $('view').innerHTML = `<div class="sui-big sui-on"><div class="noprint" style="background:#eef;padding:8px;border-radius:8px"><b style="font-size:1.2em">${esc(p.doc_class)}の確認と署名（${O.i + 1}／${O.q.length}）</b>　<button class="back" onclick="SUI.on=null;renderSuiPlan()">やめる</button></div>
  <div class="sui-doc" style="max-height:48vh;overflow:auto;border:1px solid #ccc;margin:8px 0;padding:6px"><h2>${d.title}　v${p.version}</h2>${d.html}</div>
  <div class="card"><b>署名の方法</b>　<label><input type="radio" name="om" value="本人" checked onchange="siOm()"> 本人</label>　<label><input type="radio" name="om" value="ご家族" onchange="siOm()"> 代理の方（ご家族など）</label>　<label><input type="radio" name="om" value="署名困難" onchange="siOm()"> 署名が難しい</label>
   <div id="om_rel" hidden>氏名 <input id="om_nm" style="width:30%"> 続柄 <input id="om_rl" style="width:20%"></div><div id="om_rs" hidden>理由 <input id="om_rv" style="width:70%"></div>
   <div id="om_pad"><p>下の枠に指で署名してください</p><div style="height:220px;border:2px solid #888;border-radius:8px"><canvas id="om_cv" style="width:100%;height:100%;display:block;touch-action:none"></canvas></div><button class="back" onclick="SUI.on.pad.clear()">書き直す</button></div>
   <p><button style="font-size:1.2em;padding:12px 24px" onclick="siOnSend()">署名を確定する</button> <span id="om_m"></span></p></div></div>`;
  O.pad = createSignPad($('om_cv'));
}
function siOm() { const m = document.querySelector('input[name=om]:checked').value; $('om_rel').hidden = m !== 'ご家族'; $('om_rs').hidden = m !== '署名困難'; $('om_pad').hidden = m === '署名困難'; if (m !== '署名困難') SUI.on.pad.remeasure(); }
async function siOnSend() {
  const O = SUI.on, p = O.q[O.i], m = document.querySelector('input[name=om]:checked').value, nm = $('om_nm').value.trim(), rl = $('om_rl').value.trim(), rv = $('om_rv').value.trim();
  if (m !== '署名困難' && !O.pad.isDrawn()) return $('om_m').textContent = '署名を書いてください';
  if (m === 'ご家族' && (!nm || !rl)) return $('om_m').textContent = '氏名と続柄を入れてください';
  if (m === '署名困難' && !rv) return $('om_m').textContent = '理由を入れてください';
  try { await sb('rpc/sui_sign_onsite', { method: 'POST', body: JSON.stringify({ p_plan_id: p.id, p_method: m, p_signature: m === '署名困難' ? null : O.pad.toDataURL(), p_name: nm || null, p_relation: rl || null, p_reason: rv || null, p_explainer: O.ex }) }); O.i++; siOnStep(); } catch (e) { $('om_m').textContent = e.message; }
}
// ===== 録音して依頼（通信が弱い場合は端末に一時保存して後送り）=====
const siIdb = () => new Promise((ok, ng) => { const r = indexedDB.open('sui_pending', 1); r.onupgradeneeded = () => r.result.createObjectStore('q', { keyPath: 'key', autoIncrement: true }); r.onsuccess = () => ok(r.result); r.onerror = () => ng(r.error); });
async function siPendingList(uid) { try { const db = await siIdb(); return await new Promise(ok => { const q = db.transaction('q').objectStore('q').getAll(); q.onsuccess = () => ok(q.result.filter(x => !uid || x.user_id === uid)); q.onerror = () => ok([]); }); } catch (_) { return []; } }
async function siPendingPut(o) { const db = await siIdb(); return new Promise((ok, ng) => { const t = db.transaction('q', 'readwrite'); t.objectStore('q').add(o); t.oncomplete = ok; t.onerror = () => ng(t.error); }); }
async function siPendingDel(k) { const db = await siIdb(); return new Promise(ok => { const t = db.transaction('q', 'readwrite'); t.objectStore('q').delete(k); t.oncomplete = ok; }); }
async function siSendOne(o) { // 音声→Storage、依頼→sui_request（状態：待ち）
  let path = null; if (o.blob) { const s = JSON.parse(localStorage.getItem('sess') || '{}'), ext = /mp4/.test(o.blob.type) ? 'm4a' : 'webm'; path = `${(s.user && s.user.id) || 'staff'}/${o.ts || Date.now()}.${ext}`;
    const r = await fetch(`${C.supabaseUrl}/storage/v1/object/sui-audio/${path}`, { method: 'POST', headers: { apikey: C.supabaseKey, Authorization: 'Bearer ' + s.token, 'Content-Type': o.blob.type, 'x-upsert': 'true' }, body: o.blob }); if (!r.ok) throw new Error('音声を保存できませんでした（' + r.status + '）'); }
  await sb('sui_request', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ user_id: o.user_id, kind: o.kind, transcript: o.transcript, audio_path: path, status: '待ち' }) });
}
async function siFlush() { const list = await siPendingList(); let n = 0; for (const o of list) { try { await siSendOne(o); await siPendingDel(o.key); n++; } catch (_) { break; } } if (n && SUI.uid && /suishodama\/plan/.test(location.hash) && !SUI.planId && !SUI.on) renderSuiPlan(); return n; }
window.addEventListener('online', () => siFlush());
function siRecPanel(u, rq, pend) {
  const sr = window.SpeechRecognition || window.webkitSpeechRecognition;
  return `<div class="card"><h4>① 面談を録音する</h4>
  <p>種別 <select id="sr_kind"><option>新規</option><option>継続</option></select> <button id="sr_btn" style="font-size:1.1em;padding:10px 20px" onclick="siRec()">● 録音を始める</button> <span id="sr_st"></span></p>
  <label>文字起こし（自動で入ります。直してもかまいません）${sr ? '' : '<b>　このブラウザは音声認識に対応していないので、手で入力してください。</b>'}<br><textarea id="sr_tx" rows="6" style="width:100%" oninput="localStorage.setItem('sui_tx_${u.id}',this.value)"></textarea></label>
  <p><button style="font-size:1.1em;padding:10px 20px" onclick="siReq()">この内容で下書きを作ってもらう</button> <span id="sr_m"></span></p>
  ${pend && pend.length ? `<p style="color:#c60">📴 送信待ち ${pend.length}件（通信が戻ると自動で送ります） <button class="back" onclick="siFlush().then(n=>{$('sr_m').textContent=n+'件送りました';renderSuiPlan()})">いま送る</button></p>` : ''}</div>
  <div class="card"><h4>② できた下書き</h4><p class="note">録音して依頼すると、約1分で基本情報シート・計画案（サービス等利用計画・週間計画表）・継続ならモニタリングが自動でできます。「作成中」のあいだは、このまま待つと自動で出ます。</p><div id="sr_list">${siReqTable(rq)}</div><div id="sr_dr"></div></div>`;
}
const siReqTable = rq => rq.length ? `<table class="tbl"><tr><th>録音した日時</th><th>種別</th><th>状態</th><th></th></tr>${rq.map(r => `<tr><td>${esc(siFmtDt(r.created_at))}</td><td>${esc(r.kind)}</td><td>${r.status === '待ち' ? '作成中 ⏳' : esc(r.status)}</td><td>${r.draft ? `<button onclick="siDraft(${r.id})">中身を見る</button>` : ''}</td></tr>`).join('')}</table>` : '<p>まだありません。①で録音すると、ここに出ます。</p>';
const SI_DLBL = { plan1: 'サービス等利用計画', plan2: '週間計画表', monitoring: 'モニタリング報告書', intent: '生活に対する意向', policy: '総合的な援助の方針', long_goal: '長期目標', short_goal: '短期目標', goals: '個別目標', activities: '主な日常生活上の活動', other: '週単位以外のサービス', overview: '生活の全体像', cells: '週間の予定' };
const siDView = (v, k) => { if (v == null || v === '' || (Array.isArray(v) && !v.flat(9).some(Boolean))) return ''; const l = SI_DLBL[k] || k;
  if (typeof v !== 'object') return `<p><b>${esc(l)}</b><br>${esc(String(v)).replace(/\n/g, '<br>')}</p>`;
  const inner = Array.isArray(v) ? v.map((x, i) => siDView(x, (i + 1) + '')).join('') : Object.entries(v).filter(([kk]) => kk !== 'header').map(([kk, x]) => siDView(x, kk)).join('');
  return inner ? `<div style="margin-left:8px"><b>${esc(l)}</b>${inner}</div>` : ''; };
function siRestoreTx(uid) { const t = $('sr_tx'); if (t && !t.value) t.value = localStorage.getItem('sui_tx_' + uid) || ''; }
async function siRec() {
  const R = SUI.rec;
  if (R && R.on) { R.on = false; try { R.mr.stop(); } catch (_) {} try { R.sr && R.sr.stop(); } catch (_) {} $('sr_btn').textContent = '● 録音を始める'; return; }
  try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }), mr = new MediaRecorder(stream), chunks = []; SUI.rec = { on: true, mr, blob: null };
    mr.ondataavailable = e => e.data.size && chunks.push(e.data);
    mr.onstop = () => { stream.getTracks().forEach(t => t.stop()); SUI.rec.blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' }); $('sr_st').textContent = '録音を止めました（「依頼する」で音声も保存します）'; };
    mr.start(); $('sr_btn').textContent = '■ 録音を止める'; $('sr_st').textContent = '録音中…';
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (SR) { const sr = new SR(); sr.lang = 'ja-JP'; sr.continuous = true; sr.interimResults = false; SUI.rec.sr = sr;
      sr.onresult = ev => { for (let i = ev.resultIndex; i < ev.results.length; i++) if (ev.results[i].isFinal) { $('sr_tx').value += ev.results[i][0].transcript + '\n'; localStorage.setItem('sui_tx_' + SUI.uid, $('sr_tx').value); } };
      sr.onend = () => { if (SUI.rec && SUI.rec.on) try { sr.start(); } catch (_) {} }; try { sr.start(); } catch (_) {} }
  } catch (e) { $('sr_st').textContent = '録音を始められません：' + e.message; }
}
async function siReq() {
  const tx = $('sr_tx').value.trim(); if (!tx) return $('sr_m').textContent = '本文が空です';
  if (SUI.rec && SUI.rec.on) return $('sr_m').textContent = '先に録音を止めてください';
  const o = { user_id: SUI.uid, kind: $('sr_kind').value, transcript: tx, blob: SUI.rec && SUI.rec.blob || null, ts: Date.now() };
  try { await siSendOne(o); localStorage.removeItem('sui_tx_' + SUI.uid); SUI.rec = null; renderSuiPlan(); }
  catch (e) { try { await siPendingPut(o); localStorage.removeItem('sui_tx_' + SUI.uid); SUI.rec = null; $('sr_m').textContent = '通信できないため端末に保存しました。通信が戻ると自動で送ります。'; setTimeout(renderSuiPlan, 1500); } catch (e2) { $('sr_m').textContent = '送れず、端末にも保存できませんでした：' + e.message; } }
}
// 依頼の状態を数秒おきに見て、下書きが戻ったら自動で表示
function siStartPoll(uid, rq) {
  clearInterval(SUI.poll); if (!rq.some(r => r.status === '待ち')) return;
  SUI.poll = setInterval(async () => { try { if (!$('sr_list') || SUI.planId || SUI.on || SUI.uid !== uid) return clearInterval(SUI.poll);
    const now = await sb(`sui_request?user_id=eq.${uid}&select=id,kind,status,created_at,draft,made&order=id.desc`); $('sr_list').innerHTML = siReqTable(now);
    const done = now.find(r => r.status === '作成済み' && r.draft && !SUI.seen[r.id]); if (done) { SUI.seen[done.id] = 1; clearInterval(SUI.poll); if (done.made) await renderSuiPlan(); siDraft(done.id, true); return; }
    if (!now.some(r => r.status === '待ち')) clearInterval(SUI.poll); } catch (_) {} }, 5000);
}
async function siDraft(id, auto) {
  const r = (await sb(`sui_request?id=eq.${id}&select=draft,kind,made`))[0], d = r.draft || {};
  $('sr_dr').innerHTML = `<div class="card" style="border:2px solid #2e6b4f"><b>${auto ? '✅ 下書きができました（依頼#' + id + '）' : '下書き（依頼#' + id + '）'}</b><div style="background:#f6f6f6;padding:8px;max-height:360px;overflow:auto">${Object.entries(d).map(([k, x]) => siDView(x, k)).join('') || '（中身が空です）'}</div>${r.made ? `<p>📄 自動でできた書類：${r.made.basic ? '基本情報シート・' : ''}${r.made.plan1 ? 'サービス等利用計画（計画案）・' : ''}${r.made.plan2 ? '週間計画表（計画案）・' : ''}${r.made.monitoring ? 'モニタリング報告書' : ''}（いずれも下書き）。③の一覧から開いて直し、確定して署名へ。<br><a href="#suishodama/basic">📋 基本情報シートを開く</a>　<a href="#suishodama/contract">📄 利用契約書・重要事項説明書の署名へ</a></p>` : `<p class="note">取り込むと、その書類の「計画案（下書き）」ができます。③で開いて直せます。</p>`}
  <p>${r.made ? '' : (d.plan1 ? `<button onclick="siImport(${id},'計画1')">サービス等利用計画の計画案として取り込む</button> ` : '') + (d.plan2 ? `<button onclick="siImport(${id},'計画2')">週間計画表の計画案として取り込む</button> ` : '') + (d.monitoring ? `<button onclick="siImport(${id},'モニタリング')">モニタリングとして取り込む</button>` : '')}</p></div>`;
}
async function siImport(id, t) { try { const r = (await sb(`sui_request?id=eq.${id}&select=draft,kind`))[0], u = (await sb(`sui_user?id=eq.${SUI.uid}&select=*`))[0], k = { '計画1': 'plan1', '計画2': 'plan2', 'モニタリング': 'monitoring' }[t], d = r.draft[k] || {}; d.header = Object.assign(siHdr(u), d.header || {}); await siNewPlan(t, r.kind, { body: d }); } catch (e) { alert(e.message); } }

// 署名の手順ポップアップ（署名・送付の欄のボタンのすぐ近くに表示）
function siSignHelp(ev) {
  const old = document.getElementById('sui_help'); if (old) { old.remove(); return; }
  const b = ev.currentTarget, r = b.getBoundingClientRect(), d = document.createElement('div');
  d.id = 'sui_help';
  d.style.cssText = 'position:absolute;z-index:9999;max-width:min(92vw,460px);background:#fffbe6;border:2px solid #c9a227;border-radius:10px;padding:12px 14px;box-shadow:0 4px 16px rgba(0,0,0,.25);font-size:15px;line-height:1.6;left:' + Math.max(8, Math.min(r.left + scrollX, scrollX + innerWidth - 480)) + 'px;top:' + (r.bottom + scrollY + 6) + 'px';
  d.innerHTML = '<b>署名の手順</b><ol style="margin:6px 0 6px 1.2em;padding:0"><li>計画案を「確定」にします（署名できるのは確定した書類だけです）。</li><li>この欄の「✍️ その場で署名」を押し、タブレットを利用者に渡します。</li><li>署名の方法（本人／ご家族など代理／署名困難）を選び、枠に指で書いてもらい、「署名を確定する」を押します。</li><li>続けて、同じ内容の「計画」の署名画面になります。同じように署名してもらいます。</li><li>市役所へ紙で送ったら、「市役所へ紙で送付した日」を入れて保存します。</li></ol><div class="note">その場で署名できないときは「署名リンクを発行」か「紙で署名済みを記録」を使います。</div><div style="text-align:right"><button class="back" onclick="document.getElementById(\'sui_help\').remove()">閉じる</button></div>';
  document.body.appendChild(d);
}

// ===== 月間利用実績（水晶玉トップ） =====
// 加算：令和6年度報酬改定（R6.4.1時点）。出典：大分市「計画相談支援の加算について」、札幌市 給付費別冊R6、ヨシカワ福祉経営事務所まとめ
const SUI_KASAN = [
  ['shokai', '初回加算', '300/月'], ['nyuin1', '入院時情報連携加算（Ⅰ）', '300/月'], ['nyuin2', '入院時情報連携加算（Ⅱ）', '150/月'],
  ['taiin', '退院・退所加算', '300/回・3回まで'], ['kyotaku', '居宅介護支援事業所等連携加算', '情報提供150/訪問・会議300'],
  ['iryo', '医療・保育・教育機関等連携加算', '面談 計画月200・モニ月300/通院同行300/情報提供150'], ['tantou', 'サービス担当者会議実施加算', '100/月'],
  ['teikyo', 'サービス提供時モニタリング加算', '100/月'], ['shuchu', '集中支援加算', '①〜④300/⑤150'],
  ['shunin1', '主任相談支援専門員配置加算（Ⅰ）', '300/月'], ['shunin2', '主任相談支援専門員配置加算（Ⅱ）', '100/月'],
  ['kodo', '行動障害支援体制加算', 'Ⅰ60/Ⅱ30'], ['iryoji', '要医療児者支援体制加算', 'Ⅰ60/Ⅱ30'], ['seishin', '精神障害者支援体制加算', 'Ⅰ60/Ⅱ30'],
  ['koji', '高次脳機能障害支援体制加算', 'Ⅰ60/Ⅱ30'], ['peer', 'ピアサポート体制加算', '100/月'], ['kyoten', '地域生活支援拠点等相談強化加算', '700/回・月4回まで'],
  ['jogen', '利用者負担上限額管理加算', '150/回・月1回']];
SUI.ym = SUI.ym || new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 7);
async function siMonthly() {
  const el = $('sui_month'); if (!el) return; if (DEMO) { el.innerHTML = ''; return; }
  el.innerHTML = '<p>月間利用実績を読み込み中…</p>';
  try {
    const ym = SUI.ym, [us, ps, ks] = await Promise.all([sb('sui_user?select=id,name&order=name'), sb('sui_plan?select=id,user_id,plan_type,kind,doc_class,status,body,created_at,signed_on,sent_on&order=version.desc'), sb(`sui_kasan?ym=eq.${ym}&select=*`)]);
    const day = p => (p.body && p.body.header && p.body.header.created_on) || (p.created_at || '').slice(0, 10);
    const km = Object.fromEntries(ks.map(k => [k.user_id, k.items || []])), cnt = { 新規: 0, 継続: 0 }, kc = {};
    const rows = us.map(u => {
      const mine = ps.filter(p => p.user_id === u.id && day(p).slice(0, 7) === ym);
      const plan = mine.filter(p => p.plan_type !== 'モニタリング'), mon = mine.filter(p => p.plan_type === 'モニタリング');
      const it = km[u.id] || []; if (!mine.length && !it.length) return null;
      let typ = '—', cls = '';
      if (plan.length) { const nw = plan.some(p => p.kind === '新規'); typ = nw ? '新規（計画作成）' : '新規扱い（計画変更）'; cnt.新規++; cls = '#e8f3ec'; }
      else if (mon.length) { typ = '継続（モニタリング）'; cnt.継続++; cls = '#eef1fb'; }
      it.forEach(c => kc[c] = (kc[c] || 0) + 1);
      const dates = [...new Set(mine.map(p => `${p.plan_type === 'モニタリング' ? 'モニ' : p.doc_class || p.plan_type} ${day(p)}`))].join('<br>');
      const sig = mine.map(p => `${esc(p.doc_class || p.plan_type)}：${p.status === '確定' ? '確定' : '下書き'}・署名${p.signed_on ? '✅' : '未'}・送付${p.sent_on ? '✅' : '未'}`).join('<br>');
      return `<tr style="background:${cls}"><td>${esc(u.name)}</td><td>${typ}</td><td>${dates || '—'}</td><td style="font-size:12px">${sig || '—'}</td><td>${it.length ? it.map(c => esc((SUI_KASAN.find(k => k[0] === c) || [c, c])[1])).join('、') : '<span style="color:#999">なし</span>'} <button onclick="siKasanEdit(${u.id})">加算</button></td></tr>`;
    }).filter(Boolean);
    const others = us.filter(u => !rows.some(r => r.includes(`siKasanEdit(${u.id})`)));
    el.innerHTML = `<div class="card"><h3 style="margin-top:0">📊 月間利用実績 <input type="month" value="${ym}" onchange="SUI.ym=this.value;siMonthly()"></h3>
      <p><b>新規 ${cnt.新規}件</b>（計画作成・計画変更）　<b>継続 ${cnt.継続}件</b>（モニタリング）　合計 ${cnt.新規 + cnt.継続}件</p>
      <p style="font-size:13px">加算：${Object.keys(kc).length ? SUI_KASAN.filter(k => kc[k[0]]).map(k => `${esc(k[1])} ${kc[k[0]]}件`).join('／') : 'なし'}</p>
      <div style="overflow-x:auto"><table class="grid8" style="border-collapse:collapse;width:100%;font-size:14px"><tr><th>利用者</th><th>請求種別</th><th>実施日</th><th>確定・署名・送付</th><th>加算</th></tr>${rows.join('') || '<tr><td colspan="5">この月の計画・モニタリングはまだありません</td></tr>'}</table></div>
      ${others.length ? `<p style="font-size:13px">加算だけ付ける：<select id="sk_u">${others.map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('')}</select> <button onclick="siKasanEdit(+$('sk_u').value)">加算</button></p>` : ''}
      <p class="note">請求種別・実施日は計画/モニタリングの作成日（無ければ登録日）で月を判定します。加算は手でチェックします。</p><div id="sk_ed"></div></div>`;
  } catch (e) { el.innerHTML = `<p>月間利用実績：${esc(e.message)}</p>`; }
}
async function siKasanEdit(uid) {
  const k = (await sb(`sui_kasan?user_id=eq.${uid}&ym=eq.${SUI.ym}&select=items`))[0], it = (k && k.items) || [], u = (await sb(`sui_user?id=eq.${uid}&select=name`))[0];
  $('sk_ed').innerHTML = `<div class="card" style="border:2px solid #8e5bb5"><b>${esc(u.name)}　${SUI.ym} の加算</b><div style="columns:2 260px;font-size:14px">${SUI_KASAN.map(x => `<label style="display:block"><input type="checkbox" class="skc" value="${x[0]}" ${it.includes(x[0]) ? 'checked' : ''}> ${esc(x[1])} <small style="color:#777">${esc(x[2])}</small></label>`).join('')}</div>
    <button onclick="siKasanSave(${uid})">保存</button> <button class="back" onclick="$('sk_ed').innerHTML=''">閉じる</button></div>`;
  $('sk_ed').scrollIntoView({ behavior: 'smooth' });
}
async function siKasanSave(uid) {
  const items = [...document.querySelectorAll('.skc:checked')].map(c => c.value);
  try { await sb('sui_kasan?on_conflict=user_id,ym', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ user_id: uid, ym: SUI.ym, items, updated_at: new Date().toISOString() }) }); siMonthly(); } catch (e) { alert(e.message); }
}
