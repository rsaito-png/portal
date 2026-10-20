// RYDEEN: 国保連請求CSV（J111 請求書・J121 明細書 / J611 実績記録票。Shift_JIS・CRLF）。署名済みの実績記録票だけが対象。
// 計算は rydeen-billing-lib.js（b-portal の TypeScript 実装を移植・tests/verify-billing-b.js で検証）。文字コード変換は vendor/encoding.min.js。
const RY_SRC = { db: '設定画面', sample: 'サンプル値(未設定)' };
const ryLoadSjis = () => window.Encoding ? Promise.resolve() : ryScript('vendor/encoding.min.js');
RV.billing = async () => {
  await Promise.all([ryLib(), ryScript('rydeen-billing-lib.js'), ryLoadSjis()]);
  const month = RYD.st.bmonth || ryToday().slice(0, 7), [y, m] = month.split('-').map(Number), last = String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0');
  const [setRows, recs] = await Promise.all([rb('bp_billing_settings?id=eq.1&select=*'), rb(`bp_service_records?service_date=gte.${month}-01&service_date=lte.${month}-${last}&select=worker_id,service_date,start_time,end_time,signed_at&order=service_date`)]);
  const ids = [...new Set(recs.filter(r => r.signed_at).map(r => r.worker_id))], inq = ids.length ? `in.(${ids.join(',')})` : null;
  const [profiles, privs] = inq ? await Promise.all([rb(`bp_profiles?id=${inq}&select=id,display_name`), rb(`bp_worker_private?user_id=${inq}&select=*`)]) : [[], []];
  const input = RydBilling.buildPortalBillingInput(y, m, { setRow: setRows[0] || null, records: recs, profiles, privs });
  let files = null, err = '';
  if (input.agg.length && !input.blocking.length) { try { files = RydBilling.buildBillingFiles(y, m, { office: input.office, users: input.users, agg: input.agg }); } catch (e) { err = e.message; } }
  RYD.st.bfiles = files;
  const blocked = input.blocking.length > 0 || !!err || !files || files.issues.length > 0, s = input.settings, src = input.sources;
  const bf = RydBilling.B_SETTING_FIELDS.map(f => { const k = 'b_' + f.key, cur = String(s[k] ?? ''), fromDb = src[k] === 'db', id = 'bs_' + f.key; let ctl;
    if (f.type === 'text') ctl = `<input id="${id}" value="${ryEsc(fromDb ? cur : '')}" placeholder="${ryEsc(cur)}">`;
    else if (f.type === 'select') ctl = `<select id="${id}"><option value="">(未設定 → 既定: ${ryEsc(cur || '空')})</option>${f.options.filter(o => o.v !== '').map(o => `<option value="${ryEsc(o.v)}" ${fromDb && cur === o.v ? 'selected' : ''}>${ryEsc(o.l)}</option>`).join('')}</select>`;
    else ctl = `<div>${f.options.map(o => `<label style="display:inline-block;margin:3px 12px 3px 0"><input type="checkbox" class="bs_addon" value="${o.v}" ${cur.split(',').includes(o.v) ? 'checked' : ''}>${ryEsc(o.l)}</label>`).join('')}</div>`;
    return `<div ${f.type === 'multi' ? 'style="grid-column:1/-1"' : ''}><label class="l">${ryEsc(f.label)}</label>${ctl}<small class="note">現在の値の出所: ${RY_SRC[src[k]]}${f.hint ? ' / ' + ryEsc(f.hint) : ''}</small></div>`; }).join('');
  const sf = RydBilling.SETTING_FIELDS.map(f => `<div><label class="l">${ryEsc(f.label)}</label><input id="bt_${f.key}" value="${ryEsc(src[f.key] === 'db' ? s[f.key] : '')}" placeholder="${ryEsc(s[f.key])}"><small class="note">現在の値の出所: ${RY_SRC[src[f.key]]}${f.hint ? ' / ' + ryEsc(f.hint) : ''}</small></div>`).join('');
  ryAdminFrame('billing', `<h3>国保連請求CSV（J111 請求書・明細書 / J611 実績記録票）</h3>
    <div class="card"><div class="row">${ryInp('b_m', 'サービス提供月', month, 'month')}<div style="align-self:end"><button class="sec" onclick="RYD.st.bmonth=ryV('b_m');renderRydeen('billing')">切替</button></div></div>
    <p>対象: ${month} の<b>署名済み</b>の実績記録票 ${input.signedCount} 件（未署名 ${input.unsignedCount} 件は除外）。Shift_JIS / CRLF。</p>
    ${files ? `<p style="font-size:14px">${files.summary.users}名 / 総単位数 ${files.summary.totalUnits} / 費用額 ${files.summary.totalCost}円 / 給付費 ${files.summary.totalBenefit}円 / 利用者負担 ${files.summary.totalBurden}円 / 処理対象年月 ${files.summary.billingYm}</p>` : ''}
    ${input.blocking.map(b => `<div class="ng">⛔ ${ryEsc(b)}</div>`).join('')}${err ? `<div class="ng">⛔ 生成エラー: ${ryEsc(err)}</div>` : ''}${(files ? files.issues : []).map(b => `<div class="ng">⛔ 形式チェック指摘: ${ryEsc(b)}</div>`).join('')}
    ${files && !files.issues.length ? '<div class="okb">✅ 形式チェック（インタフェース仕様の機械チェック） 指摘 0 件</div>' : ''}${input.warnings.map(b => `<div class="wn">⚠ ${ryEsc(b)}</div>`).join('')}
    ${input.infos.length ? `<ul style="background:#f1f1f1;border-radius:8px;padding:8px 8px 8px 28px;font-size:14px">${input.infos.map(b => `<li>${ryEsc(b)}</li>`).join('')}</ul>` : ''}${input.agg.length ? '' : '<p>この月に署名済みの記録がありません。</p>'}
    <p>${blocked ? '<span class="ng" style="display:inline-block">上の指摘を解消するとダウンロードできます</span>' : `<button class="inl" onclick="ryDownload('j111')" id="dl_j111">⬇ ${files.j111.name}（請求書・明細書）</button> <button class="inl" onclick="ryDownload('j611')" id="dl_j611">⬇ ${files.j611.name}（実績記録票）</button>`}</p>
    <p class="note">就労継続支援B型（サービス種類46）。コード・単位数は厚労省サービスコード表（令和6年度表／令和8年6月施行表）から機械転記。確信の持てない項目は「要確認」として出力を止めます。送迎・食事提供は行わないため請求に含めません。</p></div>
    <div class="card"><h4>事業所の請求設定</h4><p class="note">空欄の項目はサンプル値（未設定）として扱い、サンプル値のままでは出力できません。</p><div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr))">${sf}
    <div style="grid-column:1/-1;border-top:1px solid #ddd;margin-top:10px;padding-top:6px"><b>B型の設定</b></div>${bf}
    <label style="grid-column:1/-1"><input type="checkbox" id="bt_ishi" ${s.ishi_gen ? 'checked' : ''}> 医師未配置減算あり</label></div><button onclick="rySaveBilling()">設定を保存</button></div>`);
};
function ryDownload(which) {
  const f = RYD.st.bfiles && RYD.st.bfiles[which]; if (!f) return;
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([f.bytes], { type: 'text/csv' })); a.download = f.name; document.body.appendChild(a); a.click(); a.remove();
}
async function rySaveBilling() { ryGo(async () => {
  const row = { id: 1, updated_at: new Date().toISOString(), ishi_gen: ryC('bt_ishi') };
  for (const f of RydBilling.SETTING_FIELDS) row[f.key] = ryNull(ryV('bt_' + f.key));
  for (const f of RydBilling.B_SETTING_FIELDS) { const k = 'b_' + f.key; row[k] = f.type === 'multi' ? ([...document.querySelectorAll('.bs_addon:checked')].map(e => e.value).join(',') || null) : ryNull(ryV('bs_' + f.key)); }
  if (row.office_no && !/^\d{10}$/.test(row.office_no)) throw new Error('事業所番号は半角数字10桁で入力してください');
  await rUps('bp_billing_settings', row, 'office,id'); await renderRydeen('billing'); ryMsg('設定を保存しました。', true); }); }
