// リーダー掲示板（試作）。見られるのはリーダーと会長だけ（supabase/leader_board.sql の RLS）
const LB = { ok: null, chair: false, office: '' };
async function lbRpc(fn) { const s = JSON.parse(localStorage.getItem('sess') || '{}'); const r = await fetch(C.supabaseUrl + '/rest/v1/rpc/' + fn, { method: 'POST', headers: { apikey: C.supabaseKey, Authorization: 'Bearer ' + s.token, 'Content-Type': 'application/json' }, body: '{}' }); return r.ok && (await r.json()) === true; }
async function lbCheck() { if (DEMO) return false; if (LB.ok === null) { try { [LB.ok, LB.chair] = await Promise.all([lbRpc('is_leader'), lbRpc('is_chair')]); } catch (e) { LB.ok = false; } } return LB.ok; }
// 総合トップの「リーダー報告」のすぐ後ろにタイルを出す（リーダーと会長だけ）
async function leaderTile() {
  if (!(await lbCheck())) return;
  const a = document.querySelector('#view .grid a[href="#report"]'); if (!a || document.getElementById('lb_tile')) return;
  let n = 0; if (LB.chair) { try { n = (await sb('leader_post?select=id&replied_at=is.null')).length; } catch (e) {} }
  a.insertAdjacentHTML('afterend', `<a id="lb_tile" class="tile main" href="#leaderboard"><span>🗒️</span>${n ? `<span class="badge">未返信 ${n}</span>` : ''}リーダー掲示板<small>リーダーと会長だけが見られます</small></a>`);
}
const lbT = d => new Date(d).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
async function renderLeaderBoard() {
  const back = `<button class="back" onclick="location.hash=''">← 事業所えらびへ</button>`;
  if (DEMO) return $('view').innerHTML = back + '<h3>リーダー掲示板</h3><p>見本モードでは表示しません。</p>';
  $('view').innerHTML = '<p>読み込み中…</p>';
  if (!(await lbCheck())) return $('view').innerHTML = back + '<h3>リーダー掲示板</h3><p>この掲示板は、リーダーと会長だけが見られます。</p>';
  try {
    const all = await sb('leader_post?order=created_at.desc&limit=200');
    const offs = [...new Set(all.map(p => p.office).filter(Boolean))];
    const list = LB.office ? all.filter(p => p.office === LB.office) : all;
    const un = all.filter(p => !p.replied_at).length;
    $('view').innerHTML = back + `<h3>🗒️ リーダー掲示板</h3>
      <p style="color:#a33">人事評価や苦情などの個別の話はここに書かず、今までどおり一対一で扱います。</p>
      ${LB.chair ? '' : `<div class="card"><b>きょうの報告</b>
        <label>① 今日あったこと<textarea id="lb1" rows="2"></textarea></label>
        <label>② 困っていること<textarea id="lb2" rows="2"></textarea></label>
        <label>③ 齊藤さんに判断してほしいこと（なければ空のままで）<textarea id="lb3" rows="2"></textarea></label>
        <button onclick="lbPost()">送る</button></div>`}
      <p>まだ返信していない投稿：<b>${un}件</b>　
        事業所：<select id="lbOff" style="width:auto" onchange="LB.office=this.value;renderLeaderBoard()"><option value="">すべて</option>${offs.map(o => `<option ${o === LB.office ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></p>
      ${list.length ? list.map(lbCard).join('') : '<p>まだ投稿はありません。</p>'}`;
  } catch (e) { $('view').innerHTML = back + `<p>読み込めませんでした：${esc(e.message)}</p>`; }
}
function lbCard(p) {
  const row = (k, v) => v ? `<p style="margin:4px 0;white-space:pre-wrap"><b>${k}</b> ${esc(v)}</p>` : '';
  const rep = p.replied_at ? `<div style="background:#fff8e1;padding:6px;border-radius:6px">${p.reaction ? `<span style="font-size:22px">${esc(p.reaction)}</span> ` : ''}${esc(p.reply || '')}<small> 会長より</small></div>` : '<span class="badge">未返信</span>';
  const form = LB.chair ? `<div style="margin-top:6px">${['👍', '🙏', '✅', '👀'].map(r => `<button style="width:auto" onclick="lbReply(${p.id},'${r}')">${r}</button>`).join(' ')}
    <input id="lbr${p.id}" placeholder="短い返信" style="width:60%" value="${esc(p.reply || '')}"><button style="width:auto" onclick="lbReply(${p.id})">返信</button></div>` : '';
  return `<div class="card" style="border-left:6px solid ${p.replied_at ? '#9c9' : '#e88'}"><small>${esc(p.author_name || '')}・${esc(p.office || '')}・${lbT(p.created_at)}</small>
    ${row('①', p.today)}${row('②', p.trouble)}${row('③', p.ask)}${rep}${form}</div>`;
}
async function lbPost() {
  const v = i => $(i).value.trim(); if (!v('lb1')) return alert('①「今日あったこと」を書いてください');
  try { await sb('leader_post', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ today: v('lb1'), trouble: v('lb2') || null, ask: v('lb3') || null }) }); renderLeaderBoard(); } catch (e) { alert('送れませんでした：' + e.message); }
}
async function lbReply(id, reaction) {
  const body = reaction ? { reaction } : { reply: $('lbr' + id).value.trim() };
  try { await sb('leader_post?id=eq.' + id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body) }); renderLeaderBoard(); } catch (e) { alert('返信できませんでした：' + e.message); }
}
