// 税カレンダー（#taxcal、#taxcal/行id）。会長と法人管理者（事務含む）だけ見られる（supabase/tax_calendar.sql の RLS）。
// 元は Drive の税務カレンダーシート（2026-11-05 移植。以後はこちらが正）。
// 2026-11-27 拡張（supabase/tax_calendar_remind.sql）：リマインド日（期限の5日前）の朝9時に cron「taxcal-remind」が
// 会長の「私への依頼」（staff_todo, source_key=taxcal:行id）を1件だけ作る。済と依頼の完了はDBのトリガーで連動。
// not_needed=true の行は「不要」：薄く・取り消し線、お知らせなし（済とは別）。
// 受付画面は非公開バケット tax-receipts（行id/ファイル）に置き、receipts 列にパスを持つ。振込・納付・送信はしない。
const tcE = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TC_KIND = { monthly_tax: ['月次', '#2e6b4f'], annual: ['年次', '#8a4b0f'], other: ['その他', '#666'] };
const TC_TODO_ST = { open: '未着手', doing: '進行中', done: '完了' };
let TC_PAST = false;
let TC_EDIT = null;
let TC_FOCUS = null;
function tcToday() { return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); }
function tcMinus5(d) { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() - 5); return x.toISOString().slice(0, 10); }
function tcTok() { try { return JSON.parse(localStorage.getItem('sess') || '{}').token || ''; } catch (e) { return ''; } }
function tcPathUrl(p) { return p.split('/').map(encodeURIComponent).join('/'); }
async function renderTaxCal(focus) {
  if (focus !== undefined) TC_FOCUS = focus && /^\d+$/.test(focus) ? +focus : null;
  const back = `<button class="back" onclick="location.hash='soumu'">← 総務へ</button>`;
  if (DEMO) return $('view').innerHTML = back + '<h3>🧾 税カレンダー</h3><p>見本モードでは表示しません。</p>';
  $('view').innerHTML = back + '<p>読み込み中…</p>';
  let rows = []; try { rows = await sb('tax_calendar?select=*&order=due_date.asc,id.asc'); } catch (e) {}
  if (!rows.length) return $('view').innerHTML = back + '<h3>🧾 税カレンダー</h3><p>会長と事務（法人管理者）だけが見られます。</p>';
  const tIds = rows.map(r => r.todo_id).filter(Boolean);
  let todos = {}; try { if (tIds.length) (await sb(`staff_todo?id=in.(${tIds.join(',')})&select=id,status`) || []).forEach(t => todos[t.id] = t.status); } catch (e) {}
  let logs = []; try { logs = await sb('tax_calendar_log?select=at,kind,msg&kind=neq.info&order=at.desc&limit=1') || []; } catch (e) {}
  const today = tcToday(), soon = new Date(Date.now() + 9 * 3600e3 + 14 * 864e5).toISOString().slice(0, 10);
  const list = rows.filter(r => TC_PAST || r.id === TC_FOCUS || (!r.not_needed && (r.due_date >= today || !r.done)) || (r.not_needed && r.due_date >= today));
  const next = rows.filter(r => !r.done && !r.not_needed && r.due_date >= today).slice(0, 1)[0];
  const over = rows.filter(r => !r.done && !r.not_needed && r.due_date < today);
  const wd = d => '日月火水木金土'[new Date(d + 'T00:00:00+09:00').getDay()];
  const md = d => `${+d.slice(5, 7)}/${+d.slice(8)}`;
  const days = d => Math.round((new Date(d) - new Date(today)) / 864e5);
  const byM = {}; list.forEach(r => (byM[r.due_date.slice(0, 7)] ||= []).push(r));
  const kindOpts = (cur) => Object.keys(TC_KIND).map(k => `<option value="${k}"${k === cur ? ' selected' : ''}>${TC_KIND[k][0]}</option>`).join('');
  const inp = (key, id, label, val, type = 'text') => `<label>${label}<br><input id="tc_${key}_${id}" type="${type}" value="${tcE(val || '')}"></label>`;
  const form = (r) => {
    const isNew = !r;
    const id = isNew ? 'new' : r.id;
    return `<div class="card" id="tc_row_${id}" style="margin:8px 0;padding:10px;border:2px solid #2e6b4f">
      <h4>${isNew ? '予定を追加' : '予定を直す'}</h4>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px">
        ${inp('due', id, '期限日', r && r.due_date, 'date')}
        ${inp('remind', id, 'お知らせ日（空なら期限の5日前）', r && r.remind_date, 'date')}
        <label>区分<br><select id="tc_kind_${id}">${kindOpts(r && r.kind || 'other')}</select></label>
        ${inp('title', id, 'タイトル', r && r.title)}
        ${inp('assignee', id, '担当', r && r.assignee)}
        ${inp('agency', id, '提出先・納付先', r && r.agency)}
        ${inp('method', id, '方法（郵便局・e-Taxなど）', r && r.method)}
        ${inp('amount', id, '金額（わかったら総務が書く）', r && r.amount_text)}
        ${inp('note', id, 'メモ', r && r.note)}
        <label><br><input id="tc_nn_${id}" type="checkbox" ${r && r.not_needed ? 'checked' : ''}> 不要（お知らせを出さない）</label>
      </div>
      <p><button onclick="tcSave('${id}')">保存</button>
        <button class="back" onclick="TC_EDIT=null;renderTaxCal()">やめる</button>
        ${isNew ? '' : `<button class="back" onclick="tcDel(${r.id})">削除</button>`}
        <span id="tc_msg_${id}" class="note"></span></p></div>`;
  };
  const row = r => {
    const k = TC_KIND[r.kind] || TC_KIND.other, n = days(r.due_date);
    const nn = !!r.not_needed;
    const hot = !nn && !r.done && r.due_date <= soon, late = !nn && !r.done && n < 0;
    if (TC_EDIT === r.id) return form(r);
    const rc = r.receipts || [];
    const todoSt = r.todo_id ? (TC_TODO_ST[todos[r.todo_id]] || 'あり') : null;
    const focus = r.id === TC_FOCUS;
    return `<div class="card" id="tc_row_${r.id}" style="margin:6px 0;padding:8px 10px;border-left:6px solid ${late ? '#c00' : hot ? '#e08a00' : k[1]};${focus ? 'outline:3px solid #e08a00;' : ''}${nn ? 'opacity:.4;background:#f2f2f2;' : ''}${r.done && !focus && !nn ? 'opacity:.55' : ''}">
      <div style="display:flex;gap:8px;align-items:baseline;flex-wrap:wrap"><b style="min-width:6.5em">${md(r.due_date)}（${wd(r.due_date)}）</b>
      <span style="font-size:12px;color:#fff;background:${k[1]};padding:1px 6px;border-radius:8px">${k[0]}</span>
      ${nn ? '<span style="font-size:12px;color:#fff;background:#999;padding:1px 6px;border-radius:8px">不要</span><small>お知らせは出しません</small>' : r.done ? '<span style="color:#2e6b4f">✅ 済</span>' : late ? `<b style="color:#c00">期限切れ ${-n}日</b>` : hot ? `<b style="color:#e08a00">あと${n}日</b>` : `<small>あと${n}日</small>`}</div>
      <div style="margin:4px 0;font-size:16px${nn ? ';text-decoration:line-through' : ''}">${tcE(r.title)}</div>
      <div style="font-size:13px;color:#555">担当：${tcE(r.assignee || '—')}　提出先：${tcE(r.agency || '—')}<br>
        方法：${tcE(r.method || '要確認')}　金額：${r.amount_text ? tcE(r.amount_text) : '<span style="color:#999">未記入（総務が書く）</span>'}<br>
        お知らせ日：${r.remind_date ? md(r.remind_date) + '（' + wd(r.remind_date) + '）' : '—'}　依頼：${todoSt ? (r.todo_id ? `<a href="#report">${todoSt}</a>` : '') : (!nn && r.remind_date ? 'まだ（お知らせ日の朝に作る）' : '作らない')}
        ${r.note ? `<br>メモ：${tcE(r.note)}` : ''}</div>
      ${r.detail || r.source ? `<details style="font-size:12px;color:#555"><summary>くわしく・根拠</summary>${r.detail ? `<p>${tcE(r.detail)}</p>` : ''}${r.source ? `<p>根拠：${tcE(r.source)}</p>` : ''}</details>` : ''}
      <div style="font-size:13px;margin-top:4px">📎 受付画面：${rc.length ? rc.map((p, i) => `<a href="javascript:void 0" onclick="tcOpen('${tcE(p)}')">${i + 1}枚目</a>`).join('　') : '<span style="color:#999">まだ</span>'}
        <label class="inl back" style="margin-left:8px;cursor:pointer">添付する<input type="file" accept="image/*,application/pdf" style="display:none" onchange="tcUpload(${r.id},this)"></label> <span id="tc_up_${r.id}" class="note"></span></div>
      <label style="font-size:13px"><input type="checkbox" ${r.done ? 'checked' : ''} onchange="tcDone(${r.id},this.checked,${rc.length})"> 済</label>
      <button class="inl back" style="margin-left:8px" onclick="TC_EDIT=${r.id};renderTaxCal()">直す</button></div>`;
  };
  const warn = logs[0] && logs[0].kind !== 'info' ? `<p style="font-size:12px;color:${logs[0].kind === 'error' ? '#c00' : '#8a4b0f'}">お知らせの仕組み：${tcE(logs[0].msg)}（${tcE(new Date(logs[0].at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }))}）</p>` : '';
  $('view').innerHTML = back + `<h3>🧾 税カレンダー</h3>
    <p style="font-size:13px">毎月の源泉所得税・住民税（翌月10日、土日祝は次の平日）と、年次の期限。<b>お知らせ日（ふつうは期限の5日前）の朝9時に、会長の「私への依頼」が自動で1件つきます。</b>納付・提出は会長がします（自動で払ったり送ったりはしません）。金額は総務が書きます。終わったら受付画面を添付して「済」にしてください（「私への依頼」を完了にしても済になります）。2週間以内はオレンジ、期限切れは赤。見られるのは会長と事務だけです。</p>
    ${warn}
    ${next ? `<div class="card" style="border:2px solid #e08a00;padding:10px"><b>次の期限</b>：${md(next.due_date)}（あと${days(next.due_date)}日）　${tcE(next.title)}<br><small>担当：${tcE(next.assignee || '')}</small></div>` : ''}
    ${over.length ? `<p style="color:#c00"><b>期限切れで未済 ${over.length}件</b></p>` : ''}
    <p><label><input type="checkbox" ${TC_PAST ? 'checked' : ''} onchange="TC_PAST=this.checked;renderTaxCal()"> 済んだ過去分も表示</label>
     　<button class="inl" onclick="TC_EDIT='new';renderTaxCal()">＋予定を追加</button></p>
    ${TC_EDIT === 'new' ? form(null) : ''}
    ${Object.keys(byM).map(m => `<h4>${m.slice(0, 4)}年${+m.slice(5)}月</h4>${byM[m].map(row).join('')}`).join('')}
    <p style="font-size:12px;color:#888">旧：Googleシート「税務カレンダー」は2026-11-05に移植済み。今後はこの画面が正です。毎月分は翌年分も自動で足します（祝日は内閣府の祝日表を毎月取り込み）。</p>`;
  if (TC_FOCUS) { const el = document.getElementById('tc_row_' + TC_FOCUS); if (el) el.scrollIntoView({ block: 'center' }); }
}
async function tcDone(id, v, nRc) {
  if (v && !nRc && !confirm('受付画面がまだ添付されていません。このまま「済」にしますか？')) return renderTaxCal();
  try { await sb('tax_calendar?id=eq.' + id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ done: v, updated_at: new Date().toISOString() }) }); renderTaxCal(); } catch (e) { alert('保存できませんでした: ' + e.message); }
}
async function tcUpload(id, input) {
  const f = input.files && input.files[0], m = document.getElementById('tc_up_' + id);
  if (!f) return;
  if (f.size > 10 * 1024 * 1024) { m.textContent = '10MBまでです'; return; }
  m.textContent = '送っています…';
  try {
    const ext = ((f.name.match(/\.([A-Za-z0-9]{1,5})$/) || [])[1] || (f.type === 'application/pdf' ? 'pdf' : 'jpg')).toLowerCase();
    const path = `${id}/${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
    const up = await fetch(C.supabaseUrl + '/storage/v1/object/tax-receipts/' + tcPathUrl(path), { method: 'POST', headers: { apikey: C.supabaseKey, Authorization: 'Bearer ' + tcTok(), 'Content-Type': f.type || 'application/octet-stream', 'x-upsert': 'false' }, body: f });
    if (!up.ok) throw new Error('アップロードできませんでした（' + up.status + '）');
    const cur = await sb(`tax_calendar?id=eq.${id}&select=receipts`);
    const rc = ((cur && cur[0] && cur[0].receipts) || []).concat(path);
    await sb('tax_calendar?id=eq.' + id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ receipts: rc, updated_at: new Date().toISOString() }) });
    TC_FOCUS = id; renderTaxCal();
  } catch (e) { m.textContent = e.message; }
}
async function tcOpen(p) {
  const w = window.open('', '_blank');
  try {
    const r = await fetch(C.supabaseUrl + '/storage/v1/object/sign/tax-receipts/' + tcPathUrl(p), { method: 'POST', headers: { apikey: C.supabaseKey, Authorization: 'Bearer ' + tcTok(), 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 300 }) });
    const j = await r.json(); if (!r.ok || !j.signedURL) throw new Error();
    const u = C.supabaseUrl + '/storage/v1' + j.signedURL; if (w) w.location = u; else location.href = u;
  } catch (e) { if (w) w.close(); alert('開けませんでした'); }
}
async function tcSave(id) {
  const isNew = id === 'new';
  const msg = document.getElementById('tc_msg_' + id);
  const g = k => (document.getElementById(`tc_${k}_${id}`).value || '').trim();
  const due = g('due'), title = g('title');
  if (!due || !title) { if (msg) msg.textContent = '期限日とタイトルは必須です'; return; }
  const body = {
    due_date: due,
    title,
    not_needed: !!(document.getElementById('tc_nn_' + id) || {}).checked,
    kind: document.getElementById('tc_kind_' + id).value || 'other',
    assignee: g('assignee') || null,
    agency: g('agency') || null,
    method: g('method') || null,
    amount_text: g('amount') || null,
    note: g('note') || null,
    updated_at: new Date().toISOString()
  };
  body.remind_date = body.not_needed ? null : (g('remind') || tcMinus5(due));
  try {
    if (isNew) await sb('tax_calendar', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body) });
    else await sb('tax_calendar?id=eq.' + id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body) });
    TC_EDIT = null;
    renderTaxCal();
  } catch (e) { if (msg) msg.textContent = e.message; else alert(e.message); }
}
async function tcDel(id) {
  if (!confirm('この予定を削除しますか？')) return;
  try {
    await sb('tax_calendar?id=eq.' + id, { method: 'DELETE' });
    TC_EDIT = null;
    renderTaxCal();
  } catch (e) { alert(e.message); }
}
