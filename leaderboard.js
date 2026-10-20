// 評定所（試作）。見られるのは役職名のある人と会長だけ（supabase/leader_board.sql の RLS）
const LB = { ok: null, chair: false, office: '' };
async function lbRpc(fn) { const s = JSON.parse(localStorage.getItem('sess') || '{}'); const r = await fetch(C.supabaseUrl + '/rest/v1/rpc/' + fn, { method: 'POST', headers: { apikey: C.supabaseKey, Authorization: 'Bearer ' + s.token, 'Content-Type': 'application/json' }, body: '{}' }); return r.ok && (await r.json()) === true; }
async function lbCheck() { if (DEMO) return false; if (LB.ok === null) { try { [LB.ok, LB.chair] = await Promise.all([lbRpc('is_leader'), lbRpc('is_chair')]); } catch (e) { LB.ok = false; } } return LB.ok; }
// 総合トップの「注進」のすぐ後ろにタイルを出す（役職のある人と会長だけ）
async function leaderTile() {
  if (!(await lbCheck())) return;
  const a = document.querySelector('#view .grid a[href="#report"]'); if (!a || document.getElementById('lb_tile')) return;
  let n = 0; if (LB.chair) { try { n = (await sb('leader_post?select=id&replied_at=is.null')).length; } catch (e) {} }
  a.insertAdjacentHTML('afterend', `<a id="lb_tile" class="tile main" href="#leaderboard"><span>🗒️</span>${n ? `<span class="badge">未返信 ${n}</span>` : ''}評定所<small>大老・奉行と会長の連絡の場</small></a>`);
}
const lbT = d => new Date(d).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
async function renderLeaderBoard() {
  const back = `<button class="back" onclick="location.hash=''">← 事業所えらびへ</button>`;
  if (DEMO) return $('view').innerHTML = back + '<h3>評定所</h3><p>見本モードでは表示しません。</p>';
  $('view').innerHTML = '<p>読み込み中…</p>';
  if (!(await lbCheck())) return $('view').innerHTML = back + '<h3>評定所</h3><p>評定所は、大老・奉行と会長だけが見られます。</p>';
  try {
    const all = await sb('leader_post?order=created_at.desc&limit=200');
    const offs = [...new Set(all.map(p => p.office).filter(Boolean))];
    const list = LB.office ? all.filter(p => p.office === LB.office) : all;
    const un = all.filter(p => !p.replied_at).length;
    $('view').innerHTML = back + `<h3>🗒️ 評定所 <button style="width:auto;font-size:16px" onclick="lbHelp()">役職とは？</button></h3><p>大老・奉行と会長の連絡の場です。</p><div id="lbHelp"></div>
      <p style="color:#a33">人事評価や苦情などの個別の話はここに書かず、今までどおり一対一で扱います。</p>
      ${LB.chair ? '' : `<div class="card"><b>きょうの注進</b>
        <label>① 今日あったこと<textarea id="lb1" rows="2"></textarea></label>
        <label>② 困っていること<textarea id="lb2" rows="2"></textarea></label>
        <label>③ お伺い（齊藤さんに判断してほしいこと・空欄可）<textarea id="lb3" rows="2"></textarea></label>
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
  return `<div class="card" style="border-left:6px solid ${p.replied_at ? '#9c9' : '#e88'}"><small><a href="#" onclick="lbHelp();return false">${esc(p.author_name || '')}</a>・${esc(p.office || '')}・${lbT(p.created_at)}</small>
    ${row('①', p.today)}${row('②', p.trouble)}${row('③お伺い', p.ask)}${rep}${form}</div>`;
}
async function lbPost() {
  const v = i => $(i).value.trim(); if (!v('lb1')) return alert('①「今日あったこと」を書いてください');
  try { await sb('leader_post', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ today: v('lb1'), trouble: v('lb2') || null, ask: v('lb3') || null }) }); renderLeaderBoard(); } catch (e) { alert('送れませんでした：' + e.message); }
}
async function lbReply(id, reaction) {
  const body = reaction ? { reaction } : { reply: $('lbr' + id).value.trim() };
  try { await sb('leader_post?id=eq.' + id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body) }); renderLeaderBoard(); } catch (e) { alert('返信できませんでした：' + e.message); }
}
// 役職の説明（ポップアップ）
const LB_RANKS = [['大老', '将軍を補佐する最高職（常設ではない）', '会長の次で、法人全体を預かる'],
  ['老中', '幕府の政治を日々動かした重職', '現在は不在'],
  ['若年寄', '老中を補佐し、旗本などをまとめた職', '大老を補佐し、奉行たちをまとめる'],
  ['監査奉行', '役人の仕事ぶりを見張る目付（めつけ）にあたる役', '法人全体の仕事や書類が正しく行われているかを確かめる'],
  ['奉行', '町・寺社・勘定などの役所を任された長', '事業所や部門を任された責任者']];
const LB_WORDS = [['注進（ちゅうしん）', '起きたことを急いで上に知らせること。ここでは日々の報告'], ['伺い（うかがい）', '上の人に判断を求めること。ここでは齊藤さんに決めてほしいこと'], ['評定所（ひょうじょうしょ）', '幕府の重職が集まって相談・裁定した場所。ここでは役職のある人と会長の連絡の場']];
async function lbHelp() {
  let who = []; try { const s = JSON.parse(localStorage.getItem('sess') || '{}'); const r = await fetch(C.supabaseUrl + '/rest/v1/rpc/rank_list', { method: 'POST', headers: { apikey: C.supabaseKey, Authorization: 'Bearer ' + s.token, 'Content-Type': 'application/json' }, body: '{}' }); if (r.ok) who = await r.json(); } catch (e) {}
  const names = k => who.filter(w => w.rank === k || w.rank.endsWith(k) && k === '奉行' && w.rank !== '監査奉行').map(w => (w.rank === k ? '' : w.rank + ' ') + w.name).join('、') || '不在';
  const box = document.getElementById('lbHelp'); if (!box) return;
  box.innerHTML = `<div style="position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:50" onclick="this.remove()"><div class="card" style="max-width:640px;margin:40px auto;max-height:85vh;overflow:auto" onclick="event.stopPropagation()">
    <b>役職とは？</b>${LB_RANKS.map(([k, e, m]) => `<p style="margin:8px 0"><b>${k}</b><br>江戸：${e}<br>星心会：${m}<br>いまの担当：${esc(names(k))}</p>`).join('')}
    <hr>${LB_WORDS.map(([k, m]) => `<p style="margin:6px 0"><b>${k}</b>：${m}</p>`).join('')}
    <button onclick="this.closest('[style*=fixed]').remove()">閉じる</button></div></div>`;
}
