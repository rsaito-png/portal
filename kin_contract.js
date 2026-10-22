// 金斗雲 書類（利用契約書・重要事項説明書・計画書）(#kintoun/contract)。本文はDriveの既存PDFを転用したページ画像（kin_doc_body）。署名は本人スマホ（contract_sign.html）。
// 書類の種類は kin_doc_type に行を足すと増える。署名は追記専用ログ kin_doc_log。計画書の同意は #kintoun/consent（kin_consent）。
const KC2 = { link: null, body: null, docs: {} };
const KC2_URL = t => location.origin + location.pathname.replace(/[^/]*$/, '') + 'contract_sign.html?t=' + t;
const kc2St = (logs) => { const l = (logs || []).filter(x => x.method !== 'あとで署名').sort((a, b) => b.signed_at.localeCompare(a.signed_at))[0]; if (l) return `<span style="color:#2e6b4f">✅ ${esc(l.method)}${l.agent_name ? '（' + esc(l.agent_name) + '・' + esc(l.agent_relation || '') + '）' : ''} ${esc(l.signed_on || new Date(l.signed_at).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' }))}${l.reason ? '（理由：' + esc(l.reason) + '）' : ''}</span>`; return (logs || []).length ? '⏳ あとで署名' : '未'; };
async function renderKinContract() {
  const back = `<button class="back" onclick="location.hash='kintoun'">← 金斗雲へ</button>`;
  if (DEMO) { $('view').innerHTML = back + '<p>見本モードでは表示しません（ログイン後に開きます）。</p>'; return; }
  $('view').innerHTML = '<p>読み込み中…</p>';
  try {
    const [types, us, logs, cons, plans] = await Promise.all([sb('kin_doc_type?select=*&order=sort'), sb('kin_user?select=id,name,address_class,contract_start&order=name'), sb('kin_doc_log?select=id,user_id,doc_code,method,agent_name,agent_relation,reason,signed_on,signed_at&order=signed_at'), sb('kin_consent?select=user_name,version'), sb('kin_plan?select=user_name,version')]);
    const cur = {}; plans.forEach(p => { if (!cur[p.user_name] || cur[p.user_name] < p.version) cur[p.user_name] = p.version; });
    const planSt = n => !(n in cur) ? '計画なし' : cons.some(c => c.user_name === n && c.version === cur[n]) ? '<span style="color:#2e6b4f">✅ 同意済み</span>' : '未';
    const sp = types.filter(t => t.sign_in_portal), no = us.filter(u => !u.address_class);
    const nm = n => esc(n).replace(/'/g, '');
    const li = KC2.link ? `<div class="card" style="border:2px solid #2e6b4f"><b>${esc(KC2.link.name)} さんの署名リンク</b>（1回限り・1週間）<br><input id="kc2_url" readonly value="${esc(KC2.link.url)}" style="width:100%" onclick="this.select()"><p><button onclick="const i=$('kc2_url');i.select();navigator.clipboard&&navigator.clipboard.writeText(i.value);$('kc2_m').textContent='コピーしました'">コピー</button> <span id="kc2_m"></span> <a href="${esc(KC2.link.url)}" target="_blank" rel="noopener"><button>この端末で署名画面を開く（タブレット）</button></a> <button class="back" onclick="KC2.link=null;renderKinContract()">閉じる</button></p><p class="note">このURLをご本人に送ってください。新しく発行すると古い未使用リンクは使えなくなります。</p></div>` : '';
    $('view').innerHTML = back + `<h3>📄 利用契約書・重要事項説明書</h3>${li}
    ${no.length ? `<div class="card" style="border-left:6px solid #c60">⚠ 住所区分が未設定: ${esc(no.map(u => u.name).join('、'))}（設定するまで署名リンクを出せません。本文の事業所住所が59-4／715-5で変わります）</div>` : ''}
    <div class="card"><p class="note">本文はDriveの既存PDF（R8.10）をそのまま転用しています。署名は、説明職員を指定して署名リンクを発行し、本人のスマホで行います（本人／代理の方／署名困難／あとで）。紙で署名済みの書類は、職員が確認して「紙で署名済み」を記録します（自動では署名済みにしません）。契約書に署名があると、契約開始日が空の場合だけ署名日が入ります。</p>
    <table class="tbl"><tr><th>利用者</th><th>住所区分</th><th>居宅介護計画書</th>${sp.map(t => `<th>${esc(t.label)}</th>`).join('')}<th>契約開始日</th><th></th></tr>
    ${us.map(u => `<tr><td>${esc(u.name)}</td><td><select onchange="kc2Cls(${u.id},this.value)"><option value="">未設定</option><option ${u.address_class === '59-4' ? 'selected' : ''}>59-4</option><option ${u.address_class === '715-5' ? 'selected' : ''}>715-5</option><option ${u.address_class === '自宅' ? 'selected' : ''}>自宅</option></select></td><td>${planSt(u.name)} <a href="#kintoun/consent">同意画面</a></td>
      ${sp.map(t => `<td>${kc2St(logs.filter(l => l.user_id === u.id && l.doc_code === t.code))}<br><button class="back" onclick="kc2Paper(${u.id},'${t.code}','${nm(u.name)}','${nm(t.label)}')">紙で署名済み</button></td>`).join('')}<td>${esc(u.contract_start || '')}</td>
      <td>${u.address_class ? `<button onclick="kc2Issue(${u.id},'${nm(u.name)}')">署名リンク発行</button>` : '<span style="color:#c60">住所区分を設定</span>'}</td></tr>`).join('')}</table></div>
    <div class="card"><h4>本文を見る</h4><p>${types.map(t => `<button class="back" onclick="kc2Body('${t.code}','${t.sign_in_portal ? '' : 'plan'}')">${esc(t.label)}</button>`).join(' ')} 住所区分 <select id="kc2_v"><option>59-4</option><option>715-5</option>${us.filter(u => u.address_class === '自宅').map(u => `<option value="u${u.id}">自宅（${esc(u.name)}）</option>`).join('')}</select></p><div id="kc2_body">${KC2.body || ''}</div></div>`;
  } catch (e) { $('view').innerHTML = back + `<p>${esc(e.message)}</p>`; }
}
async function kc2Cls(id, v) { try { await sb(`kin_user?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ address_class: v || null, updated_at: new Date().toISOString() }) }); renderKinContract(); } catch (e) { alert(e.message); } }
async function kc2Body(code, plan) {
  if (plan) { $('kc2_body').innerHTML = '<p>居宅介護計画書の本文と同意は <a href="#kintoun/consent">計画の同意画面</a> で扱います。</p>'; return; }
  const v = $('kc2_v').value, ps = await sb(`kin_doc_body?doc_code=eq.${code}&variant=eq.${v}&select=page_no,image,source_url&order=page_no`);
  KC2.body = ps.length ? ps.map(p => `<img src="${p.image}" style="width:100%;max-width:700px;display:block;border:1px solid #ccc;margin:6px 0" alt="${p.page_no}ページ">`).join('') : '<p>本文が未登録です。</p>'; $('kc2_body').innerHTML = KC2.body;
}
async function kc2Issue(uid, name) {
  const types = (await sb('kin_doc_type?select=code,label&sign_in_portal=eq.true&order=sort'));
  const pick = prompt(`署名する書類の番号を入れてください（複数はカンマ区切り）\n${types.map((t, i) => (i + 1) + ': ' + t.label).join('\n')}`, types.map((_, i) => i + 1).join(',')); if (!pick) return;
  const docs = pick.split(/[,、\s]+/).map(x => types[+x - 1] && types[+x - 1].code).filter(Boolean); if (!docs.length) return alert('番号が正しくありません');
  let me = ''; try { me = typeof myName === 'function' ? await myName() : ''; } catch (_) {}
  const ex = prompt('説明した職員の氏名', me || ''); if (!ex) return;
  try { const t = await sb('rpc/kin_doc_issue', { method: 'POST', body: JSON.stringify({ p_user_id: uid, p_docs: docs, p_explainer: ex }) }); KC2.link = { name, url: KC2_URL(t) }; renderKinContract(); } catch (e) { alert(e.message); }
}
async function kc2Paper(uid, code, name, label) {
  const d = prompt(`${name} さんの「${label}」は、紙で署名済みであることを確認しましたか？\n確認済みなら署名日（YYYY-MM-DD）を入れてください。`); if (!d) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return alert('日付は 2026-10-02 の形で入れてください');
  const memo = prompt('メモ（確認した書類・保管場所など、任意）', '') || '';
  try { await sb('rpc/kin_doc_mark_paper', { method: 'POST', body: JSON.stringify({ p_user_id: uid, p_doc: code, p_signed_on: d, p_memo: memo }) }); renderKinContract(); } catch (e) { alert(e.message); }
}
