// 梁山泊：食事メニュー（日ごと）。打刻は共通の #dakoku。
const RZ = { day: '', rows: [], demo: {} };
const rzEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rzToday = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
async function rzLoad() {
  if (DEMO) return Object.values(RZ.demo).sort((a, b) => b.day.localeCompare(a.day));
  return await sb('ryozan_day_log?select=day,meal_menu,notes,author,updated_at&order=day.desc&limit=30') || [];
}
async function renderRyozanMeal() {
  const back = `<button class="back" onclick="location.hash='ryozan'">← 梁山泊へ</button>`;
  if (!RZ.day) RZ.day = rzToday();
  $('view').innerHTML = back + '<div class="card"><p>読み込み中…</p></div>';
  try { RZ.rows = await rzLoad(); } catch (e) { $('view').innerHTML = back + `<div class="card"><p>${rzEsc(e.message)}</p><p class="note">梁山泊の職員（所属か兼務）と、事務・管理者・会長が使えます。</p></div>`; return; }
  const cur = RZ.rows.find(r => r.day === RZ.day) || {};
  $('view').innerHTML = back + `<h3>🍱 食事メニュー</h3><div class="card">
    <label>日付 <input type="date" id="rz_day" value="${RZ.day}"></label>
    <p><label>食事メニュー（500字まで）<br><textarea id="rz_menu" maxlength="500" rows="4" style="width:100%">${rzEsc(cur.meal_menu)}</textarea></label></p>
    <p><label>連絡・備考（任意・4000字まで）<br><textarea id="rz_notes" maxlength="4000" rows="4" style="width:100%">${rzEsc(cur.notes)}</textarea></label></p>
    <button id="rz_save">保存</button> <span id="rz_msg" class="note"></span></div>
    <div class="card"><b>最近の記録</b>${RZ.rows.length ? '<ul>' + RZ.rows.map(r => `<li><a href="javascript:void 0" onclick="RZ.day='${r.day}';renderRyozanMeal()">${r.day}</a>：${rzEsc((r.meal_menu || '').slice(0, 40))}</li>`).join('') + '</ul>' : '<p class="note">まだありません</p>'}</div>`;
  $('rz_day').onchange = e => { RZ.day = e.target.value || rzToday(); renderRyozanMeal(); };
  $('rz_save').onclick = async () => {
    const row = { day: RZ.day, meal_menu: $('rz_menu').value.trim().slice(0, 500), notes: $('rz_notes').value.trim().slice(0, 4000) || null, author: (typeof MY_FULL_NAME === 'string' && MY_FULL_NAME) || null, updated_at: new Date().toISOString() };
    try {
      if (DEMO) RZ.demo[row.day] = row;
      else await sb('ryozan_day_log?on_conflict=day', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(row) });
      await renderRyozanMeal(); $('rz_msg').textContent = '保存しました';
    } catch (e) { $('rz_msg').textContent = e.message; }
  };
}
