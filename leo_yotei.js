// レオ 送迎：来月の利用予定を保護者に聞く（職員画面）。保護者の画面は yotei.html?t=…（ログインなし）
// 現行のGoogleフォーム（毎月15日に作成）は11/25まで並行で動く。こちらは「作るだけ・送らない」。リンクをコピーして公式LINEに貼るのは職員
let YT_MONTH = (() => { const t = today(), d = new Date(t + 'T00:00:00+09:00'); d.setDate(1); d.setMonth(d.getMonth() + 1); return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' }).slice(0, 7) + '-01'; })();
const ytAddMonth = n => { const d = new Date(YT_MONTH + 'T00:00:00+09:00'); d.setMonth(d.getMonth() + n); YT_MONTH = d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' }).slice(0, 7) + '-01'; renderLeoView('yotei'); };
const ytDT = s => s ? new Date(s).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
const ytUrl = tok => `${location.origin}${location.pathname.replace(/[^/]*$/, '')}yotei.html?t=${tok}`;
const ytMsg = (child, url, dl, remind) => `【レオ】${+YT_MONTH.slice(5, 7)}月のご利用予定の確認${remind ? '（お願い）' : ''}\n${remind ? 'まだご回答をいただいていません。お手数ですが、' : ''}${child}さんの${+YT_MONTH.slice(5, 7)}月のご利用予定を、こちらから ${dl} までにお知らせください。\n${url}\n（ご家庭ごとの専用リンクです。ほかの方には送らないでください。いつもどおりなら、開いて「送信する」を押すだけです）`;
let YT_ROWS = [];
LEO_VIEWS.yotei = async function () {
  const mgr = DEMO || canManage(), mn = +YT_MONTH.slice(5, 7);
  if (DEMO) YT_ROWS = [{ id: 1, child: '児童A', answered_at: '2026-11-17T01:00:00Z', answers: 1, usual: false, sent_at: '2026-11-16T01:00:00Z', send_count: 1, remind_count: 0, expires_at: '2026-11-24T15:00:00Z' },
    { id: 2, child: '児童B', answered_at: null, answers: 0, sent_at: '2026-11-16T01:00:00Z', send_count: 1, remind_count: 1, last_reminded_at: '2026-11-20T01:00:00Z', expires_at: '2026-11-24T15:00:00Z' },
    { id: 3, child: '児童C', answered_at: '2026-11-16T05:00:00Z', answers: 2, usual: true, sent_at: null, send_count: 0, remind_count: 0, expires_at: '2026-11-24T15:00:00Z' }];
  else YT_ROWS = await sb('rpc/leo_sched_status', { method: 'POST', body: JSON.stringify({ p_month: YT_MONTH }) });
  const done = YT_ROWS.filter(r => r.answered_at), left = YT_ROWS.filter(r => !r.answered_at);
  const row = r => `<div class="card"><b style="font-size:17px">■${esc(r.child)}</b>　${r.answered_at ? `<span style="color:#080">✅ 回答済み ${ytDT(r.answered_at)}</span> <small>${r.usual ? 'いつもどおり' : '個別の連絡あり'}${r.answers > 1 ? `（${r.answers}回目）` : ''}</small>` : '<span style="color:#c60">⬜ まだ</span>'}
    <br><small>${r.sent_at ? `リンクを送った：${ytDT(r.sent_at)}${r.remind_count ? `／催促${r.remind_count}回（最後 ${ytDT(r.last_reminded_at)}）` : ''}` : 'まだリンクを送っていません'}　回答期限：${ytDT(r.expires_at)}</small>
    <div style="margin-top:6px">${mgr ? `<button onclick="ytCopy(${r.id},'${esc(r.child)}','send')">${r.sent_at ? 'リンクをもう一度コピー' : 'リンクをコピー'}</button>
      ${r.answered_at ? '' : `<button onclick="ytCopy(${r.id},'${esc(r.child)}','remind')">催促の文をコピー</button>`}` : ''}
      ${r.answers ? `<button onclick="ytShow(${r.id},'${esc(r.child)}')">回答を見る</button>` : ''}</div><div id="yt_${r.id}"></div></div>`;
  return `<h3>📅 来月の利用予定（保護者に聞く）</h3>${demoNote()}
    <p class="ptabs"><button onclick="ytAddMonth(-1)">← 前の月</button> <b style="font-size:18px">${YT_MONTH.slice(0, 4)}年${mn}月分</b> <button onclick="ytAddMonth(1)">次の月 →</button></p>
    <p class="note">保護者の画面（ログイン不要・児童ごとの専用リンク）で、曜日ごとの学校お迎え時刻、お休み、保護者が送る・迎えに来る日、追加利用、送り先が違う日を聞きます。前回の回答を初期値にします。
    <b>いまは11/25までGoogleフォームが本番です。ここは試験用で、リンクを実際の保護者に送らないでください。</b>（11/25の12月分から切り替え）</p>
    ${!YT_ROWS.length ? `<div class="card"><p>${mn}月分の依頼はまだありません。</p>${mgr ? `<button onclick="ytOpen()">${mn}月分のリンクを作る（型表の児童全員。作るだけで、誰にも送りません）</button><span id="yt_om"></span>` : ''}</div>`
    : `<p style="font-size:18px"><b>${done.length} / ${YT_ROWS.length}人 回答済み</b>${left.length ? `（まだ：${left.map(r => esc(r.child)).join('、')}）` : ' ✅ 全員そろいました'}</p>${left.map(row).join('')}${done.map(row).join('')}`}
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
    copyResult(B, text, ok, child, (kind === 'remind' ? '催促の文（リンクつき）' : '案内の文（リンクつき）') + 'をコピーしました。送ったことは記録しました。実際の保護者へは、11/25までGoogleフォームが本番なので送らないでください。'); }
  catch (e) { copyError(B, e.message, child); }
  finally { if (B) B.disabled = false; }
}
async function ytShow(id, child) {
  const box = document.getElementById('yt_' + id); if (box.innerHTML) { box.innerHTML = ''; return; }
  try { let wd, ex; if (DEMO) { wd = [{ dow: '月', use: true, school_time: '15:00', pick_place: '〇〇小学校', drop_place: '自宅' }]; ex = [{ day: YT_MONTH.slice(0, 8) + '10', kind: '休み' }, { day: YT_MONTH.slice(0, 8) + '17', kind: '母の迎え', time: '16:00' }]; }
    else [wd, ex] = await Promise.all([sb(`leo_schedule_weekday?child=eq.${encodeURIComponent(child)}&month=eq.${YT_MONTH}&order=dow`), sb(`leo_schedule_exception?child=eq.${encodeURIComponent(child)}&month=eq.${YT_MONTH}&order=day`)]);
    box.innerHTML = `<div style="background:#f6f6f6;padding:8px;border-radius:6px;margin-top:6px;font-size:14px"><b>曜日</b><br>${wd.map(w => `${esc(w.dow)}：${w.use ? '利用' : '利用しない'}${w.school_time ? ' 学校お迎え ' + esc(w.school_time) : ''}${w.pick_place ? '（迎え ' + esc(w.pick_place) + '）' : ''}${w.drop_place && w.drop_place !== '自宅' ? '（送り ' + esc(w.drop_place) + '）' : ''}`).join('<br>') || '—'}
      <br><b>日ごとの連絡</b><br>${ex.map(x => `${x.day ? fmtDay(x.day) : '全体'} ${esc(x.kind)}${x.time ? ' ' + esc(x.time) : ''}${x.place ? ' ' + esc(x.place) : ''}${x.memo ? ' ' + esc(x.memo) : ''}`).join('<br>') || 'なし（いつもどおり）'}</div>`; }
  catch (e) { box.innerHTML = `<p style="color:#c00">${esc(e.message)}</p>`; }
}
