// 金斗雲 訪問記録 (#kintoun/visit)。GAS「サービス実施記録入力」(index.html v13.6 / Code.gs v11.7) に準じた大きな縦レイアウト。
// 「サ責からの指示」はヘルパーの記入欄ではない。利用者（または全員）向けの有効な指示を表示するだけ。
// 新規保存時に、その提供日に有効な指示ID（無ければ「指示なし」）を instruction_id へ自動で入れる。既存行は上書きしない。
const KV = { id: null, month: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 7), instructions: [], users: [], visit: null, ctx: null, instrMissing: false };
const KV_REPORT = [
  { k: 'report1', ja: '①意欲', pt: 'Disposição / motivação' },
  { k: 'report2', ja: '②訴え・要望', pt: 'Queixas e pedidos' },
  { k: 'report3', ja: '③家族を含む環境', pt: 'Ambiente (inclui a família)' },
  { k: 'report4', ja: '④前回からの変化・引き継ぎ', pt: 'Mudanças / passagem' },
  { k: 'report5', ja: '⑤体調・服薬・連絡事項', pt: 'Saúde, remédios e avisos' }
];
/* kv-pure */
const KV_NO_INSTRUCTION = '指示なし';
const KV_SV_NAME = '山川美恵子';
function kvAddDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function kvInstructionStatus(ins, today) {
  if (ins.end_date && ins.end_date < today) return '終了';
  if (ins.start_date && ins.start_date > today) return '予定';
  return '有効';
}
function kvActiveInstructions(list, userId, iso) {
  return (list || []).filter(ins => {
    if (!ins || !ins.content || !iso) return false;
    const all = ins.target_user_id == null || ins.target_user_id === '';
    if (!all && Number(ins.target_user_id) !== Number(userId)) return false;
    if (ins.start_date && ins.start_date > iso) return false;
    if (ins.end_date && ins.end_date < iso) return false;
    return true;
  }).sort((a, b) => (a.start_date || '') < (b.start_date || '') ? -1 : (a.start_date || '') > (b.start_date || '') ? 1 : String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0);
}
function kvInstructionIdValue(list) {
  const ids = (list || []).map(i => i.id).filter(Boolean);
  return ids.length ? ids.join(',') : KV_NO_INSTRUCTION;
}
function kvNextInstructionId(list) {
  let max = 0;
  (list || []).forEach(ins => { const m = /^SJ-(\d+)$/.exec(ins.id || ''); if (m) max = Math.max(max, Number(m[1])); });
  const n = String(max + 1);
  return 'SJ-' + n.padStart(Math.max(4, n.length), '0');
}
function kvEndDate(ins, today) {
  const yesterday = kvAddDays(today, -1);
  return (ins.start_date && ins.start_date > yesterday) ? kvAddDays(ins.start_date, -1) : yesterday;
}
function kvHasReport(v) { return [1, 2, 3, 4, 5].some(i => v && v['report' + i]); }
function kvPreviousVisit(visits, currentId, iso, startTime) {
  const rows = (visits || []).filter(v => {
    if (!v || !iso || v.visit_date > iso || !kvHasReport(v)) return false;
    if (currentId != null && currentId !== 'new' && String(v.id) === String(currentId)) return false;
    if (v.visit_date === iso && startTime && (v.start_time || '').slice(0, 5) >= startTime) return false;
    return true;
  });
  rows.sort((a, b) => {
    if (a.visit_date !== b.visit_date) return a.visit_date < b.visit_date ? 1 : -1;
    const as = a.start_time || '', bs = b.start_time || '';
    if (as !== bs) return as < bs ? 1 : -1;
    return (b.id || 0) - (a.id || 0);
  });
  return rows[0] || null;
}
/* /kv-pure */
function kvCss() {
  return `<style>
.kv-wrap{max-width:720px;margin:0 auto}
.kv-card{background:#fff4dc;color:#1c140c;border:4px solid #1a120c;border-radius:0;padding:28px 24px;box-shadow:6px 6px 0 #07060a}
.kv-title{text-align:center;color:#0d6efd;font-size:1.6em;font-weight:700;margin:0 0 4px}
.kv-sub{text-align:center;color:#6c757d;font-size:.85em;margin:0 0 24px}
.kv-field{margin:0 0 22px}
.kv-lab{font-weight:700;font-size:1.15em;margin:0 0 8px;line-height:1.4}
.kv-pt{display:block;font-weight:400;color:#6c757d;font-size:.78em;margin-top:2px}
.kv-req{display:inline-block;margin-left:8px;padding:2px 8px;border-radius:0;border:2px solid #1a120c;background:#ffe8e8;color:#c62828;font-size:.7em;font-weight:700;vertical-align:middle}
.kv-card input[type=text],.kv-card input[type=date],.kv-card input[type=time],.kv-card input[type=month],.kv-card select,.kv-ta,
.kv-admin input[type=text],.kv-admin input[type=date],.kv-admin select,.kv-admin .kv-ta{
  width:100%;box-sizing:border-box;font-size:1.25em;padding:16px 14px;border:3px solid #1a120c;border-radius:0;line-height:1.4;min-height:3.2em;background:#fffef8}
.kv-ta{min-height:6em;resize:vertical;font-family:inherit}
.kv-row{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media(max-width:640px){.kv-row{grid-template-columns:1fr}}
.kv-hint{color:#6c757d;font-size:.9em;margin:6px 0 0}
.kv-actions{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-top:8px}
.kv-actions button{font-size:1.2em;padding:16px 28px;border-radius:0}
.kv-save{background:#0d6efd;color:#fff;border:none;font-weight:700;width:100%}
.kv-check{display:flex;flex-wrap:wrap;gap:20px;font-size:1.15em;margin:12px 0}
.kv-check label{display:flex;align-items:center;gap:8px;font-weight:600}
.kv-check input{width:1.4em;height:1.4em}
.kv-sv{border:4px solid #1a120c;background:#ffe7c2;padding:14px 12px;margin:0 0 22px;box-shadow:4px 4px 0 #07060a}
.kv-sv-title{font-weight:700;font-size:1.15em;color:#8a3b00;margin:10px 0 6px}
.kv-sv-title:first-child{margin-top:0}
.kv-instr{background:#fffef8;border:3px solid #1a120c;border-left:8px solid #e8833a;padding:10px 12px;margin:0 0 8px}
.kv-instr-body{font-size:1.15em;font-weight:700;white-space:pre-wrap;word-break:break-word}
.kv-empty,.kv-prev{background:#fffef8;border:3px solid #1a120c;padding:10px 12px}
.kv-prev-row{padding:4px 0}
.kv-prev-lab{display:block;color:#546e7a;font-size:.8em}
.kv-prev .chg{font-weight:700;color:#9b1c1c}
.kv-admin{margin-top:18px}
.kv-admin .kv-instr button{width:auto;margin-top:8px}
</style>`;
}
const kvIn = (id, v, t = 'text', ex = '') => `<input id="${id}" type="${t}" value="${esc(v ?? '')}" ${ex}>`;
const kvV = id => { const v = $(id).value.trim(); return v === '' ? null : v; };
const kvSched = () => `<a class="back" href="gl:g23" style="display:inline-block;text-decoration:none">📅 土日スケジュール</a>`;
const kvPt = s => `<span class="kv-pt">${s}</span>`;
const kvReq = () => `<span class="kv-req">必須</span>`;
const kvLab = (ja, pt, req) => `<div class="kv-lab">${ja}${req ? kvReq() : ''}${pt ? kvPt(pt) : ''}</div>`;
const kvToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
let kvCtxSeq = 0;

async function renderKinVisit() {
  const back = `<button class="back" onclick="location.hash='kintoun'">← 金斗雲へ</button>`;
  if (DEMO) { $('view').innerHTML = back + `<p>見本モードでは訪問記録は表示しません（ログイン後に開きます）。</p><p>${kvSched()}</p>`; return; }
  $('view').innerHTML = '<p>読み込み中…</p>';
  try {
    $('view').innerHTML = back + (KV.id ? await kvForm(KV.id) : await kvList());
    if (KV.id) kvPaintInstr();
  } catch (e) { $('view').innerHTML = back + `<p>${esc(e.message)}</p>`; }
}
async function kvList() {
  const m = KV.month, next = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 1)).toISOString().slice(0, 10);
  const [vs, us, ins] = await Promise.all([
    sb(`kin_visit?visit_date=gte.${m}-01&visit_date=lt.${next}&select=*&order=visit_date.desc,start_time`),
    sb('kin_user?select=id,name&order=name'),
    sb('kin_instruction?select=*&order=id').catch(() => null)
  ]);
  KV.users = us; KV.instructions = ins || []; KV.instrMissing = ins === null;
  const nm = Object.fromEntries(us.map(u => [u.id, u.name]));
  const rows = vs.map(v => `<tr><td>${esc(v.visit_date)}</td><td>${esc(nm[v.user_id] || '')}</td><td>${v.staff_name ? esc(v.staff_name) : '<span style="color:#c60">（未入力）</span>'}</td><td>${esc(v.service)}</td><td>${esc(v.start_time.slice(0, 5))}〜${esc(v.end_time.slice(0, 5))}</td><td>${v.actual_minutes}分</td><td>${esc(v.addition || '')}</td><td>${v.sign_status === '署名済み' ? '✅' : '⬜未署名'}</td><td>${v.staff_confirmed ? '職✔' : ''}${v.sab_confirmed ? ' サ✔' : ''}</td><td><button onclick="KV.id=${v.id};renderKinVisit()">開く</button></td></tr>`).join('');
  return `<h3>金斗雲 訪問記録</h3><p>月 <input type="month" id="kv_m" value="${esc(m)}" onchange="KV.month=this.value||KV.month;renderKinVisit()"> <button onclick="KV.id='new';renderKinVisit()">＋訪問を追加</button> <button class="back" onclick="location.hash='kintoun/check'">✅記録・署名チェック／署名リンク発行へ</button> ${kvSched()}</p>` +
    (vs.length ? `<table class="tbl"><tr><th>提供日</th><th>利用者</th><th>職員</th><th>種別</th><th>時間</th><th>実時間</th><th>加算</th><th>署名</th><th>確認</th><th></th></tr>${rows}</table><p>${vs.length}件／未署名 ${vs.filter(v => v.sign_status !== '署名済み').length}件</p>` : '<p>この月の記録はありません。</p>') +
    kvCss() + kvInstrAdmin(us, ins);
}
function kvInstrAdmin(us, ins) {
  if (ins === null) return `<div class="card kv-admin"><b>サ責からの指示</b><p class="kv-hint">指示の表がまだありません。supabase/kin_instruction.sql を適用すると、ここで登録できます。ヘルパーの記入欄にはなりません。</p></div>`;
  const today = kvToday();
  const nm = Object.fromEntries(us.map(u => [u.id, u.name]));
  const opts = `<option value="">全員</option>` + us.map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('');
  const card = i => {
    const st = kvInstructionStatus(i, today);
    const who = i.target_user_id == null ? '全員' : (nm[i.target_user_id] || ('利用者' + i.target_user_id));
    const period = `${i.start_date || '開始日なし'}〜${i.end_date || '継続'}`;
    const end = st === '終了' || !/^SJ-\d+$/.test(i.id) ? '' : ` <button class="back" onclick="kvEndInstr('${i.id}')">終了</button>`;
    return `<div class="kv-instr"><div class="kv-instr-body">${esc(i.content)}</div><div class="kv-hint">${esc(i.id)}・${esc(who)}・${esc(period)}・${esc(st)}・${esc(i.instructed_by || '')}</div>${end}</div>`;
  };
  const live = ins.filter(i => kvInstructionStatus(i, today) !== '終了');
  const ended = ins.filter(i => kvInstructionStatus(i, today) === '終了');
  return `<details class="kv-admin"><summary>サ責からの指示（登録・終了）</summary>
    <p class="kv-hint">ヘルパーの訪問記録では<b>表示だけ</b>です。毎回書かせません。内容が変わったときだけ、ここで登録するか、今の指示を終了して新しく登録します。指示者は ${esc(KV_SV_NAME)}（固定）です。</p>
    <div class="kv-field">${kvLab('対象', '')}<select id="ki_target">${opts}</select></div>
    <div class="kv-row">
      <div class="kv-field">${kvLab('有効開始日', '')}${kvIn('ki_start', today, 'date')}</div>
      <div class="kv-field">${kvLab('有効終了日（空なら継続）', '')}${kvIn('ki_end', '', 'date')}</div>
    </div>
    <div class="kv-field">${kvLab('指示内容', '')}<textarea id="ki_content" class="kv-ta" rows="3" maxlength="2000" placeholder="例: 水分をこまめにすすめる"></textarea></div>
    <p><button onclick="kvAddInstr()">この指示を登録する</button> <span id="ki_msg" class="kv-hint"></span></p>
    ${live.length ? live.map(card).join('') : '<p class="note">有効な指示はありません（ヘルパー画面には「指示なし」と出ます）</p>'}
    ${ended.length ? `<details><summary>終了した指示（${ended.length}件）</summary>${ended.map(card).join('')}</details>` : ''}
  </details>`;
}
async function kvAddInstr() {
  const msg = $('ki_msg'); if (!msg) return;
  const content = $('ki_content').value.trim();
  const target = $('ki_target').value;
  const start = $('ki_start').value || kvToday();
  const end = $('ki_end').value;
  if (!content) { msg.textContent = '指示内容を入力してください'; return; }
  if (end && end < start) { msg.textContent = '有効終了日が開始日より前になっています'; return; }
  const who = target ? ($('ki_target').selectedOptions[0] || {}).textContent : '全員';
  if (!confirm(`この指示を登録します（指示者：${KV_SV_NAME}）\n対象：${who}\n期間：${start} 〜 ${end || '継続'}`)) return;
  const id = kvNextInstructionId(KV.instructions);
  try {
    await sb('kin_instruction', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ id, target_user_id: target ? +target : null, start_date: start, end_date: end || null, content: content.slice(0, 2000), instructed_by: KV_SV_NAME }) });
    renderKinVisit();
  } catch (e) { msg.textContent = e.message; }
}
async function kvEndInstr(id) {
  const ins = (KV.instructions || []).find(x => x.id === id);
  if (!ins) return;
  if (!confirm(`指示 ${id} を終了します。今日からヘルパー画面に出なくなります。よろしいですか？`)) return;
  const today = kvToday();
  try {
    await sb(`kin_instruction?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ end_date: kvEndDate(ins, today), ended_at: new Date().toISOString() }) });
    renderKinVisit();
  } catch (e) { alert(e.message); }
}
async function kvForm(id) {
  const [us, vs, ins] = await Promise.all([
    sb('kin_user?select=id,name&order=name'),
    id === 'new' ? Promise.resolve([{}]) : sb(`kin_visit?id=eq.${id}&select=*`),
    sb('kin_instruction?select=*&order=id').catch(() => null)
  ]);
  const v = vs[0]; if (!v) return '<p>見つかりません</p>';
  KV.users = us; KV.instructions = ins || []; KV.instrMissing = ins === null; KV.visit = v; KV.ctx = null;
  const today = kvToday();
  const reports = KV_REPORT.map(r => `<div class="kv-field">${kvLab(r.ja, r.pt)}<textarea id="kv_${r.k}" class="kv-ta" rows="3">${esc(v[r.k] ?? '')}</textarea></div>`).join('');
  return kvCss() + `<div class="kv-wrap"><div class="kv-card">
  <h3 class="kv-title">サービス実施記録入力</h3>
  <p class="kv-sub">Registro de prestação de serviço${id === 'new' ? '（新規）' : ''}</p>

  <div class="kv-field">${kvLab('サービス提供日', 'Data do serviço', true)}${kvIn('kv_visit_date', v.visit_date || today, 'date', 'onchange="kvPaintInstr()"')}</div>
  <div class="kv-field">${kvLab('担当ヘルパー名', 'Nome do cuidador')}${kvIn('kv_staff_name', v.staff_name)}<p class="kv-hint">空欄のまま保存できます</p></div>
  <div class="kv-field">${kvLab('利用者氏名', 'Nome do usuário', true)}<select id="kv_user_id" onchange="kvPaintInstr()">${us.map(u => `<option value="${u.id}" ${u.id === v.user_id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></div>

  <div class="kv-sv" id="kv_sv">
    <div class="kv-sv-title">サ責からの指示${kvPt('Instruções da responsável')}</div>
    <div id="kv_instr"><p class="kv-hint">読み込み中…</p></div>
    <div class="kv-sv-title">前回の報告${kvPt('Último relatório')}</div>
    <div id="kv_prev">—</div>
    <p class="kv-hint" id="kv_sv_note"></p>
  </div>

  <div class="kv-field">${kvLab('サービス区分', 'Tipo de serviço', true)}<select id="kv_service">${KL_SVC.map(s => `<option ${s === (v.service || '身体介護') ? 'selected' : ''}>${s}</option>`).join('')}</select></div>

  <div class="kv-row">
    <div class="kv-field">${kvLab('開始時間', 'Horário de início', true)}${kvIn('kv_start_time', (v.start_time || '').slice(0, 5), 'time', 'onchange="kvPaintInstr()"')}</div>
    <div class="kv-field">${kvLab('終了時間', 'Horário de término', true)}${kvIn('kv_end_time', (v.end_time || '').slice(0, 5), 'time')}</div>
  </div>
  <div class="kv-field">${kvLab('実時間（自動）', 'Duração')}<input value="${v.actual_minutes != null ? v.actual_minutes + '分' : '保存時に自動計算'}" disabled></div>

  <div class="kv-field">${kvLab('具体的な提供内容', 'Conteúdo do serviço', true)}<textarea id="kv_content" class="kv-ta" rows="5" placeholder="例: 整容・食事支援、入浴介助">${esc(v.content ?? '')}</textarea></div>
  <div class="kv-field">${kvLab('特記事項・申し送り', 'Observações / encaminhamento')}<textarea id="kv_note" class="kv-ta" rows="3">${esc(v.note ?? '')}</textarea></div>

  <div class="kv-field"><div class="kv-lab">訪問後の報告（サ責へ）${kvPt('Relatório após a visita')}</div>
    <p class="kv-hint">変わりがなければ「変化なし」と書いてください。気づいたことがあれば具体的に。</p></div>
  ${reports}

  <div class="kv-field">${kvLab('加算', 'Adicionais')}${kvIn('kv_addition', v.addition)}<p class="kv-hint">緊急時対応・初回加算など</p></div>
  <div class="kv-field">${kvLab('署名困難の理由', 'Motivo (não consegue assinar)')}${kvIn('kv_sign_reason', v.sign_reason)}</div>
  <div class="kv-field">${kvLab('後日署名', 'Assinar depois')}${kvIn('kv_late_signed', v.late_signed)}</div>

  <p style="font-size:1.1em">署名：${v.sign_status || '未署名'}${v.signed_at ? '（' + esc(new Date(v.signed_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })) + '／' + esc(v.signer_kind || '') + '）' : ''}</p>
  <div class="kv-check">
    <label><input type="checkbox" id="kv_staff_confirmed" ${v.staff_confirmed ? 'checked' : ''}> 職員確認</label>
    <label><input type="checkbox" id="kv_sab_confirmed" ${v.sab_confirmed ? 'checked' : ''}> サ責確認</label>
  </div>
  <p class="note">入力日時：${esc(v.recorded_at ? new Date(v.recorded_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '')}／職員確認日時：${esc(v.staff_confirmed_at ? new Date(v.staff_confirmed_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '')}／サ責確認：${esc(v.sv_confirm_1 || '')} ${esc(v.sv_confirm_2 ? new Date(v.sv_confirm_2).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '')} ${esc(v.sv_confirm_3 || '')}${v.signature_url ? ` ／<a href="${esc(v.signature_url)}" target="_blank" rel="noopener">署名画像</a>` : ''}${v.pdf_url ? ` <a href="${esc(v.pdf_url)}" target="_blank" rel="noopener">PDF</a>` : ''}</p>

  <div class="kv-actions"><button class="kv-save" onclick="kvSave('${id}')">保存する</button></div>
  <div class="kv-actions" style="margin-top:16px">
    <button class="back" onclick="KV.id=null;renderKinVisit()">一覧へ</button>
    ${id !== 'new' ? `<button class="back" onclick="kvDel(${id})">削除</button>` : ''}
    <span id="kv_msg"></span>
  </div>
</div></div>`;
}
function kvInstrHtml(list) {
  if (!list.length) return '<div class="kv-empty">今は指示がありません（「指示なし」で記録します）<span class="kv-pt">Sem instruções no momento.</span></div>';
  return list.map(i => {
    const who = i.target_user_id == null || i.target_user_id === '' ? '・全員 / Todos' : '';
    const period = (i.start_date || '') + '〜' + (i.end_date || '継続');
    return `<div class="kv-instr"><div class="kv-instr-body">${esc(i.content)}</div><div class="kv-hint">${esc(i.id)}${who}・${esc(period)}・${esc(i.instructed_by || '')}</div></div>`;
  }).join('');
}
function kvPrevHtml(p) {
  if (!p) return '<div class="kv-prev">前回の報告はありません<span class="kv-pt">Sem relatório anterior.</span></div>';
  const when = `${(p.visit_date || '').slice(5).replace('-', '/')} ${(p.start_time || '').slice(0, 5)}〜${(p.end_time || '').slice(0, 5)}・${p.staff_name || ''}`;
  const rows = KV_REPORT.map(r => {
    const val = p[r.k] || '';
    return `<div class="kv-prev-row"><span class="kv-prev-lab">${esc(r.ja)} / ${esc(r.pt)}</span><span class="${val && val !== '変化なし' ? 'chg' : ''}">${esc(val || '—')}</span></div>`;
  }).join('');
  const cmt = p.sv_confirm_3 ? `<div class="kv-prev-row"><span class="kv-prev-lab">サ責コメント / Comentário da responsável</span><b>${esc(p.sv_confirm_3)}</b></div>` : '';
  return `<div class="kv-prev"><div class="kv-hint">${esc(when)}</div>${rows}${cmt}</div>`;
}
async function kvPaintInstr() {
  const seq = ++kvCtxSeq;
  const box = $('kv_instr'), prev = $('kv_prev'), note = $('kv_sv_note');
  if (!box || !prev) return;
  const uid = +($('kv_user_id') && $('kv_user_id').value);
  const date = ($('kv_visit_date') && $('kv_visit_date').value) || '';
  const start = ($('kv_start_time') && $('kv_start_time').value) || '';
  if (!uid || !date) {
    KV.ctx = { ready: false, value: null };
    box.innerHTML = '<p class="kv-hint">利用者と提供日を選ぶと、サ責からの指示と前回の報告が出ます。</p>';
    prev.textContent = '—';
    if (note) note.textContent = '';
    return;
  }
  if (KV.instrMissing) {
    KV.ctx = { ready: false, value: null };
    box.innerHTML = '<div class="kv-empty">指示の表がまだありません。一覧の登録は、SQL適用後に使えます。この欄は記入しません。</div>';
    if (note) note.textContent = '';
  } else {
    const active = kvActiveInstructions(KV.instructions, uid, date);
    const value = kvInstructionIdValue(active);
    KV.ctx = { ready: true, value };
    box.innerHTML = kvInstrHtml(active);
    if (note) {
      const stored = KV.visit && KV.visit.instruction_id;
      if (KV.id === 'new') note.textContent = '表示だけです。毎回書く必要はありません。保存すると、上の指示IDが自動で記録されます。';
      else if (!stored) note.textContent = 'この記録には確認した指示IDがありません。上は、その提供日に有効な指示です（保存しても指示IDは書き換えません）。';
      else if (stored === value) note.textContent = '確認した指示ID：' + stored + '。この欄は表示だけで、保存しても書き換えません。';
      else note.textContent = 'この記録の確認ID：' + stored + '。上は、その提供日にいま有効な指示です（保存しても確認IDは書き換えません）。';
    }
  }
  prev.innerHTML = '<p class="kv-hint">読み込み中…</p>';
  try {
    const rows = await sb(`kin_visit?user_id=eq.${uid}&visit_date=lte.${date}&select=id,visit_date,start_time,end_time,staff_name,report1,report2,report3,report4,report5,sv_confirm_3&order=visit_date.desc,start_time.desc&limit=12`);
    if (seq !== kvCtxSeq) return;
    prev.innerHTML = kvPrevHtml(kvPreviousVisit(rows, KV.id, date, start));
  } catch (e) {
    if (seq !== kvCtxSeq) return;
    prev.innerHTML = `<p class="kv-hint">${esc(e.message)}</p>`;
  }
}
async function kvSave(id) {
  const b = { visit_date: kvV('kv_visit_date'), user_id: +$('kv_user_id').value, staff_name: kvV('kv_staff_name'), service: $('kv_service').value, start_time: kvV('kv_start_time'), end_time: kvV('kv_end_time'), staff_confirmed: $('kv_staff_confirmed').checked, sab_confirmed: $('kv_sab_confirmed').checked, updated_at: new Date().toISOString() };
  ['addition', 'sign_reason', 'late_signed', 'content', 'note', 'report1', 'report2', 'report3', 'report4', 'report5'].forEach(k => b[k] = kvV('kv_' + k));
  if (id === 'new' && KV.ctx && KV.ctx.ready) b.instruction_id = KV.ctx.value;
  if (!b.visit_date || !b.start_time || !b.end_time) return $('kv_msg').textContent = '提供日・開始・終了は必須です';
  if (b.end_time <= b.start_time) return $('kv_msg').textContent = '終了は開始より後にしてください（日またぎは不可）';
  try { await sb(id === 'new' ? 'kin_visit' : `kin_visit?id=eq.${id}`, { method: id === 'new' ? 'POST' : 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(b) }); KV.id = null; renderKinVisit(); } catch (e) { $('kv_msg').textContent = e.message; }
}
async function kvDel(id) { if (!confirm('この訪問記録を削除しますか？')) return; try { await sb(`kin_visit?id=eq.${id}`, { method: 'DELETE' }); KV.id = null; renderKinVisit(); } catch (e) { alert(e.message); } }
