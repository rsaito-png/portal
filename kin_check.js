// 金斗雲 記録・署名漏れチェック (#kintoun/check) と 署名リンク発行。データは Supabase（kin_visit / kin_supply / kin_user）。
const KC = { month: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 7), link: null };
const KC_SIGN_URL = t => location.origin + location.pathname.replace(/[^/]*$/, '') + 'sign.html?t=' + t;
const kcMin = t => { const [h, m] = String(t || '00:00').split(':'); return +h * 60 + +m; };
async function kcIssue(uid, name) {
  try { const t = await sb('rpc/kin_sign_issue', { method: 'POST', body: JSON.stringify({ p_user_id: uid }) }); KC.link = { name, url: KC_SIGN_URL(t) }; renderKinCheck(); } catch (e) { alert(e.message); }
}
function kcCopy() { const i = $('kc_url'); i.select(); (navigator.clipboard ? navigator.clipboard.writeText(i.value) : Promise.resolve(document.execCommand('copy'))).then(() => $('kc_cm').textContent = 'コピーしました'); }
async function renderKinCheck() {
  const back = `<button class="back" onclick="location.hash='kintoun'">← 金斗雲へ</button>`;
  if (DEMO) { $('view').innerHTML = back + '<p>見本モードではチェック画面は表示しません（ログイン後に開きます）。</p>'; return; }
  $('view').innerHTML = '<p>読み込み中…</p>';
  try {
    const m = KC.month, [y, mo] = m.split('-').map(Number), next = new Date(Date.UTC(y, mo, 1)).toISOString().slice(0, 10), days = new Date(y, mo, 0).getDate();
    const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
    const [vs, us, sup] = await Promise.all([sb(`kin_visit?visit_date=gte.${m}-01&visit_date=lt.${next}&select=id,visit_date,user_id,staff_name,start_time,end_time,sign_status&order=visit_date,start_time`), sb('kin_user?select=id,name,jukyusha_no,valid_from,valid_to&order=name'), sb('kin_supply?weekday=not.is.null&start_time=not.is.null&service=eq.身体介護&select=user_id,weekday,start_time,end_time,plan_from,plan_to')]);
    const nm = Object.fromEntries(us.map(u => [u.id, u.name]));
    const pend = {}; vs.filter(v => v.sign_status !== '署名済み').forEach(v => (pend[v.user_id] = pend[v.user_id] || []).push(v));
    const noStaff = vs.filter(v => !v.staff_name);
    // 二重記録：同じ利用者・同じ日で時間帯が重なる
    const dup = [], by = {}; vs.forEach(v => (by[v.user_id + '|' + v.visit_date] = by[v.user_id + '|' + v.visit_date] || []).push(v));
    Object.values(by).forEach(a => { for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) if (kcMin(a[i].start_time) < kcMin(a[j].end_time) && kcMin(a[j].start_time) < kcMin(a[i].end_time)) dup.push([a[i], a[j]]); });
    // 記録漏れ：予定（曜日・時間帯）に対し、その日に重なる訪問（前後30分の余裕）が無い。今日まで
    const miss = [];
    for (let d = 1; d <= days; d++) { const ds = `${m}-${String(d).padStart(2, '0')}`; if (ds > today) break; const wd = new Date(ds + 'T00:00:00Z').getUTCDay();
      sup.filter(s => s.weekday === wd && (!s.plan_from || s.plan_from <= ds) && (!s.plan_to || s.plan_to >= ds)).forEach(s => {
        const a = kcMin(s.start_time) - 30, b = kcMin(s.end_time) + 30;
        if (!vs.some(v => v.user_id === s.user_id && v.visit_date === ds && kcMin(v.start_time) < b && a < kcMin(v.end_time))) miss.push({ ds, uid: s.user_id, s: s.start_time.slice(0, 5), e: s.end_time.slice(0, 5) }); }); }
    const noCert = us.filter(u => !u.jukyusha_no || !u.valid_from || !u.valid_to);
    const pendN = Object.values(pend).reduce((n, a) => n + a.length, 0);
    const stops = [['署名待ち', pendN], ['職員名が空', noStaff.length], ['二重記録', dup.length], ['記録漏れ', miss.length]];
    const stopN = stops.reduce((n, x) => n + x[1], 0);
    const li = KC.link ? `<div class="card" style="border:2px solid #2e6b4f"><b>${esc(KC.link.name)} さんの署名リンク</b>（1回限り・1週間）<br><input id="kc_url" readonly value="${esc(KC.link.url)}" style="width:100%" onclick="this.select()"><p><button onclick="kcCopy()">コピー</button> <span id="kc_cm"></span> <button class="back" onclick="KC.link=null;renderKinCheck()">閉じる</button></p><p class="note">このURLをご本人に送ってください（LINE等）。新しく発行すると古い未使用リンクは使えなくなります。</p></div>` : '';
    const pr = Object.entries(pend).map(([uid, a]) => `<tr><td>${esc(nm[uid] || '')}</td><td>${a.length}件</td><td><button onclick="kcIssue(${uid},'${esc(nm[uid] || '').replace(/'/g, '')}')">署名リンク発行</button></td></tr>`).join('');
    const sec = (t, n, body) => `<div class="card"><h4>${t}　${n ? `<span style="color:#b00">${n}件</span>` : '<span style="color:#2e6b4f">なし ✅</span>'}</h4>${n ? body : ''}</div>`;
    $('view').innerHTML = back + `<h3>金斗雲 記録・署名チェック</h3><p>月 <input type="month" value="${esc(m)}" onchange="KC.month=this.value||KC.month;renderKinCheck()"></p>${li}
    <div class="card" style="border-left:6px solid ${stopN ? '#c60' : '#2e6b4f'}"><b>請求CSV：${stopN ? '⛔ 止める（下の条件が残っています）' : '✅ 出せる状態（この月の記録上は）'}</b><br>${stops.map(([k, n]) => `${k} ${n}件`).join(' ／ ')}${noCert.length ? `<br><span style="color:#c60">受給者証番号・支給決定期間が空の利用者 ${noCert.length}名（これが空の間はCSVを出せません）</span>` : ''}<p class="note">訪問記録 ${vs.length}件。記録漏れは「身体介護の予定の曜日・時間帯（前後30分）に訪問記録がない日」を今日まで照合しています。</p></div>
    ${sec('署名待ち（利用者別）', pendN, `<table class="tbl"><tr><th>利用者</th><th>件数</th><th></th></tr>${pr}</table>`)}
    ${sec('職員名が空の訪問', noStaff.length, `<table class="tbl"><tr><th>提供日</th><th>利用者</th><th>時間</th></tr>${noStaff.map(v => `<tr><td>${v.visit_date}</td><td>${esc(nm[v.user_id] || '')}</td><td>${v.start_time.slice(0, 5)}〜${v.end_time.slice(0, 5)}</td></tr>`).join('')}</table>`)}
    ${sec('二重記録（同日・同時間帯の重複）', dup.length, `<table class="tbl">${dup.map(([a, b]) => `<tr><td>${a.visit_date}</td><td>${esc(nm[a.user_id] || '')}</td><td>${a.start_time.slice(0, 5)}〜${a.end_time.slice(0, 5)} と ${b.start_time.slice(0, 5)}〜${b.end_time.slice(0, 5)}</td></tr>`).join('')}</table>`)}
    ${sec('記録漏れ（予定に対し訪問記録なし）', miss.length, `<table class="tbl"><tr><th>日付</th><th>利用者</th><th>予定の時間帯</th></tr>${miss.map(x => `<tr><td>${x.ds}</td><td>${esc(nm[x.uid] || '')}</td><td>${x.s}〜${x.e}</td></tr>`).join('')}</table>`)}`;
  } catch (e) { $('view').innerHTML = back + `<p>${esc(e.message)}</p>`; }
}
