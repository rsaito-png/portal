// レオ送迎の一つの画面（#leo/sougei）。時間順・子どもごと・一覧と型表をまとめる。
// 古いURL（#leo/sougeiall・#leo/cal・#leo/day/日付）はここへ飛ばす。自動では読み込み直さない（齊藤さん指定 2026-11-13）。
const SG_HUB_STORE = 'leo.sougei.hub.v1';
const SG_HUB = { view: 'time', who: 'all', day: '', tab: 'plan' };

function sgHubToday() {
  if (typeof today === 'function') {
    const t = today();
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(t || ''))) return t;
  }
  try { return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' }); }
  catch (e) { return ''; }
}
function sgHubRead() {
  try {
    const o = JSON.parse((typeof localStorage !== 'undefined' && localStorage.getItem(SG_HUB_STORE)) || '{}');
    if (o.view === 'time' || o.view === 'child' || o.view === 'list') SG_HUB.view = o.view;
    if (o.who === 'all' || o.who === 'mine') SG_HUB.who = o.who;
    if (o.calMode === 'day' || o.calMode === 'week' || o.calMode === 'month') {
      if (typeof CAL !== 'undefined' && CAL && !CAL.edit) CAL.mode = o.calMode;
    }
  } catch (e) { /* 記憶が壊れても既定で開く */ }
}
function sgHubWrite() {
  try {
    if (typeof localStorage === 'undefined') return;
    const calMode = (typeof CAL !== 'undefined' && CAL && CAL.mode) || 'day';
    localStorage.setItem(SG_HUB_STORE, JSON.stringify({ view: SG_HUB.view, who: SG_HUB.who, calMode }));
  } catch (e) { /* プライベートモードなど */ }
}
function sgHubDest(day) {
  const t = sgHubToday();
  if (!day || day === t) return '#leo/sougei';
  return '#leo/sougei/' + day;
}
function sgHubFromHash(hash) {
  let h = '';
  try { h = decodeURIComponent(String(hash || '')); } catch (e) { h = String(hash || ''); }
  if (h.charAt(0) !== '#') h = '#' + h;
  const m = h.match(/^#leo\/([^/?#]+)(?:\/([^/?#]+))?/);
  if (!m) return null;
  const sub = m[1], sub2 = m[2] || '';
  const out = { sub, sub2, day: '', tab: 'plan', view: null, who: null, dest: '', redirect: false };
  if (sub === 'kata') {
    out.tab = 'kata';
    out.dest = '#leo/kata';
    return out;
  }
  if (sub === 'sougei' && /^\d{4}-\d{2}-\d{2}$/.test(sub2)) {
    out.day = sub2;
    out.dest = '#leo/sougei/' + sub2;
    return out;
  }
  if (sub === 'sougei' && !sub2) {
    out.dest = '#leo/sougei';
    return out;
  }
  if (sub === 'sougeiall') {
    out.view = 'list';
    out.who = 'all';
    out.redirect = true;
    out.dest = '#leo/sougei';
    return out;
  }
  if (sub === 'cal') {
    out.view = 'child';
    out.redirect = true;
    out.day = (typeof CAL !== 'undefined' && CAL && /^\d{4}-\d{2}-\d{2}$/.test(CAL.d || '')) ? CAL.d : '';
    out.dest = sgHubDest(out.day);
    return out;
  }
  if (sub === 'day' && /^\d{4}-\d{2}-\d{2}$/.test(sub2)) {
    out.view = 'time';
    out.day = sub2;
    out.redirect = true;
    out.dest = '#leo/sougei/' + sub2;
    return out;
  }
  return null;
}
function sgHubSetHash(dest) {
  if (typeof location === 'undefined') return false;
  const want = String(dest || '').replace(/^#/, '#');
  const cur = location.hash || '';
  if (cur === want) return false;
  location.hash = want.replace(/^#/, '');
  return true;
}
function sgHubApplyMineFlag() {
  if (typeof SG_MINE !== 'undefined') {
    try { SG_MINE = SG_HUB.who === 'mine'; } catch (e) { /* 定数のとき */ }
  }
  if (typeof window !== 'undefined') window.SG_MINE = SG_HUB.who === 'mine';
}
function sgHubSyncDay(day) {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(day || '') ? day : sgHubToday();
  SG_HUB.day = d;
  if (typeof CAL !== 'undefined' && CAL) CAL.d = d;
  if (typeof SG_HOME_MONTH !== 'undefined' || (typeof window !== 'undefined')) {
    try {
      if (typeof sgYm === 'function') {
        if (typeof window !== 'undefined') window.SG_HOME_MONTH = sgYm(d);
        else SG_HOME_MONTH = sgYm(d);
      }
    } catch (e) { /* 月の記憶は補助 */ }
  }
  return d;
}

function sgHubCss() {
  return `<style>
.sg-hub h3{margin:8px 0 10px}
.sg-hub .sg-hub-nav{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:0 0 10px}
.sg-hub .sg-hub-nav input[type=date]{width:auto;min-width:11em;margin:0;font-size:16px;padding:6px 8px}
.sg-hub .sg-hub-lab{font-size:13px;color:#555;font-weight:700;margin-right:4px}
.sg-hub .ptabs{margin:0 0 8px}
.sg-hub .sg-hub-note{font-size:13px;color:#666;line-height:1.5;margin:0 0 10px}
</style>`;
}
function sgHubBtn(cls, on, click, label) {
  return `<button type="button" class="${cls}${on ? ' on' : ''}" aria-pressed="${on ? 'true' : 'false'}" onclick="${click}">${label}</button>`;
}
function sgHubChrome() {
  const d = SG_HUB.day || sgHubToday();
  const kata = SG_HUB.tab === 'kata';
  const nav = kata ? '' : `<p class="calbar sg-hub-nav"><style>.sg-hub .calbar button{width:auto !important;display:inline-block !important;padding:6px 12px !important;margin:2px !important}</style>
    <button type="button" onclick="sgHubMove(-1)" aria-label="前の日">◀</button>
    <input type="date" value="${d}" onchange="if(this.value)sgHubGo(this.value)" aria-label="日付">
    <button type="button" onclick="sgHubMove(1)" aria-label="次の日">▶</button>
    <button type="button" onclick="sgHubGoToday()">今日</button>
    <button type="button" onclick="sgOpenMonth('${d}')">月</button></p>
    <p class="ptabs"><span class="sg-hub-lab">見せ方</span>${sgHubBtn('', SG_HUB.view === 'time', "sgHubSetView('time')", '時間順')}${sgHubBtn('', SG_HUB.view === 'child', "sgHubSetView('child')", '子どもごと')}${sgHubBtn('', SG_HUB.view === 'list', "sgHubSetView('list')", '一覧')}</p>
    <p class="ptabs"><span class="sg-hub-lab">絞り込み</span>${sgHubBtn('', SG_HUB.who === 'all', "sgHubSetWho('all')", '全員')}${sgHubBtn('', SG_HUB.who === 'mine', "sgHubSetWho('mine')", '自分だけ')}</p>`;
  return `<div class="sg-hub">${sgHubCss()}
    <button class="back" onclick="location.hash='leo'">← レオへ</button>
    <h3>送迎</h3>
    <p class="ptabs">${sgHubBtn('', !kata, "sgHubTab('plan')", '予定')}${sgHubBtn('', kata, "sgHubTab('kata')", '型表')}</p>
    ${nav}
    <div id="sg_hub_body"></div></div>`;
}

function sgHubFilterChildEvs(evs, me) {
  if (!me) return evs || [];
  const mine = (staff) => typeof same === 'function' ? same(staff, me) : String(staff || '').replace(/\s/g, '') === String(me || '').replace(/\s/g, '');
  const names = new Set();
  const nk = typeof window !== 'undefined' && typeof window.nk === 'function' ? window.nk : (s => String(s || '').replace(/[\s　]/g, ''));
  (evs || []).forEach(e => {
    if ((e.kind === '迎え' || e.kind === '送り') && mine(e.staff)) {
      (e.kids || []).forEach(n => { if (n) names.add(nk(n)); });
      if (e.child) names.add(nk(e.child));
    }
  });
  return (evs || []).filter(e => {
    if (e.kind === '利用' || e.kind === '休み') return names.has(nk(e.child));
    if (e.kind === '迎え' || e.kind === '送り') return mine(e.staff);
    if (e.kind === '勤務' || e.kind === '不在' || e.kind === 'その他') return mine(e.staff);
    return true;
  });
}

async function sgHubListHtml(day, who) {
  const me = typeof myName === 'function' ? await myName().catch(() => '') : '';
  const evPromise = (typeof DEMO !== 'undefined' && DEMO)
    ? Promise.resolve(typeof demoCalEdits === 'function' ? demoCalEdits() : (typeof calDemo === 'function' ? calDemo() : []))
    : sb(`leo_events?kind=in.(利用,迎え,送り,休み)&day=eq.${day}&order=start_time`).catch(() => []);
  const carePromise = (typeof DEMO !== 'undefined' && DEMO)
    ? Promise.resolve([])
    : sb('leo_child_care').catch(() => []);
  const nkPromise = (typeof DEMO !== 'undefined' && DEMO && typeof DEMO_DATA !== 'undefined')
    ? Promise.resolve((DEMO_DATA.nikki || []).map(r => ({ ...r, day })))
    : (typeof sb === 'function' ? sb(`leo_nikki?day=eq.${day}&order=row_no`).catch(() => []) : Promise.resolve([]));
  const [ev0, nk0, cc, LEFT] = await Promise.all([evPromise, nkPromise, carePromise, typeof loadLeftIndex === 'function' ? loadLeftIndex() : {}]);
  const ev = (typeof filterEventsByLeft === 'function' ? filterEventsByLeft(ev0 || [], LEFT) : (ev0 || [])).filter(e => e.day === day);
  const nk = (typeof filterByLeftDay === 'function' ? filterByLeftDay(nk0 || [], LEFT) : (nk0 || [])).filter(r => r.day === day);
  const CARE = Object.fromEntries((cc || []).filter(x => x.note).map(x => [x.child, x.note]));
  const opts = { embedded: true };
  if (who === 'mine') {
    if (nk.length && typeof leoSougeiMineHtml === 'function') return leoSougeiMineHtml(me, nk, ev, CARE, opts);
    const plan = ev.filter(e => (e.kind === '迎え' || e.kind === '送り') && !(typeof leoCalHidden === 'function' && leoCalHidden(e)) && (typeof same === 'function' ? same(e.staff, me) : false));
    if (!plan.length) return `<p>担当はありません。</p>`;
    const note = typeof LEO_PLAN_NOTE === 'string' ? `<p class="note">${LEO_PLAN_NOTE}</p>` : '';
    if (typeof leoPlanTableHtml === 'function') return note + leoPlanTableHtml(plan, CARE);
    return note + '<p>担当の予定があります。</p>';
  }
  if (typeof leoSougeiAllHtml === 'function') return leoSougeiAllHtml(nk, ev, CARE, opts);
  return '<p>一覧を出せません。</p>';
}

async function sgHubTimeHtml(day) {
  if (typeof sgDayBundle !== 'function') return '<p>時間順の表を出せません。</p>';
  const b = await sgDayBundle(day, { mine: SG_HUB.who === 'mine', embed: true });
  return (b.form || '') + (b.html || '');
}

async function sgHubChildHtml(day) {
  if (typeof CAL !== 'undefined' && CAL) {
    CAL.d = day;
    if (!CAL.mode) CAL.mode = 'day';
  }
  if (typeof LEO_VIEWS === 'undefined' || typeof LEO_VIEWS.cal !== 'function') return '<p>子どもごとの表を出せません。</p>';
  const prev = typeof window !== 'undefined' ? window.SG_HUB_EMBED : undefined;
  if (typeof window !== 'undefined') window.SG_HUB_EMBED = true;
  try {
    let html = await LEO_VIEWS.cal();
    if (SG_HUB.who === 'mine' && typeof window !== 'undefined') {
      // 子どもごとの表は LEO_VIEWS.cal 内で描く。絞り込みは cal 側の SG_HUB 参照でも行う。
    }
    return html;
  } finally {
    if (typeof window !== 'undefined') {
      if (prev === undefined) delete window.SG_HUB_EMBED;
      else window.SG_HUB_EMBED = prev;
    }
  }
}

async function sgHubRender() {
  const root = typeof $ === 'function' ? $('view') : (typeof document !== 'undefined' && document.getElementById('view'));
  if (!root) return;
  const kata = SG_HUB.tab === 'kata';
  const day = kata ? (SG_HUB.day || sgHubToday()) : sgHubSyncDay(SG_HUB.day || sgHubToday());
  sgHubApplyMineFlag();
  window._sgHubPainting = true;
  try {
    document.body.classList.toggle('wide-sheet', !!kata);
    root.innerHTML = sgHubChrome();
    const box = document.getElementById('sg_hub_body');
    if (!box) return;
    box.innerHTML = '<p>読み込み中…</p>';
    if (kata) {
      const html = (typeof LEO_VIEWS !== 'undefined' && typeof LEO_VIEWS.kata === 'function') ? await LEO_VIEWS.kata() : '<p>型表を出せません。</p>';
      box.innerHTML = html;
      if (typeof fitMasterSheet === 'function') {
        fitMasterSheet();
        if (document.fonts) {
          document.fonts.ready.then(fitMasterSheet);
          document.fonts.addEventListener && document.fonts.addEventListener('loadingdone', fitMasterSheet);
        }
        setTimeout(fitMasterSheet, 800);
      }
      return;
    }
    let html = '';
    if (SG_HUB.view === 'child') html = await sgHubChildHtml(day);
    else if (SG_HUB.view === 'list') html = await sgHubListHtml(day, SG_HUB.who);
    else html = await sgHubTimeHtml(day);
    box.innerHTML = html;
    if (SG_HUB.view === 'time' && typeof sgArmNow === 'function') sgArmNow();
    if (SG_HUB.view === 'time' || (typeof CAL !== 'undefined' && CAL && CAL.edit)) {
      const form = document.querySelector('#cf_day');
      if (form && form.scrollIntoView) form.scrollIntoView({ block: 'start' });
    }
  } catch (e) {
    const box = document.getElementById('sg_hub_body');
    if (box) box.innerHTML = `<p>${typeof esc === 'function' ? esc(e.message) : (e && e.message) || e}</p>`;
  } finally {
    window._sgHubPainting = false;
  }
}

async function sgHubOpen(sub, sub2) {
  sgHubRead();
  const hash = '#leo/' + sub + (sub2 ? '/' + sub2 : '');
  const info = sgHubFromHash(hash);
  if (!info) return false;
  if (info.view) SG_HUB.view = info.view;
  if (info.who) SG_HUB.who = info.who;
  if (info.tab) SG_HUB.tab = info.tab;
  if (info.tab !== 'kata') {
    sgHubSyncDay(info.day || sgHubToday());
  }
  sgHubWrite();
  if (info.redirect && info.dest && sgHubSetHash(info.dest)) return true;
  await sgHubRender();
  return true;
}
function sgHubTakeView(name) {
  if (name === 'kata') {
    SG_HUB.tab = 'kata';
    if (typeof location !== 'undefined' && location.hash !== '#leo/kata') {
      location.hash = 'leo/kata';
      return true;
    }
    sgHubRender();
    return true;
  }
  if (name === 'cal') {
    sgHubRead();
    SG_HUB.tab = 'plan';
    SG_HUB.view = 'child';
    if (typeof CAL !== 'undefined' && CAL && CAL.d) sgHubSyncDay(CAL.d);
    sgHubWrite();
    const dest = sgHubDest(SG_HUB.day);
    if (typeof location !== 'undefined' && location.hash !== dest && !window._sgHubPainting) {
      if (sgHubSetHash(dest)) return true;
    }
    sgHubRender();
    return true;
  }
  return false;
}
function sgHubGo(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '')) return;
  sgHubRead();
  SG_HUB.tab = 'plan';
  sgHubSyncDay(day);
  sgHubWrite();
  if (typeof sgClearEdit === 'function' && !(typeof CAL !== 'undefined' && CAL && CAL.edit) && !(typeof window !== 'undefined' && window.SG_EDIT && window.SG_EDIT.day === day)) {
    /* 日付が変わったら、別の日の編集は閉じる */
    if (typeof window !== 'undefined' && window.SG_EDIT && window.SG_EDIT.day !== day) sgClearEdit();
  }
  const dest = sgHubDest(day);
  if (sgHubSetHash(dest)) return;
  sgHubRender();
}
function sgHubGoToday() { sgHubGo(sgHubToday()); }
function sgHubMove(n) {
  const d = SG_HUB.day || sgHubToday();
  const next = typeof addDays === 'function' ? addDays(d, n) : d;
  sgHubGo(next);
}
function sgHubTab(tab) {
  sgHubRead();
  SG_HUB.tab = tab === 'kata' ? 'kata' : 'plan';
  sgHubWrite();
  if (SG_HUB.tab === 'kata') {
    if (sgHubSetHash('#leo/kata')) return;
  } else {
    const dest = sgHubDest(SG_HUB.day || sgHubToday());
    if (sgHubSetHash(dest)) return;
  }
  sgHubRender();
}
function sgHubSetView(view) {
  if (view !== 'time' && view !== 'child' && view !== 'list') return;
  sgHubRead();
  SG_HUB.tab = 'plan';
  SG_HUB.view = view;
  sgHubWrite();
  const dest = sgHubDest(SG_HUB.day || sgHubToday());
  if (typeof location !== 'undefined' && location.hash === '#leo/kata') {
    if (sgHubSetHash(dest)) return;
  }
  sgHubRender();
}
function sgHubSetWho(who) {
  if (who !== 'all' && who !== 'mine') return;
  sgHubRead();
  SG_HUB.who = who;
  sgHubApplyMineFlag();
  sgHubWrite();
  sgHubRender();
}
function sgHubJump(opts) {
  opts = opts || {};
  sgHubRead();
  if (opts.view) SG_HUB.view = opts.view;
  if (opts.who) SG_HUB.who = opts.who;
  SG_HUB.tab = opts.tab || 'plan';
  if (opts.day) sgHubSyncDay(opts.day);
  sgHubWrite();
  const dest = SG_HUB.tab === 'kata' ? '#leo/kata' : sgHubDest(SG_HUB.day || sgHubToday());
  if (sgHubSetHash(dest)) return;
  return sgHubRender();
}
function sgHubDay() { return SG_HUB.day || sgHubToday(); }

window.SG_HUB = SG_HUB;
window.sgHubFromHash = sgHubFromHash;
window.sgHubDest = sgHubDest;
window.sgHubOpen = sgHubOpen;
window.sgHubRender = sgHubRender;
window.sgHubTakeView = sgHubTakeView;
window.sgHubGo = sgHubGo;
window.sgHubGoToday = sgHubGoToday;
window.sgHubMove = sgHubMove;
window.sgHubTab = sgHubTab;
window.sgHubSetView = sgHubSetView;
window.sgHubSetWho = sgHubSetWho;
window.sgHubJump = sgHubJump;
window.sgHubDay = sgHubDay;
window.sgHubRead = sgHubRead;
window.sgHubWrite = sgHubWrite;
window.sgHubChrome = sgHubChrome;
window.sgHubFilterChildEvs = sgHubFilterChildEvs;
