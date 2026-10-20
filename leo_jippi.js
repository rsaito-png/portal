// レオ 利用料実費請求（#leo/jippi）：お昼代・おやつ代を児童ごとに。LINE文面をコピー→担当者が公式LINEで手動送信。保護者への自動送信はしない
// 金額：実績記録「一覧」タブから取り込み（tools/jippi_import.py）。Squareリンクは既存ルーティンが作ったものを貼る／取り込む（トークンは扱わない）
let JI_MONTH = (() => { const t = today(), y = +t.slice(0, 4), m = +t.slice(5, 7); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; })();
let JI_ROWS = [];
const jiMk = d => { const [y, m] = JI_MONTH.split('-').map(Number), n = new Date(y, m - 1 + d, 1); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`; };
const jiYen = n => Number(n).toLocaleString('ja-JP') + '円';
function jiText(r) {
  const m = +JI_MONTH.slice(5), name = String(r.child).replace(/\s/g, '');
  return `${r.guardian ? r.guardian + '様\n' : ''}レオ（${gl('name:leo_contact','担当')}）です。${m}月分の実費のご案内です。\n\n${name}さん\n・お昼代 ${jiYen(r.lunch)}\n・おやつ代 ${jiYen(r.snack)}\n・合計 ${jiYen(r.lunch + r.snack)}\n\nお支払いはこちらからお願いします。\n${r.pay_link || '（支払いリンク未作成）'}\n\nよろしくお願いします。\nレオ ${gl('name:leo_contact','')}`;
}
LEO_VIEWS.jippi = async function () {
  if (!canManage()) return '<p>この画面は児発管・管理者・事務の方だけが使えます。</p>';
  JI_ROWS = DEMO ? [{ ym: JI_MONTH, child: '児童A', guardian: '保護者A', lunch: 600, snack: 300, pay_link: null, sent: false }] : await sb(`leo_jippi?ym=eq.${JI_MONTH}&order=child`);
  const [y, m] = JI_MONTH.split('-').map(Number), sum = JI_ROWS.reduce((s, r) => s + r.lunch + r.snack, 0), sent = JI_ROWS.filter(r => r.sent).length;
  return `<h3>利用料実費請求</h3>${demoNote()}
    <p class="note">お昼代・おやつ代だけです（利用者負担額は含みません）。文面をコピーして、公式LINEで保護者に送ってください。ポータルからは送りません。</p>
    <p class="ptabs"><button onclick="JI_MONTH=jiMk(-1);renderLeoView('jippi')">← 前の月</button> <b>${y}年${m}月分</b> <button onclick="JI_MONTH=jiMk(1);renderLeoView('jippi')">次の月 →</button></p>
    ${JI_ROWS.length ? `<p>${JI_ROWS.length}人・合計 ${jiYen(sum)}・送信済み ${sent}/${JI_ROWS.length}</p>` : '<p>この月の実費データはまだありません。毎月3日ごろ、実績記録の「一覧」から取り込みます。</p>'}
    <table class="tbl" style="width:100%;border-collapse:collapse"><tr><th>児童</th><th>お昼代</th><th>おやつ代</th><th>合計</th><th>Squareの支払いリンク</th><th>文面</th><th>送った</th></tr>
    ${JI_ROWS.map((r, i) => `<tr style="border-top:1px solid #ddd"><td>${esc(r.child)}<br><small>${esc(r.guardian || '')}</small></td><td>${jiYen(r.lunch)}</td><td>${jiYen(r.snack)}</td><td><b>${jiYen(r.lunch + r.snack)}</b></td>
      <td><input id="jl${i}" value="${esc(r.pay_link || '')}" placeholder="https://…" style="width:14em" onchange="jiLink(${i})"></td>
      <td><button onclick="jiCopy(${i})" ${r.pay_link ? '' : 'disabled title="支払いリンクを入れてからコピーします"'}>コピー</button></td>
      <td><label><input type="checkbox" ${r.sent ? 'checked' : ''} onchange="jiSent(${i},this.checked)"> ${r.sent && r.sent_at ? `<small>${esc(r.sent_at.slice(5, 10))}</small>` : '送信済み'}</label></td></tr>`).join('')}</table>
    <p id="jmsg" class="note"></p>
    <p class="note">支払いリンクは、毎月3日以降の最初の営業日の朝に既存ルーティンが作ります。作られたら、ここに貼るか、取り込みます。金額が違うときは、日誌のお昼代・おやつ代を直してから取り込み直します。</p>`;
};
async function jiPatch(i, body) {
  const r = JI_ROWS[i], m = $('jmsg');
  if (DEMO) { m.textContent = '見本モードなので保存しません。'; return false; }
  try { await sb(`leo_jippi?ym=eq.${r.ym}&child=eq.${encodeURIComponent(r.child)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body) }); Object.assign(r, body); m.textContent = '保存しました。'; return true; }
  catch (e) { m.textContent = e.message; return false; }
}
async function jiLink(i) {
  const v = $('jl' + i).value.trim();
  if (v && !/^https:\/\//.test(v)) { $('jmsg').textContent = 'https:// で始まるリンクを入れてください。'; return; }
  if (await jiPatch(i, { pay_link: v || null })) renderLeoView('jippi');
}
async function jiSent(i, on) { const ok = await jiPatch(i, { sent: on, sent_at: on ? new Date().toISOString() : null }); if (ok) renderLeoView('jippi'); }
async function jiCopy(i) {
  try { await navigator.clipboard.writeText(jiText(JI_ROWS[i])); $('jmsg').textContent = `${JI_ROWS[i].child} さんの文面をコピーしました。公式LINEに貼って送ってください。`; }
  catch (e) { $('jmsg').textContent = 'コピーできませんでした。'; }
}
