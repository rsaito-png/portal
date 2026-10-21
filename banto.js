// 番頭さん：職員の報連相を受け、AI（Edge Function banto、xAI）がその場で回答 or 会長へ取り次ぐ。
// データ: banto_msg（supabase/banto.sql）。職員は自分の分だけ、会長は全件（RLS）。
const bnE = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const bnT = d => new Date(d).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const bnSt = r => ({ pending: '⏳ 番頭さんが考え中', answered: '✅ 回答ずみ', escalated: '📨 会長に取り次ぎ中', chair_replied: '👑 会長から返事あり', error: '⚠️ エラー' }[r.status] || r.status);
function bnCard(r, chair) {
  return `<div class="card" style="margin:8px 0;padding:10px">
    <div style="font-size:12px;color:#666">${bnT(r.created_at)}　【${bnE(r.kind)}】${chair ? '　' + bnE(r.name || '') : ''}　${bnSt(r)}${r.ai_category ? '　<small>' + bnE(r.ai_category) + '</small>' : ''}</div>
    <div style="white-space:pre-wrap;margin:6px 0">${bnE(r.body)}</div>
    ${r.ai_answer ? `<div style="white-space:pre-wrap;background:#f6f1e6;padding:8px;border-radius:6px">🧑‍💼 番頭さん<br>${bnE(r.ai_answer)}</div>` : ''}
    ${chair && r.ai_summary ? `<div style="font-size:14px;margin-top:6px">📝 要約：${bnE(r.ai_summary)}<br>💡 番頭の意見：${bnE(r.ai_opinion || '')}</div>` : ''}
    ${r.chair_reply ? `<div style="white-space:pre-wrap;background:#fff7d6;padding:8px;border-radius:6px;margin-top:6px">👑 会長より（${bnT(r.chair_replied_at)}）<br>${bnE(r.chair_reply)}</div>` : ''}
    ${chair && r.status === 'escalated' ? `<textarea id="bn_r${r.id}" rows="3" style="width:100%;margin-top:6px" placeholder="職員への返事"></textarea><button onclick="bnReply(${r.id})">返事を送る</button>` : ''}</div>`;
}
async function renderBanto() {
  const back = `<button class="back" onclick="location.hash=''">← 事業所えらびへ</button>`;
  if (DEMO) return $('view').innerHTML = back + '<h3>番頭さん</h3><p>見本モードでは表示しません。</p>';
  $('view').innerHTML = '<p>読み込み中…</p>';
  const s = JSON.parse(localStorage.getItem('sess') || '{}');
  let me = ''; try { me = JSON.parse(atob(s.token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub; } catch (e) { }
  let rows = []; try { rows = await sb('banto_msg?select=*&user_id=eq.' + encodeURIComponent(me) + '&order=created_at.desc&limit=50'); } catch (e) { }
  $('view').innerHTML = back + `<h3>🧑‍💼 番頭さん</h3>
    <p style="font-size:13px">報告・連絡・相談はこちらへどうぞ。番頭さん（AI）がすぐにお返事し、会長の判断が要るものは会長に取り次ぎます。休み・給料・働き方など人事労務の個人的な相談は<a href="#soudan">人事労務の相談所</a>へ。</p>
    <div class="card"><select id="bn_k">${['報告', '連絡', '相談'].map(k => `<option${k === '相談' ? ' selected' : ''}>${k}</option>`).join('')}</select>
    <input id="bn_n" placeholder="名前" style="margin:6px 0;width:100%">
    <textarea id="bn_b" rows="5" maxlength="4000" style="width:100%" placeholder="書いて送ってください"></textarea><button id="bn_go" onclick="bnSend()">番頭さんに送る</button></div>
    <h4>自分のやり取り</h4><div id="bn_list">${rows.map(r => bnCard(r)).join('') || '<p>まだありません。</p>'}</div>`;
  $('bn_n').value = s.email || '';
  if (rows.some(r => r.status === 'pending')) setTimeout(() => { if (location.hash === '#banto') renderBanto(); }, 5000);
}
async function bnSend() {
  const b = $('bn_b').value.trim(); if (!b) return alert('中身を書いてください');
  $('bn_go').disabled = true;
  try { await sb('banto_msg', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ kind: $('bn_k').value, body: b, name: $('bn_n').value.trim() || null }) }); renderBanto(); }
  catch (e) { alert('送れませんでした: ' + e.message); $('bn_go').disabled = false; }
}
async function bnReply(id) {
  const t = $('bn_r' + id).value.trim(); if (!t) return;
  try { await sb('banto_msg?id=eq.' + id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ chair_reply: t, chair_replied_at: new Date().toISOString(), status: 'chair_replied', chair_seen: true }) }); bnChair(); } catch (e) { alert('送れませんでした: ' + e.message); }
}
// 会長ページの「番頭さんからの取り次ぎ」と全件一覧
async function bnChair() {
  const el = document.getElementById('bn_chair'); if (!el) return;
  try {
    const rows = await sb('banto_msg?select=*&order=created_at.desc&limit=200');
    const esc = rows.filter(r => r.status === 'escalated');
    el.innerHTML = (esc.length ? esc.map(r => bnCard(r, true)).join('') : '<div class="card"><p>いま取り次ぎはありません。</p></div>')
      + `<details style="margin-top:8px"><summary>報連相の全件（${rows.length}件）</summary>${rows.map(r => bnCard(r, true)).join('') || '<p>まだありません。</p>'}</details>`;
    const h = document.getElementById('bn_chair_h'); if (h) h.textContent = `🧑‍💼 番頭さんからの取り次ぎ${esc.length ? `（${esc.length}件）` : ''}`;
  } catch (e) { el.innerHTML = `<p>${bnE(e.message)}</p>`; }
}
// トップの会長タイルに取り次ぎ件数バッジ
async function bnBadge() {
  if (DEMO || !(await chairCheck())) return;
  try { const n = (await sb('banto_msg?select=id&status=eq.escalated')).length; const t = document.getElementById('chair_tile'); if (t && n && !document.getElementById('bn_bd')) t.insertAdjacentHTML('afterbegin', `<span id="bn_bd" class="badge">取り次ぎ ${n}</span>`); } catch (e) { }
}
