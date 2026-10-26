// レオ 送迎：来月の利用予定を保護者に聞く（職員画面）。保護者の画面は yotei.html?t=…（ログインなし）
// 保護者への聞き取りはポータルが本番（11月分から）。リンクをコピーして公式LINEに貼るのは職員（ポータルは送信しない）
let YT_MONTH = (() => { const t = today(), d = new Date(t + 'T00:00:00+09:00'); d.setDate(1); d.setMonth(d.getMonth() + 1); return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' }).slice(0, 7) + '-01'; })();
const ytAddMonth = n => { const d = new Date(YT_MONTH + 'T00:00:00+09:00'); d.setMonth(d.getMonth() + n); YT_MONTH = d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' }).slice(0, 7) + '-01'; renderLeoView('yotei'); };
const ytDT = s => s ? new Date(s).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
const ytUrl = tok => `${location.origin}${location.pathname.replace(/[^/]*$/, '')}yotei.html?t=${tok}`;
const ytMsg = (child, url, dl, remind) => `【レオ】${+YT_MONTH.slice(5, 7)}月のご利用予定の確認${remind ? '（お願い）' : ''}\n${remind ? 'まだご回答をいただいていません。お手数ですが、' : ''}${child}さんの${+YT_MONTH.slice(5, 7)}月のご利用予定を、こちらから ${dl} までにお知らせください。\n${url}\n（ご家庭ごとの専用リンクです。ほかの方には送らないでください。いつもどおりなら、開いて「送信する」を押すだけです）`;
const ytCanon = child => typeof canonChildName === 'function' ? canonChildName(child) : String(child ?? '').replace(/\s+/g, ' ').trim();
let YT_ROWS = [];
LEO_VIEWS.yotei = async function () {
  const mgr = DEMO || canManage(), mn = +YT_MONTH.slice(5, 7);
  if (DEMO) YT_ROWS = [{ id: 1, child: '児童A', answered_at: '2026-11-17T01:00:00Z', answers: 1, usual: false, sent_at: '2026-11-16T01:00:00Z', send_count: 1, remind_count: 0, expires_at: '2026-11-24T15:00:00Z' },
    { id: 2, child: '児童B', answered_at: null, answers: 0, sent_at: '2026-11-16T01:00:00Z', send_count: 1, remind_count: 1, last_reminded_at: '2026-11-20T01:00:00Z', expires_at: '2026-11-24T15:00:00Z' },
    { id: 3, child: '児童C', answered_at: '2026-11-16T05:00:00Z', answers: 2, usual: true, sent_at: null, send_count: 0, remind_count: 0, expires_at: '2026-11-24T15:00:00Z' }];
  else YT_ROWS = await sb('rpc/leo_sched_status', { method: 'POST', body: JSON.stringify({ p_month: YT_MONTH }) });
  let kataNames = [];
  if (!DEMO) { try { kataNames = (await sheetRows('kata')).map(r => r['児童名']).filter(Boolean); } catch (e) { kataNames = []; } }
  const links = typeof resolveChildNames === 'function' ? resolveChildNames(kataNames, YT_ROWS.map(r => r.child)) : [];
  const ytFace = child => {
    const canon = ytCanon(child);
    const hits = links.filter(x => x.answer === child && x.kind === 'link');
    return hits.length === 1 && hits[0].kata !== canon ? `${canon}（型表では ${hits[0].kata}）` : canon;
  };
  const LEFT = await loadLeftIndex();
  const skipped = YT_ROWS.filter(r => leftBefore(LEFT, r.child, YT_MONTH));
  YT_ROWS = YT_ROWS.filter(r => !leftBefore(LEFT, r.child, YT_MONTH));
  const done = YT_ROWS.filter(r => r.answered_at), left = YT_ROWS.filter(r => !r.answered_at);
  const leftNote = r => { const d = leftOnOf(LEFT, r.child); return d && d >= YT_MONTH ? `<br><small style="color:#c60">退所日 ${esc(d.replace(/-/g, '/'))} まで。翌日以降はこの月の予定に入れません。</small>` : ''; };
  const row = r => `<div class="card"><b style="font-size:17px">■${esc(ytFace(r.child))}</b>　${r.answered_at ? `<span style="color:#080">✅ 回答済み ${ytDT(r.answered_at)}</span> <small>${r.usual ? 'いつもどおり' : '個別の連絡あり'}${r.answers > 1 ? `（${r.answers}回目）` : ''}</small>` : '<span style="color:#c60">⬜ まだ</span>'}
    <br><small>${r.sent_at ? `リンクを送った：${ytDT(r.sent_at)}${r.remind_count ? `／催促${r.remind_count}回（最後 ${ytDT(r.last_reminded_at)}）` : ''}` : 'まだリンクを送っていません'}　回答期限：${ytDT(r.expires_at)}</small>
    ${leftNote(r)}
    <div style="margin-top:6px">${mgr ? `<button onclick="ytCopy(${r.id},'${esc(ytCanon(r.child))}','send')">${r.sent_at ? 'リンクをもう一度コピー' : 'リンクをコピー'}</button>
      ${r.answered_at ? '' : `<button onclick="ytCopy(${r.id},'${esc(ytCanon(r.child))}','remind')">催促の文をコピー</button>`}` : ''}
      ${r.answers ? `<button onclick="ytShow(${r.id},'${esc(ytCanon(r.child))}')">回答を見る</button>` : ''}</div><div id="yt_${r.id}"></div></div>`;
  return `<h3>📅 来月の利用予定（保護者に聞く）</h3>${demoNote()}
    <p class="ptabs"><button onclick="ytAddMonth(-1)">← 前の月</button> <b style="font-size:18px">${YT_MONTH.slice(0, 4)}年${mn}月分</b> <button onclick="ytAddMonth(1)">次の月 →</button></p>
    <p class="note">保護者の画面（ログイン不要・児童ごとの専用リンク）で、曜日ごとの学校お迎え時刻、お休み、保護者が送る・迎えに来る日、追加利用、送り先が違う日を聞きます。前回・型表の内容が最初から入っています。
    <b>やること：①下の「全員分まとめてコピー」→ 公式LINEに児童ごとに貼って送る　②回答がそろったら「予定を作る」で確認して確定</b></p>
    ${!YT_ROWS.length ? `<div class="card"><p>${mn}月分の依頼はまだありません。</p>${mgr ? `<button onclick="ytOpen()">${mn}月分のリンクを作る（型表の児童。退所日がこの月より前の子は除く。作るだけで、誰にも送りません）</button><span id="yt_om"></span>` : ''}</div>`
    : `<p style="font-size:18px"><b>${done.length} / ${YT_ROWS.length}人 回答済み</b>${left.length ? `（まだ：${left.map(r => esc(ytFace(r.child))).join('、')}）` : ' ✅ 全員そろいました'}</p>${mgr ? `<div class="card"><button onclick="ytCopyAll('send')">全員分まとめてコピー（児童ごとのLINE文面つき）</button> <button onclick="ytCopyAll('remind')">まだの人だけ催促の文をまとめてコピー</button><br><small>児童ごとに「■名前」の見出しで区切ります。見出しごとに分けて、それぞれのご家庭にだけ送ってください（リンクは家庭ごとに別です）。</small><div id="yt_all"></div></div>` : ''}${left.map(row).join('')}${done.map(row).join('')}
      ${mgr ? `<div class="card"><h3>${mn}月分の予定を作る</h3><p class="note">回答（未回答は型表どおり）＋お休み・母の送迎から、${mn}月の 利用・迎え・送り を作ります。退所日の翌日以降の児童は入れません。型表は変更しません。まず確認だけ（何も書き込みません）。</p><button onclick="ytPlan()">${mn}月分の予定を作る（確認してから確定）</button><div id="yt_plan"></div></div>` : ''}`}
    ${skipped.length ? `<details style="margin-top:8px"><summary>退所のため、この月の予定に入れていない児童（${skipped.length}人）</summary><p class="note">${skipped.map(r => esc(ytFace(r.child))).join('、')}。依頼の記録は消していません。型表も変更していません。</p></details>` : ''}
    <p class="note" style="margin-top:12px"><a href="yotei.html?demo=1&m=${YT_MONTH.slice(0, 7)}" target="_blank">保護者の画面の見本（架空データ・送信されません）</a></p>`;
};
window.ytAddMonth = ytAddMonth;
async function ytOpen() {
  const m = document.getElementById('yt_om'); if (DEMO) { m.textContent = '見本モードです。'; return; }
  try { const n = await sb('rpc/leo_sched_open', { method: 'POST', body: JSON.stringify({ p_month: YT_MONTH }) }); renderLeoView('yotei'); }
  catch (e) { m.style.color = '#c00'; m.textContent = ' 作れませんでした：' + e.message; }
}
async function ytCopy(id, child, kind) {
  const B = copyBtnEl(); if (B) B.disabled = true;
  try { const r = YT_ROWS.find(x => x.id === id) || {};
    const tok = DEMO ? '0'.repeat(48) : await sb('rpc/leo_sched_link', { method: 'POST', body: JSON.stringify({ p_id: id, p_kind: kind }) });
    const text = ytMsg(child, DEMO ? `${location.origin}${location.pathname.replace(/[^/]*$/, '')}yotei.html?demo=1` : ytUrl(tok), ytDT(r.expires_at), kind === 'remind');
    const ok = await copyUrl(text);
    copyResult(B, text, ok, child, (kind === 'remind' ? '催促の文（リンクつき）' : '案内の文（リンクつき）') + 'をコピーしました。送ったことは記録しました。公式LINEに貼って送ってください。'); }
  catch (e) { copyError(B, e.message, child); }
  finally { if (B) B.disabled = false; }
}
async function ytShow(id, child) {
  const box = document.getElementById('yt_' + id); if (box.innerHTML) { box.innerHTML = ''; return; }
  try { let wd, ex; if (DEMO) { wd = [{ dow: '月', use: true, school_time: '15:00', pick_place: '〇〇小学校', drop_place: '自宅' }]; ex = [{ day: YT_MONTH.slice(0, 8) + '10', kind: '休み' }, { day: YT_MONTH.slice(0, 8) + '17', kind: '母の迎え', time: '16:00' }]; }
    else { const [allWd, allEx] = await Promise.all([sb(`leo_schedule_weekday?month=eq.${YT_MONTH}&order=dow`), sb(`leo_schedule_exception?month=eq.${YT_MONTH}&order=day`)]);
      const c = ytCanon(child); wd = allWd.filter(w => ytCanon(w.child) === c); ex = allEx.filter(x => ytCanon(x.child) === c); }
    box.innerHTML = `<div style="background:#f6f6f6;padding:8px;border-radius:6px;margin-top:6px;font-size:14px"><b>曜日</b><br>${wd.map(w => `${esc(w.dow)}：${w.use ? '利用' : '利用しない'}${w.school_time ? ' 学校お迎え ' + esc(w.school_time) : ''}${w.pick_place ? '（迎え ' + esc(w.pick_place) + '）' : ''}${w.drop_place && w.drop_place !== '自宅' ? '（送り ' + esc(w.drop_place) + '）' : ''}`).join('<br>') || '—'}
      <br><b>日ごとの連絡</b><br>${ex.map(x => `${x.day ? fmtDay(x.day) : '全体'} ${esc(x.kind)}${x.time ? ' ' + esc(x.time) : ''}${x.place ? ' ' + esc(x.place) : ''}${x.memo ? ' ' + esc(x.memo) : ''}`).join('<br>') || 'なし（いつもどおり）'}</div>`; }
  catch (e) { box.innerHTML = `<p style="color:#c00">${esc(e.message)}</p>`; }
}

async function ytCopyAll(kind) {
  const box = document.getElementById('yt_all'); box.innerHTML = '作っています…';
  try { const rows = YT_ROWS.filter(r => kind === 'remind' ? !r.answered_at : true), parts = [];
    if (!rows.length) { box.innerHTML = '対象の家庭がありません。'; return; }
    for (const r of rows) { const tok = DEMO ? '0'.repeat(48) : await sb('rpc/leo_sched_link', { method: 'POST', body: JSON.stringify({ p_id: r.id, p_kind: kind }) });
      parts.push(`■${ytCanon(r.child)}\n` + ytMsg(ytCanon(r.child), DEMO ? `${location.origin}${location.pathname.replace(/[^/]*$/, '')}yotei.html?demo=1` : ytUrl(tok), ytDT(r.expires_at), kind === 'remind')); }
    const text = parts.join('\n\n──────────\n\n'), ok = await copyUrl(text);
    box.innerHTML = `<p style="color:${ok ? '#080' : '#c60'}">${ok ? `✅ ${rows.length}家庭分をコピーしました。送ったことは記録しました。` : 'コピーできませんでした。下の文を選んでコピーしてください。'}</p><textarea rows="8" style="width:100%" readonly onclick="this.select()">${esc(text)}</textarea>`;
  } catch (e) { box.innerHTML = `<p style="color:#c00">${esc(e.message)}</p>`; }
}
const ytHm = r => r.kind === '利用' ? `${r.child} ${r.start_time || ''}-${r.end_time || ''}${r.parent_drop ? '（母の送り）' : r.parent_pick ? '（母の迎え）' : ''}` : r.kind === '休み' ? `${r.child} 休み` : `${r.kind === '迎え' ? '☆' : '★'}${(r.kids || []).join('→')} ${r.start_time || ''}-${r.end_time || ''} ${r.staff ? esc(r.staff).replace(/　/g, ' ') : '<b style="color:#c00">担当なし</b>'}${r.place ? '（' + esc(r.place) + '）' : ''}`;
async function ytPlan() {
  const box = document.getElementById('yt_plan'); box.innerHTML = '確認中…';
  try { if (DEMO) { box.innerHTML = '<p>見本モードです。</p>'; return; }
    const p = await sb('rpc/leo_sched_plan', { method: 'POST', body: JSON.stringify({ p_month: YT_MONTH }) });
    const ev = p.events || [], by = {}; ev.forEach(e => (by[e.day] = by[e.day] || []).push(e));
    const cnt = k => ev.filter(e => e.kind === k).length, mn = +YT_MONTH.slice(5, 7);
    box.innerHTML = `<p><b>${mn}月分の確認</b>：利用 ${cnt('利用')}件／休み ${cnt('休み')}件／迎え ${cnt('迎え')}件／送り ${cnt('送り')}件　（回答済み ${p.answered}/${p.children}人）</p>
      ${p.closed && p.closed.length ? `<p class="note">お休み（休所）：${p.closed.map(d => +d.slice(8) + '日').join('・')}</p>` : '<p class="note" style="color:#c60">⚠ 休所日が登録されていません。祝日（11/3・11/23 など）や休みの日は、児童の利用・送迎予定で「休所」を先に入れてください。</p>'}
      ${p.warnings.length ? `<div style="background:#fff4e0;padding:8px;border-radius:6px"><b>⚠ 確認が必要 ${p.warnings.length}件</b><br>${p.warnings.map(w => `${esc(w.child)}：${esc(w.msg)}`).join('<br>')}</div>` : '<p style="color:#080">⚠ 確認が必要なものはありません</p>'}
      <details><summary>日ごとの中身を見る</summary>${typeof calWrap === 'function' ? calWrap(Object.keys(by).sort().map(d => `<section class="calv-wday"><p class="calv-h4">${fmtDay(d)}</p>${calDay(d, by[d], {})}</section>`).join('')) : Object.keys(by).sort().map(d => `<h4>${fmtDay(d)}</h4><small>${by[d].sort((a, b) => ({ 利用: 0, 休み: 1, 迎え: 2, 送り: 3 })[a.kind] - ({ 利用: 0, 休み: 1, 迎え: 2, 送り: 3 })[b.kind] || (a.start_time || '').localeCompare(b.start_time || '')).map(ytHm).join('<br>')}</small>`).join('')}</details>
      ${p.google_events > 0 ? `<p style="color:#c00">この月には Googleカレンダー由来の予定が ${p.google_events}件 あります。二重になるため確定できません。Googleで作る処理（25日のGAS）を止めてからにしてください。</p>`
      : `<p><button onclick="ytCommit()" style="background:#080;color:#fff">この内容で確定する（${mn}月分の予定を作る）</button><br><small>職員が手で直した予定は消えません。何度でも作り直せます。</small></p>`}`;
  } catch (e) { box.innerHTML = `<p style="color:#c00">${esc(e.message)}</p>`; }
}
async function ytCommit() {
  const box = document.getElementById('yt_plan');
  if (!confirm(YT_MONTH.slice(5, 7) + '月分の予定を作ります。よいですか？')) return;
  try { const r = await sb('rpc/leo_sched_commit', { method: 'POST', body: JSON.stringify({ p_month: YT_MONTH }) });
    box.innerHTML = `<p style="color:#080;font-size:17px">✅ ${r.inserted}件の予定を作りました。<a href="#leo/cal">児童の利用・送迎予定</a>／<a href="#leo/sougeiall">みんなの送迎</a>で見られます。</p>`; }
  catch (e) { box.innerHTML += `<p style="color:#c00">${esc(e.message)}</p>`; }
}
window.ytCopyAll = ytCopyAll; window.ytPlan = ytPlan; window.ytCommit = ytCommit;

// 今日の自分の送迎（スマホ）：予定表（leo_events の迎え・送り）から。予定表にまだ無い期間は、従来の日誌からの表示にもどる
(() => {
  const old = LEO_VIEWS.sougei;
  LEO_VIEWS.sougei = async function () {
    if (DEMO) return old.call(this);
    const [a, b] = range(), me = await myName();
    const [ev0, cc, LEFT] = await Promise.all([sb(`leo_events?kind=in.(迎え,送り)&day=gte.${a}&day=lte.${b}&order=day,start_time`), sb('leo_child_care').catch(() => []), loadLeftIndex()]);
    if (!ev0.length) return old.call(this);
    const ev = filterEventsByLeft(ev0, LEFT);
    const CARE = Object.fromEntries(cc.filter(x => x.note).map(x => [x.child, x.note])), mine = ev.filter(e => same(e.staff, me)), days = {};
    mine.forEach(e => (days[e.day] = days[e.day] || []).push(e));
    const card = e => { const pl = e.kid_places || {}, kt = e.kid_times || {};
      return `<div class="card" style="border-left:6px solid ${e.kind === '迎え' ? '#2a7' : '#d70'}"><div style="font-size:20px"><b>${e.kind === '迎え' ? '☆ 迎え' : '★ 送り'}　${esc(e.start_time || '')}〜${esc(e.end_time || '')}</b></div>
        ${(e.kids || []).map((k, i) => `<div style="font-size:18px;margin-top:6px">${i + 1}. <b>${esc(k)}</b>　${esc(kt[k] || '')}　${esc(pl[k] || '自宅')}${CARE[k] ? `<br><small style="color:#c60">⚠ ${esc(CARE[k])}</small>` : ''}</div>`).join('')}</div>`; };
    return `<h3>${PLABEL[PERIOD]}の送迎（${esc(me) || '名前未登録'} さんの担当）</h3>${periodTabs('sougei')}` + (Object.keys(days).length ? Object.keys(days).sort().map(d => `<h4>${fmtDay(d)}</h4>${days[d].sort((x, y) => (x.start_time || '').localeCompare(y.start_time || '')).map(card).join('')}`).join('') : '<p style="font-size:18px">担当はありません。</p>')
      + `<p class="note"><a href="#leo/sougeiall">みんなの送迎を見る</a></p>`;
  };
})();
