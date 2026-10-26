// レオ 予定（#leo/cal）：利用予定・送迎・職員の勤務。日／週／月。児発管・管理者・事務が入力、職員は見る
// データ：leo_events（11/1まではGoogleカレンダーから毎時取り込み＝読むだけ。ポータルで直した予定は上書きされない）
// 見た目：横軸が時刻、日は児童ごとの色の棒、週は日ごとのタイムライン。詳細（迎え☆・送り★・備考・直す）は棒のタップで開く。
const CAL = { mode: 'day', d: null, edit: null };
window.CAL = CAL;
const CK = { 利用: '#2a7', 休み: '#999', 迎え: '#06c', 送り: '#c60', 勤務: '#555', 不在: '#b33', 休所: '#b33', その他: '#777' };
const CAL_PAL = ['#d4652f', '#2e6b4f', '#2c6cb0', '#7a4ea3', '#0e7c72', '#b23a48', '#3d6e99', '#8a5a12', '#5a4a9a', '#1f7a4d', '#a3472c', '#3e5f8a'];
// 日付は日本時間の暦日で計算する（端末のタイムゾーンに依存しない）
const calAdd = (d, n) => { const [y, m, day] = String(d).split('-').map(Number); return new Date(Date.UTC(y, m - 1, day + n)).toISOString().slice(0, 10); };
const calW = d => { const [y, m, day] = String(d).split('-').map(Number); return (new Date(Date.UTC(y, m - 1, day)).getUTCDay() + 6) % 7; };
const calDow = d => '月火水木金土日'[calW(d)];
const calMd = d => `${+d.slice(5, 7)}/${+d.slice(8)}（${calDow(d)}）`;
const nk = s => String(s || '').replace(/[\s　]/g, '');
function calRange() {
  const d = CAL.d;
  if (CAL.mode === 'day') return [d, d];
  if (CAL.mode === 'week') { const w = calW(d); return [calAdd(d, -w), calAdd(d, 6 - w)]; }
  const f = d.slice(0, 8) + '01', w = calW(f), nx = calAdd(f, 32).slice(0, 8) + '01';
  return [calAdd(f, -w), calAdd(nx, (7 - calW(nx)) % 7 - 1)];
}
function calDemo() {
  const [a, b] = calRange(), out = [];
  let id = 1;
  const add = (day, kind, o) => out.push({ id: id++, day, kind, kids: [], source: 'portal', ...o });
  for (let d = a; d <= b; d = calAdd(d, 1)) {
    const w = calDow(d);
    if (w === '日') continue;
    if (w === '土') { add(d, '休所', { title: '土曜日はお休み' }); continue; }
    if (w === '月' || w === '水' || w === '金') {
      add(d, '利用', { child: '児童A', start_time: '10:30', end_time: '14:30', note: '⚠ 保護者の備考：午後は早めにお迎えに行きます。終わり次第、15:50頃になると思います。' });
      add(d, '利用', { child: '児童B', start_time: '15:50', end_time: '17:00' });
      add(d, '利用', { child: '児童C', start_time: '16:15', end_time: '17:00', parent_pick: true });
      add(d, '迎え', { staff: '職員X', kids: ['児童A'], start_time: '10:10', end_time: '10:40', kid_times: { '児童A': '10:20' }, kid_places: { '児童A': '〇〇小学校' } });
      add(d, '迎え', { staff: '職員Y', kids: ['児童B', '児童C'], start_time: '15:00', end_time: '16:20', kid_times: { '児童B': '15:00', '児童C': '15:25' }, kid_places: { '児童B': '△△学園', '児童C': '□□バス停' } });
      add(d, '送り', { staff: '職員X', kids: ['児童A', '児童B'], start_time: '14:30', end_time: '17:20', kid_times: { '児童A': '14:30', '児童B': '17:00' }, kid_places: { '児童A': '自宅', '児童B': '〇〇園' } });
    }
    if (w === '火' || w === '木') {
      add(d, '利用', { child: '児童C', start_time: '10:00', end_time: '13:00', parent_drop: true, parent_pick: true });
      add(d, '休み', { child: '児童A' });
      add(d, '利用', { child: '児童D', start_time: '14:00', end_time: '16:00' });
      add(d, '迎え', { staff: '', kids: ['児童D'], start_time: '13:40', end_time: '14:10', kid_times: { '児童D': '13:50' }, kid_places: { '児童D': '自宅' } });
    }
    if (w === '水') add(d, '不在', { staff: '職員Z', title: '午後不在' });
  }
  return out;
}
async function calLoad() {
  const [a, b] = calRange();
  if (DEMO) return calDemo();
  return sb(`leo_events?day=gte.${a}&day=lte.${b}&order=day,start_time.nullsfirst,id`);
}
const calKid = (evs, name) => {   // その児童の迎え・送り
  const of = k => evs.filter(e => e.kind === k && (e.kids || []).some(n => nk(name).endsWith(nk(n)) || nk(n) === nk(name)));
  return { pick: of('迎え'), drop: of('送り') };
};
const calTag = (k, s) => `<span class="calv-tag" style="background:${CK[k]}">${s || k}</span>`;
const calEd = e => canManage() && e && e.id ? ` <a href="javascript:void 0" onclick="calEdit(${e.id})">直す</a>` : '';

function calHM(t) {
  const m = String(t || '').match(/^(\d{1,2}):(\d{2})/);
  return m ? (+m[1]) * 60 + (+m[2]) : null;
}
function calWin(evs) {
  const times = [];
  for (const e of evs || []) {
    if (e.kind === '休み' || e.kind === '休所' || e.kind === 'その他') continue;
    const s = calHM(e.start_time), en = calHM(e.end_time);
    if (s != null) times.push(s);
    if (en != null) times.push(en);
  }
  if (!times.length) return { a: 9 * 60, b: 18 * 60 };
  let a = Math.floor(Math.min(...times) / 60) * 60, b = Math.ceil(Math.max(...times) / 60) * 60;
  if (b <= a) b = a + 60;
  if (b - a < 6 * 60) {
    a = Math.max(0, a - Math.floor((6 * 60 - (b - a)) / 2 / 60) * 60);
    b = a + 6 * 60;
    if (b > 24 * 60) { b = 24 * 60; a = 18 * 60; }
  }
  return { a, b };
}
function calColor(name) {
  const s = nk(name); let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0;
  return CAL_PAL[h % CAL_PAL.length];
}
function calKey(e, i) {
  const raw = e && e.id != null ? String(e.id) : `${(e && e.day) || ''}-${(e && e.kind) || ''}-${i}`;
  return raw.replace(/[^0-9A-Za-z_-]/g, '') || ('x' + i);
}
function calObjGet(obj, name) {
  if (!obj || typeof obj !== 'object') return '';
  if (obj[name] != null && obj[name] !== '') return obj[name];
  const key = Object.keys(obj).find(k => nk(k) === nk(name));
  if (key && obj[key] != null && obj[key] !== '') return obj[key];
  const hits = Object.keys(obj).filter(k => nk(k).length >= 2 && (nk(name).endsWith(nk(k)) || nk(k).endsWith(nk(name))));
  return hits.length === 1 ? (obj[hits[0]] || '') : '';
}
function calShort(s) {
  const p = String(s || '').trim().split(/[\s　]+/).filter(Boolean);
  return p[0] ? p[0].slice(0, 6) : '';
}
function calNameHtml(name) {
  const p = String(name || '').trim().split(/[\s　]+/).filter(Boolean);
  if (p.length >= 2) return `<b>${esc(p[0])}</b><small>${esc(p.slice(1).join(''))}</small>`;
  return `<b>${esc(name || '')}</b>`;
}
function calGeom(win, e) {
  const s = calHM(e.start_time);
  if (s == null || !win) return null;
  let en = calHM(e.end_time);
  if (en == null || en <= s) en = Math.min(win.b, s + 60);
  const span = win.b - win.a;
  if (span <= 0) return null;
  const left = +Math.max(0, (Math.max(s, win.a) - win.a) / span * 100).toFixed(2);
  let width = +Math.max(2, (Math.min(en, win.b) - Math.max(s, win.a)) / span * 100).toFixed(2);
  if (left + width > 100) width = +Math.max(2, 100 - left).toFixed(2);
  return { left, width };
}
function calNowLeft(win, day) {
  if (typeof today !== 'function' || day !== today()) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
    const t = +parts.find(p => p.type === 'hour').value * 60 + +parts.find(p => p.type === 'minute').value;
    if (t < win.a || t > win.b) return null;
    return ((t - win.a) / (win.b - win.a) * 100).toFixed(2);
  } catch (e) { return null; }
}
function calHours(win) {
  const n = Math.round((win.b - win.a) / 60);
  let h = '';
  for (let i = 0; i <= n; i++) {
    if (n > 8 && i % 2 && i !== n) continue;
    const hr = (win.a / 60 + i) % 24;
    const cls = i === 0 ? 'start' : i === n ? 'end' : 'mid';
    h += `<span class="${cls}" style="left:${(i / n * 100).toFixed(2)}%">${hr}</span>`;
  }
  return `<div class="calv-hours">${h}</div>`;
}
function calNote(note) {
  const s = String(note || '').trim();
  if (!s) return '';
  const m = s.match(/^⚠\s*保護者の備考[:：]\s*([\s\S]*)$/);
  if (m) return `<p class="calv-bikou"><span class="k">保護者の備考</span><span class="v">${esc(m[1])}</span></p>`;
  return `<p class="calv-bikou"><span class="k">メモ</span><span class="v">${esc(s)}</span></p>`;
}
function calSide(lst, parent, kind, name) {
  const mark = kind === '迎え' ? '☆ 迎え' : '★ 送り';
  if (parent) return `<p><span class="k">${mark}</span>${kind === '迎え' ? '保護者が送ってくる（☆なし）' : '保護者が迎えに来る（★なし）'}</p>`;
  if (!lst.length) return `<p><span class="k">${mark}</span><span class="calv-miss">${kind}なし</span></p>`;
  const multi = lst.length > 1;
  return lst.map((x, i) => {
    const tm = calObjGet(x.kid_times, name) || x.start_time || '';
    const pl = calObjGet(x.kid_places, name) || (!x.kid_places && x.place ? x.place : '');
    const who = x.staff ? esc(x.staff) : '<b class="calv-miss">担当なし</b>';
    return `<p><span class="k">${mark}</span> ${who}　${esc(tm)}${pl ? '　' + esc(pl) : ''}${multi && i === 0 ? '　<span class="calv-miss">複数</span>' : ''}</p>`;
  }).join('');
}
function calDetail(e, es, care) {
  const t = calKid(es, e.child), c = care && care[nk(e.child)];
  return `<div class="calv-who"><b>${esc(e.child)}</b>　${esc(e.start_time || '—')}〜${esc(e.end_time || '—')}</div>
    ${calSide(t.pick, e.parent_drop, '迎え', e.child)}
    ${calSide(t.drop, e.parent_pick, '送り', e.child)}
    ${calNote(e.note)}
    ${c ? `<p class="calv-bikou warn"><span class="k">送迎の配慮</span><span class="v">${esc(c)}</span></p>` : ''}
    ${calEd(e) ? `<p class="calv-edit">${calEd(e)}</p>` : ''}`;
}
function calAria(e, es) {
  const t = calKid(es, e.child);
  const one = (lst, parent, kind) => parent ? (kind === '迎え' ? '保護者が送ってくる' : '保護者が迎えに来る')
    : (lst.length ? lst.map(x => `${x.staff || '担当なし'} ${calObjGet(x.kid_times, e.child) || x.start_time || ''} ${calObjGet(x.kid_places, e.child) || ''}`).join('、') : kind + 'なし');
  return esc(`${e.child} ${e.start_time || ''}〜${e.end_time || ''} 迎え ${one(t.pick, e.parent_drop, '迎え')} 送り ${one(t.drop, e.parent_pick, '送り')}${e.note ? ' 備考あり' : ''}`);
}
function calPills(e, es) {
  const t = calKid(es, e.child);
  const bits = [`<span class="tm">${esc(e.start_time || '')}–${esc(e.end_time || '')}</span>`];
  if (e.parent_drop) bits.push('<span class="calv-pill">保護者送</span>');
  else if (t.pick[0]) bits.push(`<span class="calv-pill${t.pick[0].staff ? '' : ' miss'}">☆${esc(calShort(t.pick[0].staff) || '未定')}</span>`);
  else bits.push('<span class="calv-pill miss">☆なし</span>');
  if (e.parent_pick) bits.push('<span class="calv-pill">保護者迎</span>');
  else if (t.drop[0]) bits.push(`<span class="calv-pill${t.drop[0].staff ? '' : ' miss'}">★${esc(calShort(t.drop[0].staff) || '未定')}</span>`);
  else bits.push('<span class="calv-pill miss">★なし</span>');
  return bits.join('');
}
function calMore(key, html) { return `<div id="cm${key}" class="calv-more" hidden>${html}</div>`; }
function calNow(win, day) {
  const left = calNowLeft(win, day);
  return left == null ? '' : `<span class="calv-now" style="left:${left}%"></span>`;
}
function calRoster(d, es, care, win) {
  const use = es.filter(e => e.kind === '利用' && calHM(e.start_time) != null);
  const bare = es.filter(e => e.kind === '利用' && calHM(e.start_time) == null);
  if (!use.length && !bare.length) return '<p class="calv-empty">利用の予定はありません。</p>';
  const rows = use.map((e, i) => {
    const key = calKey(e, i), g = calGeom(win, e), color = calColor(e.child), c = care && care[nk(e.child)];
    const badges = `${e.note ? '<i class="bdg note">備考</i>' : ''}${c ? '<i class="bdg warn">配慮</i>' : ''}`;
    const when = e.start_time ? `<small class="when">${esc(e.start_time)}<br>${esc(e.end_time || '')}</small>` : '';
    return `<div class="calv-row">
      <div class="calv-name" style="box-shadow:inset 4px 0 0 ${color}"><button type="button" class="calv-nameb" data-cal="${key}" aria-expanded="false" aria-label="${calAria(e, es)}" onclick="calFlip('${key}')">${calNameHtml(e.child)}${when}${badges}</button></div>
      <div class="calv-lane">${calNow(win, d)}<button type="button" class="calv-bar" data-cal="${key}" aria-expanded="false" aria-label="${calAria(e, es)}" onclick="calFlip('${key}')" style="left:${g.left}%;width:${g.width}%;background:${color};color:#fff">${calPills(e, es)}</button></div>
      ${calMore(key, calDetail(e, es, care))}</div>`;
  }).join('');
  const rest = bare.map((e, i) => {
    const key = calKey(e, 100 + i);
    return `<button type="button" class="calv-untimed" data-cal="${key}" onclick="calFlip('${key}')">${esc(e.child)}　時刻なし</button>${calMore(key, calDetail(e, es, care))}`;
  }).join('');
  return `<div class="calv-scroll"><div class="calv-board roster" style="--nh:${Math.round((win.b - win.a) / 60)}"><div class="calv-scale"><div class="calv-nameh">児童</div>${calHours(win)}</div>${rows}</div></div>${rest}`;
}
function calOff(es) {
  const off = es.filter(e => e.kind === '休み');
  if (!off.length) return '';
  return `<div class="calv-off">${off.map(e => `<span class="calv-chip">${calTag('休み')} ${esc(e.child)}${calEd(e)}</span>`).join('')}</div>`;
}
function calBanners(es) {
  return es.filter(e => e.kind === '休所' || e.kind === 'その他').map(e => `<p class="calv-banner">${calTag(e.kind)} ${esc(e.title || e.note || '')}${calEd(e)}</p>`).join('');
}
function calRun(e) {
  const kids = e.kids || [];
  const lines = e.kid_times ? kids.map(n => `<li><b>${esc(n)}</b> ${esc(calObjGet(e.kid_times, n) || '')}${calObjGet(e.kid_places, n) ? ` <span>＠${esc(calObjGet(e.kid_places, n))}</span>` : ''}</li>`).join('')
    : `<li>${kids.map(esc).join(' → ')}${e.place ? ` <span>＠${esc(e.place)}</span>` : ''}</li>`;
  const who = e.staff ? esc(e.staff) : '<b class="calv-miss">担当なし</b>';
  return `<article class="calv-run ${e.kind === '送り' ? 'drop' : ''}"><div class="calv-runh"><b>${e.kind === '迎え' ? '☆ 迎え' : '★ 送り'}</b> ${esc(e.start_time || '')}〜${esc(e.end_time || '')}　${who}${calEd(e)}</div><ol>${lines}</ol></article>`;
}
function calRuns(es, folded) {
  const route = es.filter(e => e.kind === '迎え' || e.kind === '送り').sort((a, b) => (a.start_time || '').localeCompare(b.start_time || '') || (a.kind === '送り') - (b.kind === '送り'));
  if (!route.length) return '';
  const body = route.map(calRun).join('');
  if (!folded) return `<p class="calv-h4">送迎</p>${body}`;
  return `<details class="calv-fold"><summary>送迎の便（${route.length}）</summary>${body}</details>`;
}
function calPeople(es) {
  const staff = es.filter(e => e.kind === '勤務' || e.kind === '不在');
  if (!staff.length) return '';
  return `<p class="calv-h4">職員</p>${staff.map(e => `<p class="calv-person">${calTag(e.kind)} ${esc(e.staff || '')} ${esc(e.title || e.note || '')}${calEd(e)}</p>`).join('')}`;
}
function calDay(d, evs, care) {
  const es = (evs || []).filter(e => e.day === d);
  const use = es.filter(e => e.kind === '利用'), off = es.filter(e => e.kind === '休み');
  const win = calWin(es);
  return `${calBanners(es)}<p class="calv-count">利用 ${use.length}人${off.length ? `　休み ${off.length}人` : ''}</p>${calRoster(d, es, care || {}, win)}${calOff(es)}${calRuns(es, false)}${calPeople(es)}`;
}
function calWeek(evs, care) {
  const [a] = calRange(), win = calWin(evs), careM = care || {};
  return Array.from({ length: 7 }, (_, i) => calAdd(a, i)).map(d => {
    const es = evs.filter(e => e.day === d), use = es.filter(e => e.kind === '利用'), off = es.filter(e => e.kind === '休み');
    const nostaff = es.some(e => (e.kind === '迎え' || e.kind === '送り') && !e.staff);
    const todayCls = typeof today === 'function' && d === today() ? ' is-today' : '';
    return `<section class="calv-wday${todayCls}">
      <button type="button" class="calv-whead" onclick="calOpen('${d}')"><b>${calMd(d)}</b><span>利用 ${use.length}人${off.length ? `・休み ${off.length}` : ''}${nostaff ? '・<em>担当なし</em>' : ''}　開く</span></button>
      ${calBanners(es)}${use.length ? calRoster(d, es, careM, win) : (es.some(e => e.kind === '休所') ? '' : '<p class="calv-empty">利用の予定はありません。</p>')}${calOff(es)}${calRuns(es, true)}${calPeople(es)}</section>`;
  }).join('');
}
function calMonth(evs) {
  const [a, b] = calRange(), m = CAL.d.slice(0, 7);
  let h = '<table class="calv-m"><tr>' + [...'月火水木金土日'].map(x => `<th>${x}</th>`).join('') + '</tr>';
  for (let d = a; d <= b; d = calAdd(d, 1)) {
    if (calDow(d) === '月') h += '<tr>';
    const es = evs.filter(e => e.day === d), use = es.filter(e => e.kind === '利用'), cl = es.some(e => e.kind === '休所');
    const dots = use.slice(0, 5).map(e => `<i style="background:${calColor(e.child)}"></i>`).join('');
    const extra = use.length > 5 ? `<i class="more">+${use.length - 5}</i>` : '';
    const sub = cl ? '<em>休所</em>' : `${dots || extra ? `<span class="calv-dots">${dots}${extra}</span>` : ''}<small>${use.length ? use.length + '人' : ''}</small>`;
    h += `<td class="${d.slice(0, 7) !== m ? 'dim' : ''}"><button type="button" onclick="calOpen('${d}')" class="${typeof today === 'function' && d === today() ? 'today' : ''}" aria-label="${calMd(d)} 利用${use.length}人"><b>${+d.slice(8)}</b>${sub}</button></td>`;
    if (calDow(d) === '日') h += '</tr>';
  }
  return h + '</table>';
}
function calCss() {
  return `<style>
.calv{font-size:14px;color:#222}
.calv *{box-sizing:border-box}
.calv button{width:auto;margin:0;border:0;border-radius:8px;background:transparent;color:#222;font-size:14px;padding:0;text-align:left;line-height:1.3}
.calv-hint{color:#666;font-size:13px;line-height:1.45;margin:0 0 8px}
.calv-date{font-size:18px;font-weight:800;margin:2px 0 8px;color:#333}
.calv-count{margin:0 0 6px;font-weight:700;color:#555}
.calv-empty{color:#888;margin:4px 0 8px}
.calv-board{background:#fff;border:1px solid #eadfce;border-radius:12px;overflow:hidden}
.calv-scale{display:grid;grid-template-columns:4.6rem 1fr;background:#fbf7f1;border-bottom:1px solid #eadfce}
.calv-nameh{font-size:11px;color:#8a7a66;font-weight:700;display:flex;align-items:center;padding-left:8px}
.calv-hours{position:relative;height:22px}
.calv-hours span{position:absolute;top:3px;font-size:11px;color:#8a7a66;font-weight:700}
.calv-hours span.mid{transform:translateX(-50%)}
.calv-hours span.end{transform:translateX(-100%)}
.calv-row{display:grid;grid-template-columns:4.6rem 1fr;border-bottom:1px solid #f3ece3}
.calv-row:last-child{border-bottom:0}
.calv-name{position:sticky;left:0;background:#fff;z-index:2}
.calv button.calv-nameb{width:100%;min-height:52px;padding:6px 6px 6px 8px;border-radius:0}
.calv-name b{display:block;font-size:13px}
.calv-name small{display:block;font-size:12px;color:#444;font-weight:600}
.calv-name .when{display:block;font-size:11px;font-weight:800;color:#555;line-height:1.15;margin-top:1px}
.calv-name .bdg{display:inline-block;font-style:normal;font-size:10px;font-weight:800;border-radius:4px;padding:0 3px;margin:2px 2px 0 0}
.calv-name .bdg.note{background:#fff1d6;color:#8a5a12}
.calv-name .bdg.warn{background:#fde2e1;color:#a12622}
.calv-lane{position:relative;min-height:52px;background:repeating-linear-gradient(90deg,transparent 0,transparent calc(100%/var(--nh) - 1px),#f0e6d8 calc(100%/var(--nh) - 1px),#f0e6d8 calc(100%/var(--nh)))}
.calv button.calv-bar{position:absolute;top:calc(50% - 18px);height:36px;min-width:0;border-radius:8px;display:flex;align-items:center;gap:3px;padding:0 6px;overflow:hidden;font-weight:700;box-shadow:0 1px 2px #0002;z-index:2}
.calv button.calv-bar .tm{font-size:12px;white-space:nowrap}
.calv-pill{background:rgba(0,0,0,.22);border-radius:6px;padding:1px 4px;font-size:11px;font-weight:800;white-space:nowrap}
.calv-pill.miss{background:#9d1c1c}
.calv button.calv-bar[aria-expanded="true"],.calv button.calv-nameb[aria-expanded="true"]{outline:2px solid #222;outline-offset:1px}
.calv-now{position:absolute;top:0;bottom:0;width:2px;background:#e23;z-index:1;pointer-events:none}
.calv-more{grid-column:1/-1;background:#fffaf3;border-top:1px dashed #eadfce;padding:8px 10px 10px;font-size:15px;line-height:1.5}
.calv-more[hidden]{display:none !important}
.calv-more p{margin:3px 0}
.calv-more .k{display:inline-block;min-width:5.4em;margin-right:6px;color:#777;font-size:12px;font-weight:800}
.calv-who{font-size:16px;margin-bottom:4px}
.calv-miss{color:#b33;font-weight:800}
.calv-bikou{display:flex;flex-direction:column;gap:2px;background:#fff;border-radius:8px;padding:6px 8px;white-space:pre-wrap;margin-top:6px}
.calv-bikou .k{min-width:0}
.calv-bikou.warn{background:#fff4f2}
.calv-edit a,.calv-run a,.calv-chip a,.calv-person a,.calv-banner a{font-weight:800;color:#0b57d0}
.calv-h4{font-size:15px;font-weight:800;margin:12px 0 4px;color:#555}
.calv-off{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}
.calv-chip{background:#eee;border-radius:999px;padding:4px 8px;font-size:13px}
.calv-banner{background:#fde8e6;color:#8a2218;border-radius:8px;padding:8px 10px;font-weight:800;margin:4px 0}
.calv-tag{color:#fff;border-radius:4px;padding:0 4px;font-size:12px;font-weight:800}
.calv-run{background:#fff;border-radius:12px;padding:8px 10px;margin:8px 0;box-shadow:0 1px 3px #0001;border-left:6px solid #2c6cb0}
.calv-run.drop{border-left-color:#e8833a}
.calv-run ol{margin:6px 0 0;padding-left:1.2em}
.calv-runh{font-size:15px}
.calv-person{margin:4px 0}
.calv-wday{background:#fff;border-radius:12px;padding:8px 8px 4px;margin:0 0 10px;box-shadow:0 1px 3px #0001}
.calv-wday.is-today{box-shadow:inset 0 0 0 2px #e8833a}
.calv button.calv-whead{width:100%;display:flex;justify-content:space-between;align-items:baseline;gap:8px;padding:4px 2px 8px;font-size:16px}
.calv-whead span{font-size:12px;font-weight:700;color:#666}
.calv-whead em{font-style:normal;color:#b33}
.calv-fold{margin:6px 0}
.calv-fold summary{cursor:pointer;font-weight:700;color:#555}
.calv-untimed{display:block;width:100%;margin-top:6px;padding:8px;background:#fff;border:1px dashed #ccc;border-radius:8px;font-weight:700}
.calv table.calv-m{width:100%;table-layout:fixed;border-collapse:separate;border-spacing:3px;background:transparent;font-size:12px}
.calv table.calv-m th,.calv table.calv-m td{border:0;padding:0;text-align:center;font-size:12px;vertical-align:top;background:transparent}
.calv table.calv-m th{color:#8a7a66;font-size:12px;padding-bottom:2px}
.calv table.calv-m button{width:100%;min-height:52px;background:#fff;border-radius:8px;padding:4px 1px;display:flex;flex-direction:column;align-items:center;gap:2px;color:#333;font-size:12px}
.calv table.calv-m button.today{background:#fff4e4;box-shadow:inset 0 0 0 2px #e8833a}
.calv table.calv-m td.dim button{opacity:.45}
.calv table.calv-m b{font-size:14px}
.calv table.calv-m small,.calv table.calv-m em{font-size:10px;font-style:normal;color:#2e6b4f;font-weight:700}
.calv table.calv-m em{color:#b33}
.calv-dots{display:flex;gap:2px;flex-wrap:wrap;justify-content:center}
.calv-dots i{width:7px;height:7px;border-radius:50%;display:block}
.calv-dots i.more{width:auto;height:auto;background:none;color:#666;font-size:10px;font-style:normal}
.calv button:focus-visible{outline:2px solid #e8833a;outline-offset:2px}
</style>`;
}
function calWrap(inner) { return `<div class="calv">${calCss()}${inner}</div>`; }

function calForm(e, kids, staffs) {
  const v = k => esc(e[k] ?? ''), opt = (l, cur) => l.map(x => `<option${x === cur ? ' selected' : ''}>${esc(x)}</option>`).join('');
  return `<div style="border:2px solid #06c;border-radius:8px;padding:8px;margin:8px 0"><b>${e.id ? '予定を直す' : '予定を追加'}</b>
  <datalist id="calkids">${kids.map(k => `<option value="${esc(k)}">`).join('')}</datalist><datalist id="calstaff">${staffs.map(k => `<option value="${esc(k)}">`).join('')}</datalist>
  <p>日付 <input type="date" id="cf_day" value="${v('day')}"> 種類 <select id="cf_kind">${opt(['利用', '休み', '迎え', '送り', '勤務', '不在', '休所', 'その他'], e.kind)}</select></p>
  <p>児童（利用・休み） <input id="cf_child" list="calkids" value="${v('child')}"></p>
  <p>乗る順（迎え・送り、「→」区切り） <input id="cf_kids" list="calkids" value="${esc((e.kids || []).join(' → '))}" style="width:95%"></p>
  <p>職員・運転 <input id="cf_staff" list="calstaff" value="${v('staff')}"></p>
  <p>時刻 <input type="time" id="cf_st" value="${v('start_time')}">〜<input type="time" id="cf_en" value="${v('end_time')}"></p>
  <p><label><input type="checkbox" id="cf_pd"${e.parent_drop ? ' checked' : ''}> 保護者が送ってくる（☆なし）</label><br><label><input type="checkbox" id="cf_pp"${e.parent_pick ? ' checked' : ''}> 保護者が迎えに来る（★なし）</label></p>
  <p>場所 <input id="cf_place" value="${v('place')}" style="width:95%"></p><p>メモ <input id="cf_note" value="${v('note')}" style="width:95%"></p>
  ${e.source === 'google' ? '<p class="note">Googleカレンダーから取り込んだ予定です。ここで直すとポータルの予定になり、以後Google側の変更では上書きされません。</p>' : ''}
  <button onclick="calSave()">保存</button> <button onclick="CAL.edit=null;renderLeoView('cal')">やめる</button>${e.id ? ` <button onclick="calDel()" style="color:#b33">削除</button>` : ''}</div>`;
}
window.calOpen = d => { CAL.d = d; CAL.mode = 'day'; renderLeoView('cal'); };
window.calMode = m => { CAL.mode = m; renderLeoView('cal'); };
window.calMove = n => {
  if (CAL.mode === 'month') CAL.d = calAdd(CAL.d.slice(0, 8) + '15', 30 * n).slice(0, 8) + '01';
  else CAL.d = calAdd(CAL.d, n * (CAL.mode === 'week' ? 7 : 1));
  renderLeoView('cal');
};
window.calEdit = id => { CAL.edit = id; renderLeoView('cal'); window.scrollTo(0, 0); };
window.calFlip = key => {
  if (!/^[0-9A-Za-z_-]+$/.test(String(key))) return;
  const more = document.getElementById('cm' + key);
  if (!more) return;
  const open = more.hidden;
  document.querySelectorAll('.calv-more').forEach(n => { n.hidden = true; });
  document.querySelectorAll('[data-cal]').forEach(n => n.setAttribute('aria-expanded', 'false'));
  if (open) {
    more.hidden = false;
    document.querySelectorAll('[data-cal="' + key + '"]').forEach(n => n.setAttribute('aria-expanded', 'true'));
    more.scrollIntoView({ block: 'nearest' });
  }
};
window.calSave = async () => {
  if (DEMO) return alert('見本モードでは保存しません。');
  const g = id => document.getElementById(id), body = { day: g('cf_day').value, kind: g('cf_kind').value, child: g('cf_child').value.trim() || null,
    kids: g('cf_kids').value.split(/[→>、,・]/).map(s => s.trim()).filter(Boolean), staff: g('cf_staff').value.trim() || null,
    start_time: g('cf_st').value || null, end_time: g('cf_en').value || null, parent_drop: g('cf_pd').checked, parent_pick: g('cf_pp').checked,
    place: g('cf_place').value.trim() || null, note: g('cf_note').value.trim() || null, source: 'portal', updated_at: new Date().toISOString() };
  if (!body.day) return alert('日付を入れてください');
  try {
    if (CAL.edit && CAL.edit !== 'new') await sb('leo_events?id=eq.' + CAL.edit, { method: 'PATCH', body: JSON.stringify(body) });
    else await sb('leo_events', { method: 'POST', body: JSON.stringify(body) });
    CAL.d = body.day; CAL.edit = null; renderLeoView('cal');
  } catch (e) { alert(e.message); }
};
window.calDel = async () => {
  if (DEMO) return alert('見本モードでは削除しません。');
  if (!confirm('この予定を削除しますか？')) return;
  await sb('leo_events?id=eq.' + CAL.edit, { method: 'DELETE' });
  CAL.edit = null; renderLeoView('cal');
};

LEO_VIEWS.cal = async function () {
  CAL.d = CAL.d || today();
  const [evs0, cc, ch, LEFT] = await Promise.all([calLoad(), DEMO ? [] : sb('leo_child_care?select=child,note').catch(() => []), canManage() && !DEMO ? sb('leo_children?select=name').catch(() => []) : [], loadLeftIndex()]);
  const evs = filterEventsByLeft(evs0, LEFT);
  const care = Object.fromEntries(cc.filter(x => x.note).map(x => [nk(x.child), x.note]));
  if (DEMO) care[nk('児童B')] = '（見本）車に乗るとき、抱っこが必要です。';
  const [a, b] = calRange(), btn = (m, l) => `<button onclick="calMode('${m}')"${CAL.mode === m ? ' style="font-weight:bold;background:#e8833a;color:#fff"' : ''}>${l}</button>`;
  const head = CAL.mode === 'day' ? calMd(a) : CAL.mode === 'week' ? `${calMd(a)}〜${calMd(b)}` : `${+CAL.d.slice(0, 4)}年${+CAL.d.slice(5, 7)}月`;
  const body = CAL.mode === 'day' ? calDay(a, evs, care) : CAL.mode === 'week' ? calWeek(evs, care) : calMonth(evs);
  let h = `<h3>児童の利用・送迎予定</h3>${demoNote()}<p class="calbar"><style>.calbar button{width:auto !important;display:inline-block !important;padding:6px 12px !important;margin:2px !important}</style>${btn('day', '日')}${btn('week', '週')}${btn('month', '月')}
    <button onclick="calMove(-1)">◀</button><button onclick="CAL.d=today();renderLeoView('cal')">今日</button><button onclick="calMove(1)">▶</button>
    ${canManage() ? ` <button onclick="calEdit('new')">＋追加</button>` : ''}</p>`;
  if (CAL.edit) {
    const e = CAL.edit === 'new' ? { day: CAL.d, kind: '利用', kids: [] } : evs.find(x => x.id === CAL.edit) || {};
    h += calForm(e, [...new Set([...ch.map(x => x.name), ...evs.map(x => x.child).filter(Boolean)])].sort(), [...new Set(evs.map(x => x.staff).filter(Boolean))].sort());
  }
  h += calWrap(`<p class="calv-date">${head}</p><p class="calv-hint">横軸は時刻、色の棒は児童の利用時間です。棒をタップすると、迎え（☆）・送り（★）の担当・時刻・場所と、保護者の備考が出ます。</p>${body}`);
  h += `<p style="margin-top:12px;font-size:13px;line-height:1.5">関連：<a href="#leo/sougei">自分の送迎</a>・<a href="#leo/kata">送迎 型表</a>・<a href="#leo/haichi">職員配置表</a>${canManage() ? '・<a href="#leo/userinfo">利用者情報</a>' : ''}</p>
    <p style="font-size:13px;color:#666;line-height:1.5">退所日の翌日以降の児童は、この画面には出しません（予定の記録は消していません。型表の保存も不要です）。</p>
    <p style="font-size:13px;color:#666;line-height:1.5">11/1まではGoogleカレンダーの予定を毎時取り込んでいます（Google側は変えません）。ポータルで直した予定はそのまま残ります。</p>`;
  return h;
};
