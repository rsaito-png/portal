// 修了証のHTML。氏名・修了日・科目・講師名は snapshot から出す。PDFはブラウザの印刷（法定研修と同じ）。
(function (root) {
  const esc = s => (root.Sct && root.Sct.esc) ? root.Sct.esc(s) : String(s ?? '');
  function fragment(snap) {
    const subjects = (snap.subjects || []).map(s => esc(s.name || s)).join('、') || '—';
    const instructors = (snap.instructors || snap.instructor_names || []).map(esc).join('、') || '（講師未記録）';
    const note = snap.exemption_note ? `<p>${esc(snap.exemption_note)}</p>` : '';
    return `<article class="sct-cert"><h1>修了証</h1>
      <p class="lead">${esc(snap.full_name)} 殿は、ストレスチェック実施者養成研修の下記科目を修了したことを証明します。</p>
      <table><tbody>
        <tr><th>氏名</th><td>${esc(snap.full_name)}</td></tr>
        <tr><th>修了日</th><td>${esc(snap.issued_on)}</td></tr>
        <tr><th>科目</th><td>${subjects}</td></tr>
        <tr><th>講師名</th><td>${instructors}</td></tr>
        ${snap.license_type ? `<tr><th>資格種別</th><td>${esc(snap.license_type)}</td></tr>` : ''}
      </tbody></table>
      ${note}
      <p class="org">${esc(snap.org || '')}${snap.signer ? `<br>${esc(snap.signer)}` : ''}</p>
      <p class="note">確認テストの合否は修了の要件にしていません。この書面は発行時の記録です。</p>
    </article>`;
  }
  function html(snap) {
    return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>修了証 ${esc(snap.full_name)}</title>
      <style>body{font-family:"Hiragino Mincho ProN","Yu Mincho",serif;color:#111;margin:24px}h1{text-align:center;letter-spacing:.4em}
      table{border-collapse:collapse;width:100%;margin:16px 0}th,td{border:1px solid #222;padding:8px;text-align:left}th{width:8em;background:#f4f4f4}
      .org{text-align:right}.note{font-size:12px;color:#444}.np{margin-bottom:16px}@media print{.np{display:none}}</style></head><body>
      <p class="np"><button onclick="print()">印刷する（PDFに保存も選べます）</button></p>${fragment(snap)}</body></html>`;
  }
  const api = { fragment, html };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SctCert = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
