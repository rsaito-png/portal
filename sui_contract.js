// 水晶玉 書類（利用契約書・重要事項説明書）(#suishodama/contract)。金斗雲 kin_contract.js と同じ仕組み：署名リンク（1回限り・1週間）→ sui_contract_sign.html、紙で署名済みの記録、追記専用ログ sui_doc_log。
// 本文はテキスト（sui_doc_type.body、{氏名}を差し込み）。「文面を編集」で差し替え可。「印刷」で本文＋署名を出力。
const SC = { link: null };
const SC_URL = t => location.origin + location.pathname.replace(/[^/]*$/, '') + 'sui_contract_sign.html?t=' + t;
const scLast = logs => (logs || []).filter(x => x.method !== 'あとで署名').sort((a, b) => b.signed_at.localeCompare(a.signed_at))[0];
const scSt = logs => { const l = scLast(logs); if (l) return `<span style="color:#2e6b4f">✅ ${esc(l.method)}${l.agent_name ? '（' + esc(l.agent_name) + '・' + esc(l.agent_relation || '') + '）' : ''} ${esc(l.signed_on || new Date(l.signed_at).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' }))}${l.reason ? '（理由：' + esc(l.reason) + '）' : ''}</span>`; return (logs || []).length ? '⏳ あとで署名' : '未'; };
async function renderSuiContract() {
  const back = siBack;
  if (DEMO) { $('view').innerHTML = back + '<p>見本モードでは表示しません（ログイン後に開きます）。</p>'; return; }
  $('view').innerHTML = '<p>読み込み中…</p>';
  try {
    const [types, us, logs] = await Promise.all([sb('sui_doc_type?select=code,label,version,body&order=sort'), sb('sui_user?select=id,name,contract_start&order=name'), sb('sui_doc_log?select=id,user_id,doc_code,method,agent_name,agent_relation,reason,signed_on,signed_at&order=signed_at')]);
    SC.types = types; const nm = n => esc(n).replace(/'/g, '');
    const li = SC.link ? `<div class="card" style="border:2px solid #8e5bb5"><b>${esc(SC.link.name)} さんの署名リンク</b>（1回限り・1週間）<br><input id="sc_url" readonly value="${esc(SC.link.url)}" style="width:100%" onclick="this.select()"><p><button onclick="const i=$('sc_url');i.select();navigator.clipboard&&navigator.clipboard.writeText(i.value);$('sc_m').textContent='コピーしました'">コピー</button> <span id="sc_m"></span> <a href="${esc(SC.link.url)}" target="_blank" rel="noopener"><button>✍️ この端末で署名画面を開く（タブレットを渡す）</button></a> <button class="back" onclick="SC.link=null;renderSuiContract()">閉じる</button></p><p class="note">その場で署名するときは「この端末で署名画面を開く」を押してタブレットを渡します。後日なら、このURLをご本人に送ってください。新しく発行すると古い未使用リンクは使えなくなります。</p></div>` : '';
    $('view').innerHTML = back + `<h3>📄 利用契約書・重要事項説明書</h3>${li}
    <div class="card"><p class="note">金斗雲と同じ流れです。①「署名リンク発行」で書類と説明職員を選ぶ → ②その場ならタブレットで署名画面を開いて渡す（本人／代理の方／署名困難／あとで）、後日ならURLを送る → ③署名済みになったら「印刷」で本文と署名を印刷。紙で署名をもらった場合は、職員が確認して「紙で署名済み」を記録します。契約書に署名があると、契約開始日が空の場合だけ署名日が入ります。</p>
    ${us.length ? `<table class="tbl"><tr><th>利用者</th>${types.map(t => `<th>${esc(t.label.replace(/（.*/, ''))}</th>`).join('')}<th>契約開始日</th><th></th></tr>
    ${us.map(u => `<tr><td>${esc(u.name)}</td>${types.map(t => `<td>${scSt(logs.filter(l => l.user_id === u.id && l.doc_code === t.code))}<br><button class="back" onclick="scPaper(${u.id},'${t.code}','${nm(u.name)}','${nm(t.label)}')">紙で署名済み</button> <button class="back" onclick="scPrint(${u.id},'${t.code}')">印刷</button></td>`).join('')}<td>${esc(u.contract_start || '')}</td>
      <td><button onclick="scIssue(${u.id},'${nm(u.name)}')">署名リンク発行</button></td></tr>`).join('')}</table>` : '<p>先に利用者台帳で利用者を追加してください。</p>'}</div>
    <div class="card"><h4>文面</h4><p>${types.map(t => `<button class="back" onclick="scEdit('${t.code}')">${esc(t.label)} を見る・編集</button>`).join(' ')}</p><div id="sc_body"></div></div>`;
  } catch (e) { $('view').innerHTML = back + `<p>${esc(e.message)}</p>`; }
}
function scEdit(code) {
  const t = SC.types.find(x => x.code === code);
  $('sc_body').innerHTML = `<p class="note">{氏名} は利用者名に置き換わります。署名済みの書類には、署名時点の版（${esc(t.version)}）が記録されます。文面を大きく変えたら版も変えてください。</p><label>版 <input id="sc_ver" value="${esc(t.version)}" style="width:8em"></label><textarea id="sc_txt" rows="24" style="width:100%;box-sizing:border-box">${esc(t.body)}</textarea><p><button onclick="scSave('${code}')">文面を保存</button> <span id="sc_em"></span></p>`;
}
async function scSave(code) { try { await sb(`sui_doc_type?code=eq.${code}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ body: $('sc_txt').value, version: $('sc_ver').value.trim() || 'R8.11', updated_at: new Date().toISOString() }) }); $('sc_em').textContent = '保存しました'; const t = SC.types.find(x => x.code === code); t.body = $('sc_txt').value; t.version = $('sc_ver').value.trim(); } catch (e) { $('sc_em').textContent = e.message; } }
async function scIssue(uid, name) {
  const types = SC.types;
  const pick = prompt(`署名する書類の番号を入れてください（複数はカンマ区切り）\n${types.map((t, i) => (i + 1) + ': ' + t.label).join('\n')}`, types.map((_, i) => i + 1).join(',')); if (!pick) return;
  const docs = pick.split(/[,、\s]+/).map(x => types[+x - 1] && types[+x - 1].code).filter(Boolean); if (!docs.length) return alert('番号が正しくありません');
  let me = ''; try { me = typeof myName === 'function' ? await myName() : ''; } catch (_) {}
  const ex = prompt('説明した職員の氏名', me || ''); if (!ex) return;
  try { const t = await sb('rpc/sui_doc_issue', { method: 'POST', body: JSON.stringify({ p_user_id: uid, p_docs: docs, p_explainer: ex }) }); SC.link = { name, url: SC_URL(t) }; renderSuiContract(); } catch (e) { alert(e.message); }
}
async function scPaper(uid, code, name, label) {
  const d = prompt(`${name} さんの「${label}」は、紙で署名済みであることを確認しましたか？\n確認済みなら署名日（YYYY-MM-DD）を入れてください。`); if (!d) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return alert('日付は 2026-10-02 の形で入れてください');
  const memo = prompt('メモ（保管場所など、任意）', '') || '';
  try { await sb('rpc/sui_doc_mark_paper', { method: 'POST', body: JSON.stringify({ p_user_id: uid, p_doc: code, p_signed_on: d, p_memo: memo }) }); renderSuiContract(); } catch (e) { alert(e.message); }
}
async function scPrint(uid, code) {
  try {
    const [u] = await sb(`sui_user?id=eq.${uid}&select=name`), t = SC.types.find(x => x.code === code);
    const ls = await sb(`sui_doc_log?user_id=eq.${uid}&doc_code=eq.${code}&select=*&order=signed_at`), l = scLast(ls);
    const day = l ? (l.signed_on || new Date(l.signed_at).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' })) : '　　年　　月　　日';
    const sig = l && l.signature ? `<img src="${l.signature}" style="max-height:70px;vertical-align:middle">` : l && l.method === '紙で署名済み' ? '（紙の原本に署名）' : l && l.method === '署名困難' ? `（署名困難：${esc(l.reason || '')}）` : '';
    siPage(false);
    $('view').innerHTML = `<p class="noprint"><button class="back" onclick="renderSuiContract()">← 戻る</button> <button onclick="print()">🖨 印刷</button></p><div style="font-size:12px;line-height:1.7"><h2 style="text-align:center">${esc(t.label)}</h2><div style="white-space:pre-wrap">${esc(t.body.split('{氏名}').join(u.name))}</div>
    <table style="width:100%;margin-top:24px;border-collapse:collapse"><tr><td style="width:50%;vertical-align:top">署名日：${esc(day)}<br>利用者：${esc(u.name)}<br>署名：${sig}${l && l.agent_name ? `<br>代理人：${esc(l.agent_name)}（続柄：${esc(l.agent_relation || '')}）` : ''}</td><td style="vertical-align:top">事業者：福祉サロン水晶玉<br>説明職員：${esc((l && l.explainer_name) || '')}</td></tr></table><p style="font-size:10px;color:#666">版：${esc((l && l.version) || t.version)}</p></div>`;
  } catch (e) { alert(e.message); }
}
