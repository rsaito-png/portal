// 茶夢（生活介護）。職員が入れるのは業務日誌だけ。保存すると実績記録票へ自動転記し、署名済みだけ国保連CSVの対象。
// 請求の計算は rydeen-billing-lib.js のサービス種類22（生活介護）。B型の bp_* は使わない。
// 食事のあり／なしだけを実績と食事提供体制加算へ載せる。摂食の目安と分量は栄養士向けで、請求には入れない。
// 自由記述のポルトガル語は「日本語にする」で確認する。訳文は保存せず、原文のまま記録する。
// 曜日の職員配置は chamu_shift（見るだけ）。Google の配置表も献立シートも使わない。
const CM = { st: {}, files: null, can: false, bill: false, pad: null, loaded: {} };
const CM_NAV = [['journal', '業務日誌'], ['kondate', '献立報告'], ['haichi', '職員配置'], ['kinmu', '勤務実績'], ['records', '実績記録票'], ['billing', '国保連CSV'], ['users', '利用者']];
const CM_SHIFT_Q = 'chamu_shift?select=dow,staff_name,employment,start_time,end_time,sort&order=sort.asc,staff_name.asc';

/* cm-pure */
var ChamuLib = (() => {
  const WEATHER = ['晴れ', 'くもり', '雨', '雪'];
  const TRANSPORT = ['往復', '片道', 'なし'];
  const MEAL = ['あり', 'なし'];
  const INTAKE = ['100%', '80%', '50%', 'その他'];
  const PORTION_MAX = 80;
  const PORTION_FIELDS = [
    ['rice_portion', 'ごはん（炊いた後）'],
    ['egg_count', '卵'],
    ['tofu_g', '豆腐'],
    ['meat_note', '肉'],
    ['fish_g', '魚'],
    ['dairy_note', '牛乳・乳製品'],
  ];
  const textOf = s => String(s == null ? '' : s).trim();
  const BANDS = ['3時間未満', '3時間以上4時間未満', '4時間以上5時間未満', '5時間以上6時間未満', '6時間以上7時間未満', '7時間以上8時間未満', '8時間以上9時間未満'];
  const DEFAULTS = {
    office_no: '2410202663', office_name: '茶夢', service_type: '22', region_code: '06', unit_price: '10.37',
    shogu_rate: '0.096', shogu_item: '5175', capacity_scale: '11-20', standard_band: '4時間以上5時間未満',
    default_start: '11:00', default_end: '14:00', ishi_gen: true,
  };
  const RICE_DEFAULT = '150g';
  const INTAKE_DEFAULT = '100%';
  const clip = (s, n) => String(s == null ? '' : s).trim().slice(0, n);
  const time = v => {
    const m = /^(\d{1,2}):(\d{2})/.exec(String(v || '').trim());
    if (!m) return '';
    const h = +m[1], min = +m[2];
    if (h > 23 || min > 59) return '';
    return String(h).padStart(2, '0') + ':' + String(min).padStart(2, '0');
  };
  const minutes = t => { const s = time(t); if (!s) return null; const [h, m] = s.split(':').map(Number); return h * 60 + m; };
  const bandOf = (start, end, fallback) => {
    const a = minutes(start), b = minutes(end);
    if (a == null || b == null) return fallback || DEFAULTS.standard_band;
    let d = b - a; if (d < 0) d += 1440;
    const h = d / 60;
    if (h < 3) return BANDS[0];
    if (h < 4) return BANDS[1];
    if (h < 5) return BANDS[2];
    if (h < 6) return BANDS[3];
    if (h < 7) return BANDS[4];
    if (h < 8) return BANDS[5];
    return BANDS[6];
  };
  const ymd = v => {
    const s = String(v || '').trim();
    if (!s) return '';
    if (/^\d{8}$/.test(s)) return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8);
    return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
  };
  const settingsOf = row => {
    const s = { ...DEFAULTS };
    if (!row) return s;
    for (const k of Object.keys(DEFAULTS)) {
      if (k === 'ishi_gen') continue;
      if (row[k] != null && String(row[k]).trim() !== '') s[k] = String(row[k]).trim();
    }
    if (row.ishi_gen != null) s.ishi_gen = !!row.ishi_gen;
    return s;
  };
  const lastDay = ym => {
    const [y, m] = String(ym).split('-').map(Number);
    return String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0');
  };
  // 摂食は食事ありのときだけ。空なら初期の100%。80% などを請求の単位にはしない。
  const prepareIntake = line => {
    if (!line || line.meal !== 'あり') return { intake: null, intake_note: null };
    const intake = textOf(line.intake) || INTAKE_DEFAULT;
    if (INTAKE.indexOf(intake) < 0) return { intake, intake_note: textOf(line.intake_note) || null, bad: 'choice' };
    if (intake !== 'その他') return { intake, intake_note: null };
    const note = textOf(line.intake_note);
    if (note.length > PORTION_MAX) return { intake, intake_note: note, bad: 'note' };
    return { intake, intake_note: note || null };
  };
  const prepareLine = (line, defaults) => {
    const d = defaults || DEFAULTS;
    if (!line || !line.present) return { present: false, start_time: null, end_time: null, transport: null, meal: null, intake: null, intake_note: null, support_note: null, filled: false };
    let start = time(line.start_time), end = time(line.end_time), filled = false;
    if (!start || !end) { filled = true; start = start || time(d.default_start) || DEFAULTS.default_start; end = end || time(d.default_end) || DEFAULTS.default_end; }
    const eat = prepareIntake(line);
    return { present: true, start_time: start, end_time: end, transport: line.transport, meal: line.meal, intake: eat.intake, intake_note: eat.intake_note, support_note: clip(line.support_note, 2000), filled };
  };
  const prepareHead = form => {
    const head = { menu: clip(form && form.menu, 500) || null };
    PORTION_FIELDS.forEach(([k]) => {
      const v = clip(form && form[k], PORTION_MAX);
      head[k] = k === 'rice_portion' ? (v || RICE_DEFAULT) : (v || null);
    });
    return head;
  };
  const validateJournal = (form, defaults) => {
    const err = [];
    if (!form || !/^\d{4}-\d{2}-\d{2}$/.test(form.journal_date || '')) err.push('日付が正しくありません');
    const staff = clip(form && form.staff_name, 60);
    if (!staff) err.push('記入者を入れてください');
    if (form && form.weather && WEATHER.indexOf(form.weather) < 0) err.push('天気が正しくありません');
    if (form && clip(form.menu, 10000).length > 500) err.push('献立は500文字以内にしてください');
    if (form && clip(form.note, 10000).length > 2000) err.push('全体申し送りは2000文字以内にしてください');
    PORTION_FIELDS.forEach(([k, label]) => {
      if (form && textOf(form[k]).length > PORTION_MAX) err.push(label + 'は80文字以内にしてください');
    });
    (form && form.users || []).forEach(u => {
      if (!u) return;
      const n = (u.name || '利用者') + 'さん: ';
      if (u.present == null) { err.push(n + '出欠を選んでください'); return; }
      if (!u.present) return;
      const p = prepareLine(u, defaults);
      const a = minutes(p.start_time), b = minutes(p.end_time);
      if (a == null || b == null) err.push(n + '開始と終了を確認してください');
      else if (b <= a) err.push(n + '終了は開始より後にしてください');
      if (TRANSPORT.indexOf(u.transport) < 0) err.push(n + '送迎を選んでください');
      if (MEAL.indexOf(u.meal) < 0) err.push(n + '食事を選んでください');
      const eat = prepareIntake(u);
      if (eat.bad === 'choice') err.push(n + '摂食量は 100%・80%・50%・その他 から選んでください');
      if (eat.bad === 'note') err.push(n + '摂食のメモは80文字以内にしてください');
      if (clip(u.support_note, 10000).length > 2000) err.push(n + '支援内容は2000文字以内にしてください');
    });
    return err;
  };
  const sameRecord = (cur, want) => time(cur.start_time) === time(want.start_time) && time(cur.end_time) === time(want.end_time)
    && (cur.transport || '') === (want.transport || '') && (cur.meal || '') === (want.meal || '') && String(cur.support_note || '') === String(want.support_note || '');
  // 出席だけ実績にする。署名済みで内容が変わったら署名を外す。欠席に変わった署名済みは残す。
  const syncPlan = (lines, existing, defaults) => {
    const notes = [], upsert = [], del = [];
    const by = {};
    (existing || []).forEach(r => { by[r.user_id] = r; });
    (lines || []).forEach(line => {
      const name = line.name || '利用者', cur = by[line.user_id], prep = prepareLine(line, defaults);
      if (prep.filled) notes.push(`${name}: 時刻空欄→${prep.start_time}-${prep.end_time}補完`);
      if (!prep.present) {
        if (cur) { if (cur.signed_at) notes.push(`${name}: 署名済みの記録票があるため残しています（日誌が欠席に変わっています）。`); else del.push(cur.id); }
        return;
      }
      const want = { user_id: line.user_id, start_time: prep.start_time, end_time: prep.end_time, transport: prep.transport, meal: prep.meal, support_note: prep.support_note || '' };
      if (cur && sameRecord(cur, want)) return;
      if (cur && cur.signed_at) notes.push(`${name}: 内容が変わったため、署名を取り直してください。`);
      upsert.push({ ...want, signature_data: null, signed_at: null });
    });
    return { upsert, del, notes };
  };
  const TRANSLATE_MAX = 2000;
  const translateRequest = raw => {
    const text = String(raw == null ? '' : raw).trim();
    if (!text) return { error: '訳す文を入れてください' };
    if (text.length > TRANSLATE_MAX) return { error: '2000文字以内にしてください' };
    return { body: { text } };
  };
  const translateResult = (status, json) => {
    const translated = json && typeof json.translated === 'string' ? json.translated.trim() : '';
    if (status >= 200 && status < 300 && translated) return { translated };
    const err = json && typeof json.error === 'string' ? json.error.trim() : '';
    if (err && err.length <= 120 && !/xai-|bearer |api[_-]?key|sk-/i.test(err)) return { error: err };
    if (status === 401 || status === 403) return { error: 'この操作の権限がありません' };
    if (status === 404) return { error: '翻訳の機能がまだ有効になっていません' };
    return { error: '翻訳できませんでした' };
  };
  // 日誌保存のあと、画面中央に出す文言。補足（時刻の補完・署名の取り直し）があれば続ける。
  const journalSavedNotice = notes => {
    const extra = (notes || []).map(s => String(s == null ? '' : s).trim()).filter(Boolean);
    return { title: '保存しました', body: extra.length ? '記録票に転記しました。\n' + extra.join('\n') : '記録票に転記しました。' };
  };
  const tripsOf = t => t === '往復' ? { sog: '両', go: 1, back: 1 } : t === '片道' ? { sog: '往', go: 1, back: 0 } : { sog: 'なし', go: 0, back: 0 };
  const buildBillingInput = (year, month, src) => {
    const settings = settingsOf(src && src.settings);
    const ym = String(year) + String(month).padStart(2, '0');
    const prefix = ym.slice(0, 4) + '-' + ym.slice(4);
    const blocking = [], warnings = [];
    if (!/^\d{10}$/.test(settings.office_no)) blocking.push('事業所番号は半角数字10桁にしてください。');
    if (settings.service_type !== '22') blocking.push('サービス種類コードは22（生活介護）だけに対応しています。');
    if (settings.capacity_scale !== '11-20') blocking.push('ポータルのサービスコード表は定員11〜20人だけです。');
    const records = (src && src.records) || [];
    const inMonth = records.filter(r => String(r.service_date || '').startsWith(prefix));
    const signed = inMonth.filter(r => r.signed_at);
    const office = {
      事業所番号: settings.office_no, 事業所名: settings.office_name, サービス種類コード: '22', 地域区分コード: settings.region_code,
      地域区分単価: settings.unit_price, 処遇改善加算率: settings.shogu_rate, 処遇改善サービスコード項目: settings.shogu_item,
      利用定員規模: settings.capacity_scale, 標準提供時間帯: settings.standard_band, 既定開始時刻: settings.default_start, 既定終了時刻: settings.default_end,
      医師未配置減算: settings.ishi_gen ? 'あり' : 'なし',
    };
    const by = {};
    signed.forEach(r => { (by[r.user_id] = by[r.user_id] || []).push(r); });
    const users = [], agg = [], preview = [];
    ((src && src.users) || []).forEach(u => {
      const days = by[u.id] || [];
      const unsigned = inMonth.filter(r => r.user_id === u.id && !r.signed_at).length;
      if (!days.length && !unsigned) return;
      preview.push({ id: u.id, name: u.name || '', signed: days.length, unsigned });
      if (!days.length) return;
      const rn = String(u.recipient_no || '').trim(), city = String(u.city_no || '').trim();
      if (!/^\d{1,10}$/.test(rn)) blocking.push(`${u.name}: 受給者証番号が未設定または不正です。`);
      if (!/^\d{1,6}$/.test(city)) blocking.push(`${u.name}: 支給決定市町村番号が未設定または不正です。`);
      const kubun = Number(u.support_level);
      if (!(kubun >= 1 && kubun <= 6)) blocking.push(`${u.name}: 障害支援区分を1〜6で入れてください。`);
      if (!u.kana) warnings.push(`${u.name}: 氏名カナが空です（請求CSVのカナ欄は空になります）。`);
      users.push({
        利用者ID: u.id, 受給者証番号: rn, 支給決定市町村番号: city, 氏名: u.name || '', 氏名カナ: u.kana || '', 障害支援区分: u.support_level ?? '',
        上限管理有無: u.cap_management || '無', 上限月額: Number(u.cap_amount) || 0, 上限額管理事業所番号: u.cap_office_no || '',
        決定サービスコード: u.decision_code || '221000', 契約支給量_日: u.contract_days || '原則',
        契約開始年月日: ymd(u.contract_start), 契約終了年月日: ymd(u.contract_end), サービス開始年月日: ymd(u.service_start),
        事業者記入欄番号: u.provider_entry_no || '1', 食事提供体制加算対象: u.meal_addon === false ? '非対象' : '対象', 送迎加算区分: u.transport_class || '2',
      });
      const row = { 対象年月: ym, 利用者ID: u.id, 利用日数: days.length, 送迎往回数: 0, 送迎復回数: 0, 食事回数: 0 };
      days.forEach(r => {
        const day = Number(String(r.service_date).slice(8, 10)), k = String(day).padStart(2, '0');
        const st = time(r.start_time) || settings.default_start, en = time(r.end_time) || settings.default_end;
        if (!time(r.start_time) || !time(r.end_time)) warnings.push(`${u.name} ${r.service_date}: 開始/終了が空欄のため既定時刻で補完。`);
        const tr = tripsOf(r.transport);
        const mealOn = u.meal_addon !== false && r.meal === 'あり';
        row['利用_' + k] = '1';
        row['時間_' + k] = bandOf(st, en, settings.standard_band);
        row['送迎_' + k] = tr.sog;
        row['食事_' + k] = mealOn ? '1' : '0';
        row['開始_' + k] = st;
        row['終了_' + k] = en;
        row.送迎往回数 += tr.go;
        row.送迎復回数 += tr.back;
        if (mealOn) row.食事回数 += 1;
      });
      agg.push(row);
    });
    return { office, users, agg, settings, blocking, warnings, signedCount: signed.length, unsignedCount: inMonth.length - signed.length, preview };
  };
  const DOW_JA = ['日', '月', '火', '水', '木', '金', '土'];
  const OPEN_DOW = ['月', '火', '水', '木', '金'];
  const escHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dowOf = ymd => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''));
    if (!m) return '';
    const y = +m[1], mo = +m[2], d = +m[3];
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return '';
    return DOW_JA[dt.getUTCDay()];
  };
  const shiftOf = row => {
    const r = row || {};
    return {
      dow: String(r.dow || '').trim(),
      name: String(r.staff_name || '').trim(),
      employment: String(r.employment || '').trim(),
      start: time(r.start_time),
      end: time(r.end_time),
      sort: Number.isFinite(+r.sort) ? +r.sort : 0,
    };
  };
  const byShift = (a, b) => {
    const rank = x => x.employment === '常勤' ? 0 : 1;
    return rank(a) - rank(b) || String(a.start).localeCompare(String(b.start)) || (a.sort - b.sort) || String(a.name).localeCompare(String(b.name), 'ja');
  };
  const hhmm = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  // 常勤と非常勤が同じ時間にいるのは通常。重ねないのは安藤尚子と中村文だけ（端の 14:00 は引き継ぎ）。
  const overlapNotes = people => {
    const notes = [];
    const a = (people || []).filter(p => p.name === '安藤尚子');
    const b = (people || []).filter(p => p.name === '中村文');
    a.forEach(x => b.forEach(y => {
      const as = minutes(x.start), ae = minutes(x.end), bs = minutes(y.start), be = minutes(y.end);
      if (as == null || ae == null || bs == null || be == null) return;
      if (as < be && bs < ae) notes.push('安藤尚子と中村文が ' + hhmm(Math.max(as, bs)) + '〜' + hhmm(Math.min(ae, be)) + ' 重なっています');
    }));
    return notes;
  };
  const peopleOn = (rows, dow) => (rows || []).map(shiftOf).filter(r => r.dow === dow && r.name).sort(byShift);
  const dayShift = (ymd, rows) => {
    const dow = dowOf(ymd);
    const open = OPEN_DOW.indexOf(dow) >= 0;
    const people = open ? peopleOn(rows, dow) : [];
    return { dow, open, people, notes: overlapNotes(people) };
  };
  const weekShift = rows => OPEN_DOW.map(dow => {
    const people = peopleOn(rows, dow);
    return { dow, open: true, people, notes: overlapNotes(people) };
  });
  const peopleTable = people => `<table class="cm-shift"><tr><th>氏名</th><th>区分</th><th>時間</th></tr>${people.map(p =>
    `<tr><td>${escHtml(p.name)}</td><td>${escHtml(p.employment)}</td><td>${escHtml(p.start)}〜${escHtml(p.end)}</td></tr>`).join('')}</table>`;
  const notesHtml = notes => (notes || []).map(n => `<p class="wn">${escHtml(n)}</p>`).join('');
  const dayShiftHtml = (ymd, rows) => {
    const day = dayShift(ymd, rows);
    if (!day.dow) return '';
    const head = `<h4>この日の配置（${escHtml(day.dow)}）</h4>`;
    if (!day.open) return `<div class="card cm-shift-day">${head}<p>土日は配置がありません。</p></div>`;
    const body = day.people.length ? peopleTable(day.people) : '<p>この曜日の配置はまだ入っていません。</p>';
    return `<div class="card cm-shift-day">${head}${body}${notesHtml(day.notes)}<p class="note"><a href="#chamu/haichi">曜日ごとの配置表</a></p></div>`;
  };
  const weekShiftHtml = rows => {
    const body = weekShift(rows).map(day => `<h4>${escHtml(day.dow)}曜</h4>${day.people.length ? peopleTable(day.people) : '<p>この曜日の配置はまだ入っていません。</p>'}${notesHtml(day.notes)}`).join('');
    return `<p class="note">毎週この形です。常勤は 10:00〜18:00（休憩1時間の想定）。非常勤は 11:00〜17:00 のあいだです。</p>${body}<h4>土曜・日曜</h4><p>配置はありません。</p>`;
  };
  const shiftIssues = rows => {
    const list = (rows || []).map(shiftOf).filter(r => r.name);
    const issues = [], seen = {};
    list.forEach(r => {
      const key = r.dow + '\0' + r.name;
      if (seen[key]) issues.push(r.dow + ' ' + r.name + ' が重複しています');
      seen[key] = true;
      if (OPEN_DOW.indexOf(r.dow) < 0) issues.push(r.name + ' は土日に入れません');
      const a = minutes(r.start), b = minutes(r.end);
      if (a == null || b == null || b <= a) issues.push(r.dow + ' ' + r.name + ' の時間が正しくありません');
      if (r.employment !== '常勤' && r.employment !== '非常勤') issues.push(r.name + ' の区分が正しくありません');
      if (r.name === '加藤幸弘' && r.dow !== '水') issues.push('加藤幸弘は水曜だけです');
      if (r.name === '安藤尚子' && r.dow === '水') issues.push('安藤尚子は水曜には入りません');
      if (r.name === '中村文' && (r.start !== '14:00' || r.end !== '17:00')) issues.push('中村文は 14:00〜17:00 のままにします');
      if (r.employment === '常勤' && (r.start !== '10:00' || r.end !== '18:00')) issues.push(r.dow + 'の常勤は 10:00〜18:00 です');
      if (r.employment === '非常勤' && (r.start < '11:00' || r.end > '17:00')) issues.push(r.dow + ' ' + r.name + ' は 11:00〜17:00 のあいだです');
    });
    return issues;
  };
  // 栄養士への月次。記号は利用者全員の並び順（欠席だけの停止者は列に出さない）。氏名は受け取らない。
  const userSymbol = i => {
    let n = i, s = '';
    do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
    return s;
  };
  const portionMemo = row => PORTION_FIELDS.map(([k, label]) => {
    const v = clip(row && row[k], PORTION_MAX);
    return v ? label + ' ' + v : '';
  }).filter(Boolean).join('、');
  const menuText = row => {
    const menu = clip(row && row.menu, 500);
    const memo = portionMemo(row);
    if (menu && memo) return menu + '／' + memo;
    return menu || memo;
  };
  const intakeText = line => {
    if (!line || line.meal !== 'あり') return '';
    const intake = textOf(line.intake);
    if (INTAKE.indexOf(intake) < 0) return '';
    if (intake === 'その他') {
      const note = clip(line.intake_note, PORTION_MAX);
      return note ? 'その他（' + note + '）' : 'その他';
    }
    return intake;
  };
  const mealCell = line => {
    if (!line || line.present === false) return '';
    return line.meal === 'あり' || line.meal === 'なし' ? line.meal : '';
  };
  const menuReport = (ym, days, users) => {
    const list = (users || []).filter(u => u && u.id != null && String(u.id) !== '').map(u => ({
      id: String(u.id),
      sort: Number.isFinite(+u.sort) ? +u.sort : 0,
      active: u.active !== false,
    })).sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id));
    const symbolOf = {};
    list.forEach((u, i) => { symbolOf[u.id] = userSymbol(i); });
    const seen = {};
    (days || []).forEach(d => ((d && (d.lines || d.chamu_journal_line)) || []).forEach(l => { if (l && l.user_id) seen[String(l.user_id)] = true; }));
    const columns = list.filter(u => u.active || seen[u.id]).map(u => ({ id: u.id, symbol: symbolOf[u.id] }));
    const rows = (days || []).map(d => {
      const lines = (d && (d.lines || d.chamu_journal_line)) || [];
      const by = {};
      lines.forEach(l => { if (l && l.user_id) by[String(l.user_id)] = l; });
      let count = 0;
      const cells = columns.map(c => {
        const line = by[c.id];
        const meal = mealCell(line);
        if (meal === 'あり') count += 1;
        return { symbol: c.symbol, meal, intake: intakeText(line) };
      });
      return { date: String((d && d.journal_date) || '').slice(0, 10), menu: menuText(d), count, cells };
    }).filter(r => /^\d{4}-\d{2}-\d{2}$/.test(r.date)).sort((a, b) => a.date < b.date ? -1 : 1);
    return { ym: String(ym || ''), columns, rows, total: rows.reduce((n, r) => n + r.count, 0) };
  };
  const csvCell = v => {
    let s = String(v ?? '');
    if (/^[=+\-@\t]/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const menuReportCsv = (report, bom) => {
    const cols = (report && report.columns) || [];
    const head = ['日付', '献立'].concat(cols.flatMap(c => [c.symbol, c.symbol + '摂食'])).concat(['提供数']);
    const lines = [head.map(csvCell).join(',')];
    ((report && report.rows) || []).forEach(r => {
      const rec = [r.date, r.menu];
      (r.cells || []).forEach(c => { rec.push(c.meal, c.intake); });
      rec.push(r.count);
      lines.push(rec.map(csvCell).join(','));
    });
    const text = lines.join('\r\n') + '\r\n';
    return bom === false ? text : '\uFEFF' + text;
  };
  const menuReportHtml = report => {
    const cols = (report && report.columns) || [];
    const head = '<tr><th>日付</th><th>献立</th>' + cols.map(c => '<th>' + escHtml(c.symbol) + '</th><th>' + escHtml(c.symbol) + '摂食</th>').join('') + '<th>提供数</th></tr>';
    const body = ((report && report.rows) || []).map(r => '<tr><td>' + escHtml(r.date) + '</td><td class="menu">' + escHtml(r.menu) + '</td>'
      + (r.cells || []).map(c => '<td>' + escHtml(c.meal) + '</td><td>' + escHtml(c.intake) + '</td>').join('')
      + '<td>' + escHtml(r.count) + '</td></tr>').join('');
    const blank = body ? '' : '<tr><td colspan="' + (3 + cols.length * 2) + '">この月の日誌はまだありません。</td></tr>';
    return '<div class="cm-rep"><table>' + head + blank + body + '</table></div>';
  };
  const DIETITIAN = { name: '中東真紀', email: 'makinakahigashi@gmail.com' };
  const wareki = ym => {
    const m = /^(\d{4})-(\d{2})$/.exec(String(ym || ''));
    if (!m) return '';
    const y = +m[1], month = +m[2];
    if (month < 1 || month > 12) return '';
    if (y < 2019) return y + '年' + month + '月';
    const n = y - 2018;
    return (n === 1 ? '令和元年' : '令和' + n + '年') + month + '月';
  };
  // 下書きだけ。Gmail の view=cm は作成画面で、送信APIではない。長い月は本文を案内にし、表はCSV。
  const menuMail = report => {
    const src = report || { ym: '', columns: [], rows: [], total: 0 };
    const when = wareki(src.ym);
    const subject = '茶夢　献立報告　' + (when || '月次') + '分';
    const table = menuReportCsv(src, false).replace(/\r\n/g, '\n').trimEnd();
    const cover = [
      DIETITIAN.name + ' 様',
      '',
      'お世話になっております。生活介護事業所「茶夢」です。',
      (when || '今月') + '分の献立報告をお送りします。',
      '',
      '利用者は記号（A、B、C…）のみで、氏名は書いていません。',
      '摂食量は現場の目安です（100%・80%・50%・その他）。初期は100%です。',
      'ごはんは炊いた後の分量です。初期は150gです。たんぱく質は卵・豆腐・肉・魚・牛乳・乳製品だけを書いています。',
    ];
    const tail = ['食事を提供した回数の合計は ' + (src.total || 0) + ' です。', 'どうぞよろしくお願いいたします。', '茶夢'];
    const body = cover.concat(['', table, '']).concat(tail).join('\n');
    const shortBody = cover.concat(['', '詳細の表は、CSVを添付しています。', '']).concat(tail).join('\n');
    const links = text => {
      const mailto = 'mailto:' + DIETITIAN.email + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(text);
      const q = new URLSearchParams({ view: 'cm', fs: '1', to: DIETITIAN.email, su: subject, body: text });
      return { mailto, gmail: 'https://mail.google.com/mail/?' + q.toString() };
    };
    const fullLinks = links(body);
    const shortened = fullLinks.gmail.length > 7500;
    const used = shortened ? links(shortBody) : fullLinks;
    return {
      to: DIETITIAN.email, toName: DIETITIAN.name, subject, body, draftBody: shortened ? shortBody : body, shortened,
      csv: menuReportCsv(src, true), filename: 'chamu-kondate-' + (src.ym || 'month') + '.csv', mailto: used.mailto, gmail: used.gmail,
    };
  };
  return { WEATHER, TRANSPORT, MEAL, INTAKE, INTAKE_DEFAULT, RICE_DEFAULT, PORTION_FIELDS, BANDS, DEFAULTS, time, bandOf, settingsOf, lastDay, prepareLine, prepareHead, validateJournal, syncPlan, buildBillingInput, translateRequest, translateResult, journalSavedNotice, dowOf, dayShift, weekShift, dayShiftHtml, weekShiftHtml, shiftIssues, userSymbol, menuText, menuReport, menuReportCsv, menuReportHtml, menuMail };
})();
/* /cm-pure */

const cmEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cmToday = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
const cmShift = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const cmV = id => { const e = document.getElementById(id); return e ? e.value : ''; };
const cmC = id => { const e = document.getElementById(id); return !!(e && e.checked); };
const cmShow = html => { const v = document.getElementById('view'); if (v) v.innerHTML = html; };
const cmBack = () => '<button class="back noprint" onclick="location.hash=\'chamu\'">← 茶夢へ</button>';
const cmNav = cur => `<div class="cm-nav noprint">${CM_NAV.filter(([k]) => k !== 'billing' || CM.bill).map(([k, l]) => `<a href="#chamu/${k}" class="${k === cur ? 'on' : ''}">${l}</a>`).join('')}</div>`;
const cmFrame = (cur, html) => cmShow(`<div class="cm">${cmBack()}${cmNav(cur)}<div id="cm_m"></div>${html}</div>`);
const cmMsg = (text, ok) => { const m = document.getElementById('cm_m'); if (m) m.innerHTML = `<div class="${ok ? 'okb' : 'ng'}">${cmEsc(text).replace(/\n/g, '<br>')}</div>`; };
// 保存ボタンは日誌の一番下。上の緑枠だけだと、スクロールしたまま気づかない。
function cmNotice(title, body, ok) {
  if (typeof document === 'undefined' || !document.body) return;
  let el = document.getElementById('cm_dlg');
  if (!el) {
    el = document.createElement('div');
    el.id = 'cm_dlg';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'cm_dlg_t');
    document.body.appendChild(el);
    el.addEventListener('click', ev => { if (ev.target === el) cmNoticeClose(); });
    document.addEventListener('keydown', ev => {
      const d = document.getElementById('cm_dlg');
      if (!d || d.hidden) return;
      if (ev.key === 'Escape') cmNoticeClose();
    });
  }
  el.className = 'cm-dlg ' + (ok ? 'ok' : 'bad');
  el.hidden = false;
  el.innerHTML = '<div class="box"><b class="t" id="cm_dlg_t"></b><p class="b" id="cm_dlg_b"></p><button type="button" id="cm_dlg_ok">閉じる</button></div>';
  document.getElementById('cm_dlg_t').textContent = String(title || '');
  document.getElementById('cm_dlg_b').textContent = String(body || '');
  const btn = document.getElementById('cm_dlg_ok');
  btn.onclick = cmNoticeClose;
  btn.focus();
}
function cmNoticeClose() {
  const el = document.getElementById('cm_dlg');
  if (el) el.hidden = true;
}
function cmSaveBtn(busy) {
  const btn = document.querySelector('[data-cm-save]');
  if (!btn) return;
  btn.disabled = !!busy;
  btn.textContent = busy ? '保存しています…' : '保存して記録票に転記';
}
async function cmGo(fn, opt) {
  try { await fn(); }
  catch (e) {
    const text = String((e && e.message) || e || '保存できませんでした');
    cmMsg(text);
    if (opt && opt.notice) cmNotice(opt.notice, text, false);
  }
}
(function () {
  const st = document.createElement('style');
  st.textContent = `.cm-nav{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 14px}.cm-nav a{background:#fff4dc;border:3px solid #1a120c;border-radius:0;padding:10px 14px;text-decoration:none;color:#1c140c;font-size:17px;box-shadow:3px 3px 0 #1a120c}
.cm-nav a.on{background:var(--main);color:#fff8e8;border-color:#1a120c}
.cm label.l{display:block;font-size:16px;color:#4e4336;margin-top:8px}.cm textarea,.cm select{width:100%;box-sizing:border-box;font-size:17px;padding:10px;border:3px solid #1a120c;border-radius:0;margin:4px 0;background:#fffef8}.cm textarea{min-height:72px}
.cm .row{display:flex;gap:10px;flex-wrap:wrap}.cm .row>*{flex:1;min-width:140px}.cm .cm-who{flex:0 0 160px;min-width:160px}
.cm button.sec{background:#fff4dc;color:#1c140c;border:3px solid #1a120c;box-shadow:3px 3px 0 #1a120c}.cm button.inl{width:auto;padding:8px 14px;margin:2px}
.cm input[type=checkbox]{width:auto;transform:scale(1.2);margin-right:6px}
.cm .jr{border:3px solid #1a120c;border-radius:0;padding:10px;margin:8px 0;background:#fff4dc;box-shadow:3px 3px 0 #1a120c;color:#1c140c}
.cm .cm-lab{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
.cm .cm-lab label.l{flex:1 1 auto;margin-bottom:0}
.cm .cm-lab button{width:auto;flex:0 0 auto;margin-top:8px}
.cm .cm-tr{margin:0 0 8px}.cm .cm-tr .cap{font-size:15px;color:#4e4336;margin:6px 0 4px}
.cm .cm-tr .ja{background:#fffef8;border:3px solid #1a120c;padding:10px;white-space:pre-wrap;box-shadow:3px 3px 0 #1a120c;font-size:17px;color:#1c140c}
.cm .ng{background:#fde8e8;border:3px solid #1a120c;border-radius:0;padding:8px 10px;margin:6px 0;white-space:pre-wrap}.cm .okb{background:#e6f4ea;border:3px solid #1a120c;border-radius:0;padding:8px 10px;margin:6px 0}.cm .wn{background:#fff6d6;border:3px solid #1a120c;border-radius:0;padding:8px 10px;margin:6px 0}
.cm-dlg{position:fixed;inset:0;z-index:100;background:rgba(7,6,10,.72);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}
.cm-dlg[hidden]{display:none!important}
.cm-dlg .box{background:#fff4dc;color:#1c140c;border:4px solid #1a120c;box-shadow:6px 6px 0 #07060a;max-width:28em;width:100%;max-height:min(80vh,640px);overflow:auto;padding:22px 18px 16px;box-sizing:border-box}
.cm-dlg.bad .box{background:#fde8e8}
.cm-dlg .t{display:block;font-size:1.25em;line-height:1.4;margin:0 0 10px}
.cm-dlg.ok .t{color:#145c32}
.cm-dlg.bad .t{color:#8e1b1b}
.cm-dlg .b{margin:0;white-space:pre-wrap;font-size:1em;line-height:1.55;color:#1c140c}
.cm-dlg button{margin-top:16px}
.cm .note{color:#4e4336}body.portal .cm>.note{color:#fff6e4}.cm img.cm-sg{width:260px;max-width:100%;border:3px solid #1a120c;background:#fff}
.cm .cm-rep{overflow-x:auto}.cm .cm-rep table{border-collapse:collapse;min-width:640px}.cm .cm-rep th,.cm .cm-rep td{border:2px solid #1a120c;padding:4px 6px;font-size:15px;background:#fffef8}
.cm .cm-rep td.menu{white-space:normal;min-width:16em}.cm pre.cm-mail{white-space:pre-wrap;background:#fffef8;border:3px solid #1a120c;padding:10px;font-size:15px;box-shadow:3px 3px 0 #1a120c}
.cm a.btn{display:inline-block;background:#fff4dc;color:#1c140c;border:3px solid #1a120c;box-shadow:3px 3px 0 #1a120c;padding:8px 14px;margin:2px;text-decoration:none}
.cm .pad{height:200px;touch-action:none}.cm .pad canvas{width:100%;height:100%;display:block;background:#fff;border:3px solid #1a120c;border-radius:0;touch-action:none}
@media screen and (min-width:900px){
.cm{font-size:48px;line-height:1.45}
.cm h3{font-size:60px;line-height:1.3}
.cm h4{font-size:50px;line-height:1.3}
.cm-nav{gap:18px;margin:20px 0 28px}
.cm-nav a{font-size:50px;padding:22px 28px;line-height:1.25}
.cm label.l{font-size:48px;margin-top:16px;line-height:1.35}
.cm textarea,.cm select,.cm input:not([type=checkbox]){font-size:51px;padding:20px 22px;margin:10px 0;line-height:1.35;min-height:92px}
.cm textarea{min-height:216px}
.cm button{font-size:48px;padding:20px 26px;line-height:1.3}
.cm button.inl,.cm a.btn{font-size:46px;padding:18px 26px;margin:8px 12px 8px 0}
.cm .row{gap:22px}
.cm .row>*{min-width:420px}
.cm .jr>.row{align-items:flex-start!important}
.cm .cm-who{flex:0 0 auto;min-width:8em}
.cm input[type=time],.cm input[type=date]{min-width:0}
.cm .jr{padding:26px;margin:22px 0}
.cm .cm-lab{gap:16px}
.cm input[type=checkbox]{width:44px;height:44px;transform:none;margin:10px 16px 10px 0}
.cm .cm-tr{margin:0 0 18px}
.cm .cm-tr .cap{font-size:45px;margin:14px 0 10px}
.cm .cm-tr .ja{font-size:51px;padding:22px;line-height:1.45}
.cm .ng,.cm .okb,.cm .wn{font-size:46px;padding:18px 22px;margin:14px 0;line-height:1.45}
.cm .note{font-size:45px;line-height:1.5}
.cm-dlg{font-size:46px}
.cm-dlg .box{max-width:22em;padding:36px 32px 28px;max-height:min(86vh,1200px)}
.cm-dlg .t{font-size:1.2em}
.cm-dlg .b{font-size:1em}
.cm-dlg button{font-size:46px;padding:18px 28px}
.cm table,.cm .cm-rep th,.cm .cm-rep td{font-size:45px}
.cm .cm-rep table{min-width:1100px}
.cm .cm-rep th,.cm .cm-rep td{padding:12px 14px}
.cm table.cm-shift{font-size:48px}
.cm table.cm-shift th,.cm table.cm-shift td{font-size:48px;padding:14px 16px}
.cm pre.cm-mail{font-size:45px;padding:22px;line-height:1.45}
.cm .pad{height:480px}
}
@media print{header,.back,.cm-nav,.noprint,#help,#out,.cm-dlg{display:none!important}body{background:#fff}main{max-width:none;padding:0}}`;
  document.head.appendChild(st);
})();

async function cmRest(path, opt, retried) {
  let s = {}; try { s = JSON.parse(localStorage.getItem('sess') || '{}'); } catch (e) { s = {}; }
  if (s.exp && s.exp < Date.now() + 30000 && !retried && typeof refreshSess === 'function') {
    if (await refreshSess()) { try { s = JSON.parse(localStorage.getItem('sess') || '{}'); } catch (e) { s = {}; } }
  }
  let r;
  try {
    r = await fetch(C.supabaseUrl + '/rest/v1/' + path, { ...(opt || {}), headers: { apikey: C.supabaseKey, Authorization: 'Bearer ' + (s.token || ''), 'Content-Type': 'application/json', ...((opt && opt.headers) || {}) } });
  } catch (e) { throw new Error('通信できませんでした。もう一度押してください。'); }
  if (r.status === 401 && !retried && typeof refreshSess === 'function' && await refreshSess()) return cmRest(path, opt, true);
  if (!r.ok) {
    let msg = '保存できませんでした（' + r.status + '）';
    try { const j = await r.json(); if (j.message) msg = j.message; } catch (e) { /* 本文なし */ }
    if (r.status === 401 || r.status === 403 || /row-level security|permission denied/i.test(msg)) msg = 'この操作の権限がありません。';
    if (/intake|rice_portion|egg_count|tofu_g|meat_note|fish_g|dairy_note/.test(msg)) msg += ' supabase/chamu.sql を適用してください。';
    throw new Error(msg);
  }
  if (r.status === 204) return null;
  const tx = await r.text();
  return tx ? JSON.parse(tx) : null;
}
const cmRpc = fn => cmRest('rpc/' + fn, { method: 'POST', body: '{}' });
async function cmNow() { try { const t = await cmRpc('chamu_now'); return t || new Date().toISOString(); } catch (e) { return new Date().toISOString(); } }
async function cmUsers(all) { return await cmRest('chamu_users?' + (all ? '' : 'active=eq.true&') + 'select=*&order=sort.asc,name.asc') || []; }
async function cmSettingsRow() { const rows = await cmRest('chamu_billing_settings?id=eq.1&select=*') || []; return rows[0] || null; }
async function cmStaffName() { try { const p = await cmRest('staff_profiles?select=nikki_name'); return (p && p[0] && p[0].nikki_name) || ''; } catch (e) { return ''; } }
function cmScript(src) {
  if (src.indexOf('encoding') >= 0 && window.Encoding) return Promise.resolve();
  if (src.indexOf('rydeen-billing') >= 0 && window.RydBilling) return Promise.resolve();
  return CM.loaded[src] || (CM.loaded[src] = new Promise((ok, ng) => {
    const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => { delete CM.loaded[src]; ng(new Error('部品を読み込めませんでした')); }; document.head.appendChild(s);
  }));
}
function cmSel(id, list, cur, blank) {
  const opts = (blank ? [`<option value="">${cmEsc(blank)}</option>`] : []).concat(list.map(o => {
    const v = Array.isArray(o) ? o[0] : o, l = Array.isArray(o) ? o[1] : o;
    return `<option value="${cmEsc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${cmEsc(l)}</option>`;
  }));
  return `<select id="${id}">${opts.join('')}</select>`;
}
const cmInp = (id, label, val, type, extra) => `<div><label class="l">${label}</label><input id="${id}" type="${type || 'text'}" value="${cmEsc(val ?? '')}" ${extra || ''}></div>`;

async function renderChamu(sub) {
  sub = sub || 'journal';
  if (sub === 'kinmu' && typeof kmOpen === 'function') {
    document.body.classList.add('wide-sheet');
    return kmOpen('chamu');
  }
  if (typeof DEMO !== 'undefined' && DEMO) return cmShow(cmBack() + '<div class="card"><p>見本モードでは、茶夢の日誌は使えません。ログインしてお使いください。</p></div>');
  cmShow(cmBack() + '<p>読み込み中…</p>');
  try {
    CM.can = await cmRpc('chamu_can');
    CM.bill = await cmRpc('chamu_can_bill');
  } catch (e) { return cmShow(cmBack() + `<div class="card"><p>${cmEsc(e.message || e)}</p><p class="note">茶夢の表がまだないときは、supabase/chamu.sql を適用してください。</p></div>`); }
  if (CM.can !== true) return cmShow(cmBack() + '<div class="card"><p>茶夢の記録は、茶夢の職員と、事務・会長が使えます。</p><p class="note">茶夢の職員として使うには、管理者に所属（staff_profiles の office）か兼務（extra_offices）へ「茶夢」を入れてもらってください。</p></div>');
  if (sub === 'billing' && CM.bill !== true) return cmFrame('billing', '<div class="card"><p>国保連CSVは、事務・茶夢の管理者・会長だけが作れます。</p></div>');
  const page = { journal: cmJournal, kondate: cmKondate, haichi: cmHaichi, records: cmRecords, billing: cmBilling, users: cmUsersPage }[sub] || cmJournal;
  try { await page(); } catch (e) { cmFrame(sub, `<div class="ng">${cmEsc(e.message || e)}</div>`); }
}

async function cmJournal() {
  const date = CM.st.date || cmToday();
  const [users, day, settings, staff, shift] = await Promise.all([
    cmUsers(false),
    cmRest(`chamu_journal?journal_date=eq.${date}&select=*,chamu_journal_line(*)`).then(a => (a && a[0]) || null),
    cmSettingsRow(), cmStaffName(),
    cmRest(CM_SHIFT_Q).then(a => ({ rows: a || [] })).catch(() => ({ error: true })),
  ]);
  const lines = (day && day.chamu_journal_line) || [];
  const by = {}; lines.forEach(l => { by[l.user_id] = l; });
  CM.st.date = date;
  const card = u => {
    const l = by[u.id] || {}, chosen = l.user_id ? (l.present ? '出席' : '欠席') : '', k = u.id;
    const meal = l.meal || 'あり', intake = l.intake || (meal === 'あり' ? ChamuLib.INTAKE_DEFAULT : '');
    return `<div class="jr"><div class="row" style="align-items:end"><div class="cm-who"><b>${cmEsc(u.name)}</b></div><div><label class="l">出欠 / Presença</label>${cmSel('p_' + k, ['出席', '欠席'], chosen, '選択')}</div></div>
      <div id="det_${k}" class="row" style="${chosen === '出席' ? '' : 'display:none'}">${cmInp('s_' + k, '開始 / Início', (l.start_time || '').slice(0, 5), 'time')}${cmInp('e_' + k, '終了 / Fim', (l.end_time || '').slice(0, 5), 'time')}
        <div><label class="l">送迎 / Transporte</label>${cmSel('t_' + k, ChamuLib.TRANSPORT, l.transport || '往復')}</div>
        <div><label class="l">食事 / Refeição</label>${cmSel('m_' + k, ChamuLib.MEAL, meal)}</div>
        <div id="eat_${k}" style="flex:1 1 100%;${meal === 'あり' ? '' : 'display:none'}"><label class="l">摂食 / Quanto comeu</label>${cmSel('i_' + k, ChamuLib.INTAKE, intake, '未記入')}
          <p class="note">ざっくりで大丈夫です。初期は100%です（80%・50%・その他も選べます）。<br>Pode ser aproximado. O padrão é 100%.</p>
          <div id="eatn_${k}" style="${l.intake === 'その他' ? '' : 'display:none'}">${cmInp('in_' + k, 'その他の目安（任意） / Outro (opcional)', l.intake_note || '', 'text', 'maxlength="80" placeholder="例: 半分も残した"')}</div></div>
        <div style="flex:1 1 100%">${cmNoteField('n_' + k, '支援内容・ご様子 / Apoio e estado da pessoa', l.support_note || '')}</div></div></div>`;
  };
  cmFrame('journal', `<h3>業務日誌 / Diário de trabalho　${cmEsc(date)}</h3><p class="note">職員が入力するのはここだけです。保存すると、出席した日は実績記録票に自動で転記されます。<br>Os funcionários só preenchem aqui. Ao salvar, os dias de presença vão automaticamente para o registro de serviços.</p>
    <p class="noprint"><button class="sec inl" onclick="CM.st.date='${cmShift(date, -1)}';renderChamu('journal')">＜ 前日 / Dia anterior</button>
    <button class="sec inl" onclick="CM.st.date='${cmToday()}';renderChamu('journal')">今日 / Hoje</button>
    <button class="sec inl" onclick="CM.st.date='${cmShift(date, 1)}';renderChamu('journal')">翌日 / Próximo dia ＞</button>
    <input type="date" id="j_date" value="${date}" style="width:auto" onchange="CM.st.date=this.value;renderChamu('journal')"></p>
    ${shift.error ? '<div class="card"><h4>この日の配置 / Equipe do dia</h4><p class="note">配置表を読めませんでした。supabase/chamu_shift.sql を適用してください。</p></div>' : ChamuLib.dayShiftHtml(date, shift.rows)}
    <div class="card">${cmInp('j_staff', '記入者 / Quem preencheu', (day && day.staff_name) || staff)}
      <div><label class="l">天気 / Tempo</label>${cmSel('j_weather', ChamuLib.WEATHER, (day && day.weather) || '', '（未選択）')}</div>
      <label class="l">献立 / Cardápio</label><textarea id="j_menu" maxlength="500" placeholder="例: ごはん、味噌汁、豚肉の生姜焼き">${cmEsc((day && day.menu) || '')}</textarea>
      <p class="note">栄養士への分量です。ごはん（炊いた後）の初期は150gです。半量の日は、その量に書き換えてください。卵・豆腐・肉・魚・牛乳は空欄でも保存できます。<br>Quantidades para a nutricionista. Arroz (cozido) começa em 150g. Ovos, tofu, carne, peixe e leite podem ficar em branco.</p>
      <div class="row">${cmInp('j_rice', 'ごはん（炊いた後） / Arroz (cozido)', (day && String(day.rice_portion || '').trim()) || ChamuLib.RICE_DEFAULT, 'text', 'maxlength="80" placeholder="半量の例: 75g"')}
        ${cmInp('j_egg', '卵（個数） / Ovos (qtd.)', (day && day.egg_count) || '', 'text', 'maxlength="80" placeholder="例: 1個"')}
        ${cmInp('j_tofu', '豆腐（1人分） / Tofu (por pessoa)', (day && day.tofu_g) || '', 'text', 'maxlength="80" placeholder="例: 150g"')}
        ${cmInp('j_meat', '肉（1人分） / Carne (por pessoa)', (day && day.meat_note) || '', 'text', 'maxlength="80" placeholder="例: 豚肉50g、ハム1枚、ソーセージ1本"')}
        ${cmInp('j_fish', '魚（1人分） / Peixe (por pessoa)', (day && day.fish_g) || '', 'text', 'maxlength="80" placeholder="例: 80g"')}
        ${cmInp('j_dairy', '牛乳・乳製品 / Leite e laticínios', (day && day.dairy_note) || '', 'text', 'maxlength="80" placeholder="例: 200g（なければ空欄）"')}</div>
      ${cmNoteField('j_note', '全体申し送り / Recado geral', (day && day.note) || '')}</div>
    <p class="noprint"><button class="sec inl" onclick="cmBulk()">予定どおり全員を一括入力 / Preencher todos conforme o plano</button></p>
    ${users.map(card).join('') || '<div class="card">利用者がまだいません。<a href="#chamu/users">利用者</a>から登録してください。</div>'}
    <button type="button" data-cm-save onclick="cmSaveJournal()">保存して記録票に転記</button><p class="note">↑ Salvar e passar para o registro de serviços</p>`);
  users.forEach(u => {
    const p = document.getElementById('p_' + u.id), m = document.getElementById('m_' + u.id), i = document.getElementById('i_' + u.id);
    if (p) p.onchange = () => cmToggle(u.id);
    if (m) m.onchange = () => cmMealToggle(u.id);
    if (i) i.onchange = () => cmMealToggle(u.id);
  });
  CM.st.users = users;
  CM.st.defaults = ChamuLib.settingsOf(settings);
}
async function cmHaichi() {
  let body;
  try {
    const rows = await cmRest(CM_SHIFT_Q) || [];
    body = ChamuLib.weekShiftHtml(rows);
  } catch (e) {
    body = '<div class="card"><p>配置表を読めませんでした。</p><p class="note">supabase/chamu_shift.sql を適用してください。</p></div>';
  }
  cmFrame('haichi', `<h3>職員配置表</h3><p class="note">曜日を見ると、その日に誰がいるかが分かります。日誌の日付にも、同じ曜日の配置を出します。月ごとの三重県様式は <a href="#chamu/kinmu">勤務実績及び利用者の実績表</a> です。</p>${body}`);
}
function cmNoteField(id, label, value) {
  const safe = String(id).replace(/[^A-Za-z0-9_-]/g, '');
  return `<div class="cm-lab"><label class="l">${cmEsc(label)}</label><button type="button" class="sec inl noprint" id="tr_btn_${safe}" onclick="cmTranslate('${safe}')" title="Traduzir para japonês">日本語にする</button><span class="note noprint"> ← Traduzir para japonês</span></div><textarea id="${safe}">${cmEsc(value || '')}</textarea><div id="tr_out_${safe}" class="cm-tr noprint"></div>`;
}
function cmMealToggle(id) {
  const eat = document.getElementById('eat_' + id), note = document.getElementById('eatn_' + id), intake = document.getElementById('i_' + id);
  const on = cmV('m_' + id) === 'あり';
  if (eat) eat.style.display = on ? '' : 'none';
  if (on && intake && !intake.value) intake.value = ChamuLib.INTAKE_DEFAULT;
  if (note) note.style.display = cmV('i_' + id) === 'その他' ? '' : 'none';
}
function cmToggle(id) { const det = document.getElementById('det_' + id); if (det) det.style.display = cmV('p_' + id) === '出席' ? '' : 'none'; cmMealToggle(id); }
async function cmTranslate(id, retried) {
  if (!/^(j_note|n_[A-Za-z0-9-]+)$/.test(id)) return;
  const src = document.getElementById(id), box = document.getElementById('tr_out_' + id), btn = document.getElementById('tr_btn_' + id);
  if (!src || !box) return;
  const prep = ChamuLib.translateRequest(src.value);
  if (prep.error) { box.innerHTML = `<div class="ng">${cmEsc(prep.error)}</div>`; return; }
  const sent = prep.body.text;
  if (btn) { btn.disabled = true; btn.textContent = '翻訳しています…'; }
  box.innerHTML = '<div class="note">翻訳しています…</div>';
  try {
    let s = {}; try { s = JSON.parse(localStorage.getItem('sess') || '{}'); } catch (e) { s = {}; }
    if (s.exp && s.exp < Date.now() + 30000 && !retried && typeof refreshSess === 'function') {
      if (await refreshSess()) { try { s = JSON.parse(localStorage.getItem('sess') || '{}'); } catch (e) { s = {}; } }
    }
    let r;
    try {
      r = await fetch(C.supabaseUrl + '/functions/v1/chamu-translate', {
        method: 'POST',
        headers: { apikey: C.supabaseKey, Authorization: 'Bearer ' + (s.token || ''), 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: sent }),
      });
    } catch (e) { throw new Error('翻訳に接続できませんでした'); }
    if (r.status === 401 && !retried && typeof refreshSess === 'function' && await refreshSess()) return await cmTranslate(id, true);
    const body = await r.json().catch(() => ({}));
    const shown = ChamuLib.translateResult(r.status, body);
    if (shown.error) { box.innerHTML = `<div class="ng">${cmEsc(shown.error)}</div>`; return; }
    const stale = src.value.trim() !== sent ? '<p class="note">入力が変わっています。必要ならもう一度押してください。</p>' : '';
    box.innerHTML = `<p class="cap">日本語（確認用。保存されるのは上の原文です）</p><div class="ja">${cmEsc(shown.translated)}</div>${stale}`;
  } catch (e) {
    box.innerHTML = `<div class="ng">${cmEsc(e.message || '翻訳に接続できませんでした')}</div>`;
  } finally {
    if (btn && document.body.contains(btn)) { btn.disabled = false; btn.textContent = '日本語にする'; }
  }
}
function cmBulk() {
  const d = CM.st.defaults || ChamuLib.DEFAULTS;
  (CM.st.users || []).forEach(u => {
    const p = document.getElementById('p_' + u.id), s = document.getElementById('s_' + u.id), e = document.getElementById('e_' + u.id), t = document.getElementById('t_' + u.id), m = document.getElementById('m_' + u.id);
    if (p) p.value = '出席'; if (s && !s.value) s.value = d.default_start; if (e && !e.value) e.value = d.default_end; if (t) t.value = '往復'; if (m) m.value = 'あり'; cmToggle(u.id);
  });
}
function cmReadJournal(date) {
  return {
    journal_date: date, staff_name: cmV('j_staff'), weather: cmV('j_weather'), menu: cmV('j_menu'), note: cmV('j_note'),
    rice_portion: cmV('j_rice'), egg_count: cmV('j_egg'), tofu_g: cmV('j_tofu'), meat_note: cmV('j_meat'), fish_g: cmV('j_fish'), dairy_note: cmV('j_dairy'),
    users: (CM.st.users || []).map(u => ({
      user_id: u.id, name: u.name, present: cmV('p_' + u.id) === '' ? null : cmV('p_' + u.id) === '出席', start_time: cmV('s_' + u.id), end_time: cmV('e_' + u.id),
      transport: cmV('t_' + u.id), meal: cmV('m_' + u.id), intake: cmV('i_' + u.id), intake_note: cmV('in_' + u.id), support_note: cmV('n_' + u.id),
    })),
  };
}
async function cmSaveJournal() {
  if (CM.saving) return;
  CM.saving = true;
  cmSaveBtn(true);
  try {
    await cmGo(async () => {
      const date = CM.st.date || cmToday(), defaults = CM.st.defaults || ChamuLib.DEFAULTS, form = cmReadJournal(date);
      const errs = ChamuLib.validateJournal(form, defaults);
      if (errs.length) throw new Error(errs.join('\n'));
      const prepared = form.users.map(u => ({ user_id: u.user_id, name: u.name, ...ChamuLib.prepareLine(u, defaults) }));
      const head = ChamuLib.prepareHead(form);
      const dayRows = await cmRest('chamu_journal?on_conflict=journal_date', {
        method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({
          journal_date: date, staff_name: form.staff_name.trim(), weather: form.weather || null, menu: head.menu, note: form.note.trim() || null,
          rice_portion: head.rice_portion, egg_count: head.egg_count, tofu_g: head.tofu_g, meat_note: head.meat_note, fish_g: head.fish_g, dairy_note: head.dairy_note,
          updated_at: new Date().toISOString(),
        }),
      });
      const day = dayRows && dayRows[0];
      if (!day || !day.id) throw new Error('日誌を保存できませんでした。もう一度押してください。');
      if (prepared.length) await cmRest('chamu_journal_line?on_conflict=journal_id,user_id', {
        method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(prepared.map(u => ({
        journal_id: day.id, user_id: u.user_id, present: u.present, start_time: u.start_time, end_time: u.end_time,
        transport: u.transport, meal: u.meal, intake: u.intake, intake_note: u.intake_note, support_note: u.present ? (u.support_note || '') : null,
        }))),
      });
      const notes = prepared.filter(u => u.filled).map(u => `${u.name}: 時刻空欄→${u.start_time}-${u.end_time}補完`).concat(await cmApplySync(date, prepared, defaults));
      await cmJournal();
      const saved = ChamuLib.journalSavedNotice(notes);
      cmMsg('保存しました。' + (notes.length ? '\n' + notes.join('\n') : '\n実績記録票に転記しました。'), true);
      cmNotice(saved.title, saved.body, true);
    }, { notice: '保存できませんでした' });
  } finally {
    CM.saving = false;
    cmSaveBtn(false);
  }
}
async function cmApplySync(date, prepared, defaults) {
  const recs = await cmRest(`chamu_service_records?service_date=eq.${date}&select=*`) || [];
  const plan = ChamuLib.syncPlan(prepared, recs, defaults);
  if (plan.upsert.length) await cmRest('chamu_service_records?on_conflict=user_id,service_date', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(plan.upsert.map(r => ({ ...r, service_date: date, updated_at: new Date().toISOString() }))),
  });
  for (const id of plan.del) await cmRest('chamu_service_records?id=eq.' + id, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  return plan.notes.filter(n => n.indexOf('時刻空欄') < 0);
}

async function cmKondate() {
  const month = CM.st.kmonth || cmToday().slice(0, 7);
  const last = ChamuLib.lastDay(month);
  let users = [], days = [], err = '';
  try {
    [users, days] = await Promise.all([
      cmRest('chamu_users?select=id,sort,active&order=sort.asc,id.asc'),
      cmRest(`chamu_journal?journal_date=gte.${month}-01&journal_date=lte.${month}-${last}&select=journal_date,menu,rice_portion,egg_count,tofu_g,meat_note,fish_g,dairy_note,chamu_journal_line(user_id,present,meal,intake,intake_note)&order=journal_date.asc`),
    ]);
  } catch (e) { err = String((e && e.message) || e); }
  users = users || []; days = days || [];
  const report = ChamuLib.menuReport(month, days, users);
  CM.st.kmonth = month;
  CM.st.report = report;
  const mail = ChamuLib.menuMail(report);
  const drafts = report.rows.length ? `<div class="card"><h4>中東真紀さんへのメール（まだ送っていません）</h4>
    <p>宛先: ${cmEsc(mail.toName)}（${cmEsc(mail.to)}）<br>件名: ${cmEsc(mail.subject)}</p>
    <pre class="cm-mail">${cmEsc(mail.body)}</pre>
    ${mail.shortened ? '<p class="note">本文が長いため、開く下書きは案内文だけです。CSVを添付してください。画面の表と、上の全文が中身です。</p>' : '<p class="note">下書きの本文に表を入れています。CSVも添付できます。</p>'}
    <p><button type="button" class="sec inl" onclick="cmKondateCsv()">CSVをダウンロード</button>
      <button type="button" class="sec inl" onclick="cmCopyMail()">本文をコピー</button></p>
    <p><a class="btn" href="${cmEsc(mail.gmail)}" target="_blank" rel="noopener">Gmailで下書きを開く</a>
      <a class="btn" href="${cmEsc(mail.mailto)}">メールアプリで下書きを開く</a></p>
    <p class="note">送信は、開いたメールの画面で内容を確認してから行ってください。ここから直接は送りません。</p></div>` : '<div class="card"><p>この月の日誌はまだありません。下書きは作りません。</p></div>';
  cmFrame('kondate', `<h3>栄養士向け献立報告</h3>
    <p class="note">ポータルの日誌が正です。Googleの表には書きません。氏名は出さず、記号だけです。記号は利用者の並び順（Aから）で、並びを変えると記号も変わります。記録のない停止中の人は列に出しません。</p>
    <p class="note">日誌の「食事＝あり」は、保存すると実績記録票へ転記されます。国保連の食事提供体制加算は、署名済みで、利用者の加算対象の日だけです。摂食量と分量は請求に入れません。</p>
    <div class="row noprint">${cmInp('k_m', '月', month, 'month')}<div style="align-self:end"><button type="button" class="sec inl" onclick="CM.st.kmonth=cmV('k_m');renderChamu('kondate')">表示</button></div></div>
    ${err ? `<div class="ng">${cmEsc(err)}<br>supabase/chamu.sql を適用してください。</div>` : ''}
    <div class="card"><p><b>${cmEsc(month)}</b>　${report.rows.length}日　提供数の合計 ${report.total}</p>
      ${ChamuLib.menuReportHtml(report)}</div>
    ${drafts}`);
}
function cmKondateCsv() {
  const mail = ChamuLib.menuMail(CM.st.report || { ym: CM.st.kmonth || '', columns: [], rows: [], total: 0 });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([mail.csv], { type: 'text/csv;charset=utf-8' }));
  a.download = mail.filename;
  document.body.appendChild(a); a.click(); a.remove();
}
function cmCopyMail() {
  const text = ChamuLib.menuMail(CM.st.report || {}).body || '';
  const done = ok => cmMsg(ok ? '本文をコピーしました。下書きに貼れます。' : '本文を選択してコピーしてください。', !!ok);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => done(true)).catch(() => done(false));
    return;
  }
  done(false);
}

async function cmRecords() {
  if (CM.st.rec) return cmRecordOne(CM.st.rec);
  const month = CM.st.month || cmToday().slice(0, 7);
  const users = await cmUsers(true);
  const uid = CM.st.user || (users.find(u => u.active) || users[0] || {}).id || '';
  const last = ChamuLib.lastDay(month);
  const recs = uid ? await cmRest(`chamu_service_records?user_id=eq.${uid}&service_date=gte.${month}-01&service_date=lte.${month}-${last}&select=*&order=service_date`) || [] : [];
  const un = recs.filter(r => !r.signed_at).length, name = (users.find(u => u.id === uid) || {}).name || '';
  cmFrame('records', `<h3>サービス提供実績記録票</h3><p class="note">日誌から自動で転記されます（職員の入力は不要）。利用者に署名をもらうと、国保連CSVの対象になります。未署名はCSVに入りません。</p>
    <div class="row noprint"><div><label class="l">利用者</label>${cmSel('r_u', users.map(u => [u.id, u.name + (u.active ? '' : '（停止）')]), uid)}</div>
      ${cmInp('r_m', '月', month, 'month')}<div style="align-self:end"><button class="sec inl" onclick="CM.st.user=cmV('r_u');CM.st.month=cmV('r_m');renderChamu('records')">表示</button></div></div>
    <div class="card"><p><b>${cmEsc(name)}</b>　${cmEsc(month)}　${recs.length}日　未署名 ${un}日</p>
      <table><tr><th>日付</th><th>時間</th><th>送迎</th><th>食事</th><th>支援</th><th>署名</th><th class="noprint"></th></tr>
      ${recs.map(r => `<tr><td>${r.service_date}</td><td>${cmEsc((r.start_time || '').slice(0, 5))}–${cmEsc((r.end_time || '').slice(0, 5))}</td><td>${cmEsc(r.transport)}</td><td>${cmEsc(r.meal)}</td><td>${cmEsc((r.support_note || '').slice(0, 24))}</td><td>${r.signed_at ? '✔ 署名済' : '未署名'}</td><td class="noprint"><button class="inl sec" onclick="CM.st.rec='${r.id}';renderChamu('records')">記録票・署名</button></td></tr>`).join('')}
      </table>${recs.length ? '' : '<p>この月の記録票はまだありません（業務日誌を入力してください）。</p>'}
      ${recs.filter(r => r.signature_data && String(r.signature_data).indexOf('data:image/png;base64,') === 0).map(r => `<p><b>${r.service_date}</b><br><img class="cm-sg" src="${r.signature_data}" alt="署名"></p>`).join('')}
      <p class="noprint"><button class="sec inl" onclick="cmResync('${month}')">この月を日誌から転記し直す</button> <button class="sec inl" onclick="window.print()">印刷／PDFにする</button></p></div>`);
}
async function cmResync(month) {
  await cmGo(async () => {
    const [users, settings] = await Promise.all([cmUsers(false), cmSettingsRow()]);
    const defaults = ChamuLib.settingsOf(settings), last = ChamuLib.lastDay(month);
    const days = await cmRest(`chamu_journal?journal_date=gte.${month}-01&journal_date=lte.${month}-${last}&select=journal_date,chamu_journal_line(*)`) || [];
    let notes = [];
    for (const j of days) {
      const prepared = users.map(u => {
        const line = (j.chamu_journal_line || []).find(x => x.user_id === u.id) || { present: false };
        return { user_id: u.id, name: u.name, ...ChamuLib.prepareLine({ ...line, name: u.name }, defaults) };
      });
      notes = notes.concat(await cmApplySync(j.journal_date, prepared, defaults));
    }
    await cmRecords();
    cmMsg(`${days.length}日分を転記し直しました。` + (notes.length ? '\n' + notes.join('\n') : ''), true);
  });
}
async function cmRecordOne(id) {
  const rows = await cmRest(`chamu_service_records?id=eq.${id}&select=*`) || [];
  const r = rows[0]; if (!r) { CM.st.rec = null; return cmRecords(); }
  const users = await cmUsers(true), name = (users.find(u => u.id === r.user_id) || {}).name || '';
  const img = r.signature_data && String(r.signature_data).indexOf('data:image/png;base64,') === 0 ? `<img class="cm-sg" src="${r.signature_data}" alt="署名"><br><small>${cmEsc(r.signed_at)}</small>` : '未署名';
  cmFrame('records', `<button class="back noprint" onclick="CM.st.rec=null;renderChamu('records')">← 一覧</button><h3>サービス提供実績記録票</h3>
    <div class="card"><table><tr><th>利用者</th><td>${cmEsc(name)}</td></tr><tr><th>提供日</th><td>${r.service_date}</td></tr>
      <tr><th>時間</th><td>${cmEsc((r.start_time || '').slice(0, 5))} – ${cmEsc((r.end_time || '').slice(0, 5))}</td></tr>
      <tr><th>送迎</th><td>${cmEsc(r.transport)}</td></tr><tr><th>食事</th><td>${cmEsc(r.meal)}</td></tr>
      <tr><th>支援内容・ご様子</th><td>${cmEsc(r.support_note)}</td></tr><tr><th>利用者署名</th><td>${img}</td></tr></table></div>
    <div class="card noprint"><p><b>${r.signed_at ? '署名を取り直す' : '利用者に署名してもらう（端末を利用者に渡してください）'}</b></p>
      <div class="pad"><canvas id="cm_cv"></canvas></div><p><button class="sec inl" type="button" onclick="if(CM.pad)CM.pad.clear()">書き直す</button></p>
      <button onclick="cmSign('${id}')">署名を保存</button></div>
    <p class="noprint"><button class="sec inl" onclick="window.print()">印刷／PDFにする</button></p>`);
  setTimeout(() => { const cv = document.getElementById('cm_cv'); if (cv && typeof createSignPad === 'function') CM.pad = createSignPad(cv); }, 30);
}
async function cmSign(id) {
  await cmGo(async () => {
    if (!CM.pad || !CM.pad.isDrawn()) throw new Error('署名してください');
    const sig = CM.pad.toDataURL();
    if (!sig || sig.indexOf('data:image/png;base64,') !== 0) throw new Error('署名を読み取れませんでした');
    if (sig.length > 300000) throw new Error('署名が大きすぎます。書き直してください');
    await cmRest('chamu_service_records?id=eq.' + id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ signature_data: sig, signed_at: await cmNow() }) });
    await cmRecords();
    cmMsg('署名を保存しました。国保連CSVの対象になります。', true);
  });
}

async function cmBilling() {
  await Promise.all([cmScript('vendor/encoding.min.js'), cmScript('rydeen-billing-lib.js')]);
  const month = CM.st.bmonth || cmToday().slice(0, 7), [y, m] = month.split('-').map(Number), last = ChamuLib.lastDay(month);
  const [settingsRow, users, recs] = await Promise.all([
    cmSettingsRow(), cmUsers(true),
    cmRest(`chamu_service_records?service_date=gte.${month}-01&service_date=lte.${month}-${last}&select=*&order=service_date`) || [],
  ]);
  const input = ChamuLib.buildBillingInput(y, m, { settings: settingsRow, users, records: recs });
  let files = null, err = '';
  if (input.agg.length && !input.blocking.length && window.RydBilling) {
    try { files = RydBilling.buildBillingFiles(y, m, { office: input.office, users: input.users, agg: input.agg }); }
    catch (e) { err = e.message || String(e); }
  }
  CM.files = files;
  const s = input.settings, blocked = input.blocking.length > 0 || !!err || !files || (files && files.issues.length > 0);
  const setForm = CM.bill ? `<div class="card"><h4>事業所の請求設定</h4><p class="note">初期値は日誌シートの事業所マスタ（事業所番号 2410202663、種類22、地域06、単価10.37、処遇改善Ⅱロ 9.6%・項目5175、定員11-20、11:00–14:00、医師未配置減算あり）です。</p>
    <div class="row">${cmInp('bs_office_no', '事業所番号', s.office_no)}${cmInp('bs_office_name', '事業所名', s.office_name)}
      ${cmInp('bs_region_code', '地域区分コード', s.region_code)}${cmInp('bs_unit_price', '地域区分単価', s.unit_price)}
      ${cmInp('bs_shogu_rate', '処遇改善加算率', s.shogu_rate)}${cmInp('bs_shogu_item', '処遇改善のサービスコード項目', s.shogu_item)}
      <div><label class="l">標準提供時間帯</label>${cmSel('bs_band', ChamuLib.BANDS, s.standard_band)}</div>
      ${cmInp('bs_start', '既定開始', s.default_start, 'time')}${cmInp('bs_end', '既定終了', s.default_end, 'time')}</div>
    <p>サービス種類は 22（生活介護）、定員規模は 11-20 です。コード表はこの組み合わせだけを持っています。</p>
    <label><input type="checkbox" id="bs_ishi" ${s.ishi_gen ? 'checked' : ''}> 医師未配置減算あり</label>
    <button onclick="cmSaveSettings()">設定を保存</button></div>` : '';
  cmFrame('billing', `<h3>国保連CSV（生活介護）</h3>
    <div class="card"><div class="row">${cmInp('b_m', 'サービス提供月', month, 'month')}<div style="align-self:end"><button class="sec inl" onclick="CM.st.bmonth=cmV('b_m');renderChamu('billing')">切替</button></div></div>
    <p>対象: ${cmEsc(month)} の<b>署名済み</b>の実績記録票 ${input.signedCount} 件（未署名 ${input.unsignedCount} 件は除外）。ダウンロードするだけで、国保連へは送りません。</p>
    ${files ? `<p>利用者 ${files.summary.users}名 / 総単位数 ${files.summary.totalUnits} / 費用額 ${files.summary.totalCost}円 / 給付費 ${files.summary.totalBenefit}円 / 利用者負担 ${files.summary.totalBurden}円 / 処理対象年月 ${files.summary.billingYm}${files.summary.ishiGen ? ' / 医師未配置減算' : ''}</p>` : ''}
    ${input.preview.map(p => `<p>${cmEsc(p.name)}　署名済 ${p.signed}日${p.unsigned ? `　未署名 ${p.unsigned}日（CSV対象外）` : ''}</p>`).join('')}
    ${input.blocking.map(b => `<div class="ng">${cmEsc(b)}</div>`).join('')}${err ? `<div class="ng">${cmEsc(err)}</div>` : ''}
    ${(files ? files.issues : []).map(b => `<div class="ng">${cmEsc(b)}</div>`).join('')}
    ${files && !files.issues.length ? '<div class="okb">形式チェックの指摘はありません。</div>' : ''}
    ${input.warnings.map(b => `<div class="wn">${cmEsc(b)}</div>`).join('')}
    ${input.agg.length ? '' : '<p>この月に署名済みの記録がありません。</p>'}
    <p>${blocked ? '' : `<button class="inl" onclick="cmDownload('j111')">請求書・明細書（${cmEsc(files.j111.name)}）</button> <button class="inl" onclick="cmDownload('j611')">実績記録票（${cmEsc(files.j611.name)}）</button>`}</p>
    <p class="note">時間帯×障害支援区分で基本報酬（定員11-20・医師未配置のときは医減コード）、食事は対象者の提供日だけ、送迎は往復=2回・片道=1回、処遇改善は所定単位×加算率です。</p></div>${setForm}`);
}
function cmDownload(which) {
  const f = CM.files && CM.files[which]; if (!f) return;
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([f.bytes], { type: 'text/csv' })); a.download = f.name; document.body.appendChild(a); a.click(); a.remove();
}
async function cmSaveSettings() {
  await cmGo(async () => {
    const office = cmV('bs_office_no').trim();
    if (!/^\d{10}$/.test(office)) throw new Error('事業所番号は半角数字10桁にしてください');
    const row = {
      office_no: office, office_name: cmV('bs_office_name').trim() || '茶夢', service_type: '22', region_code: cmV('bs_region_code').trim() || '06',
      unit_price: cmV('bs_unit_price').trim() || '10.37', shogu_rate: cmV('bs_shogu_rate').trim() || '0.096', shogu_item: cmV('bs_shogu_item').trim() || '5175',
      capacity_scale: '11-20', standard_band: cmV('bs_band') || ChamuLib.DEFAULTS.standard_band, default_start: ChamuLib.time(cmV('bs_start')) || '11:00',
      default_end: ChamuLib.time(cmV('bs_end')) || '14:00', ishi_gen: cmC('bs_ishi'), updated_at: new Date().toISOString(),
    };
    const saved = await cmRest('chamu_billing_settings?id=eq.1', { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row) });
    if (!saved || !saved.length) throw new Error('請求設定がありません。supabase/chamu.sql を適用してください');
    await cmBilling();
    cmMsg('設定を保存しました。', true);
  });
}

async function cmUsersPage() {
  if (CM.st.edit) return cmUserForm(CM.st.edit);
  const users = await cmUsers(true);
  cmFrame('users', `<h3>利用者</h3><p class="note">日誌と請求に使う項目です。受給者証・障害支援区分・決定サービスコード（221000）・食事提供・送迎加算を入れてください。いまシートにいる3人は、管理者が supabase/chamu_seed.sql を実行するか、ここから登録します。</p>
    <p><button class="inl" onclick="CM.st.edit='new';renderChamu('users')">利用者を追加</button></p>
    <div class="card"><table><tr><th>氏名</th><th>区分</th><th>食事</th><th>送迎</th><th></th></tr>
      ${users.map(u => `<tr><td>${cmEsc(u.name)}${u.active ? '' : '（停止）'}</td><td>${u.support_level ?? ''}</td><td>${u.meal_addon ? '対象' : '非対象'}</td><td>${cmEsc(u.transport_class)}</td><td><button class="inl sec" onclick="CM.st.edit='${u.id}';renderChamu('users')">編集</button></td></tr>`).join('')}
    </table>${users.length ? '' : '<p>まだ登録がありません。</p>'}</div>`);
}
async function cmUserForm(id) {
  const row = id === 'new' ? { name: '', kana: '', sort: 0, active: true, recipient_no: '', city_no: '', support_level: '', cap_management: '無', cap_amount: 0, cap_office_no: '', decision_code: '221000', contract_days: '原則', contract_start: '', contract_end: '', service_start: '', provider_entry_no: '1', meal_addon: true, transport_class: '2' }
    : ((await cmRest('chamu_users?id=eq.' + id + '&select=*')) || [])[0];
  if (!row) { CM.st.edit = null; return cmUsersPage(); }
  const d = v => v ? String(v).slice(0, 10) : '';
  cmFrame('users', `<button class="back" onclick="CM.st.edit=null;renderChamu('users')">← 一覧</button><h3>${id === 'new' ? '利用者を追加' : cmEsc(row.name)}</h3>
    <div class="card"><div class="row">${cmInp('u_name', '氏名', row.name)}${cmInp('u_kana', '氏名カナ', row.kana)}${cmInp('u_sort', '並び', row.sort, 'number')}</div>
      <label><input type="checkbox" id="u_active" ${row.active ? 'checked' : ''}> 利用中</label>
      <div class="row">${cmInp('u_rec', '受給者証番号', row.recipient_no)}${cmInp('u_city', '支給決定市町村番号', row.city_no)}
        <div><label class="l">障害支援区分</label>${cmSel('u_lv', [['', '未設定'], '1', '2', '3', '4', '5', '6'], row.support_level ?? '')}</div></div>
      <div class="row"><div><label class="l">上限管理</label>${cmSel('u_cap', ['無', '有'], row.cap_management || '無')}</div>${cmInp('u_capamt', '上限月額', row.cap_amount, 'number')}${cmInp('u_capoff', '上限額管理事業所番号', row.cap_office_no)}</div>
      <div class="row">${cmInp('u_dec', '決定サービスコード', row.decision_code || '221000')}${cmInp('u_qty', '契約支給量（日）', row.contract_days || '原則')}${cmInp('u_ent', '事業者記入欄番号', row.provider_entry_no || '1')}</div>
      <div class="row">${cmInp('u_cs', '契約開始', d(row.contract_start), 'date')}${cmInp('u_ce', '契約終了', d(row.contract_end), 'date')}${cmInp('u_ss', 'サービス開始', d(row.service_start), 'date')}</div>
      <label><input type="checkbox" id="u_meal" ${row.meal_addon !== false ? 'checked' : ''}> 食事提供体制加算の対象</label>
      <div><label class="l">送迎加算</label>${cmSel('u_tr', [['I', '送迎加算Ⅰ'], ['2', '送迎加算Ⅱ'], ['重度', '送迎加算（重度）'], ['なし', 'なし']], row.transport_class || '2')}</div>
      <button onclick="cmSaveUser('${id}')">保存</button>
      ${id === 'new' ? '' : `<button class="sec" onclick="cmDeleteUser('${id}')">削除</button>`}</div>`);
}
function cmNull(s) { s = String(s || '').trim(); return s ? s : null; }
async function cmSaveUser(id) {
  await cmGo(async () => {
    const name = cmV('u_name').trim();
    if (!name) throw new Error('氏名を入れてください');
    const body = {
      name, kana: cmNull(cmV('u_kana')), sort: Number(cmV('u_sort')) || 0, active: cmC('u_active'),
      recipient_no: cmNull(cmV('u_rec')), city_no: cmNull(cmV('u_city')), support_level: cmV('u_lv') === '' ? null : Number(cmV('u_lv')),
      cap_management: cmV('u_cap') || '無', cap_amount: Number(cmV('u_capamt')) || 0, cap_office_no: cmNull(cmV('u_capoff')),
      decision_code: cmV('u_dec').trim() || '221000', contract_days: cmV('u_qty').trim() || '原則', provider_entry_no: cmV('u_ent').trim() || '1',
      contract_start: cmNull(cmV('u_cs')), contract_end: cmNull(cmV('u_ce')), service_start: cmNull(cmV('u_ss')),
      meal_addon: cmC('u_meal'), transport_class: cmV('u_tr') || '2', updated_at: new Date().toISOString(),
    };
    if (id === 'new') await cmRest('chamu_users', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body) });
    else await cmRest('chamu_users?id=eq.' + id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body) });
    CM.st.edit = null; await cmUsersPage(); cmMsg('保存しました。', true);
  });
}
async function cmDeleteUser(id) {
  if (!confirm('この利用者を削除しますか？日誌や実績があると削除できません。そのときは「利用中」を外してください。')) return;
  await cmGo(async () => {
    await cmRest('chamu_users?id=eq.' + id, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    CM.st.edit = null; await cmUsersPage();
  });
}
