// 管理職からの報告（管理職→会長）。1行か「ふだんどおり問題なし」。データ: mgr_report（supabase/mgr_report.sql）
const MG = { kinds: ['報告', '相談', '決裁依頼', '緊急'] };
const mgOffices = () => (C.offices || []).map(o => o.name);
function mgRow(r, nm, chair) {
  const d = new Date(r.created_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  return `<div class="card"${r.kind === '緊急' && r.status === 'open' ? ' style="border-left:6px solid #c0392b"' : ''}><small>${esc(d)}　${esc(r.office || '')}　${chair && nm ? esc(nm[r.author] || '') + '　' : ''}<b>${esc(r.kind)}</b>${r.status === 'done' ? '　✅確認済み' : ''}</small>
    <p style="font-size:17px;margin:4px 0">${r.no_problem ? 'ふだんどおり問題なし' : esc(r.body || '')}</p>${chair && r.status === 'open' ? `<button onclick="mgDone(${r.id})">確認した</button>` : ''}</div>`;
}
async function renderMgr() {
  const back = `<button class="back" onclick="location.hash=''">← 事業所えらびへ</button>`;
  if (DEMO) return $('view').innerHTML = back + '<h3>管理職からの報告</h3>' + demoNote() + '<p>見本モードでは表示しません。</p>';
  $('view').innerHTML = '<p>読み込み中…</p>';
  try {
    const rows = await sb('mgr_report?order=created_at.desc&limit=30');
    const defOff = (typeof C.offices !== 'undefined' && C.offices[0]) ? C.offices[0].name : '';
    $('view').innerHTML = back + `<h3>管理職からの報告</h3>
      <div class="card"><button onclick="mgSend(true)" style="font-size:20px;padding:14px 24px;width:100%">ふだんどおり問題なし</button>
      <p>または1行：<textarea id="mg_b" rows="3" maxlength="2000" style="width:100%;font-size:16px" placeholder="報告・相談したいこと"></textarea></p>
      <button onclick="mgSend(false)" style="font-size:18px;padding:10px 24px">送る</button> <span id="mg_m" class="note"></span></div>
      <h4>これまでの報告</h4>${rows.map(r => mgRow(r)).join('') || '<p>まだありません。</p>'}`;
  } catch (e) { $('view').innerHTML = back + `<p>${esc(e.message)}</p>`; }
}
async function mgSend(np) {
  const b = $('mg_b').value.trim(), m = $('mg_m');
  if (!np && !b) { m.textContent = '1行入れるか「ふだんどおり問題なし」を押してください。'; return; }
  try { await sb('mgr_report', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ office: localStorage.getItem('mg_o') || (C.offices && C.offices[0] ? C.offices[0].name : null), kind: '報告', body: np ? null : b, no_problem: np }) });
    m.textContent = '送りました'; setTimeout(renderMgr, 700); } catch (e) { m.textContent = e.message; }
}
async function mgDone(id) { try { await sb('mgr_report?id=eq.' + id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'done', done_at: new Date().toISOString() }) }); renderChair(); } catch (e) { alert(e.message); } }
// 会長ページの下に「管理職からの報告」（未確認）を足す
const _mgRC = typeof renderChair === 'function' ? renderChair : null;
if (_mgRC) renderChair = async function () {
  await _mgRC();
  if (!$('view') || !CH.ok) return;
  try {
    let nm = {}; try { nm = Object.fromEntries((await srRpc('staff_roster')).map(r => [r.user_id, r.name])); } catch (e) { }
    const rows = await sb('mgr_report?status=eq.open&order=created_at.desc&limit=50');
    $('view').insertAdjacentHTML('beforeend', `<h3>管理職からの報告（未確認 ${rows.length}）</h3>${rows.map(r => mgRow(r, nm, true)).join('') || '<p>ありません。</p>'}`);
  } catch (e) { }
};
