// 報告。1日1回・1行でOK。管理者（can_manage）は朝の1画面で確認。
// データ: staff_report / staff_todo / staff_roster()（supabase/staff_report.sql）
const SR = { staleDays: 3, tab: null };
const srToday = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
const srAgo = d => Math.floor((Date.now() - new Date(d).getTime()) / 864e5);
const srST = { open: '未着手', doing: '進行中', done: '完了' };
async function srRpc(fn) { const s = JSON.parse(localStorage.getItem('sess') || '{}'); const r = await fetch(C.supabaseUrl + '/rest/v1/rpc/' + fn, { method: 'POST', headers: { apikey: C.supabaseKey, Authorization: 'Bearer ' + s.token, 'Content-Type': 'application/json' }, body: '{}' }); if (!r.ok) throw new Error('読み込めませんでした（' + r.status + '）'); return r.json(); }
function srMe() { const s = JSON.parse(localStorage.getItem('sess') || '{}'); return JSON.parse(atob(s.token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub; }
async function renderReport() {
  const back = `<button class="back" onclick="location.hash=''">← 事業所えらびへ</button>`;
  if (DEMO) return $('view').innerHTML = back + '<h3>報告</h3>' + demoNote() + '<p>見本モードでは表示しません。</p>';
  $('view').innerHTML = '<p>読み込み中…</p>';
  try {
    const me = srMe(), day = srToday();
    const [reps, todos] = await Promise.all([sb(`staff_report?staff=eq.${me}&order=day.desc&limit=7`), sb(`staff_todo?assignee=eq.${me}&status=neq.done&order=due.asc.nullslast,created_at`)]);
    const t = reps.find(r => r.day === day);
    $('view').innerHTML = back + `<div id="chair_msg">${typeof chairMsgHtml === 'function' ? await chairMsgHtml() : ''}</div><h3>今日の報告</h3>
      <div class="card">
      <button onclick="srSend(true)" style="font-size:20px;padding:14px 24px;width:100%">問題なし</button>
      <p>または1行でOK：<textarea id="sr_b" rows="3" maxlength="2000" style="width:100%;font-size:16px" placeholder="今日やったこと">${esc(t && !t.no_problem ? t.body || '' : '')}</textarea></p>
      <p>困りごと（あれば）：<textarea id="sr_t" rows="2" maxlength="2000" style="width:100%;font-size:16px">${esc(t?.trouble || '')}</textarea></p>
      <button onclick="srSend(false)" style="font-size:18px;padding:10px 24px">送る</button> <span id="sr_m" class="note"></span></div>
      <h3>私のToDo（指示）</h3>${todos.length ? todos.map(x => `<div class="card"><b>${esc(x.title)}</b>${x.link && /^#[\w/-]*$/.test(x.link) ? ` <a href="${x.link}">→ 開いて直す</a>` : ''}${x.due ? `<small>　期限 ${esc(x.due)}</small>` : ''}
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
  if (DEMO) return $('view').innerHTML = back + '<h3>報告（朝の確認）</h3>' + demoNote() + '<p>見本モードでは表示しません。</p>';
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
    $('view').innerHTML = back + `<h3>報告（朝の確認）　${esc(day)}</h3>
      ${sec(`📭 今日まだ報告がない人（${miss.length}／${targets.length}）`, miss.length ? miss.map(r => `<p>${esc(r.name)}　<small>最後の報告：${esc(last(r.user_id) || '14日以内なし')}</small></p>`).join('') : '<p>全員報告済みです。</p>')}
      ${sec(`⏳ 動いていないToDo（${stale.length}）`, stale.length ? stale.map(x => `<p>${esc(nm[x.assignee] || '？')}：<b>${esc(x.title)}</b>　<small>${srST[x.status]}・${srAgo(x.updated_at)}日動きなし${x.due ? '・期限 ' + esc(x.due) : ''}${x.due && x.due < day ? ' ⚠️期限切れ' : ''}</small> <button class="back" onclick="srDel(${x.id})">消す</button></p>`).join('') : '<p>ありません。</p>')}
      ${sec(`🆘 スタッフの困りごと（直近7日 ${troubles.length}）`, troubles.length ? troubles.map(r => `<p>${esc(nm[r.staff] || '？')}　<small>${esc(r.day)}</small><br>${esc(r.trouble)}</p>`).join('') : '<p>ありません。</p>')}
      ${sec(`✅ 今日の報告（${today.length}）`, today.map(r => `<p>${esc(nm[r.staff] || '？')}：${r.no_problem ? '問題なし' : esc(r.body || '')}</p>`).join('') || '<p>まだありません。</p>')}
      <p class="note">全ToDo（未完了 ${todos.length}）は動きなし ${SR.staleDays} 日以上か期限切れのものだけ上に出しています。</p>`;
  } catch (e) { $('view').innerHTML = back + `<p>${esc(e.message)}（管理者のみ見られます）</p>`; }
}
async function srAdd() {
  const t = $('ta_t').value.trim(), m = $('ta_m'); if (!t) { m.textContent = '内容を入れてください。'; return; }
  try { await sb('staff_todo', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ assignee: $('ta_who').value, title: t, due: $('ta_d').value || null }) }); (document.getElementById('ch_rep') ? chairReport() : renderReportAdmin()); } catch (e) { m.textContent = e.message; }
}
async function srDel(id) { if (!confirm('このToDoを消しますか')) return; try { await sb('staff_todo?id=eq.' + id, { method: 'DELETE' }); (document.getElementById('ch_rep') ? chairReport() : renderReportAdmin()); } catch (e) { alert(e.message); } }

// 総合トップの「報告」に、自分宛ての未完了の指示の数を出す
async function todoBadge() {
  if (DEMO) return;
  try { const me = srMe(), t = await sb(`staff_todo?assignee=eq.${me}&status=eq.open&select=id`);
    const a = document.querySelector('a[href="#report"]'); if (a && t.length && !a.querySelector('.badge')) a.insertAdjacentHTML('afterbegin', `<span class="badge">新しい指示 ${t.length}</span>`);
  } catch (e) { }
}

// レオのホームの上に「私への依頼」（自分宛ての未完了）を出す
async function myTodoBox() {
  const el = document.getElementById('my_todo'); if (!el || DEMO || typeof sb !== 'function') return;
  try { const t = await sb(`staff_todo?assignee=eq.${srMe()}&status=neq.done&order=due.asc.nullslast,created_at&select=id,title,link,due,status`);
    el.innerHTML = t.length ? `<h3 class="nx">📌 私への依頼（${t.length}）</h3>` + t.map(x => { const ok = x.link && /^#[\w/-]*$/.test(x.link);
      return `<a class="card" href="${ok ? x.link : '#report'}" style="display:block;text-decoration:none;color:#222;border-left:6px solid #d33"><b>${esc(x.title)}</b>${x.due ? `<small>　期限 ${esc(x.due)}</small>` : ''}${x.status === 'doing' ? '<small>　やっている</small>' : ''}</a>`; }).join('') + '<p class="note">終わったら <a href="#report">私への依頼</a> ので「済」にしてください。</p>' : '';
  } catch (e) { }
}

// 総合トップの「私のやること」：自分宛ての未完了の依頼。未着手(open)は「新」、期限切れ・今日は赤
async function homeTodo() {
  const el = document.getElementById('home_todo_body'); if (!el) return;
  const empty = '<div class="ui-empty"><b>今日の依頼はありません</b>いつもの仕事を、ひとつずつ。</div>';
  if (DEMO || typeof sb !== 'function') { el.innerHTML = empty; return; }
  try {
    const t = await sb(`staff_todo?assignee=eq.${srMe()}&status=neq.done&order=due.asc.nullslast,created_at&select=id,title,link,due,status,office`);
    const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
    const nNew = t.filter(x => x.status === 'open').length;
    if (!t.length) { el.innerHTML = empty; return; }
    el.innerHTML = `<p class="ht-sub">${t.length}件${nNew ? `（うち新しい依頼 ${nNew}件）` : ''}</p>` + t.map(x => {
      const ok = x.link && /^#[\w/-]*$/.test(x.link), od = x.due && x.due <= today;
      const meta = [x.office ? esc(x.office) : '', x.due ? `<span class="${od ? 'ht-over' : ''}">期限 ${esc(x.due.slice(5).replace('-', '/'))}${x.due < today ? '（過ぎています）' : x.due === today ? '（今日）' : ''}</span>` : '', x.status === 'doing' ? 'やっている' : '未着手'].filter(Boolean).join('・');
      return `<a class="ui-list-row" href="${ok ? x.link : '#report'}">${x.status === 'open' ? '<span class="ui-badge">新</span>' : ''}<span class="ht-t"><b>${esc(x.title)}</b><small>${meta}</small></span><span aria-hidden="true">›</span></a>`;
    }).join('') + '<p class="ht-sub" style="margin-top:8px">終わったら <a href="#report">私への依頼</a> ので「済」に。</p>';
  } catch (e) { el.innerHTML = `<p class="ht-sub">読み込めませんでした（${esc(e.message)}）</p>`; }
}
