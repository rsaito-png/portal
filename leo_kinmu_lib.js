// 三重県「勤務実績及び利用者の実績表」。画面（leo_kinmu.js）と node のテストが共用。
// 職員の週パターンは監査用の配置。打刻（実態）とは別。
// 中村文は月〜金 14:00–17:00（週15時間）。枠は固定月8万÷時給1,150≒週約16.2時間（月約69.6時間）。1,600円換算は使わない。
var KinmuLib = (function () {
  var JOBS = ['管理', '指導', '保育', '児管', '機訓', '送迎', '事務'];
  var CLASSES = [['A', '常勤専従'], ['B', '常勤兼務'], ['C', '非常勤専従'], ['D', '非常勤兼務']];
  var SERVICES = {
    jido: { id: 'jido', label: '児童発達支援', office: 'レオ' },
    houday: { id: 'houday', label: '放課後等デイサービス', office: 'レオ' },
    seikatsu: { id: 'seikatsu', label: '生活介護', office: '茶夢' },
  };
  // 8万 ÷ 1,150 時間。分は四捨五入。
  var FUMI_MONTH_MIN = Math.round(80000 / 1150 * 60);
  var FUMI_WEEK_LABEL = '週15時間（枠は週約16.2時間・月約69.6時間）';

  function todayYm(now) {
    var d = now || new Date();
    return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' }).slice(0, 7);
  }
  function reiwa(ym) {
    var p = String(ym || '').split('-').map(Number);
    var y = p[0], m = p[1];
    if (!y || !m || y < 2019) return '';
    return '令和' + (y - 2018) + '年' + m + '月分の勤務実績及び利用者の実績表';
  }
  function daysIn(ym) {
    var p = String(ym).split('-').map(Number);
    return new Date(Date.UTC(p[0], p[1], 0)).getUTCDate();
  }
  function daysOf(ym) {
    var p = String(ym).split('-').map(Number);
    var n = daysIn(ym), out = [], d, wd;
    for (d = 1; d <= n; d++) {
      wd = new Date(Date.UTC(p[0], p[1] - 1, d)).getUTCDay();
      out.push({ day: d, wd: wd, dow: '日月火水木金土'[wd] });
    }
    return out;
  }
  function norm(s) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
    if (!m) return '';
    var h = +m[1], mi = +m[2];
    if (h > 23 || mi > 59) return '';
    return String(h).padStart(2, '0') + ':' + String(mi).padStart(2, '0');
  }
  function hmToMin(s) {
    var t = norm(s);
    if (!t) return null;
    var p = t.split(':').map(Number);
    return p[0] * 60 + p[1];
  }
  function minToHm(n) {
    if (!n) return '';
    return Math.floor(n / 60) + ':' + String(n % 60).padStart(2, '0');
  }
  function spanHours(start, end) {
    var a = hmToMin(start), b = hmToMin(end);
    if (a == null || b == null || b <= a) return '';
    return minToHm(b - a);
  }
  function hoursNorm(s) {
    var m = /^(\d{1,3}):(\d{2})$/.exec(String(s || '').trim());
    if (!m) return '';
    var mi = +m[2];
    if (mi > 59) return '';
    return String(+m[1]) + ':' + String(mi).padStart(2, '0');
  }
  function fullWeek(start, end) {
    return { 1: [start, end], 2: [start, end], 3: [start, end], 4: [start, end], 5: [start, end] };
  }
  // 確定配置（2026-11-02）。常勤は月〜金。水も齊藤＋友香。
  // 非常勤: 月火木 安藤11–14、金 安藤11–14:30、水 加藤11–14、文は月〜金14–17。
  function seedRoster() {
    var full = fullWeek('10:00', '18:00');
    return [
      { name: '齊藤連', job: '管理', cls: 'B', qual: '', note: '児発管と終日兼務。休憩1時間を含む', sort: 10, week: full },
      { name: '安藤尚子', job: '指導', cls: 'C', qual: '', note: '月火木11:00–14:00、金11:00–14:30', sort: 20, week: { 1: ['11:00', '14:00'], 2: ['11:00', '14:00'], 4: ['11:00', '14:00'], 5: ['11:00', '14:30'] } },
      { name: '中村文', job: '指導', cls: 'C', qual: '', note: '月〜金14:00–17:00（週15時間）', sort: 21, week: fullWeek('14:00', '17:00') },
      { name: '加藤幸弘', job: '指導', cls: 'C', qual: '', note: '水曜11:00–14:00', sort: 22, week: { 3: ['11:00', '14:00'] } },
      { name: '中村友香', job: '保育', cls: 'A', qual: '保育士', note: '常勤専従。休憩1時間を含む', sort: 30, week: full },
      { name: '齊藤連', job: '児管', cls: 'B', qual: '', note: '管理者と終日兼務。休憩1時間を含む', sort: 40, week: full },
    ];
  }
  function blankCells(ym) {
    var cells = {};
    daysOf(ym).forEach(function (d) { cells[d.day] = { start: '', end: '', hours: '' }; });
    return cells;
  }
  function monthLines(ym) {
    return seedRoster().map(function (line) {
      var cells = {};
      daysOf(ym).forEach(function (d) {
        var sp = line.week[d.wd];
        if (!sp) cells[d.day] = { start: '', end: '', hours: '' };
        else cells[d.day] = { start: sp[0], end: sp[1], hours: spanHours(sp[0], sp[1]) };
      });
      return { id: '', name: line.name, job: line.job, cls: line.cls, qual: line.qual, note: line.note, sort: line.sort, week: line.week, cells: cells };
    });
  }
  function patternWeekMinutes(line) {
    var t = 0, wd, sp;
    for (wd = 0; wd < 7; wd++) {
      sp = line.week && line.week[wd];
      if (!sp) continue;
      t += hmToMin(sp[1]) - hmToMin(sp[0]);
    }
    return t;
  }
  function lineMinutes(line) {
    var t = 0;
    Object.keys(line.cells || {}).forEach(function (d) {
      var m = hmToMin(line.cells[d] && line.cells[d].hours);
      if (m) t += m;
    });
    return t;
  }
  function validate(lines, ym) {
    var days = daysOf(ym);
    if (!lines.length) return '職員が1人もいません。';
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var name = String(line.name || '').trim();
      if (!name) return '氏名が空の行があります。';
      if (name.length > 40) return '氏名は40字までです。';
      if (JOBS.indexOf(line.job) < 0) return name + 'の職種略称が様式と違います。';
      if (['A', 'B', 'C', 'D'].indexOf(line.cls) < 0) return name + 'の区分はA〜Dです。';
      if (String(line.qual || '').length > 40) return name + 'の資格は40字までです。';
      if (String(line.note || '').length > 80) return name + 'の備考は80字までです。';
      for (var j = 0; j < days.length; j++) {
        var c = (line.cells || {})[days[j].day] || { start: '', end: '', hours: '' };
        if (!c.start !== !c.end) return name + 'の' + days[j].day + '日は開始と終了をそろえてください。';
        if (c.start && hmToMin(c.end) <= hmToMin(c.start)) return name + 'の' + days[j].day + '日は終了を開始より後にしてください。';
      }
    }
    return '';
  }
  function tallyNikki(rows, service) {
    var want = service === 'jido' ? '児発' : service === 'houday' ? '放デイ' : '';
    var sets = {};
    (rows || []).forEach(function (r) {
      if (r.kind && r.kind !== '利用') return;
      if (String(r.service || '').trim() !== want) return;
      var day = Number(String(r.day || '').slice(-2));
      var child = String(r.child || '').replace(/\s/g, '');
      if (!day || !child) return;
      (sets[day] = sets[day] || {});
      sets[day][child] = 1;
    });
    var out = {};
    Object.keys(sets).forEach(function (d) { out[d] = Object.keys(sets[d]).length; });
    return out;
  }
  function tallyRecords(rows) {
    var sets = {};
    (rows || []).forEach(function (r) {
      var day = Number(String(r.service_date || '').slice(-2));
      if (!day || !r.user_id) return;
      (sets[day] = sets[day] || {});
      sets[day][r.user_id] = 1;
    });
    var out = {};
    Object.keys(sets).forEach(function (d) { out[d] = Object.keys(sets[d]).length; });
    return out;
  }
  function csvCell(v) {
    var s = String(v == null ? '' : v);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  function sheetModel(ym, service, lines, users) {
    var svc = SERVICES[service] || SERVICES.jido;
    return { title: reiwa(ym), serviceLabel: svc.label, officeName: svc.office, ym: ym, service: service, days: daysOf(ym), lines: lines || [], users: users || {} };
  }
  function csvOf(model) {
    var head = ['氏名', '職種', '雇用形態及び勤務形態区分', '資格'].concat(model.days.map(function (d) { return String(d.day); }), ['備考']);
    var dow = ['', '', '', ''].concat(model.days.map(function (d) { return d.dow; }), ['']);
    var rows = [
      [model.title],
      ['事業所', model.officeName, 'サービス', model.serviceLabel, '月', model.ym],
      ['上段＝開始時刻、中段＝終了時刻、下段＝勤務時間（休憩を含んでよい）'],
      head, dow,
    ];
    model.lines.forEach(function (line) {
      var cls = line.cls + ({ A: '常勤専従', B: '常勤兼務', C: '非常勤専従', D: '非常勤兼務' }[line.cls] || '');
      ['start', 'end', 'hours'].forEach(function (f, idx) {
        var row = idx === 0
          ? [line.name, line.job, cls, line.qual || '']
          : ['', '', '', ''];
        model.days.forEach(function (d) {
          var c = (line.cells || {})[d.day] || {};
          row.push(c[f] || '');
        });
        row.push(idx === 0 ? (line.note || '') : '');
        rows.push(row);
      });
    });
    var users = ['利用者数', '', '', ''];
    model.days.forEach(function (d) {
      var n = model.users[d.day];
      users.push(n == null || n === '' ? '' : String(n));
    });
    users.push('');
    rows.push(users);
    return '\uFEFF' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n');
  }
  function sheetHtml(model) {
    var th = model.days.map(function (d) { return '<th>' + d.day + '</th>'; }).join('');
    var dow = model.days.map(function (d) { return '<th>' + d.dow + '</th>'; }).join('');
    var body = model.lines.map(function (line) {
      var cls = line.cls;
      return ['start', 'end', 'hours'].map(function (f, idx) {
        var cells = model.days.map(function (d) {
          var c = (line.cells || {})[d.day] || {};
          return '<td>' + (c[f] || '') + '</td>';
        }).join('');
        if (idx === 0) return '<tr><td rowspan="3">' + line.name + '</td><td rowspan="3">' + line.job + '</td><td rowspan="3">' + cls + '</td><td rowspan="3">' + (line.qual || '') + '</td>' + cells + '<td rowspan="3">' + (line.note || '') + '</td></tr>';
        return '<tr>' + cells + '</tr>';
      }).join('');
    }).join('');
    var users = model.days.map(function (d) {
      var n = model.users[d.day];
      return '<td>' + (n == null || n === '' ? '' : n) + '</td>';
    }).join('');
    return '<html><head><meta charset="utf-8"></head><body><h1>' + model.title + '</h1><p>' + model.officeName + '　' + model.serviceLabel + '</p><table border="1"><tr><th rowspan="2">氏名</th><th rowspan="2">職種</th><th rowspan="2">区分</th><th rowspan="2">資格</th>' + th + '<th rowspan="2">備考</th></tr><tr>' + dow + '</tr>' + body + '<tr><td colspan="4">利用者数</td>' + users + '<td></td></tr></table></body></html>';
  }

  return {
    JOBS: JOBS, CLASSES: CLASSES, SERVICES: SERVICES,
    FUMI_MONTH_MIN: FUMI_MONTH_MIN, FUMI_WEEK_LABEL: FUMI_WEEK_LABEL,
    todayYm: todayYm, reiwa: reiwa, daysIn: daysIn, daysOf: daysOf,
    norm: norm, hoursNorm: hoursNorm, hmToMin: hmToMin, minToHm: minToHm, spanHours: spanHours,
    seedRoster: seedRoster, blankCells: blankCells, monthLines: monthLines,
    patternWeekMinutes: patternWeekMinutes, lineMinutes: lineMinutes, validate: validate,
    tallyNikki: tallyNikki, tallyRecords: tallyRecords, sheetModel: sheetModel,
    csvOf: csvOf, sheetHtml: sheetHtml,
  };
})();
