// 水晶玉 基本情報シート (#suishodama/basic)。sui_basic（版ごと）＋ 利用者台帳 sui_user の項目。録音後に sui-draft が下書きを自動作成。
const SB_F = [['consult_route', '相談に至った経緯'], ['life_history', '生育歴・生活歴'], ['disability', '障害・疾病の状況'], ['medical', '医療機関・服薬'], ['health', '健康状態'], ['adl', '日常生活の状況（食事・入浴・排せつ・移動・家事など）'], ['communication', '意思疎通'], ['social', '社会参加・就労・就学'], ['family', '家族構成・家族の状況'], ['housing', '住まいの状況'], ['income', '収入・経済状況'], ['current_services', '現在利用しているサービス・関係機関'], ['client_wish', '本人の希望'], ['family_wish', '家族の希望'], ['issues', '課題・支援の必要性'], ['note', '特記事項']];
const SB_U = [['name', '氏名'], ['name_kana', 'フリガナ'], ['birth', '生年月日'], ['address', '住所'], ['phone', '電話'], ['city', '市町村'], ['guardian_name', '保護者氏名'], ['guardian_relation', '続柄'], ['shien_kubun', '障害支援区分'], ['kind', '計画の種類'], ['jukyusha_fukushi', '受給者証番号（障害福祉）'], ['jukyusha_chiiki', '受給者証番号（地域相談）'], ['jukyusha_jido', '受給者証番号（障害児）'], ['cap_amount', '負担上限額（円）'], ['monitoring_period', 'モニタリング期間']];
const SBX = { id: null };
async function renderSuiBasic() {
  if (DEMO) { $('view').innerHTML = siBack + '<p>見本モードでは表示しません（ログイン後に開きます）。</p>'; return; }
  $('view').innerHTML = '<p>読み込み中…</p>';
  try {
    const us = await sb('sui_user?select=id,name&order=name'); if (!us.length) return $('view').innerHTML = siBack + '<p>先に利用者台帳で利用者を追加してください。</p>';
    if (!us.some(x => x.id === SUI.uid)) SUI.uid = us[0].id;
    if (SBX.id) return sbEdit(SBX.id);
    const bs = await sb(`sui_basic?user_id=eq.${SUI.uid}&select=id,version,status,request_id,updated_at&order=version.desc`);
    $('view').innerHTML = siBack + `<h3>📋 基本情報シート</h3><p>利用者 <select onchange="SUI.uid=+this.value;renderSuiBasic()">${us.map(x => `<option value="${x.id}" ${x.id === SUI.uid ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></p>
    <div class="card"><p class="note">「計画」で面談を録音して依頼すると、基本情報シートの下書きが自動でできます。氏名・住所・受給者証などは利用者台帳から入ります（台帳で直してください）。</p>
    ${bs.length ? `<table class="tbl"><tr><th>版</th><th>状態</th><th>作成元</th><th>更新</th><th></th></tr>${bs.map(b => `<tr><td>v${b.version}</td><td>${b.status === '確定' ? '🔒確定' : '下書き'}</td><td>${b.request_id ? '録音#' + b.request_id : '手入力'}</td><td>${esc(siFmtDt(b.updated_at))}</td><td><button onclick="SBX.id=${b.id};renderSuiBasic()">開く</button></td></tr>`).join('')}</table>` : '<p>まだありません。</p>'}
    <p><button class="back" onclick="sbNew()">＋白紙から作る</button></p></div>`;
  } catch (e) { $('view').innerHTML = siBack + `<p>${esc(e.message)}</p>`; }
}
async function sbNew() { try { const l = (await sb(`sui_basic?user_id=eq.${SUI.uid}&select=version,body&order=version.desc&limit=1`))[0]; const r = await sb('sui_basic', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ user_id: SUI.uid, version: l ? l.version + 1 : 1, body: l ? l.body : {} }) }); SBX.id = r[0].id; renderSuiBasic(); } catch (e) { alert(e.message); } }
async function sbEdit(id) {
  const b = (await sb(`sui_basic?id=eq.${id}&select=*`))[0], u = (await sb(`sui_user?id=eq.${b.user_id}&select=*`))[0], d = b.body || {}, ro = b.status === '確定';
  $('view').innerHTML = `<div class="noprint"><button class="back" onclick="SBX.id=null;renderSuiBasic()">← 一覧へ</button> <button onclick="sbPrint(${id})">🖨 印刷</button> ${ro ? '🔒確定済み' : `<button onclick="sbSave(${id})">保存</button> <button class="back" onclick="sbSave(${id},1)">確定する</button>`} <span id="sb_m"></span></div>
  <h3>基本情報シート v${b.version}（${esc(u.name)}さん）</h3><div class="card sui-form"><h4>利用者台帳より</h4><div class="g">${SB_U.map(([k, l]) => `<div><small>${l}</small><br>${esc(u[k] ?? '')}</div>`).join('')}</div></div>
  <div class="card sui-form">${SB_F.map(([k, l]) => `<label>${l}<br><textarea id="sb_${k}" rows="3" style="width:100%" ${ro ? 'readonly' : ''}>${esc(d[k] ?? '')}</textarea></label>`).join('')}</div>`;
}
async function sbSave(id, fix) {
  if (fix && !confirm('確定すると編集できなくなります。よろしいですか？')) return;
  const body = Object.fromEntries(SB_F.map(([k]) => [k, $('sb_' + k).value]));
  try { await sb(`sui_basic?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(Object.assign({ body, updated_at: new Date().toISOString() }, fix ? { status: '確定' } : {})) }); if (fix) return sbEdit(id); $('sb_m').textContent = '保存しました'; } catch (e) { $('sb_m').textContent = e.message; }
}
async function sbPrint(id) {
  if ($('sb_note') || $('sb_consult_route')) { const st = (await sb(`sui_basic?id=eq.${id}&select=status`))[0].status; if (st !== '確定') await sbSave(id); }
  const b = (await sb(`sui_basic?id=eq.${id}&select=*`))[0], u = (await sb(`sui_user?id=eq.${b.user_id}&select=*`))[0], d = b.body || {};
  siPage(false); const td = 'border:1px solid #333;padding:4px;vertical-align:top';
  $('view').innerHTML = `<p class="noprint"><button class="back" onclick="sbEdit(${id})">← 戻る</button> <button onclick="print()">🖨 印刷</button></p><div style="font-size:11px"><h2 style="text-align:center">基本情報シート</h2><p style="text-align:right">相談支援事業所 福祉サロン水晶玉　作成日：${esc(new Date(b.updated_at).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' }))}</p>
  <table style="width:100%;border-collapse:collapse">${SB_U.reduce((a, x, i) => (i % 2 ? a[a.length - 1].push(x) : a.push([x]), a), []).map(r => `<tr>${r.map(([k, l]) => `<th style="${td};width:18%;background:#eee">${l}</th><td style="${td}">${esc(u[k] ?? '')}</td>`).join('')}</tr>`).join('')}
  ${SB_F.map(([k, l]) => `<tr><th style="${td};background:#eee">${l}</th><td colspan="3" style="${td};white-space:pre-wrap;height:2.4em">${esc(d[k] ?? '')}</td></tr>`).join('')}</table></div>`;
}
