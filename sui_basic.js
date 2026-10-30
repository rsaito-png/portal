// 水晶玉 基本情報シート（別紙1・2）(#suishodama/basic)。実体は sui_plan（plan_type='基本情報'）。編集・確定・電子署名・印刷は「計画」の編集画面と共通。録音後に sui-draft が下書きを自動作成。
async function renderSuiBasic() {
  if (DEMO) { $('view').innerHTML = siBack + '<p>見本モードでは表示しません（ログイン後に開きます）。</p>'; return; }
  $('view').innerHTML = '<p>読み込み中…</p>';
  try {
    const us = await sb('sui_user?select=id,name&order=name'); if (!us.length) return $('view').innerHTML = siBack + '<p>先に利用者台帳で利用者を追加してください。</p>';
    if (!us.some(x => x.id === SUI.uid)) SUI.uid = us[0].id;
    const bs = await sb(`sui_plan?user_id=eq.${SUI.uid}&plan_type=eq.${encodeURIComponent('基本情報')}&select=id,version,kind,status,signed_on,signer_kind,updated_at&order=version.desc`);
    $('view').innerHTML = siBack + `<h3>📋 基本情報シート（別紙1・2）</h3><p>利用者 <select onchange="SUI.uid=+this.value;renderSuiBasic()">${us.map(x => `<option value="${x.id}" ${x.id === SUI.uid ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></p>
    <div class="card"><p class="note">「計画」で面談を録音して依頼すると、基本情報シートの下書きが自動でできます。開いて直し、「確定する」→ その場で電子署名（タブレット）または署名リンク → 印刷。</p>
    ${bs.length ? `<table class="tbl"><tr><th>版</th><th>状態</th><th>署名</th><th>更新</th><th></th></tr>${bs.map(b => `<tr><td>v${b.version}（${esc(b.kind)}）</td><td>${b.status === '確定' ? '🔒確定' : '下書き'}</td><td>${b.signed_on ? '✅ ' + esc(b.signed_on) + ' ' + esc(b.signer_kind || '') : '未'}</td><td>${esc(siFmtDt(b.updated_at))}</td><td><button onclick="sbOpen(${b.id})">開く</button></td></tr>`).join('')}</table>` : '<p>まだありません。</p>'}
    <p><button class="back" onclick="location.hash='suishodama/plan';setTimeout(()=>siNewPlan('基本情報','新規'),300)">＋白紙から作る</button></p></div>`;
  } catch (e) { $('view').innerHTML = siBack + `<p>${esc(e.message)}</p>`; }
}
function sbOpen(id) { location.hash = 'suishodama/plan'; setTimeout(() => { SUI.planId = id; renderSuiPlan(); }, 200); }
