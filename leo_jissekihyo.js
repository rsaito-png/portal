// レオ サービス提供実績記録表（#leo/jissekihyo）：保護者確認の状況を月×児童で「未／送った／確認済み」に。
// 確認の中身は #leo/kakunin（leo_confirm_links・leo_confirmations）と同じ。Google側（フォーム・回答シート）は変更しない（並行運転）。保護者への自動送信なし
let JH_MONTH = (() => { const t = today(), y = +t.slice(0, 4), m = +t.slice(5, 7); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; })();
let JH_SENT = {};
const jhMk = d => { const [y, m] = JH_MONTH.split('-').map(Number), n = new Date(y, m - 1 + d, 1); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`; };
LEO_VIEWS.jissekihyo = async function () {
  if (!canManage()) return '<p>この画面は児発管・管理者・事務の方だけが使えます。</p>';
  let links, conf, sent, days;
  if (DEMO) {
    links = [{ token: 'd1', child: '児童A' }, { token: 'd2', child: '児童B' }, { token: 'd3', child: '児童C' }];
    conf = [{ token: 'd1', confirm: '内容に相違ありません', parent_name: '保護者A', submitted_at: new Date().toISOString() }];
    sent = [{ child: '児童B', sent_at: new Date().toISOString() }]; days = { 児童A: 12, 児童B: 9, 児童C: 15 };
  } else {
    const [y, m] = JH_MONTH.split('-').map(Number), a = `${JH_MONTH}-01`, b = new Date(y, m, 0).toLocaleDateString('sv-SE');
    let js;
    [links, sent, js] = await Promise.all([sb(`leo_confirm_links?month=eq.${JH_MONTH}&order=child`), sb(`leo_jissekihyo_sent?ym=eq.${JH_MONTH}`), sb(`leo_jisseki?select=child&day=gte.${a}&day=lte.${b}&limit=5000`)]);
    conf = links.length ? await sb(`leo_confirmations?select=token,confirm,parent_name,comment,submitted_at&token=in.(${links.map(l => l.token).join(',')})&order=id.desc`) : [];
    days = {}; js.forEach(r => { days[r.child] = (days[r.child] || 0) + 1; });
  }
  const last = {}; conf.forEach(c => { if (!last[c.token]) last[c.token] = c; });
  JH_SENT = {}; sent.forEach(s => { JH_SENT[s.child] = s; });
  const children = [...new Set([...links.map(l => l.child), ...Object.keys(days)])].sort();
  const byChild = {}; links.forEach(l => { byChild[l.child] = l; });
  const st = c => { const l = byChild[c], k = l && last[l.token]; return k ? (k.confirm === '相違があります' ? 'diff' : 'ok') : JH_SENT[c] ? 'sent' : 'no'; };
  const cnt = { ok: 0, diff: 0, sent: 0, no: 0 }; children.forEach(c => cnt[st(c)]++);
  const fd = s => new Date(s).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  window.JH_CHILDREN = children;
  const [yy, mm] = JH_MONTH.split('-').map(Number);
  return `<h3>サービス提供実績記録表</h3>${demoNote()}
    <p class="note">保護者に実績を確認してもらう流れの一覧です。今は Google 側のフォームも動いています（並行運転・そちらは変更しません）。ポータルからは保護者に自動送信しません。</p>
    <p><a href="https://docs.google.com/forms/d/1UqoIx6WFAYh2IJgl9FDdD40WsOG58qiaG1Gld3_PKkk/edit" target="_blank" rel="noopener">📝 確認フォーム（Google）</a>
     ／ <a href="https://docs.google.com/spreadsheets/d/1_6OuwQUxxdtM3m1ZbGu_2UJacayKiZxk9LjuxT-HeQA/edit" target="_blank" rel="noopener">📊 回答シート（Google）</a>
     ／ <a href="https://docs.google.com/document/d/19rIG027Rdn7vCDmA1othPImI7QnzEGCkc20d8kt_5MU/edit" target="_blank" rel="noopener">📖 運用マニュアル</a></p>
    <p class="ptabs"><button onclick="JH_MONTH=jhMk(-1);renderLeoView('jissekihyo')">← 前の月</button> <b>${yy}年${mm}月分</b> <button onclick="JH_MONTH=jhMk(1);renderLeoView('jissekihyo')">次の月 →</button></p>
    <p>確認済み <b>${cnt.ok}</b>・相違あり <b style="color:#d33">${cnt.diff}</b>・送った（返事待ち） ${cnt.sent}・未 ${cnt.no} ／ ${children.length}人</p>
    ${children.length ? `<table class="tbl" style="width:100%;border-collapse:collapse"><tr><th>児童</th><th>実績の日数</th><th>状況</th><th>リンク</th><th>送った</th></tr>
    ${children.map((c, i) => { const l = byChild[c], k = l && last[l.token], s = st(c);
      return `<tr style="border-top:1px solid #ddd${s === 'diff' ? ';background:#fdecec' : ''}"><td>${esc(c)}</td><td>${days[c] || 0}日</td>
      <td>${s === 'ok' ? `✅ 確認済み<br><small>${esc(k.parent_name)}・${fd(k.submitted_at)}</small>` : s === 'diff' ? `⚠️ 相違あり<br><small>${esc(k.parent_name)}・${fd(k.submitted_at)}${k.comment ? '<br>' + esc(k.comment) : ''}</small>` : s === 'sent' ? `📤 送った<br><small>${fd(JH_SENT[c].sent_at)}</small>` : '<span style="color:#d33">未</span>'}</td>
      <td>${l ? `<button onclick="jhCopy('${l.token}', this)">コピー</button>` : '<small>リンク未作成</small>'}</td>
      <td>${l ? `<label><input type="checkbox" ${JH_SENT[c] ? 'checked' : ''} onchange="jhSent(${i},this.checked)"> 送った</label>` : ''}</td></tr>`; }).join('')}</table>`
    : '<p>この月の実績がまだありません。</p>'}
    <p id="jhmsg" class="note"></p>
    <p><a href="#leo/kakunin">🖊️ リンクを作る・回答の詳細は「保護者の実績確認」へ</a>　<a href="#leo/jisseki">実績記録を見る</a></p>
    <p class="note">送る日は今は毎月20日ごろ（Google側）。3日・前月分に変える予定です。ポータルのリンクは、この画面の「コピー」を公式LINEで送ります。Google側の回答はこの画面には自動では入りません。</p>`;
};
function jhCopy(t, b) { const u = DEMO ? KK_URL('').replace('t=', 'demo=1') : KK_URL(t); navigator.clipboard.writeText(u).then(() => { b.textContent = 'コピーしました'; }, () => prompt('このリンクをコピーしてください', u)); }
async function jhSent(i, on) {
  const c = window.JH_CHILDREN[i], m = $('jhmsg');
  if (DEMO) { m.textContent = '見本モードなので保存しません。'; return; }
  try {
    if (on) await sb('leo_jissekihyo_sent', { method: 'POST', headers: { Prefer: 'return=minimal,resolution=merge-duplicates' }, body: JSON.stringify({ ym: JH_MONTH, child: c }) });
    else await sb(`leo_jissekihyo_sent?ym=eq.${JH_MONTH}&child=eq.${encodeURIComponent(c)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    renderLeoView('jissekihyo');
  } catch (e) { m.textContent = e.message; }
}
