// 金斗雲の訪問記録。
// #kintoun/write … 記録記入。GAS「サービス実施記録入力」(index.html v13.6 / Code.gs v11.7) の流れ（通常・同じ建物で連続・まとめて署名）。
// #kintoun/visit … 今月の記録（一覧と、既存1件を開いて直す）。
// 「サ責からの指示」はヘルパーの記入欄ではない。利用者（または全員）向けの有効な指示を表示するだけ。
// 新規保存時に、その提供日に有効な指示ID（無ければ「指示なし」）を instruction_id へ自動で入れる。既存行は上書きしない。
// 担当ヘルパー名は、新規ではログイン中の職員（full_name、無ければポータルの表示名 nikki_name）。既存行は保存済みの staff_name のまま。空欄でも保存できる。
const KV = { id: null, month: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 7), instructions: [], users: [], visit: null, ctx: null, instrMissing: false };
const KV_REPORT = [
  { k: 'report1', ja: '①意欲', pt: 'Disposição / motivação' },
  { k: 'report2', ja: '②訴え・要望', pt: 'Queixas e pedidos' },
  { k: 'report3', ja: '③家族を含む環境', pt: 'Ambiente (inclui a família)' },
  { k: 'report4', ja: '④前回からの変化・引き継ぎ', pt: 'Mudanças / passagem' },
  { k: 'report5', ja: '⑤体調・服薬・連絡事項', pt: 'Saúde, remédios e avisos' }
];
/* kv-pure */
const KV_NO_INSTRUCTION = '指示なし';
const KV_SV_NAME = '山川美恵子';
function kvAddDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function kvInstructionStatus(ins, today) {
  if (ins.end_date && ins.end_date < today) return '終了';
  if (ins.start_date && ins.start_date > today) return '予定';
  return '有効';
}
function kvActiveInstructions(list, userId, iso) {
  return (list || []).filter(ins => {
    if (!ins || !ins.content || !iso) return false;
    const all = ins.target_user_id == null || ins.target_user_id === '';
    if (!all && Number(ins.target_user_id) !== Number(userId)) return false;
    if (ins.start_date && ins.start_date > iso) return false;
    if (ins.end_date && ins.end_date < iso) return false;
    return true;
  }).sort((a, b) => (a.start_date || '') < (b.start_date || '') ? -1 : (a.start_date || '') > (b.start_date || '') ? 1 : String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0);
}
function kvInstructionIdValue(list) {
  const ids = (list || []).map(i => i.id).filter(Boolean);
  return ids.length ? ids.join(',') : KV_NO_INSTRUCTION;
}
function kvNextInstructionId(list) {
  let max = 0;
  (list || []).forEach(ins => { const m = /^SJ-(\d+)$/.exec(ins.id || ''); if (m) max = Math.max(max, Number(m[1])); });
  const n = String(max + 1);
  return 'SJ-' + n.padStart(Math.max(4, n.length), '0');
}
function kvEndDate(ins, today) {
  const yesterday = kvAddDays(today, -1);
  return (ins.start_date && ins.start_date > yesterday) ? kvAddDays(ins.start_date, -1) : yesterday;
}
function kvHasReport(v) { return [1, 2, 3, 4, 5].some(i => v && v['report' + i]); }
function kvPreviousVisit(visits, currentId, iso, startTime) {
  const rows = (visits || []).filter(v => {
    if (!v || !iso || v.visit_date > iso || !kvHasReport(v)) return false;
    if (currentId != null && currentId !== 'new' && String(v.id) === String(currentId)) return false;
    if (v.visit_date === iso && startTime && (v.start_time || '').slice(0, 5) >= startTime) return false;
    return true;
  });
  rows.sort((a, b) => {
    if (a.visit_date !== b.visit_date) return a.visit_date < b.visit_date ? 1 : -1;
    const as = a.start_time || '', bs = b.start_time || '';
    if (as !== bs) return as < bs ? 1 : -1;
    return (b.id || 0) - (a.id || 0);
  });
  return rows[0] || null;
}
const KV_BANDS = [
  { key: 'asa', ja: '朝', pt: 'Manhã', period: 'asa', weekendOnly: false },
  { key: 'hiru', ja: '昼', pt: 'Tarde', period: 'hiru', weekendOnly: false },
  { key: 'yu', ja: '夕', pt: 'Noite', period: 'yu', weekendOnly: false }
];
const KV_WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'];
const KV_WEEKEND = [0, 6];
function kvPad2(n) { return (n < 10 ? '0' : '') + n; }
function kvToMinutes(hhmm) {
  const p = String(hhmm || '0:0').split(':');
  return (+p[0]) * 60 + (+p[1] || 0);
}
function kvMinutesToHHMM(min) {
  return kvPad2(Math.floor(min / 60) % 24) + ':' + kvPad2(min % 60);
}
function kvShortTime(hhmm) {
  const p = String(hhmm || '').split(':');
  if (!p[0]) return '';
  return (+p[0]) + ':' + (p[1] || '00').slice(0, 2);
}
function kvWeekdayFromISO(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay();
}
function kvNowParts(date) {
  const t = new Date((date ? date.getTime() : Date.now()) + 9 * 3600 * 1000);
  return { hh: t.getUTCHours(), mi: t.getUTCMinutes(), weekday: t.getUTCDay(), iso: t.toISOString().slice(0, 10) };
}
function kvNowMinutes(date) { const p = kvNowParts(date); return p.hh * 60 + p.mi; }
function kvNowHHMM(date) { const p = kvNowParts(date); return kvPad2(p.hh) + ':' + kvPad2(p.mi); }
function kvCircularDiff(a, b) {
  const d = Math.abs(a - b) % 1440;
  return Math.min(d, 1440 - d);
}
function kvSlotDistance(slot, nowMin) {
  const s = kvToMinutes(slot.start), e = kvToMinutes(slot.end);
  if (s <= e && nowMin >= s && nowMin <= e) return 0;
  return Math.min(kvCircularDiff(nowMin, s), kvCircularDiff(nowMin, e));
}
function kvSlotPeriod(slot) {
  const s = kvToMinutes(slot.start);
  if (s < 11 * 60) return 'asa';
  if (s < 16 * 60) return 'hiru';
  return 'yu';
}
function kvSlotMatchesDay(slot, weekday) {
  if (weekday === null || weekday === undefined) return true;
  if (!slot.days || !slot.days.length) return true;
  return slot.days.indexOf(weekday) >= 0;
}
function kvPlanCovers(slot, iso) {
  if (!iso) return true;
  if (slot.plan_from && slot.plan_from > iso) return false;
  if (slot.plan_to && slot.plan_to < iso) return false;
  return true;
}
function kvSameDays(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
function kvDaysPrefix(days) {
  if (!days || !days.length || days.length >= 7) return '';
  const set = days.slice().sort((a, b) => a - b);
  if (kvSameDays(set, [1, 2, 3, 4, 5])) return '平日';
  if (kvSameDays(set, [0, 6])) return '土日';
  if (kvSameDays(set, [1, 2, 3, 4, 5, 6])) return '月〜土';
  if (kvSameDays(set, [6])) return '土曜';
  if (kvSameDays(set, [0])) return '日曜';
  return set.map(d => KV_WEEKDAY_JA[d] || '').join('');
}
function kvSlotLabel(slot) {
  const periodJa = { asa: '朝', hiru: '昼', yu: '夕' }[kvSlotPeriod(slot)];
  return kvDaysPrefix(slot.days) + periodJa + ' ' + kvShortTime(slot.start) + '〜' + kvShortTime(slot.end);
}
function kvSlotsForUser(slots, userId) {
  return (slots || []).filter(s => Number(s.userId) === Number(userId)).sort((a, b) => kvToMinutes(a.start) - kvToMinutes(b.start));
}
function kvPickSlot(slots, userId, weekday, nowMin, iso) {
  const candidates = kvSlotsForUser(slots, userId).filter(s => kvPlanCovers(s, iso));
  if (!candidates.length) return null;
  const matching = candidates.filter(s => kvSlotMatchesDay(s, weekday));
  const pool = matching.length ? matching : candidates;
  let best = null, bestDist = Infinity;
  pool.forEach(s => {
    const d = kvSlotDistance(s, nowMin);
    if (d < bestDist) { best = s; bestDist = d; }
  });
  return { slot: best, weekdayMatched: matching.length > 0, candidates };
}
function kvSurname(name) {
  const s = String(name || '').trim();
  if (!s) return '';
  const sp = s.split(/[\s　]/)[0];
  if (sp !== s && sp.length >= 1 && sp.length <= 4) return sp;
  return s.length <= 4 ? s : s.slice(0, 2);
}
function kvSlotsFromSupplies(supplies, users) {
  const byId = {};
  (users || []).forEach(u => { byId[Number(u.id)] = u; });
  return (supplies || []).filter(s => s && s.start_time && s.end_time).map(s => {
    const u = byId[Number(s.user_id)] || {};
    const days = s.weekday == null || s.weekday === '' ? null : [Number(s.weekday)];
    return {
      userId: Number(s.user_id), user: u.name || '', kana: u.name_kana || '',
      building: String(s.building || '').trim(),
      start: String(s.start_time).slice(0, 5), end: String(s.end_time).slice(0, 5),
      days, content: s.content || '', service: s.service || '身体介護',
      plan_from: s.plan_from || null, plan_to: s.plan_to || null
    };
  });
}
function kvBuildingsFromSlots(slots) {
  const map = {};
  (slots || []).forEach(s => {
    if (!s.building || !s.user) return;
    if (!map[s.building]) map[s.building] = { key: s.building, ja: s.building, users: [] };
    if (!map[s.building].users.some(u => u.id === s.userId)) map[s.building].users.push({ id: s.userId, name: s.user, name_kana: s.kana || '' });
  });
  return Object.keys(map).sort((a, b) => a < b ? -1 : a > b ? 1 : 0).map(k => {
    const b = map[k];
    b.users.sort((a, c) => {
      const ms = id => Math.min.apply(null, slots.filter(s => s.building === k && s.userId === id).map(s => kvToMinutes(s.start)));
      return ms(a.id) - ms(c.id);
    });
    b.userIds = b.users.map(u => u.id);
    return b;
  });
}
function kvBandsForBuilding(slots, buildingKey) {
  const mine = (slots || []).filter(s => s.building === buildingKey);
  const by = {};
  mine.forEach(s => { const p = kvSlotPeriod(s); (by[p] = by[p] || []).push(s); });
  return KV_BANDS.filter(b => by[b.period] && by[b.period].length).map(b => {
    if (b.period !== 'hiru') return { key: b.key, ja: b.ja, pt: b.pt, period: b.period, weekendOnly: false };
    const weekendOnly = by.hiru.every(s => s.days && s.days.length && s.days.every(d => d === 0 || d === 6));
    return weekendOnly ? { key: 'hiru', ja: '土日昼', pt: 'Almoço (sáb/dom)', period: 'hiru', weekendOnly: true } : { key: b.key, ja: b.ja, pt: b.pt, period: b.period, weekendOnly: false };
  });
}
function kvBandMatchesSlot(band, slot) {
  if (!band || kvSlotPeriod(slot) !== band.period) return false;
  if (band.weekendOnly) return !!(slot.days && slot.days.length && slot.days.every(d => KV_WEEKEND.indexOf(d) >= 0));
  return true;
}
function kvBuildingEntries(slots, building, bandKey, weekday, iso) {
  if (!building) return [];
  const band = kvBandsForBuilding(slots, building.key).filter(b => b.key === bandKey)[0];
  if (!band) return [];
  const out = [];
  building.users.forEach((user, order) => {
    const slot = (slots || []).filter(s => s.building === building.key && Number(s.userId) === Number(user.id) && kvBandMatchesSlot(band, s) && kvSlotMatchesDay(s, weekday) && kvPlanCovers(s, iso)).sort((a, b) => kvToMinutes(a.start) - kvToMinutes(b.start))[0];
    if (slot) out.push({ user, slot, order });
  });
  out.sort((a, b) => (kvToMinutes(a.slot.start) - kvToMinutes(b.slot.start)) || (a.order - b.order));
  return out.map(e => ({ user: e.user, slot: e.slot }));
}
function kvPickBuildingBand(slots, building, weekday, nowMin, iso) {
  if (!building) return 'asa';
  const bands = kvBandsForBuilding(slots, building.key);
  if (!bands.length) return 'asa';
  let bestKey = bands[0].key, bestDist = Infinity, found = false;
  bands.forEach(b => {
    if (b.weekendOnly && weekday !== null && weekday !== undefined && KV_WEEKEND.indexOf(weekday) < 0) return;
    const entries = kvBuildingEntries(slots, building, b.key, weekday, iso);
    if (!entries.length) return;
    const starts = entries.map(e => kvToMinutes(e.slot.start));
    const ends = entries.map(e => kvToMinutes(e.slot.end));
    const span = { start: kvMinutesToHHMM(Math.min.apply(null, starts)), end: kvMinutesToHHMM(Math.max.apply(null, ends)) };
    const d = kvSlotDistance(span, nowMin);
    if (d < bestDist) { bestDist = d; bestKey = b.key; found = true; }
  });
  return found ? bestKey : bands[0].key;
}
function kvWeekStart(iso) {
  const wd = kvWeekdayFromISO(iso);
  if (wd === null) return iso;
  return kvAddDays(iso, -((wd + 6) % 7));
}
function kvIsoShortLabel(iso) {
  const p = String(iso || '').split('-');
  if (p.length < 3) return iso || '';
  const wd = kvWeekdayFromISO(iso);
  return (+p[1]) + '/' + (+p[2]) + '（' + (KV_WEEKDAY_JA[wd] || '') + '）';
}
function kvWeekRangeLabel(weekStart) { return kvIsoShortLabel(weekStart) + '〜 ' + kvIsoShortLabel(kvAddDays(weekStart, 6)); }
function kvInitialStaff(isNew, stored, me) {
  if (!isNew) return stored == null ? '' : String(stored);
  return String(me || '').trim();
}
function kvReportStored(nc, text) {
  const t = String(text || '').trim();
  if (nc) return t ? '変化なし（' + t + '）' : '変化なし';
  return t || null;
}
function kvWriteErrors(p) {
  const errs = [];
  if (!p || !p.visit_date) errs.push('提供日');
  if (!p || !p.user_id) errs.push('利用者');
  if (!p || !p.start_time || !p.end_time) errs.push('時間');
  else if (String(p.end_time) <= String(p.start_time)) errs.push('終了は開始より後');
  if (p && (p.signer === '本人' || p.signer === 'ご家族') && !p.signature) errs.push('署名');
  if (p && p.signer === '署名困難' && !String(p.sign_reason || '').trim()) errs.push('理由');
  return errs;
}
function kvVisitBody(p) {
  const staff = String(p.staff_name || '').trim();
  const later = p.signer === 'あとで署名' || !p.signer;
  const unable = p.signer === '署名困難';
  const signNow = !later;
  const b = {
    visit_date: p.visit_date, user_id: p.user_id, staff_name: staff || null,
    service: p.service || '身体介護', start_time: p.start_time, end_time: p.end_time,
    content: String(p.content || '').trim() || null, note: String(p.note || '').trim() || null,
    report1: p.report1 || null, report2: p.report2 || null, report3: p.report3 || null, report4: p.report4 || null, report5: p.report5 || null,
    sign_status: signNow ? '署名済み' : '未署名', late_signed: later ? 'はい' : 'いいえ',
    signer_kind: signNow ? (p.signer || null) : null,
    sign_reason: unable ? (String(p.sign_reason || '').trim() || null) : null,
    staff_confirmed: !!p.ack, updated_at: p.updated_at
  };
  if (p.recorded_at) b.recorded_at = p.recorded_at;
  if (signNow && p.signed_at) b.signed_at = p.signed_at;
  if (p.ack && p.confirmed_at) b.staff_confirmed_at = p.confirmed_at;
  if (signNow && p.signature) b.signature_png = p.signature;
  if (p.instruction_ready) b.instruction_id = p.instruction_id;
  return b;
}
function kvPendingLater(rows, userName, weekStart) {
  const weekEnd = kvAddDays(weekStart, 6);
  return (rows || []).filter(v => v && v.sign_status !== '署名済み' && v.late_signed === 'はい' && v.userName === userName && v.visit_date >= weekStart && v.visit_date <= weekEnd)
    .sort((a, b) => a.visit_date < b.visit_date ? -1 : a.visit_date > b.visit_date ? 1 : String(a.start_time).localeCompare(String(b.start_time)));
}
function kvPendingSummary(rows, todayIso) {
  const thisWs = kvWeekStart(todayIso);
  const lastWs = kvAddDays(thisWs, -7);
  const buckets = { thisWeek: {}, lastWeek: {}, other: {} };
  (rows || []).forEach(v => {
    if (!v || v.sign_status === '署名済み' || v.late_signed !== 'はい' || !v.visit_date) return;
    const ws = kvWeekStart(v.visit_date);
    const key = ws === thisWs ? 'thisWeek' : ws === lastWs ? 'lastWeek' : 'other';
    const e = buckets[key][v.userName] || (buckets[key][v.userName] = { userName: v.userName, count: 0, weekStart: ws });
    e.count++;
    if (ws < e.weekStart) e.weekStart = ws;
  });
  const users = o => Object.keys(o).map(k => o[k]).sort((a, b) => a.userName < b.userName ? -1 : 1);
  return { thisWeek: { weekStart: thisWs, users: users(buckets.thisWeek) }, lastWeek: { weekStart: lastWs, users: users(buckets.lastWeek) }, other: { users: users(buckets.other) } };
}
/* /kv-pure */
function kvCss() {
  return `<style>
.kv-wrap{max-width:720px;margin:0 auto}
.kv-card{background:#fff4dc;color:#1c140c;border:4px solid #1a120c;border-radius:0;padding:28px 24px;box-shadow:6px 6px 0 #07060a}
.kv-title{text-align:center;color:#0d6efd;font-size:1.6em;font-weight:700;margin:0 0 4px}
.kv-sub{text-align:center;color:#6c757d;font-size:.85em;margin:0 0 24px}
.kv-field{margin:0 0 22px}
.kv-lab{font-weight:700;font-size:1.15em;margin:0 0 8px;line-height:1.4}
.kv-pt{display:block;font-weight:400;color:#6c757d;font-size:.78em;margin-top:2px}
.kv-req{display:inline-block;margin-left:8px;padding:2px 8px;border-radius:0;border:2px solid #1a120c;background:#ffe8e8;color:#c62828;font-size:.7em;font-weight:700;vertical-align:middle}
.kv-card input[type=text],.kv-card input[type=date],.kv-card input[type=time],.kv-card input[type=month],.kv-card select,.kv-ta,
.kv-admin input[type=text],.kv-admin input[type=date],.kv-admin select,.kv-admin .kv-ta{
  width:100%;box-sizing:border-box;font-size:1.25em;padding:16px 14px;border:3px solid #1a120c;border-radius:0;line-height:1.4;min-height:3.2em;background:#fffef8}
.kv-ta{min-height:6em;resize:vertical;font-family:inherit}
.kv-row{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media(max-width:640px){.kv-row{grid-template-columns:1fr}}
.kv-hint{color:#6c757d;font-size:.9em;margin:6px 0 0}
.kv-actions{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-top:8px}
.kv-actions button{font-size:1.2em;padding:16px 28px;border-radius:0}
.kv-save{background:#0d6efd;color:#fff;border:none;font-weight:700;width:100%}
.kv-check{display:flex;flex-wrap:wrap;gap:20px;font-size:1.15em;margin:12px 0}
.kv-check label{display:flex;align-items:center;gap:8px;font-weight:600}
.kv-check input{width:1.4em;height:1.4em}
.kv-sv{border:4px solid #1a120c;background:#ffe7c2;padding:14px 12px;margin:0 0 22px;box-shadow:4px 4px 0 #07060a}
.kv-sv-title{font-weight:700;font-size:1.15em;color:#8a3b00;margin:10px 0 6px}
.kv-sv-title:first-child{margin-top:0}
.kv-instr{background:#fffef8;border:3px solid #1a120c;border-left:8px solid #e8833a;padding:10px 12px;margin:0 0 8px}
.kv-instr-body{font-size:1.15em;font-weight:700;white-space:pre-wrap;word-break:break-word}
.kv-empty,.kv-prev{background:#fffef8;border:3px solid #1a120c;padding:10px 12px}
.kv-prev-row{padding:4px 0}
.kv-prev-lab{display:block;color:#546e7a;font-size:.8em}
.kv-prev .chg{font-weight:700;color:#9b1c1c}
.kv-admin{margin-top:18px}
.kv-admin .kv-instr button{width:auto;margin-top:8px}
</style>`;
}
const kvIn = (id, v, t = 'text', ex = '') => `<input id="${id}" type="${t}" value="${esc(v ?? '')}" ${ex}>`;
const kvV = id => { const v = $(id).value.trim(); return v === '' ? null : v; };
const kvSched = () => `<a class="back" href="gl:g23" style="display:inline-block;text-decoration:none">📅 土日スケジュール</a>`;
const kvPt = s => `<span class="kv-pt">${s}</span>`;
const kvReq = () => `<span class="kv-req">必須</span>`;
const kvLab = (ja, pt, req) => `<div class="kv-lab">${ja}${req ? kvReq() : ''}${pt ? kvPt(pt) : ''}</div>`;
const kvToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
let kvCtxSeq = 0;

async function renderKinVisit() {
  if (KV.id === 'new') { location.hash = 'kintoun/write'; return; }
  const back = `<button class="back" onclick="location.hash='kintoun'">← 金斗雲へ</button>`;
  if (DEMO) { $('view').innerHTML = back + `<p>見本モードでは訪問記録は表示しません（ログイン後に開きます）。</p><p>${kvSched()}</p>`; return; }
  $('view').innerHTML = '<p>読み込み中…</p>';
  try {
    $('view').innerHTML = back + (KV.id ? await kvForm(KV.id) : await kvList());
    if (KV.id) kvPaintInstr();
  } catch (e) { $('view').innerHTML = back + `<p>${esc(e.message)}</p>`; }
}
async function kvList() {
  const m = KV.month, next = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 1)).toISOString().slice(0, 10);
  const [vs, us, ins] = await Promise.all([
    sb(`kin_visit?visit_date=gte.${m}-01&visit_date=lt.${next}&select=*&order=visit_date.desc,start_time`),
    sb('kin_user?select=id,name&order=name'),
    sb('kin_instruction?select=*&order=id').catch(() => null)
  ]);
  KV.users = us; KV.instructions = ins || []; KV.instrMissing = ins === null;
  const nm = Object.fromEntries(us.map(u => [u.id, u.name]));
  const rows = vs.map(v => `<tr><td>${esc(v.visit_date)}</td><td>${esc(nm[v.user_id] || '')}</td><td>${v.staff_name ? esc(v.staff_name) : '<span style="color:#c60">（未入力）</span>'}</td><td>${esc(v.service)}</td><td>${esc(v.start_time.slice(0, 5))}〜${esc(v.end_time.slice(0, 5))}</td><td>${v.actual_minutes}分</td><td>${esc(v.addition || '')}</td><td>${v.sign_status === '署名済み' ? '✅' : '⬜未署名'}</td><td>${v.staff_confirmed ? '職✔' : ''}${v.sab_confirmed ? ' サ✔' : ''}</td><td><button onclick="KV.id=${v.id};renderKinVisit()">開く</button></td></tr>`).join('');
  return `<h3>今月の記録</h3><p>月 <input type="month" id="kv_m" value="${esc(m)}" onchange="KV.month=this.value||KV.month;renderKinVisit()"> <a class="back" href="#kintoun/write">＋記録を書く</a> <button class="back" onclick="location.hash='kintoun/check'">✅記録・署名チェック／署名リンク発行へ</button> ${kvSched()}</p>` +
    (vs.length ? `<table class="tbl"><tr><th>提供日</th><th>利用者</th><th>職員</th><th>種別</th><th>時間</th><th>実時間</th><th>加算</th><th>署名</th><th>確認</th><th></th></tr>${rows}</table><p>${vs.length}件／未署名 ${vs.filter(v => v.sign_status !== '署名済み').length}件</p>` : '<p>この月の記録はありません。</p>') +
    kvCss() + kvInstrAdmin(us, ins);
}
function kvInstrAdmin(us, ins) {
  if (ins === null) return `<div class="card kv-admin"><b>サ責からの指示</b><p class="kv-hint">指示の表がまだありません。supabase/kin_instruction.sql を適用すると、ここで登録できます。ヘルパーの記入欄にはなりません。</p></div>`;
  const today = kvToday();
  const nm = Object.fromEntries(us.map(u => [u.id, u.name]));
  const opts = `<option value="">全員</option>` + us.map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('');
  const card = i => {
    const st = kvInstructionStatus(i, today);
    const who = i.target_user_id == null ? '全員' : (nm[i.target_user_id] || ('利用者' + i.target_user_id));
    const period = `${i.start_date || '開始日なし'}〜${i.end_date || '継続'}`;
    const end = st === '終了' || !/^SJ-\d+$/.test(i.id) ? '' : ` <button class="back" onclick="kvEndInstr('${i.id}')">終了</button>`;
    return `<div class="kv-instr"><div class="kv-instr-body">${esc(i.content)}</div><div class="kv-hint">${esc(i.id)}・${esc(who)}・${esc(period)}・${esc(st)}・${esc(i.instructed_by || '')}</div>${end}</div>`;
  };
  const live = ins.filter(i => kvInstructionStatus(i, today) !== '終了');
  const ended = ins.filter(i => kvInstructionStatus(i, today) === '終了');
  return `<details class="kv-admin"><summary>サ責からの指示（登録・終了）</summary>
    <p class="kv-hint">ヘルパーの訪問記録では<b>表示だけ</b>です。毎回書かせません。内容が変わったときだけ、ここで登録するか、今の指示を終了して新しく登録します。指示者は ${esc(KV_SV_NAME)}（固定）です。</p>
    <div class="kv-field">${kvLab('対象', '')}<select id="ki_target">${opts}</select></div>
    <div class="kv-row">
      <div class="kv-field">${kvLab('有効開始日', '')}${kvIn('ki_start', today, 'date')}</div>
      <div class="kv-field">${kvLab('有効終了日（空なら継続）', '')}${kvIn('ki_end', '', 'date')}</div>
    </div>
    <div class="kv-field">${kvLab('指示内容', '')}<textarea id="ki_content" class="kv-ta" rows="3" maxlength="2000" placeholder="例: 水分をこまめにすすめる"></textarea></div>
    <p><button onclick="kvAddInstr()">この指示を登録する</button> <span id="ki_msg" class="kv-hint"></span></p>
    ${live.length ? live.map(card).join('') : '<p class="note">有効な指示はありません（ヘルパー画面には「指示なし」と出ます）</p>'}
    ${ended.length ? `<details><summary>終了した指示（${ended.length}件）</summary>${ended.map(card).join('')}</details>` : ''}
  </details>`;
}
async function kvAddInstr() {
  const msg = $('ki_msg'); if (!msg) return;
  const content = $('ki_content').value.trim();
  const target = $('ki_target').value;
  const start = $('ki_start').value || kvToday();
  const end = $('ki_end').value;
  if (!content) { msg.textContent = '指示内容を入力してください'; return; }
  if (end && end < start) { msg.textContent = '有効終了日が開始日より前になっています'; return; }
  const who = target ? ($('ki_target').selectedOptions[0] || {}).textContent : '全員';
  if (!confirm(`この指示を登録します（指示者：${KV_SV_NAME}）\n対象：${who}\n期間：${start} 〜 ${end || '継続'}`)) return;
  const id = kvNextInstructionId(KV.instructions);
  try {
    await sb('kin_instruction', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ id, target_user_id: target ? +target : null, start_date: start, end_date: end || null, content: content.slice(0, 2000), instructed_by: KV_SV_NAME }) });
    renderKinVisit();
  } catch (e) { msg.textContent = e.message; }
}
async function kvEndInstr(id) {
  const ins = (KV.instructions || []).find(x => x.id === id);
  if (!ins) return;
  if (!confirm(`指示 ${id} を終了します。今日からヘルパー画面に出なくなります。よろしいですか？`)) return;
  const today = kvToday();
  try {
    await sb(`kin_instruction?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ end_date: kvEndDate(ins, today), ended_at: new Date().toISOString() }) });
    renderKinVisit();
  } catch (e) { alert(e.message); }
}
async function kvForm(id) {
  const [us, vs, ins] = await Promise.all([
    sb('kin_user?select=id,name&order=name'),
    id === 'new' ? Promise.resolve([{}]) : sb(`kin_visit?id=eq.${id}&select=*`),
    sb('kin_instruction?select=*&order=id').catch(() => null)
  ]);
  const v = vs[0]; if (!v) return '<p>見つかりません</p>';
  KV.users = us; KV.instructions = ins || []; KV.instrMissing = ins === null; KV.visit = v; KV.ctx = null;
  const today = kvToday();
  const reports = KV_REPORT.map(r => `<div class="kv-field">${kvLab(r.ja, r.pt)}<textarea id="kv_${r.k}" class="kv-ta" rows="3">${esc(v[r.k] ?? '')}</textarea></div>`).join('');
  return kvCss() + `<div class="kv-wrap"><div class="kv-card">
  <h3 class="kv-title">サービス実施記録入力</h3>
  <p class="kv-sub">Registro de prestação de serviço${id === 'new' ? '（新規）' : ''}</p>

  <div class="kv-field">${kvLab('サービス提供日', 'Data do serviço', true)}${kvIn('kv_visit_date', v.visit_date || today, 'date', 'onchange="kvPaintInstr()"')}</div>
  <div class="kv-field">${kvLab('担当ヘルパー名', 'Nome do cuidador')}${kvIn('kv_staff_name', v.staff_name)}<p class="kv-hint">空欄のまま保存できます</p></div>
  <div class="kv-field">${kvLab('利用者氏名', 'Nome do usuário', true)}<select id="kv_user_id" onchange="kvPaintInstr()">${us.map(u => `<option value="${u.id}" ${u.id === v.user_id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></div>

  <div class="kv-sv" id="kv_sv">
    <div class="kv-sv-title">サ責からの指示${kvPt('Instruções da responsável')}</div>
    <div id="kv_instr"><p class="kv-hint">読み込み中…</p></div>
    <div class="kv-sv-title">前回の報告${kvPt('Último relatório')}</div>
    <div id="kv_prev">—</div>
    <p class="kv-hint" id="kv_sv_note"></p>
  </div>

  <div class="kv-field">${kvLab('サービス区分', 'Tipo de serviço', true)}<select id="kv_service">${KL_SVC.map(s => `<option ${s === (v.service || '身体介護') ? 'selected' : ''}>${s}</option>`).join('')}</select></div>

  <div class="kv-row">
    <div class="kv-field">${kvLab('開始時間', 'Horário de início', true)}${kvIn('kv_start_time', (v.start_time || '').slice(0, 5), 'time', 'onchange="kvPaintInstr()"')}</div>
    <div class="kv-field">${kvLab('終了時間', 'Horário de término', true)}${kvIn('kv_end_time', (v.end_time || '').slice(0, 5), 'time')}</div>
  </div>
  <div class="kv-field">${kvLab('実時間（自動）', 'Duração')}<input value="${v.actual_minutes != null ? v.actual_minutes + '分' : '保存時に自動計算'}" disabled></div>

  <div class="kv-field">${kvLab('具体的な提供内容', 'Conteúdo do serviço', true)}<textarea id="kv_content" class="kv-ta" rows="5" placeholder="例: 整容・食事支援、入浴介助">${esc(v.content ?? '')}</textarea></div>
  <div class="kv-field">${kvLab('特記事項・申し送り', 'Observações / encaminhamento')}<textarea id="kv_note" class="kv-ta" rows="3">${esc(v.note ?? '')}</textarea></div>

  <div class="kv-field"><div class="kv-lab">訪問後の報告（サ責へ）${kvPt('Relatório após a visita')}</div>
    <p class="kv-hint">変わりがなければ「変化なし」と書いてください。気づいたことがあれば具体的に。</p></div>
  ${reports}

  <div class="kv-field">${kvLab('加算', 'Adicionais')}${kvIn('kv_addition', v.addition)}<p class="kv-hint">緊急時対応・初回加算など</p></div>
  <div class="kv-field">${kvLab('署名困難の理由', 'Motivo (não consegue assinar)')}${kvIn('kv_sign_reason', v.sign_reason)}</div>
  <div class="kv-field">${kvLab('後日署名', 'Assinar depois')}${kvIn('kv_late_signed', v.late_signed)}</div>

  <p style="font-size:1.1em">署名：${v.sign_status || '未署名'}${v.signed_at ? '（' + esc(new Date(v.signed_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })) + '／' + esc(v.signer_kind || '') + '）' : ''}</p>
  <div class="kv-check">
    <label><input type="checkbox" id="kv_staff_confirmed" ${v.staff_confirmed ? 'checked' : ''}> 職員確認</label>
    <label><input type="checkbox" id="kv_sab_confirmed" ${v.sab_confirmed ? 'checked' : ''}> サ責確認</label>
  </div>
  <p class="note">入力日時：${esc(v.recorded_at ? new Date(v.recorded_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '')}／職員確認日時：${esc(v.staff_confirmed_at ? new Date(v.staff_confirmed_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '')}／サ責確認：${esc(v.sv_confirm_1 || '')} ${esc(v.sv_confirm_2 ? new Date(v.sv_confirm_2).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '')} ${esc(v.sv_confirm_3 || '')}${v.signature_url ? ` ／<a href="${esc(v.signature_url)}" target="_blank" rel="noopener">署名画像</a>` : ''}${v.pdf_url ? ` <a href="${esc(v.pdf_url)}" target="_blank" rel="noopener">PDF</a>` : ''}</p>

  <div class="kv-actions"><button class="kv-save" onclick="kvSave('${id}')">保存する</button></div>
  <div class="kv-actions" style="margin-top:16px">
    <button class="back" onclick="KV.id=null;renderKinVisit()">一覧へ</button>
    ${id !== 'new' ? `<button class="back" onclick="kvDel(${id})">削除</button>` : ''}
    <span id="kv_msg"></span>
  </div>
</div></div>`;
}
function kvInstrHtml(list) {
  if (!list.length) return '<div class="kv-empty">今は指示がありません（「指示なし」で記録します）<span class="kv-pt">Sem instruções no momento.</span></div>';
  return list.map(i => {
    const who = i.target_user_id == null || i.target_user_id === '' ? '・全員 / Todos' : '';
    const period = (i.start_date || '') + '〜' + (i.end_date || '継続');
    return `<div class="kv-instr"><div class="kv-instr-body">${esc(i.content)}</div><div class="kv-hint">${esc(i.id)}${who}・${esc(period)}・${esc(i.instructed_by || '')}</div></div>`;
  }).join('');
}
function kvPrevHtml(p) {
  if (!p) return '<div class="kv-prev">前回の報告はありません<span class="kv-pt">Sem relatório anterior.</span></div>';
  const when = `${(p.visit_date || '').slice(5).replace('-', '/')} ${(p.start_time || '').slice(0, 5)}〜${(p.end_time || '').slice(0, 5)}・${p.staff_name || ''}`;
  const rows = KV_REPORT.map(r => {
    const val = p[r.k] || '';
    return `<div class="kv-prev-row"><span class="kv-prev-lab">${esc(r.ja)} / ${esc(r.pt)}</span><span class="${val && val !== '変化なし' ? 'chg' : ''}">${esc(val || '—')}</span></div>`;
  }).join('');
  const cmt = p.sv_confirm_3 ? `<div class="kv-prev-row"><span class="kv-prev-lab">サ責コメント / Comentário da responsável</span><b>${esc(p.sv_confirm_3)}</b></div>` : '';
  return `<div class="kv-prev"><div class="kv-hint">${esc(when)}</div>${rows}${cmt}</div>`;
}
async function kvPaintInstr() {
  const seq = ++kvCtxSeq;
  const box = $('kv_instr'), prev = $('kv_prev'), note = $('kv_sv_note');
  if (!box || !prev) return;
  const uid = +($('kv_user_id') && $('kv_user_id').value);
  const date = ($('kv_visit_date') && $('kv_visit_date').value) || '';
  const start = ($('kv_start_time') && $('kv_start_time').value) || '';
  if (!uid || !date) {
    KV.ctx = { ready: false, value: null };
    box.innerHTML = '<p class="kv-hint">利用者と提供日を選ぶと、サ責からの指示と前回の報告が出ます。</p>';
    prev.textContent = '—';
    if (note) note.textContent = '';
    return;
  }
  if (KV.instrMissing) {
    KV.ctx = { ready: false, value: null };
    box.innerHTML = '<div class="kv-empty">指示の表がまだありません。一覧の登録は、SQL適用後に使えます。この欄は記入しません。</div>';
    if (note) note.textContent = '';
  } else {
    const active = kvActiveInstructions(KV.instructions, uid, date);
    const value = kvInstructionIdValue(active);
    KV.ctx = { ready: true, value };
    box.innerHTML = kvInstrHtml(active);
    if (note) {
      const stored = KV.visit && KV.visit.instruction_id;
      if (KV.id === 'new') note.textContent = '表示だけです。毎回書く必要はありません。保存すると、上の指示IDが自動で記録されます。';
      else if (!stored) note.textContent = 'この記録には確認した指示IDがありません。上は、その提供日に有効な指示です（保存しても指示IDは書き換えません）。';
      else if (stored === value) note.textContent = '確認した指示ID：' + stored + '。この欄は表示だけで、保存しても書き換えません。';
      else note.textContent = 'この記録の確認ID：' + stored + '。上は、その提供日にいま有効な指示です（保存しても確認IDは書き換えません）。';
    }
  }
  prev.innerHTML = '<p class="kv-hint">読み込み中…</p>';
  try {
    const rows = await sb(`kin_visit?user_id=eq.${uid}&visit_date=lte.${date}&select=id,visit_date,start_time,end_time,staff_name,report1,report2,report3,report4,report5,sv_confirm_3&order=visit_date.desc,start_time.desc&limit=12`);
    if (seq !== kvCtxSeq) return;
    prev.innerHTML = kvPrevHtml(kvPreviousVisit(rows, KV.id, date, start));
  } catch (e) {
    if (seq !== kvCtxSeq) return;
    prev.innerHTML = `<p class="kv-hint">${esc(e.message)}</p>`;
  }
}
async function kvSave(id) {
  const b = { visit_date: kvV('kv_visit_date'), user_id: +$('kv_user_id').value, staff_name: kvV('kv_staff_name'), service: $('kv_service').value, start_time: kvV('kv_start_time'), end_time: kvV('kv_end_time'), staff_confirmed: $('kv_staff_confirmed').checked, sab_confirmed: $('kv_sab_confirmed').checked, updated_at: new Date().toISOString() };
  ['addition', 'sign_reason', 'late_signed', 'content', 'note', 'report1', 'report2', 'report3', 'report4', 'report5'].forEach(k => b[k] = kvV('kv_' + k));
  if (id === 'new' && KV.ctx && KV.ctx.ready) b.instruction_id = KV.ctx.value;
  if (!b.visit_date || !b.start_time || !b.end_time) return $('kv_msg').textContent = '提供日・開始・終了は必須です';
  if (b.end_time <= b.start_time) return $('kv_msg').textContent = '終了は開始より後にしてください（日またぎは不可）';
  try { await sb(id === 'new' ? 'kin_visit' : `kin_visit?id=eq.${id}`, { method: id === 'new' ? 'POST' : 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(b) }); KV.id = null; renderKinVisit(); } catch (e) { $('kv_msg').textContent = e.message; }
}
async function kvDel(id) { if (!confirm('この訪問記録を削除しますか？')) return; try { await sb(`kin_visit?id=eq.${id}`, { method: 'DELETE' }); KV.id = null; renderKinVisit(); } catch (e) { alert(e.message); } }
// 記録記入（#kintoun/write）。見た目と操作は GAS index v13.6 のヘルパー画面。データは kin_user / kin_supply / kin_visit。
const KW = { me: '', users: [], slots: [], buildings: [], instructions: [], instrMissing: false, records: {}, ctx: {}, cardUser: {}, userToCard: {}, building: 0, band: null, bandManual: false, chipSlots: [], pending: [], laterIds: [], laterById: {} };
const KV_GAS_SVC = [['身体介護', 'Cuidados pessoais'], ['家事援助', 'Ajuda doméstica'], ['通院等介助', 'Acompanhamento médico']];
const KV_GAS_PT = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
let kvGasSeq = 0;
function kvStoreGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function kvStoreSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
async function kvStaffName() {
  if (typeof DEMO !== 'undefined' && DEMO) return (typeof DEMO_DATA !== 'undefined' && DEMO_DATA.me) || '';
  const q = typeof leoMyProfileQ === 'function' ? leoMyProfileQ('full_name,nikki_name') : 'staff_profiles?select=full_name,nikki_name';
  try {
    const p = await sb(q);
    const r = (p && p[0]) || {};
    return String(r.full_name || '').trim() || String(r.nikki_name || '').trim();
  } catch (e) {
    try { if (typeof myName === 'function') return String((await myName()) || '').trim(); } catch (_) { }
    return '';
  }
}
function kvGasCss() {
  return `<style>
.kv-gas{max-width:600px;margin:0 auto;background:#f4f7f6;color:#212529;padding:8px 4px 28px;border-radius:12px;font-size:15px;line-height:1.45}
.kv-gas,.kv-gas *{font-family:system-ui,"Hiragino Sans","Noto Sans JP",sans-serif !important;box-sizing:border-box}
.kv-gas [hidden]{display:none !important}
.kv-gas section{background:transparent !important;color:#212529 !important;border:0 !important;box-shadow:none !important;border-radius:0 !important;padding:0 !important;margin:0 !important}
.kv-gas h3,.kv-gas h4{color:#0d6efd !important;text-shadow:none !important;border:0 !important;margin:0;font-size:1.45rem !important;width:auto !important;max-width:none !important}
.kv-gas .gas-card{background:#fff;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,.08);padding:18px 16px 22px;border:none}
.kv-gas .gas-sub{text-align:center;color:#6c757d;font-size:13px;margin:0 0 16px}
.kv-gas .gas-title{text-align:center;font-weight:700;margin-bottom:2px}
.kv-gas .gas-lab{display:block;font-weight:700;margin:0 0 6px;font-size:15px}
.kv-gas .gas-pt{display:block;font-weight:400;color:#607d8b;font-size:12px;margin-top:2px}
.kv-gas .gas-req{display:inline-block;margin-left:6px;background:#e53935;color:#fff;font-size:11px;padding:2px 6px;border-radius:4px;font-weight:700}
.kv-gas .gas-in,.kv-gas select.gas-in,.kv-gas textarea.gas-in{width:100% !important;min-height:48px;font-size:16px !important;padding:10px 12px;border:1px solid #ced4da !important;border-radius:8px !important;background:#fff !important;color:#212529 !important;box-shadow:none !important;margin:0 !important}
.kv-gas textarea.gas-in{min-height:88px}
.kv-gas .gas-field{margin:0 0 14px}
.kv-gas .gas-hint{color:#6c757d;font-size:13px;margin:6px 0 0}
.kv-gas .gas-row{display:flex;gap:8px}
.kv-gas .gas-row > div{flex:1;min-width:0}
.kv-gas button{width:auto !important;margin:0 !important;border-radius:8px !important;box-shadow:none !important;text-shadow:none !important;transform:none !important;font-size:14px !important;cursor:pointer}
.kv-gas button:active{transform:none !important;box-shadow:none !important}
.kv-gas .gas-group{display:flex;width:100%;margin:0 0 8px}
.kv-gas .gas-check{position:absolute;opacity:0;width:1px !important;height:1px;pointer-events:none}
.kv-gas .gas-btn{flex:1;text-align:center;border:1px solid #0d6efd;background:#fff;color:#0d6efd;padding:10px 4px;font-weight:700;line-height:1.25;border-radius:0;margin:0}
.kv-gas .gas-group .gas-btn:first-of-type{border-radius:8px 0 0 8px}
.kv-gas .gas-group .gas-btn:last-of-type{border-radius:0 8px 8px 0}
.kv-gas .gas-group .gas-btn:first-of-type:last-of-type{border-radius:8px}
.kv-gas .gas-check:checked + .gas-btn{background:#0d6efd;color:#fff}
.kv-gas .gas-check:checked + .gas-btn .gas-pt{color:rgba(255,255,255,.9)}
.kv-gas .gas-btn.ok{border-color:#198754;color:#198754}
.kv-gas .gas-check:checked + .gas-btn.ok{background:#198754;color:#fff;border-color:#198754}
.kv-gas .gas-go{width:100% !important;background:#0d6efd;color:#fff;border:0;font-weight:700;padding:14px 10px;font-size:18px !important;border-radius:8px !important;margin-top:8px !important}
.kv-gas .gas-go.ok{background:#198754}
.kv-gas .gas-go:disabled{opacity:.55}
.kv-gas .gas-now{width:100% !important;margin-top:6px !important;background:#fff;color:#0d6efd;border:1px solid #0d6efd;padding:8px 4px;line-height:1.2}
.kv-gas .gas-chip{border-radius:999px !important;padding:8px 14px;font-weight:700;background:#fff;color:#0d6efd;border:1px solid #0d6efd;margin:0 8px 8px 0 !important}
.kv-gas .gas-chip.on{background:#0d6efd;color:#fff}
.kv-gas .gas-chip.off{border-style:dashed;opacity:.75}
.kv-gas .gas-note{background:#cff4fc;border:1px solid #b6effb;border-radius:8px;padding:8px 12px;font-size:13px;margin:0 0 12px}
.kv-gas .gas-note.warn{background:#fff3cd;border-color:#ffecb5}
.kv-gas .gas-note.muted{background:#e9ecef;border-color:#dee2e6}
.kv-gas .gas-note.good{background:#d1e7dd;border-color:#badbcc}
.kv-gas .person{border:2px solid #e3f2fd;border-radius:12px;margin:0 0 14px;background:#fff;overflow:hidden}
.kv-gas .person.skipped{opacity:.6}
.kv-gas .person.skipped .person-body,.kv-gas .person.sent .person-body,.kv-gas .person.sent .skip-row{display:none}
.kv-gas .person.sent{border-color:#43a047}
.kv-gas .person.failed{border-color:#e53935}
.kv-gas .person-h{padding:10px 12px 8px}
.kv-gas .person-body{padding:0 12px 12px}
.kv-gas .gas-badge{display:inline-block;background:#0d6efd;color:#fff;border-radius:6px;padding:2px 8px;font-weight:700;margin-right:6px}
.kv-gas .gas-badge.ok{background:#198754}
.kv-gas .gas-badge.ng{background:#dc3545}
.kv-gas .sv-panel{border:2px solid #ffcc80;background:#fff8e1;border-radius:10px;padding:10px 12px;margin:0 0 14px}
.kv-gas .sv-h{font-weight:700;font-size:16px;color:#e65100;margin:8px 0 4px}
.kv-gas .sv-h:first-child{margin-top:0}
.kv-gas .instr-item{background:#fff;border-left:5px solid #fb8c00;border-radius:6px;padding:8px 10px;margin-bottom:6px}
.kv-gas .instr-content{font-size:17px;font-weight:700;white-space:pre-wrap;word-break:break-word}
.kv-gas .ack{display:block;width:100%;text-align:center;border:1px solid #dc3545;color:#dc3545;background:#fff;font-weight:700;font-size:17px !important;padding:12px 8px;border-radius:8px !important}
.kv-gas .gas-check:checked + .ack{background:#2e7d32;border-color:#2e7d32;color:#fff}
.kv-gas .ack .on{display:none}
.kv-gas .gas-check:checked + .ack .on{display:inline}
.kv-gas .gas-check:checked + .ack .off{display:none}
.kv-gas .rep{border:2px solid #c8e6c9;border-radius:10px;padding:10px 12px;background:#f9fdf9;margin:0 0 14px}
.kv-gas .rep-item + .rep-item{border-top:1px dashed #c8e6c9;margin-top:8px;padding-top:8px}
.kv-gas .nc{border:1px solid #198754;color:#198754;background:#fff;font-weight:700;padding:8px 10px;border-radius:8px !important;min-width:44%}
.kv-gas .gas-check:checked + .nc{background:#198754;color:#fff}
.kv-gas .rep-line{display:flex;gap:8px;align-items:stretch}
.kv-gas .rep-line .gas-in{flex:1}
.kv-gas .signer .gas-btn{display:block;width:100%;text-align:left;border-radius:8px !important;margin:0 0 8px;padding:10px 12px}
.kv-gas .gas-canvas{position:relative;height:220px;border:2px dashed #90caf9;border-radius:8px;background:#fff;touch-action:none}
.kv-gas .gas-canvas canvas{width:100%;height:100%;display:block;touch-action:none}
.kv-gas .gas-clear{position:absolute;top:6px;right:6px;background:#fff;color:#6c757d;border:1px solid #adb5bd;padding:4px 8px;z-index:2}
.kv-gas .gas-link{color:#0d6efd}
.kv-gas .sum-chip{border-radius:999px !important;border:1px solid #dc3545;color:#dc3545;background:#fff;font-weight:700;padding:8px 14px;margin:0 8px 8px 0 !important}
.kv-gas .week button{background:#fff;color:#0d6efd;border:1px solid #0d6efd;padding:8px 10px;font-weight:700}
.kv-gas .visit-date{font-size:20px;font-weight:700}
.kv-gas .visit-time{font-size:20px;font-weight:700;color:#0d47a1}
.kv-gas .kv-prev{background:#fff;border-radius:6px;padding:8px 10px}
.kv-gas .kv-prev-row{padding:3px 0}
.kv-gas .kv-prev-lab{display:block;color:#546e7a;font-size:12px}
.kv-gas .kv-prev .chg{font-weight:700;color:#c62828}
.kv-gas .kv-instr{background:#fff;border-left:5px solid #fb8c00;border-radius:6px;padding:8px 10px;margin:0 0 6px}
.kv-gas .kv-instr-body{font-size:17px;font-weight:700;white-space:pre-wrap;word-break:break-word}
.kv-gas .kv-empty{background:#fff;border-radius:6px;padding:8px 10px}
</style>`;
}
function kvGasPt(s) { return `<span class="gas-pt">${s}</span>`; }
function kvGasReq() { return `<span class="gas-req">必須 / Obrigatório</span>`; }
function kvGasFields(id) {
  const svc = '<option value="">選択してください / Selecione</option>' + KV_GAS_SVC.map(s => `<option value="${s[0]}">${s[0]} / ${s[1]}</option>`).join('');
  const reports = KV_REPORT.map((r, i) => `<div class="rep-item"><div class="gas-lab">${r.ja}${kvGasPt(r.pt)}</div><div class="rep-line"><input type="checkbox" class="gas-check" id="${id}-rp-${i}-nc" checked data-nodirty="1" data-rp-nc="${id}|${i}"><label class="nc" for="${id}-rp-${i}-nc">変化なし${kvGasPt('Sem alteração')}</label><input class="gas-in" id="${id}-rp-${i}-text" data-nodirty="1" data-rp-text="${id}|${i}" placeholder="メモ（任意）/ Obs."></div></div>`).join('');
  const signer = (val, ja, pt, on, ok) => `<input type="radio" class="gas-check" name="${id}-signerType" id="${id}-sg-${val}" value="${val}" ${on ? 'checked' : ''}><label class="gas-btn${ok ? ' ok' : ''}" for="${id}-sg-${val}">${ja}${kvGasPt(pt)}</label>`;
  return `<div class="sv-panel" id="${id}-sv">
    <div style="display:flex;justify-content:space-between;gap:8px"><div class="sv-h">サ責からの指示${kvGasPt('Instruções da responsável')}</div><button type="button" class="gas-now" data-ctx-reload="${id}" style="width:auto !important">更新${kvGasPt('Atualizar')}</button></div>
    <div id="${id}-instr" class="gas-hint">利用者を選ぶと、サ責からの指示と前回の報告が出ます / Escolha o usuário para ver as instruções e o último relatório.</div>
    <div class="sv-h">前回の報告${kvGasPt('Último relatório')}</div>
    <div id="${id}-prev" class="gas-hint">—</div>
    <input type="checkbox" class="gas-check" id="${id}-ack" data-nodirty="1"><label class="ack" for="${id}-ack"><span class="off">☐</span><span class="on">☑</span> 指示と前回報告を確認しました${kvGasPt('Confirmei as instruções e o último relatório')}</label>
    <p class="gas-hint">表示だけです。毎回書く必要はありません。</p>
  </div>
  <div class="gas-field"><label class="gas-lab" for="${id}-serviceType">サービス区分${kvGasReq()}${kvGasPt('Tipo de serviço')}</label><select id="${id}-serviceType" class="gas-in">${svc}</select></div>
  <div class="gas-row gas-field"><div><label class="gas-lab" for="${id}-startTime">開始時間<span class="gas-req">必須</span>${kvGasPt('Horário de início')}</label><input type="time" id="${id}-startTime" class="gas-in"><button type="button" class="gas-now" data-now="${id}-startTime">今を開始に${kvGasPt('Agora (início)')}</button></div>
  <div><label class="gas-lab" for="${id}-endTime">終了時間<span class="gas-req">必須</span>${kvGasPt('Horário de término')}</label><input type="time" id="${id}-endTime" class="gas-in"><button type="button" class="gas-now" data-now="${id}-endTime">今を終了に${kvGasPt('Agora (término)')}</button></div></div>
  <div class="gas-field"><label class="gas-lab" for="${id}-content">具体的な提供内容${kvGasReq()}${kvGasPt('Conteúdo do serviço')}</label><textarea id="${id}-content" class="gas-in" rows="3" placeholder="例: バイタル測定、清拭 / Ex.: sinais vitais, higiene"></textarea></div>
  <div class="gas-field"><label class="gas-lab" for="${id}-notes">特記事項・申し送り${kvGasPt('Observações / encaminhamento')}</label><textarea id="${id}-notes" class="gas-in" rows="2" placeholder="状態変化や家族への伝達 / Mudanças de estado ou avisos à família"></textarea></div>
  <div class="rep" id="${id}-report"><div class="gas-lab">訪問後の報告（サ責へ）${kvGasPt('Relatório após a visita (para a responsável)')}</div><p class="gas-hint">変わりがなければ「変化なし」のままでOK。気づいたことがあれば書いてください。<br>Se nada mudou, deixe "Sem alteração". Se notou algo, escreva.</p>${reports}</div>
  <div class="signer gas-field"><div class="gas-lab">署名${kvGasPt('Assinatura')}</div>
    ${signer('あとで署名', 'あとで署名（まとめて署名で）', 'Assinar depois', true, true)}
    <div class="gas-hint">いま署名する場合 / Para assinar agora:</div>
    ${signer('本人', '本人', 'Próprio usuário', false, false)}
    ${signer('ご家族', 'ご家族', 'Familiar', false, false)}
    ${signer('署名困難', '署名困難（確認は取れた）', 'Não consegue assinar (confirmado)', false, false)}
  </div>
  <div class="gas-note good" id="${id}-laterNote">いまは署名なしで保存します。署名はあとで「まとめて署名」でもらいます。<br><span class="gas-pt">Salvar sem assinatura agora. A assinatura será feita depois em "Assinar depois".</span></div>
  <div class="gas-field" id="${id}-reasonWrap" hidden><label class="gas-lab" for="${id}-reason">署名困難の理由${kvGasReq()}${kvGasPt('Motivo (não consegue assinar)')}</label><textarea id="${id}-reason" class="gas-in" rows="2"></textarea></div>
  <div class="gas-field" id="${id}-signWrap" hidden><div class="gas-lab">利用者（またはご家族）の確認署名${kvGasPt('Assinatura do usuário (ou familiar)')}</div><div class="gas-canvas"><button type="button" class="gas-clear" data-clear="${id}">書き直す / Refazer</button><canvas id="${id}-canvas"></canvas></div><p class="gas-hint">枠内に指またはタッチペンで署名 / Assine com o dedo ou caneta na área.</p></div>`;
}
function kvGasShell() {
  return `${kvGasCss()}<div class="kv-gas"><div class="gas-card">
    <h3 class="gas-title">サービス実施記録入力</h3>
    <p class="gas-sub">Registro de prestação de serviço</p>
    <div class="gas-group" role="group">
      <input type="radio" class="gas-check" name="mode" id="modeNormal" value="normal" checked><label class="gas-btn" for="modeNormal">通常${kvGasPt('Normal')}</label>
      <input type="radio" class="gas-check" name="mode" id="modeTrio" value="trio"><label class="gas-btn" for="modeTrio">同じ建物で連続${kvGasPt('Mesmo prédio (seguidos)')}</label>
      <input type="radio" class="gas-check" name="mode" id="modeLater" value="later"><label class="gas-btn ok" for="modeLater">まとめて署名${kvGasPt('Assinar depois')}</label>
    </div>
    <div class="gas-field" id="dateBlock"><label class="gas-lab" for="date">サービス提供日${kvGasReq()}${kvGasPt('Data do serviço')}</label><input type="date" id="date" class="gas-in"><div id="dateWeekday" class="gas-hint"></div></div>
    <div class="gas-field"><label class="gas-lab" for="helperName">担当ヘルパー名${kvGasPt('Nome do cuidador')}</label><input id="helperName" class="gas-in" autocomplete="name" placeholder="氏名"><p class="gas-hint">ログイン中の職員名を入れています。空欄のまま保存できます。</p></div>
    <section id="normalSection">
      <div class="gas-field"><label class="gas-lab" for="userName">利用者氏名${kvGasReq()}${kvGasPt('Nome do usuário')}</label><select id="userName" class="gas-in"></select><div id="n-kana" class="gas-hint"></div></div>
      <div id="n-slotArea" hidden><div class="gas-lab">予定を選ぶ ${kvGasPt('Escolher horário')}</div><div id="n-chips"></div></div>
      <div id="n-note" class="gas-note" hidden></div>
      <div id="n-fields"></div>
      <button type="button" id="submitBtn" class="gas-go">記録を確定して送信<br><span style="font-size:13px;font-weight:400">Confirmar e enviar</span></button>
    </section>
    <section id="trioSection" hidden>
      <div class="gas-lab">同じ建物で連続入力 ${kvGasPt('Mesmo prédio (seguidos)')}</div>
      <div class="gas-field"><div class="gas-lab">建物${kvGasPt('Prédio')}</div><div class="gas-group" id="buildingGroup"></div><p class="gas-hint">この端末に記憶されます / Fica salvo neste aparelho.</p></div>
      <div class="gas-field"><div class="gas-lab">時間帯${kvGasPt('Período')}</div><div class="gas-group" id="bandGroup"></div><div id="t-bandInfo" class="gas-hint"></div></div>
      <div id="t-note" class="gas-note">タイムテーブルから入力しました。違うところだけ直してください / Preenchido pela escala. Corrija só o que for diferente.</div>
      <div id="t-empty" class="gas-note muted" hidden>この時間帯の予定はありません<br><span class="gas-pt">Sem agenda neste período</span></div>
      <div id="t-none" class="gas-note warn" hidden>建物の入った支給がありません。台帳の「建物」に棟の名前を入れると、ここでまとめて記入できます。</div>
      <div id="t-cards"></div>
      <button type="button" id="trioSubmitBtn" class="gas-go"><span id="trioSubmitLabel">0人分をまとめて送信</span><br><span style="font-size:13px;font-weight:400">Enviar todos</span></button>
    </section>
    <section id="laterSection" hidden>
      <div class="gas-note good"><b>まとめて署名</b>：「あとで署名」で記録した分に、<b>1回ずつ</b>署名してもらいます。<br><span class="gas-pt">Assinar depois: o usuário assina cada visita registrada como "Assinar depois".</span></div>
      <div class="gas-field" style="border:1px solid #e9ecef;border-radius:10px;padding:10px"><div style="display:flex;justify-content:space-between;align-items:center"><b>署名がまだの人${kvGasPt('Falta assinar')}</b><button type="button" id="l-refresh" class="gas-now" style="width:auto !important">更新${kvGasPt('Atualizar')}</button></div><div id="l-summary" class="gas-hint">読み込み中… / Carregando…</div></div>
      <div class="gas-field"><label class="gas-lab" for="l-user">利用者氏名${kvGasReq()}${kvGasPt('Nome do usuário')}</label><select id="l-user" class="gas-in"></select></div>
      <div class="gas-field"><div class="gas-lab">週（月曜〜日曜）${kvGasPt('Semana (segunda a domingo)')}</div><div class="week" style="display:flex;gap:8px;align-items:stretch"><button type="button" id="l-prev">◀<span class="gas-pt">前の週</span></button><div id="l-weekLabel" style="flex:1;text-align:center;border:1px solid #dee2e6;border-radius:8px;padding:6px;background:#fff"></div><button type="button" id="l-next">▶<span class="gas-pt">次の週</span></button></div></div>
      <div id="l-listHead"></div><div id="l-cards"></div>
      <button type="button" id="laterSubmitBtn" class="gas-go ok" hidden><span id="laterSubmitLabel">まとめて送信</span><br><span id="laterSubmitLabelPt" style="font-size:13px;font-weight:400">Enviar todas</span></button>
    </section>
    <p style="margin-top:16px"><a class="gas-link" href="#kintoun/visit">今月の記録を見る</a></p>
  </div></div>`;
}
function kvGasMode() { return $('modeLater').checked ? 'later' : $('modeTrio').checked ? 'trio' : 'normal'; }
function kvGasWeekdayNum() { return kvWeekdayFromISO($('date') && $('date').value); }
function kvGasWeekday() {
  const wd = kvGasWeekdayNum();
  const el = $('dateWeekday');
  if (el) el.textContent = wd === null ? '' : (KV_WEEKDAY_JA[wd] + '曜日 / ' + KV_GAS_PT[wd]);
}
function kvGasUser(id) {
  if (id === 'n') {
    const v = $('userName') && $('userName').value;
    return KW.users.find(u => String(u.id) === String(v)) || null;
  }
  return KW.cardUser[id] || null;
}
function kvGasAttachPad(id) {
  const canvas = $(id + '-canvas');
  const rec = KW.records[id] || (KW.records[id] = { dirty: false, autofilled: false });
  rec.pad = { drawn() { return false; }, clear() { }, toDataURL() { return ''; }, remeasure() { } };
  if (!canvas || typeof createSignPad !== 'function') return;
  try {
    const pad = createSignPad(canvas);
    rec.pad = { drawn() { return pad.isDrawn(); }, clear() { pad.clear(); }, toDataURL() { return pad.toDataURL(); }, remeasure() { if (!pad.isDrawn() && pad.remeasure) pad.remeasure(); } };
  } catch (e) { }
}
function kvGasSigner(id) {
  const c = document.querySelector('input[name="' + id + '-signerType"]:checked');
  return c ? c.value : 'あとで署名';
}
function kvGasSignerUI(id) {
  const t = kvGasSigner(id);
  const later = t === 'あとで署名', unable = t === '署名困難';
  const note = $(id + '-laterNote'), reason = $(id + '-reasonWrap'), sign = $(id + '-signWrap');
  if (note) note.hidden = !later;
  if (reason) reason.hidden = !unable;
  if (sign) sign.hidden = later || unable;
  if (sign && !sign.hidden) kvGasResize();
}
function kvGasMount(id, box) {
  box.innerHTML = kvGasFields(id);
  KW.records[id] = { dirty: false, autofilled: false };
  kvGasAttachPad(id);
  kvGasSignerUI(id);
  const sel = $(id + '-serviceType');
  if (sel) sel.value = '身体介護';
}
function kvGasResize() {
  const run = () => Object.keys(KW.records).forEach(id => { const rec = KW.records[id]; if (rec && rec.pad) rec.pad.remeasure(); });
  (window.requestAnimationFrame || setTimeout)(run);
}
function kvGasShowMode(mode) {
  $('modeNormal').checked = mode === 'normal';
  $('modeTrio').checked = mode === 'trio';
  $('modeLater').checked = mode === 'later';
  $('normalSection').hidden = mode !== 'normal';
  $('trioSection').hidden = mode !== 'trio';
  $('laterSection').hidden = mode !== 'later';
  $('dateBlock').hidden = mode === 'later';
  if (mode === 'later') kvGasEnterLater();
  if (mode === 'trio' && KW.buildings.length) {
    const keep = KW.bandManual || kvGasTrioDirty();
    kvGasSelectBand(keep && KW.band ? KW.band : kvPickBuildingBand(KW.slots, KW.buildings[KW.building], kvGasWeekdayNum(), kvNowMinutes(), $('date').value), false);
  }
  if (mode === 'normal') kvGasLoadCtx(['n'], false);
  kvGasResize();
}
function kvGasTrioDirty() {
  return Object.keys(KW.cardUser).some(id => {
    const rec = KW.records[id];
    const card = $('card-' + id);
    return (rec && rec.dirty) || (card && card.classList.contains('sent')) || ($(id + '-skip') && $(id + '-skip').checked);
  });
}
function kvGasBuildBuildings() {
  const box = $('buildingGroup');
  if (!KW.buildings.length) { box.innerHTML = ''; $('t-none').hidden = false; $('trioSubmitBtn').disabled = true; return; }
  $('t-none').hidden = true;
  box.innerHTML = KW.buildings.map((b, i) => `<input type="radio" class="gas-check" name="building" id="building-${i}" value="${i}"><label class="gas-btn" for="building-${i}">${esc(b.ja)}${kvGasPt(b.users.map(u => kvSurname(u.name)).join('・'))}</label>`).join('');
}
function kvGasBuildCards() {
  const box = $('t-cards');
  box.innerHTML = '';
  const seen = {};
  KW.buildings.forEach(b => b.users.forEach(u => { if (!seen[u.id]) seen[u.id] = u; }));
  Object.keys(seen).forEach((uid, i) => {
    const u = seen[uid], id = 'c' + i;
    KW.userToCard[u.id] = id;
    KW.cardUser[id] = u;
    const card = document.createElement('div');
    card.className = 'person';
    card.id = 'card-' + id;
    card.hidden = true;
    card.dataset.inBand = '0';
    card.innerHTML = `<div class="person-h"><div style="display:flex;justify-content:space-between;gap:8px"><div><span class="gas-badge" id="${id}-order">${i + 1}</span><b style="font-size:1.15rem">${esc(u.name)}</b> <span class="gas-hint">${u.name_kana ? '（' + esc(u.name_kana) + '）' : ''}</span><div class="gas-hint" id="${id}-slotLabel"></div></div><span class="gas-badge ok" id="${id}-sentBadge" hidden>送信済み</span><span class="gas-badge ng" id="${id}-failBadge" hidden>送信失敗</span></div><label class="skip-row" style="display:flex;align-items:center;gap:8px;margin-top:8px;font-weight:700"><input type="checkbox" id="${id}-skip" data-nodirty="1"><span>本日はなし${kvGasPt('Sem serviço hoje')}</span></label></div><div class="person-body" id="${id}-body"></div>`;
    box.appendChild(card);
    kvGasMount(id, $(id + '-body'));
  });
}
function kvGasRenderBands() {
  const b = KW.buildings[KW.building];
  const bands = b ? kvBandsForBuilding(KW.slots, b.key) : [];
  $('bandGroup').innerHTML = bands.map(band => `<input type="radio" class="gas-check" name="trioBand" id="band-${band.key}" value="${band.key}"><label class="gas-btn" for="band-${band.key}">${band.ja}${kvGasPt(band.pt)}</label>`).join('');
}
function kvGasSelectBuilding(index) {
  if (!KW.buildings.length) return;
  KW.building = index;
  const radio = $('building-' + index);
  if (radio) radio.checked = true;
  kvStoreSet('jisseki.building', KW.buildings[index].ja);
  kvGasRenderBands();
  const keep = KW.bandManual || kvGasTrioDirty();
  const bands = kvBandsForBuilding(KW.slots, KW.buildings[index].key);
  const key = keep && KW.band && bands.some(x => x.key === KW.band) ? KW.band : kvPickBuildingBand(KW.slots, KW.buildings[index], kvGasWeekdayNum(), kvNowMinutes(), $('date').value);
  kvGasSelectBand(key, false);
}
function kvGasSelectBand(key, force) {
  const b = KW.buildings[KW.building];
  if (!b) return;
  const bands = kvBandsForBuilding(KW.slots, b.key);
  if (!bands.some(x => x.key === key)) key = bands[0] ? bands[0].key : 'asa';
  KW.band = key;
  const radio = $('band-' + key);
  if (radio) radio.checked = true;
  const entries = kvBuildingEntries(KW.slots, b, key, kvGasWeekdayNum(), $('date').value);
  const shown = {};
  entries.forEach(e => { shown[e.user.id] = e; });
  Object.keys(KW.cardUser).forEach(id => {
    const card = $('card-' + id);
    if (force) { card.classList.remove('sent', 'failed'); $(id + '-sentBadge').hidden = true; $(id + '-failBadge').hidden = true; }
    card.hidden = true;
    card.dataset.inBand = '0';
  });
  const box = $('t-cards');
  entries.forEach((e, i) => {
    const id = KW.userToCard[e.user.id];
    const card = $('card-' + id);
    box.appendChild(card);
    card.hidden = false;
    card.dataset.inBand = '1';
    $(id + '-order').textContent = String(i + 1);
    $(id + '-slotLabel').textContent = kvSlotLabel(e.slot);
    if (force || !KW.records[id].dirty) kvGasFill(id, e.slot);
  });
  $('t-empty').hidden = !!entries.length;
  $('t-note').hidden = !entries.length;
  $('t-bandInfo').textContent = entries.map(e => e.user.name).join(' → ');
  kvGasTrioLabel();
  kvGasLoadCtx(entries.map(e => KW.userToCard[e.user.id]), false);
  kvGasResize();
}
function kvGasFill(id, slot) {
  $(id + '-startTime').value = slot.start;
  $(id + '-endTime').value = slot.end;
  const svc = $(id + '-serviceType');
  if (svc && KV_GAS_SVC.some(s => s[0] === slot.service)) svc.value = slot.service;
  $(id + '-content').value = slot.content || '';
  KW.records[id].autofilled = true;
  KW.records[id].dirty = false;
}
function kvGasTargets() {
  return Object.keys(KW.cardUser).filter(id => {
    const card = $('card-' + id);
    return card && card.dataset.inBand === '1' && !card.classList.contains('sent') && !$(id + '-skip').checked;
  }).sort((a, b) => (+$(a + '-order').textContent) - (+$(b + '-order').textContent));
}
function kvGasTrioLabel() {
  const n = kvGasTargets().length;
  $('trioSubmitLabel').textContent = n + '人分をまとめて送信';
  $('trioSubmitBtn').disabled = n === 0;
}
function kvGasRenderChips(userId, active) {
  const all = kvSlotsForUser(KW.slots, userId).filter(s => kvPlanCovers(s, $('date').value));
  KW.chipSlots = all;
  if (all.length < 2) { $('n-slotArea').hidden = true; $('n-chips').innerHTML = ''; return; }
  const wd = kvGasWeekdayNum();
  $('n-chips').innerHTML = all.map((s, i) => {
    const on = active && s.start === active.start && s.end === active.end && String(s.content) === String(active.content);
    const off = !kvSlotMatchesDay(s, wd);
    return `<button type="button" class="gas-chip${on ? ' on' : ''}${off ? ' off' : ''}" data-slot="${i}">${esc(kvSlotLabel(s))}</button>`;
  }).join('');
  $('n-slotArea').hidden = false;
}
function kvGasNote(html, kind) {
  const n = $('n-note');
  n.className = 'gas-note' + (kind === 'warn' ? ' warn' : kind === 'muted' ? ' muted' : '');
  n.innerHTML = html;
  n.hidden = false;
}
function kvGasApplyNormal(force) {
  const user = kvGasUser('n');
  const kana = $('n-kana');
  if (kana) kana.textContent = user && user.name_kana ? user.name_kana : '';
  const rec = KW.records.n;
  if (!user) { $('n-slotArea').hidden = true; $('n-note').hidden = true; return; }
  const res = kvPickSlot(KW.slots, user.id, kvGasWeekdayNum(), kvNowMinutes(), $('date').value);
  if (!res) {
    $('n-slotArea').hidden = true;
    if (rec.autofilled && !rec.dirty) { $( 'n-startTime').value = ''; $('n-endTime').value = ''; $('n-content').value = ''; rec.autofilled = false; }
    kvGasNote('固定の予定がありません。手入力してください / Sem escala fixa. Preencha manualmente.', 'muted');
    return;
  }
  if (!force && rec.dirty) { kvGasRenderChips(user.id, null); return; }
  if (!res.weekdayMatched && kvGasWeekdayNum() !== null) {
    if (rec.autofilled && !rec.dirty) { $('n-startTime').value = ''; $('n-endTime').value = ''; $('n-content').value = ''; rec.autofilled = false; }
    kvGasRenderChips(user.id, null);
    kvGasNote('この曜日は予定がありません（自動入力なし）。必要なら時間を選ぶか手入力してください / Sem escala neste dia. Escolha o horário ou preencha manualmente.', 'warn');
    return;
  }
  kvGasFill('n', res.slot);
  kvGasRenderChips(user.id, res.slot);
  const off = !kvSlotMatchesDay(res.slot, kvGasWeekdayNum());
  kvGasNote('タイムテーブルから入力しました。違うところだけ直してください / Preenchido pela escala. Corrija só o que for diferente.' + (off ? '<br><b>この曜日の予定ではありません。確認してください / Não há escala para este dia da semana. Confira.</b>' : ''), off ? 'warn' : '');
}
function kvGasClearCtx(id) {
  KW.ctx[id] = null;
  const instr = $(id + '-instr'), prev = $(id + '-prev'), ack = $(id + '-ack');
  if (instr) instr.innerHTML = '<span class="gas-hint">利用者を選ぶと、サ責からの指示と前回の報告が出ます / Escolha o usuário para ver as instruções e o último relatório.</span>';
  if (prev) prev.textContent = '—';
  if (ack) ack.checked = false;
}
async function kvGasLoadCtx(ids, force) {
  const date = ($('date') && $('date').value) || '';
  const targets = (ids || []).filter(id => {
    if (!$(id + '-instr')) return false;
    const user = kvGasUser(id);
    if (!user) { kvGasClearCtx(id); return false; }
    const st = KW.ctx[id];
    return force || !st || st.userId !== user.id || st.date !== date;
  });
  if (!targets.length) return;
  const seq = ++kvGasSeq;
  const users = [];
  targets.forEach(id => {
    const user = kvGasUser(id);
    KW.ctx[id] = { userId: user.id, date, ready: false, value: null, seq };
    $(id + '-instr').innerHTML = '<span class="gas-hint">読み込み中… / Carregando…</span>';
    if (!users.some(u => u.id === user.id)) users.push(user);
  });
  if (KW.instrMissing) {
    targets.forEach(id => {
      $(id + '-instr').innerHTML = '<div class="gas-note muted">指示の表がまだありません。この欄は記入しません。</div>';
    });
  }
  const prevs = {};
  await Promise.all(users.map(async u => {
    try { prevs[u.id] = await sb(`kin_visit?user_id=eq.${u.id}&visit_date=lte.${date}&select=id,visit_date,start_time,end_time,staff_name,report1,report2,report3,report4,report5,sv_confirm_3&order=visit_date.desc,start_time.desc&limit=12`); }
    catch (e) { prevs[u.id] = []; }
  }));
  if (seq !== kvGasSeq) return;
  targets.forEach(id => {
    const st = KW.ctx[id];
    if (!st || st.seq !== seq) return;
    const user = kvGasUser(id);
    if (!KW.instrMissing) {
      const active = kvActiveInstructions(KW.instructions, user.id, date);
      st.ready = true;
      st.value = kvInstructionIdValue(active);
      $(id + '-instr').innerHTML = kvInstrHtml(active);
    }
    const start = ($(id + '-startTime') && $(id + '-startTime').value) || '';
    const prev = kvPreviousVisit(prevs[user.id] || [], 'new', date, start);
    $(id + '-prev').innerHTML = kvPrevHtml(prev);
  });
}
function kvGasPack(id, user) {
  const reports = {};
  KV_REPORT.forEach((r, i) => { reports[r.k] = $(id + '-rp-' + i + '-nc') ? kvReportStored($(id + '-rp-' + i + '-nc').checked, $(id + '-rp-' + i + '-text').value) : null; });
  const signer = kvGasSigner(id);
  const pad = KW.records[id] && KW.records[id].pad;
  const signature = (signer === '本人' || signer === 'ご家族') && pad && pad.drawn() ? pad.toDataURL() : '';
  const ctx = KW.ctx[id];
  return {
    visit_date: $('date') ? $('date').value : '', user_id: user && user.id, staff_name: ($('helperName') && $('helperName').value) || '',
    service: $(id + '-serviceType') ? $(id + '-serviceType').value : '身体介護',
    start_time: $(id + '-startTime') ? $(id + '-startTime').value : '', end_time: $(id + '-endTime') ? $(id + '-endTime').value : '',
    content: $(id + '-content') ? $(id + '-content').value : '', note: $(id + '-notes') ? $(id + '-notes').value : '',
    report1: reports.report1, report2: reports.report2, report3: reports.report3, report4: reports.report4, report5: reports.report5,
    signer, sign_reason: $(id + '-reason') ? $(id + '-reason').value : '', signature,
    ack: !!($(id + '-ack') && $(id + '-ack').checked),
    instruction_ready: !!(ctx && ctx.ready), instruction_id: ctx ? ctx.value : null
  };
}
async function kvGasPost(pack) {
  const now = new Date().toISOString();
  const body = kvVisitBody(Object.assign({}, pack, { recorded_at: now, updated_at: now, signed_at: now, confirmed_at: now }));
  await sb('kin_visit', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body) });
  return body;
}
async function kvGasSubmitNormal() {
  const user = kvGasUser('n');
  await kvGasLoadCtx(['n'], false);
  const pack = kvGasPack('n', user);
  const errs = kvWriteErrors(pack);
  if (errs.length) { alert('未入力 / Faltando: ' + errs.join('、')); return; }
  const who = user ? user.name : '';
  if (!confirm(who + ' さんの記録を保存しますか？\nConfirmar e salvar?')) return;
  $('submitBtn').disabled = true;
  try {
    await kvGasPost(pack);
    alert(pack.signer === 'あとで署名' ? '保存しました。署名は「まとめて署名」でもらえます。\nSalvo. A assinatura fica para "Assinar depois".' : '保存しました。\nSalvo.');
    kvGasResetNormal();
  } catch (e) { alert(e.message); }
  $('submitBtn').disabled = false;
}
function kvGasResetNormal() {
  $('userName').value = '';
  $('date').value = kvToday();
  kvGasWeekday();
  kvGasResetRecord('n');
  $('n-slotArea').hidden = true;
  $('n-note').hidden = true;
  if ($('n-kana')) $('n-kana').textContent = '';
  kvGasClearCtx('n');
}
function kvGasResetRecord(id) {
  ['serviceType', 'startTime', 'endTime', 'content', 'notes', 'reason'].forEach(f => { const el = $(id + '-' + f); if (el) el.value = f === 'serviceType' ? '身体介護' : ''; });
  const later = $(id + '-sg-あとで署名');
  if (later) later.checked = true;
  KV_REPORT.forEach((r, i) => { const nc = $(id + '-rp-' + i + '-nc'), tx = $(id + '-rp-' + i + '-text'); if (nc) nc.checked = true; if (tx) tx.value = ''; });
  const ack = $(id + '-ack'); if (ack) ack.checked = false;
  if (KW.records[id] && KW.records[id].pad) KW.records[id].pad.clear();
  if (KW.records[id]) { KW.records[id].dirty = false; KW.records[id].autofilled = false; }
  kvGasSignerUI(id);
}
async function kvGasSubmitTrio() {
  const targets = kvGasTargets();
  if (!targets.length) { alert('送信する人がいません（全員「本日はなし」または送信済み）\nNinguém para enviar.'); return; }
  await kvGasLoadCtx(targets, false);
  const errs = [];
  targets.forEach(id => {
    const e = kvWriteErrors(kvGasPack(id, KW.cardUser[id]));
    if (e.length) errs.push('【' + KW.cardUser[id].name + '】 ' + e.join('、'));
  });
  if (errs.length) { alert(errs.join('\n')); return; }
  const lines = targets.map(id => '・' + KW.cardUser[id].name + ' ' + kvShortTime($(id + '-startTime').value) + '〜' + kvShortTime($(id + '-endTime').value));
  const building = KW.buildings[KW.building];
  if (!confirm((building ? building.ja : '') + '：' + targets.length + '人分を保存します / Salvar:\n' + lines.join('\n'))) return;
  $('trioSubmitBtn').disabled = true;
  let fail = 0;
  for (const id of targets) {
    try {
      await kvGasPost(kvGasPack(id, KW.cardUser[id]));
      const card = $('card-' + id);
      card.classList.add('sent');
      card.classList.remove('failed');
      $(id + '-sentBadge').hidden = false;
      $(id + '-failBadge').hidden = true;
      if (KW.records[id].pad) KW.records[id].pad.clear();
      $(id + '-notes').value = '';
      KW.records[id].dirty = false;
    } catch (e) {
      fail++;
      $('card-' + id).classList.add('failed');
      $(id + '-failBadge').hidden = false;
      $(id + '-failBadge').textContent = '失敗';
    }
  }
  alert(fail ? ('一部保存できませんでした（' + fail + '人）。残ったカードを確認して、もう一度送ってください。') : (targets.length + '人分を保存しました。'));
  if (!fail) {
    targets.forEach(id => { kvGasResetRecord(id); const sk = $(id + '-skip'); if (sk) sk.checked = false; $('card-' + id).classList.remove('skipped', 'sent'); });
    KW.bandManual = false;
    $('date').value = kvToday();
    kvGasWeekday();
    kvGasSelectBand(kvPickBuildingBand(KW.slots, KW.buildings[KW.building], kvGasWeekdayNum(), kvNowMinutes(), $('date').value), true);
    window.scrollTo(0, 0);
  } else kvGasTrioLabel();
}
function kvGasLaterWeek() {
  const ws = KW.laterWeek;
  const n = Math.round((Date.parse(kvWeekStart(kvToday()) + 'T00:00:00Z') - Date.parse(ws + 'T00:00:00Z')) / 604800000);
  const rel = n === 0 ? '今週 / Esta semana' : n === 1 ? '先週 / Semana passada' : n > 1 ? (n + '週間前') : ((-n) + '週間後');
  $('l-weekLabel').innerHTML = '<b>' + esc(kvWeekRangeLabel(ws)) + '</b><div class="gas-hint">' + esc(rel) + '</div>';
  $('l-next').disabled = ws >= kvWeekStart(kvToday());
}
async function kvGasEnterLater() {
  if (!KW.laterWeek) KW.laterWeek = kvWeekStart(kvToday());
  $('l-user').innerHTML = $('userName').innerHTML;
  kvGasLaterWeek();
  await kvGasLoadPending();
}
async function kvGasLoadPending() {
  $('l-summary').textContent = '読み込み中… / Carregando…';
  try {
    const rows = await sb('kin_visit?sign_status=eq.未署名&late_signed=eq.はい&select=id,visit_date,user_id,staff_name,service,start_time,end_time,content,note&order=visit_date,start_time&limit=500');
    const nm = {};
    KW.users.forEach(u => { nm[u.id] = u.name; });
    KW.pending = (rows || []).map(v => Object.assign({}, v, { userName: nm[v.user_id] || '', start_time: String(v.start_time || '').slice(0, 5), end_time: String(v.end_time || '').slice(0, 5) }));
  } catch (e) { KW.pending = []; $('l-summary').textContent = e.message; return; }
  const s = kvPendingSummary(KW.pending, kvToday());
  const block = (ja, pt, range, users) => {
    const chips = users.length ? users.map(u => `<button type="button" class="sum-chip" data-later-user="${esc(u.userName)}" data-later-week="${esc(u.weekStart)}">${esc(kvSurname(u.userName))} ${u.count}件</button>`).join('') : '<span class="gas-hint">なし</span>';
    return `<div style="margin-top:8px"><b>${ja}</b> <span class="gas-hint">${pt}${range ? ' ' + esc(range) : ''}</span><div>${chips}</div></div>`;
  };
  $('l-summary').innerHTML = block('今週', 'Esta semana', kvWeekRangeLabel(s.thisWeek.weekStart), s.thisWeek.users) + block('先週', 'Semana passada', kvWeekRangeLabel(s.lastWeek.weekStart), s.lastWeek.users) + (s.other.users.length ? block('ほかの週', 'Outras semanas', '', s.other.users) : '');
  kvGasRenderLater();
}
function kvGasRenderLater() {
  KW.laterIds.forEach(id => { delete KW.records[id]; });
  KW.laterIds = [];
  KW.laterById = {};
  $('l-cards').innerHTML = '';
  const sel = $('l-user');
  const name = sel && sel.selectedOptions && sel.selectedOptions[0] ? sel.selectedOptions[0].textContent : '';
  if (!sel || !sel.value) { $('l-listHead').innerHTML = '<div class="gas-note muted">利用者を選んでください<br><span class="gas-pt">Escolha o usuário</span></div>'; $('laterSubmitBtn').hidden = true; return; }
  const visits = kvPendingLater(KW.pending, name, KW.laterWeek);
  if (!visits.length) { $('l-listHead').innerHTML = '<div class="gas-note good">この週の署名待ちはありません<br><span class="gas-pt">Nada para assinar nesta semana</span></div>'; $('laterSubmitBtn').hidden = true; return; }
  $('l-listHead').innerHTML = '<div class="visit-date">署名待ち ' + visits.length + '件</div><div class="gas-hint">内容を確認して、1件ずつ署名してください / Confira e assine cada visita.</div>';
  visits.forEach((v, i) => kvGasLaterCard(v, i));
  $('laterSubmitBtn').hidden = false;
  kvGasLaterLabel();
  kvGasResize();
}
function kvGasLaterCard(v, i) {
  const id = 'L' + KW.laterIds.length + 'x' + v.id;
  const card = document.createElement('div');
  card.className = 'person';
  card.id = 'card-' + id;
  card.innerHTML = `<div class="person-h"><div class="visit-date">${esc(kvIsoShortLabel(v.visit_date))}</div><div class="visit-time">${esc(kvShortTime(v.start_time))}〜${esc(kvShortTime(v.end_time))}</div><div class="gas-hint">${esc(v.service || '')} ${esc(v.content || '')}</div><div class="gas-hint">ヘルパー / Cuidador: ${esc(v.staff_name || '')}</div><label class="skip-row" style="display:flex;gap:8px;align-items:center;margin-top:8px;font-weight:700"><input type="checkbox" id="${id}-skip" data-nodirty="1"> 今は署名しない${kvGasPt('Não assinar agora')}</label><span class="gas-badge ok" id="${id}-sentBadge" hidden>送信済み</span><span class="gas-badge ng" id="${id}-failBadge" hidden>失敗</span></div><div class="person-body" id="${id}-body"></div>`;
  $('l-cards').appendChild(card);
  $(id + '-body').innerHTML = kvGasLaterSigner(id);
  KW.records[id] = { dirty: false, autofilled: false };
  kvGasAttachPad(id);
  const self = $(id + '-sg-本人');
  if (self) self.checked = true;
  kvGasSignerUI(id);
  const sign = $(id + '-signWrap');
  if (sign) sign.hidden = false;
  KW.laterIds.push(id);
  KW.laterById[id] = v;
}
function kvGasLaterSigner(id) {
  const signer = (val, ja, pt, on) => `<input type="radio" class="gas-check" name="${id}-signerType" id="${id}-sg-${val}" value="${val}" ${on ? 'checked' : ''}><label class="gas-btn" for="${id}-sg-${val}">${ja}${kvGasPt(pt)}</label>`;
  return `<div class="signer"><div class="gas-lab">署名する人${kvGasPt('Quem assina')}</div>${signer('本人', '本人', 'Próprio usuário', true)}${signer('ご家族', 'ご家族', 'Familiar', false)}${signer('署名困難', '署名困難（確認は取れた）', 'Não consegue assinar (confirmado)', false)}</div>
    <div class="gas-field" id="${id}-reasonWrap" hidden><label class="gas-lab">署名困難の理由${kvGasReq()}</label><textarea id="${id}-reason" class="gas-in" rows="2"></textarea></div>
    <div class="gas-field" id="${id}-signWrap"><div class="gas-lab">確認署名${kvGasPt('Assinatura')}</div><div class="gas-canvas"><button type="button" class="gas-clear" data-clear="${id}">書き直す / Refazer</button><canvas id="${id}-canvas"></canvas></div></div>
    <div id="${id}-laterNote" hidden></div>`;
}
function kvGasLaterLabel() {
  const n = KW.laterIds.filter(id => !$('card-' + id).classList.contains('sent') && !$(id + '-skip').checked).length;
  $('laterSubmitLabel').textContent = n + '件まとめて送信';
  $('laterSubmitLabelPt').textContent = 'Enviar ' + n;
  $('laterSubmitBtn').disabled = n === 0;
}
async function kvGasSubmitLater() {
  const targets = KW.laterIds.filter(id => !$('card-' + id).classList.contains('sent') && !$(id + '-skip').checked);
  if (!targets.length) { alert('送信するものがありません / Nada para enviar.'); return; }
  const errs = [];
  targets.forEach(id => {
    const signer = kvGasSigner(id);
    const pad = KW.records[id] && KW.records[id].pad;
    const e = kvWriteErrors({ visit_date: 'x', user_id: 1, start_time: '09:00', end_time: '10:00', signer, signature: pad && pad.drawn() ? 'x' : '', sign_reason: $(id + '-reason') ? $(id + '-reason').value : '' });
    if (e.length) errs.push(kvIsoShortLabel(KW.laterById[id].visit_date) + ' ' + e.join('、'));
  });
  if (errs.length) { alert(errs.join('\n')); return; }
  if (!confirm(targets.length + '件の署名を保存しますか？\nSalvar as assinaturas?')) return;
  $('laterSubmitBtn').disabled = true;
  let fail = 0;
  for (const id of targets) {
    const v = KW.laterById[id];
    const signer = kvGasSigner(id);
    const pad = KW.records[id].pad;
    const now = new Date().toISOString();
    const body = { sign_status: '署名済み', signed_at: now, signer_kind: signer, late_signed: 'はい', updated_at: now, sign_reason: signer === '署名困難' ? ($(id + '-reason').value.trim() || null) : null };
    if ((signer === '本人' || signer === 'ご家族') && pad.drawn()) body.signature_png = pad.toDataURL();
    try {
      const saved = await sb(`kin_visit?id=eq.${v.id}&sign_status=eq.未署名`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(body) });
      if (Array.isArray(saved) && !saved.length) throw new Error('署名待ちではありません');
      $('card-' + id).classList.add('sent');
      $(id + '-sentBadge').hidden = false;
      if (pad) pad.clear();
    } catch (e) { fail++; $('card-' + id).classList.add('failed'); $(id + '-failBadge').hidden = false; }
  }
  alert(fail ? '一部失敗しました。残ったカードを確認してください。' : '署名を保存しました。');
  await kvGasLoadPending();
}
function kvGasOnChange(ev) {
  const t = ev.target;
  if (!t) return;
  if (t.name === 'mode') kvGasShowMode(t.value);
  if (t.name === 'building') kvGasSelectBuilding(+t.value);
  if (t.name === 'trioBand') { KW.bandManual = true; kvGasSelectBand(t.value, true); }
  if (t.id === 'date') { kvGasWeekday(); kvGasApplyNormal(false); if (KW.buildings.length) { const keep = KW.bandManual || kvGasTrioDirty(); kvGasSelectBand(keep && KW.band ? KW.band : kvPickBuildingBand(KW.slots, KW.buildings[KW.building], kvGasWeekdayNum(), kvNowMinutes(), $('date').value), false); } if (kvGasMode() === 'normal') kvGasLoadCtx(['n'], false); }
  if (t.id === 'userName') { kvGasApplyNormal(true); kvGasLoadCtx(['n'], false); }
  if (t.id === 'l-user') kvGasRenderLater();
  if (t.name && /-signerType$/.test(t.name)) kvGasSignerUI(t.name.replace(/-signerType$/, ''));
  if (t.id && /-skip$/.test(t.id)) {
    const id = t.id.replace(/-skip$/, '');
    const card = $('card-' + id);
    if (card) card.classList.toggle('skipped', t.checked);
    if (id.indexOf('c') === 0) kvGasTrioLabel();
    if (id.indexOf('L') === 0) kvGasLaterLabel();
    if (!t.checked) kvGasResize();
  }
  if (t.getAttribute && t.getAttribute('data-rp-nc')) t.dataset.manual = '1';
}
function kvGasOnInput(ev) {
  const t = ev.target;
  if (!t || !t.getAttribute) return;
  const rp = t.getAttribute('data-rp-text');
  if (rp) {
    const parts = rp.split('|');
    const nc = $(parts[0] + '-rp-' + parts[1] + '-nc');
    if (nc && nc.dataset.manual !== '1') nc.checked = !t.value.trim();
  }
  if (t.hasAttribute('data-nodirty')) return;
  const id = (t.id || '').split('-')[0];
  if (KW.records[id]) KW.records[id].dirty = true;
}
function kvGasOnClick(ev) {
  const t = ev.target && ev.target.closest ? ev.target.closest('button') : null;
  if (!t) return;
  if (t.id === 'submitBtn') kvGasSubmitNormal();
  if (t.id === 'trioSubmitBtn') kvGasSubmitTrio();
  if (t.id === 'laterSubmitBtn') kvGasSubmitLater();
  if (t.id === 'l-refresh') kvGasLoadPending();
  if (t.id === 'l-prev') { KW.laterWeek = kvAddDays(KW.laterWeek, -7); kvGasLaterWeek(); kvGasRenderLater(); }
  if (t.id === 'l-next' && !t.disabled) { KW.laterWeek = kvAddDays(KW.laterWeek, 7); kvGasLaterWeek(); kvGasRenderLater(); }
  const now = t.getAttribute('data-now');
  if (now) { const el = $(now); if (el) { el.value = kvNowHHMM(); const id = now.split('-')[0]; if (KW.records[id]) KW.records[id].dirty = true; } }
  const clear = t.getAttribute('data-clear');
  if (clear && KW.records[clear] && KW.records[clear].pad) KW.records[clear].pad.clear();
  const reload = t.getAttribute('data-ctx-reload');
  if (reload) kvGasLoadCtx([reload], true);
  const slot = t.getAttribute('data-slot');
  if (slot != null && KW.chipSlots[+slot]) { kvGasFill('n', KW.chipSlots[+slot]); kvGasRenderChips(kvGasUser('n').id, KW.chipSlots[+slot]); kvGasNote('タイムテーブルから入力しました。違うところだけ直してください / Preenchido pela escala. Corrija só o que for diferente.', ''); }
  const laterUser = t.getAttribute('data-later-user');
  if (laterUser) {
    const opt = Array.prototype.find.call($('l-user').options, o => o.textContent === laterUser);
    if (opt) $('l-user').value = opt.value;
    KW.laterWeek = kvWeekStart(t.getAttribute('data-later-week') || kvToday());
    kvGasLaterWeek();
    kvGasRenderLater();
  }
}
async function renderKinWrite() {
  const back = `<button class="back" onclick="location.hash='kintoun'">← 金斗雲へ</button> `;
  if (typeof DEMO !== 'undefined' && DEMO) { $('view').innerHTML = back + '<p>見本モードでは記録記入は表示しません（ログイン後に開きます）。</p>'; return; }
  $('view').innerHTML = back + '<p>読み込み中…</p>';
  try {
    const [users, supplies, ins, me] = await Promise.all([
      sb('kin_user?select=id,name,name_kana&order=name'),
      sb('kin_supply?select=id,user_id,service,weekday,start_time,end_time,content,building,plan_from,plan_to&order=start_time'),
      sb('kin_instruction?select=*&order=id').catch(() => null),
      kvStaffName()
    ]);
    KW.users = users || [];
    KW.slots = kvSlotsFromSupplies(supplies || [], KW.users);
    KW.buildings = kvBuildingsFromSlots(KW.slots);
    KW.instructions = ins || [];
    KW.instrMissing = ins === null;
    KW.me = kvInitialStaff(true, '', me || '');
    KW.records = {};
    KW.ctx = {};
    KW.cardUser = {};
    KW.userToCard = {};
    KW.band = null;
    KW.bandManual = false;
    KW.pending = [];
    KW.laterWeek = kvWeekStart(kvToday());
    $('view').innerHTML = back + kvGasShell();
    $('helperName').value = KW.me;
    $('date').value = kvToday();
    kvGasWeekday();
    $('userName').innerHTML = '<option value="">選択してください / Selecione</option>' + KW.users.map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('');
    kvGasMount('n', $('n-fields'));
    kvGasBuildBuildings();
    kvGasBuildCards();
    const root = document.querySelector('.kv-gas');
    root.addEventListener('change', kvGasOnChange);
    root.addEventListener('click', kvGasOnClick);
    root.addEventListener('input', kvGasOnInput);
    const saved = kvStoreGet('jisseki.building');
    let idx = KW.buildings.findIndex(b => b.ja === saved);
    if (idx < 0) idx = 0;
    if (KW.buildings.length) kvGasSelectBuilding(idx);
    kvGasShowMode('normal');
  } catch (e) { $('view').innerHTML = back + `<p>${esc(e.message)}</p>`; }
}
