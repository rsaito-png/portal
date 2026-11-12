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
  function leoSnackYenValue(raw) {
    const s = String(raw == null ? '' : raw).normalize('NFKC').trim().replace(/[,\s円]/g, '');
    if (!s) return { empty: true };
    if (!/^[0-9]+$/.test(s)) return { bad: true };
    const n = Number(s);
    if (!Number.isSafeInteger(n) || n < 0) return { bad: true };
    return { n };
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
    // 金額欄が画面に無いときはキーを付けない。児童ごとの日誌や実績の保存で、入っている金額を消さない。
    if (Object.prototype.hasOwnProperty.call(f, 'snack_yen')) {
      if (snack === 'あり') {
        const y = leoSnackYenValue(f.snack_yen);
        if (y.empty || y.bad) err.push('おやつが「あり」のときは、金額を0円以上の整数で入れてください');
        else body.snack_yen = y.n;
      } else body.snack_yen = null;
    }
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
      meal: '', snack: '', snack_yen: null, meal_note: '', day_note: '',
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
      row.snack_yen = r.snack_yen == null || r.snack_yen === '' ? null : r.snack_yen;
      row.meal_note = r.meal_note || '';
      row.day_note = r.day_note || '';
    });
    const days = Object.keys(by).sort().map(d => by[d]);
    const use = days.filter(d => d.status === '出席' || d.status === '利用').length;
    const abs = days.filter(d => d.status === '欠席').length;
    return { days, use, abs };
  }
  // 送迎の○。leo.js の isTrip と同じ（保護者・送迎なし・空は送迎に数えない）。
  function leoTripMark(driver) {
    return !!driver && !/送迎なし|保護者|なし/.test(String(driver));
  }
  // 昼食1回の円。supabase/leo_jippi_from_nikki.sql の leo_jippi_lunch_unit と同じ。変えるときは両方。
  const LEO_LUNCH_YEN = 300;
  function leoJidoHm(t) {
    const m = /^(\d{1,2}):(\d{2})/.exec(String(t || '').trim());
    return m ? m[1] + ':' + m[2] : '';
  }
  function leoJidoDow(day) {
    const p = String(day || '').split('-').map(Number);
    if (p.length < 3 || !p[0] || !p[1] || !p[2]) return '';
    return '日月火水木金土'[new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay()] || '';
  }
  function leoJidoEra(month) {
    const p = String(month || '').split('-').map(Number);
    const y = p[0], m = p[1];
    if (!y || !m || y < 2019) return '';
    const r = y - 2018;
    return '令和' + (r === 1 ? '元' : String(r)) + '年' + m + '月';
  }
  function leoJidoYen(n) {
    const v = Math.round(Number(n) || 0);
    const s = String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (v < 0 ? '-' : '') + s + '円';
  }
  function leoJidoEsc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
  function leoJidoNum(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  // 児童別表示の1か月。日数・欠席・時刻は leoChildMonth（実績記録と同じ）。送迎は isTrip。お昼・おやつは日誌の食事記録。
  function leoJidoBetsu(child, month, jisseki, nikki, meals, opt) {
    const o = opt || {};
    const base = leoChildMonth(child, month, jisseki, nikki, meals);
    const unit = o.lunchUnit == null ? LEO_LUNCH_YEN : leoJidoNum(o.lunchUnit);
    const tripOf = typeof o.tripOf === 'function' ? o.tripOf : (row => ({ pick: row.pick_driver || '', drop: row.drop_driver || '' }));
    const days = base.days.map(d => {
      const absent = d.status === '欠席';
      const trip = tripOf(d) || {};
      const lunch = d.meal === 'あり' ? unit : 0;
      const snack = d.snack === 'あり' ? leoJidoNum(d.snack_yen) : 0;
      return {
        day: d.day,
        dow: leoJidoDow(d.day),
        absent,
        status: absent ? '欠席' : ((d.status === '出席' || d.status === '利用') ? '出席' : (d.status || '')),
        start: absent ? '' : leoJidoHm(d.start_time),
        end: absent ? '' : leoJidoHm(d.end_time),
        pick: !absent && leoTripMark(trip.pick),
        drop: !absent && leoTripMark(trip.drop),
        lunch, snack,
        note: d.day_note || '',
      };
    });
    const lunch = days.reduce((s, d) => s + d.lunch, 0);
    const snack = days.reduce((s, d) => s + d.snack, 0);
    const burden = Math.max(0, Math.floor(leoJidoNum(o.burden)));
    return {
      child, month, era: leoJidoEra(month), days,
      use: base.use, abs: base.abs,
      pick: days.filter(d => d.pick).length,
      drop: days.filter(d => d.drop).length,
      lunch, snack, burden, total: lunch + snack + burden,
    };
  }
  function leoJidoMd(day) {
    const p = String(day || '').split('-');
    if (p.length < 3) return '';
    return Number(p[1]) + '月' + Number(p[2]) + '日';
  }
  function leoJidoHtml(vm) {
    const v = vm || {};
    const esc = leoJidoEsc;
    const yen = leoJidoYen;
    const names = v.names || [];
    const child = v.child || '';
    const month = v.month || '';
    const sheet = v.sheet;
    const opt = n => `<option value="${esc(n)}"${leoMealNorm(n) === leoMealNorm(child) ? ' selected' : ''}>${esc(n)}</option>`;
    const tools = `<div class="jd-tools noprint"><label>対象月<input type="month" value="${esc(month)}" onchange="jdMonth(this.value)"></label><button type="button" class="jd-print" onclick="print()">印刷</button></div>`;
    const pick = `<select onchange="jdPick(this.value)" aria-label="お子さま"><option value="">選んでください</option>${names.map(opt).join('')}</select>`;
    const lab = s => `<div class="jd-lab">${esc(s)}</div>`;
    const val = (s, cls) => `<div class="jd-val${cls ? ' ' + cls : ''}">${s}</div>`;
    const pair = (label, inner, cls) => lab(label) + val(inner, cls);
    const blank = '—';
    const use = sheet ? `<b>${sheet.use}日</b>` : blank;
    const abs = sheet ? `<b>${sheet.abs}日</b>` : blank;
    const ride = sheet ? `行き <b>${sheet.pick}回</b>／帰り <b>${sheet.drop}回</b>` : blank;
    const money = (n, cls) => sheet ? `<b class="${cls || ''}">${yen(n)}</b>` : blank;
    const attrs = sheet
      ? ` data-use="${sheet.use}" data-abs="${sheet.abs}" data-pick="${sheet.pick}" data-drop="${sheet.drop}" data-lunch="${sheet.lunch}" data-snack="${sheet.snack}" data-burden="${sheet.burden}" data-total="${sheet.total}"`
      : '';
    const rows = sheet ? sheet.days.map(d => {
      if (d.absent) {
        return `<tr class="jd-abs"><td class="jd-hot">${esc(leoJidoMd(d.day))}</td><td class="jd-hot">${esc(d.dow)}</td><td class="jd-hot">欠席</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`;
      }
      const yenCell = n => n ? yen(n) : '';
      return `<tr><td>${esc(leoJidoMd(d.day))}</td><td>${esc(d.dow)}</td><td>${esc(d.status || '')}</td><td>${esc(d.start)}</td><td>${esc(d.end)}</td><td>${d.pick ? '○' : ''}</td><td>${d.drop ? '○' : ''}</td><td>${yenCell(d.lunch)}</td><td>${yenCell(d.snack)}</td><td class="jd-note">${esc(d.note)}</td></tr>`;
    }).join('') : '';
    const table = sheet ? `<div class="jd-scroll"><table class="jd-days"><colgroup><col class="c-date"><col class="c-wd"><col class="c-st"><col class="c-tm"><col class="c-tm"><col class="c-go"><col class="c-go"><col class="c-yen"><col class="c-yen"><col class="c-note"></colgroup><thead><tr><th>日付</th><th>曜日</th><th>状況</th><th>開始</th><th>終了</th><th>送迎（行き）</th><th>送迎（帰り）</th><th>お昼代</th><th>おやつ代</th><th>備考</th></tr></thead><tbody>${rows || '<tr><td colspan="10">この月の記録はまだありません</td></tr>'}</tbody></table></div>` : '';
    return `<div class="jd">${tools}<div class="jd-sheet"${attrs}>
      <div class="jd-bar">サービス提供実績のご確認　レオ</div>
      <div class="jd-pairs">${pair('対象月', esc(sheet ? sheet.era : ''))}${pair('お子さま', pick, 'jd-child')}${pair('サービス', esc(sheet ? (v.service || '未設定') : ''))}</div>
      <div class="jd-pairs">${pair('ご利用日数', use)}${pair('欠席', abs)}${pair('送迎', ride)}</div>
      <div class="jd-pairs jd-money">${pair('お昼代', money(sheet && sheet.lunch))}${pair('おやつ代', money(sheet && sheet.snack))}${pair('利用者負担', money(sheet && sheet.burden))}${pair('合計', money(sheet && sheet.total, 'jd-total'))}</div>
      ${v.missing ? '<p class="jd-miss">食事の記録を一部読めません。お昼代・おやつ代は、読めた分だけです。</p>' : ''}
      ${table}
    </div>${sheet ? '' : '<p class="note noprint">お子さまを選ぶと、その子の月の実績が上の表に出ます。</p>'}
    <p class="note jd-staff noprint">職員の確認用です。この画面から保護者へは送りません。</p></div>`;
  }
  const api = {
    leoMealNorm, leoClip, leoMealFlag, leoMealPrefill, leoSnackYenValue, leoDayLogBody, leoMealBody,
    leoMealByChild, leoJissekiChildren, leoChildMonth,
    LEO_LUNCH_YEN, leoTripMark, leoJidoHm, leoJidoDow, leoJidoEra, leoJidoYen, leoJidoBetsu, leoJidoHtml,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  Object.assign(g, api);
})(typeof window !== 'undefined' ? window : globalThis);
