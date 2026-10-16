// 会長ページ（会長専用）。会長は1行入れるだけ。整理・優先づけ・記憶はAIの朝のルーティン（tools: chair_ai.py）
// データ: chair_idea / chair_today / chair_message / chair_config（supabase/chair.sql）
const CH = { ok: null, cfg: { buckets: [], owner: '会長', org: '' }, J: '会長が判断', L: 'あとで' };
const chDay = (n = 0) => { const d = new Date(Date.now() + 9 * 36e5 + n * 864e5); return d.toISOString().slice(0, 10); };
async function chairCheck() {
  if (DEMO) return false;
  if (CH.ok !== null) return CH.ok;
  try { const s = JSON.parse(localStorage.getItem('sess') || '{}');
    const r = await fetch(C.supabaseUrl + '/rest/v1/rpc/is_chair', { method: 'POST', headers: { apikey: C.supabaseKey, Authorization: 'Bearer ' + s.token, 'Content-Type': 'application/json' }, body: '{}' });
    CH.ok = r.ok && (await r.json()) === true; } catch (e) { CH.ok = false; }
  return CH.ok;
}
// 事業所えらびの一番上に、会長だけに出すタイル
async function chairTile() {
  if (!(await chairCheck())) return;
  const g = document.querySelector('#view .grid'); if (!g || document.getElementById('chair_tile')) return;
  g.insertAdjacentHTML('beforebegin', `<a id="chair_tile" class="tile big" href="#chair" style="display:block;border-top:4px solid #b8860b;margin-bottom:12px"><span>👑</span>会長ページ<small>思いつきを入れる・今日やる3つ</small></a>`);
}
// 会長からの一言（職員向け表示）
async function chairMsgHtml() {
  if (DEMO) return '';
  try { const m = await sb('chair_message?active=eq.true&order=created_at.desc&limit=1'); if (!m.length) return '';
    return `<div class="card" style="border-left:6px solid #b8860b"><b>📣 会長からの一言</b><p style="font-size:18px;margin:6px 0;white-space:pre-wrap">${esc(m[0].body)}</p><small>${esc(m[0].created_at.slice(0, 10))}</small></div>`; } catch (e) { return ''; }
}
async function chairMsgShow() { const h = await chairMsgHtml(); if (h && document.getElementById('view') && !document.getElementById('chair_msg')) $('view').insertAdjacentHTML('afterbegin', `<div id="chair_msg">${h}</div>`); }

async function renderChair() {
  const back = `<button class="back" onclick="location.hash=''">← もどる</button>`;
  if (!(await chairCheck())) return $('view').innerHTML = back + '<p>このページは会長だけが見られます。</p>';
  $('view').innerHTML = back + '<p>読み込み中…</p>';
  try {
    const [cf, ideas, today] = await Promise.all([sb('chair_config'), sb('chair_idea?order=created_at.desc&limit=400'), sb(`chair_today?day=eq.${chDay()}&order=rank`)]);
    cf.forEach(r => CH.cfg[r.k] = r.v);
    CH.ideas = ideas;
    const bks = [...CH.cfg.buckets, CH.J, CH.L], open = ideas.filter(i => i.status === 'open'), byId = Object.fromEntries(ideas.map(i => [i.id, i]));
    const td = today.map(t => byId[t.idea_id]).filter(i => i && i.status === 'open');
    const doneToday = today.map(t => byId[t.idea_id]).filter(i => i && i.status === 'done').length;
    const yst = chDay(-1), ycnt = ideas.filter(i => new Date(new Date(i.created_at).getTime() + 9 * 36e5).toISOString().slice(0, 10) === yst).length;
    const fresh = open.filter(i => !i.ai_at).length;
    const flag = open.filter(i => i.stale || (i.due && i.due < chDay()));
    const item = (i, btn = true) => `<div class="card" style="padding:12px"><div style="font-size:19px">${esc(i.text)}</div>
      ${i.ai_note ? `<div style="color:#666;font-size:14px;margin-top:4px">🤖 ${esc(i.ai_note)}</div>` : ''}
      <div style="font-size:13px;color:#888;margin-top:4px">${i.due ? '期限 ' + esc(i.due) + '　' : ''}${i.priority ? '重要度 ' + i.priority + '　' : ''}${esc(i.created_at.slice(5, 10))}</div>
      <div style="margin-top:8px"><select style="font-size:16px;width:60%" onchange="chairMove(${i.id},this.value)">${bks.map(b => `<option${b === i.bucket ? ' selected' : ''}>${esc(b)}</option>`).join('')}</select>
      ${btn ? ` <button style="width:auto;padding:8px 18px;font-size:16px" onclick="chairDone(${i.id})">完了</button>` : ''}</div></div>`;
    const cnt = bks.map(b => [b, open.filter(i => i.bucket === b).length]);
    $('view').innerHTML = back + `<h3 class="nx" style="font-size:22px">👑 会長ページ</h3>
      <div class="card"><input id="ch_in" maxlength="1000" placeholder="思いついたことを一行で" style="font-size:20px;padding:14px"
        onkeydown="if(event.key==='Enter')chairSend()"><button style="font-size:22px;padding:14px;margin-top:8px" onclick="chairSend()">送る</button><div id="ch_m" style="font-size:20px;color:#2e6b4f;min-height:1.4em;margin-top:6px"></div></div>
      <h3 class="nx">🎯 今日やる3つ</h3>${td.length ? td.map(i => item(i)).join('') : `<div class="card"><p style="font-size:18px">${today.length ? '🎉 今日の3つは終わりました（' + doneToday + '件）' : '朝8時すぎのAI整理のあとに出ます。'}</p></div>`}
      <h3 class="nx">🌅 朝のまとめ</h3><div class="card" style="font-size:18px">
        <p>昨日たまった思いつき：<b>${ycnt}件</b>${fresh ? `　<small>（AIの整理まち ${fresh}件）</small>` : ''}</p>
        <p style="margin:0">担当別の未完了：</p><p style="margin:4px 0">${cnt.map(([b, n]) => `<span style="display:inline-block;margin:2px 8px 2px 0;${n ? 'font-weight:bold' : 'color:#aaa'}">${esc(b)} ${n}</span>`).join('')}</p></div>
      ${flag.length ? `<h3 class="nx">⚠️ 放置・期限切れ（AI判定 ${flag.length}件）</h3>${flag.slice(0, 8).map(i => item(i)).join('')}` : ''}
      <h3 class="nx">📣 会長からの一言（職員に表示）</h3><div class="card"><div id="ch_cur"></div><textarea id="ch_msg" rows="2" maxlength="500" style="font-size:18px;width:100%" placeholder="職員への一言"></textarea>
        <button style="margin-top:6px" onclick="chairMsgSend()">表示する</button> <button class="back" onclick="chairMsgOff()">一言を消す</button> <span id="ch_mm" class="note"></span></div>
      <h3 class="nx">🌅 スタッフ業務報告</h3><div id="ch_rep" class="card">読み込み中…</div>
      <details><summary style="font-size:18px;padding:12px 0">すべての思いつき（未完了 ${open.length}件）</summary>${open.map(i => item(i)).join('') || '<p>なし</p>'}</details>`;
    chairCur(); chairReport();
  } catch (e) { $('view').innerHTML = back + `<p>${esc(e.message)}</p>`; }
}
async function chairSend() {
  const el = $('ch_in'), t = el.value.trim(), m = $('ch_m'); if (!t) return;
  m.style.color = '#2e6b4f';
  try { const r = await sb('chair_idea', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ text: t }) }); el.value = ''; m.textContent = '受けました';
    const id = r && r[0] && r[0].id; if (!id) { m.textContent = '受けました'; return; } CH.last = { id, text: t };
    const ss = JSON.parse(localStorage.getItem('sess') || '{}');
    fetch(C.supabaseUrl + '/functions/v1/chair-classify', { method: 'POST', headers: { apikey: C.supabaseKey, Authorization: 'Bearer ' + ss.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      .then(x => x.json()).then(j => chairShowBucket(id, j.bucket || 'あとで')).catch(() => chairShowBucket(id, 'あとで')); }
  catch (e) { m.style.color = '#c00'; m.textContent = '送れませんでした：' + e.message; }
}
// 振り分け結果を一行で出す。違えばその場で1タップで直せる（直した内容はAIが覚える）
function chairShowBucket(id, b) {
  const m = $('ch_m'); if (!m || !CH.last || CH.last.id !== id) return; CH.last.ai = b;
  const bks = [...CH.cfg.buckets, CH.J, CH.L], lab = x => x === CH.J ? '会長が判断' : x === CH.L ? 'あとで' : x + 'さんへ';
  m.innerHTML = `受けました　→ <b>${esc(lab(b))}</b><div style="margin-top:6px">${bks.filter(x => x !== b).map(x => `<button class="back" style="font-size:15px;margin:2px" onclick="chairFix(${id},'${esc(x)}')">${esc(lab(x))}</button>`).join('')}</div>`;
}
async function chairFix(id, b) { await chairMove(id, b, CH.last && CH.last.id === id ? CH.last : null); const m = $('ch_m'); if (m) { m.textContent = '直しました → ' + b + '（覚えます）'; setTimeout(() => { if ($('ch_m')) $('ch_m').textContent = ''; }, 3000); } }
async function chairMove(id, b, ref) {
  try { const i = ref ? { text: ref.text, ai_bucket: ref.ai } : (CH.ideas || []).find(x => x.id === id);
    await sb('chair_idea?id=eq.' + id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ bucket: b }) });
    if (i && i.ai_bucket && i.ai_bucket !== b) await sb('chair_idea_feedback', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ text: i.text, ai_bucket: i.ai_bucket, fixed_bucket: b }) });
  } catch (e) { alert(e.message); }
}
async function chairDone(id) { try { await sb('chair_idea?id=eq.' + id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'done', done_at: new Date().toISOString() }) }); renderChair(); } catch (e) { alert(e.message); } }
async function chairCur() { try { const m = await sb('chair_message?active=eq.true&order=created_at.desc&limit=1'); const e = $('ch_cur'); if (e) e.innerHTML = m.length ? `<p>いま表示中：<b>${esc(m[0].body)}</b></p>` : '<p class="note">いま表示中の一言はありません。</p>'; } catch (e) { } }
async function chairMsgSend() {
  const t = $('ch_msg').value.trim(), m = $('ch_mm'); if (!t) return;
  try { await sb('chair_message?active=eq.true', { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ active: false }) });
    await sb('chair_message', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ body: t }) }); $('ch_msg').value = ''; m.textContent = '表示しました'; chairCur(); } catch (e) { m.textContent = e.message; }
}
async function chairMsgOff() { try { await sb('chair_message?active=eq.true', { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ active: false }) }); chairCur(); } catch (e) { alert(e.message); } }
// スタッフ業務報告（未報告の人・職員ごとのToDo）。詳細は #report/admin
async function chairReport() {
  const el = $('ch_rep'); if (!el) return;
  try {
    const day = srToday(), since = chDay(-14);
    const [ros, reps, todos] = await Promise.all([srRpc('staff_roster'), sb(`staff_report?day=gte.${since}&order=day.desc`), sb('staff_todo?status=neq.done&order=due.nulls.last,updated_at')]);
    const nm = Object.fromEntries(ros.map(r => [r.user_id, r.name])), targets = ros.filter(r => r.daily_report), have = new Set(reps.filter(r => r.day === day).map(r => r.staff));
    const miss = targets.filter(r => !have.has(r.user_id)), by = {}; todos.forEach(x => (by[x.assignee] = by[x.assignee] || []).push(x));
    el.innerHTML = `<p style="font-size:18px">📭 今日まだ報告がない人（${miss.length}／${targets.length}）：<b>${miss.map(r => esc(r.name)).join('、') || 'なし'}</b></p>
      ${Object.keys(by).length ? Object.entries(by).map(([id, xs]) => `<p><b>${esc(nm[id] || '？')}</b>（ToDo ${xs.length}）<br>${xs.map(x => `<small>・${esc(x.title)}${x.due && x.due < day ? ' ⚠️期限切れ' : ''}</small>`).join('<br>')}</p>`).join('') : '<p class="note">未完了のToDoはありません。</p>'}
      <a href="#report/admin">朝の確認・ToDoを出す →</a>`;
  } catch (e) { el.textContent = e.message; }
}
