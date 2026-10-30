// レオ 利用料実費請求（#leo/jippi）：お昼代・おやつ代を児童ごとに。LINE文面をコピー→担当者が公式LINEで手動送信。保護者への自動送信はしない
// 金額：実績記録「一覧」タブから取り込み（tools/jippi_import.py）。支払いリンクはこの画面から作る（Squareのトークンは Edge Function だけ。画面には出さない）
let JI_MONTH = (() => { const t = today(), y = +t.slice(0, 4), m = +t.slice(5, 7); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; })();
let JI_ROWS = [];
let JI_MSG = '';
let JI_BUSY = false;
let JI_DEMO = null;
const jiMk = d => { const [y, m] = JI_MONTH.split('-').map(Number), n = new Date(y, m - 1 + d, 1); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`; };
const jiYen = n => Number(n).toLocaleString('ja-JP') + '円';
const jiSay = t => { JI_MSG = t; const m = $('jmsg'); if (m) m.textContent = t; };
const jiSummary = r => {
  const p = [];
  if (r.created) p.push('作成 ' + r.created + '件');
  if (r.unchanged) p.push('そのまま ' + r.unchanged + '件');
  if (r.zero) p.push('0円は ' + r.zero + '件');
  if (r.failed) p.push('失敗 ' + r.failed + '件');
  if (r.missing) p.push('この月にその児童はいません');
  return p.join('、') || '対象がありません。';
};
function jiDemoRows() {
  if (!JI_DEMO) JI_DEMO = [{ child: '児童A', guardian: '保護者A', lunch: 600, snack: 300, pay_link: null, pay_link_amount: null, sent: false }];
  JI_DEMO.forEach(r => { r.ym = JI_MONTH; });
  return JI_DEMO;
}
function jiText(r) {
  const m = +JI_MONTH.slice(5), name = String(r.child).replace(/\s/g, '');
  return `${r.guardian ? r.guardian + '様\n' : ''}レオ（${gl('name:leo_contact','担当')}）です。${m}月分の実費のご案内です。\n\n${name}さん\n・お昼代 ${jiYen(r.lunch)}\n・おやつ代 ${jiYen(r.snack)}\n・合計 ${jiYen(r.lunch + r.snack)}\n\nお支払いはこちらからお願いします。\n${r.pay_link || '（支払いリンク未作成）'}\n\nよろしくお願いします。\nレオ ${gl('name:leo_contact','')}`;
}
LEO_VIEWS.jippi = async function () {
  if (!canManage()) return '<p>この画面は児発管・管理者・事務の方だけが使えます。</p>';
  JI_ROWS = DEMO ? jiDemoRows() : await sb(`leo_jippi?ym=eq.${JI_MONTH}&order=child`);
  const [y, m] = JI_MONTH.split('-').map(Number), sum = JI_ROWS.reduce((s, r) => s + r.lunch + r.snack, 0), sent = JI_ROWS.filter(r => r.sent).length;
  return `<h3>利用料実費請求</h3>${demoNote()}
    <p class="note">お昼代・おやつ代だけです（利用者負担額は含みません）。文面をコピーして、公式LINEで保護者に送ってください。ポータルからは送りません。</p>
    <p class="ptabs"><button onclick="JI_MSG='';JI_MONTH=jiMk(-1);renderLeoView('jippi')">← 前の月</button> <b>${y}年${m}月分</b> <button onclick="JI_MSG='';JI_MONTH=jiMk(1);renderLeoView('jippi')">次の月 →</button></p>
    ${JI_ROWS.length ? `<p>${JI_ROWS.length}人・合計 ${jiYen(sum)}・送信済み ${sent}/${JI_ROWS.length}</p>
    <p><button onclick="jiMake()">この月のリンクを作成／更新</button></p>` : '<p>この月の実費データはまだありません。毎月3日ごろ、実績記録の「一覧」から取り込みます。</p>'}
    <table class="tbl" style="width:100%;border-collapse:collapse"><tr><th>児童</th><th>お昼代</th><th>おやつ代</th><th>合計</th><th>Squareの支払いリンク</th><th>文面</th><th>送った</th></tr>
    ${JI_ROWS.map((r, i) => `<tr style="border-top:1px solid #ddd"><td>${esc(r.child)}<br><small>${esc(r.guardian || '')}</small></td><td>${jiYen(r.lunch)}</td><td>${jiYen(r.snack)}</td><td><b>${jiYen(r.lunch + r.snack)}</b></td>
      <td><input id="jl${i}" value="${esc(r.pay_link || '')}" placeholder="https://…" style="width:14em" onchange="jiLink(${i})"><br><button onclick="jiMake(${i})" ${r.lunch + r.snack > 0 ? '' : 'disabled title="0円はリンクを作りません"'}>この人のリンク</button></td>
      <td><button onclick="jiCopy(${i})" ${r.pay_link ? '' : 'disabled title="支払いリンクを入れてからコピーします"'}>コピー</button></td>
      <td><label><input type="checkbox" ${r.sent ? 'checked' : ''} onchange="jiSent(${i},this.checked)"> ${r.sent && r.sent_at ? `<small>${esc(r.sent_at.slice(5, 10))}</small>` : '送信済み'}</label></td></tr>`).join('')}</table>
    <p id="jmsg" class="note">${esc(JI_MSG)}</p>
    <p class="note">金額が違うときは、日誌のお昼代・おやつ代を直してから取り込み直します。支払いリンクは、この画面から随時作成できます。金額が同じリンクは作り直しません。</p>`;
};
async function jiPatch(i, body) {
  const r = JI_ROWS[i];
  if (DEMO) { jiSay('見本モードなので保存しません。'); return false; }
  try { await sb(`leo_jippi?ym=eq.${r.ym}&child=eq.${encodeURIComponent(r.child)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body) }); Object.assign(r, body); return true; }
  catch (e) { jiSay(e.message); return false; }
}
async function jiLink(i) {
  const v = $('jl' + i).value.trim();
  if (v && !/^https:\/\//.test(v)) { jiSay('https:// で始まるリンクを入れてください。'); return; }
  const amt = Number(JI_ROWS[i].lunch) + Number(JI_ROWS[i].snack);
  if (await jiPatch(i, { pay_link: v || null, pay_link_amount: v ? amt : null })) { jiSay('保存しました。'); renderLeoView('jippi'); }
}
async function jiSent(i, on) { const ok = await jiPatch(i, { sent: on, sent_at: on ? new Date().toISOString() : null }); if (ok) { jiSay('保存しました。'); renderLeoView('jippi'); } }
async function jiCopy(i) {
  try { await navigator.clipboard.writeText(jiText(JI_ROWS[i])); jiSay(`${JI_ROWS[i].child} さんの文面をコピーしました。公式LINEに貼って送ってください。`); }
  catch (e) { jiSay('コピーできませんでした。'); }
}
async function jiFn(body, retried) {
  if (DEMO) throw new Error('見本モードでは呼び出しません');
  let s = JSON.parse(localStorage.getItem('sess') || '{}');
  if (s.exp && s.exp < Date.now() + 30000 && !retried && await refreshSess()) s = JSON.parse(localStorage.getItem('sess') || '{}');
  const r = await fetch(C.supabaseUrl + '/functions/v1/jippi-checkout', {
    method: 'POST',
    headers: { apikey: C.supabaseKey, Authorization: 'Bearer ' + (s.token || ''), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (r.status === 401 && !retried && await refreshSess()) return jiFn(body, true);
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
  if (!r.ok) throw new Error((data && data.error) || ('作れませんでした（' + r.status + '）'));
  return data || {};
}
async function jiMake(i) {
  if (JI_BUSY) return;
  const rows = i == null ? JI_ROWS : (JI_ROWS[i] ? [JI_ROWS[i]] : []);
  if (!rows.length) { jiSay('この月の実費データはまだありません。'); return; }
  if (DEMO) {
    const res = { created: 0, unchanged: 0, zero: 0, failed: 0, missing: 0 };
    for (const r of rows) {
      const amt = Number(r.lunch) + Number(r.snack);
      if (!(amt > 0)) { res.zero++; continue; }
      if (r.pay_link && r.pay_link_amount === amt) { res.unchanged++; continue; }
      r.pay_link = 'https://square.link/u/demo';
      r.pay_link_amount = amt;
      res.created++;
    }
    jiSay(jiSummary(res) + '（見本なので Square には作りません）');
    renderLeoView('jippi');
    return;
  }
  JI_BUSY = true;
  jiSay('支払いリンクを作っています…');
  try {
    const body = { ym: JI_MONTH };
    if (i != null) body.child = rows[0].child;
    jiSay(jiSummary(await jiFn(body)));
  } catch (e) { jiSay(e.message); }
  try { await renderLeoView('jippi'); }
  finally { JI_BUSY = false; }
}
