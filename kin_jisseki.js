// 金斗雲 サービス提供実績記録表 (#kintoun/jisseki)。月次集計。確認済み（署名済み＋職員名あり）の訪問から、利用者別に日付・時間帯・算定コード・単位を集計。
// 算定コードは記録の実時間（開始〜終了）と開始時刻の時間帯で kin_service_code から引く。結果は kin_jisseki_line / kin_jisseki_month に保持（請求CSV J111/J611 の入力用）。
const KJ = { month: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 7), uid: null };
const kjHM = m => { const h = Math.floor(m / 60), r = m % 60; return (h ? h + '時間' : '') + (r ? r + '分' : ''); };
const kjCls = min => min < 30 ? '30分未満' : min < 60 ? '30分以上1時間未満' : (() => { const lo = Math.floor(min / 30) * 30; return kjHM(lo) + '以上' + kjHM(lo + 30) + '未満'; })();
const kjBand = (s, e) => { const a = kcMinS(s), b = kcMinS(e); let band, edge; if (a >= 360 && a < 480) { band = '早朝'; edge = 480; } else if (a >= 480 && a < 1080) { band = '日中'; edge = 1080; } else if (a >= 1080 && a < 1320) { band = '夜間'; edge = 1320; } else { band = '深夜'; edge = a >= 1320 ? 1800 : 360; } return { band, cross: b > edge }; };
const kcMinS = t => { const [h, m] = String(t).split(':'); return +h * 60 + +m; };
const kjNorm = s => String(s || '').replace(/\s/g, '');
async function kjBuild(uid) {
  const m = KJ.month, next = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 1)).toISOString().slice(0, 10);
  const [vs, codes] = await Promise.all([sb(`kin_visit?user_id=eq.${uid}&visit_date=gte.${m}-01&visit_date=lt.${next}&sign_status=eq.署名済み&staff_name=not.is.null&select=*&order=visit_date,start_time`), sb('kin_service_code?select=service,duration_class,time_band,code,units')]);
  const idx = {}; codes.forEach(c => idx[c.service + '|' + kjNorm(c.duration_class) + '|' + c.time_band] = c);
  const lines = vs.map(v => { const mins = v.actual_minutes, cls = kjCls(mins), { band, cross } = kjBand(v.start_time, v.end_time), c = idx[v.service + '|' + kjNorm(cls) + '|' + band]; const rv = []; if (!c) rv.push('コード未登録'); if (cross) rv.push('時間帯またぎ（合成コード未収録）');
    return { month: m, user_id: uid, visit_id: v.id, service_date: v.visit_date, start_time: v.start_time, end_time: v.end_time, actual_minutes: mins, service: v.service, time_band: band, duration_class: cls, service_code: c ? c.code : null, units: c ? c.units : null, review: rv.join('／') || null }; });
  await sb(`kin_jisseki_line?month=eq.${m}&user_id=eq.${uid}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  if (lines.length) await sb('kin_jisseki_line', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(lines) });
  const row = { month: m, user_id: uid, total_count: lines.length, total_minutes: lines.reduce((n, l) => n + l.actual_minutes, 0), total_units: lines.reduce((n, l) => n + (l.units || 0), 0), review_count: lines.filter(l => l.review).length, built_at: new Date().toISOString(), status: '集計済み' };
  await sb('kin_jisseki_month', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(row) });
}
async function kjRebuild(all) { try { const us = await sb('kin_user?select=id&order=name'); for (const u of (all ? us : [{ id: KJ.uid }])) await kjBuild(u.id); renderKinJisseki(); } catch (e) { alert(e.message); } }
async function renderKinJisseki() {
  const back = `<button class="back noprint" onclick="location.hash='kintoun'">← 金斗雲へ</button>`;
  if (DEMO) { $('view').innerHTML = back + '<p>見本モードでは表示しません（ログイン後に開きます）。</p>'; return; }
  $('view').innerHTML = '<p>読み込み中…</p>';
  try {
    const m = KJ.month, [us, ms, ls, vc] = await Promise.all([sb('kin_user?select=id,name,jukyusha_no&order=name'), sb(`kin_jisseki_month?month=eq.${m}&select=*`), sb(`kin_jisseki_line?month=eq.${m}&select=*&order=service_date,start_time`), sb(`kin_visit?visit_date=gte.${m}-01&visit_date=lt.${new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 1)).toISOString().slice(0, 10)}&select=user_id,sign_status,staff_name`)]);
    if (!KJ.uid && us.length) KJ.uid = us[0].id;
    const mm = Object.fromEntries(ms.map(x => [x.user_id, x])), nm = Object.fromEntries(us.map(u => [u.id, u]));
    const pend = {}; vc.forEach(v => { if (v.sign_status !== '署名済み' || !v.staff_name) pend[v.user_id] = (pend[v.user_id] || 0) + 1; });
    const sum = us.map(u => `<tr><td>${esc(u.name)}</td><td>${mm[u.id] ? mm[u.id].total_count + '回' : '未集計'}</td><td>${mm[u.id] ? kjHM(mm[u.id].total_minutes) : ''}</td><td>${mm[u.id] ? mm[u.id].total_units.toLocaleString() : ''}</td><td>${pend[u.id] ? `<span style="color:#c60">署名待ち・職員名空 ${pend[u.id]}件は対象外</span>` : ''}${mm[u.id] && mm[u.id].review_count ? ` <span style="color:#b00">要確認 ${mm[u.id].review_count}件</span>` : ''}</td><td><button class="back noprint" onclick="KJ.uid=${u.id};renderKinJisseki()">表を開く</button></td></tr>`).join('');
    const u = nm[KJ.uid] || {}, my = ls.filter(l => l.user_id === KJ.uid);
    $('view').innerHTML = back + `<div class="noprint"><h3>サービス提供実績記録表（月次集計）</h3><p>月 <input type="month" value="${esc(m)}" onchange="KJ.month=this.value||KJ.month;renderKinJisseki()"> <button onclick="kjRebuild(true)">全員を集計し直す</button></p>
    <p class="note">対象は確認済み（署名済み＋職員名あり）の訪問のみです。算定コードは実時間の区分と開始時刻の時間帯で決め、単位は基本部分（早朝・夜間・深夜は割増込みコード）です。加算（特定事業所加算・処遇改善加算）は請求CSVの生成時に計算します。受給者証番号・支給決定期間が埋まるまでCSVは出せません。</p>
    <table class="tbl"><tr><th>利用者</th><th>回数</th><th>時間</th><th>単位（基本）</th><th>注意</th><th></th></tr>${sum}</table></div>
    <div class="pr-doc card" style="margin-top:14px"><h2>サービス提供実績記録表　${esc(u.name || '')}　${m.slice(0, 4)}年${+m.slice(5)}月（居宅介護　金斗雲）</h2>
    <p class="noprint"><button onclick="kjRebuild(false)">この利用者を集計し直す</button> <button onclick="window.print()">🖨️ 印刷 / PDF保存</button> <button class="back" onclick="kjJson()">請求CSV用データ(JSON)を保存</button></p>
    ${my.length ? `<table><tr><th>日付</th><th>時間</th><th>実時間</th><th>時間帯</th><th>区分</th><th>サービスコード</th><th>単位</th><th>要確認</th></tr>${my.map(l => `<tr><td>${esc(l.service_date.slice(5).replace('-', '/'))}</td><td>${esc(l.start_time.slice(0, 5))}〜${esc(l.end_time.slice(0, 5))}</td><td>${l.actual_minutes}分</td><td>${esc(l.time_band || '')}</td><td>${esc(l.duration_class || '')}</td><td>${esc(l.service_code || '')}</td><td>${l.units ?? ''}</td><td>${esc(l.review || '')}</td></tr>`).join('')}<tr><th colspan="2">計 ${my.length}回</th><th>${kjHM(my.reduce((n, l) => n + l.actual_minutes, 0))}</th><th colspan="3"></th><th>${my.reduce((n, l) => n + (l.units || 0), 0).toLocaleString()}</th><th></th></tr></table>` : '<p>集計がありません（「集計し直す」を押してください。対象は署名済み＋職員名ありの訪問です）。</p>'}</div>`;
  } catch (e) { $('view').innerHTML = back + `<p>${esc(e.message)}</p>`; }
}
async function kjJson() {
  const m = KJ.month, [ls, us, ms] = await Promise.all([sb(`kin_jisseki_line?month=eq.${m}&select=*&order=user_id,service_date,start_time`), sb('kin_user?select=id,name,name_kana,jukyusha_no,city_no,valid_from,valid_to,decided_service_code,contract_start,cap_amount,cap_mgmt,shien_kubun'), sb(`kin_jisseki_month?month=eq.${m}&select=*`)]);
  const d = { month: m, note: '請求CSV(J111/J611)入力用。確認済み訪問のみ。単位は基本部分。', users: us.map(u => ({ ...u, summary: ms.find(x => x.user_id === u.id) || null, lines: ls.filter(l => l.user_id === u.id) })).filter(u => u.lines.length) };
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 1)], { type: 'application/json' })); a.download = `kintoun_jisseki_${m}.json`; a.click();
}
