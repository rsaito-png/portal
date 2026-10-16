// 金斗雲 訪問記録 (#kintoun/visit)。最小の一覧・追加・編集。データは Supabase kin_visit。実時間は開始〜終了からDBが自動計算（表示のみ）。
const KV = { id: null, month: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 7) };
const kvIn = (id, v, t = 'text', ex = '') => `<input id="${id}" type="${t}" value="${esc(v ?? '')}" ${ex}>`;
const kvV = id => { const v = $(id).value.trim(); return v === '' ? null : v; };
async function renderKinVisit() {
  const back = `<button class="back" onclick="location.hash='kintoun'">← 金斗雲へ</button>`;
  if (DEMO) { $('view').innerHTML = back + '<p>見本モードでは訪問記録は表示しません（ログイン後に開きます）。</p>'; return; }
  $('view').innerHTML = '<p>読み込み中…</p>';
  try { $('view').innerHTML = back + (KV.id ? await kvForm(KV.id) : await kvList()); } catch (e) { $('view').innerHTML = back + `<p>${esc(e.message)}</p>`; }
}
async function kvList() {
  const m = KV.month, next = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 1)).toISOString().slice(0, 10);
  const [vs, us] = await Promise.all([sb(`kin_visit?visit_date=gte.${m}-01&visit_date=lt.${next}&select=*&order=visit_date.desc,start_time`), sb('kin_user?select=id,name&order=name')]);
  const nm = Object.fromEntries(us.map(u => [u.id, u.name]));
  const rows = vs.map(v => `<tr><td>${esc(v.visit_date)}</td><td>${esc(nm[v.user_id] || '')}</td><td>${esc(v.staff_name)}${v.second_staff ? '＋' + esc(v.second_staff) : ''}</td><td>${esc(v.service)}</td><td>${esc(v.start_time.slice(0, 5))}〜${esc(v.end_time.slice(0, 5))}</td><td>${v.actual_minutes}分</td><td>${esc(v.addition || '')}</td><td>${v.sign_status === '署名済み' ? '✅' : '⬜未署名'}</td><td>${v.staff_confirmed ? '職✔' : ''}${v.sab_confirmed ? ' サ✔' : ''}</td><td><button onclick="KV.id=${v.id};renderKinVisit()">開く</button></td></tr>`).join('');
  return `<h3>金斗雲 訪問記録</h3><p>月 <input type="month" id="kv_m" value="${esc(m)}" onchange="KV.month=this.value||KV.month;renderKinVisit()"> <button onclick="KV.id='new';renderKinVisit()">＋訪問を追加</button></p>` +
    (vs.length ? `<table class="tbl"><tr><th>提供日</th><th>利用者</th><th>職員</th><th>種別</th><th>時間</th><th>実時間</th><th>加算</th><th>署名</th><th>確認</th><th></th></tr>${rows}</table><p>${vs.length}件／未署名 ${vs.filter(v => v.sign_status !== '署名済み').length}件</p>` : '<p>この月の記録はありません。</p>');
}
async function kvForm(id) {
  const [us, vs] = await Promise.all([sb('kin_user?select=id,name&order=name'), id === 'new' ? Promise.resolve([{}]) : sb(`kin_visit?id=eq.${id}&select=*`)]);
  const v = vs[0]; if (!v) return '<p>見つかりません</p>';
  const f = (k, l, t = 'text', ex = '') => `<label>${l}<br>${kvIn('kv_' + k, v[k], t, ex)}</label>`;
  const ta = (k, l) => `<label>${l}<br><textarea id="kv_${k}" rows="2" style="width:100%">${esc(v[k] ?? '')}</textarea></label>`;
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  return `<h3>訪問記録 ${id === 'new' ? '（新規）' : ''}</h3><div class="card">
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px">
  <label>提供日<br>${kvIn('kv_visit_date', v.visit_date || today, 'date')}</label>
  <label>利用者<br><select id="kv_user_id">${us.map(u => `<option value="${u.id}" ${u.id === v.user_id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></label>
  ${f('staff_name', '職員')}${f('second_staff', '2人目の職員')}
  <label>サービス区分<br><select id="kv_service">${KL_SVC.map(s => `<option ${s === (v.service || '身体介護') ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
  <label>開始<br>${kvIn('kv_start_time', (v.start_time || '').slice(0, 5), 'time')}</label><label>終了<br>${kvIn('kv_end_time', (v.end_time || '').slice(0, 5), 'time')}</label>
  <label>実時間（自動・表示のみ）<br><input value="${v.actual_minutes != null ? v.actual_minutes + '分' : '保存時に自動計算'}" disabled></label>
  ${f('addition', '加算（緊急時対応・初回加算など）')}${f('instruction_id', '指示ID')}</div>
  ${ta('content', '提供内容')}${ta('note', '特記事項')}${[1, 2, 3, 4, 5].map(i => ta('report' + i, '報告' + i)).join('')}
  <p>署名：${v.sign_status || '未署名'}${v.signed_at ? '（' + esc(new Date(v.signed_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })) + '／' + esc(v.signer_kind || '') + '）' : ''}　<label><input type="checkbox" id="kv_staff_confirmed" style="width:auto" ${v.staff_confirmed ? 'checked' : ''}> 職員確認</label>　<label><input type="checkbox" id="kv_sab_confirmed" style="width:auto" ${v.sab_confirmed ? 'checked' : ''}> サ責確認</label></p>
  <p><button onclick="kvSave('${id}')">保存</button> <button class="back" onclick="KV.id=null;renderKinVisit()">一覧へ</button> ${id !== 'new' ? `<button class="back" onclick="kvDel(${id})">削除</button>` : ''} <span id="kv_msg"></span></p></div>`;
}
async function kvSave(id) {
  const b = { visit_date: kvV('kv_visit_date'), user_id: +$('kv_user_id').value, staff_name: kvV('kv_staff_name'), service: $('kv_service').value, start_time: kvV('kv_start_time'), end_time: kvV('kv_end_time'), staff_confirmed: $('kv_staff_confirmed').checked, sab_confirmed: $('kv_sab_confirmed').checked, updated_at: new Date().toISOString() };
  ['second_staff', 'addition', 'instruction_id', 'content', 'note', 'report1', 'report2', 'report3', 'report4', 'report5'].forEach(k => b[k] = kvV('kv_' + k));
  if (!b.visit_date || !b.staff_name || !b.start_time || !b.end_time) return $('kv_msg').textContent = '提供日・職員・開始・終了は必須です';
  if (b.end_time <= b.start_time) return $('kv_msg').textContent = '終了は開始より後にしてください（日またぎは不可）';
  try { await sb(id === 'new' ? 'kin_visit' : `kin_visit?id=eq.${id}`, { method: id === 'new' ? 'POST' : 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(b) }); KV.id = null; renderKinVisit(); } catch (e) { $('kv_msg').textContent = e.message; }
}
async function kvDel(id) { if (!confirm('この訪問記録を削除しますか？')) return; try { await sb(`kin_visit?id=eq.${id}`, { method: 'DELETE' }); KV.id = null; renderKinVisit(); } catch (e) { alert(e.message); } }
