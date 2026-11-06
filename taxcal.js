// 税カレンダー（#taxcal）。会長と法人管理者（事務含む）だけ見られる（supabase/tax_calendar.sql の RLS）。
// 元は Drive の税務カレンダーシート（2026-11-05 にワンショット移植。以後はこちらが正）。通知はしない、掲載のみ。
const tcE = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TC_KIND = { monthly_tax: ['月次', '#2e6b4f'], annual: ['年次', '#8a4b0f'], other: ['その他', '#666'] };
let TC_PAST = false;
let TC_EDIT = null;
function tcToday() { return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); }
async function renderTaxCal() {
  const back = `<button class="back" onclick="location.hash='soumu'">← 総務へ</button>`;
  if (DEMO) return $('view').innerHTML = back + '<h3>🧾 税カレンダー</h3><p>見本モードでは表示しません。</p>';
  $('view').innerHTML = back + '<p>読み込み中…</p>';
  let rows = []; try { rows = await sb('tax_calendar?select=*&order=due_date.asc,id.asc'); } catch (e) {}
  if (!rows.length) return $('view').innerHTML = back + '<h3>🧾 税カレンダー</h3><p>会長と事務（法人管理者）だけが見られます。</p>';
  const today = tcToday(), soon = new Date(Date.now() + 9 * 3600e3 + 14 * 864e5).toISOString().slice(0, 10);
  const list = rows.filter(r => TC_PAST || r.due_date >= today || !r.done);
  const next = rows.filter(r => !r.done && r.due_date >= today).slice(0, 1)[0];
  const over = rows.filter(r => !r.done && r.due_date < today);
  const wd = d => '日月火水木金土'[new Date(d + 'T00:00:00+09:00').getDay()];
  const days = d => Math.round((new Date(d) - new Date(today)) / 864e5);
  const byM = {}; list.forEach(r => (byM[r.due_date.slice(0, 7)] ||= []).push(r));
  const kindOpts = (cur) => Object.keys(TC_KIND).map(k => `<option value="${k}"${k === cur ? ' selected' : ''}>${TC_KIND[k][0]}</option>`).join('');
  const form = (r) => {
    const isNew = !r;
    const id = isNew ? 'new' : r.id;
    return `<div class="card" style="margin:8px 0;padding:10px;border:2px solid #2e6b4f">
      <h4>${isNew ? '予定を追加' : '予定を直す'}</h4>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px">
        <label>期限日<br><input id="tc_due_${id}" type="date" value="${tcE(r && r.due_date || '')}"></label>
        <label>区分<br><select id="tc_kind_${id}">${kindOpts(r && r.kind || 'other')}</select></label>
        <label>タイトル<br><input id="tc_title_${id}" value="${tcE(r && r.title || '')}"></label>
        <label>担当<br><input id="tc_assignee_${id}" value="${tcE(r && r.assignee || '')}"></label>
        <label>提出先<br><input id="tc_agency_${id}" value="${tcE(r && r.agency || '')}"></label>
        <label>メモ<br><input id="tc_note_${id}" value="${tcE(r && r.note || '')}"></label>
      </div>
      <p><button onclick="tcSave('${id}')">保存</button>
        <button class="back" onclick="TC_EDIT=null;renderTaxCal()">やめる</button>
        ${isNew ? '' : `<button class="back" onclick="tcDel(${r.id})">削除</button>`}
        <span id="tc_msg_${id}" class="note"></span></p></div>`;
  };
  const row = r => {
    const k = TC_KIND[r.kind] || TC_KIND.other, n = days(r.due_date);
    const hot = !r.done && r.due_date <= soon, late = !r.done && n < 0;
    if (TC_EDIT === r.id) return form(r);
    return `<div class="card" style="margin:6px 0;padding:8px 10px;border-left:6px solid ${late ? '#c00' : hot ? '#e08a00' : k[1]};${r.done ? 'opacity:.55' : ''}">
      <div style="display:flex;gap:8px;align-items:baseline;flex-wrap:wrap"><b style="min-width:6.5em">${+r.due_date.slice(5, 7)}/${+r.due_date.slice(8)}（${wd(r.due_date)}）</b>
      <span style="font-size:12px;color:#fff;background:${k[1]};padding:1px 6px;border-radius:8px">${k[0]}</span>
      ${r.done ? '<span style="color:#2e6b4f">✅ 済</span>' : late ? `<b style="color:#c00">期限切れ ${-n}日</b>` : hot ? `<b style="color:#e08a00">あと${n}日</b>` : `<small>あと${n}日</small>`}</div>
      <div style="margin:4px 0;font-size:16px">${tcE(r.title)}</div>
      <div style="font-size:13px;color:#555">担当：${tcE(r.assignee || '—')}　提出先：${tcE(r.agency || '—')}${r.note ? `<br>メモ：${tcE(r.note)}` : ''}</div>
      <label style="font-size:13px"><input type="checkbox" ${r.done ? 'checked' : ''} onchange="tcDone(${r.id},this.checked)"> 済</label>
      <button class="inl back" style="margin-left:8px" onclick="TC_EDIT=${r.id};renderTaxCal()">直す</button></div>`;
  };
  $('view').innerHTML = back + `<h3>🧾 税カレンダー</h3>
    <p style="font-size:13px">毎月の源泉所得税・住民税（翌月10日）と、年次の期限（年末調整・法定調書・中間／確定申告・償却資産・労保・算定など）。納付・提出は会長。2週間以内はオレンジ、期限切れは赤。追加・直す・削除は会長と事務。</p>
    ${next ? `<div class="card" style="border:2px solid #e08a00;padding:10px"><b>次の期限</b>：${+next.due_date.slice(5, 7)}/${+next.due_date.slice(8)}（あと${days(next.due_date)}日）　${tcE(next.title)}<br><small>担当：${tcE(next.assignee || '')}</small></div>` : ''}
    ${over.length ? `<p style="color:#c00"><b>期限切れで未済 ${over.length}件</b></p>` : ''}
    <p><label><input type="checkbox" ${TC_PAST ? 'checked' : ''} onchange="TC_PAST=this.checked;renderTaxCal()"> 済んだ過去分も表示</label>
     　<button class="inl" onclick="TC_EDIT='new';renderTaxCal()">＋予定を追加</button></p>
    ${TC_EDIT === 'new' ? form(null) : ''}
    ${Object.keys(byM).map(m => `<h4>${m.slice(0, 4)}年${+m.slice(5)}月</h4>${byM[m].map(row).join('')}`).join('')}
    <p style="font-size:12px;color:#888">旧：Googleシート「税務カレンダー」は2026-11-05に移植済み。今後はこの画面が正です。</p>`;
}
async function tcDone(id, v) {
  try { await sb('tax_calendar?id=eq.' + id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ done: v, updated_at: new Date().toISOString() }) }); renderTaxCal(); } catch (e) { alert('保存できませんでした: ' + e.message); }
}
async function tcSave(id) {
  const isNew = id === 'new';
  const msg = document.getElementById('tc_msg_' + id);
  const due = document.getElementById('tc_due_' + id).value;
  const title = (document.getElementById('tc_title_' + id).value || '').trim();
  if (!due || !title) { if (msg) msg.textContent = '期限日とタイトルは必須です'; return; }
  const body = {
    due_date: due,
    title,
    kind: document.getElementById('tc_kind_' + id).value || 'other',
    assignee: (document.getElementById('tc_assignee_' + id).value || '').trim() || null,
    agency: (document.getElementById('tc_agency_' + id).value || '').trim() || null,
    note: (document.getElementById('tc_note_' + id).value || '').trim() || null,
    updated_at: new Date().toISOString()
  };
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
