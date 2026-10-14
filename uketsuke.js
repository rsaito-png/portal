// Google Chat 受付窓口に来た依頼・報告の一覧（データは Supabase の uketsuke 表）
// 見られる範囲は DB 側（RLS）で決まる：職員＝自分の事業所だけ／事務＝全部。状態の変更だけできる
const UK_STATUS = ['未対応', '対応中', '完了'];
const UK_DEMO = [
  { id: 3, created_at: new Date().toISOString(), sender_name: '職員X', office: 'レオ', category: '送迎', body: '（見本）明日の児童Aのお迎えを15:00に変更お願いします', status: '未対応' },
  { id: 2, created_at: new Date().toISOString(), sender_name: '職員Y', office: 'レオ', category: '日誌', body: '（見本）昨日の日誌、児童Bの終了時刻が違っています', status: '対応中' },
  { id: 1, created_at: new Date().toISOString(), sender_name: '職員Z', office: '茶夢', category: 'その他', body: '（見本）コピー用紙が残り少ないです', status: '完了' },
];
let UK_FILTER = '未完了';
async function renderUketsuke() {
  const back = `<button class="back" onclick="location.hash=''">← トップへ</button>`;
  $('view').innerHTML = back + '<p>読み込み中…</p>';
  try {
    let rows = DEMO ? UK_DEMO.filter(r => ROLE === '事務' || r.office === 'レオ') : await sb('uketsuke?order=id.desc&limit=200');
    if (UK_FILTER === '未完了') rows = rows.filter(r => r.status !== '完了');
    const groups = {}; rows.forEach(r => (groups[r.office || '事業所未設定'] = groups[r.office || '事業所未設定'] || []).push(r));
    const tabs = ['未完了', 'すべて'].map(f => `<button class="${f === UK_FILTER ? 'on' : ''}" onclick="UK_FILTER='${f}';renderUketsuke()">${f}</button>`).join('');
    $('view').innerHTML = back + `<h3>Chat受付</h3>${DEMO ? '<p class="note">見本データです（架空）</p>' : ''}
      <p class="note">Google Chat の「受付窓口」に書かれた依頼・報告です。${ROLE === '事務' ? '事務なので全事業所を表示しています。' : '自分の事業所の分だけ表示しています。'}対応したら状態を変えてください。</p>
      <p class="ptabs">${tabs}</p>` + (rows.length ? Object.entries(groups).map(([o, rs]) => `<h4>${esc(o)}（${rs.length}件）</h4><table>
      <tr><th>No・日時</th><th>分類・送った人</th><th>内容</th><th>状態</th></tr>${rs.map(r => `<tr${r.status === '未対応' ? ' style="background:#fff6e5"' : ''}>
      <td>${r.id}<br><small>${new Date(r.created_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</small></td>
      <td>${esc(r.category)}<br><small>${esc(r.sender_name)}</small></td><td style="white-space:pre-wrap">${esc(r.body)}</td>
      <td><select onchange="ukStatus(${r.id}, this)">${UK_STATUS.map(s => `<option${s === r.status ? ' selected' : ''}>${s}</option>`).join('')}</select></td></tr>`).join('')}</table>`).join('')
      : '<p>表示する受付はありません。</p>');
  } catch (e) { $('view').innerHTML = back + `<p>${esc(e.message)}</p>`; }
}
async function ukStatus(id, sel) {
  if (DEMO) { alert('見本モードなので保存しません'); return; }
  try { await sb(`uketsuke?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ status: sel.value }), headers: { Prefer: 'return=minimal' } }); }
  catch (e) { alert(e.message); renderUketsuke(); }
}
