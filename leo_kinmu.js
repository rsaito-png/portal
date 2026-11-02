// 三重県の勤務実績及び利用者の実績表（#leo/kinmu と #chamu/kinmu）。
// 配置の行は月ごとに共通。利用者数だけサービスで分かれる。
(function () {
  if (typeof document === 'undefined') return;
  if (document.getElementById('km-style')) return;
  var st = document.createElement('style');
  st.id = 'km-style';
  st.textContent = [
    '.km{font-size:16px;color:#111}',
    '.km h3{font-size:26px;margin:8px 0;color:#143528}',
    '.km .note{font-size:15px!important;color:#222;line-height:1.45}',
    '.km details summary{cursor:pointer;font-weight:800;color:#143528;margin:4px 0 8px}',
    '.km .km-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:8px 0}',
    '.km button.km-b{width:auto;font-size:16px!important;padding:8px 12px!important;margin:0!important}',
    '.km input.mo{width:auto;font-size:16px!important;padding:6px 8px!important;margin:0!important}',
    '.km .sheet-scroll{overflow:auto;max-width:100%;max-height:72vh;-webkit-overflow-scrolling:touch;background:#fff;border:2px solid #111}',
    '.km table.grid{display:table!important;border-collapse:separate;border-spacing:0;width:max-content;min-width:100%;background:#fff;color:#111;box-shadow:none;border:0;font-size:16px}',
    '.km table.grid tr{display:table-row}',
    '.km table.grid th,.km table.grid td{display:table-cell;box-sizing:border-box;border:0;border-right:1px solid #222;border-bottom:1px solid #222;padding:6px 4px;text-align:center;vertical-align:middle;background:#fff;color:#111;white-space:nowrap}',
    '.km table.grid thead th{position:sticky;top:0;z-index:2;height:44px;background:#143528;color:#fff;font-weight:800;font-size:16px;border-color:#0c241c}',
    '.km table.grid thead tr:nth-child(2) th{top:44px;height:34px;font-size:15px}',
    '.km table.grid th.nm,.km table.grid td.nm{position:sticky;left:0;z-index:3;min-width:9.4rem;width:9.4rem;max-width:9.4rem;text-align:left;background:#fff;box-shadow:4px 0 0 #143528;font-weight:800;white-space:normal;overflow:hidden}',
    '.km table.grid thead th.nm,.km table.grid thead th.band{z-index:5;background:#143528;color:#fff;box-shadow:4px 0 0 #0c241c}',
    '.km table.grid th.band,.km table.grid td.band{min-width:4.2rem;background:#fff;font-weight:800;font-size:15px;color:#143528}',
    '.km table.grid input,.km table.grid select{font-size:17px!important;line-height:1.3;padding:8px 6px!important;margin:0!important;width:5.4rem;min-height:42px;box-sizing:border-box;border:1px solid #444!important;box-shadow:none!important;border-radius:4px!important;background:#fff!important;color:#111!important;text-align:center;font-weight:700}',
    '.km table.grid select{width:7.4rem;text-align:left;padding-left:4px!important}',
    '.km table.grid td.nm input.wide{display:block;width:100%!important;max-width:100%;text-align:left;font-weight:800}',
    '.km table.grid input.uc{width:3.6rem}',
    '.km table.grid button.km-b{font-size:14px!important;padding:6px 8px!important;min-height:0;margin-top:6px!important}',
    '.km tr.r-end td{background:#eef3f0}',
    '.km tr.r-hrs td{background:#d7f0e1}',
    '.km tr.r-end td.band{background:#eef3f0}',
    '.km tr.r-hrs td.band{background:#d7f0e1}',
    '.km tr.r-hrs input{background:#f4fff8!important}',
    '.km td.we{background:#f6f0e4}',
    '.km tr.r-hrs td.we{background:#e7f3df}',
    '.km thead th.we{background:#3e3424;color:#fff}',
    '.km tr.users td{background:#fff3c4;font-weight:800}',
    '.km tr.users td.nm,.km tr.users td.band{background:#fff3c4}',
    '.km .warn{color:#8a1f00;font-weight:800}',
    '.km .ok{color:#0d3b24;font-weight:700}',
    'body.wide-sheet:has(#km-root) main{max-width:none}',
    '@media (max-width:700px){',
    '.km table.grid,.km table.grid th,.km table.grid td{font-size:15px}',
    '.km table.grid input,.km table.grid select{font-size:16px!important;min-height:40px;padding:7px 4px!important}',
    '.km .sheet-scroll{max-height:68vh}',
    '}',
    '@media print{',
    '@page{size:A3 landscape;margin:8mm}',
    'header,.back,.noprint,#help,#out,#hi,.cm-nav{display:none!important}',
    'body{background:#fff;color:#000}',
    'main{max-width:none!important;padding:0}',
    '.km,.km .note,.km h3{color:#000!important}',
    '.km .sheet-scroll{max-height:none;overflow:visible;border:0}',
    '.km table.grid th,.km table.grid td{position:static!important;background:#fff!important;color:#000!important;border:1.5px solid #000!important;box-shadow:none!important;font-size:11pt!important}',
    '.km table.grid input,.km table.grid select{font-size:12pt!important;color:#000!important;background:#fff!important;border:0!important;box-shadow:none!important;padding:1px 0!important;min-height:0;font-weight:700}',
    '}'
  ].join('');
  document.head.appendChild(st);
})();

var KM = {
  ym: '', service: 'jido', entry: 'leo', lines: [],
  users: { jido: {}, houday: {}, seikatsu: {} },
  loadedKey: '', loadedIds: [], persisted: false, dirty: false,
  canWrite: false, canRead: true, months: [], msg: '', blocked: false, demo: {},
};

function kmEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}
function kmErr(e) {
  var m = String((e && e.message) || e || '');
  if (/\(403\)|\(401\)/.test(m)) return 'この操作の権限がありません。事務、またはレオ・茶夢の管理者・児発管が保存できます。';
  if (/\(404\)|kinmu_/.test(m)) return '勤務実績の表がまだありません。supabase/kinmu.sql を適用してください。';
  return m || '保存できませんでした。';
}
function kmMark() { KM.dirty = true; }
function kmSyncHours(i, day) {
  var s = document.getElementById('km-s-' + i + '-' + day);
  var e = document.getElementById('km-e-' + i + '-' + day);
  var h = document.getElementById('km-h-' + i + '-' + day);
  if (!s || !e || !h) return;
  h.value = KinmuLib.spanHours(s.value, e.value);
  KM.dirty = true;
}
function kmCapture() {
  if (!document.getElementById('km-root') || !KM.lines) return;
  var days = KinmuLib.daysOf(KM.ym);
  KM.lines.forEach(function (line, i) {
    var name = document.getElementById('km-name-' + i);
    if (!name) return;
    line.name = name.value.trim();
    line.job = document.getElementById('km-job-' + i).value;
    line.cls = document.getElementById('km-cls-' + i).value;
    line.qual = document.getElementById('km-qual-' + i).value.trim();
    line.note = document.getElementById('km-note-' + i).value.trim();
    days.forEach(function (d) {
      var start = KinmuLib.norm(document.getElementById('km-s-' + i + '-' + d.day).value);
      var end = KinmuLib.norm(document.getElementById('km-e-' + i + '-' + d.day).value);
      var hours = KinmuLib.hoursNorm(document.getElementById('km-h-' + i + '-' + d.day).value);
      if (!hours && start && end) hours = KinmuLib.spanHours(start, end);
      line.cells[d.day] = { start: start, end: end, hours: hours };
    });
  });
  var users = {};
  days.forEach(function (d) {
    var el = document.getElementById('km-u-' + d.day);
    if (!el) return;
    var v = el.value.trim();
    if (v === '') return;
    var n = Number(v);
    if (Number.isInteger(n) && n >= 0 && n <= 200) users[d.day] = n;
  });
  KM.users[KM.service] = users;
}
async function kmLoad(ym) {
  KM.blocked = false;
  if (typeof DEMO !== 'undefined' && DEMO) {
    KM.canRead = true;
    KM.canWrite = true;
    var store = KM.demo[ym];
    if (store) {
      KM.lines = JSON.parse(JSON.stringify(store.lines));
      KM.users = JSON.parse(JSON.stringify(store.users));
      KM.persisted = true;
    } else {
      KM.lines = KinmuLib.monthLines(ym);
      KM.users = { jido: {}, houday: {}, seikatsu: {} };
      KM.persisted = false;
    }
    KM.loadedIds = KM.lines.map(function (l) { return l.id; }).filter(Boolean);
    KM.months = Object.keys(KM.demo).sort().reverse();
    return;
  }
  var canRead = await sb('rpc/kinmu_can_read', { method: 'POST', body: '{}' });
  KM.canRead = canRead === true;
  KM.canWrite = (await sb('rpc/kinmu_can_write', { method: 'POST', body: '{}' })) === true;
  if (!KM.canRead) {
    KM.blocked = true;
    KM.lines = [];
    KM.persisted = false;
    return;
  }
  var rows = await sb('kinmu_lines?ym=eq.' + ym + '&select=id,name,job_abbr,form_class,qualification,note,sort&order=sort.asc,name.asc') || [];
  var userRows = await sb('kinmu_users?ym=eq.' + ym + '&select=service,day,user_count') || [];
  var monthRows = await sb('kinmu_lines?select=ym&order=ym.desc&limit=400') || [];
  KM.months = [];
  monthRows.forEach(function (r) { if (KM.months.indexOf(r.ym) < 0) KM.months.push(r.ym); });
  KM.users = { jido: {}, houday: {}, seikatsu: {} };
  userRows.forEach(function (r) {
    if (!KM.users[r.service]) return;
    KM.users[r.service][r.day] = r.user_count;
  });
  if (!rows.length) {
    KM.lines = KinmuLib.monthLines(ym);
    KM.persisted = false;
    KM.loadedIds = [];
    return;
  }
  var ids = rows.map(function (r) { return r.id; }).join(',');
  var cells = await sb('kinmu_cells?line_id=in.(' + ids + ')&select=line_id,day,start_time,end_time,hours') || [];
  var by = {};
  cells.forEach(function (c) {
    (by[c.line_id] = by[c.line_id] || {})[c.day] = { start: c.start_time || '', end: c.end_time || '', hours: c.hours || '' };
  });
  var blank = KinmuLib.blankCells(ym);
  KM.lines = rows.map(function (r) {
    var cell = Object.assign({}, blank, by[r.id] || {});
    return { id: r.id, name: r.name, job: r.job_abbr, cls: r.form_class, qual: r.qualification || '', note: r.note || '', sort: r.sort, cells: cell };
  });
  KM.persisted = true;
  KM.loadedIds = rows.map(function (r) { return r.id; });
}
async function kmPrepare(entry) {
  KM.entry = entry;
  var allowed = entry === 'chamu' ? ['seikatsu'] : ['jido', 'houday'];
  if (allowed.indexOf(KM.service) < 0) KM.service = allowed[0];
  var ym = KM.ym || KinmuLib.todayYm();
  KM.ym = ym;
  if (KM.loadedKey !== ym) {
    await kmLoad(ym);
    KM.loadedKey = ym;
    KM.dirty = false;
  }
}
function kmHtml() {
  if (KM.blocked) return '<h3>勤務実績及び利用者の実績表</h3><p>レオ・茶夢の職員と、事務・会長が見られます。</p>';
  var K = KinmuLib;
  var days = K.daysOf(KM.ym);
  var svc = K.SERVICES[KM.service];
  var dis = KM.canWrite ? '' : ' disabled';
  var tabs = KM.entry === 'chamu'
    ? '<p><b>生活介護（茶夢）</b></p>'
    : '<p class="ptabs noprint">' + [['jido', '児童発達支援'], ['houday', '放課後等デイサービス']].map(function (x) {
      return '<button type="button" class="' + (x[0] === KM.service ? 'on' : '') + '" onclick="kmSetService(\'' + x[0] + '\')">' + x[1] + '</button>';
    }).join('') + '</p>';
  var we = function (d) { return d.wd === 0 || d.wd === 6 ? ' class="we"' : ''; };
  var headDays = days.map(function (d) { return '<th' + we(d) + '>' + d.day + '</th>'; }).join('');
  var headDow = days.map(function (d) { return '<th' + we(d) + '>' + d.dow + '</th>'; }).join('');
  var body = KM.lines.map(function (line, i) {
    var mins = K.lineMinutes(line);
    var warn = line.name === '中村文' && mins > K.FUMI_MONTH_MIN ? ' <span class="warn">枠超え</span>' : '';
    var meta = '<div class="note">計' + (K.minToHm(mins) || '0:00') + warn + '</div>';
    var opts = function (list, cur, pair) {
      return list.map(function (item) {
        var v = pair ? item[0] : item, label = pair ? item[0] + ' ' + item[1] : item;
        return '<option value="' + kmEsc(v) + '"' + (v === cur ? ' selected' : '') + '>' + kmEsc(label) + '</option>';
      }).join('');
    };
  var bands = { start: '開始', end: '終了', hours: '時間' };
    return ['start', 'end', 'hours'].map(function (f, idx) {
      var cls = f === 'end' ? 'r-end' : f === 'hours' ? 'r-hrs' : 'r-start';
      var tds = days.map(function (d) {
        var c = (line.cells || {})[d.day] || {};
        var id = (f === 'start' ? 'km-s-' : f === 'end' ? 'km-e-' : 'km-h-') + i + '-' + d.day;
        var extra = f === 'hours' ? ' oninput="kmMark()"' : ' oninput="kmSyncHours(' + i + ',' + d.day + ')"';
        return '<td' + we(d) + '><input id="' + id + '" value="' + kmEsc(c[f] || '') + '"' + dis + extra + '></td>';
      }).join('');
      var band = '<td class="band">' + bands[f] + '</td>';
      if (idx === 0) {
        return '<tr class="' + cls + '"><td class="nm" rowspan="3">' + meta + '<input id="km-name-' + i + '" class="wide" value="' + kmEsc(line.name) + '"' + dis + ' oninput="kmMark()"></td>'
          + '<td rowspan="3"><select id="km-job-' + i + '"' + dis + ' onchange="kmMark()">' + opts(K.JOBS, line.job, false) + '</select></td>'
          + '<td rowspan="3"><select id="km-cls-' + i + '"' + dis + ' onchange="kmMark()">' + opts(K.CLASSES, line.cls, true) + '</select></td>'
          + '<td rowspan="3"><input id="km-qual-' + i + '" class="wide" value="' + kmEsc(line.qual || '') + '"' + dis + ' oninput="kmMark()"></td>'
          + band + tds
          + '<td rowspan="3"><input id="km-note-' + i + '" class="wide" value="' + kmEsc(line.note || '') + '"' + dis + ' oninput="kmMark()">'
          + (KM.canWrite ? '<div><button type="button" class="km-b" onclick="kmRemove(' + i + ')">外す</button></div>' : '')
          + '</td></tr>';
      }
      return '<tr class="' + cls + '">' + band + tds + '</tr>';
    }).join('');
  }).join('');
  var users = days.map(function (d) {
    var n = KM.users[KM.service] && KM.users[KM.service][d.day];
    return '<td><input id="km-u-' + d.day + '" class="uc" inputmode="numeric" value="' + kmEsc(n == null ? '' : n) + '"' + dis + ' oninput="kmMark()"></td>';
  }).join('');
  var fumi = KM.lines.filter(function (l) { return l.name === '中村文'; }).map(function (l) {
    return '中村文 ' + K.minToHm(K.lineMinutes(l)) + '（' + K.FUMI_WEEK_LABEL + '）';
  }).join('　');
  var saved = KM.months.length ? '<p class="note noprint">保存済みの月：' + KM.months.map(function (ym) {
    return '<button type="button" class="km-b" onclick="kmSetMonth(\'' + ym + '\')">' + ym + '</button>';
  }).join(' ') + '</p>' : '';
  var state = KM.persisted ? '<span class="ok">この月は保存済みです。</span>' : '<span class="warn">この月はまだ保存されていません。週パターンを表示しています。</span>';
  return '<div id="km-root"><h3>' + kmEsc(K.reiwa(KM.ym)) + '</h3>'
    + '<p class="note">' + kmEsc(svc.office) + '　' + kmEsc(svc.label) + '。上段が開始、中段が終了、下段が時間。横に動かすと氏名は残ります。' + (KM.entry === 'chamu' ? ' <a href="#chamu/haichi">曜日の配置表</a>。' : '') + ' <a href="#dakoku">出退勤打刻</a>は別です。</p>'
    + '<details class="noprint"><summary>配置の内容</summary><p class="note">職員の配置はこの月の共通の記録です（レオと茶夢で同じ）。利用者数はサービスごとです。常勤 10:00–18:00（月〜金、齊藤・友香。水も両方）。非常勤は月火木金 安藤11:00–14:00、水 加藤11:00–14:00、文は月〜金14:00–17:00。安藤と文は14:00で引き継ぎ、重なりません。非常勤の職種略称の初期値は「指導」です。勤務時間は休憩を含んでよい。</p></details>'
    + tabs
    + '<div class="km-bar noprint"><button type="button" class="km-b" onclick="kmShiftMonth(-1)">← 前の月</button>'
    + '<input class="mo" id="km-ym" type="month" value="' + kmEsc(KM.ym) + '" onchange="kmSetMonth(this.value)">'
    + '<button type="button" class="km-b" onclick="kmShiftMonth(1)">次の月 →</button>'
    + (KM.canWrite ? '<button type="button" class="km-b" onclick="kmSave()">この月を保存</button>' : '')
    + '<button type="button" class="km-b" onclick="window.print()">印刷</button>'
    + '<button type="button" class="km-b" onclick="kmCsv()">CSV</button>'
    + '<button type="button" class="km-b" onclick="kmXls()">Excel</button>'
    + (KM.canWrite ? '<button type="button" class="km-b" onclick="kmApplyPattern()">週パターンで置き換え</button><button type="button" class="km-b" onclick="kmAddLine()">行を足す</button><button type="button" class="km-b" onclick="kmFillUsers()">日誌から利用者数</button>' : '')
    + '<button type="button" class="km-b" onclick="kmReload()">読み直す</button></div>'
    + '<p class="noprint">' + state + (KM.msg ? ' ' + kmEsc(KM.msg) : '') + '</p>'
    + (fumi ? '<p class="note">' + fumi + '</p>' : '')
    + '<div class="sheet-scroll"><table class="grid"><thead><tr><th class="nm" rowspan="2">氏名</th><th rowspan="2">職種</th><th rowspan="2">区分</th><th rowspan="2">資格</th><th class="band" rowspan="2">段</th>' + headDays + '<th rowspan="2">備考</th></tr><tr>' + headDow + '</tr></thead><tbody>'
    + body
    + '<tr class="users"><td class="nm">利用者数</td><td></td><td></td><td></td><td class="band">人数</td>' + users + '<td></td></tr></tbody></table></div>'
    + saved + '</div>';
}
async function kmBuild(entry) {
  try {
    await kmPrepare(entry);
    return kmHtml();
  } catch (e) {
    return '<h3>勤務実績及び利用者の実績表</h3><p>' + kmEsc(kmErr(e)) + '</p>';
  }
}
async function kmOpen(entry) {
  document.body.classList.add('wide-sheet');
  var html = '<div class="km">' + await kmBuild(entry) + '</div>';
  if (entry === 'chamu' && typeof cmShow === 'function') {
    cmShow((typeof cmBack === 'function' ? cmBack() : '') + (typeof cmNav === 'function' ? cmNav('kinmu') : '') + html);
  }
  return html;
}
function kmRefresh() {
  if (KM.entry === 'chamu' && typeof renderChamu === 'function') return renderChamu('kinmu');
  if (typeof renderLeoView === 'function') return renderLeoView('kinmu');
}
async function kmSetMonth(ym) {
  if (!/^\d{4}-\d{2}$/.test(ym || '')) return;
  if (ym === KM.ym) return;
  if (KM.dirty && !confirm('保存していない編集を捨てて、別の月を開きます。')) {
    var el = document.getElementById('km-ym');
    if (el) el.value = KM.ym;
    return;
  }
  KM.ym = ym;
  KM.dirty = false;
  KM.loadedKey = '';
  await kmRefresh();
}
function kmShiftMonth(n) {
  var p = KM.ym.split('-').map(Number);
  var d = new Date(Date.UTC(p[0], p[1] - 1 + n, 1));
  return kmSetMonth(d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0'));
}
function kmSetService(s) {
  kmCapture();
  KM.service = s;
  return kmRefresh();
}
function kmReload() {
  if (KM.dirty && !confirm('保存していない編集を捨てて読み直します。')) return;
  KM.loadedKey = '';
  KM.dirty = false;
  return kmRefresh();
}
function kmApplyPattern() {
  if (!confirm('この月の職員配置を、決めた週パターンで置き換えます。利用者数はそのままです。')) return;
  kmCapture();
  var users = KM.users;
  KM.lines = KinmuLib.monthLines(KM.ym);
  KM.users = users;
  KM.dirty = true;
  KM.msg = '週パターンを入れました。保存するとこの月の記録になります。';
  return kmRefresh();
}
function kmAddLine() {
  kmCapture();
  var sort = KM.lines.reduce(function (m, l) { return Math.max(m, l.sort || 0); }, 0) + 1;
  KM.lines.push({ id: '', name: '', job: '指導', cls: 'C', qual: '', note: '', sort: sort, cells: KinmuLib.blankCells(KM.ym) });
  KM.dirty = true;
  return kmRefresh();
}
function kmRemove(i) {
  kmCapture();
  KM.lines.splice(i, 1);
  KM.dirty = true;
  return kmRefresh();
}
async function kmFillUsers() {
  kmCapture();
  var ym = KM.ym, last = ym + '-' + String(KinmuLib.daysIn(ym)).padStart(2, '0');
  try {
    if (typeof DEMO !== 'undefined' && DEMO) { KM.msg = '見本モードでは日誌を読みません。人数は手入力です。'; return kmRefresh(); }
    if (KM.service === 'seikatsu') {
      var rec = await sb('chamu_service_records?service_date=gte.' + ym + '-01&service_date=lte.' + last + '&select=service_date,user_id') || [];
      KM.users.seikatsu = KinmuLib.tallyRecords(rec);
    } else {
      var nikki = await sb('leo_nikki?day=gte.' + ym + '-01&day=lte.' + last + '&kind=eq.利用&select=day,child,service,kind') || [];
      KM.users[KM.service] = KinmuLib.tallyNikki(nikki, KM.service);
    }
    KM.dirty = true;
    KM.msg = '利用者数を入れました。保存するまで記録には残りません。';
  } catch (e) { KM.msg = kmErr(e); }
  return kmRefresh();
}
function kmDownload(name, mime, text) {
  var blob = new Blob([text], { type: mime });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
function kmFileStem() {
  var svc = KinmuLib.SERVICES[KM.service];
  return '勤務実績_' + svc.office + '_' + svc.label + '_' + KM.ym;
}
function kmCsv() {
  kmCapture();
  var model = KinmuLib.sheetModel(KM.ym, KM.service, KM.lines, KM.users[KM.service] || {});
  kmDownload(kmFileStem() + '.csv', 'text/csv;charset=utf-8', KinmuLib.csvOf(model));
}
function kmXls() {
  kmCapture();
  var model = KinmuLib.sheetModel(KM.ym, KM.service, KM.lines, KM.users[KM.service] || {});
  kmDownload(kmFileStem() + '.xls', 'application/vnd.ms-excel;charset=utf-8', KinmuLib.sheetHtml(model));
}
async function kmSave() {
  kmCapture();
  var err = KinmuLib.validate(KM.lines, KM.ym);
  if (err) { KM.msg = err; return kmRefresh(); }
  if (typeof DEMO !== 'undefined' && DEMO) {
    KM.lines.forEach(function (l, i) { if (!l.id) l.id = 'demo-' + KM.ym + '-' + i + '-' + l.sort; });
    KM.demo[KM.ym] = { lines: JSON.parse(JSON.stringify(KM.lines)), users: JSON.parse(JSON.stringify(KM.users)) };
    KM.persisted = true;
    KM.dirty = false;
    KM.loadedIds = KM.lines.map(function (l) { return l.id; });
    KM.msg = '見本に覚えました（サーバには保存していません）。';
    return kmRefresh();
  }
  try {
    var fresh = [];
    for (var i = 0; i < KM.lines.length; i++) {
      var line = KM.lines[i];
      var body = { name: line.name, job_abbr: line.job, form_class: line.cls, qualification: line.qual || '', note: line.note || '', sort: line.sort || 0 };
      if (line.id) {
        await sb('kinmu_lines?id=eq.' + line.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body) });
      } else fresh.push(line);
    }
    if (fresh.length) {
      var inserted = await sb('kinmu_lines', {
        method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify(fresh.map(function (line) {
          return { ym: KM.ym, name: line.name, job_abbr: line.job, form_class: line.cls, qualification: line.qual || '', note: line.note || '', sort: line.sort || 0 };
        })),
      }) || [];
      if (!Array.isArray(inserted)) inserted = [inserted];
      fresh.forEach(function (line) {
        var hit = inserted.find(function (row) { return row.sort === line.sort && row.name === line.name && row.job_abbr === line.job; });
        if (hit) line.id = hit.id;
      });
    }
    var keep = KM.lines.map(function (l) { return l.id; });
    var remove = KM.loadedIds.filter(function (id) { return keep.indexOf(id) < 0; });
    if (remove.length) await sb('kinmu_lines?id=in.(' + remove.join(',') + ')', { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    var cells = [];
    KinmuLib.daysOf(KM.ym).forEach(function (d) {
      KM.lines.forEach(function (line) {
        var c = line.cells[d.day] || { start: '', end: '', hours: '' };
        cells.push({ line_id: line.id, day: d.day, start_time: c.start || '', end_time: c.end || '', hours: c.hours || '' });
      });
    });
    if (cells.length) await sb('kinmu_cells?on_conflict=line_id,day', {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(cells),
    });
    var services = ['jido', 'houday', 'seikatsu'];
    for (var s = 0; s < services.length; s++) {
      var key = services[s];
      var urows = Object.keys(KM.users[key] || {}).map(function (day) {
        return { service: key, ym: KM.ym, day: Number(day), user_count: KM.users[key][day] };
      }).filter(function (r) { return Number.isInteger(r.user_count); });
      if (urows.length) await sb('kinmu_users?on_conflict=service,ym,day', {
        method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(urows),
      });
      var keepDays = urows.map(function (r) { return r.day; }).join(',');
      var del = 'kinmu_users?service=eq.' + key + '&ym=eq.' + KM.ym + (keepDays ? '&day=not.in.(' + keepDays + ')' : '');
      await sb(del, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    }
    KM.msg = '保存しました。';
    KM.dirty = false;
    KM.loadedKey = '';
  } catch (e) {
    KM.msg = kmErr(e);
  }
  return kmRefresh();
}
if (typeof LEO_VIEWS !== 'undefined') {
  LEO_VIEWS.kinmu = async function () {
    document.body.classList.add('wide-sheet');
    return '<div class="km">' + await kmBuild('leo') + '</div>';
  };
}
