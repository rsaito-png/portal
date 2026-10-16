// 金斗雲 利用契約書（準備中）(#kintoun/contract)。枠だけ。署名機能・本文は未作成（齊藤さんの「いいよ」待ち）。
async function renderKinContract() {
  const back = `<button class="back" onclick="location.hash='kintoun'">← 金斗雲へ</button>`;
  const docs = ['居宅介護計画書', '利用契約書', '重要事項説明書'];
  let us = [];
  if (!DEMO) { try { us = await sb('kin_user?select=id,name&order=name'); } catch (e) { us = []; } }
  $('view').innerHTML = back + `<h3>📄 利用契約書</h3><div class="card"><b>🚧 準備中です</b><p>署名機能と本文は、まだ作っていません。ここは今後の構想の枠だけです。</p></div>
  <div class="card"><h4>対象書類（予定）</h4><ul>${docs.map(d => `<li>${d}</li>`).join('')}</ul></div>
  <div class="card"><h4>利用者ごとの署名状況（枠のみ・今は全員「未」）</h4>${us.length ? `<table class="tbl"><tr><th>利用者</th>${docs.map(d => `<th>${d}</th>`).join('')}</tr>${us.map(u => `<tr><td>${esc(u.name)}</td>${docs.map(() => '<td>未</td>').join('')}</tr>`).join('')}</table>` : '<p class="note">ログイン後に利用者が表示されます。</p>'}</div>`;
}
