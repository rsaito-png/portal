// 金斗雲 支給量と土曜の予定 (#kintoun/quota)。データは Supabase（kin_quota／kin_plan_day、計算は rpc kin_quota_month）。
// 1回＝count_minutes 分で数える（石田大雅さん 身体介護は30分）。予定＝週の固定予定 − 休み ＋ 追加。
// 追加・休みの取り消しで支給量をこえるときは DB（kin_plan_day_guard）で止まる。実績（記録）は止めず、ここと「今月の記録」で警告する。
const KQ = { month: null };
const KQ_WD = ['日', '月', '火', '水', '木', '金', '土'];
function kqMonthNow(add = 0) { const d = new Date(Date.now() + 9 * 3600e3); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + add); return d.toISOString().slice(0, 7); }
function kqToday() { return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); }
function kqHm(min) { const h = Math.floor(min / 60), m = min % 60; return (min < 0 ? '−' : '') + (h ? Math.abs(h) + '時間' : '') + (m ? Math.abs(m) + '分' : (h ? '' : '0分')); }
// sb と同じ通信。エラーのときは DB の文言（「支給量をこえます…」など）をそのまま出す。
async function kqApi(path, opt = {}, retried) {
  let s = JSON.parse(localStorage.getItem('sess') || '{}');
  if (s.exp && s.exp < Date.now() + 30000 && !retried && typeof refreshSess === 'function') { if (await refreshSess()) s = JSON.parse(localStorage.getItem('sess') || '{}'); }
  const r = await fetch(C.supabaseUrl + '/rest/v1/' + path, { ...opt, headers: { apikey: C.supabaseKey, Authorization: 'Bearer ' + s.token, 'Content-Type': 'application/json', ...(opt.headers || {}) } });
  if (r.status === 401 && !retried && typeof refreshSess === 'function' && await refreshSess()) return kqApi(path, opt, true);
  const tx = await r.text();
  if (!r.ok) { let m = ''; try { m = JSON.parse(tx).message || ''; } catch (e) {} throw new Error(m || ('保存できませんでした（' + r.status + '）')); }
  if (!tx) return null; try { return JSON.parse(tx); } catch (e) { return null; }
}
// 月の中の、ある曜日の日付（YYYY-MM-DD）
function kqDatesOf(month, wd) {
  const out = [], [y, m] = month.split('-').map(Number), n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  for (let d = 1; d <= n; d++) { const t = new Date(Date.UTC(y, m - 1, d)); if (t.getUTCDay() === wd) out.push(t.toISOString().slice(0, 10)); }
  return out;
}
async function renderKinQuota() {
  const back = `<button class="back" onclick="location.hash='kintoun'">← 金斗雲へ</button> `;
  if (typeof DEMO !== 'undefined' && DEMO) { $('view').innerHTML = back + '<p>見本モードでは表示しません（ログイン後に開きます）。</p>'; return; }
  KQ.month = KQ.month || kqMonthNow();
  $('view').innerHTML = back + '<p>読み込み中…</p>';
  try {
    const [rows, users] = await Promise.all([kqApi('rpc/kin_quota_month', { method: 'POST', body: JSON.stringify({ p_month: KQ.month }) }), kqApi('kin_user?select=id,name,supply_body_hours&order=name')]);
    const mb = `<p>月 <input type="month" id="kq_m" value="${esc(KQ.month)}" onchange="KQ.month=this.value||KQ.month;renderKinQuota()"> <button class="back" onclick="KQ.month='${kqMonthNow()}';renderKinQuota()">今月</button> <button class="back" onclick="KQ.month='${kqMonthNow(1)}';renderKinQuota()">来月</button></p>`;
    $('view').innerHTML = back + `<h3>支給量と土曜の予定</h3>
      <p class="note">受給者証の支給量（1か月の時間）を、平日の予定のあとに残った分だけ土曜などで使い切るための画面です。<br>1回は「数える分」で数えます（実際が20分でも30分など）。休みを入れると、その分だけ土曜を足せます。支給量をこえる追加は保存できません。</p>
      ${mb}${(rows || []).map(kqCard).join('') || '<p>まだ支給量の設定がありません。下で追加してください。</p>'}${kqAddForm(users || [])}`;
  } catch (e) { $('view').innerHTML = back + `<p>${esc(e.message)}</p>`; }
}
function kqCard(q) {
  const wd = KQ_WD[q.fill_weekday], days = q.days || [], byDate = {}; days.forEach(d => byDate[d.date] = d);
  const over = q.over_plan ? `<p style="color:#b00;font-weight:700">⚠ 予定が支給量をこえています（${kqHm(q.planned_minutes)}／${kqHm(q.monthly_minutes)}）。週の予定か追加を見直してください。</p>` : '';
  const overA = q.over_actual ? `<p style="color:#b00;font-weight:700">⚠ 記録（実績）が支給量をこえています（${q.actual_count}回＝${kqHm(q.actual_minutes)}）。こえた分は請求できません。サービス提供責任者に確認してください。</p>` : '';
  const ledger = q.ledger_hours != null && Math.round(q.ledger_hours * 60) !== q.monthly_minutes ? `<p style="color:#c60">⚠ 台帳の「身体介護 月支給量」は ${q.ledger_hours}時間です。ここの設定（${kqHm(q.monthly_minutes)}）と合っていません。</p>` : '';
  const fills = kqDatesOf(KQ.month, q.fill_weekday).map(d => {
    const x = byDate[d], lab = `${+d.slice(5, 7)}/${+d.slice(8)}（${wd}）`;
    if (x && x.kind === '追加') return `<tr><td>${lab}</td><td>✅ 予定あり</td><td><input type="time" id="kq_s_${x.id}" value="${esc((x.start || '').slice(0, 5))}"> 〜 <input type="time" id="kq_e_${x.id}" value="${esc((x.end || '').slice(0, 5))}"> <button class="inl sec" onclick="kqTime(${x.id})">時刻を保存</button></td><td><button class="back" onclick="kqDel(${x.id},'${lab}の予定を取り消しますか？')">取り消す</button></td></tr>`;
    if (x) return `<tr><td>${lab}</td><td>${esc(x.kind)}</td><td></td><td></td></tr>`;
    if (d < kqToday()) return `<tr><td>${lab}</td><td>—</td><td></td><td><span class="note">過ぎた日</span></td></tr>`;
    return `<tr><td>${lab}</td><td>—</td><td></td><td>${q.fill_can_add > 0 ? `<button onclick="kqAdd(${q.user_id},'${esc(q.service)}','${d}')">＋ ${wd}曜に入れる</button>` : '<span class="note">残りが足りません</span>'}</td></tr>`;
  }).join('');
  const offs = days.filter(d => d.kind === '休み').map(d => `<li>${+d.date.slice(5, 7)}/${+d.date.slice(8)}（${KQ_WD[new Date(d.date + 'T00:00:00Z').getUTCDay()]}） 休み${d.memo ? '：' + esc(d.memo) : ''} <button class="back" onclick="kqDel(${d.id},'休みを取り消して、もとの予定にもどしますか？')">取り消す</button></li>`).join('');
  const extraOther = days.filter(d => d.kind === '追加' && new Date(d.date + 'T00:00:00Z').getUTCDay() !== q.fill_weekday).map(d => `<li>${esc(d.date)} 追加 <button class="back" onclick="kqDel(${d.id},'この追加を取り消しますか？')">取り消す</button></li>`).join('');
  return `<div class="card"><h4>${esc(q.name)} さん　${esc(q.service)}</h4>${ledger}${over}${overA}
    <table class="tbl">
      <tr><th>支給量（1か月）</th><td>${kqHm(q.monthly_minutes)}（${q.monthly_minutes}分）・1回 ${q.count_minutes}分で数える</td></tr>
      <tr><th>週の予定の回数</th><td>${q.regular_count}回${q.off_count ? `（休み −${q.off_count}回）` : ''}</td></tr>
      <tr><th>追加した回数</th><td>${q.add_count}回（うち${wd}曜 ${q.fill_added}回）</td></tr>
      <tr><th>予定の合計</th><td><b>${q.planned_count}回 ＝ ${kqHm(q.planned_minutes)}</b></td></tr>
      <tr><th>残り</th><td><b style="font-size:1.15em">${kqHm(q.remain_minutes)}</b></td></tr>
      <tr><th>${wd}曜に入れられる回数</th><td><b style="font-size:1.25em;color:${q.fill_can_add ? '#0a7' : '#666'}">あと ${q.fill_can_add}回</b>（これからの${wd}曜で空いている日 ${q.fill_free}日）</td></tr>
      <tr><th>記録（実績）</th><td>${q.actual_count}回 ＝ ${kqHm(q.actual_minutes)}</td></tr>
    </table>
    <h4 style="margin-top:12px">${wd}曜の予定</h4><p class="note">時刻は決まってから入れれば大丈夫です。時刻が入ると「記録記入」の画面で予定として出ます。</p>
    <table class="tbl"><tr><th>日</th><th>状態</th><th>時刻</th><th></th></tr>${fills}</table>
    <h4 style="margin-top:12px">休み・キャンセル</h4><p class="note">週の予定の日が休みになったら入れてください。その分、${wd}曜を足せるようになります。</p>
    ${offs ? `<ul>${offs}</ul>` : '<p>なし</p>'}${extraOther ? `<ul>${extraOther}</ul>` : ''}
    <p>日付 <input type="date" id="kq_off_${q.quota_id}" min="${KQ.month}-01" max="${kqDatesOf(KQ.month, 0).length ? new Date(Date.UTC(+KQ.month.slice(0, 4), +KQ.month.slice(5, 7), 0)).toISOString().slice(0, 10) : ''}"> 理由 <input id="kq_offm_${q.quota_id}" maxlength="100" placeholder="例：入院・本人の都合" style="width:12rem"> <button onclick="kqOff(${q.user_id},'${esc(q.service)}',${q.quota_id})">休みにする</button></p>
    <details><summary>設定を直す</summary><p>支給量 <input id="kq_h_${q.quota_id}" type="number" min="0.5" step="0.5" value="${q.monthly_minutes / 60}" style="width:80px">時間　1回 <input id="kq_c_${q.quota_id}" type="number" min="1" value="${q.count_minutes}" style="width:70px">分で数える　埋める曜日 <select id="kq_w_${q.quota_id}">${KQ_WD.map((w, i) => `<option value="${i}"${i === q.fill_weekday ? ' selected' : ''}>${w}</option>`).join('')}</select> <button onclick="kqSaveSet(${q.quota_id})">保存</button></p></details>
  </div>`;
}
function kqAddForm(users) {
  return `<details class="card"><summary>ほかの利用者の支給量を追加</summary><p>利用者 <select id="kq_nu">${users.map(u => `<option value="${u.id}" data-h="${u.supply_body_hours ?? ''}">${esc(u.name)}</option>`).join('')}</select>
    種類 <select id="kq_ns"><option>身体介護</option><option>家事援助</option><option>通院等介助</option></select>
    支給量 <input id="kq_nh" type="number" min="0.5" step="0.5" style="width:80px">時間　1回 <input id="kq_nc" type="number" min="1" value="30" style="width:70px">分で数える　埋める曜日 <select id="kq_nw">${KQ_WD.map((w, i) => `<option value="${i}"${i === 6 ? ' selected' : ''}>${w}</option>`).join('')}</select>
    <button onclick="kqNew()">追加</button></p><p class="note">週の予定（曜日・時刻）は「台帳」の「支給と利用」に入っているものを使います。</p></details>`;
}
async function kqRun(fn) { try { await fn(); renderKinQuota(); } catch (e) { alert(e.message); } }
function kqAdd(uid, svc, d) { kqRun(() => kqApi('kin_plan_day', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ user_id: uid, service: svc, plan_date: d, kind: '追加' }) })); }
function kqOff(uid, svc, qid) {
  const d = $('kq_off_' + qid).value; if (!d) return alert('日付を選んでください');
  kqRun(() => kqApi('kin_plan_day', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ user_id: uid, service: svc, plan_date: d, kind: '休み', memo: ($('kq_offm_' + qid).value || '').trim() || null }) }));
}
function kqTime(id) { kqRun(() => kqApi('kin_plan_day?id=eq.' + id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ start_time: $('kq_s_' + id).value || null, end_time: $('kq_e_' + id).value || null }) })); }
function kqDel(id, msg) { if (!confirm(msg)) return; kqRun(() => kqApi('kin_plan_day?id=eq.' + id, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })); }
function kqSaveSet(qid) {
  const h = +$('kq_h_' + qid).value, c = +$('kq_c_' + qid).value; if (!(h > 0) || !(c > 0)) return alert('支給量と数える分を入れてください');
  kqRun(() => kqApi('kin_quota?id=eq.' + qid, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ monthly_minutes: Math.round(h * 60), count_minutes: Math.round(c), fill_weekday: +$('kq_w_' + qid).value, updated_at: new Date().toISOString() }) }));
}
function kqNew() {
  const h = +$('kq_nh').value, c = +$('kq_nc').value; if (!(h > 0) || !(c > 0)) return alert('支給量と数える分を入れてください');
  kqRun(() => kqApi('kin_quota', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ user_id: +$('kq_nu').value, service: $('kq_ns').value, monthly_minutes: Math.round(h * 60), count_minutes: Math.round(c), fill_weekday: +$('kq_nw').value }) }));
}
// 記録記入用：時刻の入った「追加」の予定を、その日だけの予定として足す
async function kqExtraSlots(users, supplies) {
  try {
    const from = new Date(Date.now() + 9 * 3600e3 - 40 * 864e5).toISOString().slice(0, 10);
    const rows = await kqApi(`kin_plan_day?kind=eq.追加&start_time=not.is.null&end_time=not.is.null&plan_date=gte.${from}&select=user_id,service,plan_date,start_time,end_time,memo`);
    const byId = {}; (users || []).forEach(u => byId[Number(u.id)] = u);
    return (rows || []).map(r => {
      const base = (supplies || []).find(s => Number(s.user_id) === Number(r.user_id) && s.service === r.service && s.building) || {};
      const u = byId[Number(r.user_id)] || {};
      return { userId: Number(r.user_id), user: u.name || '', kana: u.name_kana || '', building: String(base.building || '').trim(),
        start: String(r.start_time).slice(0, 5), end: String(r.end_time).slice(0, 5), days: [new Date(r.plan_date + 'T00:00:00Z').getUTCDay()],
        content: base.content || '', service: r.service, plan_from: r.plan_date, plan_to: r.plan_date };
    });
  } catch (e) { return []; }
}
// 今月の記録などに出す警告（実績が支給量をこえている人）
async function kqOverNote(month) {
  try {
    const rows = await kqApi('rpc/kin_quota_month', { method: 'POST', body: JSON.stringify({ p_month: month }) });
    const o = (rows || []).filter(q => q.over_actual || q.over_plan);
    return o.length ? `<p style="color:#b00;font-weight:700">⚠ 支給量をこえています：${o.map(q => esc(q.name) + '（' + esc(q.service) + '）').join('、')}　<a href="#kintoun/quota">支給量と土曜の予定を見る</a></p>` : '';
  } catch (e) { return ''; }
}
