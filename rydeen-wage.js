// RYDEEN: 工賃（時給3区分 × 業務日誌の実働）。確定するまで利用者には出さない。
const ryWageLib = () => window.RydWage ? Promise.resolve() : ryScript('rydeen-wage-lib.js');
const ryWageMissing = e => /bp_wage_|schema cache|PGRST205|Could not find the table/.test(String(e && e.message || e));
const ryYen = n => Math.floor(Number(n) || 0).toLocaleString('ja-JP') + '円';
const ryWageMonth = () => { const v = ryV('w_month'); return /^\d{4}-\d{2}$/.test(v) ? v : (RYD.st.wmonth || ryToday().slice(0, 7)); };

RV.wage = async () => {
  await ryWageLib();
  const month = RYD.st.wmonth || ryToday().slice(0, 7);
  RYD.st.wmonth = month;
  const workers = RYD.workers || [];
  let rateRows = [], saved = [], dbNote = '';
  try {
    [rateRows, saved] = await Promise.all([
      rb('bp_wage_rates?select=worker_id,hourly_rate'),
      rb(`bp_wage_months?year_month=eq.${month}&select=id,worker_id,minutes,hours,hourly_rate,amount,bonus,status,paid_at&order=worker_id`),
    ]);
  } catch (e) {
    if (!ryWageMissing(e)) throw e;
    dbNote = '工賃のデータベースが未適用です。適用後に計算できます。';
  }
  const rateMap = Object.fromEntries(rateRows.map(r => [r.worker_id, r.hourly_rate]));
  const view = RydWage.monthView(workers, rateMap, saved);
  RYD.st.wageView = view;
  RYD.st.wageCsv = view.filter(r => r.saved).map(r => ({
    name: r.name, year_month: month, hours: RydWage.hoursText(r.minutes), rate: r.hourly_rate, amount: r.amount, bonus: r.bonus,
  }));
  const sum = view.reduce((a, r) => r.saved ? { amount: a.amount + r.amount, bonus: a.bonus + r.bonus } : a, { amount: 0, bonus: 0 });
  const rateSel = w => `<select id="wr_${w.id}">${['', ...RydWage.RATES].map(n => `<option value="${n}" ${rateMap[w.id] === n ? 'selected' : ''}>${n === '' ? '未設定' : n + '円'}</option>`).join('')}</select>`;
  const stLabel = r => !r.saved ? '未計算' : (r.status === 'confirmed' ? '確定' : '下書き');
  const rows = view.map(r => `<tr><td>${ryEsc(r.name || '(未設定)')}</td><td>${r.saved ? RydWage.hoursJa(r.minutes) + '（' + RydWage.hoursText(r.minutes) + '）' : '—'}</td><td>${r.hourly_rate ? r.hourly_rate + '円' : '未設定'}</td><td>${r.saved ? ryYen(r.amount) : '—'}</td><td>${r.saved ? `<input id="wb_${r.id}" type="number" min="0" step="1" value="${r.bonus}" style="width:7em">` : '—'}</td><td>${r.saved ? ryYen(r.amount + r.bonus) : '—'}</td><td>${stLabel(r)}</td><td>${r.saved ? `<input id="wp_${r.id}" type="date" value="${ryEsc(r.paid_at || '')}">` : '—'}</td><td class="noprint">${r.saved ? `<button class="inl sec" onclick="rySaveWageRow('${r.id}')">保存</button>` : ''}${r.status === 'confirmed' ? ` <button class="inl sec" onclick="ryUnconfirmWage('${r.id}')">確定を取り消す</button>` : ''}</td></tr>`).join('');
  ryAdminFrame('wage', `<h3>工賃</h3>
    <p class="note">時給は 60円・75円・90円。当該月の業務日誌のうち、通所・施設外就労・施設外支援・在宅の実働（終了−開始−休憩）×時給。円未満は切り捨て。欠席・休みは0分。毎月末日締め、支払は翌月15日（休業日は前日）。この月の支払予定は ${RydWage.payDate(month) || '—'}。</p>
    ${dbNote ? `<div class="wn">${ryEsc(dbNote)}</div>` : ''}
    <div class="card"><h4>時給区分</h4>
      ${workers.length ? `<table class="tbl"><tr><th>氏名</th><th>時給</th></tr>${workers.map(w => `<tr><td>${ryEsc(w.display_name || '(未設定)')}</td><td>${rateSel(w)}</td></tr>`).join('')}</table><button onclick="rySaveWageRates()">時給を保存</button>` : '<p>利用者がまだ登録されていません。</p>'}
    </div>
    <div class="card"><h4>${month} の工賃</h4>
      <div class="row noprint">${ryInp('w_month', '対象月', month, 'month')}<div style="align-self:end"><button class="sec" onclick="RYD.st.wmonth=ryWageMonth();renderRydeen('wage')">表示</button></div></div>
      <p class="note">再計算は下書きだけ上書きします。確定済みは、下のチェックを入れてから再計算すると上書きされ、下書きに戻ります（利用者の画面からは一旦消えます）。賞与と振込日は残します。時給を変えたあとは、もう一度再計算すると下書きの金額が変わります。</p>
      <p class="noprint"><label><input type="checkbox" id="w_force"> 確定済みも上書きする</label></p>
      <p class="noprint"><button onclick="ryRecalcWage()">日誌から再計算</button> <button class="sec" onclick="ryConfirmWage()">下書きを確定</button> <button class="sec" onclick="ryWageCsv()">CSV</button></p>
      ${workers.length ? `<table class="tbl"><tr><th>氏名</th><th>実働</th><th>時給</th><th>工賃</th><th>賞与</th><th>合計</th><th>状態</th><th>振込日</th><th class="noprint"></th></tr>${rows}<tr><td>合計</td><td></td><td></td><td>${ryYen(sum.amount)}</td><td>${ryYen(sum.bonus)}</td><td>${ryYen(sum.amount + sum.bonus)}</td><td colspan="3"></td></tr></table>` : '<p>利用者がまだ登録されていません。</p>'}
      <p class="note">賞与は年2回。出す月の行に金額を入れて「保存」します。確定すると、その内容が利用者本人の画面に出ます。</p>
    </div>`);
};

function ryWageBonusPaid(id) {
  const raw = String(ryV('wb_' + id) ?? '').trim();
  if (raw !== '' && !/^\d+$/.test(raw)) throw new Error('賞与は0以上の整数（円）にしてください');
  const paid = ryNull(ryV('wp_' + id));
  if (paid && !/^\d{4}-\d{2}-\d{2}$/.test(paid)) throw new Error('振込日が正しくありません');
  return { bonus: raw === '' ? 0 : Number(raw), paid_at: paid };
}
async function rySaveWageRates() { ryGo(async () => {
  const rows = [], drop = [];
  for (const w of RYD.workers || []) {
    const el = document.getElementById('wr_' + w.id);
    if (!el) continue;
    if (el.value === '') { drop.push(w.id); continue; }
    const n = Number(el.value);
    if (!RydWage.RATES.includes(n)) throw new Error('時給は60円・75円・90円です');
    rows.push({ worker_id: w.id, hourly_rate: n, updated_at: new Date().toISOString(), updated_by: RYD.me.uid });
  }
  if (!rows.length && !drop.length) throw new Error('時給を選んでください');
  if (drop.length) await rDel('bp_wage_rates', 'worker_id=in.(' + drop.join(',') + ')');
  if (rows.length) await rUps('bp_wage_rates', rows, 'worker_id');
  await renderRydeen('wage'); ryMsg('時給を保存しました。', true);
}); }
async function ryRecalcWage() { ryGo(async () => {
  const month = ryWageMonth(), end = RydWage.monthEnd(month); if (!end) throw new Error('月が正しくありません');
  const force = ryC('w_force');
  if (force && !confirm('確定済みの工賃も上書きし、下書きに戻します。利用者の画面からは一旦消えます。続けますか？')) return;
  const [journals, rateRows, existing] = await Promise.all([
    rb(`bp_journal?journal_date=gte.${month}-01&journal_date=lte.${end}&select=worker_id,journal_date,status,start_time,end_time,break_min&limit=2000`),
    rb('bp_wage_rates?select=worker_id,hourly_rate'),
    rb(`bp_wage_months?year_month=eq.${month}&select=worker_id,status,bonus,paid_at`),
  ]);
  const rates = Object.fromEntries(rateRows.map(r => [r.worker_id, r.hourly_rate]));
  const plan = RydWage.planUpserts({ workers: RYD.workers || [], journals, rates, existing, yearMonth: month, force });
  if (plan.rows.length) await rUps('bp_wage_months', plan.rows.map(r => ({ ...r, updated_at: new Date().toISOString() })), 'worker_id,year_month');
  RYD.st.wmonth = month; await renderRydeen('wage');
  const bits = [`${plan.rows.length}人を再計算し、下書きにしました。`];
  if (plan.skipped.length) bits.push(`確定済み ${plan.skipped.length}人は上書きしていません。`);
  if (plan.missing.length) bits.push(`時給未設定 ${plan.missing.length}人は計算していません。`);
  if (plan.gaps) bits.push(`時刻が無い、または実働が0以下の利用日が ${plan.gaps}件あります。その日は0分です。`);
  if (journals.length >= 2000) bits.push('日誌が2000件に達したため、入りきらなかった日は計算に入っていません。');
  ryMsg(bits.map(ryEsc).join('<br>'), true);
}); }
async function rySaveWageRow(id) { ryGo(async () => { const p = ryWageBonusPaid(id); await rUpd('bp_wage_months', 'id=eq.' + id, { ...p, updated_at: new Date().toISOString() }); await renderRydeen('wage'); ryMsg('保存しました。', true); }); }
async function ryConfirmWage() { ryGo(async () => {
  const month = RYD.st.wmonth;
  if (ryV('w_month') && ryV('w_month') !== month) throw new Error('月を変えたときは、先に「表示」を押してください');
  const drafts = (RYD.st.wageView || []).filter(r => r.saved && r.status === 'draft');
  if (!drafts.length) throw new Error('確定する下書きがありません。先に再計算してください。');
  if (!confirm(month + ' の下書き ' + drafts.length + '件を確定します。利用者本人の画面に表示されます。')) return;
  for (const r of drafts) { const p = ryWageBonusPaid(r.id); await rUpd('bp_wage_months', 'id=eq.' + r.id, { ...p, updated_at: new Date().toISOString() }); }
  const now = await ryNow();
  await rUpd('bp_wage_months', `year_month=eq.${month}&status=eq.draft`, { status: 'confirmed', confirmed_at: now, confirmed_by: RYD.me.uid, updated_at: now });
  RYD.st.wmonth = month; await renderRydeen('wage'); ryMsg('確定しました。', true);
}); }
async function ryUnconfirmWage(id) { if (!confirm('この人の確定を取り消し、下書きに戻します。利用者の画面からは消えます。')) return; ryGo(async () => {
  await rUpd('bp_wage_months', 'id=eq.' + id, { status: 'draft', confirmed_at: null, confirmed_by: null, updated_at: new Date().toISOString() });
  await renderRydeen('wage'); ryMsg('下書きに戻しました。', true);
}); }
function ryWageCsv() {
  const rows = RYD.st.wageCsv || []; if (!rows.length) { ryMsg('出力する明細がありません。'); return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([RydWage.csv(rows)], { type: 'text/csv;charset=utf-8' }));
  a.download = '工賃_' + (RYD.st.wmonth || 'month') + '.csv';
  document.body.appendChild(a); a.click(); a.remove();
}

RW.wage = async () => {
  await ryWageLib();
  let rows = [];
  try {
    rows = await rb(`bp_wage_months?worker_id=eq.${RYD.me.uid}&status=eq.confirmed&select=worker_id,year_month,minutes,hourly_rate,amount,bonus,paid_at,status&order=year_month.desc`);
  } catch (e) { if (!ryWageMissing(e)) throw e; }
  rows = RydWage.forWorker(rows, RYD.me.uid);
  const cur = rows.find(r => r.year_month === RYD.st.wageYm);
  if (RYD.st.wageYm && !cur) RYD.st.wageYm = null;
  if (cur) {
    const total = Math.floor(Number(cur.amount) || 0) + Math.floor(Number(cur.bonus) || 0);
    const pay = RydWage.payDate(cur.year_month);
    return ryWorkerFrame('wage', `<button class="sec" onclick="RYD.st.wageYm=null;renderRydeen('wage')">一覧へ戻る</button>
      <div class="card"><p class="big">${ryEsc(cur.year_month)} の工賃</p>
      <p style="font-size:42px;margin:8px 0"><b>${ryYen(total)}</b></p>
      <p class="big">工賃 ${ryYen(cur.amount)}　賞与 ${ryYen(cur.bonus)}</p>
      <p class="big">実働 ${RydWage.hoursJa(cur.minutes)}（${RydWage.hoursText(cur.minutes)}）　時給 ${cur.hourly_rate}円</p>
      <p class="big">支払予定 ${ryEsc(pay || '—')}</p>
      <p class="big">振込日 ${cur.paid_at ? ryEsc(cur.paid_at) : '未記録'}</p></div>`);
  }
  ryWorkerFrame('wage', `<h2>工賃</h2>${rows.length ? rows.map(r => {
    const total = Math.floor(Number(r.amount) || 0) + Math.floor(Number(r.bonus) || 0);
    return `<button style="display:block;width:100%;text-align:left;margin:10px 0" onclick="RYD.st.wageYm='${r.year_month}';renderRydeen('wage')">${ryEsc(r.year_month)}　${ryYen(total)}</button>`;
  }).join('') : '<div class="card"><p class="big">確定した工賃はまだありません。</p></div>'}`);
};
