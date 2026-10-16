// 金斗雲 共通台帳 (#kintoun/ledger)。利用者／支給と利用／事業所設定／サービスコード表／書類履歴。データは Supabase（kin_user ほか）。実データは取り込み後に表示される。
const KL = { id: null, tab: 'user' };
const KL_SVC = ['身体介護', '家事援助', '通院等介助'], KL_WD = ['日', '月', '火', '水', '木', '金', '土'], KL_DOC = ['計画', 'アセスメント', '会議録'];
const klIn = (id, v, t = 'text', ex = '') => `<input id="${id}" type="${t}" value="${esc(v ?? '')}" ${ex}>`;
const klV = id => { const v = $(id).value.trim(); return v === '' ? null : v; };
function klWarn(u) {
  const w = [], t = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  if (!u.valid_from || !u.valid_to) w.push('支給決定期間が空欄'); else if (u.valid_to < t) w.push('受給者証の期限切れ');
  else if (u.valid_to < new Date(Date.now() + 9 * 3600e3 + 60 * 864e5).toISOString().slice(0, 10)) w.push('受給者証 60日以内に期限');
  if (!u.jukyusha_no) w.push('受給者証番号が空欄');
  return w;
}
async function renderKinLedger() {
  const back = `<button class="back" onclick="location.hash='kintoun'">← 金斗雲へ</button>`;
  if (DEMO) { $('view').innerHTML = back + '<p>見本モードでは台帳は表示しません（ログイン後に開きます）。</p>'; return; }
  $('view').innerHTML = '<p>読み込み中…</p>';
  const tabs = [['user', '利用者'], ['office', '事業所設定'], ['code', 'サービスコード表']].map(([k, l]) => `<button class="${KL.tab === k && !KL.id ? '' : 'back'}" onclick="KL.id=null;KL.tab='${k}';renderKinLedger()">${l}</button>`).join(' ');
  try {
    if (KL.id) return $('view').innerHTML = back + await klUserView(KL.id);
    $('view').innerHTML = back + `<h3>金斗雲 台帳</h3><p>${tabs}</p>` + await ({ user: klList, office: klOffice, code: klCode }[KL.tab])();
  } catch (e) { $('view').innerHTML = back + `<p>${esc(e.message)}</p>`; }
}
async function klList() {
  const us = await sb('kin_user?select=*&order=name');
  const rows = us.map(u => { const w = klWarn(u);
    return `<tr><td>${esc(u.name)}</td><td>${esc(u.city || '')}</td><td>${esc(u.valid_to || '')}</td><td>${u.needs_check ? '<b style="color:#c60">⚠要確認</b> ' + esc(u.check_memo || '') : ''}${w.map(x => `<span style="color:#b00">⚠${esc(x)}</span>`).join(' ')}</td><td><button onclick="KL.id=${u.id};renderKinLedger()">開く</button></td></tr>`; }).join('');
  return `<p><button onclick="klNew()">＋利用者を追加</button></p>` + (us.length ? `<table class="tbl"><tr><th>氏名</th><th>市町村</th><th>有効期限</th><th>注意</th><th></th></tr>${rows}</table><p>${us.length}名／要確認 ${us.filter(u => u.needs_check).length}名／警告あり ${us.filter(u => klWarn(u).length).length}名</p>` : '<p>まだ登録がありません（データ取り込み待ちです）。</p>');
}
async function klNew() { const n = prompt('利用者の氏名'); if (!n || !n.trim()) return;
  try { const r = await sb('kin_user', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ name: n.trim() }) }); KL.id = r[0].id; renderKinLedger(); } catch (e) { alert(e.message); } }
async function klUserView(id) {
  const [[u], sup, docs] = await Promise.all([sb(`kin_user?id=eq.${id}&select=*`), sb(`kin_supply?user_id=eq.${id}&select=*&order=weekday,start_time`), sb(`kin_doc?user_id=eq.${id}&select=*&order=doc_type,version`)]);
  if (!u) return '<p>見つかりません</p>';
  const f = (k, l, t = 'text', ex = '') => `<label>${l}<br>${klIn('ku_' + k, u[k], t, ex)}</label>`;
  const sr = sup.map(s => `<tr><td>${esc(s.service)}</td><td>${s.monthly_amount ?? ''}${esc(s.amount_unit || '')}</td><td>${s.weekday == null ? '' : KL_WD[s.weekday]}</td><td>${esc((s.start_time || '').slice(0, 5))}〜${esc((s.end_time || '').slice(0, 5))}</td><td>${s.supply_minutes ?? ''}</td><td>${esc(s.content || '')}</td><td>${esc(s.building || '')}</td><td>${esc(s.plan_from || '')}〜${esc(s.plan_to || '')}</td><td><button class="back" onclick="klDel('kin_supply',${s.id})">削除</button></td></tr>`).join('');
  const dr = docs.map(d => `<tr><td>${esc(d.doc_type)}</td><td>v${d.version}</td><td>${esc(d.created_on || '')}</td><td>${esc(d.signed_on || '')}</td><td>${d.locked ? '🔒' : ''}</td><td><button class="back" onclick="klLock(${d.id},${!d.locked})">${d.locked ? '解除' : 'ロック'}</button> <button class="back" onclick="klDocEdit(${d.id},'${esc(d.created_on || '')}','${esc(d.signed_on || '')}',${d.locked})">日付</button></td></tr>`).join('');
  return `<h3>${esc(u.name)}</h3>${klWarn(u).map(x => `<p style="color:#b00">⚠ ${esc(x)}</p>`).join('')}
  <div class="card"><h4>基本・受給者証</h4>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px">
  ${f('name', '氏名')}${f('birth', '生年月日', 'date')}${f('address', '住所')}${f('phone', '電話')}${f('emergency', '緊急連絡先')}${f('jukyusha_no', '受給者証番号')}${f('city', '市町村')}${f('city_no', '市町村番号')}${f('shien_kubun', '障害支援区分')}${f('valid_from', '支給決定 開始', 'date')}${f('valid_to', '支給決定 終了', 'date')}${f('soudan_office', '相談支援事業所')}${f('soudan_person', '相談員')}${f('sabisek', 'サービス提供責任者')}${f('cap_amount', '負担上限額（円）', 'number', 'min=0')}${f('cap_from', '上限額 開始', 'date')}${f('cap_to', '上限額 終了', 'date')}${f('start_date', 'サービス開始日', 'date')}</div>
  <p><label><input type="checkbox" id="ku_cap_mgmt" style="width:auto" ${u.cap_mgmt ? 'checked' : ''}> 上限額管理が必要</label>　<label><input type="checkbox" id="ku_needs_check" style="width:auto" ${u.needs_check ? 'checked' : ''}> ⚠要確認</label></p>
  <label>要確認メモ<br>${klIn('ku_check_memo', u.check_memo)}</label>
  <p><button onclick="klSaveUser(${u.id})">保存</button> <button class="back" onclick="KL.id=null;renderKinLedger()">一覧へ</button> <span id="ku_m"></span></p></div>
  <div class="card"><h4>支給と利用（複数行）</h4>${sup.length ? `<table class="tbl"><tr><th>種別</th><th>月の支給量</th><th>曜日</th><th>時間帯</th><th>支給時間(分)</th><th>支援内容</th><th>建物</th><th>計画期間</th><th></th></tr>${sr}</table>` : '<p>なし</p>'}
  <p>追加：<select id="ks_service">${KL_SVC.map(s => `<option>${s}</option>`).join('')}</select> 月の支給量 <input id="ks_amt" type="number" min="0" step="0.5" style="width:80px"><select id="ks_unit"><option>時間</option><option>回</option></select> 曜日 <select id="ks_wd"><option value="">-</option>${KL_WD.map((w, i) => `<option value="${i}">${w}</option>`).join('')}</select> <input id="ks_st" type="time"> 〜 <input id="ks_en" type="time"> 支給時間(分) <input id="ks_min" type="number" min="1" style="width:70px"><br>支援内容 <input id="ks_ct"> 建物 <input id="ks_bd"> 計画 <input id="ks_pf" type="date">〜<input id="ks_pt" type="date"> <button onclick="klAddSup(${u.id})">追加</button></p></div>
  <div class="card"><h4>書類履歴</h4>${docs.length ? `<table class="tbl"><tr><th>書類</th><th>版</th><th>作成日</th><th>署名日</th><th>固定</th><th></th></tr>${dr}</table>` : '<p>なし</p>'}
  <p>追加：<select id="kd_t">${KL_DOC.map(s => `<option>${s}</option>`).join('')}</select> 版 <input id="kd_v" type="number" min="1" value="1" style="width:60px"> 作成日 <input id="kd_c" type="date"> 署名日 <input id="kd_s" type="date"> <button onclick="klAddDoc(${u.id})">追加</button></p><p class="note">🔒ロック中は作成日・署名日を変更できません（解除は管理側のみ）。</p></div>
  <p><button class="back" onclick="klDelUser(${u.id})">この利用者を削除</button></p>`;
}
async function klSaveUser(id) {
  const g = k => klV('ku_' + k), b = { name: g('name') }; if (!b.name) return $('ku_m').textContent = '氏名は必須です';
  ['birth', 'address', 'phone', 'emergency', 'jukyusha_no', 'city', 'city_no', 'shien_kubun', 'valid_from', 'valid_to', 'soudan_office', 'soudan_person', 'sabisek', 'cap_from', 'cap_to', 'start_date', 'check_memo'].forEach(k => b[k] = g(k));
  b.cap_amount = g('cap_amount') == null ? null : +g('cap_amount'); b.cap_mgmt = $('ku_cap_mgmt').checked; b.needs_check = $('ku_needs_check').checked; b.updated_at = new Date().toISOString();
  try { await sb(`kin_user?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(b) }); renderKinLedger(); } catch (e) { $('ku_m').textContent = e.message; }
}
async function klAddSup(uid) {
  const n = k => klV(k) == null ? null : +klV(k);
  const b = { user_id: uid, service: $('ks_service').value, monthly_amount: n('ks_amt'), amount_unit: $('ks_unit').value, weekday: n('ks_wd'), start_time: klV('ks_st'), end_time: klV('ks_en'), supply_minutes: n('ks_min'), content: klV('ks_ct'), building: klV('ks_bd'), plan_from: klV('ks_pf'), plan_to: klV('ks_pt') };
  try { await sb('kin_supply', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(b) }); renderKinLedger(); } catch (e) { alert(e.message); }
}
async function klAddDoc(uid) {
  try { await sb('kin_doc', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ user_id: uid, doc_type: $('kd_t').value, version: +$('kd_v').value || 1, created_on: klV('kd_c'), signed_on: klV('kd_s') }) }); renderKinLedger(); } catch (e) { alert(e.message); }
}
async function klLock(id, v) { try { await sb(`kin_doc?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ locked: v, updated_at: new Date().toISOString() }) }); renderKinLedger(); } catch (e) { alert(e.message); } }
async function klDocEdit(id, c, s, locked) {
  if (locked) return alert('ロック中です。先に解除してください（管理側のみ）。');
  const nc = prompt('作成日 (YYYY-MM-DD、空で消去)', c); if (nc === null) return; const ns = prompt('署名日 (YYYY-MM-DD、空で消去)', s); if (ns === null) return;
  try { await sb(`kin_doc?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ created_on: nc.trim() || null, signed_on: ns.trim() || null, updated_at: new Date().toISOString() }) }); renderKinLedger(); } catch (e) { alert(e.message); }
}
async function klDel(t, id) { if (!confirm('削除しますか？')) return; try { await sb(`${t}?id=eq.${id}`, { method: 'DELETE' }); renderKinLedger(); } catch (e) { alert(e.message); } }
async function klDelUser(id) { if (!confirm('この利用者と、支給・書類履歴をすべて削除します。よろしいですか？')) return; try { await sb(`kin_user?id=eq.${id}`, { method: 'DELETE' }); KL.id = null; renderKinLedger(); } catch (e) { alert(e.message); } }
async function klOffice() {
  const [o] = await sb('kin_office_setting?select=*&order=id.desc&limit=1'); const ad = (o && o.additions) || [];
  const names = ['特定事業所加算Ⅱ', '処遇改善加算Ⅱ', '早朝', '夜間', '深夜'];
  const act = n => (ad.find(a => a.name === n) || {}).active ? 'checked' : '';
  return `<div class="card"><h4>事業所設定（利用者とは別）</h4><p class="note">編集は管理側のみ。加算・減算は請求CSV生成時に必ず反映します。</p>
  <p><label>事業所番号 ${klIn('ko_no', o && o.office_no)}</label> <label>地域区分 ${klIn('ko_area', o && o.area_grade, 'text', 'placeholder="7級地"')}</label></p>
  <p>${names.map((n, i) => `<label style="margin-right:14px"><input type="checkbox" id="ko_a${i}" style="width:auto" ${act(n)}> ${n}</label>`).join('')}</p>
  <p><button onclick="klSaveOffice(${o ? o.id : 'null'})">保存</button> <span id="ko_m"></span></p></div>`;
}
async function klSaveOffice(id) {
  const [o0] = id ? await sb(`kin_office_setting?id=eq.${id}&select=additions`) : [null]; const old = (o0 && o0.additions) || [];
  const names = ['特定事業所加算Ⅱ', '処遇改善加算Ⅱ', '早朝', '夜間', '深夜'];
  const b = { office_no: klV('ko_no'), area_grade: klV('ko_area'), additions: old.filter(a => !names.includes(a.name)).concat(names.map((n, i) => Object.assign({ kind: '加算' }, old.find(a => a.name === n) || {}, { active: $('ko_a' + i).checked }))), updated_at: new Date().toISOString() };
  try { await sb(id ? `kin_office_setting?id=eq.${id}` : 'kin_office_setting', { method: id ? 'PATCH' : 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(b) }); $('ko_m').textContent = '保存しました'; } catch (e) { $('ko_m').textContent = e.message + '（管理側のみ編集できます）'; }
}
async function klCode() {
  const cs = await sb('kin_service_code?select=*&order=service,id');
  return `<p class="note">国保連のコード表と照合して登録します（令和8年6月施行版・居宅介護。身体介護の時間区分：30分未満／30分以上1時間未満／1時間以上1時間30分未満／以降30分刻み（20分以上30分未満の区分は居宅介護にはありません）。時間区分は記録の開始〜終了の実時間で決めます。</p>` +
    (cs.length ? `<table class="tbl"><tr><th>種別</th><th>時間区分</th><th>時間帯区分</th><th>コード</th><th>単位</th><th>備考</th></tr>${cs.map(c => `<tr><td>${esc(c.service)}</td><td>${esc(c.duration_class || '')}</td><td>${esc(c.time_band || '')}</td><td>${esc(c.code || '')}</td><td>${c.units ?? ''}</td><td>${esc(c.memo || '')}</td></tr>`).join('')}</table>` : '<p>未登録</p>');
}
