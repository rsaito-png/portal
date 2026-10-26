// 評定所＝全体の報連相。全職員と会長が投稿・閲覧・返信（supabase/hyojosho_open.sql の RLS）。会長のリアクションは会長のみ
// 一旦保留。true のあいだは総合トップのタイルを出さず、#leaderboard は案内だけ。戻すときは false（投稿・表・RLSはそのまま）。
const HYOJOSHO_HOLD = true;
const LB = { ok: null, chair: false, office: '' };
async function lbRpc(fn) { const s = JSON.parse(localStorage.getItem('sess') || '{}'); const r = await fetch(C.supabaseUrl + '/rest/v1/rpc/' + fn, { method: 'POST', headers: { apikey: C.supabaseKey, Authorization: 'Bearer ' + s.token, 'Content-Type': 'application/json' }, body: '{}' }); return r.ok && (await r.json()) === true; }
async function lbCheck() { if (DEMO) return false; if (LB.ok === null) { try { [LB.ok, LB.chair] = await Promise.all([lbRpc('is_staff'), lbRpc('is_chair')]); } catch (e) { LB.ok = false; } } return LB.ok; }
// 総合トップの評定所タイルに、会長だけ「未返信」バッジ
async function lbBadge() {
  if (HYOJOSHO_HOLD) return;
  if (!(await lbCheck()) || !LB.chair) return;
  const a = document.querySelector('#view .grid a[href="#leaderboard"]'); if (!a || a.querySelector('.badge')) return;
  try { const n = (await sb('leader_post?select=id&replied_at=is.null')).length; if (n) a.insertAdjacentHTML('afterbegin', `<span class="badge">未返信 ${n}</span>`); } catch (e) {}
}
const lbT = d => new Date(d).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const LB_KC = { '報告': '#2e6b9f', '連絡': '#2e8b57', '相談': '#b8860b' };
function lbHoldHtml() {
  const back = `<button class="back" onclick="location.hash=''">← 事業所えらびへ</button>`;
  return back + '<h3>🏯 評定所</h3><p>評定所はいま保留にしています。報告・連絡・相談は<a href="#banto">番頭さん</a>へ送ってください。</p>';
}
async function renderLeaderBoard() {
  const back = `<button class="back" onclick="location.hash=''">← 事業所えらびへ</button>`;
  if (HYOJOSHO_HOLD) return $('view').innerHTML = lbHoldHtml();
  if (DEMO) return $('view').innerHTML = back + '<h3>評定所</h3><p>見本モードでは表示しません。</p>';
  $('view').innerHTML = '<p>読み込み中…</p>';
  if (!(await lbCheck())) return $('view').innerHTML = back + '<h3>評定所</h3><p>評定所は、職員と会長が見られます。</p>';
  try {
    const [all, reps] = await Promise.all([sb('leader_post?order=created_at.desc&limit=200'), sb('leader_reply?order=created_at&limit=2000')]);
    LB.reps = {}; reps.forEach(r => (LB.reps[r.post_id] = LB.reps[r.post_id] || []).push(r));
    const offs = [...new Set(all.map(p => p.office).filter(Boolean))];
    let list = LB.office ? all.filter(p => p.office === LB.office) : all;
    if (LB.kind) list = list.filter(p => (p.kind || '報告') === LB.kind);
    const un = all.filter(p => !p.replied_at).length;
    $('view').innerHTML = back + `<h3>🏯 評定所 <button style="width:auto;font-size:16px" onclick="lbHelp()">役職とは？</button></h3><p>職員みんなと会長の報連相（報告・連絡・相談）の場です。だれでも書けて、だれでも返信できます。</p><div id="lbHelp"></div>
      <p style="color:#a33">人事評価や苦情などの個別の話はここに書かず、<a href="#banto">番頭さん</a>（個別の窓口）や<a href="#soudan">人事労務の相談所</a>へ。</p>
      <div class="card"><div><b>書く</b>　種別：<select id="lbk" style="width:auto">${['報告', '連絡', '相談'].map(k => `<option>${k}</option>`).join('')}</select></div>
        <textarea id="lb1" rows="6" style="display:block;width:100%;box-sizing:border-box;font-size:16px;resize:vertical;margin:6px 0" placeholder="みんなに伝えたいこと・相談したいこと"></textarea>
        <button style="display:block" onclick="lbPost()">送る</button></div>
      <p>${LB.chair ? `会長がまだ返していない投稿：<b>${un}件</b>　` : ''}
        種別：<select style="width:auto" onchange="LB.kind=this.value;renderLeaderBoard()"><option value="">すべて</option>${['報告', '連絡', '相談'].map(k => `<option ${k === LB.kind ? 'selected' : ''}>${k}</option>`).join('')}</select>
        事業所：<select id="lbOff" style="width:auto" onchange="LB.office=this.value;renderLeaderBoard()"><option value="">すべて</option>${offs.map(o => `<option ${o === LB.office ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></p>
      ${list.length ? list.map(lbCard).join('') : '<p>まだ投稿はありません。</p>'}`;
  } catch (e) { $('view').innerHTML = back + `<p>読み込めませんでした：${esc(e.message)}</p>`; }
}
function lbCard(p) {
  const k = p.kind || '報告';
  const row = (h, v) => v ? `<p style="margin:4px 0;white-space:pre-wrap">${h ? `<b>${h}</b> ` : ''}${esc(v)}</p>` : '';
  const rep = p.replied_at ? `<div style="background:#fff8e1;padding:6px;border-radius:6px">${p.reaction ? `<span style="font-size:${p.reaction.length > 2 ? 16 : 22}px;font-weight:bold;color:${p.reaction === 'まかりならん' ? '#c00' : 'inherit'}">${esc(p.reaction)}</span> ` : ''}${esc(p.reply || '')}<small> 会長より</small></div>` : '';
  const form = LB.chair ? `<div style="margin-top:6px">${['👍', '🙏', '✅', '👀', 'よきにはからえ', 'まかりならん'].map(r => `<button style="width:auto" onclick="lbReply(${p.id},'${r}')">${r}</button>`).join(' ')}
    <input id="lbr${p.id}" placeholder="会長のひとこと" style="width:60%" value="${esc(p.reply || '')}"><button style="width:auto" onclick="lbReply(${p.id})">返す</button></div>` : '';
  const rs = (LB.reps[p.id] || []).map(r => `<div style="border-top:1px dashed #ccc;padding:4px 0;font-size:15px"><small>${esc(r.author_name || '')}・${lbT(r.created_at)}</small><div style="white-space:pre-wrap">${esc(r.body)}</div></div>`).join('');
  return `<div class="card" style="border-left:6px solid ${LB_KC[k]}"><span class="badge" style="background:${LB_KC[k]}">${k}</span> <small><a href="#" onclick="lbHelp();return false">${esc(p.author_name || '')}</a>・${esc(p.office || '')}・${lbT(p.created_at)}</small>
    ${row('', p.today)}${row('困りごと：', p.trouble)}${row('判断してほしいこと：', p.ask)}${rep}${rs}
    <div style="margin-top:6px"><textarea id="lbc${p.id}" rows="3" placeholder="返信を書く" style="display:block;width:100%;box-sizing:border-box;font-size:16px;resize:vertical;margin:6px 0"></textarea><button style="width:auto" onclick="lbComment(${p.id})">返信</button></div>${form}</div>`;
}
async function lbPost() {
  if (HYOJOSHO_HOLD) return $('view').innerHTML = lbHoldHtml();
  const t = $('lb1').value.trim(); if (!t) return alert('中身を書いてください');
  try { await sb('leader_post', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ kind: $('lbk').value, today: t }) }); renderLeaderBoard(); } catch (e) { alert('送れませんでした：' + e.message); }
}
async function lbComment(id) {
  if (HYOJOSHO_HOLD) return $('view').innerHTML = lbHoldHtml();
  const t = $('lbc' + id).value.trim(); if (!t) return;
  try { await sb('leader_reply', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ post_id: id, body: t }) }); renderLeaderBoard(); } catch (e) { alert('返信できませんでした：' + e.message); }
}
async function lbReply(id, reaction) {
  if (HYOJOSHO_HOLD) return $('view').innerHTML = lbHoldHtml();
  const body = reaction ? { reaction } : { reply: $('lbr' + id).value.trim() };
  try { await sb('leader_post?id=eq.' + id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body) }); renderLeaderBoard(); } catch (e) { alert('返信できませんでした：' + e.message); }
}
// 役職の説明（ポップアップ）
const LB_RANKS = [['大老', '将軍を補佐する最高職（常設ではない）', '会長の次で、法人全体を預かる'],
  ['老中', '幕府の政治を日々動かした重職', '現在は不在'],
  ['若年寄', '老中を補佐し、旗本などをまとめた職', '大老を補佐し、奉行たちをまとめる'],
  ['監査奉行', '役人の仕事ぶりを見張る目付（めつけ）にあたる役', '法人全体の仕事や書類が正しく行われているかを確かめる'],
  ['奉行', '町・寺社・勘定などの役所を任された長', '事業所や部門を任された責任者']];
const LB_WORDS = [['評定所（ひょうじょうしょ）', '幕府の重職が集まって相談・裁定した場所。ここでは職員みんなと会長の報連相の場'], ['番頭（ばんとう）', '店を預かる奉公人のかしら。ここでは会長の右腕のAIで、個別の報連相を受ける窓口']];
async function lbHelp() {
  let who = []; try { const s = JSON.parse(localStorage.getItem('sess') || '{}'); const r = await fetch(C.supabaseUrl + '/rest/v1/rpc/rank_list', { method: 'POST', headers: { apikey: C.supabaseKey, Authorization: 'Bearer ' + s.token, 'Content-Type': 'application/json' }, body: '{}' }); if (r.ok) who = await r.json(); } catch (e) {}
  const names = k => who.filter(w => w.rank === k || w.rank.endsWith(k) && k === '奉行' && w.rank !== '監査奉行').map(w => (w.rank === k ? '' : w.rank + ' ') + w.name).join('、') || '不在';
  const box = document.getElementById('lbHelp'); if (!box) return;
  box.innerHTML = `<div style="position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:50" onclick="this.remove()"><div class="card" style="max-width:640px;margin:40px auto;max-height:85vh;overflow:auto" onclick="event.stopPropagation()">
    <b>役職とは？</b>${LB_RANKS.map(([k, e, m]) => `<p style="margin:8px 0"><b>${k}</b><br>江戸：${e}<br>星心会：${m}<br>いまの担当：${esc(names(k))}</p>`).join('')}
    <hr>${LB_WORDS.map(([k, m]) => `<p style="margin:6px 0"><b>${k}</b>：${m}</p>`).join('')}
    <button onclick="this.closest('[style*=fixed]').remove()">閉じる</button></div></div>`;
}
