// レオの食事提供と総合日誌。ポータルが正。Googleの食事・おやつ列（金額）や国保連の請求には写さない。
// 児童ごとの食事は「あり／なし」と内容。その日全体のメニューと連絡・報告は総合日誌。
(function (g) {
  function leoMealNorm(s) {
    return String(s == null ? '' : s).normalize('NFKC').replace(/\s+/g, '');
  }
  function leoClip(s, n) {
    return String(s == null ? '' : s).trim().slice(0, n);
  }
  // シートのおやつ列には 190 のような金額が入ることがある。提供の有無としては扱わない。
  function leoMealFlag(raw) {
    const s = leoMealNorm(raw);
    if (!s) return '';
    if (s === 'あり' || s === '有' || s === '○' || s === '◯' || s === '〇') return 'あり';
    if (s === 'なし' || s === '無' || s === '無し') return 'なし';
    return '';
  }
  function leoMealPrefill(saved, sheet) {
    const own = leoMealFlag(saved);
    if (own) return own;
    if (saved != null && String(saved).trim() !== '') return '';
    return leoMealFlag(sheet);
  }
  function leoDayLogBody(form) {
    const err = [];
    const menuRaw = String((form && form.meal_menu) || '');
    const notesRaw = String((form && form.notes) || '');
    if (menuRaw.trim().length > 500) err.push('食事メニューは500文字以内にしてください');
    if (notesRaw.trim().length > 4000) err.push('連絡・報告は4000文字以内にしてください');
    return {
      err,
      body: { meal_menu: leoClip(menuRaw, 500) || null, notes: leoClip(notesRaw, 4000) || null },
    };
  }
  function leoMealBody(form) {
    const f = form || {};
    const err = [];
    const mealRaw = String(f.meal == null ? '' : f.meal).trim();
    const snackRaw = String(f.snack == null ? '' : f.snack).trim();
    const meal = mealRaw ? leoMealFlag(mealRaw) : '';
    const snack = snackRaw ? leoMealFlag(snackRaw) : '';
    if (mealRaw && !meal) err.push('食事提供は「あり」か「なし」にしてください');
    if (snackRaw && !snack) err.push('おやつ提供は「あり」か「なし」にしてください');
    const body = { meal: meal || null, snack: snack || null };
    // 内容欄が画面に無いときはキーを付けない。保存が空文字で入っている内容を消さない。
    if (Object.prototype.hasOwnProperty.call(f, 'meal_note')) {
      if (String(f.meal_note || '').trim().length > 500) err.push('食事の内容は500文字以内にしてください');
      body.meal_note = leoClip(f.meal_note, 500) || null;
    }
    if (Object.prototype.hasOwnProperty.call(f, 'day_note')) {
      if (String(f.day_note || '').trim().length > 2000) err.push('この日の記録は2000文字以内にしてください');
      body.day_note = leoClip(f.day_note, 2000) || null;
    }
    return { err, body };
  }
  function leoMealByChild(meals) {
    const m = {};
    (meals || []).forEach(r => { if (r && r.child) m[leoMealNorm(r.child)] = r; });
    return m;
  }
  function leoJissekiChildren(month, jisseki, nikki) {
    const names = [];
    const seen = new Set();
    const add = name => {
      const n = String(name || '').trim();
      const k = leoMealNorm(n);
      if (!k || seen.has(k)) return;
      seen.add(k);
      names.push(n);
    };
    (nikki || []).forEach(r => { if (String(r.day || '').slice(0, 7) === month) add(r.child); });
    (jisseki || []).forEach(r => { if (String(r.day || '').slice(0, 7) === month) add(r.child); });
    return names.sort((a, b) => a.localeCompare(b, 'ja'));
  }
  function leoChildMonth(child, month, jisseki, nikki, meals) {
    const key = leoMealNorm(child);
    const inMonth = day => String(day || '').slice(0, 7) === month;
    const same = name => !!key && leoMealNorm(name) === key;
    const by = {};
    const touch = day => by[day] || (by[day] = {
      day, status: '', start_time: '', end_time: '', service: '', pick_driver: '', drop_driver: '',
      sheet_meal: '', sheet_snack: '', activity: '', kind: '', row_no: null, source: '',
      meal: '', snack: '', meal_note: '', day_note: '',
    });
    (jisseki || []).forEach(r => {
      if (!same(r.child) || !inMonth(r.day)) return;
      const row = touch(r.day);
      if (r.status) row.status = r.status;
      if (r.start_time) row.start_time = r.start_time;
      if (r.end_time) row.end_time = r.end_time;
      if (r.source) row.source = r.source;
    });
    const nk = (nikki || []).filter(r => same(r.child) && inMonth(r.day))
      .sort((a, b) => (a.kind === '利用' ? 1 : 0) - (b.kind === '利用' ? 1 : 0) || ((a.row_no || 0) - (b.row_no || 0)));
    nk.forEach(r => {
      const row = touch(r.day);
      const use = r.kind === '利用';
      if (use || !row.kind) {
        row.kind = r.kind || row.kind;
        if (r.row_no != null) row.row_no = r.row_no;
        if (r.service) row.service = r.service;
        row.pick_driver = r.pick_driver || row.pick_driver || '';
        row.drop_driver = r.drop_driver || row.drop_driver || '';
        if (r.meal) row.sheet_meal = r.meal;
        if (r.snack) row.sheet_snack = r.snack;
        if (r.activity) row.activity = r.activity;
        if (!row.start_time && r.start_time) row.start_time = r.start_time;
        if (!row.end_time && r.end_time) row.end_time = r.end_time;
      }
      if (!row.status) row.status = r.kind === '欠席' ? '欠席' : (r.kind === '利用' ? '出席' : '');
    });
    (meals || []).forEach(r => {
      if (!same(r.child) || !inMonth(r.day)) return;
      const row = touch(r.day);
      row.meal = r.meal || '';
      row.snack = r.snack || '';
      row.meal_note = r.meal_note || '';
      row.day_note = r.day_note || '';
    });
    const days = Object.keys(by).sort().map(d => by[d]);
    const use = days.filter(d => d.status === '出席' || d.status === '利用').length;
    const abs = days.filter(d => d.status === '欠席').length;
    return { days, use, abs };
  }
  const api = {
    leoMealNorm, leoClip, leoMealFlag, leoMealPrefill, leoDayLogBody, leoMealBody,
    leoMealByChild, leoJissekiChildren, leoChildMonth,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  Object.assign(g, api);
})(typeof window !== 'undefined' ? window : globalThis);
