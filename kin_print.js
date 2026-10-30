// 金斗雲 訪問記録の印刷用ページ (#kintoun/print)。利用者・月を選んで印刷（A4縦、ブラウザの印刷でPDF化可）。署名画像と署名の表記を出す。Google非依存。
const KPR = { month: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 7), uid: null };
(function () { const st = document.createElement('style'); st.textContent = `@page{size:A4 portrait;margin:12mm}
.pr-doc{background:#fff;color:#000;font-size:12px}.pr-doc h2{font-size:16px;margin:4px 0}.pr-doc table{width:100%;border-collapse:collapse;table-layout:fixed}.pr-doc th,.pr-doc td{border:1px solid #444;padding:3px 4px;vertical-align:top;word-break:break-all}.pr-doc th{background:#eee}.pr-doc img{max-height:34px;max-width:100%}.pr-doc tr{page-break-inside:avoid}
@media print{header,.noprint,#out{display:none!important}body{background:#fff!important}main,#home,#view{padding:0!important;margin:0!important;max-width:none!important}.pr-doc{font-size:10.5px}}`; document.head.appendChild(st); })();
async function renderKinPrint() {
  const back = `<button class="back noprint" onclick="location.hash='kintoun'">← 金斗雲へ</button>`;
  if (DEMO) { $('view').innerHTML = back + '<p>見本モードでは表示しません（ログイン後に開きます）。</p>'; return; }
  $('view').innerHTML = '<p>読み込み中…</p>';
  try {
    const us = await sb('kin_user?select=id,name&order=name'); if (!KPR.uid && us.length) KPR.uid = us[0].id;
    const m = KPR.month, next = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 1)).toISOString().slice(0, 10);
    const vs = await sb(`kin_visit?user_id=eq.${KPR.uid}&visit_date=gte.${m}-01&visit_date=lt.${next}&select=*&order=visit_date,start_time`);
    const ids = vs.map(v => (/^kin_sign_log:(\d+)$/.exec(v.signature_url || '') || [])[1]).filter(Boolean);
    const sig = {}; if (ids.length) (await sb(`kin_sign_log?id=in.(${ids.join(',')})&select=id,signature`)).forEach(r => sig[r.id] = r.signature);
    const u = us.find(x => x.id === KPR.uid) || {}, cell = v => {
      if (v.sign_status !== '署名済み') return '未署名';
      const id = (/^kin_sign_log:(\d+)$/.exec(v.signature_url || '') || [])[1];
      const inline = v.signature_png && String(v.signature_png).indexOf('data:image/') === 0 ? `<img src="${v.signature_png}" alt="署名">` : '';
      const img = id && sig[id] ? `<img src="${sig[id]}" alt="署名">` : (inline || (v.signature_url ? '署名済（画像は保管先に有）' : ''));
      return `${img}<div>${esc(v.signer_kind || '')}${v.signed_at ? ' ' + esc(new Date(v.signed_at).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' })) : ''}</div>${v.sign_reason ? `<div>理由：${esc(v.sign_reason)}</div>` : ''}${v.late_signed ? `<div>後日署名・${esc(v.late_signed.replace(/^はい[（(]?/, '').replace(/[）)]$/, '') || '後日署名')}</div>` : ''}`; };
    const rep = v => [1, 2, 3, 4, 5].map(i => v['report' + i]).filter(Boolean).join(' / ');
    $('view').innerHTML = back + `<div class="noprint"><h3>訪問記録の印刷</h3><p>利用者 <select onchange="KPR.uid=+this.value;renderKinPrint()">${us.map(x => `<option value="${x.id}" ${x.id === KPR.uid ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select> 月 <input type="month" value="${esc(m)}" onchange="KPR.month=this.value||KPR.month;renderKinPrint()"> <button onclick="window.print()">🖨️ 印刷 / PDF保存</button></p><p class="note">印刷ダイアログで用紙A4・縦を選び、「PDFに保存」でPDF化できます。</p></div>
    <div class="pr-doc"><h2>訪問記録　${esc(u.name || '')}　${m.slice(0, 4)}年${+m.slice(5)}月（居宅介護　金斗雲）</h2>
    ${vs.length ? `<table><colgroup><col style="width:9%"><col style="width:12%"><col style="width:7%"><col style="width:10%"><col style="width:26%"><col style="width:20%"><col style="width:16%"></colgroup><tr><th>日付</th><th>時間</th><th>実時間</th><th>職員</th><th>提供内容・特記</th><th>報告</th><th>署名</th></tr>${vs.map(v => `<tr><td>${esc(v.visit_date.slice(5).replace('-', '/'))}</td><td>${esc(v.start_time.slice(0, 5))}〜${esc(v.end_time.slice(0, 5))}</td><td>${v.actual_minutes}分</td><td>${esc(v.staff_name || '')}</td><td>${esc(v.content || '')}${v.note ? `<div>特記：${esc(v.note)}</div>` : ''}</td><td>${esc(rep(v))}</td><td>${cell(v)}</td></tr>`).join('')}</table><p>計 ${vs.length}回　署名済 ${vs.filter(v => v.sign_status === '署名済み').length}回</p>` : '<p>この月の記録はありません。</p>'}</div>`;
  } catch (e) { $('view').innerHTML = back + `<p>${esc(e.message)}</p>`; }
}
