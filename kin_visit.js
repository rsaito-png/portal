// 金斗雲 訪問記録 (#kintoun/visit)。GAS「サービス実施記録入力」に準じた大きな縦レイアウト。
const KV = { id: null, month: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 7) };
const KV_REPORT = [
  { k: 'report1', ja: '①意欲', pt: 'Disposição / motivação' },
  { k: 'report2', ja: '②訴え・要望', pt: 'Queixas e pedidos' },
  { k: 'report3', ja: '③家族を含む環境', pt: 'Ambiente (inclui a família)' },
  { k: 'report4', ja: '④前回からの変化・引き継ぎ', pt: 'Mudanças / passagem' },
  { k: 'report5', ja: '⑤体調・服薬・連絡事項', pt: 'Saúde, remédios e avisos' }
];
const kvIn = (id, v, t = 'text', ex = '') => `<input id="${id}" type="${t}" value="${esc(v ?? '')}" ${ex}>`;
const kvV = id => { const v = $(id).value.trim(); return v === '' ? null : v; };
const kvSched = () => `<a class="back" href="gl:g23" style="display:inline-block;text-decoration:none">📅 土日スケジュール</a>`;
const kvPt = s => `<span class="kv-pt">${s}</span>`;
const kvReq = () => `<span class="kv-req">必須</span>`;
const kvLab = (ja, pt, req) => `<div class="kv-lab">${ja}${req ? kvReq() : ''}${pt ? kvPt(pt) : ''}</div>`;

async function renderKinVisit() {
  const back = `<button class="back" onclick="location.hash='kintoun'">← 金斗雲へ</button>`;
  if (DEMO) { $('view').innerHTML = back + `<p>見本モードでは訪問記録は表示しません（ログイン後に開きます）。</p><p>${kvSched()}</p>`; return; }
  $('view').innerHTML = '<p>読み込み中…</p>';
  try { $('view').innerHTML = back + (KV.id ? await kvForm(KV.id) : await kvList()); } catch (e) { $('view').innerHTML = back + `<p>${esc(e.message)}</p>`; }
}
async function kvList() {
  const m = KV.month, next = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 1)).toISOString().slice(0, 10);
  const [vs, us] = await Promise.all([sb(`kin_visit?visit_date=gte.${m}-01&visit_date=lt.${next}&select=*&order=visit_date.desc,start_time`), sb('kin_user?select=id,name&order=name')]);
  const nm = Object.fromEntries(us.map(u => [u.id, u.name]));
  const rows = vs.map(v => `<tr><td>${esc(v.visit_date)}</td><td>${esc(nm[v.user_id] || '')}</td><td>${v.staff_name ? esc(v.staff_name) : '<span style="color:#c60">（未入力）</span>'}</td><td>${esc(v.service)}</td><td>${esc(v.start_time.slice(0, 5))}〜${esc(v.end_time.slice(0, 5))}</td><td>${v.actual_minutes}分</td><td>${esc(v.addition || '')}</td><td>${v.sign_status === '署名済み' ? '✅' : '⬜未署名'}</td><td>${v.staff_confirmed ? '職✔' : ''}${v.sab_confirmed ? ' サ✔' : ''}</td><td><button onclick="KV.id=${v.id};renderKinVisit()">開く</button></td></tr>`).join('');
  return `<h3>金斗雲 訪問記録</h3><p>月 <input type="month" id="kv_m" value="${esc(m)}" onchange="KV.month=this.value||KV.month;renderKinVisit()"> <button onclick="KV.id='new';renderKinVisit()">＋訪問を追加</button> <button class="back" onclick="location.hash='kintoun/check'">✅記録・署名チェック／署名リンク発行へ</button> ${kvSched()}</p>` +
    (vs.length ? `<table class="tbl"><tr><th>提供日</th><th>利用者</th><th>職員</th><th>種別</th><th>時間</th><th>実時間</th><th>加算</th><th>署名</th><th>確認</th><th></th></tr>${rows}</table><p>${vs.length}件／未署名 ${vs.filter(v => v.sign_status !== '署名済み').length}件</p>` : '<p>この月の記録はありません。</p>');
}
async function kvForm(id) {
  const [us, vs] = await Promise.all([sb('kin_user?select=id,name&order=name'), id === 'new' ? Promise.resolve([{}]) : sb(`kin_visit?id=eq.${id}&select=*`)]);
  const v = vs[0]; if (!v) return '<p>見つかりません</p>';
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const reports = KV_REPORT.map(r => `<div class="kv-field">${kvLab(r.ja, r.pt)}<textarea id="kv_${r.k}" class="kv-ta" rows="3">${esc(v[r.k] ?? '')}</textarea></div>`).join('');
  return `<style>
.kv-wrap{max-width:720px;margin:0 auto}
.kv-card{background:#fff;border-radius:16px;padding:28px 24px;box-shadow:0 4px 16px #0001}
.kv-title{text-align:center;color:#0d6efd;font-size:1.6em;font-weight:700;margin:0 0 4px}
.kv-sub{text-align:center;color:#6c757d;font-size:.85em;margin:0 0 24px}
.kv-field{margin:0 0 22px}
.kv-lab{font-weight:700;font-size:1.15em;margin:0 0 8px;line-height:1.4}
.kv-pt{display:block;font-weight:400;color:#6c757d;font-size:.78em;margin-top:2px}
.kv-req{display:inline-block;margin-left:8px;padding:2px 8px;border-radius:6px;background:#ffe8e8;color:#c62828;font-size:.7em;font-weight:700;vertical-align:middle}
.kv-card input[type=text],.kv-card input[type=date],.kv-card input[type=time],.kv-card input[type=month],.kv-card select,.kv-ta{
  width:100%;box-sizing:border-box;font-size:1.25em;padding:16px 14px;border:1px solid #ced4da;border-radius:10px;line-height:1.4;min-height:3.2em}
.kv-ta{min-height:6em;resize:vertical;font-family:inherit}
.kv-row{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media(max-width:640px){.kv-row{grid-template-columns:1fr}}
.kv-hint{color:#6c757d;font-size:.9em;margin:6px 0 0}
.kv-actions{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-top:8px}
.kv-actions button{font-size:1.2em;padding:16px 28px;border-radius:10px}
.kv-save{background:#0d6efd;color:#fff;border:none;font-weight:700;width:100%}
.kv-check{display:flex;flex-wrap:wrap;gap:20px;font-size:1.15em;margin:12px 0}
.kv-check label{display:flex;align-items:center;gap:8px;font-weight:600}
.kv-check input{width:1.4em;height:1.4em}
</style>
<div class="kv-wrap"><div class="kv-card">
  <h3 class="kv-title">サービス実施記録入力</h3>
  <p class="kv-sub">Registro de prestação de serviço${id === 'new' ? '（新規）' : ''}</p>

  <div class="kv-field">${kvLab('サービス提供日', 'Data do serviço', true)}${kvIn('kv_visit_date', v.visit_date || today, 'date')}</div>
  <div class="kv-field">${kvLab('担当ヘルパー名', 'Nome do cuidador')}${kvIn('kv_staff_name', v.staff_name)}${`<p class="kv-hint">空欄のまま保存できます（後日入力可）</p>`}</div>
  <div class="kv-field">${kvLab('利用者氏名', 'Nome do usuário', true)}<select id="kv_user_id">${us.map(u => `<option value="${u.id}" ${u.id === v.user_id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></div>
  <div class="kv-field">${kvLab('サービス区分', 'Tipo de serviço', true)}<select id="kv_service">${KL_SVC.map(s => `<option ${s === (v.service || '身体介護') ? 'selected' : ''}>${s}</option>`).join('')}</select></div>

  <div class="kv-row">
    <div class="kv-field">${kvLab('開始時間', 'Horário de início', true)}${kvIn('kv_start_time', (v.start_time || '').slice(0, 5), 'time')}</div>
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
  <div class="kv-field">${kvLab('指示ID', '')}${kvIn('kv_instruction_id', v.instruction_id)}</div>

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
async function kvSave(id) {
  const b = { visit_date: kvV('kv_visit_date'), user_id: +$('kv_user_id').value, staff_name: kvV('kv_staff_name'), service: $('kv_service').value, start_time: kvV('kv_start_time'), end_time: kvV('kv_end_time'), staff_confirmed: $('kv_staff_confirmed').checked, sab_confirmed: $('kv_sab_confirmed').checked, updated_at: new Date().toISOString() };
  ['addition', 'sign_reason', 'late_signed', 'instruction_id', 'content', 'note', 'report1', 'report2', 'report3', 'report4', 'report5'].forEach(k => b[k] = kvV('kv_' + k));
  if (!b.visit_date || !b.start_time || !b.end_time) return $('kv_msg').textContent = '提供日・開始・終了は必須です';
  if (b.end_time <= b.start_time) return $('kv_msg').textContent = '終了は開始より後にしてください（日またぎは不可）';
  try { await sb(id === 'new' ? 'kin_visit' : `kin_visit?id=eq.${id}`, { method: id === 'new' ? 'POST' : 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(b) }); KV.id = null; renderKinVisit(); } catch (e) { $('kv_msg').textContent = e.message; }
}
async function kvDel(id) { if (!confirm('この訪問記録を削除しますか？')) return; try { await sb(`kin_visit?id=eq.${id}`, { method: 'DELETE' }); KV.id = null; renderKinVisit(); } catch (e) { alert(e.message); } }
