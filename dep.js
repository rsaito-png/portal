// 会計「償却資産」タブ（固定資産台帳 CRUD・償却資産申告書の出力・別表十六への反映）。法人管理者のみ（acc.js の認証・RLSの上で動く）。
// 計算と印刷HTMLは depcalc.js。台帳は acc_fixed_assets（RLS=法人管理者のみ）。概算。申告は税理士または本人が市へ提出する。
const DPS = { Y: 2027, fy: 2025, assets: null, edit: null, onlyReview: false };
const DCLS = ['構築物', '機械装置', '船舶', '航空機', '車両運搬具', '工具器具備品', '建物', '無形固定資産', '繰延資産', '土地', 'その他'];
const DMET = ['定額法', '定率法', '一括償却(3年均等)', '少額一時損金(10万円未満)', '少額特例(30万円未満)', '償却しない'];
const DEXC = ['', '自動車税・軽自動車税の対象', 'その他'], DDK = ['', '売却', '滅失', '移動', 'その他'];
async function depLoad() { DPS.assets = await sb('acc_fixed_assets?select=*&order=acquired_on,id&limit=2000'); return DPS.assets; }
async function depInfo() { // 申告タブの基本情報（法人番号・電話・事業種目）を借りる
  try { const r = await sb('acc_tax_inputs?select=data&order=fy_start.desc&limit=5'); const d = r.find(x => x.data && x.data.houjinNo)?.data || r[0]?.data || {}; return { houjinNo: d.houjinNo || '', phone: d.phone || '', bizType: d.bizType || '' }; } catch (e) { return {}; }
}
const dFld = (id, label, html) => `<div><label>${label}</label>${html}</div>`;
async function vDep(sp) {
  if (!M.accounts) await loadMasters();
  DPS.Y = +(sp.get('y') || DPS.Y); DPS.fy = +(sp.get('fy') || DPS.fy); if (sp.get('edit')) DPS.edit = sp.get('edit') === 'new' ? 'new' : +sp.get('edit');
  await depLoad();
  const A = DPS.assets, R = DEP.assess(A, DPS.Y), review = A.filter(a => a.needs_review), accName = id => (M.accounts.find(a => a.id === id) || {}).name || ('科目' + id);
  const yOpts = [2026, 2027, 2028, 2029].map(y => `<option value="${y}"${y === DPS.Y ? ' selected' : ''}>${DEP.era(y).replace('年', '年度')}（${y}年1月1日現在）</option>`).join('');
  const sum = `<div class="card"><div class="g"><div><label>賦課期日（申告の年度）</label><select onchange="location.hash='dep?y='+this.value">${yOpts}</select></div>
    <button onclick="depPrintNow(${DPS.Y})">🏭 償却資産申告書を出力</button><button class="sub" onclick="depCsv()">⬇ 台帳をCSV</button></div>
    <table><tr><th>対象資産</th><td>${R.rows.length}件（対象外 ${R.excluded.length}件）</td><th>評価額の合計</th><td class="r">${yen(R.total)}円</td></tr>
    <tr><th>課税標準額（千円未満切捨て）</th><td class="r">${yen(R.taxBase)}円</td><th>免税点</th><td class="r">${yen(R.thr)}円${DPS.Y >= 2027 ? '（令和9年度以後は180万円）' : ''}</td></tr>
    <tr><th>固定資産税（償却資産）概算</th><td colspan="3">${R.exempt ? `<b>課税されません</b>（免税点未満。ただし申告は必要）${R.taxBase >= R.thr * 0.9 ? '' : ''}` : `<b>${yen(R.tax)}円</b>（1.4%）`}　${Math.abs(R.taxBase - R.thr) <= R.thr * 0.15 ? '<span class="warn" style="padding:2px 6px">免税点に近いです。要確認の資産・耐用年数で課税/非課税が変わります</span>' : ''}</td></tr>
    <tr><th>提出期限</th><td colspan="3">${DEP.eraDate(R.due)}（法定は1/31。土日は翌開庁日）／提出先: 四日市市役所 資産税課 管理償却資産係（〒510-8601 諏訪町1-5 本庁舎2F）</td></tr></table>
    <p class="note">評価額=取得価額×(1−減価率×1/2)、翌年から前年度評価額×(1−減価率)、下限は取得価額の5%。根拠: 四日市市「償却資産申告の手引き」・総務省「固定資産税の概要」（出力の最終ページにURL）。</p></div>`;
  const warnBox = review.length ? `<div class="warn"><b>要確認の資産が${review.length}件あります。</b>耐用年数・取得日・摘要・設置場所をfreeeの固定資産台帳や請求書で確認し、直したら「要確認」を外してください。</div>` : '';
  const list = (DPS.onlyReview ? A.filter(a => a.needs_review) : A);
  const tab = `<div class="card scroll"><h3>固定資産台帳（${A.length}件）</h3><label style="display:inline"><input type="checkbox" ${DPS.onlyReview ? 'checked' : ''} onchange="DPS.onlyReview=this.checked;route()"> 要確認のみ</label>
    <table><tr><th>資産</th><th>事業所・所在</th><th>区分</th><th>取得日</th><th class="r">取得価額</th><th>耐用年数・償却</th><th>${DPS.Y}年申告</th><th class="r">評価額</th><th>除却</th><th></th></tr>
    ${list.map(a => { const c = DEP.classify(a, DPS.Y), e = c.target ? DEP.evalAsset(a, DPS.Y).v : null; return `<tr${a.needs_review ? ' style="background:#fffbe6"' : ''}><td>${a.needs_review ? '⚠ ' : ''}${esc(a.name)}${a.quantity > 1 ? ' ×' + a.quantity : ''}${a.needs_review ? `<br><span class="note">${esc(a.review_note || '要確認')}</span>` : ''}</td><td>${esc([a.office, a.location].filter(Boolean).join(' / '))}</td><td>${esc(a.asset_class)}</td><td>${a.acquired_on}</td><td class="r">${yen(a.cost)}</td><td>${a.life_years ? a.life_years + '年' : '<b class="ng">未</b>'} ${esc(a.dep_method)}</td><td>${c.target ? '対象' : '<span class="note">対象外: ' + esc(c.why) + '</span>'}</td><td class="r">${e == null ? '' : yen(e)}</td><td>${a.disposed_on ? esc(a.disposed_on + ' ' + (a.disposal_kind || '')) : ''}</td><td><button class="sub" onclick="location.hash='dep?edit=${a.id}'">編集</button></td></tr>`; }).join('')}</table>
    <button onclick="location.hash='dep?edit=new'">＋ 資産を追加</button></div>`;
  $('view').innerHTML = done() + `<h2>償却資産（固定資産台帳・償却資産申告）</h2>${sum}${warnBox}${DPS.edit != null ? depForm(accName) : ''}${tab}${await depB16(accName)}`;
}
function depForm(accName) {
  const a = DPS.edit === 'new' ? { asset_class: '工具器具備品', dep_method: '定額法', quantity: 1, acquired_on: '', source: '手入力' } : DPS.assets.find(x => x.id === DPS.edit) || {};
  const accs = M.accounts.filter(x => x.type === 'asset' && /固定資産|繰延/.test(x.category || '')), sel = (id, arr, v) => `<select id="${id}">${arr.map(x => `<option value="${esc(x)}"${x === (v ?? '') ? ' selected' : ''}>${esc(x || '（なし）')}</option>`).join('')}</select>`;
  return `<div class="card"><h3>${DPS.edit === 'new' ? '資産を追加' : '資産を編集'}</h3><div class="g">
    ${dFld('', '資産の名称（20字以内が目安）', `<input id="fa_name" value="${esc(a.name)}">`)}${dFld('', '事業所（城山・あさけヶ丘など）', `<input id="fa_office" value="${esc(a.office)}">`)}${dFld('', '所在（市内の所在地）', `<input id="fa_loc" value="${esc(a.location)}">`)}
    ${dFld('', '資産区分', sel('fa_cls', DCLS, a.asset_class))}${dFld('', '帳簿の勘定科目', `<select id="fa_acc"><option value="">（未設定）</option>${opts(accs, a.book_account_id)}</select>`)}
    ${dFld('', '取得日（事業に使い始めた日）', `<input id="fa_acq" type="date" value="${esc(a.acquired_on)}">`)}${dFld('', '取得価額（数量分の合計・圧縮前）', `<input id="fa_cost" type="number" inputmode="numeric" value="${esc(a.cost)}">`)}${dFld('', '数量', `<input id="fa_qty" type="number" value="${esc(a.quantity ?? 1)}">`)}
    ${dFld('', '耐用年数（税務）', `<input id="fa_life" type="number" value="${esc(a.life_years)}">`)}${dFld('', '償却方法（税務）', sel('fa_met', DMET, a.dep_method))}${dFld('', '対象外にする理由', sel('fa_exc', DEXC, a.exclude_reason))}
    ${dFld('', '除却・売却・滅失日', `<input id="fa_dis" type="date" value="${esc(a.disposed_on)}">`)}${dFld('', '減少の事由', sel('fa_dk', DDK, a.disposal_kind))}</div>
    <label style="display:inline"><input type="checkbox" id="fa_rev" ${a.needs_review ? 'checked' : ''}> 要確認</label><input id="fa_note" placeholder="要確認の内容" value="${esc(a.review_note)}"><input id="fa_memo" placeholder="メモ" value="${esc(a.memo)}">
    <button onclick="depSave()">💾 保存</button> <button class="sub" onclick="DPS.edit=null;location.hash='dep'">閉じる</button>${DPS.edit !== 'new' ? ' <button class="red" onclick="depDel()">削除</button>' : ''}
    <p class="note">区分の目安: 内装・建築設備を借り手が施工=構築物／エアコン・パソコン・什器・機器=工具器具備品／自動車=車両運搬具＋「対象外: 自動車税・軽自動車税」。10万円未満の一時損金・20万円未満の3年一括は申告不要。</p></div>`;
}
const dV = id => document.getElementById(id).value.trim();
async function depSave() {
  const rec = { name: dV('fa_name'), office: dV('fa_office') || null, location: dV('fa_loc') || null, asset_class: dV('fa_cls'), book_account_id: nn(dV('fa_acc')), acquired_on: dV('fa_acq'), cost: Math.round(+dV('fa_cost')), quantity: Math.max(1, +dV('fa_qty') || 1), life_years: nn(dV('fa_life')), dep_method: dV('fa_met'),
    exclude_reason: dV('fa_exc') || null, disposed_on: dV('fa_dis') || null, disposal_kind: dV('fa_dk') || null, needs_review: $('fa_rev').checked, review_note: dV('fa_note') || null, memo: dV('fa_memo') || null, updated_at: new Date().toISOString() };
  if (!rec.name || !rec.acquired_on || !(rec.cost >= 0) || isNaN(rec.cost)) { alert('名称・取得日・取得価額は必須です'); return; }
  if (rec.disposed_on && !rec.disposal_kind) rec.disposal_kind = 'その他';
  try { if (DPS.edit === 'new') await post('acc_fixed_assets', rec, 'return=minimal'); else await sb('acc_fixed_assets?id=eq.' + DPS.edit, { method: 'PATCH', body: JSON.stringify(rec) });
    DPS.edit = null; flash('保存しました'); location.hash === '#dep' ? route() : (location.hash = 'dep'); } catch (e) { alert(e.message); }
}
async function depDel() { if (!confirm('この資産を台帳から削除しますか？（除却・売却は削除せず「除却日」を入れてください）')) return; try { await sb('acc_fixed_assets?id=eq.' + DPS.edit, { method: 'DELETE' }); DPS.edit = null; flash('削除しました'); location.hash === '#dep' ? route() : (location.hash = 'dep'); } catch (e) { alert(e.message); } }
function depCsv() {
  const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"', H = ['名称', '事業所', '所在', '区分', '帳簿科目ID', '取得日', '取得価額', '数量', '耐用年数', '償却方法', '対象外理由', '除却日', '減少の事由', '要確認', '確認内容', '出所'];
  const rows = DPS.assets.map(a => [a.name, a.office, a.location, a.asset_class, a.book_account_id, a.acquired_on, a.cost, a.quantity, a.life_years, a.dep_method, a.exclude_reason, a.disposed_on, a.disposal_kind, a.needs_review ? '要確認' : '', a.review_note, a.source]);
  const b = new Blob(['\ufeff' + [H, ...rows].map(r => r.map(q).join(',')).join('\r\n')], { type: 'text/csv' }), l = document.createElement('a'); l.href = URL.createObjectURL(b); l.download = '固定資産台帳.csv'; l.click();
}
async function depPrintNow(Y) { // 申告タブ・償却資産タブの両方から呼ぶ。ポップアップ許可のため先に窓を開く
  const w = window.open('', '_blank'); if (!w) { alert('ポップアップがブロックされました。許可してもう一度押してください。'); return; }
  w.document.write('<p style="font:14px sans-serif">作成中…</p>');
  try { if (!M.accounts) await loadMasters(); const A = await depLoad(), info = await depInfo(), r = DEP.build({ Y, assets: A, info, accName: id => (M.accounts.find(a => a.id === id) || {}).name || '' });
    w.document.open(); w.document.write(r.html); w.document.close(); setTimeout(() => { try { w.focus(); } catch (e) {} }, 300); }
  catch (e) { w.close(); alert('出力できませんでした: ' + e.message); }
}
/* ---- 別表十六との整合 ---- */
async function depB16(accName) {
  const fy = DPS.fy, from = `${fy}-06-01`, to = `${fy + 1}-05-31`, A = DPS.assets;
  const ids = [...new Set(A.map(a => a.book_account_id).filter(Boolean))];
  let book = {}; if (ids.length) { const ls = await sb(`acc_lines?select=amount,account_id,acc_entries!inner(entry_date,kind)&side=eq.C&account_id=in.(${ids.join(',')})&acc_entries.entry_date=gte.${from}&acc_entries.entry_date=lte.${to}&acc_entries.kind=eq.manual&limit=1000`); ls.forEach(l => { book[l.account_id] = (book[l.account_id] || 0) + l.amount; }); }
  const B = DEP.b16(A, fy, book, accName), fyOpts = [2024, 2025, 2026].map(y => `<option value="${y}"${y === fy ? ' selected' : ''}>第${y - 2020}期（${y}年6月〜${y + 1}年5月）</option>`).join('');
  const cur = (await sb(`acc_tax_inputs?select=data&fy_start=eq.${from}`))[0]?.data?.dep || [];
  window.DPS_B16 = { fy, rows: B.rows, cur };
  return `<div class="card scroll"><h3>法人税 別表十六（減価償却）との整合</h3><div class="g"><div><label>事業年度</label><select onchange="location.hash='dep?fy='+this.value">${fyOpts}</select></div></div>
    <p class="note">台帳（耐用年数・償却方法）から、その期の償却限度額を計算し、帳簿の償却費（振替伝票で貸方に入った額）と比べます。償却超過＝帳簿の償却費−限度額。一括償却資産・少額資産は別表十六(六)(七)(八)のため含めません。車両・無形固定資産など<b>償却資産の対象外でも別表十六には入ります</b>。</p>
    ${B.rows.length ? `<table><tr><th>帳簿の科目</th><th class="r">件数</th><th class="r">取得価額</th><th class="r">償却限度額（台帳から計算）</th><th class="r">帳簿の償却費</th><th class="r">償却超過額</th></tr>${B.rows.map(r => `<tr><td>${esc(r.name)}</td><td class="r">${r.n}</td><td class="r">${yen(r.cost)}</td><td class="r">${yen(r.limit)}</td><td class="r">${yen(r.dep)}</td><td class="r">${yen(r.excess)}</td></tr>`).join('')}
    <tr class="tot"><td>合計</td><td></td><td class="r">${yen(B.rows.reduce((s, r) => s + r.cost, 0))}</td><td class="r">${yen(B.totalLimit)}</td><td class="r">${yen(B.totalDep)}</td><td class="r">${yen(B.totalExcess)}</td></tr></table>` : '<p class="note">この期に償却する資産がありません。</p>'}
    <p class="note">現在、申告タブの別表十六の入力: ${cur.length ? cur.map(r => esc(r.name) + ' 限度額' + yen(+r.limit || 0) + '/償却費' + yen(+r.dep || 0)).join('、') : '（なし）'}</p>
    <button onclick="depToB16()">申告タブの別表十六の入力欄へ反映（上書き）</button>
    <p class="note ${fy === 2025 ? 'warn' : ''}" style="padding:4px">${fy === 2025 ? '第5期は税理士作成の申告書で償却超過額 232,383円が確定しています。台帳の耐用年数が仮のため差が出ます。耐用年数を確定してから反映してください（反映すると申告タブの第5期の計算が変わります）。' : '耐用年数・償却方法が未確定の資産があると限度額がずれます。'}</p></div>`;
}
async function depToB16() {
  const { fy, rows, cur } = window.DPS_B16, from = `${fy}-06-01`;
  if (!rows.length) { alert('反映する資産がありません'); return; }
  if (!confirm(`申告タブの第${fy - 2020}期の別表十六の入力（現在${cur.length}行）を、台帳の${rows.length}行に置き換えます。よろしいですか？`)) return;
  try { const ex = (await sb(`acc_tax_inputs?select=data&fy_start=eq.${from}`))[0]?.data || {}, data = { ...ex, dep: rows.map(r => ({ name: r.name + '（台帳）', cost: r.cost, dep: r.dep, limit: r.limit })), dep_from_ledger_at: new Date().toISOString() };
    await sb('acc_tax_inputs?on_conflict=fy_start', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ fy_start: from, data, updated_at: new Date().toISOString() }) });
    TXS.data = {}; TXS.fy = null; flash('別表十六の入力欄に反映しました（申告タブで確認）'); route(); } catch (e) { alert(e.message); }
}
