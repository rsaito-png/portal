// レオ 退所（left_on）。退所日の当日までは在籍。翌日以降の生成予定・カレンダー・送迎には出さない。
// 記録は消さない。型表（leo_master / leo_sheet）は読みもしないし書きもしない。
// SQL（leo_sched_plan_core / leo_sched_open）と同じ境界：day > left_on を除外、left_on < 月の1日ならその月まるごと対象外。
(function (g) {
  function leftNorm(s) { return String(s || '').replace(/[\s\u3000]/g, ''); }
  function leftDay(s) {
    const d = String(s || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : '';
  }
  function leftIndex(rows) {
    const m = {};
    for (const r of rows || []) {
      const day = leftDay(r && r.left_on);
      if (!day || !r.name) continue;
      m[r.name] = day;
      m[leftNorm(r.name)] = day;
    }
    return m;
  }
  function leftOnOf(idx, name) {
    if (!idx || name == null || name === '') return null;
    return idx[name] || idx[leftNorm(name)] || null;
  }
  // その日は退所日よりあと（退所日当日はまだ在籍）
  function leftPast(idx, name, day) {
    const d = leftOnOf(idx, name), dayS = leftDay(day);
    return !!(d && dayS && dayS > d);
  }
  // 退所日が day より前（その日を含む月の開始日を渡すと、月まるごと対象外）
  function leftBefore(idx, name, day) {
    const d = leftOnOf(idx, name), dayS = leftDay(day);
    return !!(d && dayS && d < dayS);
  }
  function leftDone(idx, name, todayStr) { return leftBefore(idx, name, todayStr); }
  function leftStatus(idx, name, todayStr) {
    const d = leftOnOf(idx, name);
    if (!d) return 'active';
    if (todayStr && d < leftDay(todayStr)) return 'left';
    return 'scheduled';
  }
  function sameChild(a, b) { return a === b || leftNorm(a) === leftNorm(b); }
  // カレンダー・送迎の予定。元の配列は変えず、退所日の翌日以降の児童だけ除いたコピーを返す。
  function filterEventsByLeft(events, idx) {
    const out = [];
    for (const e of events || []) {
      if ((e.kind === '利用' || e.kind === '休み') && e.child && leftPast(idx, e.child, e.day)) continue;
      if (e.kind === '迎え' || e.kind === '送り') {
        const kids = e.kids || [];
        if (!kids.length) { out.push(e); continue; }
        const keep = kids.filter(k => !leftPast(idx, k, e.day));
        if (!keep.length) continue;
        if (keep.length === kids.length) { out.push(e); continue; }
        const keepKey = k => keep.some(n => sameChild(n, k));
        const pick = obj => {
          if (!obj || typeof obj !== 'object') return obj;
          const o = {};
          for (const [k, v] of Object.entries(obj)) if (keepKey(k)) o[k] = v;
          return o;
        };
        out.push({ ...e, kids: keep, kid_places: pick(e.kid_places), kid_times: pick(e.kid_times), title: (e.kind === '迎え' ? '☆' : '★') + keep.join('→') });
        continue;
      }
      out.push(e);
    }
    return out;
  }
  function filterByLeftDay(rows, idx, childKey, dayKey) {
    const ck = childKey || 'child', dk = dayKey || 'day';
    return (rows || []).filter(r => !r || !r[ck] || !leftPast(idx, r[ck], r[dk]));
  }
  const api = { leftNorm, leftIndex, leftOnOf, leftPast, leftBefore, leftDone, leftStatus, filterEventsByLeft, filterByLeftDay };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  Object.assign(g, api);
})(typeof window !== 'undefined' ? window : globalThis);
