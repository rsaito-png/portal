// レオのホームに出す月間カレンダーと、日を開いたときの時刻軸。
// データは「児童の利用・送迎予定」と同じ leo_events（Googleカレンダーへは取りに行かない）。
// 予定画面（leo_cal.js）の日・週・月の見た目はここでは変えない。
//
// 担当の色は Google カレンダーの予定色（colorId 1〜11）。colorId に無い色は #RRGGBB で書く。
// 日誌・予定の担当は leo_events.staff（日誌の名前。例「山田　太郎」）。空白と「先生」「さん」は無視して照合する。
// 色を見るのは担当欄だけ。児童名（加藤 湊など）では職員色にしない。
// 一覧に無い担当は Tomato（11）。利用（児童の出席そのもの）は山吹色。
const GCAL_EVENT_COLORS = {
  1: ['Lavender', '#7986cb'],
  2: ['Sage', '#33b679'],
  3: ['Grape', '#8e24aa'],
  4: ['Flamingo', '#e67c73'],
  5: ['Banana', '#f6bf26'],
  6: ['Tangerine', '#f4511e'],
  7: ['Peacock', '#039be5'],
  8: ['Graphite', '#616161'],
  9: ['Blueberry', '#3f51b5'],
  10: ['Basil', '#0b8043'],
  11: ['Tomato', '#d50000'],
};
const SG_USE_HEX = '#f8b500';
const SG_OTHER_HEX = '#d50000';
// ゆか＝友香、さち＝祥、なお＝尚、あや＝文。表示は文先生。
// 中村だけでは当てない（児童の中村 亮仁と重なる）。担当欄に名の「文」があるときだけ。
// 宮本さん・加藤先生の下の名前は、公開リポジトリにも日誌の対応表にも無い。姓で始まる担当名に当てる。
const SG_NAVY = '#1a237e';
const SG_STAFF_COLOR = {
  '連先生': SG_NAVY,     // 紺。藤色・水色と分ける（Blueberry #3f51b5 は藤色に近い）
  '友香先生': 2,         // 黄緑 Sage
  'あや先生': 3,         // 紫 Grape
  '祥先生': 4,           // 薄ピンク Flamingo
  '尚先生': 1,           // 藤色 Lavender
  '宮本さん': '#d81b60', // ピンク Cherry blossom（colorId には無い）
  '加藤先生': '#4fc3f7', // 水色。Peacock より明るい青
};
// 凡例と予定に出す名前。ここにある人だけ、日誌の表記をこの表示にそろえる。
const SG_STAFF_SHOW = { '連先生': '連先生', '友香先生': '友香先生', 'あや先生': '文先生', '祥先生': '祥先生', '尚先生': '尚先生' };
// exact は完全一致。family は姓＋名。given は名だけ、または漢字の姓＋その名。
const SG_STAFF_ALIAS = {
  '連先生': [
    { t: 'given', s: 'れん' }, { t: 'given', s: '連' },
    { t: 'family', s: '齊藤' }, { t: 'family', s: '斎藤' }, { t: 'family', s: '斉藤' }, { t: 'family', s: '齋藤' },
    { t: 'exact', s: '齊藤連' }, { t: 'exact', s: '斎藤連' }, { t: 'exact', s: '斉藤連' }, { t: 'exact', s: '齋藤連' },
  ],
  '友香先生': [{ t: 'given', s: 'ゆか' }, { t: 'given', s: '友香' }],
  'あや先生': [{ t: 'given', s: 'あや' }, { t: 'given', s: '文' }],
  '祥先生': [{ t: 'given', s: 'さち' }, { t: 'given', s: '祥' }],
  '尚先生': [{ t: 'given', s: 'なお' }, { t: 'given', s: '尚' }],
  '宮本さん': [{ t: 'family', s: '宮本' }],
  '加藤先生': [{ t: 'family', s: '加藤' }],
};
// 担当欄が児童そのもののとき（加藤 湊）は加藤先生にしない。
const SG_STAFF_NOT = new Set(['加藤湊', '加藤みなと', '加藤ミナト']);
// 見本モードの架空の担当。施設の色ではない。
const SG_STAFF_COLOR_DEMO = { '職員X': 7, '職員Y': 6, '職員Z': 10 };
let SG_HOME_MONTH = '';

const sgEsc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sgAdd = (d, n) => { const [y, m, day] = String(d).split('-').map(Number); return new Date(Date.UTC(y, m - 1, day + n)).toISOString().slice(0, 10); };
const sgW = d => { const [y, m, day] = String(d).split('-').map(Number); return (new Date(Date.UTC(y, m - 1, day)).getUTCDay() + 6) % 7; };
const sgDow = d => '月火水木金土日'[sgW(d)];
const sgYm = d => String(d).slice(0, 7);
const sgSame = (a, b) => !!(a && b && String(a).replace(/\s/g, '') === String(b).replace(/\s/g, ''));
const sgNk = s => String(s || '').replace(/[\s　]/g, '');
function sgName(s) {
  if (typeof canonChildName === 'function') return canonChildName(s);
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}
function sgMin(t) {
  const m = String(t || '').trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}
function sgHH(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}
function sgNowMin() {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
    return +parts.find(p => p.type === 'hour').value * 60 + +parts.find(p => p.type === 'minute').value;
  } catch (e) { return null; }
}
function sgInk(hex) {
  const n = parseInt(String(hex).slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (r * 299 + g * 587 + b * 114) / 1000 > 160 ? '#222' : '#fff';
}
function sgNormStaff(s) {
  return String(s || '').normalize('NFKC').replace(/[\s\u3000・･]/g, '').replace(/(先生|さん|くん|ちゃん|氏)+$/u, '');
}
function sgHexName(hex) {
  if (hex === '#d81b60') return 'Cherry blossom';
  if (hex === '#4fc3f7') return 'Light blue';
  return hex;
}
function sgColorOf(value) {
  if (typeof value === 'string' && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim())) {
    let hex = value.trim().toLowerCase();
    if (hex.length === 4) hex = '#' + hex.slice(1).split('').map(c => c + c).join('');
    return { id: null, hex, name: sgHexName(hex) };
  }
  const id = Number(value);
  if (GCAL_EVENT_COLORS[id]) return { id, hex: GCAL_EVENT_COLORS[id][1], name: GCAL_EVENT_COLORS[id][0] };
  return null;
}
function sgPaintFrom(value, mapped) {
  const c = sgColorOf(value) || { id: 11, hex: SG_OTHER_HEX, name: 'Tomato' };
  return { id: c.id, hex: c.hex, ink: sgInk(c.hex), mapped: !!mapped && !!sgColorOf(value), name: c.name };
}
function sgStaffLabel(name, opt) {
  const n = sgNormStaff(name);
  if (!n || SG_STAFF_NOT.has(n)) return '';
  const labels = Object.keys(SG_STAFF_COLOR);
  for (const label of labels) {
    const aliases = [{ t: 'exact', s: sgNormStaff(label) }].concat(SG_STAFF_ALIAS[label] || []);
    if (aliases.some(a => sgNormStaff(a.s) === n)) return label;
  }
  for (const label of labels) {
    for (const a of SG_STAFF_ALIAS[label] || []) {
      const key = sgNormStaff(a.s);
      if (!key || n.length <= key.length) continue;
      if (a.t === 'family' && key.length >= 2 && n.startsWith(key)) return label;
      if (a.t === 'given' && n.endsWith(key) && /^[\u4e00-\u9fff]{1,4}$/.test(n.slice(0, n.length - key.length))) return label;
    }
  }
  const demo = !!(opt && opt.demo) || (typeof DEMO !== 'undefined' && DEMO);
  if (demo) {
    const hit = Object.keys(SG_STAFF_COLOR_DEMO).find(k => sgSame(k, name));
    if (hit) return hit;
  }
  const extra = labels.find(k => sgSame(k, name)) || Object.keys(SG_STAFF_COLOR).find(k => sgNormStaff(k) === n);
  return extra || '';
}
function sgStaffPaint(name, opt) {
  const demo = !!(opt && opt.demo) || (typeof DEMO !== 'undefined' && DEMO);
  const label = sgStaffLabel(name, opt);
  if (!label) return sgPaintFrom(11, false);
  if (Object.prototype.hasOwnProperty.call(SG_STAFF_COLOR, label)) return sgPaintFrom(SG_STAFF_COLOR[label], true);
  if (demo && Object.prototype.hasOwnProperty.call(SG_STAFF_COLOR_DEMO, label)) return sgPaintFrom(SG_STAFF_COLOR_DEMO[label], true);
  return sgPaintFrom(11, false);
}
function sgStaffShow(name, opt) {
  const label = sgStaffLabel(name, opt);
  if (SG_STAFF_SHOW[label]) return SG_STAFF_SHOW[label];
  return String(name ?? '').replace(/[ \t\u3000]+/g, ' ').trim();
}
function sgUsePaint() {
  return { id: null, hex: SG_USE_HEX, ink: sgInk(SG_USE_HEX), mapped: true, name: 'Yamabuki', role: 'use' };
}
function sgEventPaint(e, opt) {
  if (e && e.kind === '利用') return sgUsePaint();
  if (!e || !e.staff) return null;
  return sgStaffPaint(e.staff, opt);
}
// 今日の送迎の「自分の担当」と同じく、ログイン職員は myName()。空白は無視する。
// 色の別名（中村文＝文＝あや＝あや先生）も同一人物。姓だけの「中村」は文先生にしない。
function sgStaffMine(staff, me, opt) {
  if (!staff || !me) return false;
  if (sgSame(staff, me) || sgNormStaff(staff) === sgNormStaff(me)) return true;
  const a = sgStaffLabel(staff, opt), b = sgStaffLabel(me, opt);
  return !!(a && b && a === b);
}
function sgMineEvents(es, me, opt) {
  if (!me) return { events: [], empty: true, unnamed: true };
  const rides = (es || []).filter(e => (e.kind === '迎え' || e.kind === '送り') && sgStaffMine(e.staff, me, opt));
  const events = (es || []).filter(e => {
    if (e.kind === '利用') return false;
    if (e.kind === '迎え' || e.kind === '送り') return sgStaffMine(e.staff, me, opt);
    if (e.kind === '休所') return true;
    if (e.kind === '勤務' || e.kind === '不在' || e.kind === 'その他') return sgStaffMine(e.staff, me, opt);
    return false;
  });
  return { events, empty: rides.length === 0, unnamed: false };
}
function sgGrid(ym) {
  const f = ym + '-01', w = sgW(f), nx = sgAdd(f, 32).slice(0, 8) + '01';
  return { start: sgAdd(f, -w), end: sgAdd(nx, (7 - sgW(nx)) % 7 - 1), ym };
}
function sgKid(obj, name) {
  if (!obj || typeof obj !== 'object' || !name) return '';
  if (obj[name] != null && obj[name] !== '') return obj[name];
  const key = Object.keys(obj).find(k => sgNk(k) === sgNk(name));
  return key && obj[key] != null ? obj[key] : '';
}
function sgLayout(items) {
  const ev = items.map((e, i) => ({ ...e, _i: i })).sort((a, b) => a.start - b.start || b.end - a.end || a._i - b._i);
  const colEnd = [];
  for (const e of ev) {
    let c = colEnd.findIndex(t => t <= e.start);
    if (c < 0) { c = colEnd.length; colEnd.push(e.end); }
    else colEnd[c] = e.end;
    e.col = c;
  }
  const clusters = [];
  let cur = null;
  for (const e of ev.slice().sort((a, b) => a.start - b.start || a._i - b._i)) {
    if (!cur || e.start >= cur.end) { cur = { end: e.end, items: [e] }; clusters.push(cur); }
    else { cur.end = Math.max(cur.end, e.end); cur.items.push(e); }
  }
  for (const cl of clusters) {
    const n = cl.items.reduce((m, e) => Math.max(m, e.col + 1), 1);
    for (const e of cl.items) {
      let span = 1;
      while (e.col + span < n && !cl.items.some(o => o !== e && o.col === e.col + span && o.start < e.end && e.start < o.end)) span++;
      e.span = span;
      e.cols = n;
    }
  }
  return ev;
}
function sgSplit(evs) {
  const allDay = [], timed = [];
  for (const e of evs || []) {
    const s = sgMin(e.start_time);
    if (e.kind === '休み' || e.kind === '休所' || e.kind === 'その他' || s == null) allDay.push(e);
    else {
      let en = sgMin(e.end_time);
      if (en == null || en <= s) en = s + 50;
      timed.push({ e, start: s, end: Math.max(en, s + 40) });
    }
  }
  return { allDay, timed: sgLayout(timed) };
}
function sgKind(e) {
  if (e.kind === '迎え') return '☆ 迎え';
  if (e.kind === '送り') return '★ 送り';
  return e.kind || '';
}
function sgLines(e) {
  if (e.kind === '迎え' || e.kind === '送り') {
    const kids = e.kids || [];
    if (!kids.length) return [sgName(e.title || e.place || '') || sgStaffShow(e.staff)];
    return kids.map(k => {
      const pl = sgKid(e.kid_places, k) || (!e.kid_places && e.place) || '';
      const tm = sgKid(e.kid_times, k);
      return `${sgName(k)}${tm ? ' ' + tm : ''}${pl ? '　' + pl : ''}`;
    });
  }
  if (e.kind === '利用' || e.kind === '休み') {
    const bits = [sgName(e.child)];
    if (e.title === '欠席（欠席時対応加算）' || e.title === 'キャンセル') bits.push(e.title);
    if (e.parent_drop) bits.push('保護者が送る');
    if (e.parent_pick) bits.push('保護者が迎える');
    return [bits.filter(Boolean).join('　')];
  }
  return [`${e.staff ? sgStaffShow(e.staff) : ''} ${e.title || e.note || ''}`.trim()];
}
function sgCss() {
  return `<style>
.sgm,.sg-page{font-size:13px;color:#1c140c}
.sgm button,.sg-page button{width:auto;margin:0;padding:0;background:transparent;color:#1c140c;border:0;border-radius:0;font-size:13px;line-height:1.2;box-shadow:none}
.sgm{background:#fff4dc;border:4px solid #1a120c;border-radius:0;padding:8px 8px 6px;box-shadow:5px 5px 0 #07060a;margin:0 0 12px}
.sgm-h{display:flex;align-items:center;justify-content:center;gap:4px;margin:0 0 2px}
.sgm-h b{font-size:15px;min-width:7.2em;text-align:center}
.sgm-h button{padding:4px 8px;font-size:16px;font-weight:700}
.sgm-h button.sg-today{font-size:12px;border:3px solid #1a120c;padding:3px 8px;background:#fff4dc;box-shadow:2px 2px 0 #1a120c}
.sgm table{width:100%;table-layout:fixed;border-collapse:separate;border-spacing:2px;background:transparent;font-size:11px;margin:0}
.sgm th,.sgm td{border:0;padding:0;text-align:center;background:transparent;font-size:11px;vertical-align:top}
.sgm th{color:#5c4e3e;font-weight:700;padding-bottom:1px}
.sgm td button{width:100%;height:32px;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;padding:1px 0}
.sgm td button b{font-size:13px;line-height:1.1}
.sgm td button .sub{font-size:9px;color:#2e6b4f;font-weight:700;line-height:1.1;max-width:100%;white-space:nowrap;overflow:hidden}
.sgm td button .sub.use{color:#222;background:#f8b500;border-radius:3px;padding:0 3px}
.sgm td button .sub.off{color:#b33}
.sgm td button.today{background:#fff4e4;box-shadow:inset 0 0 0 2px #e8833a}
.sgm td.dim button{opacity:.4}
.sgm-err{color:#c00;font-size:13px;margin:4px}
.sg-top{display:flex;align-items:center;flex-wrap:nowrap;gap:3px;margin:0 0 8px}
.sg-top b{flex:1 1 auto;min-width:0;text-align:center;font-size:15px;white-space:nowrap;overflow:hidden}
.sg-top button{flex:0 0 auto;width:auto;padding:5px 7px;font-size:14px;font-weight:700;border:3px solid #1a120c;background:#fff4dc;box-shadow:2px 2px 0 #1a120c;white-space:nowrap;line-height:1.2}
.sg-top button.sg-on{background:#e8833a;color:#fff;border-color:#e8833a}
.sg-mine-note{font-size:12px;color:#555;margin:0 0 8px;line-height:1.4}
.sg-empty{font-size:14px;background:#fff6e5;border:3px solid #1a120c;border-left:6px solid #e8833a;padding:8px 10px;border-radius:0;margin:0 0 8px}
.sg-leg{display:flex;flex-wrap:wrap;gap:6px 10px;margin:0 0 8px;font-size:12px}
.sg-leg i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:3px;vertical-align:-1px}
.sg-leg .other{color:#d50000;font-weight:700}
.sg-cal{background:#fff4dc;border:4px solid #1a120c;border-radius:0;box-shadow:4px 4px 0 #07060a;overflow:hidden}
.sg-all{display:flex;gap:6px;border-bottom:1px solid #eee;background:#f8f9fa}
.sg-all .g{flex:0 0 46px;text-align:right;font-size:10px;color:#70757a;padding:6px 4px 0 0}
.sg-chips{display:flex;flex-wrap:wrap;gap:4px;padding:6px}
.sg-chip{border-radius:0;padding:3px 6px;font-size:12px;line-height:1.35;max-width:100%;border:2px solid #1a120c}
.sg-chip.neutral{background:#fff;border:1px solid #ccc;color:#222}
.sg-time{display:flex}
.sg-gut{flex:0 0 46px;position:relative}
.sg-gut span{position:absolute;right:4px;transform:translateY(-50%);font-size:10px;color:#70757a;background:#fff}
.sg-scroll{flex:1;overflow-x:auto;-webkit-overflow-scrolling:touch}
.sg-canvas{position:relative}
.sg-line{position:absolute;left:0;right:0;border-top:1px solid #eee;pointer-events:none}
.sg-half{position:absolute;left:0;right:0;border-top:1px dashed #f3f3f3;pointer-events:none}
.sg-add{margin:0 0 8px}
.sg-add button{display:block;width:100%;min-height:44px;padding:8px 12px;font-size:16px;font-weight:700;border:3px solid #1a120c;background:#fff4e4;color:#1c140c;border-radius:0;box-shadow:3px 3px 0 #1a120c}
.sg-ev[onclick],.sg-chip[onclick]{cursor:pointer}
.sg-ev{position:absolute;box-sizing:border-box;border-radius:0;padding:2px 4px;overflow:hidden;line-height:1.25;z-index:1;box-shadow:2px 2px 0 #1a120c}
.sg-ev .k{font-size:11px;font-weight:800}
.sg-ev.drop .k{text-decoration:underline;text-underline-offset:2px}
.sg-ev .nm{font-size:13px;font-weight:700;white-space:pre-wrap;word-break:break-all}
.sg-ev.neutral{background:#fff;color:#222;border:1px solid #c5c5c5}
.sg-ev .ng{color:#c00;background:#fff;border-radius:3px;padding:0 2px}
.sg-now{position:absolute;left:0;right:0;border-top:2px solid #ea4335;z-index:3;pointer-events:none}
.sg-now i{position:absolute;left:-5px;top:-5px;width:8px;height:8px;border-radius:50%;background:#ea4335}
.sg-link{font-size:13px;margin:8px 0 0}
.sg-foot{color:#888;font-size:12px;line-height:1.45;margin:6px 0 0}
@media (max-width:420px){
  .sgm td button{height:30px}
  .sgm td button b{font-size:12px}
  .sgm-h b{font-size:14px}
  .sg-top{gap:2px}
  .sg-top b{font-size:13px}
  .sg-top button{padding:4px 5px;font-size:12px}
}
</style>`;
}
function sgMonthHtml(ym, evs, todayStr) {
  const g = sgGrid(ym), [y, m] = ym.split('-').map(Number);
  let rows = '<tr>' + [...'月火水木金土日'].map(x => `<th>${x}</th>`).join('') + '</tr>';
  for (let d = g.start, cell = 0; d <= g.end; d = sgAdd(d, 1), cell++) {
    if (cell % 7 === 0) rows += '<tr>';
    const es = (evs || []).filter(e => e.day === d);
    const closed = es.some(e => e.kind === '休所');
    const n = es.filter(e => e.kind === '利用').length;
    const trips = es.filter(e => e.kind === '迎え' || e.kind === '送り').length;
    const sub = closed ? '<span class="sub off">休</span>' : n ? `<span class="sub use">${n}人</span>` : trips ? `<span class="sub">☆${trips}</span>` : '<span class="sub"></span>';
    const cls = [d === todayStr ? 'today' : '', sgYm(d) !== ym ? '' : ''].filter(Boolean).join(' ');
    rows += `<td class="${sgYm(d) !== ym ? 'dim' : ''}"><button type="button" class="${cls}" onclick="sgOpenDay('${d}')" aria-label="${+d.slice(5, 7)}/${+d.slice(8)} ${closed ? '休所' : '利用' + n + '人'}"><b>${+d.slice(8)}</b>${sub}</button></td>`;
    if (cell % 7 === 6) rows += '</tr>';
  }
  return `<div class="sgm">${sgCss()}<div class="sgm-h"><button type="button" onclick="sgShiftMonth(-1)" aria-label="前の月">◀</button><b>${y}年${m}月</b><button type="button" onclick="sgShiftMonth(1)" aria-label="次の月">▶</button><button type="button" class="sg-today" onclick="sgThisMonth()">今月</button></div><table>${rows}</table></div>`;
}
let SG_MINE = false;
function sgDayHtml(day, evs, care, opt) {
  let es = (evs || []).filter(e => e.day === day);
  const mineOn = !!(opt && opt.mine);
  const me = opt && opt.me != null ? String(opt.me) : '';
  let mineNote = '';
  if (mineOn) {
    const picked = sgMineEvents(es, me, opt);
    es = picked.events;
    mineNote = picked.unnamed
      ? '<p class="sg-empty">担当の名前が未登録です。自分の担当は出せません。</p>'
      : (picked.empty ? '<p class="sg-empty">この日の自分の担当はありません。</p>' : '<p class="sg-mine-note">自分の担当の迎え・送りだけです。</p>');
  }
  const { allDay, timed } = sgSplit(es);
  const demo = (opt && opt.demo) || (typeof DEMO !== 'undefined' && DEMO);
  const now = opt && opt.nowMin != null ? opt.nowMin : sgNowMin();
  const isToday = (opt && opt.today) ? opt.today === day : (typeof today === 'function' && today() === day);
  let a = timed.length ? Math.min(...timed.map(e => e.start)) : 9 * 60;
  let b = timed.length ? Math.max(...timed.map(e => e.end)) : 18 * 60;
  if (isToday && now != null && now >= a - 120 && now <= b + 120) { a = Math.min(a, now); b = Math.max(b, now); }
  const start = Math.floor(a / 60) * 60;
  let end = Math.ceil(b / 60) * 60;
  if (end <= start) end = start + 60;
  const PX = 72, hpx = (end - start) / 60 * PX;
  const staff = [];
  const seen = new Set();
  for (const e of es) {
    if (!e.staff) continue;
    const show = sgStaffShow(e.staff, { demo });
    if (!show || seen.has(sgNk(show))) continue;
    seen.add(sgNk(show));
    staff.push({ raw: e.staff, show });
  }
  const legend = staff.map(s => {
    const p = sgStaffPaint(s.raw, { demo });
    return `<span><i style="background:${p.hex}"></i>${sgEsc(s.show)}${p.mapped ? '' : ' <span class="other">その他</span>'}</span>`;
  }).join('') + (mineOn ? '' : `<span><i style="background:${SG_USE_HEX}"></i>利用児童</span>`) + `<span>☆迎え　<u>★送り</u>（色は担当）</span>`;
  const canEdit = !!(opt && opt.canEdit);
  const openAttr = id => (canEdit && id != null && id !== '') ? ` onclick="event.stopPropagation();sgEvOpen(${typeof id === 'number' ? id : "'" + String(id).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"})"` : '';
  const chips = allDay.map(e => {
    const p = sgEventPaint(e, { demo });
    const style = p ? ` style="background:${p.hex};color:${p.ink}"` : '';
    const who = (e.kind === '迎え' || e.kind === '送り') && !e.staff ? ' 未定' : '';
    const text = `${sgKind(e)} ${sgLines(e).filter(Boolean).join('、')}${who}`;
    return `<span class="sg-chip${p ? '' : ' neutral'}"${style}${openAttr(e.id)}>${sgEsc(text)}</span>`;
  }).join('');
  const lines = [];
  for (let t = start; t <= end; t += 60) lines.push(`<span class="sg-line" style="top:${(t - start) / 60 * PX}px"></span>`);
  for (let t = start + 30; t < end; t += 60) lines.push(`<span class="sg-half" style="top:${(t - start) / 60 * PX}px"></span>`);
  const labels = [];
  for (let t = start; t <= end; t += 60) labels.push(`<span style="top:${(t - start) / 60 * PX}px">${sgHH(t)}</span>`);
  const maxCols = timed.reduce((m, e) => Math.max(m, e.cols || 1), 1);
  const blocks = timed.map(e => {
    const ev = e.e, p = sgEventPaint(ev, { demo });
    const top = (e.start - start) / 60 * PX;
    const height = Math.max(36, (e.end - e.start) / 60 * PX - 2);
    const left = `calc((100% * ${e.col} / ${e.cols}) + 2px)`;
    const width = `calc((100% * ${e.span} / ${e.cols}) - 4px)`;
    const cls = `sg-ev${p ? '' : ' neutral'}${ev.kind === '送り' ? ' drop' : ''}${ev.kind === '迎え' ? ' pick' : ''}`;
    const style = `top:${top}px;height:${height}px;left:${left};width:${width};${p ? `background:${p.hex};color:${p.ink}` : ''}`;
    const shown = ev.staff ? sgStaffShow(ev.staff, { demo }) : '';
    const who = shown ? sgEsc(shown) : (ev.kind === '迎え' || ev.kind === '送り' ? '<b class="ng">未定</b>' : '');
    const t0 = sgMin(ev.start_time), t1 = sgMin(ev.end_time);
    const when = t0 == null ? sgHH(e.start) : (t1 != null && t1 > t0 ? `${sgHH(t0)}–${sgHH(t1)}` : sgHH(t0));
    const careLine = (ev.kind === '利用' || ev.kind === '休み') && care && care[sgNk(ev.child)] ? `⚠ ${care[sgNk(ev.child)]}` : '';
    const body = sgLines(ev).concat(careLine ? [careLine] : []).map(sgEsc).join('\n');
    const tip = `${sgKind(ev)} ${when} ${sgLines(ev).join(' / ')} ${shown}`.trim();
    return `<div class="${cls}" style="${style}"${openAttr(ev.id)} title="${sgEsc(tip)}"><div class="k">${sgEsc(sgKind(ev))} ${when}${who ? '　' + who : ''}</div><div class="nm">${body}</div></div>`;
  }).join('');
  const nowEl = isToday ? `<div class="sg-now" hidden data-sg-now data-day="${day}" data-start="${start}" data-end="${end}" data-px="${PX}"><i></i></div>` : '';
  const [, mm, dd] = day.split('-');
  const todayArg = typeof today === 'function' ? today() : day;
  const addBtn = canEdit ? `<p class="sg-add"><button type="button" onclick="sgEditNew('${day}')">＋ 予定を追加</button></p>` : '';
  const slot = canEdit ? ` data-start="${start}" data-px="${PX}" onclick="sgEditSlot('${day}', event)"` : '';
  return `<div class="sg-page">${sgCss()}<div class="sg-top"><button type="button" onclick="sgShiftDay('${day}',-1)" aria-label="前の日">◀</button><b>${+mm}/${+dd}（${sgDow(day)}）</b><button type="button" onclick="sgShiftDay('${day}',1)" aria-label="次の日">▶</button><button type="button" onclick="sgOpenDay('${todayArg}')">今日</button><button type="button" onclick="sgOpenMonth('${day}')" aria-label="この日の月">月</button><button type="button" class="sg-mine${mineOn ? ' sg-on' : ''}" aria-pressed="${mineOn ? 'true' : 'false'}" onclick="sgToggleMine()">自分の担当</button></div>
    ${addBtn}${mineNote}<div class="sg-leg">${legend}</div>
    <div class="sg-cal">${chips ? `<div class="sg-all"><div class="g">終日</div><div class="sg-chips">${chips}</div></div>` : ''}<div class="sg-time"><div class="sg-gut" style="height:${hpx}px">${labels.join('')}</div><div class="sg-scroll"><div class="sg-canvas" style="height:${hpx}px;min-width:${Math.max(240, maxCols * 132)}px"${slot}>${lines.join('')}${blocks}${nowEl}</div></div></div></div>
    <p class="sg-link"><a href="#leo/cal" onclick="sgOpenCal('${day}')">この日を児童の利用・送迎予定で開く</a></p>
    <p class="sg-foot">利用児童は山吹色、送迎の色は担当ごとです。一覧に無い担当は赤です。☆は迎え、下線の★は送りです。</p></div>`;
}
async function sgLoad(a, b, mode, anchor) {
  let evs = [];
  const prev = (typeof CAL !== 'undefined') ? { mode: CAL.mode, d: CAL.d } : null;
  try {
    if (typeof DEMO !== 'undefined' && DEMO && typeof calDemo === 'function' && prev) {
      CAL.mode = mode;
      CAL.d = anchor;
      evs = calDemo();
    } else if (typeof DEMO !== 'undefined' && DEMO) evs = [];
    else evs = await sb(`leo_events?day=gte.${a}&day=lte.${b}&order=day,start_time.nullsfirst,id`);
  } finally {
    if (prev) { CAL.mode = prev.mode; CAL.d = prev.d; }
  }
  const LEFT = typeof loadLeftIndex === 'function' ? await loadLeftIndex() : {};
  evs = typeof filterEventsByLeft === 'function' ? filterEventsByLeft(evs || [], LEFT) : (evs || []);
  evs = evs.filter(e => typeof leoCalHidden !== 'function' || !leoCalHidden(e));
  return evs.filter(e => e.day >= a && e.day <= b);
}
async function leoHomeCal() {
  const el = document.getElementById('leo_home_cal');
  if (!el) return;
  const ym = SG_HOME_MONTH || sgYm(typeof today === 'function' ? today() : new Date().toISOString().slice(0, 10));
  SG_HOME_MONTH = ym;
  try {
    const g = sgGrid(ym);
    const evs = await sgLoad(g.start, g.end, 'month', ym + '-01');
    el.innerHTML = sgMonthHtml(ym, evs, typeof today === 'function' ? today() : '');
  } catch (e) { el.innerHTML = `<p class="sgm-err">${sgEsc(e.message)}</p>`; }
}
async function renderSgDay(day) {
  SG_HOME_MONTH = sgYm(day);
  const back = `<button class="back" onclick="location.hash='leo'">← レオへ</button>`;
  $('view').innerHTML = back + '<p>読み込み中…</p>';
  try {
    const evs = await sgLoad(day, day, 'day', day);
    let care = {};
    if (!(typeof DEMO !== 'undefined' && DEMO)) {
      try {
        const cc = await sb('leo_child_care?select=child,note');
        care = Object.fromEntries((cc || []).filter(x => x.note).map(x => [sgNk(x.child), x.note]));
      } catch (e) { /* 配慮が読めなくても予定は出す */ }
    }
    const me = typeof myName === 'function' ? await myName().catch(() => '') : '';
    const canEdit = sgCanEditCal(me);
    if (!canEdit || (SG_EDIT && SG_EDIT.day !== day)) sgClearEdit();
    let form = '';
    if (canEdit && SG_EDIT && SG_EDIT.day === day && typeof calForm === 'function') {
      const row = SG_EDIT.id === 'new'
        ? { day, kind: '利用', kids: [], start_time: SG_EDIT.start || '' }
        : (evs.find(x => String(x.id) === String(SG_EDIT.id)) || { day, kind: '利用', kids: [] });
      if (typeof CAL !== 'undefined') { CAL.edit = SG_EDIT.id; CAL.d = day; CAL.row = row.id ? row : null; }
      window.sgCalReturn = () => {
        const backDay = (typeof CAL !== 'undefined' && CAL.d) || day;
        sgClearEdit();
        renderSgDay(backDay);
      };
      const names = evs.flatMap(e => [e.child, ...(e.kids || [])]).filter(Boolean);
      const staffs = evs.map(e => e.staff).filter(Boolean);
      form = calForm(row, [...new Set(names)].sort(), [...new Set(staffs)].sort());
    }
    $('view').innerHTML = back + form + sgDayHtml(day, evs, care, { me: me || '', mine: SG_MINE, canEdit });
    if (form) { const box = document.querySelector('#cf_day'); if (box && box.scrollIntoView) box.scrollIntoView({ block: 'start' }); }
    sgArmNow();
  } catch (e) { $('view').innerHTML = back + `<p>${sgEsc(e.message)}</p>`; }
}
function sgArmNow() {
  const tick = () => { if (!document.querySelector('[data-sg-now]')) return; sgPlaceNow(); };
  sgPlaceNow();
  if (!window._sgTick) window._sgTick = setInterval(tick, 30000);
}
function sgPlaceNow() {
  const now = sgNowMin();
  document.querySelectorAll('[data-sg-now]').forEach(el => {
    const start = +el.dataset.start, end = +el.dataset.end, px = +el.dataset.px;
    const show = typeof today !== 'function' || el.dataset.day === today();
    if (!show || now == null || now < start || now > end) { el.hidden = true; return; }
    el.hidden = false;
    el.style.top = ((now - start) * px / 60) + 'px';
  });
}
window.sgOpenDay = d => { if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return; SG_HOME_MONTH = sgYm(d); location.hash = 'leo/day/' + d; };
window.sgOpenMonth = d => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d || ''))) return;
  SG_HOME_MONTH = sgYm(d);
  if (location.hash === '#leo') { if (typeof leoHomeCal === 'function') leoHomeCal(); return; }
  location.hash = 'leo';
};
window.sgShiftMonth = n => {
  const cur = (SG_HOME_MONTH || sgYm(typeof today === 'function' ? today() : '2026-10-01')) + '-15';
  SG_HOME_MONTH = sgAdd(cur, 30 * n).slice(0, 7);
  if (typeof leoHomeCal === 'function') leoHomeCal();
};
window.sgThisMonth = () => { SG_HOME_MONTH = sgYm(typeof today === 'function' ? today() : new Date().toISOString().slice(0, 10)); leoHomeCal(); };
window.sgShiftDay = (d, n) => sgOpenDay(sgAdd(d, n));
window.sgToggleMine = () => {
  SG_MINE = !SG_MINE;
  const m = decodeURIComponent(location.hash || '').match(/leo\/day\/(\d{4}-\d{2}-\d{2})/);
  if (m) renderSgDay(m[1]);
};
function sgCanEditCal(me) {
  const role = typeof ROLE !== 'undefined' ? ROLE : '';
  const duty = typeof DUTY !== 'undefined' ? DUTY : '';
  if (role === '事務' || duty === '児発管' || duty === '管理者') return true;
  let key = '';
  try { key = String(me || '').normalize('NFKC'); } catch (err) { key = String(me || ''); }
  return key.replace(/[\s\u3000]/g, '') === '中村友香';
}
let SG_EDIT = null;
function sgClearEdit() {
  SG_EDIT = null;
  window.SG_EDIT = null;
  if (window.sgCalReturn) {
    window.sgCalReturn = null;
    if (typeof CAL !== 'undefined' && CAL) { CAL.edit = null; CAL.row = null; }
  }
}
function sgStartEdit(day, id, start) {
  SG_EDIT = { day, id, start: start || '' };
  window.SG_EDIT = SG_EDIT;
  renderSgDay(day);
}
window.sgEditNew = day => { if (/^\d{4}-\d{2}-\d{2}$/.test(day)) sgStartEdit(day, 'new', ''); };
window.sgEvOpen = id => {
  const m = decodeURIComponent(location.hash || '').match(/leo\/day\/(\d{4}-\d{2}-\d{2})/);
  if (!m || id == null || id === '') return;
  sgStartEdit(m[1], id, '');
};
window.sgEditSlot = (day, ev) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
  const t = ev && ev.target;
  if (t && t.closest && t.closest('.sg-ev, .sg-chip')) return;
  const canvas = ev && ev.currentTarget;
  const startMin = canvas && canvas.dataset.start != null ? +canvas.dataset.start : 9 * 60;
  const px = canvas && canvas.dataset.px ? +canvas.dataset.px : 72;
  const y = ev && ev.offsetY != null ? ev.offsetY : 0;
  let mins = startMin + Math.round((y / (px || 72)) * 60 / 5) * 5;
  if (mins < 0) mins = 0;
  if (mins > 23 * 60 + 55) mins = 23 * 60 + 55;
  const pad = n => String(n).padStart(2, '0');
  sgStartEdit(day, 'new', pad(Math.floor(mins / 60)) + ':' + pad(mins % 60));
};
window.sgOpenCal = d => {
  sgClearEdit();
  if (typeof CAL !== 'undefined') { CAL.d = d; CAL.mode = 'day'; CAL.edit = null; CAL.row = null; }
  location.hash = 'leo/cal';
};
window.sgCanEditCal = sgCanEditCal;
window.sgClearEdit = sgClearEdit;
window.leoHomeCal = leoHomeCal;
window.renderSgDay = renderSgDay;
window.sgMonthHtml = sgMonthHtml;
window.sgDayHtml = sgDayHtml;
window.sgLayout = sgLayout;
window.sgStaffPaint = sgStaffPaint;
window.sgStaffShow = sgStaffShow;
window.sgGrid = sgGrid;
window.sgSplit = sgSplit;
window.sgName = sgName;
window.SG_STAFF_COLOR = SG_STAFF_COLOR;
window.GCAL_EVENT_COLORS = GCAL_EVENT_COLORS;
