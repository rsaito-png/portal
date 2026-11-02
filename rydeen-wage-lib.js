// RYDEEN 工賃の計算（画面とテストで共用）。金額は分×時給÷60 の円未満切り捨て。
// 時刻の読み方は rydeen-lib.js の shiftMinutes と同じ（終了−開始−休憩。0以下は0）。
(function (G) {
  const RATES = [60, 75, 90];
  const ATTEND = ['通所', '施設外就労', '施設外支援', '在宅'];
  const clock = t => { const [h, m] = String(t || '').split(':').map(Number); return Number.isFinite(h) ? h * 60 + (m || 0) : NaN; };
  const normMin = n => { const m = Math.floor(Number(n) || 0); return m > 0 ? m : 0; };
  function workDetail(row) {
    if (!row || !ATTEND.includes(row.status)) return { minutes: 0, gap: false };
    const m = clock(row.end_time) - clock(row.start_time) - (Number(row.break_min) || 0);
    if (Number.isFinite(m) && m > 0) return { minutes: m, gap: false };
    return { minutes: 0, gap: true };
  }
  const workMinutes = row => workDetail(row).minutes;
  function amount(minutes, rate) {
    if (!RATES.includes(rate)) return null;
    return Math.floor(normMin(minutes) * rate / 60);
  }
  function hoursNumber(minutes) { return Math.round(normMin(minutes) / 60 * 100) / 100; }
  function hoursText(minutes) { return hoursNumber(minutes).toFixed(2); }
  function hoursJa(minutes) { const m = normMin(minutes); return Math.floor(m / 60) + '時間' + (m % 60) + '分'; }
  function monthEnd(ym) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ym || '')) return null;
    const [y, m] = ym.split('-').map(Number);
    return ym + '-' + String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0');
  }
  // 支払予定は翌月15日（休業日の繰り上げは画面の注記のみ。ここでは日付を動かさない）
  function payDate(ym) {
    if (!monthEnd(ym)) return null;
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(Date.UTC(y, m, 15));
    return d.toISOString().slice(0, 10);
  }
  function planUpserts({ workers, journals, rates, existing, yearMonth, force }) {
    const empty = { rows: [], skipped: [], missing: [], gaps: 0 };
    if (!monthEnd(yearMonth)) return empty;
    const mins = {}, gaps = {};
    for (const j of journals || []) {
      if (!j || typeof j.journal_date !== 'string' || !j.journal_date.startsWith(yearMonth + '-')) continue;
      const d = workDetail(j);
      mins[j.worker_id] = (mins[j.worker_id] || 0) + d.minutes;
      if (d.gap) gaps[j.worker_id] = (gaps[j.worker_id] || 0) + 1;
    }
    const prev = Object.fromEntries((existing || []).filter(Boolean).map(r => [r.worker_id, r]));
    const rows = [], skipped = [], missing = [];
    let gapCount = 0;
    for (const w of workers || []) {
      gapCount += gaps[w.id] || 0;
      const rate = rates ? rates[w.id] : undefined;
      if (!RATES.includes(rate)) { missing.push(w.id); continue; }
      const old = prev[w.id];
      if (old && old.status === 'confirmed' && !force) { skipped.push(w.id); continue; }
      const minutes = mins[w.id] || 0;
      rows.push({
        worker_id: w.id,
        year_month: yearMonth,
        minutes,
        hours: hoursNumber(minutes),
        hourly_rate: rate,
        amount: amount(minutes, rate),
        bonus: old && Number(old.bonus) > 0 ? Math.floor(Number(old.bonus)) : 0,
        status: 'draft',
        paid_at: old && old.paid_at ? old.paid_at : null,
        confirmed_at: null,
        confirmed_by: null,
      });
    }
    return { rows, skipped, missing, gaps: gapCount };
  }
  function monthView(workers, rates, saved) {
    const by = Object.fromEntries((saved || []).map(r => [r.worker_id, r]));
    return (workers || []).map(w => {
      const row = by[w.id];
      const set = rates ? rates[w.id] : undefined;
      return {
        id: row ? row.id : null,
        worker_id: w.id,
        name: w.display_name || '',
        saved: !!row,
        status: row ? row.status : '',
        minutes: row ? normMin(row.minutes) : null,
        hourly_rate: row ? row.hourly_rate : (RATES.includes(set) ? set : null),
        amount: row ? row.amount : null,
        bonus: row ? Math.floor(Number(row.bonus) || 0) : 0,
        paid_at: row ? row.paid_at || null : null,
      };
    });
  }
  function forWorker(rows, uid) {
    return (rows || []).filter(r => r && r.status === 'confirmed' && (!uid || r.worker_id === uid))
      .slice().sort((a, b) => String(b.year_month).localeCompare(String(a.year_month)));
  }
  const csvCell = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  function csv(rows) {
    const head = ['氏名', '年月', '時間', '時給', '金額', '賞与'];
    const lines = [head, ...(rows || []).map(r => [r.name, r.year_month, r.hours, r.rate, r.amount, r.bonus])];
    return '\uFEFF' + lines.map(line => line.map(csvCell).join(',')).join('\r\n') + '\r\n';
  }
  const api = {
    RATES, ATTEND, workDetail, workMinutes, amount, hoursNumber, hoursText, hoursJa,
    monthEnd, payDate, planUpserts, monthView, forWorker, csv,
  };
  G.RydWage = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
