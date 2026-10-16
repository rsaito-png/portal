// スタッフリーダー報告。1日1回・1行でOK。管理者（can_manage）は朝の1画面で確認。
// データ: staff_report / staff_todo / staff_roster()（supabase/staff_report.sql）
const SR = { staleDays: 3, tab: null };
const srToday = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
const srAgo = d => Math.floor((Date.now() - new Date(d).getTime()) / 864e5);
const srST = { open: '未着手', doing: '進行中', done: '完了' };
async function srRpc(fn) { const s = JSON.parse(localStorage.getItem('sess') || '{}'); const r = await fetch(C.supabaseUrl + '/rest/v1/rpc/' + fn, { method: 'POST', headers: { apikey: C.supabaseKey, Authorization: 'Bearer ' + s.token, 'Content-Type': 'application/json' }, body: '{}' }); if (!r.ok) throw new Error('読み込めませんでした（' + r.status + '）'); return r.json(); }
function srMe() { const s = JSON.parse(localStorage.getItem('sess') || '{}'); return JSON.parse(atob(s.token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub; }
async function renderReport() {
  const back = `<button class="back" onclick="location.hash=''">← 事業所えらびへ</button>`;
  if (DEMO) return $('view').innerHTML = back + '<h3>リーダー報告</h3>' + demoNote() + '<p>見本モードでは表示しません。</p>';
  $('view').innerHTML = '<p>読み込み中…</p>';
  try {
    const me = srMe(), day = srToday();
    const [reps, todos] = await Promise.all([sb(`staff_report?staff=eq.${me}&order=day.desc&limit=7`), sb(`staff_todo?assignee=eq.${me}&status=neq.done&order=due.asc.nullslast,created_at`)]);
    const t = reps.find(r => r.day === day);
    $('view').innerHTML = back + `<div id="chair_msg">${typeof chairMsgHtml === 'function' ? await chairMsgHtml() : ''}</div><h3>今日のリーダー報告</h3>
      <div class="card">
      <button onclick="srSend(true)" style="font-size:20px;padding:14px 24px;width:100%">問題なし</button>
      <p>または1行でOK：<textarea id="sr_b" rows="3" maxlength="2000" style="width:100%;font-size:16px" placeholder="今日やったこと">${esc(t && !t.no_problem ? t.body || '' : '')}</textarea></p>
      <p>困りごと（あれば）：<textarea id="sr_t" rows="2" maxlength="2000" style="width:100%;font-size:16px">${esc(t?.trouble || '')}</textarea></p>
      <button onclick="srSend(false)" style="font-size:18px;padding:10px 24px">送る</button> <span id="sr_m" class="note"></span></div>
      <h3>私のToDo（指示）</h3>${todos.length ? todos.map(x => `<div class="card"><b>${esc(x.title)}</b>${x.due ? `<small>　期限 ${esc(x.due)}</small>` : ''}
        <p><select id="st_${x.id}" onchange="srTodo(${x.id})">${Object.entries(srST).map(([k, v]) => `<option value="${k}"${k === x.status ? ' selected' : ''}>${v}</option>`).join('')}</select>
        <input id="sn_${x.id}" maxlength="1000" placeholder="一言（任意）" value="${esc(x.note || '')}" style="width:60%" onchange="srTodo(${x.id})"> <span id="sm_${x.id}" class="note"></span></p></div>`).join('') : '<p>いまの指示はありません。</p>'}
      <h3>最近の報告</h3>${reps.map(r => `<p>${esc(r.day)}　${r.no_problem ? '問題なし' : esc(r.body || '')}${r.trouble ? '　⚠️' + esc(r.trouble) : ''}</p>`).join('') || '<p>まだありません。</p>'}`;
  } catch (e) { $('view').innerHTML = back + `<p>${esc(e.message)}</p>`; }
}
async function srSend(np) {
  const b = $('sr_b').value.trim(), tr = $('sr_t').value.trim(), m = $('sr_m');
  if (!np && !b && !tr) { m.textContent = '1行入れるか「問題なし」を押してください。'; return; }
  try { await sb('staff_report?on_conflict=staff,day', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ day: srToday(), no_problem: np, body: np ? null : b || null, trouble: tr || null, updated_at: new Date().toISOString() }) });
    renderReport(); } catch (e) { m.textContent = e.message; }
}
async function srTodo(id) {
  const m = $('sm_' + id); try { await sb('staff_todo?id=eq.' + id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: $('st_' + id).value, note: $('sn_' + id).value.trim() || null }) }); m.textContent = '保存しました'; if ($('st_' + id).value === 'done') setTimeout(renderReport, 600); } catch (e) { m.textContent = e.message; }
}
// 管理者の朝の1画面
async function renderReportAdmin() {
  const back = `<button class="back" onclick="location.hash=''">← 事業所えらびへ</button>`;
  if (DEMO) return $('view').innerHTML = back + '<h3>リーダー報告（朝の確認）</h3>' + demoNote() + '<p>見本モードでは表示しません。</p>';
  $('view').innerHTML = '<p>読み込み中…</p>';
  try {
    const day = srToday(), since = new Date(Date.now() - 14 * 864e5).toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
    const [ros, reps, todos] = await Promise.all([srRpc('staff_roster'), sb(`staff_report?day=gte.${since}&order=day.desc`), sb('staff_todo?status=neq.done&order=due.asc.nullslast,updated_at')]);
    const nm = Object.fromEntries(ros.map(r => [r.user_id, r.name])), targets = ros.filter(r => r.daily_report);
    const today = reps.filter(r => r.day === day), have = new Set(today.map(r => r.staff));
    const miss = targets.filter(r => !have.has(r.user_id));
    const last = id => reps.find(r => r.staff === id)?.day;
    const stale = todos.filter(x => srAgo(x.updated_at) >= SR.staleDays || (x.due && x.due < day));
    const troubles = reps.filter(r => r.trouble && srAgo(r.day + 'T00:00:00+09:00') <= 7);
    const sec = (h, c) => `<div class="card"><h4>${h}</h4>${c}</div>`;
    $('view').innerHTML = back + `<h3>リーダー報告（朝の確認）　${esc(day)}</h3>
      ${sec(`📭 今日まだ報告がない人（${miss.length}／${targets.length}）`, miss.length ? miss.map(r => `<p>${esc(r.name)}　<small>最後の報告：${esc(last(r.user_id) || '14日以内なし')}</small></p>`).join('') : '<p>全員報告済みです。</p>')}
      ${sec(`⏳ 動いていないToDo（${stale.length}）`, stale.length ? stale.map(x => `<p>${esc(nm[x.assignee] || '？')}：<b>${esc(x.title)}</b>　<small>${srST[x.status]}・${srAgo(x.updated_at)}日動きなし${x.due ? '・期限 ' + esc(x.due) : ''}${x.due && x.due < day ? ' ⚠️期限切れ' : ''}</small> <button class="back" onclick="srDel(${x.id})">消す</button></p>`).join('') : '<p>ありません。</p>')}
      ${sec(`🆘 スタッフの困りごと（直近7日 ${troubles.length}）`, troubles.length ? troubles.map(r => `<p>${esc(nm[r.staff] || '？')}　<small>${esc(r.day)}</small><br>${esc(r.trouble)}</p>`).join('') : '<p>ありません。</p>')}
      ${sec(`✅ 今日の報告（${today.length}）`, today.map(r => `<p>${esc(nm[r.staff] || '？')}：${r.no_problem ? '問題なし' : esc(r.body || '')}</p>`).join('') || '<p>まだありません。</p>')}
      ${sec('➕ ToDoを出す', `<p><select id="ta_who">${ros.map(r => `<option value="${r.user_id}">${esc(r.name)}</option>`).join('')}</select>
        <input id="ta_t" maxlength="300" placeholder="指示の内容" style="width:100%"> 期限 <input id="ta_d" type="date" style="width:auto"> <button onclick="srAdd()">出す</button> <span id="ta_m" class="note"></span></p>`)}
      <p class="note">全ToDo（未完了 ${todos.length}）は動きなし ${SR.staleDays} 日以上か期限切れのものだけ上に出しています。</p>`;
  } catch (e) { $('view').innerHTML = back + `<p>${esc(e.message)}（管理者のみ見られます）</p>`; }
}
async function srAdd() {
  const t = $('ta_t').value.trim(), m = $('ta_m'); if (!t) { m.textContent = '内容を入れてください。'; return; }
  try { await sb('staff_todo', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ assignee: $('ta_who').value, title: t, due: $('ta_d').value || null }) }); renderReportAdmin(); } catch (e) { m.textContent = e.message; }
}
async function srDel(id) { if (!confirm('このToDoを消しますか')) return; try { await sb('staff_todo?id=eq.' + id, { method: 'DELETE' }); renderReportAdmin(); } catch (e) { alert(e.message); } }
