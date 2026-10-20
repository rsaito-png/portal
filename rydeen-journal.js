// RYDEEN: 業務日誌（職員が手で入れる唯一の入力）→ 実績記録票（自動転記・集計）→ 利用者の電子署名
const RY_STATUS = ['通所', '施設外就労', '施設外支援', '在宅', '欠席', '休み'], RY_HEALTH = ['良い', 'ふつう', 'やや悪い', '悪い'], RY_REASONS = ['体調不良', '家庭の事情', '通院', 'その他'];
const RY_JDEFAULT = { status: '通所', start_time: '09:30', end_time: '15:00', break_min: 60, work: '', health: 'ふつう', memo: '' };
const ryLast = m => { const [y, mo] = m.split('-').map(Number); return `${m}-${String(new Date(Date.UTC(y, mo, 0)).getUTCDate()).padStart(2, '0')}`; };

// ---------- 業務日誌 ----------
RV.journal = async () => {
  await ryLib();
  const date = RYD.st.jdate || ryToday(), rows = await rb(`bp_journal?journal_date=eq.${date}&select=*`), by = Object.fromEntries(rows.map(r => [r.worker_id, r]));
  RYD.st.jrows = by;
  const sel = (id, list, cur, ph) => `<select id="${id}" ${id.startsWith('j_st_') ? `onchange="ryJToggle('${id.slice(5)}')"` : ''}>${ph ? `<option value="">${ph}</option>` : ''}${list.map(o => `<option ${o === cur ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
  const card = w => { const r = by[w.id] || {}, st = r.status || '', off = st === '欠席' || st === '休み', none = st === '', k = w.id;
    return `<div class="jr" id="jr_${k}"><div class="row" style="align-items:end"><div style="flex:0 0 150px"><b>${ryEsc(w.display_name)}</b></div><div>${sel('j_st_' + k, RY_STATUS, st, '選択してください')}</div></div>
    <div id="j_det_${k}" class="row" style="${off || none ? 'display:none' : ''}">${ryInp('j_s_' + k, '開始', r.start_time || '', 'time', 'step=900')}${ryInp('j_e_' + k, '終了', r.end_time || '', 'time', 'step=900')}${ryInp('j_b_' + k, '休憩(分)', r.break_min ?? '', 'number', 'min=0')}
      ${ryInp('j_w_' + k, '作業内容', r.work || '')}<div><label class="l">体調</label>${sel('j_h_' + k, RY_HEALTH, r.health, '体調')}</div>${ryInp('j_m_' + k, '支援内容メモ', r.memo || '')}</div>
    <div id="j_abs_${k}" class="wn" style="${st === '欠席' ? '' : 'display:none'}"><div class="row"><div><label class="l">欠席理由</label>${sel('j_ar_' + k, RY_REASONS, r.abs_reason || RY_REASONS[0])}</div>${ryInp('j_aa_' + k, '連絡を受けた日時', r.abs_at || '', 'datetime-local')}${ryInp('j_as_' + k, '受けた職員', r.abs_staff || '')}</div>
      <label><input type="checkbox" id="j_ah_${k}" ${r.abs_handled ? 'checked' : ''}> 連絡調整・相談援助を行った</label>${ryInp('j_an_' + k, '対応内容', r.abs_note || '')}</div></div>`; };
  ryAdminFrame('journal', `<h3>業務日誌　${date}</h3><p class="note">職員が入力するのはここだけです。保存すると、利用した日は実績記録票に自動で転記されます。</p>
    <p class="noprint"><button class="sec inl" onclick="RYD.st.jdate='${ryShift(date, -1)}';renderRydeen('journal')">＜ 前日</button><button class="sec inl" onclick="RYD.st.jdate='${ryToday()}';renderRydeen('journal')">今日</button><button class="sec inl" onclick="RYD.st.jdate='${ryShift(date, 1)}';renderRydeen('journal')">翌日 ＞</button>
    <input type="date" id="j_date" value="${date}" style="width:auto" onchange="RYD.st.jdate=this.value;renderRydeen('journal')"></p>
    <button class="sec" onclick="ryJBulk()">予定どおり全員を一括入力</button>
    ${RYD.workers.map(card).join('') || '<div class="card">利用者がまだ登録されていません。</div>'}<button onclick="rySaveJournal('${date}')">保存して記録票に転記</button>`);
};
function ryJToggle(k) { const st = ryV('j_st_' + k), off = st === '欠席' || st === '休み';
  document.getElementById('j_det_' + k).style.display = off || !st ? 'none' : ''; document.getElementById('j_abs_' + k).style.display = st === '欠席' ? '' : 'none'; }
function ryJBulk() { for (const w of RYD.workers) { const k = w.id, d = RY_JDEFAULT; document.getElementById('j_st_' + k).value = d.status; document.getElementById('j_s_' + k).value = d.start_time; document.getElementById('j_e_' + k).value = d.end_time;
  document.getElementById('j_b_' + k).value = d.break_min; document.getElementById('j_h_' + k).value = d.health; ryJToggle(k); } }
async function rySaveJournal(date) { ryGo(async () => {
  const out = [], clear = [];
  for (const w of RYD.workers) { const k = w.id, st = ryV('j_st_' + k);
    if (!st) { if (RYD.st.jrows[k]) clear.push(k); continue; }
    const att = RydLib.ATTEND.includes(st), ab = st === '欠席';
    const s = ryV('j_s_' + k), e = ryV('j_e_' + k);
    if (att && s && e && e <= s) throw new Error(`${w.display_name}: 終了は開始より後にしてください`);
    out.push({ worker_id: k, journal_date: date, status: st, start_time: att ? s : '', end_time: att ? e : '', break_min: att ? Number(ryV('j_b_' + k) || 0) : 0, work: att ? ryV('j_w_' + k) : '', health: att ? ryV('j_h_' + k) : '', memo: att ? ryV('j_m_' + k) : '',
      abs_reason: ab ? ryV('j_ar_' + k) : null, abs_at: ab ? ryNull(ryV('j_aa_' + k)) : null, abs_staff: ab ? ryNull(ryV('j_as_' + k)) : null, abs_handled: ab && ryC('j_ah_' + k), abs_note: ab ? ryNull(ryV('j_an_' + k)) : null, updated_at: new Date().toISOString() }); }
  if (out.length) await rUps('bp_journal', out, 'worker_id,journal_date');
  for (const k of clear) await rDel('bp_journal', `worker_id=eq.${k}&journal_date=eq.${date}`);
  const notes = await rySyncRecords(date, RYD.workers.map(w => w.id));
  await renderRydeen('journal'); ryMsg(`保存しました（${out.length}人）。` + (notes.length ? '<br>' + notes.map(ryEsc).join('<br>') : '<br>実績記録票に転記しました。'), true); }); }

// 日誌 → 実績記録票。利用した日だけ転記。署名済みで内容が変わったものは署名を取り直し（古い署名は残さない）
async function rySyncRecords(date, ids) {
  const [js, recs] = await Promise.all([rb(`bp_journal?journal_date=eq.${date}&select=*`), rb(`bp_service_records?service_date=eq.${date}&select=id,worker_id,start_time,end_time,work_summary,signed_at`)]);
  const jm = Object.fromEntries(js.map(j => [j.worker_id, j])), rm = Object.fromEntries(recs.map(r => [r.worker_id, r])), notes = [], up = [];
  for (const k of ids) { const j = jm[k], want = j ? RydLib.recordFromJournal(j) : null, cur = rm[k], name = RYD.wname[k] || '';
    if (!want) { if (cur) { if (cur.signed_at) notes.push(`${name}: 署名済みの記録票があるため残しています（日誌が欠席・休み・未入力に変わっています）。`); else await rDel('bp_service_records', 'id=eq.' + cur.id); } continue; }
    const t5 = x => (x || '').slice(0, 5);
    if (cur && t5(cur.start_time) === t5(want.start_time) && t5(cur.end_time) === t5(want.end_time) && cur.work_summary === want.work_summary) continue;   // 変更なし（署名はそのまま）
    if (cur && cur.signed_at) notes.push(`${name}: 内容が変わったため、署名を取り直してください。`);
    up.push({ ...want, signature_data: null, signed_at: null }); }
  if (up.length) await rUps('bp_service_records', up, 'worker_id,service_date');
  return notes;
}

// ---------- 実績記録票 ----------
RV.records = async () => {
  const id = RYD.st.rec; if (id) return ryRecordSheet(id);
  const month = RYD.st.rmonth || ryToday().slice(0, 7), worker = RYD.st.rworker || (RYD.workers[0] || {}).id;
  const recs = worker ? await rb(`bp_service_records?worker_id=eq.${worker}&service_date=gte.${month}-01&service_date=lte.${ryLast(month)}&select=id,service_date,start_time,end_time,work_summary,signed_at&order=service_date`) : [];
  const un = recs.filter(r => !r.signed_at).length;
  ryAdminFrame('records', `<h3>サービス提供実績記録票</h3><p class="note">業務日誌から自動で転記・集計されます（職員の入力は不要）。利用者に署名をもらうと、国保連CSVの対象になります。</p>
    <div class="row noprint"><div><label class="l">利用者</label>${ryWorkerSelect('r_w', worker)}</div>${ryInp('r_m', '月', month, 'month')}<div style="align-self:end"><button class="sec" onclick="RYD.st.rworker=ryV('r_w');RYD.st.rmonth=ryV('r_m');renderRydeen('records')">表示</button></div></div>
    <div class="card"><p><b>${ryEsc(RYD.wname[worker] || '')}</b>　${month}　${recs.length}日　未署名 ${un}日</p><table class="tbl"><tr><th>日付</th><th>時間</th><th>作業</th><th>署名</th><th class="noprint"></th></tr>${recs.map(r => `<tr><td>${r.service_date}</td><td>${(r.start_time || '').slice(0, 5)}–${(r.end_time || '').slice(0, 5)}</td><td>${ryEsc((r.work_summary || '').slice(0, 30))}</td><td>${r.signed_at ? '✔ 署名済' : '未署名'}</td><td class="noprint"><button class="inl sec" onclick="RYD.st.rec='${r.id}';renderRydeen('records')">記録票・署名</button></td></tr>`).join('')}</table>${recs.length ? '' : '<p>この月の記録票はまだありません（業務日誌を入力してください）。</p>'}
    <p class="noprint"><button class="sec inl" onclick="ryResync('${month}')">この月を日誌から転記し直す</button> <button class="sec inl" onclick="window.print()">印刷／PDFにする</button></p></div>`);
};
async function ryResync(month) { ryGo(async () => { const js = await rb(`bp_journal?journal_date=gte.${month}-01&journal_date=lte.${ryLast(month)}&select=journal_date`); const days = [...new Set(js.map(j => j.journal_date))];
  let notes = []; for (const d of days) notes = notes.concat(await rySyncRecords(d, RYD.workers.map(w => w.id))); await renderRydeen('records'); ryMsg(`${days.length}日分を転記し直しました。` + (notes.length ? '<br>' + notes.map(ryEsc).join('<br>') : ''), true); }); }
async function ryRecordSheet(id) {
  const r = (await rb(`bp_service_records?id=eq.${id}&select=*`))[0]; if (!r) { RYD.st.rec = null; return RV.records('records'); }
  ryAdminFrame('records', `<button class="back noprint" onclick="RYD.st.rec=null;renderRydeen('records')">← 一覧</button><h3>サービス提供実績記録票</h3><div class="card"><table class="tbl"><tr><th>利用者</th><td>${ryEsc(RYD.wname[r.worker_id] || '')}</td></tr><tr><th>提供日</th><td>${r.service_date}</td></tr>
    <tr><th>時間</th><td>${(r.start_time || '').slice(0, 5)} – ${(r.end_time || '').slice(0, 5)}</td></tr><tr><th>作業内容</th><td class="pre">${ryEsc(r.work_summary)}</td></tr>
    <tr><th>利用者署名</th><td>${r.signature_data ? `<img class="sg" src="${r.signature_data}" alt="署名"><br><small>${ryDT(r.signed_at)} 署名</small>` : '未署名'}</td></tr></table></div>
    <div class="card noprint"><p><b>${r.signature_data ? '署名を取り直す' : '利用者に署名してもらう（端末を利用者に渡してください）'}</b></p>${ryPad('rc_sig')}<button onclick="rySignRecord('${id}')">署名を保存</button></div>`);
}
async function rySignRecord(id) { ryGo(async () => { const sig = ryPadData('rc_sig'); if (!sig) throw new Error('署名してください'); await rUpd('bp_service_records', 'id=eq.' + id, { signature_data: sig, signed_at: await ryNow() }); await renderRydeen('records'); ryMsg('署名を保存しました。', true); }); }
