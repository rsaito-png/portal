// レオの実データ画面（データは Supabase。ログイン職員でレオ所属の人だけ読める＝RLS）
// 見本モードでは下の DEMO_DATA（架空の児童A〜D）だけを使う
const DEMO_DATA = {
  me: '職員X',
  nikki: [
    { row_no: 9,  kind: '利用', child: '児童A', service: '放デイ', pick_driver: '職員X', pick_place: '〇〇小学校', pick_time: '14:30', pick_car: '1号車', start_time: '14:45', end_time: '17:00', drop_driver: '職員Y', drop_place: '自宅', drop_time: '17:15', drop_car: '2号車', meal: '', snack: 'あり', activity: '（見本）公園で鬼ごっこ。友だちに順番をゆずれた。おやつは完食。' },
    { row_no: 10, kind: '利用', child: '児童B', service: '放デイ', pick_driver: '職員Y', pick_place: '△△小学校', pick_time: '14:40', pick_car: '2号車', start_time: '15:00', end_time: '17:30', drop_driver: '職員X', drop_place: '〇〇園', drop_time: '17:40', drop_car: '1号車', meal: '', snack: 'あり' },
    { row_no: 11, kind: '利用', child: '児童C', service: '児発', pick_driver: '送迎なし', pick_place: '', pick_time: '', pick_car: '', start_time: '10:00', end_time: '13:00', drop_driver: '送迎なし', drop_place: '', drop_time: '', drop_car: '', meal: 'あり', snack: '' },
    { row_no: 20, kind: '欠席', child: '児童D' },
  ],
  jisseki: [
    { day: '(今日)', child: '児童A', status: '未送付', start_time: '14:45', end_time: '17:00', source: '日誌' },
    { day: '(今日)', child: '児童B', status: '未送付', start_time: '15:00', end_time: '17:30', source: '日誌' },
    { day: '(昨日)', child: '児童C', status: '送付済み', start_time: '10:00', end_time: '13:00', source: '日誌' },
  ],
  kata: [
    // 列の並びと長さは本番の型表に合わせた見本（児童名は架空）。短い入力幅だと「毎週」「下野小学校」が切れる
    { 曜日: '月', 児童名: '児童A', 利用週: '毎週', 迎え順: '1', 送り順: '1', 利用終了: '17:00', 利用開始: '14:45', 迎え場所: '下野小学校', 迎え担当: '職員X', 迎え開始: '14:30', 送り担当: '職員Y', 送り終了: '17:15', 保護者送迎: '', '送り場所（空欄なら自宅）': '自宅', '学校お迎え時刻（基準）※空欄なら迎え開始': '14:25' },
    { 曜日: '月', 児童名: '児童B', 利用週: '毎週', 迎え順: '2', 送り順: '2', 利用終了: '17:30', 利用開始: '15:00', 迎え場所: '西日野にじ学園', 迎え担当: '職員Y', 迎え開始: '14:40', 送り担当: '職員X', 送り終了: '17:40', 保護者送迎: '', '送り場所（空欄なら自宅）': '〇〇園', '学校お迎え時刻（基準）※空欄なら迎え開始': '14:35' },
    { 曜日: '火', 児童名: '児童C', 利用週: '毎週', 迎え順: '', 送り順: '', 利用終了: '13:00', 利用開始: '10:00', 迎え場所: '', 迎え担当: '', 迎え開始: '', 送り担当: '', 送り終了: '', 保護者送迎: '○', '送り場所（空欄なら自宅）': '', '学校お迎え時刻（基準）※空欄なら迎え開始': '' },
  ],
  keikaku: [
    { 児童名: '児童A', 現在の期: '2期', 現在の計画期間: '2026年5月〜2026年10月', 次期開始月: '2026年11月', フォーム送付目安日: '2026/10/15', 計画書作成: '未', 原案署名: '未', 本案署名: '未' },
    { 児童名: '児童B', 現在の期: '1期', 現在の計画期間: '2026年3月〜2026年8月', 次期開始月: '2026年9月', フォーム送付目安日: '至急', 計画書作成: '済', 原案署名: '済', 本案署名: '未' },
    { 児童名: '児童C', 現在の期: '3期', 現在の計画期間: '2026年10月〜2027年3月', 次期開始月: '2027年4月', フォーム送付目安日: '2027/03/15', 計画書作成: '済', 原案署名: '済', 本案署名: '済' },
  ],
  haichi: [
    { 日付: '(今日)', 曜日: '', 利用児童数: '3', 職員名: '職員X', '役割(日誌)': '送迎運転手・保育士', '常勤/非常勤': '常勤', 配置開始: '10:00', 配置終了: '18:00', '配置時間(h)': '7.00' },
    { 日付: '(今日)', 曜日: '', 利用児童数: '3', 職員名: '職員Y', '役割(日誌)': '送迎運転手', '常勤/非常勤': '非常勤', 配置開始: '14:00', 配置終了: '18:00', '配置時間(h)': '4.00' },
  ],
  edits: [
    { day: '(今日)', row_key: '9', field: 'pick_time', old_value: '14:30', new_value: '14:40', who: '職員X', edited_at: '(今日 15:02)', status: '未反映' },
    { day: '(今日)', row_key: '10', field: 'drop_place', old_value: '自宅', new_value: '〇〇園', who: '職員Y', edited_at: '(今日 16:20)', status: '衝突', apply_note: 'シートの値が変わっていました（今の値: △△）' },
    { day: '(昨日)', row_key: '11', field: 'end_time', old_value: '13:00', new_value: '13:30', who: '職員X', edited_at: '(昨日 13:40)', status: '反映済' },
  ],
};
// 日誌で「直せる」項目。直すと1分ほどで Google の日誌に反映（box の apply_edits.py）
// activity＝日誌Q列（活動記録・LINEからスパークが書く児童の様子）。食事・おやつ・加算は料金に関わるので直さない（日誌で直接）
const NIKKI_FIELDS = [['activity','活動記録（児童の様子）'],['pick_place','迎え場所'],['pick_time','迎え時刻'],['pick_driver','迎え運転手'],['start_time','開始'],['end_time','終了'],
  ['drop_time','送り時刻'],['drop_driver','送り運転手'],['drop_place','送り場所']];

const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
const planText = b => esc(String(b || '').split('\n').filter(l => !/^【(利用者名|作成者)】/.test(l)).join('\n')).replace(/^(【[^】\n]*】|\d\.[^\n]*)/gm, '<b>$1</b>');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ログインの有効期限（約1時間）が切れたら、保存してある更新用の鍵で自動更新する
async function refreshSess() {
  const s = JSON.parse(localStorage.getItem('sess') || '{}'); if (!s.refresh) return false;
  try { const r = await fetch(C.supabaseUrl + '/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: { apikey: C.supabaseKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: s.refresh }) });
    if (!r.ok) return false; const j = await r.json();
    localStorage.setItem('sess', JSON.stringify({ ...s, token: j.access_token, refresh: j.refresh_token || s.refresh, exp: Date.now() + j.expires_in * 1000 })); return true; } catch (e) { return false; }
}
async function sb(path, opt = {}, retried) {
  let s = JSON.parse(localStorage.getItem('sess') || '{}');
  if (!DEMO && s.exp && s.exp < Date.now() + 30000 && !retried) { if (await refreshSess()) s = JSON.parse(localStorage.getItem('sess') || '{}'); }
  const r = await fetch(C.supabaseUrl + '/rest/v1/' + path, { ...opt,
    headers: { apikey: C.supabaseKey, Authorization: 'Bearer ' + s.token, 'Content-Type': 'application/json', ...(opt.headers || {}) } });
  if (r.status === 401 && !retried && await refreshSess()) return sb(path, opt, true);
  if (r.status === 401) throw new Error('ログインの有効期限が切れました。ページを再読み込みして、ログインし直してください（401）');
  if (!r.ok) throw new Error('読み込めませんでした（' + r.status + '）');
  if (r.status === 204) return null;
  const tx = await r.text(); if (!tx) return null; try { return JSON.parse(tx); } catch (e) { return null; }
}
// 期間: 今日・明日・今週（日誌タブがある日だけ。データは毎晩22時の同期分）
let PERIOD = 'today';
const addDays = (d, n) => { const x = new Date(d + 'T00:00:00+09:00'); x.setDate(x.getDate() + n); return x.toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' }); };
function range() {
  const t = today();
  if (PERIOD === 'tomorrow') return [addDays(t, 1), addDays(t, 1)];
  if (PERIOD === 'week') { const dow = (new Date(t + 'T00:00:00+09:00').getDay() + 6) % 7; return [addDays(t, -dow), addDays(t, 6 - dow)]; }
  return [t, t];
}
const PLABEL = { today: '今日', tomorrow: '明日', week: '今週' };
const periodTabs = view => '<p class="ptabs">' + Object.entries(PLABEL).map(([k, l]) =>
  `<button class="${k === PERIOD ? 'on' : ''}" onclick="PERIOD='${k}';renderLeoView('${view}')">${l}</button>`).join('') + '</p>';
const fmtDay = d => { const x = new Date(d + 'T00:00:00+09:00'); return isNaN(x) ? d : `${x.getMonth() + 1}/${x.getDate()}（${'日月火水木金土'[x.getDay()]}）`; };
async function loadNikki() {
  if (DEMO) return DEMO_DATA.nikki.map(r => ({ ...r, day: today() }));
  const [a, b] = range();
  return sb(`leo_nikki?day=gte.${a}&day=lte.${b}&order=day,row_no`);
}
const byDay = rows => { const m = {}; rows.forEach(r => (m[r.day] = m[r.day] || []).push(r)); return Object.entries(m); };
const noTab = () => '<p>この期間の日誌タブがまだありません（日誌は毎朝作られ、夜22時に取り込みます）。</p>';
// 配置表・型表・管理表：ポータルで入力したもの（leo_master）があればそれを使い、なければGoogleからの写し（leo_sheet）
const sheetRows = async kind => { if (DEMO) return (MASTER_DEMO[kind] || DEMO_DATA[kind]);
  const m = await sb(`leo_master?kind=eq.${kind}&order=row_no`); return m.length ? m.map(r => r.data) : (await sb(`leo_sheet?kind=eq.${kind}&order=row_no`)).map(r => r.data); };
// 見本：児童Bは10月末の退所予定、児童Dは退所済み。本番の退所日は leo_child_info.left_on（型表は触らない）
const DEMO_LEFT_INFOS = [{ name: '児童B', left_on: '2026-10-31', transport_mode: '送迎あり', soudan_office: '見本相談支援センター', soudan_person: '見本 相談員' }, { name: '児童D', left_on: '2026-09-30' }];
async function loadLeftIndex() {
  if (DEMO) return leftIndex(DEMO_LEFT_INFOS);
  try { const rows = await sb('leo_child_info?select=name,left_on&left_on=not.is.null'); return leftIndex(rows || []); }
  catch (e) { return {}; }
}
const leftMark = (idx, name, todayStr) => {
  const d = leftOnOf(idx, name); if (!d) return '';
  const on = d < todayStr, bg = on ? '#666' : '#c60';
  return ` <span style="background:${bg};color:#fff;border-radius:4px;padding:0 5px;font-size:12px">${on ? '退所' : '退所予定'} ${esc(String(d).replace(/-/g, '/'))}</span>`;
};
const MASTER_DEMO = {};
async function myName() {
  if (DEMO) return DEMO_DATA.me;
  const p = await sb('staff_profiles?select=nikki_name');
  return p[0]?.nikki_name || '';
}
const same = (a, b) => a && b && a.replace(/\s/g, '') === b.replace(/\s/g, '');
const LEO_PLAN_NOTE = '予定表から表示（日誌取り込み前）。車は日誌の取り込み後に出ます。';
function leoKidVal(obj, name) {
  if (!obj || !name) return '';
  if (obj[name] != null && obj[name] !== '') return obj[name];
  const want = String(name).replace(/\s/g, '');
  const key = Object.keys(obj).find(k => String(k).replace(/\s/g, '') === want);
  return key && obj[key] != null ? obj[key] : '';
}
function leoPlanJobs(events) {
  const jobs = [];
  for (const e of events || []) {
    if (e.kind !== '迎え' && e.kind !== '送り') continue;
    const kids = (e.kids && e.kids.length) ? e.kids.slice() : (e.child ? [e.child] : ['']);
    kids.forEach(c => jobs.push({
      day: e.day, t: leoKidVal(e.kid_times, c) || e.start_time || '', k: e.kind, c,
      p: leoKidVal(e.kid_places, c) || e.place || '', dr: e.staff || '', car: e.car || '',
    }));
  }
  jobs.sort((a, b) => (a.day || '').localeCompare(b.day || '') || (a.t || '99').localeCompare(b.t || '99') || (a.k === b.k ? 0 : a.k === '迎え' ? -1 : 1));
  return jobs;
}
const LEO_CAL_DEL = 'カレンダーで削除';
function leoCalHidden(e) {
  return !!(e && e.source === 'portal' && (e.title === LEO_CAL_DEL || e.note === LEO_CAL_DEL));
}
function leoAbsLabel(e) {
  if (!e) return '';
  const title = String(e.title || ''), note = String(e.note || '');
  if (title === '欠席（欠席時対応加算）' || note.includes('区分:欠席（欠席時対応加算）') || note.includes('区分：欠席（欠席時対応加算）')) return '欠席（欠席時対応加算）';
  if (title === 'キャンセル' || note.includes('区分:キャンセル') || note.includes('区分：キャンセル')) return 'キャンセル';
  return '';
}
function leoAbsContact(e) {
  const m = String((e && e.note) || '').match(/連絡日[:：]\s*(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}
function leoEvNewer(a, b) {
  const ta = Date.parse(a && a.updated_at), tb = Date.parse(b && b.updated_at);
  const na = Number.isFinite(ta) ? ta : 0, nb = Number.isFinite(tb) ? tb : 0;
  if (na !== nb) return na > nb;
  return (Number(a && a.id) || 0) >= (Number(b && b.id) || 0);
}
function leoPortalHits(events) {
  const best = new Map();
  const consider = (day, kind, name, e) => {
    if (!day || !name) return;
    const key = day + '|' + kind + '|' + ldNN(name);
    const prev = best.get(key);
    if (!prev || leoEvNewer(e, prev.e)) best.set(key, { e, name });
  };
  for (const e of events || []) {
    if (!e || e.source !== 'portal') continue;
    if (e.kind === '利用') consider(e.day, '利用', e.child, e);
    else if (e.kind === '迎え' || e.kind === '送り') {
      const kids = (e.kids && e.kids.length) ? e.kids : (e.child ? [e.child] : []);
      kids.forEach(k => consider(e.day, e.kind, k, e));
    }
  }
  return best;
}
function leoMergeNikki(rows, events) {
  const hits = leoPortalHits(events);
  const out = (rows || []).map(r => ({ ...r }));
  const use = new Map();
  out.forEach(r => { if (r.kind === '利用') use.set(r.day + '|' + ldNN(r.child), r); });
  const ensure = (day, name, create) => {
    const k = day + '|' + ldNN(name);
    let row = use.get(k);
    if (!row && create) {
      row = { day, kind: '利用', child: name, service: '', start_time: '', end_time: '', pick_time: '', pick_place: '', pick_driver: '', pick_car: '', drop_time: '', drop_place: '', drop_driver: '', drop_car: '', _added: true };
      out.push(row);
      use.set(k, row);
    }
    return row || null;
  };
  for (const [key, hit] of hits) {
    const kind = key.split('|')[1];
    const e = hit.e, name = hit.name, hidden = leoCalHidden(e);
    const row = ensure(e.day, name, !hidden);
    if (!row) continue;
    if (kind === '利用') {
      if (hidden) { row._hide = true; row._calUse = 'del'; }
      else {
        row._hide = false;
        row.start_time = e.start_time || '';
        row.end_time = e.end_time || '';
        row._calUse = true;
        if (e.child) row.child = e.child;
      }
    } else if (kind === '迎え') {
      if (hidden) { row._calPick = 'del'; row._pickWas = e.staff || row.pick_driver || ''; row.pick_time = ''; row.pick_place = ''; row.pick_driver = ''; }
      else {
        row.pick_time = leoKidVal(e.kid_times, name) || e.start_time || '';
        row.pick_place = leoKidVal(e.kid_places, name) || e.place || '';
        row.pick_driver = e.staff || '';
        row._calPick = true;
      }
    } else if (kind === '送り') {
      if (hidden) { row._calDrop = 'del'; row._dropWas = e.staff || row.drop_driver || ''; row.drop_time = ''; row.drop_place = ''; row.drop_driver = ''; }
      else {
        row.drop_time = leoKidVal(e.kid_times, name) || e.start_time || '';
        row.drop_place = leoKidVal(e.kid_places, name) || e.place || '';
        row.drop_driver = e.staff || '';
        row._calDrop = true;
      }
    }
  }
  for (const e of events || []) {
    if (!e || e.source !== 'portal' || e.kind !== '休み' || !e.child) continue;
    const label = leoAbsLabel(e);
    if (!label) continue;
    const useHit = hits.get(e.day + '|利用|' + ldNN(e.child));
    if (useHit && !leoCalHidden(useHit.e) && leoEvNewer(useHit.e, e)) continue;
    const row = ensure(e.day, e.child, true);
    if (!row) continue;
    row._hide = true;
    row._abs = label;
    row._absContact = leoAbsContact(e);
    row._calUse = 'del';
  }
  return out;
}
function demoCalEdits() {
  const d = typeof today === 'function' ? today() : '';
  return [
    { id: 9001, day: d, kind: '迎え', kids: ['児童A'], staff: '職員X', start_time: '14:50', place: '見本公園', kid_times: { '児童A': '14:50' }, kid_places: { '児童A': '見本公園' }, source: 'portal', updated_at: '2099-01-01T00:00:00.000Z' },
    { id: 9002, day: d, kind: '休み', child: '児童C', title: '欠席（欠席時対応加算）', note: '連絡日:' + d + '\n区分:欠席（欠席時対応加算）', source: 'portal', updated_at: '2099-01-01T00:00:00.000Z' },
  ];
}
function leoCalMark(on) { return on ? '<br><small>カレンダーで変更</small>' : ''; }
function leoPlanTableHtml(events, care) {
  const CARE = care || {}, jobs = leoPlanJobs(events), map = {}, days = [];
  jobs.forEach(j => { if (!map[j.day]) { map[j.day] = []; days.push(j.day); } map[j.day].push(j); });
  const cell = (v, ng) => v ? esc(v) : `<b style="color:#c00">${ng}</b>`;
  return days.map(d => `<h4>${fmtDay(d)}　予定表</h4><div class="sheet-scroll"><table class="sougei-view"><tr><th>時刻</th><th></th><th>児童</th><th>場所</th><th>担当</th><th>車</th></tr>${map[d].map(j =>
    `<tr><td>${esc(j.t)}</td><td>${esc(j.k)}</td><td>${esc(j.c)}${CARE[j.c] ? `<br><small style="color:#c60">⚠ ${esc(CARE[j.c])}</small>` : ''}</td><td>${esc(j.p) || '自宅'}</td><td>${cell(j.dr, '未定')}</td><td>${cell(j.car, '未定')}</td></tr>`).join('')}</table></div>`).join('');
}
function leoTileStatus(nikkiRows, events, day) {
  const all = (nikkiRows || []).filter(r => r.day === day);
  const ev = (events || []).filter(e => e.day === day);
  if (all.length) {
    const merged = leoMergeNikki(all, ev);
    const rs = merged.filter(r => r.kind === '利用' && !r._hide);
    if (!rs.length) return merged.some(r => r._hide) ? '0人' : '日誌なし';
    const bad = rs.reduce((n, r) => n + (r._calPick === 'del' ? 0 : (!r.pick_driver || !r.pick_car ? 1 : 0)) + (r._calDrop === 'del' ? 0 : (!r.drop_driver || !r.drop_car ? 1 : 0)), 0);
    return bad ? `<b style="color:#c00">未確定 ${bad}件</b>（${rs.length}人）` : `${rs.length}人・確定`;
  }
  const live = ev.filter(e => !leoCalHidden(e));
  const names = new Set();
  live.filter(e => e.kind === '利用' && e.child).forEach(e => names.add(String(e.child).replace(/\s/g, '')));
  if (!names.size) live.filter(e => e.kind === '迎え' || e.kind === '送り').forEach(e => {
    const kids = (e.kids && e.kids.length) ? e.kids : (e.child ? [e.child] : []);
    kids.forEach(k => k && names.add(String(k).replace(/\s/g, '')));
  });
  return names.size ? `予定表 ${names.size}人` : '日誌なし';
}
function leoKidTile(nikkiRows, events, day) {
  const all = (nikkiRows || []).filter(r => r.day === day);
  const ev = (events || []).filter(e => e.day === day);
  if (all.length) return leoMergeNikki(all, ev).filter(r => r.kind === '利用' && !r._hide).length + '人';
  const names = new Set();
  ev.filter(e => e.day === day && e.kind === '利用' && e.child && !leoCalHidden(e)).forEach(e => names.add(String(e.child).replace(/\s/g, '')));
  return names.size ? `予定 ${names.size}人` : '0人';
}
function leoKidWarnHtml(lines) {
  return lines && lines.length ? `<div style="background:#fff6e5;border-left:4px solid #e8833a;padding:6px 8px;margin:6px 0">${lines.map(x => '⚠ ' + esc(x)).join('<br>')}</div>` : '';
}
function leoFullChildName(name, roster) {
  const raw = String(name || '').trim();
  if (!raw) return '';
  const toks = typeof childTokens === 'function' ? childTokens(raw) : raw.split(/\s+/).filter(Boolean);
  if (toks.length >= 2) return typeof canonChildName === 'function' ? canonChildName(raw) : raw;
  if (typeof sameChildName !== 'function') return raw;
  const canon = n => typeof canonChildName === 'function' ? canonChildName(n) : String(n || '').trim();
  const hits = [...new Set((roster || []).filter(n => n && sameChildName(n, raw)).map(canon).filter(Boolean))];
  const longs = hits.filter(n => (typeof childTokens === 'function' ? childTokens(n) : String(n).split(/\s+/).filter(Boolean)).length >= 2);
  if (longs.length === 1) return longs[0];
  if (hits.length === 1) return hits[0];
  return typeof canonChildName === 'function' ? canonChildName(raw) : raw;
}
function leoFindChildPlan(plans, name) {
  const list = plans || [];
  const nn = s => String(s || '').replace(/\s/g, '');
  const hit = list.find(x => nn(x.name) === nn(name));
  if (hit) return hit;
  if (typeof sameChildName !== 'function') return null;
  const hits = list.filter(x => sameChildName(x.name, name));
  return hits.length === 1 ? hits[0] : null;
}
// 今日の利用児童の「本計画」は本文の展開だけ。Googleドキュメント等はここから開かない。
function leoKidPlanHtml(name, plan) {
  const label = `📋 本計画${plan && (plan.term || plan.period) ? `（${esc(plan.term || '')}　${esc(plan.period || '')}）` : ''}`;
  if (plan && String(plan.body || '').trim()) {
    return `<details style="margin-top:6px"><summary style="cursor:pointer;font-weight:bold;color:#36c">${label}を読む</summary><div style="white-space:pre-wrap;line-height:1.7;background:#f7f9fc;border:1px solid #dde;border-radius:6px;padding:10px;margin-top:6px">${planText(plan.body)}</div></details>`;
  }
  return `<p style="margin-top:6px"><small>本計画PDFはまだ登録されていません</small></p>`;
}
function leoSougeiMineHtml(me, rows, events, care) {
  const CARE = care || {};
  const logged = new Set((rows || []).map(r => r.day));
  const days = [...logged].sort();
  const body = days.map(d => {
    const merged = leoMergeNikki((rows || []).filter(r => r.day === d), (events || []).filter(e => e.day === d));
    const jobs = [];
    merged.filter(r => r.kind === '利用' && !r._hide).forEach(r => {
      if (r._calPick === 'del' ? same(r._pickWas, me) : same(r.pick_driver, me)) jobs.push({ t: r.pick_time, k: '迎え', c: r.child, p: r.pick_place, car: r.pick_car, cal: r._calPick || false });
      if (r._calDrop === 'del' ? same(r._dropWas, me) : same(r.drop_driver, me)) jobs.push({ t: r.drop_time, k: '送り', c: r.child, p: r.drop_place, car: r.drop_car, cal: r._calDrop || false });
    });
    jobs.sort((a, b) => (a.t || '99').localeCompare(b.t || '99'));
    const tr = j => `<tr><td>${j.cal === 'del' ? '' : esc(j.t || '')}</td><td>${esc(j.k)}</td><td>${esc(j.c)}${CARE[j.c] ? `<br><small style="color:#c60">⚠ ${esc(CARE[j.c])}</small>` : ''}${leoCalMark(!!j.cal)}</td><td>${j.cal === 'del' ? '' : esc(j.p || '')}</td><td>${j.cal === 'del' ? '' : esc(j.car || '')}</td></tr>`;
    return `<h4>${fmtDay(d)}</h4>` + (jobs.length ? `<table><tr><th>時刻</th><th></th><th>児童</th><th>場所</th><th>車</th></tr>${jobs.map(tr).join('')}</table>` : '<p>担当はありません。</p>');
  }).join('');
  const extra = (events || []).filter(e => !logged.has(e.day) && !leoCalHidden(e) && (e.kind === '迎え' || e.kind === '送り') && same(e.staff, me));
  const extraHtml = extra.length ? `<p class="note">${LEO_PLAN_NOTE}</p>${leoPlanTableHtml(extra, CARE)}` : '';
  return `<h3>${PLABEL[PERIOD]}の送迎（${esc(me) || '名前未登録'} さんの担当）</h3>${periodTabs('sougei')}${demoNote()}${body}${extraHtml}<p class="note"><a href="#leo/sougeiall">みんなの送迎を見る</a></p>`;
}
function leoSougeiAllHtml(rows, events, care) {
  const CARE = care || {};
  const logged = new Set((rows || []).map(r => r.day));
  const plan = (events || []).filter(e => !logged.has(e.day) && !leoCalHidden(e));
  const cell = (v, ng) => v ? esc(v) : `<b style="color:#c00">${ng}</b>`;
  const nikkiHtml = [...logged].sort().map(d => {
    const merged = leoMergeNikki((rows || []).filter(r => r.day === d), (events || []).filter(e => e.day === d));
    const rs = merged.filter(r => r.kind === '利用' && !r._hide);
    const gone = merged.filter(r => r.kind === '利用' && r._hide);
    if (!rs.length) return gone.length ? `<h4>${fmtDay(d)}</h4><p><small>カレンダーで変更（この日の利用なし）：${gone.map(r => esc(r.child)).join('、')}</small></p>` : '';
    const jobs = [];
    rs.forEach(r => {
      jobs.push({ t: r.pick_time, k: '迎え', c: r.child, p: r.pick_place, dr: r.pick_driver, car: r.pick_car, cal: r._calPick || false });
      jobs.push({ t: r.drop_time, k: '送り', c: r.child, p: r.drop_place, dr: r.drop_driver, car: r.drop_car, cal: r._calDrop || false });
    });
    jobs.sort((a, b) => (a.t || '99').localeCompare(b.t || '99') || (a.k === '迎え' ? -1 : 1));
    const bad = jobs.filter(j => j.cal !== 'del' && (!j.dr || !j.car)).length;
    const goneHtml = gone.length ? `<p><small>カレンダーで変更（この日の利用なし）：${gone.map(r => esc(r.child)).join('、')}</small></p>` : '';
    return `<h4>${fmtDay(d)}　${bad ? `<span style="color:#c00">未確定 ${bad}件</span>` : '全て確定'}</h4>${goneHtml}<div class="sheet-scroll"><table class="sougei-view"><tr><th>時刻</th><th></th><th>児童</th><th>場所</th><th>担当</th><th>車</th></tr>${jobs.map(j =>
      `<tr><td>${j.cal === 'del' ? '' : esc(j.t || '')}</td><td>${esc(j.k)}</td><td>${esc(j.c)}${CARE[j.c] ? `<br><small style="color:#c60">⚠ ${esc(CARE[j.c])}</small>` : ''}${leoCalMark(!!j.cal)}</td><td>${j.cal === 'del' ? '' : (esc(j.p) || '自宅')}</td><td>${j.cal === 'del' ? '' : cell(j.dr, '未定')}</td><td>${j.cal === 'del' ? '' : cell(j.car, '未定')}</td></tr>`).join('')}</table></div>`;
  }).join('');
  const planHtml = plan.length ? `<p class="note">${LEO_PLAN_NOTE}</p>${leoPlanTableHtml(plan, CARE)}` : '';
  const body = (nikkiHtml || planHtml) ? `${nikkiHtml}${planHtml}` : noTab();
  return `<h3>${PLABEL[PERIOD]}の送迎（全員分）</h3>${periodTabs('sougeiall')}${demoNote()}<p><a href="#leo/sougei">自分の担当だけ見る</a>　<small>変更はカレンダー・日誌が正です。赤字は未確定（担当者か車が空）。</small></p>${body}`;
}
const ldNN = s => String(s || '').replace(/\s/g, '');
const demoNote = () => DEMO ? '<p class="note">見本データです（架空）</p>' : '';

const LEO_VIEWS = {
  async sougei() {
    const [rows0, me, cc, LEFT] = await Promise.all([loadNikki(), myName(), DEMO ? [{ child: '児童A', note: '（見本）助手席の後ろ。降車時は母へ直接引き渡し。' }] : sb('leo_child_care').catch(() => []), loadLeftIndex()]);
    const rows = filterByLeftDay(rows0, LEFT);
    const CARE = Object.fromEntries(cc.filter(x => x.note).map(x => [x.child, x.note]));
    const days = byDay(rows.filter(r => r.kind === '利用'));
    return `<h3>${PLABEL[PERIOD]}の送迎（${esc(me) || '名前未登録'} さんの担当）</h3>${periodTabs('sougei')}${demoNote()}` + (days.length ? days.map(([d, rs]) => {
      const jobs = [];
      rs.forEach(r => {
        if (same(r.pick_driver, me)) jobs.push({ t: r.pick_time, k: '迎え', c: r.child, p: r.pick_place, car: r.pick_car });
        if (same(r.drop_driver, me)) jobs.push({ t: r.drop_time, k: '送り', c: r.child, p: r.drop_place, car: r.drop_car });
      });
      jobs.sort((a, b) => (a.t || '').localeCompare(b.t || ''));
      return `<h4>${fmtDay(d)}</h4>` + (jobs.length ? `<table><tr><th>時刻</th><th></th><th>児童</th><th>場所</th><th>車</th></tr>${jobs.map(j =>
        `<tr><td>${esc(j.t)}</td><td>${j.k}</td><td>${esc(j.c)}${CARE[j.c] ? `<br><small style="color:#c60">⚠ ${esc(CARE[j.c])}</small>` : ''}</td><td>${esc(j.p)}</td><td>${esc(j.car)}</td></tr>`).join('')}</table>` : '<p>担当はありません。</p>');
    }).join('') : noTab());
  },
  async sougeiall() {
    const [a, b] = range();
    const [rows0, ev0, cc, LEFT] = await Promise.all([
      loadNikki(),
      (typeof DEMO !== 'undefined' && DEMO && typeof demoCalEdits === 'function' ? demoCalEdits() : sb(`leo_events?day=gte.${a}&day=lte.${b}&kind=in.(利用,迎え,送り,休み)&order=day,start_time`).catch(() => [])),
      DEMO ? [] : sb('leo_child_care').catch(() => []),
      loadLeftIndex()]);
    const rows = filterByLeftDay(rows0, LEFT);
    const evs = typeof filterEventsByLeft === 'function' ? filterEventsByLeft(ev0 || [], LEFT) : (ev0 || []);
    const CARE = Object.fromEntries(cc.filter(x => x.note).map(x => [x.child, x.note]));
    return leoSougeiAllHtml(rows, evs, CARE);
  },
  async kids() {
    const [a, b] = range();
    const evPromise = DEMO ? Promise.resolve(demoCalEdits()) : sb(`leo_events?day=gte.${a}&day=lte.${b}&kind=in.(利用,迎え,送り,休み)&order=day,start_time`).catch(() => []);
    const [rows0, cc, ci, cp, LEFT, ev0] = await Promise.all([loadNikki(), DEMO ? [] : sb('leo_child_care').catch(() => []), DEMO ? [] : sb('leo_child_info?select=name,note').catch(() => []), DEMO ? [] : sb('leo_child_plan').catch(() => []), loadLeftIndex(), evPromise]);
    const rows = filterByLeftDay(rows0, LEFT);
    const evs = typeof filterEventsByLeft === 'function' ? filterEventsByLeft(ev0 || [], LEFT) : (ev0 || []);
    const N = s => String(s || '').replace(/\s/g, '');
    const days = byDay(rows);
    const planOf = c => leoFindChildPlan(cp, c);
    const roster = [...ci.map(x => x.name), ...cp.map(x => x.name), ...cc.map(x => x.child)].filter(Boolean);
    const disp = c => leoFullChildName(c, roster);
    const msg = c => [...cc.filter(x => (typeof sameChildName === 'function' ? sameChildName(x.child, c) : N(x.child) === N(c)) && x.note).map(x => '送迎の配慮：' + x.note), ...ci.filter(x => (typeof sameChildName === 'function' ? sameChildName(x.name, c) : N(x.name) === N(c)) && x.note).map(x => 'メモ：' + x.note)];
    const head = `<h3>${PLABEL[PERIOD]}の利用児童</h3>${periodTabs('kids')}${demoNote()}<p><small>伝達事項は <a href="#leo/userinfo">利用者情報</a>（メモ・送迎の配慮）に書いたものです。</small></p>`;
    const ride = (label, flag, time, place, driver) => flag === 'del' ? `${label}：カレンダーで変更` : `${label}：${esc(time)} ${esc(place || '自宅')}（${esc(driver) || '未定'}）`;
    if (!days.length && !DEMO) {
      let ev = evs.filter(e => e.kind === '利用' && e.child && !leoCalHidden(e));
      if (!ev.length) {
        try { ev = await sb(`leo_events?day=gte.${a}&day=lte.${b}&kind=eq.利用&order=day,start_time`); } catch (e) { ev = []; }
        ev = typeof filterEventsByLeft === 'function' ? filterEventsByLeft(ev || [], LEFT) : (ev || []);
        ev = (ev || []).filter(e => e.child && !leoCalHidden(e));
      }
      const absEvents = (evs || []).filter(e => e.kind === '休み' && e.child && leoAbsLabel(e));
      const absBy = {};
      absEvents.forEach(e => { (absBy[e.day] = absBy[e.day] || []).push(e); });
      const absBlock = Object.keys(absBy).sort().map(d => `<h4>${fmtDay(d)}</h4><p>欠席：${absBy[d].map(e => `${esc(disp(e.child))}（${esc(leoAbsLabel(e))}${leoAbsContact(e) ? '・連絡 ' + esc(leoAbsContact(e)) : ''}）`).join('、')}</p>`).join('');
      if (ev.length) {
        const by = {};
        ev.forEach(e => { (by[e.day] = by[e.day] || []).push(e); });
        return head + `<p class="note">予定表から表示（日誌取り込み前）</p>` + Object.keys(by).sort().map(d => `<h4>${fmtDay(d)}（${by[d].length}人）</h4>${by[d].map(e =>
          `<div class="card" style="margin:8px 0"><b style="font-size:18px">${esc(disp(e.child))}</b>　${esc(e.start_time || '')}〜${esc(e.end_time || '')}${leoKidWarnHtml(msg(e.child))}${leoKidPlanHtml(e.child, planOf(e.child))}</div>`).join('')}`).join('') + absBlock;
      }
      if (absBlock) return head + absBlock;
    }
    if (!days.length) return head + noTab();
    return head + days.map(([d, rs]) => {
      const merged = leoMergeNikki(rs, evs.filter(e => e.day === d));
      const use = merged.filter(r => r.kind === '利用' && !r._hide);
      const calAbs = merged.filter(r => r._abs);
      const absNames = new Set(calAbs.map(r => N(r.child)));
      const abs = merged.filter(r => r.kind === '欠席' && !absNames.has(N(r.child)));
      const gone = merged.filter(r => r.kind === '利用' && r._hide && !r._abs);
      const absHtml = calAbs.map(r => `${esc(disp(r.child))}（${esc(r._abs)}${r._absContact ? '・連絡 ' + esc(r._absContact) : ''}）`).concat(abs.map(r => esc(disp(r.child))));
      return `<h4>${fmtDay(d)}（${use.length}人）</h4>${use.map(r => { const m = msg(r.child);
        const note = (r._calUse === true || r._calPick === true || r._calDrop === true) ? '<br><small>カレンダーで変更</small>' : '';
        return `<div class="card" style="margin:8px 0"><b style="font-size:18px">${esc(disp(r.child))}</b>　${esc(r.service)}　${esc(r.start_time)}〜${esc(r.end_time)}<br><small>${ride('迎え', r._calPick, r.pick_time, r.pick_place, r.pick_driver)}／${ride('送り', r._calDrop, r.drop_time, r.drop_place, r.drop_driver)}</small>${note}
        ${leoKidWarnHtml(m)}${leoKidPlanHtml(r.child, planOf(r.child))}</div>`; }).join('')}
        ${gone.length ? `<p><small>カレンダーで変更（この日の利用なし）：${gone.map(r => esc(disp(r.child))).join('、')}</small></p>` : ''}
        ${absHtml.length ? `<p>欠席：${absHtml.join('、')}</p>` : ''}`;
    }).join('');
  },
  async kata() {
    const [rows, LEFT] = await Promise.all([sheetRows('kata'), loadLeftIndex()]), tday = today();
    const active = rows.filter(r => !leftDone(LEFT, r['児童名'], tday));
    const dows = [...new Set(active.map(r => r['曜日']).filter(Boolean))].sort((a, b) => '月火水木金土日'.indexOf(a) - '月火水木金土日'.indexOf(b));
    const cell = r => `${esc(r['児童名'])}${leftMark(LEFT, r['児童名'], tday)}`;
    const leftNames = [...new Set(rows.filter(r => leftDone(LEFT, r['児童名'], tday)).map(r => r['児童名']).filter(Boolean))];
    return `<h3>送迎 型表（曜日ごと・見るだけ）</h3>${demoNote()}<p class="note">いつもの予定です。その日の変更は日誌・カレンダーが正です。退所した児童は下に分けて表示しています（型表の行は残したまま、保存はしていません）。</p>` + dows.map(w =>
      `<h4>${w}曜日</h4><div class="sheet-scroll"><table class="kata-view"><tr><th>児童</th><th>迎え</th><th>送り</th></tr>${active.filter(r => r['曜日'] === w).map(r => r['保護者送迎']
        ? `<tr><td>${cell(r)}</td><td colspan="2">保護者送迎（${esc(r['利用開始'])}〜${esc(r['利用終了'])}）</td></tr>`
        : `<tr><td>${cell(r)}</td><td>${esc(r['迎え開始'])} ${esc(r['迎え担当'])}<br><small>${esc(r['迎え場所'])}</small></td><td>${esc(r['送り終了'])} ${esc(r['送り担当'])}<br><small>${esc(r['送り場所（空欄なら自宅）']) || '自宅'}</small></td></tr>`).join('')}</table></div>`).join('')
      + (leftNames.length ? `<details style="margin-top:12px"><summary style="cursor:pointer;font-weight:bold">退所した児童（${leftNames.length}人）</summary><p class="note">型表には残しています。退所日の翌日以降の利用予定・カレンダー・送迎には出しません。</p><ul>${leftNames.map(n => `<li>${esc(n)}${leftMark(LEFT, n, tday)}</li>`).join('')}</ul></details>` : '');
  },
  async keikaku() {
    const [rows, LEFT] = await Promise.all([sheetRows('keikaku'), loadLeftIndex()]);
    const tday = today(), t = new Date(tday + 'T00:00:00+09:00');
    const due = r => { // 期限＝次期開始月の1日。送付目安日が「至急」なら期限切れ扱い
      const m = String(r['次期開始月']).match(/(\d{4})年(\d{1,2})月/); return m ? new Date(+m[1], +m[2] - 1, 1) : null; };
    const level = r => { const d = due(r), done = r['本案署名'] === '済';
      if (done) return ['ok', '本案署名済'];
      if (r['フォーム送付目安日'] === '至急' || (d && d < t)) return ['over', '期限切れ'];
      if (d && (d - t) / 864e5 <= 30) return ['soon', '30日以内'];
      return ['', '']; };
    const card = ({ r, l }) => `<div class="card rec kk ${leftDone(LEFT, r['児童名'], tday) ? '' : l[0]}"><b>${esc(r['児童名'])}</b>${leftMark(LEFT, r['児童名'], tday)} ${l[1] && !leftDone(LEFT, r['児童名'], tday) ? `<span class="badge">${l[1]}</span>` : ''}
        <br>${esc(r['現在の期'])}・${esc(r['現在の計画期間'])}<br>次期開始：<b>${esc(r['次期開始月'])}</b>　フォーム送付目安：${esc(r['フォーム送付目安日'])}
        <br><small>フォーム回答 ${esc(r['フォーム回答日']) || 'なし'}／計画書 ${esc(r['計画書作成'])}／原案署名 ${esc(r['原案署名'])}／本案署名 ${esc(r['本案署名'])}</small></div>`;
    const list = rows.map(r => ({ r, l: level(r), d: due(r) })).sort((a, b) => (a.d || 0) - (b.d || 0));
    const live = list.filter(x => !leftDone(LEFT, x.r['児童名'], tday)), gone = list.filter(x => leftDone(LEFT, x.r['児童名'], tday));
    return `<h3>個別支援計画 管理表（見るだけ）</h3>${demoNote()}<p class="note">赤＝期限切れ、黄＝30日以内。期限は「次期開始月」の1日として計算しています。退所日を過ぎた児童は下に分けています（行は残しています）。</p>` +
      live.map(card).join('') + (gone.length ? `<details style="margin-top:12px"><summary style="cursor:pointer;font-weight:bold">退所した児童（${gone.length}人・記録は残しています）</summary>${gone.map(card).join('')}</details>` : '');
  },
  async haichi() {
    const rows = await sheetRows('haichi');
    const t = today().replace(/-/g, '/');
    const days = [...new Set(rows.map(r => r['日付']))];
    const pick = DEMO ? days : days.filter(d => d >= t).slice(0, 7);
    const show = pick.length ? pick : days.slice(-3);
    return `<h3>職員配置表（見るだけ）</h3>${demoNote()}<p class="note">日誌から作られた配置です（${pick.length ? '今日以降' : '直近'}）。職員名は届け出上の名前です。</p>` + show.map(d => {
      const rs = rows.filter(r => r['日付'] === d);
      return `<h4>${esc(d)}（${esc(rs[0]['曜日'])}） 児童${esc(rs[0]['利用児童数'])}人</h4><table><tr><th>職員</th><th>時間</th><th>役割</th></tr>${rs.map(r =>
        `<tr><td>${esc(filingDriverName(r['職員名']))}<br><small>${esc(r['常勤/非常勤'])}</small></td><td>${esc(r['配置開始'])}〜${esc(r['配置終了'])}</td><td><small>${esc(r['役割(日誌)'])}</small></td></tr>`).join('')}</table>`;
    }).join('');
  },
  async edits() {
    if (ROLE !== '事務') return '<p>事務の方だけが見られる画面です。</p>';
    let rows;
    if (DEMO) rows = DEMO_DATA.edits;
    else {
      const [e, p] = await Promise.all([sb('leo_edits?order=edited_at.desc&limit=100'), sb('staff_profiles?select=user_id,nikki_name')]);
      const nm = Object.fromEntries(p.map(x => [x.user_id, x.nikki_name]));
      rows = e.map(x => ({ ...x, who: nm[x.edited_by] || '（不明）', edited_at: new Date(x.edited_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) }));
    }
    const label = Object.fromEntries([...NIKKI_FIELDS, ['meal', '食事'], ['snack', 'おやつ']]);
    const cnt = st => rows.filter(r => r.status === st).length;
    return `<h3>直した所</h3>${demoNote()}<p class="note">職員がポータルで直した内容（最新100件）。直すと1分ほどで日誌に反映されます。<b>衝突</b>は日誌が先に変わっていたため反映していないもの。日誌を見て必要ならもう一度直してください。</p>
      <p>衝突 <b style="color:#d33">${cnt('衝突')}</b>件・反映待ち ${cnt('未反映')}件・反映済 ${cnt('反映済')}件</p>` +
      (rows.length ? `<table><tr><th>日付・行</th><th>項目</th><th>前 → 後</th><th>状態</th></tr>${rows.map(r =>
        `<tr${r.status === '衝突' ? ' style="background:#fdecec"' : ''}><td>${esc(r.day)}<br><small>${esc(r.row_key)}行</small></td><td>${esc(label[r.field] || r.field)}<br><small>${esc(r.who)} ${esc(r.edited_at)}</small></td><td><s>${esc(r.old_value)}</s> → <b>${esc(r.new_value)}</b></td><td>${esc(r.status)}${r.apply_note && r.status !== '反映済' ? `<br><small>${esc(r.apply_note)}</small>` : ''}</td></tr>`).join('')}</table>` : '<p>まだ修正はありません。</p>');
  },
  async nikki() {
    PERIOD = 'today';
    const rows = (await loadNikki()).filter(r => r.kind === '利用');
    let act = [];
    if (!DEMO) try { act = await sb(`leo_activity?day=eq.${today()}`); } catch (e) { }
    const A = Object.fromEntries(act.map(x => [String(x.child || '').replace(/\s/g, ''), x]));
    return `<h3>今日の日誌（見る・直す）</h3>${demoNote()}<p class="note">直したらすぐ日誌に反映されます（1分ほど）。日誌のほうが先に変わっていたときは反映せず「衝突」になります。食事・おやつは日誌で直接直してください。活動記録はLINE下書きからの自動転記分も表示します。運転手欄は届け出上の担当名です（送迎・予定の画面は実際の運転者のままです）。</p>` +
      rows.map(r => { const a = A[String(r.child || '').replace(/\s/g, '')], actVal = (a && a.text) || r.activity || '';
        return `<div class="card rec"><b>${esc(r.child)}</b>（${esc(r.service)}）${a ? `<small>　活動記録：${esc(a.source)}</small>` : ''}
        ${NIKKI_FIELDS.map(([f, l]) => {
          const raw = f === 'activity' ? actVal : (r[f] ?? '');
          const shown = nikkiShownValue(f, raw);
          return f === 'activity'
            ? `<label>${l}<textarea rows="6" data-row="${r.row_no}" data-f="${f}" data-old="${esc(raw)}">${esc(shown)}</textarea></label>`
            : `<label>${l}<input data-row="${r.row_no}" data-f="${f}" data-old="${esc(raw)}" value="${esc(shown)}"></label>`;
        }).join('')}</div>`; }).join('') +
      `<button onclick="saveNikki()">直した所を送る</button><div id="saved"></div>`;
  },
  async jisseki() {
    const rows = DEMO ? DEMO_DATA.jisseki : await sb('leo_jisseki?order=day.desc,child&limit=200');
    let nk = [];
    if (DEMO) nk = DEMO_DATA.nikki;
    else if (rows.length) {
      const days = [...new Set(rows.map(r => r.day).filter(Boolean))];
      if (days.length) nk = await sb(`leo_nikki?day=in.(${days.join(',')})&select=day,child,kind,pick_driver,drop_driver`);
    }
    const by = {};
    nk.forEach(n => {
      const k = DEMO ? n.child : (n.day + n.child);
      const prev = by[k];
      if (!prev || (n.kind === '利用' && prev.kind !== '利用')) by[k] = n;
    });
    const trip = r => filingTripDrivers(by[DEMO ? r.child : (r.day + r.child)]);
    return `<h3>実績記録（見るだけ）</h3>${demoNote()}<p class="note">利用料・加算などの請求の項目はここには出しません。迎え・送りの担当は届け出上の名前です。</p>
      <table><tr><th>日付</th><th>児童</th><th>状況</th><th>時間</th><th>迎え</th><th>送り</th></tr>${rows.map(r => {
      const d = trip(r);
      return `<tr><td>${esc(r.day)}</td><td>${esc(r.child)}</td><td>${esc(r.status)}</td><td>${esc(r.start_time)}〜${esc(r.end_time)}</td><td>${esc(d.pick)}</td><td>${esc(d.drop)}</td></tr>`;
    }).join('')}</table>
      <p class="note">直したいときは日誌側で直すと、夜の転記で実績にも入ります。</p>`;
  },
};

// 保護者の実績確認（事務のみ）：児童ごとのリンクを作ってコピー → 公式LINEで送る。確認済みかを一覧で見る
let KK_MONTH = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' }).slice(0, 7);
const KK_URL = t => location.origin + location.pathname.replace(/[^/]*$/, '') + 'kakunin.html?t=' + t;
LEO_VIEWS.kakunin = async function () {
  if (!canManage()) return '<p>この画面は児発管・管理者・事務の方だけが使えます。</p>';
  let links, conf;
  if (DEMO) {
    links = [{ token: 'demo1', child: '児童A', month: KK_MONTH }, { token: 'demo2', child: '児童B', month: KK_MONTH }, { token: 'demo3', child: '児童C', month: KK_MONTH }];
    conf = [{ token: 'demo1', confirm: '内容に相違ありません', parent_name: '保護者A', comment: null, signature: 'x', submitted_at: new Date().toISOString() },
            { token: 'demo2', confirm: '相違があります', parent_name: '保護者B', comment: '（見本）6日は利用していません', signature: null, submitted_at: new Date().toISOString() }];
  } else {
    links = await sb(`leo_confirm_links?month=eq.${KK_MONTH}&order=child`);
    conf = links.length ? await sb(`leo_confirmations?select=token,confirm,parent_name,comment,signature,submitted_at&token=in.(${links.map(l => l.token).join(',')})&order=id.desc`) : [];
  }
  const last = {}; conf.forEach(c => { if (!last[c.token]) last[c.token] = c; });
  const done = links.filter(l => last[l.token]).length;
  return `<h3>保護者の実績確認</h3>${demoNote()}
    <p class="note">児童ごとの専用リンクです（推測できない番号つき・その児童のその月の実績だけが見えます）。「コピー」して公式LINEで保護者に送ってください。</p>
    <p>対象月 <input type="month" value="${KK_MONTH}" style="width:auto" onchange="KK_MONTH=this.value;renderLeoView('kakunin')">
    <button style="width:auto" onclick="kkMake()">この月のリンクを作る</button></p>
    <p>確認済み <b>${done}</b> ／ ${links.length}人</p>` +
    (links.length ? `<table><tr><th>児童</th><th>確認</th><th>リンク</th></tr>${links.map(l => { const c = last[l.token];
      return `<tr${c && c.confirm === '相違があります' ? ' style="background:#fdecec"' : ''}><td>${esc(l.child)}</td>
      <td>${c ? `${esc(c.confirm)}<br><small>${esc(c.parent_name)}・${new Date(c.submitted_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}${c.signature ? '・署名あり' : ''}</small>${c.comment ? `<br><small>${esc(c.comment)}</small>` : ''}` : '<span style="color:#d33">未確認</span>'}</td>
      <td><button style="width:auto;padding:6px 10px" onclick="kkCopy('${l.token}', this)">コピー</button></td></tr>`; }).join('')}</table>`
      : '<p>この月のリンクはまだありません。「この月のリンクを作る」を押してください（実績・日誌に出てくる児童の分ができます）。</p>');
};
async function kkMake() {
  if (DEMO) { alert('見本モードなので作りません'); return; }
  try { const n = await sb('rpc/leo_confirm_make_links', { method: 'POST', body: JSON.stringify({ p_month: KK_MONTH }) }); alert(n + '人分のリンクを作りました'); renderLeoView('kakunin'); }
  catch (e) { alert(e.message); }
}
function kkCopy(t, b) {
  const u = DEMO ? KK_URL('').replace('t=', 'demo=1') : KK_URL(t);
  navigator.clipboard.writeText(u).then(() => { b.textContent = 'コピーしました'; }, () => prompt('このリンクをコピーしてください', u));
}

// ===== 職責（管理者／児発管／現場支援員／事務）・所属事業所 =====
let DUTY = '現場支援員';
let MY_OFFICE = '';
let NICCHU = false;
let IS_CHAIR = false;
const canManage = () => ROLE === '事務' || ['管理者', '児発管'].includes(DUTY);
// トップの事業所タイル：事務・管理者・会長は全部、それ以外は所属＋（nicchuなら日中一時）
function visibleOffices() {
  if (typeof DEMO !== 'undefined' && DEMO) return C.offices;
  if (ROLE === '事務' || DUTY === '管理者' || IS_CHAIR) return C.offices;
  const names = new Set();
  if (MY_OFFICE) names.add(MY_OFFICE);
  if (NICCHU) names.add('日中一時支援');
  const list = C.offices.filter(o => names.has(o.name));
  return list.length ? list : C.offices.filter(o => o.name === MY_OFFICE);
}
function canOpenOffice(o) {
  if (!o) return false;
  if (typeof DEMO !== 'undefined' && DEMO) return true;
  if (ROLE === '事務' || DUTY === '管理者' || IS_CHAIR) return true;
  return visibleOffices().some(x => x.id === o.id);
}
async function loadDuty() {
  if (DEMO) {
    DUTY = new URLSearchParams(location.search).get('duty') || (ROLE === '事務' ? '管理者' : '現場支援員');
    MY_OFFICE = ''; NICCHU = false; IS_CHAIR = false;
    return;
  }
  try {
    const p = await sb('staff_profiles?select=duty,office,nicchu,is_chair');
    DUTY = p[0]?.duty || '現場支援員';
    MY_OFFICE = p[0]?.office || '';
    NICCHU = !!p[0]?.nicchu;
    IS_CHAIR = !!p[0]?.is_chair;
  } catch (e) { }
}

// ===== ヒヤリハット（その事業所の全職員が見る・新着は未読表示） =====
const HY_KINDS = ['転倒・転落・つまづき', '誤嚥・誤飲', '誤与薬', '無断外出', '行方不明', '暴力行為', '事業所の事故（火災等）', '交通事故', '権利侵害', 'その他'];
const HY_DEMO = [
  { id: 2, occurred_at: new Date().toISOString(), place: '送迎車', kind: '交通事故', child_label: '児童A', what: '（見本）発進時に児童がシートベルトを外していた', response: '停車して付け直した', prevention: '', status: '未確認', manager_comment: '' },
  { id: 1, occurred_at: new Date(Date.now() - 864e5).toISOString(), place: '公園', kind: '転倒・転落・つまづき', child_label: '児童B', what: '（見本）走っていて段差でつまづいた。けがなし', response: '様子を見た', prevention: '公園では段差の場所を先に伝える', status: '確認済', manager_comment: '全員に共有済み' } ];
const myUid = () => { try { return JSON.parse(atob(JSON.parse(localStorage.getItem('sess') || '{}').token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub; } catch (e) { return null; } };
const hySeenKey = () => 'hiyari_seen_' + (JSON.parse(localStorage.getItem('sess') || '{}').email || 'demo');
async function hyRows() { return DEMO ? HY_DEMO : sb('hiyari?order=id.desc&limit=100'); }
async function myReads() { return DEMO ? [] : (await sb('hiyari_reads?select=hiyari_id,user_id')); }
async function hiyariUnread() { try { const [r, rd] = await Promise.all([hyRows(), myReads()]); if (DEMO) { const seen = +localStorage.getItem(hySeenKey()) || 0; return r.filter(x => x.id > seen).length; }
  const me = myUid(); const mine = new Set(rd.filter(x => x.user_id === me).map(x => x.hiyari_id)); return r.filter(x => !mine.has(x.id)).length; } catch (e) { return 0; } }
LEO_VIEWS.hiyari = async function () {
  const rows = await hyRows(); let seen = +localStorage.getItem(hySeenKey()) || 0, unread = null, readers = {}, staff = [];
  if (DEMO) { if (rows.length) localStorage.setItem(hySeenKey(), Math.max(...rows.map(r => r.id))); }
  else { const me = myUid(), rd = await myReads();
    const mine = new Set(rd.filter(x => x.user_id === me).map(x => x.hiyari_id)); unread = new Set(rows.filter(r => !mine.has(r.id)).map(r => r.id));
    rd.forEach(x => (readers[x.hiyari_id] ||= new Set()).add(x.user_id));
    if (unread.size) sb('hiyari_reads?on_conflict=hiyari_id,user_id', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify([...unread].map(id => ({ hiyari_id: id }))) }).catch(() => {});
    if (canManage()) try { staff = await sb('staff_profiles?office=eq.レオ&select=user_id,nikki_name'); } catch (e) { } }
  const isNew = r => unread ? unread.has(r.id) : r.id > seen;
  const notRead = r => staff.filter(p => !(readers[r.id] || new Set()).has(p.user_id)).map(p => p.nikki_name);
  const dt = d => new Date(d).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  return `<h3>ヒヤリハット</h3>${demoNote()}<p class="note">ヒヤッとしたこと・ハッとしたことは、小さなことでも書いてください。全員で読んで、同じことを起こさないための記録です（責める記録ではありません）。</p>
    <details class="card" ${/new=1|from=line/.test(location.hash + location.search) ? "open" : ""}><summary><b>＋ 報告する</b></summary>
      <div class="rec"><label>いつ<input type="datetime-local" id="hy_at"></label>
      <label>どこで<input id="hy_place" placeholder="例：送迎車、公園、室内"></label>
      <label>種類<select id="hy_kind">${HY_KINDS.map(k => `<option>${k}</option>`).join('')}</select></label>
      <label>関わった児童（イニシャルでも可）<input id="hy_child" maxlength="40"></label>
      <label>何があったか（具体的に）<textarea id="hy_what" rows="4"></textarea></label>
      <label>その場でしたこと<textarea id="hy_resp" rows="2"></textarea></label>
      <label>次に起こさないための工夫（思いつけば）<textarea id="hy_prev" rows="2"></textarea></label>
      <button onclick="hySave()">送る</button><div id="hy_msg"></div></div></details>
    ${rows.map(r => `<div class="card rec" style="${r.status === '未確認' ? 'border-left:6px solid #d33' : ''}">
      ${isNew(r) ? '<span class="badge">新着</span> ' : ''}<b>${esc(r.kind)}</b>　${dt(r.occurred_at)}　${esc(r.place || '')}${r.child_label ? '　' + esc(r.child_label) : ''}
      <p style="white-space:pre-wrap">${esc(r.what)}</p>${r.response ? `<p class="note">その場の対応：${esc(r.response)}</p>` : ''}
      ${r.prevention ? `<p><b>再発防止：</b>${esc(r.prevention)}</p>` : ''}${r.manager_comment ? `<p class="note">確認者より：${esc(r.manager_comment)}</p>` : ''}
      <p class="note">${r.source === 'LINE' ? 'LINEから・' : ''}${r.status}${staff.length > 1 ? (notRead(r).length ? '　まだ読んでいない人：' + notRead(r).map(esc).join('、') : '　全員読みました') : ''}</p>
      ${canManage() && r.status === '未確認' ? `<label>再発防止の改善策<textarea id="hp_${r.id}" rows="2">${esc(r.prevention || '')}</textarea></label>
        <label>ひとこと（全員に見えます）<input id="hc_${r.id}"></label><button onclick="hyCheck(${r.id})">確認した</button>` : ''}</div>`).join('') || '<p>まだ報告はありません。</p>'}`;
};
async function hySave() {
  const v = id => document.getElementById(id).value.trim(), m = document.getElementById('hy_msg');
  if (!v('hy_at') || !v('hy_what')) { m.textContent = '「いつ」と「何があったか」は必ず書いてください。'; return; }
  if (DEMO) { m.textContent = '見本モードなので保存しません。'; return; }
  try { await sb('hiyari', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ occurred_at: new Date(v('hy_at')).toISOString(), place: v('hy_place'), kind: v('hy_kind'), child_label: v('hy_child'), what: v('hy_what'), response: v('hy_resp'), prevention: v('hy_prev'), service: '', source: /from=line/.test(location.hash + location.search) ? 'LINE' : 'ポータル' }) });
    renderLeoView('hiyari'); } catch (e) { m.textContent = e.message; }
}
async function hyCheck(id) {
  if (DEMO) { alert('見本モードなので保存しません'); return; }
  const me = myUid();
  try { await sb(`hiyari?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: '確認済', prevention: document.getElementById('hp_' + id).value, manager_comment: document.getElementById('hc_' + id).value, checked_by: me, checked_at: new Date().toISOString() }) });
    renderLeoView('hiyari'); } catch (e) { alert(e.message); }
}

// ===== 児発管ホーム：今日やること（一画面に、やることだけ） =====
LEO_VIEWS.home = async function () {
  const todo = [];
  // 1. 個別支援計画：期限切れ・30日以内（管理表）。退所日を過ぎた子、次の計画が退所日よりあとに始まる子は出さない
  try {
    const [kk, LEFT] = await Promise.all([sheetRows('keikaku'), loadLeftIndex()]); const tday = today(), t = new Date(tday + 'T00:00:00+09:00');
    kk.forEach(r => { const m = String(r['次期開始月'] || '').match(/(\d{4})年(\d{1,2})月/); if (!m || r['本案署名'] === '済') return;
      if (leftDone(LEFT, r['児童名'], tday)) return;
      const dueIso = `${m[1]}-${String(m[2]).padStart(2, '0')}-01`, ld = leftOnOf(LEFT, r['児童名']);
      if (ld && dueIso > ld) return;
      const due = new Date(+m[1], +m[2] - 1, 1), days = Math.round((due - t) / 864e5);
      if (days <= 30 || r['フォーム送付目安日'] === '至急') todo.push([days < 0 || r['フォーム送付目安日'] === '至急' ? 0 : 1, '📝', `${esc(r['児童名'])}さんの計画の更新（${days < 0 ? '期限切れ' : 'あと' + days + '日'}）`, '#leo/keikaku',
        ['計画書作成', '原案署名', '本案署名'].filter(k => r[k] !== '済').map(k => k.replace('原案署名', '原案の説明・同意').replace('本案署名', '本案の交付・同意')).join('・') + ' が残っています']); });
  } catch (e) { }
  // 2. ヒヤリハット：確認がまだのもの
  try { const h = (await hyRows()).filter(r => r.status === '未確認'); if (h.length) todo.push([0, '⚠️', `ヒヤリハットの確認 ${h.length}件`, '#leo/hiyari', '読んで、再発防止の工夫を書いて「確認した」を押す']); } catch (e) { }
  // 3. 保護者の実績確認：未確認の家庭
  try { if (!DEMO) { const mo = today().slice(0, 7); const l = await sb(`leo_confirm_links?month=eq.${mo}&select=token`);
      const c = l.length ? await sb(`leo_confirmations?select=token&token=in.(${l.map(x => x.token).join(',')})`) : []; const n = l.length - new Set(c.map(x => x.token)).size;
      if (n > 0) todo.push([1, '🖊️', `保護者の実績確認がまだ ${n}家庭`, '#leo/kakunin', '公式LINEでリンクを送ったか確認']); }
    else todo.push([1, '🖊️', '保護者の実績確認がまだ 1家庭（見本）', '#leo/kakunin', '公式LINEでリンクを送ったか確認']); } catch (e) { }
  // 4. 直した所の衝突（日誌に反映できなかったもの）
  try { if (canManage()) { const e = DEMO ? DEMO_DATA.edits : await sb('leo_edits?status=eq.衝突&select=id'); const n = e.filter(x => !x.status || x.status === '衝突').length; if (n) todo.push([1, '🔧', `日誌の直しが反映できなかったもの ${n}件`, '#leo/edits', '日誌を見て、必要ならもう一度直す']); } } catch (e) { }
  todo.sort((a, b) => a[0] - b[0]);
  return `<h3>今日やること（児発管）</h3>${demoNote()}<p class="note">上から順に片づければ大丈夫です。終わったものは自動で消えます。</p>` +
    (todo.length ? todo.map(([p, i, t, href, sub]) => `<a class="card rec" href="${href}" style="display:block;text-decoration:none;color:#222;${p === 0 ? 'border-left:6px solid #d33' : 'border-left:6px solid #e6b800'}"><span style="font-size:22px">${i}</span> <b>${t}</b><br><small>${sub}</small></a>`).join('')
      : '<p>今日やることはありません。</p>') +
    `<p class="note">計画の記録は <a href="#leo/plan">個別支援計画</a>、表の入力・送迎の配慮は <a href="#leo/master">入力画面</a>、児童ごとの受給者証・送迎・連絡先は <a href="#leo/userinfo">利用者情報</a> から。</p>`;
};

async function saveNikki() {
  const ch = [];
  for (const i of document.querySelectorAll('.rec input, .rec textarea')) {
    const edit = nikkiEditValue(i.dataset.f, i.dataset.old, i.value);
    if (!edit) continue;
    ch.push({ target: 'nikki', day: today(), row_key: i.dataset.row, field: i.dataset.f, old_value: edit.old_value, new_value: edit.new_value });
    i.dataset.old = edit.new_value;
  }
  if (!ch.length) { $('saved').textContent = '変更はありません。'; return; }
  if (DEMO) { $('saved').textContent = `見本モードなので保存しません（${ch.length}件の修正）。`; return; }
  try { await sb('leo_edits', { method: 'POST', body: JSON.stringify(ch), headers: { Prefer: 'return=minimal' } });
    $('saved').textContent = `${ch.length}件を送りました。1分ほどで日誌に反映されます。`; }
  catch (e) { $('saved').textContent = e.message; }
}

async function renderLeoView(name) {
  document.body.classList.toggle('wide-sheet', name === 'kata' || name === 'master');
  $('view').innerHTML = '<p>読み込み中…</p>';
  await loadDuty();
  try {
    $('view').innerHTML = `<button class="back" onclick="location.hash='leo'">← レオへ</button>` + await LEO_VIEWS[name]();
    if (name === 'master') fitMasterSheet();
  }
  catch (e) { $('view').innerHTML = `<button class="back" onclick="location.hash='leo'">← レオへ</button><p>${esc(e.message)}</p>`; }
}

// ===== 請求の印（全職員）：欠席時対応・子育てサポート・学校休業日を日ごとに =====
const canBill = () => ROLE === '事務' || DUTY === '管理者';
const isTrip = d => !!d && !/送迎なし|保護者|なし/.test(d);
let BILL_MONTH = today().slice(0, 7);
const monthTabs = view => { const [y, m] = BILL_MONTH.split('-').map(Number), mk = (yy, mm) => `${yy + Math.floor((mm - 1) / 12)}-${String(((mm - 1) % 12 + 12) % 12 + 1).padStart(2, '0')}`;
  return `<p class="ptabs"><button onclick="BILL_MONTH='${mk(y, m - 1)}';renderLeoView('${view}')">← 前の月</button> <b>${y}年${m}月</b> <button onclick="BILL_MONTH='${mk(y, m + 1)}';renderLeoView('${view}')">次の月 →</button></p>`; };
const DEMO_BILL = {
  nikki: [['01', '児童A', '利用', '14:45', '17:00', '職員X', '職員Y'], ['02', '児童A', '欠席'], ['03', '児童C', '利用', '10:00', '13:00', '送迎なし', '送迎なし'], ['05', '児童A', '利用', '10:00', '15:30', '職員X', '']]
    .map(([d, c, k, s, e, p, q]) => ({ day: BILL_MONTH + '-' + d, child: c, kind: k, start_time: s, end_time: e, pick_driver: p, drop_driver: q })),
  flags: [{ day: BILL_MONTH + '-02', child: '児童A', absent_support: true, absent_note: '（見本）母より発熱の連絡。様子を聞き、次回の予定を確認', kosodate: false, holiday: false }],
  kids: [{ name: '児童A', kana: 'ｼﾞﾄﾞｳA', guardian_kana: 'ﾎｺﾞｼｬA', first_date: '2026-04-03', jukyusha_no: '9900000001', city_no: '999999', kind: '放デイ', cap_monthly: 4600, mushouka: false, contract_days: 23, contract_start: '2026-04-01' },
    { name: '児童C', kana: 'ｼﾞﾄﾞｳC', jukyusha_no: '9900000003', city_no: '999999', kind: '児発', cap_monthly: 4600, mushouka: true, contract_days: 10, contract_start: '2026-04-01' }],
};
async function billData() {
  if (DEMO) return { nikki: DEMO_BILL.nikki, flags: DEMO_BILL.flags };
  const [y, m] = BILL_MONTH.split('-').map(Number), last = new Date(y, m, 0).getDate(), a = BILL_MONTH + '-01', b = `${BILL_MONTH}-${last}`;
  const [nikki, flags, jis] = await Promise.all([sb(`leo_nikki?day=gte.${a}&day=lte.${b}&kind=in.(利用,欠席)&order=day,row_no&select=day,child,kind,service,start_time,end_time,pick_driver,drop_driver`),
    sb(`leo_day_flags?day=gte.${a}&day=lte.${b}`), sb(`leo_jisseki?day=gte.${a}&day=lte.${b}&select=day,child,start_time,end_time`)]);
  const jt = {}; jis.forEach(j => jt[j.day + j.child] = j);   // 時間は実績記録を優先（請求元）
  nikki.forEach(n => { const j = jt[n.day + n.child]; if (j && j.start_time) { n.start_time = j.start_time; n.end_time = j.end_time; } });
  return { nikki: nikki.filter(n => n.child), flags };
}
LEO_VIEWS.shirushi = async function () {
  const { nikki, flags } = await billData(), F = {}; flags.forEach(f => F[f.day + f.child] = f);
  return `<h3>請求の印（欠席時対応・子育てサポート）</h3>${demoNote()}${monthTabs('shirushi')}
    <p class="note">その日のうちに付けてください。<b>欠席時対応</b>＝お休みの連絡を受けて、様子を聞き・次の利用を相談した日（何を話したか必ず書く）。<b>子育てサポート</b>＝保護者が支援に参加・見学した日。<b>学校休業日</b>＝夏休みなど学校がない日（放デイ）。</p>` +
    (nikki.length ? nikki.map((n, i) => { const f = F[n.day + n.child] || {}, ab = n.kind === '欠席';
      return `<div class="card rec" data-i="${i}" data-day="${n.day}" data-child="${esc(n.child)}"><b>${fmtDay(n.day)} ${esc(n.child)}</b> ${ab ? '<span class="badge">欠席</span>' : esc((n.start_time || '') + '〜' + (n.end_time || ''))}<br>
        ${ab ? `<label><input type="checkbox" data-k="absent_support" ${f.absent_support ? 'checked' : ''}> 欠席時対応をした</label><input data-k="absent_note" placeholder="誰から・何を話したか" value="${esc(f.absent_note || '')}">`
          : `<label><input type="checkbox" data-k="kosodate" ${f.kosodate ? 'checked' : ''}> 子育てサポート（保護者が参加・見学）</label> <label><input type="checkbox" data-k="holiday" ${f.holiday ? 'checked' : ''}> 学校休業日</label>`}</div>`; }).join('') +
      '<button onclick="saveShirushi()">保存する</button><div id="sh_msg"></div>' : '<p>この月の日誌がまだありません。</p>');
};
async function saveShirushi() {
  const rows = [...document.querySelectorAll('.rec[data-day]')].map(el => { const g = k => el.querySelector(`[data-k=${k}]`);
    return { day: el.dataset.day, child: el.dataset.child, absent_support: !!g('absent_support')?.checked, absent_note: g('absent_note')?.value || null, kosodate: !!g('kosodate')?.checked, holiday: !!g('holiday')?.checked }; });
  const bad = rows.find(r => r.absent_support && !(r.absent_note || '').trim()); const m = $('sh_msg');
  if (bad) { m.textContent = `${bad.child}さん（${bad.day}）：欠席時対応は、話した内容を書いてください。`; return; }
  if (DEMO) { m.textContent = '見本モードなので保存しません。'; return; }
  try { await sb('leo_day_flags?on_conflict=day,child', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows) }); m.textContent = '保存しました。'; }
  catch (e) { m.textContent = e.message; }
}

// ===== 請求（事務・管理者だけ）：児童マスタ（受給者証）→ CSVを作る。国保連への提出はここではしない =====
const KID_F = [['name', '児童名（日誌と同じ）'], ['kana', '児童フリガナ'], ['guardian_kana', '保護者フリガナ'], ['jukyusha_no', '受給者証番号（10桁）'], ['city_no', '市町村番号（6桁）'], ['kind', '種別'], ['cap_monthly', '負担上限月額'],
  ['mushouka', '無償化'], ['contract_days', '契約支給量（日）'], ['contract_start', '契約開始日'], ['contract_end', '受給者証の有効期限（終了日）'], ['first_date', '初回利用日（この契約で最初に来た日）'], ['kinyu_no', '事業者記入欄番号'], ['gensan', '計画未作成の減算']];
const OFFICE_GENSAN = [['支減', '支援プログラム未公表'], ['評価減', '自己評価結果等未公表'], ['開所減1', '開所時間減算（4時間未満）'], ['開所減2', '開所時間減算（4〜6時間）']];
LEO_VIEWS.seikyu = async function () {
  if (!canManage()) return '<p>この画面は事務・管理者・児発管だけです。</p>';
  const kids = DEMO ? DEMO_BILL.kids : await sb('leo_children?order=name'), { nikki } = await billData();
  const names = [...new Set(nikki.map(n => n.child))], known = new Set(kids.map(k => k.name)), missing = names.filter(n => !known.has(n));
  return `<h3>請求CSVを作る（事務）</h3>${demoNote()}
    <p class="note">ここで作るのはファイルだけです。国保連への送信は今まで通り「取込送信ソフト」で、中身を確かめてから行ってください。単価は6級地 10.36円（児発・放デイ／センター以外）。</p>
    <h4>1. 児童情報</h4><p class="note">受給者証・送迎・連絡先などの児童情報は、<a href="#leo/userinfo">利用者情報</a>で入力します（ここでは入力しません）。登録済み：${kids.length}人。${missing.length ? `<span style="color:#c00">この月の日誌にいて、未登録の児童：${missing.map(esc).join('、')}（<a href="#leo/userinfo">利用者情報</a>で追加）</span>` : ''}</p>
    <h4>2. ファイルを作る</h4>${monthTabs('seikyu')}<p class="note">上の月が、請求の対象月です。</p>
    <p class="note">事業所全体にかかる減算（今はなし。かかった月だけ印を付けます。基本報酬のサービスコードが減算用のコードに変わります）：
      ${OFFICE_GENSAN.map(([k, l]) => `<label><input type="checkbox" class="og" value="${k}">${l}</label>`).join(' ')}</p>
    <button onclick="makeCsv()">請求CSVを作る（K112/K122・K611）</button><div id="csv_out"></div>`;
};
// ===== 利用者情報（児童ごとにワンストップ）：受給者証(leo_children)・送迎の配慮(leo_child_care)・連絡先/送迎/アルバム(leo_child_info) =====
const UI = { sel: null, adding: false, tab: 'basic', roster: 'active' };
// アセスメント項目（キー＝leo_child_assess.data のキー。ポータル内オリジナルのアセスメント入力でも同じ構造を使う）
const ASSESS_SECTIONS = [
  ['基本・診断', [['birth','生年月日'],['school','学校・園の名前と学年'],['diagnosis','診断名・障がい名など',1],['techo','手帳（種別・判定）'],['agencies','これまでに関わった機関・病院名',1],['visit_status','通院の状況',1],['meds_status','服薬の状況',1],['meds_regular','常用している薬',1],['other_service','他に通っている事業所']]],
  ['家族・関係', [['family','家族構成（職業・学年）',1],['rel','親子関係・兄弟関係の特徴',1]]],
  ['かかりつけ', [['hp_pediatric','小児科（病院・医師）'],['hp_ortho','整形外科'],['hp_ent','耳鼻咽喉科'],['hp_derm','皮膚科'],['hp_other','その他の科']]],
  ['食事・排泄・身辺自立', [['allergy','アレルギーの有無'],['allergy_detail','アレルギーの内容',1],['utensil','食具'],['likes','好きな食べ物'],['dislikes','嫌いな食べ物'],['amount','食べる量'],['urine','小便（回数/日）'],['wipe','自分で拭けるか'],['stool','大便（回数/日）'],['handwash','手洗い'],['gargle','うがい'],['dress','着衣'],['undress','脱衣'],['button','ボタンの付け外し']]],
  ['遊び・性格', [['play_home','遊び（自宅）',1],['play_out','遊び（自宅以外）',1],['interest','興味関心',1],['personality','性格',1],['panic','パニックの時の様子・切り替え方',1],['other_msg','その他伝えたいこと',1]]],
  ['健康状態', [['temp','平熱'],['convulsion','ひきつけ・痙攣の経験'],['convulsion_detail','（詳細）'],['h_bleed','出血が止まりにくい'],['h_fall','転びやすい'],['h_skin','皮膚が弱い'],['h_earnose','耳・鼻の病気'],['h_hernia','脱腸'],['h_joint','関節がはずれやすい'],['h_cold','風邪をひきやすい'],['h_tonsil','扁桃腺で熱が出やすい'],['h_asthma','喘息が出やすい'],['h_allergic','アレルギー体質'],['h_vaccine','予防接種で高熱'],['h_rash','湿疹が出やすい'],['h_drugrash','薬で湿疹'],['h_vomit','吐きやすい'],['h_diarrhea','下痢をしやすい'],['h_constipation','便秘をしやすい'],['under_doctor','現在医者にかかっているか'],['health_other','その他、身体の心配',1]]],
  ['保護者の願い', [['wish_life','生活',1],['wish_habit','基本的生活習慣',1],['wish_motor','運動や感覚',1],['wish_cog','認知や行動',1],['wish_lang','言語とコミュニケーション',1],['wish_human','人間関係',1]]],
  ['同意・書類', [['photo_consent','写真・動画の掲載（ホームページ・Instagram等）'],['photo_detail','同意する場合の範囲',1],['doc_insurance','保険証の写真（リンク）'],['doc_jukyusha','受給者証の写真（リンク）']]]];

const WD = ['月', '火', '水', '木', '金', '土', '日'], TMODE = ['送迎あり', '迎えのみ', '送りのみ', '保護者送迎', 'なし'];
const INFO_F = [['guardian_name', '保護者氏名'], ['guardian_phone', '保護者 電話'], ['guardian_phone2', '予備の電話'], ['emergency_contact', '緊急連絡先（続柄・電話）'], ['home_address', '自宅住所']];
const UI_NAME_TABLES = [['leo_child_plan', 'name'], ['leo_child_assess', 'name'], ['leo_child_info', 'name'], ['leo_child_care', 'child'], ['leo_children', 'name']];
function uiCanon(s) {
  return typeof canonChildName === 'function' ? canonChildName(s) : String(s ?? '').replace(/\s+/g, ' ').trim();
}
function uiClustersOf(names) {
  if (typeof clusterChildNames === 'function') return clusterChildNames(names);
  return [...new Set((names || []).filter(n => n && !String(n).startsWith('※') && uiCanon(n)))].map(n => ({ label: uiCanon(n), raws: [n] }));
}
function uiNameRank(raw) {
  const c = uiCanon(raw);
  const n = typeof childTokens === 'function' ? childTokens(raw).length : (c ? c.split(' ').length : 0);
  return n * 10 + (String(raw) === c ? 1 : 0);
}
function uiFilled(v) {
  if (v == null || v === '') return false;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}
function uiMergeObj(base, extra) {
  const out = { ...(base || {}) };
  for (const [k, v] of Object.entries(extra || {})) {
    if (k === 'data' && v && typeof v === 'object' && !Array.isArray(v)) {
      const d = { ...(out.data || {}) };
      for (const [dk, dv] of Object.entries(v)) if (uiFilled(dv)) d[dk] = dv;
      out.data = d;
    } else if (uiFilled(v)) out[k] = v;
  }
  return out;
}
function uiMergeByCluster(rows, key, clusters) {
  const map = {};
  for (const c of clusters) {
    const mine = (rows || []).filter(r => r && c.raws.includes(r[key]));
    mine.sort((a, b) => uiNameRank(a[key]) - uiNameRank(b[key]));
    let merged = null;
    for (const row of mine) merged = uiMergeObj(merged, row);
    if (merged) { merged[key] = c.label; map[c.label] = merged; }
  }
  return map;
}
function uiClusterLeftOn(idx, cluster) {
  let best = null;
  for (const r of [cluster.label, ...(cluster.raws || [])]) {
    const d = leftOnOf(idx, r);
    if (d && (!best || d < best)) best = d;
  }
  return best;
}
function uiClusterLeftDone(idx, cluster, todayStr) {
  return (cluster.raws || []).some(r => leftDone(idx, r, todayStr)) || leftDone(idx, cluster.label, todayStr);
}
function uiClusterMark(idx, cluster, todayStr) {
  const d = uiClusterLeftOn(idx, cluster);
  return d ? leftMark({ [cluster.label]: d }, cluster.label, todayStr) : '';
}
function uiAliasAttr(raws, label) {
  return esc(JSON.stringify((raws || []).filter(r => r !== label)));
}
function uiReadAliases(w) {
  try { const a = JSON.parse((w && w.dataset.aliases) || '[]'); return Array.isArray(a) ? a : []; }
  catch (e) { return []; }
}
async function uiDropSpaceAliases(w, name) {
  for (const raw of uiReadAliases(w)) {
    if (!raw || raw === name || uiCanon(raw) !== name) continue;
    for (const [t, c] of UI_NAME_TABLES)
      await sb(`${t}?${c}=eq.${encodeURIComponent(raw)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  }
}
// 受給者証の原本確認の記録（いつ・誰が原本を見たか）。表は supabase/leo_jukyusha_check.sql。追加と読むだけ（画面から直す・消すはできない）
const DEMO_JCHECKS = [{ id: 2, child: 'テスト 太郎', checked_on: '2026-10-20', checked_by: '職員X', note: '更新後の受給者証を保護者が持参', created_at: '2026-10-20T06:10:00Z' }, { id: 1, child: 'テスト 太郎', checked_on: '2025-04-12', checked_by: '職員Y', note: null, created_at: '2025-04-12T05:00:00Z' }];
async function jcLoad(raws) {   // 児童の確認の履歴（新しい順）。表がまだない（SQL未実行）ときは null
  if (DEMO) return DEMO_JCHECKS.filter(r => raws.includes(r.child));
  const inList = raws.map(n => encodeURIComponent('"' + String(n).replace(/(["\\])/g, '\\$1') + '"')).join(',');
  try { return await sb(`leo_jukyusha_checks?child=in.(${inList})&select=id,child,checked_on,checked_by,note,created_at&order=checked_on.desc,id.desc`); } catch (e) { return null; }
}
const jcDay = d => String(d || '').slice(0, 10).replace(/-/g, '/');
function jcHtml(rows, mg, me) {
  if (rows === null) return mg ? `<div class="uic" id="jc_box"><h4>受給者証の原本の確認</h4><p class="note" style="padding:0 10px">原本を確認した記録の欄は、管理者が supabase/leo_jukyusha_check.sql を実行すると出ます。</p></div>` : '';
  const last = rows[0];
  return `<div class="uic" id="jc_box"><h4>受給者証の原本の確認（いつ・だれが原本を見たか）</h4>
    <style>.jc-t{width:calc(100% - 20px);margin:0 10px 8px;border-collapse:collapse}.jc-t th,.jc-t td{border-top:1px solid #e5e5ee;padding:5px 6px;text-align:left;font-size:14px;vertical-align:top}.jc-t th{font-size:12px;color:#5a5a70;font-weight:normal}.jc-add{border-top:1px dashed #ccd;margin:0 10px;padding:6px 0 10px}.jc-add .uig{padding:4px 0}</style>
    <p style="margin:6px 10px">${last ? `最後に原本を確認したのは <b>${esc(jcDay(last.checked_on))}</b>（${esc(last.checked_by)}）です。` : '<b style="color:#c60">原本を確認した記録は、まだありません。</b>'}</p><p style="margin:0 10px 6px"><small style="color:#667">受給者証の写真は保管しません。確認した日と職員だけを記録します（追加だけできます。直す・消すはできません）。</small></p>
    ${rows.length ? `<table class="jc-t"><tr><th>確認した日</th><th>確認した職員</th><th>メモ</th><th>記録した日時</th></tr>${rows.map(r => `<tr><td><b>${esc(jcDay(r.checked_on))}</b></td><td>${esc(r.checked_by)}</td><td style="white-space:pre-wrap">${esc(r.note || '')}</td><td style="color:#667;font-size:12px">${esc(new Date(r.created_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }))}</td></tr>`).join('')}</table>` : ''}
    ${mg ? `<div class="jc-add"><div class="uig">
      <label><span>原本確認日</span><input type="date" id="jc_on" value="${today()}" max="${today()}"></label>
      <label><span>確認した職員</span><input id="jc_by" value="${esc(me || '')}" maxlength="60" placeholder="職員の名前"></label>
      <label class="wide"><span>メモ（任意。例：更新後の受給者証を保護者が持参）</span><input id="jc_note" maxlength="500"></label></div>
      <button type="button" onclick="jcAdd()">原本を確認した</button> <span id="jc_msg" class="note"></span></div>` : ''}</div>`;
}
window.jcAdd = async () => {
  const w = $('uiw'), name = w && uiCanon(w.dataset.name), m = $('jc_msg'), on = ($('jc_on').value || '').trim(), by = $('jc_by').value.trim(), note = $('jc_note').value.trim();
  if (!name) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(on)) { m.textContent = '原本確認日を入れてください。'; return; }
  if (on > today()) { m.textContent = '原本確認日は、今日までの日付にしてください。'; return; }
  if (!by) { m.textContent = '確認した職員の名前を入れてください。'; return; }
  if (!confirm(`「${name}」の受給者証の原本を、${jcDay(on)} に ${by} が確認した、と記録します。\n${note ? 'メモ：' + note + '\n' : ''}\n追加した記録は、画面から直したり消したりできません。よろしいですか？`)) return;
  if (DEMO) { m.textContent = '見本モードなので保存しません。'; return; }
  try {
    await sb('leo_jukyusha_checks', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify([{ child: name, checked_on: on, checked_by: by, note: note || null }]) });
    await renderLeoView('userinfo'); const mm = $('jc_msg'); if (mm) mm.textContent = '記録しました。';
  } catch (e) { m.textContent = '記録できませんでした：' + e.message; }
};
LEO_VIEWS.userinfo = async function () {
  const mg = canManage();
  const safeSheet = async kind => { try { return await sheetRows(kind); } catch (e) { return []; } };
  const [kids, infos, cares, nk, asses, plans, kataRows, keiRows] = DEMO ? [DEMO_BILL.kids, DEMO_LEFT_INFOS, [], DEMO_BILL.nikki, [], [], DEMO_DATA.kata, DEMO_DATA.keikaku] : await Promise.all([mg ? sb('leo_children?order=name') : [], sb('leo_child_info?order=name').catch(() => []), sb('leo_child_care').catch(() => []), billData().then(d => d.nikki).catch(() => []), sb('leo_child_assess?order=name').catch(() => []), sb('leo_child_plan').catch(() => []), safeSheet('kata'), safeSheet('keikaku')]);
  const LEFT = leftIndex(infos), tday = today();
  const rawNames = [...new Set([...kids.map(x => x.name), ...infos.map(x => x.name), ...cares.map(x => x.child), ...asses.map(x => x.name), ...plans.map(x => x.name), ...nk.map(n => n.child), ...kataRows.map(r => r['児童名']), ...keiRows.map(r => r['児童名'])])].filter(n => n && !String(n).startsWith('※'));
  const clusters = uiClustersOf(rawNames);
  if (UI.sel) { const hit = clusters.find(c => c.label === UI.sel || c.raws.includes(UI.sel)); if (hit) UI.sel = hit.label; }
  const PLN = uiMergeByCluster(plans, 'name', clusters);
  const A = uiMergeByCluster(asses, 'name', clusters);
  const I = uiMergeByCluster(infos, 'name', clusters), K = uiMergeByCluster(kids, 'name', clusters);
  // 一覧の並び：leo_child_info.sort_order（小さい順）。無い児童は後ろに、あいうえお順のまま（supabase/leo_child_order.sql）
  const clustersOrdered = typeof sortChildClusters === 'function' ? sortChildClusters(clusters, c => (I[c.label] || {}).sort_order) : clusters;
  const C = Object.fromEntries(Object.entries(uiMergeByCluster(cares.map(x => ({ ...x, name: x.child })), 'name', clusters)).map(([k, v]) => [k, v.note]));
  const css = `<style>.ui-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin:8px 0}.ui-list a{display:block;border:1px solid #ccd;border-radius:8px;padding:10px;background:#fff;text-decoration:none;color:#222}.ui-list a small{display:block;color:#666}.uic{border:1px solid #ccd;border-radius:8px;margin:8px 0;background:#fff}.uic h4{margin:0;padding:8px 10px;background:#eef;border-radius:8px 8px 0 0}.uig{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:6px 12px;padding:8px 10px}.uig label span{display:block;font-size:.8em;color:#555}.uig input:not([type=checkbox]),.uig select,.uig textarea{width:100%;box-sizing:border-box;margin:2px 0;padding:8px}.uig .wide{grid-column:1/-1}.uil a{margin-right:10px}</style>`;
  const nm = UI.sel;
  const cur = clusters.find(c => c.label === nm) || (nm ? { label: nm, raws: [nm] } : null);
  const mark = cur ? uiClusterMark(LEFT, cur, tday) : '';
  const aliasAttr = ` data-aliases="${uiAliasAttr(cur ? cur.raws : [], nm || '')}"`;
  const clusterLeft = cur ? (uiClusterLeftOn(LEFT, cur) || '') : '';
  if (!nm && !UI.adding) {
    const shown = clustersOrdered.filter(c => UI.roster === 'left' ? uiClusterLeftDone(LEFT, c, tday) : !uiClusterLeftDone(LEFT, c, tday));
    const nLeft = clusters.filter(c => uiClusterLeftDone(LEFT, c, tday)).length;
    return `<h3>利用者情報</h3>${demoNote()}${css}<p class="note">児童ごとの受給者証・送迎・連絡先・Googleフォト・個別支援計画を、ここ1か所にまとめています。児童を選んでください。空白の違い（全角・半角・連続）と、一人に定まる「名前だけ／姓つき」は同じ児童として表示します。${mg ? '' : '（見るだけです。直すのは児発管・事務・管理者）'}</p>
      <p class="ptabs"><button class="${UI.roster === 'active' ? 'on' : ''}" onclick="uiRoster('active')">在籍（${clusters.length - nLeft}）</button><button class="${UI.roster === 'left' ? 'on' : ''}" onclick="uiRoster('left')">退所児童（${nLeft}）</button></p>
      <div class="ui-list">${shown.map(c => `<a href="#" onclick="uiOpen(${esc(JSON.stringify(c.label))});return false" style="${uiClusterLeftDone(LEFT, c, tday) ? 'background:#f3f3f3;border-style:dashed' : ''}"><b>${esc(c.label)}</b>${uiClusterMark(LEFT, c, tday)}<small>${[K[c.label] ? '受給者証' + (K[c.label].jukyusha_no ? '○' : '未') : '', I[c.label] ? (I[c.label].transport_mode || '') : '送迎未入力'].filter(Boolean).join(' ／ ')}${c.raws.length > 1 ? ' ／ 表記 ' + c.raws.map(esc).join('、') : ''}</small></a>`).join('') || `<p>${UI.roster === 'left' ? '退所した児童はいません。' : '在籍の児童はいません。'}</p>`}</div>
      ${mg ? `<button onclick="uiAdd()">＋ 児童を追加</button>` : ''}
      <p class="note">退所にしても記録は消えません。退所日の翌日以降、利用予定・カレンダー・送迎に出なくなります。型表の保存は不要です。請求CSVは <a href="#leo/seikyu">請求</a> から（ここの受給者証の内容が使われます）。</p>`;
  }
  const k = K[nm] || {}, i = I[nm] || {}, ro = mg ? '' : 'disabled';
  const onJk = !!nm && !UI.adding && UI.tab === 'jukyusha';
  const JC = onJk ? await jcLoad(cur.raws) : undefined, jcMe = onJk && mg && !DEMO ? await myName().catch(() => '') : onJk && DEMO ? DEMO_DATA.me : '';   // 原本確認の履歴と、記入欄の初期値（ログイン中の職員名）
  const SC = DEMO || infos.some(r => r && 'soudan_office' in r);   // 相談支援の列がある（supabase/leo_jukyusha_form.sql を実行ずみ）ときだけ欄を出す・保存する
  const tabBar = on => `<p>${[['basic', '基本'], ['jukyusha', '受給者証'], ['assess', 'アセスメント' + (A[nm] ? '' : '（未入力）')], ['plan', '個別支援計画' + (PLN[nm] ? '' : '（未入力）')]].map(([t, l]) => t === on ? `<b style="padding:6px 10px;border-bottom:3px solid #36c">${l}</b>` : `<button class="back" onclick="uiTab('${t}')">${l}</button>`).join(' ')}</p>`;
  if (UI.tab === 'plan' && nm) {
    const p = PLN[nm] || {};
    const tabs = tabBar('plan');
    return `<button class="back" onclick="uiOpen(null)">← 児童の一覧へ</button>${css}<h3>${esc(nm)}${mark}${demoNote()}</h3>${tabs}
      <p class="note">現行の個別支援計画の本文です。今日の利用児童のカードから読めます。${p.updated_at ? '更新：' + esc(String(p.updated_at).slice(0, 10)) + '。' : 'まだ入っていません。'}${mg ? '' : '（見るだけです。直すのは児発管・事務・管理者）'}</p>
      <div id="uiw" data-name="${esc(nm)}"${aliasAttr}><div class="uic"><div class="uig">
        <label><span>期（例：第2期）</span><input data-t="pl" data-f="term" value="${esc(p.term || '')}" ${ro}></label>
        <label><span>計画期間</span><input data-t="pl" data-f="period" value="${esc(p.period || '')}" ${ro}></label>
        <label class="wide"><span>元の計画書（Googleドキュメント等）のリンク　https://…</span><input data-t="pl" data-f="source_url" type="url" value="${esc(p.source_url || '')}" ${ro}></label>
        <label class="wide"><span>計画書の本文（援助の方針・長期目標・短期目標と支援内容）。元の計画書からコピーして貼れます</span><textarea data-t="pl" data-f="body" rows="22" ${ro}>${esc(p.body || '')}</textarea></label></div></div>
        ${p.source_url ? `<p class="uil"><a href="${esc(p.source_url)}" target="_blank" rel="noopener">📄 元の計画書を開く</a></p>` : ''}</div>
      ${mg ? `<button onclick="uiSavePlan()">保存</button> <span id="ui_msg"></span>` : ''}`;
  }
  if (UI.tab === 'assess' && nm) {
    const a = A[nm] || {}, d = a.data || {};
    const tabs = tabBar('assess');
    return `<button class="back" onclick="uiOpen(null)">← 児童の一覧へ</button>${css}<h3>${esc(nm)}${mark}${demoNote()}</h3>${tabs}
      <p class="note">${a.source ? '取り込み元：' + esc(a.source) + '。' : 'まだ入力がありません。'}診断名・服薬などの機微情報を含みます。レオ職員だけが見られます。${mg ? '' : '（見るだけです。直すのは児発管・事務・管理者）'}</p>
      <div id="uiw" data-name="${esc(nm)}"${aliasAttr}>${ASSESS_SECTIONS.map(([t, fs]) => `<div class="uic"><h4>${t}</h4><div class="uig">${fs.map(([f, l, w]) => `<label${w ? ' class="wide"' : ''}><span>${l}</span>${w ? `<textarea data-t="as" data-f="${f}" rows="2" ${ro}>${esc(d[f] || '')}</textarea>` : `<input data-t="as" data-f="${f}" value="${esc(d[f] || '')}" ${ro}>`}</label>`).join('')}</div></div>`).join('')}</div>
      ${mg ? `<button onclick="uiSaveAssess()">保存</button> <span id="ui_msg"></span>` : ''}`;
  }
  const kin = (f, l, v, extra = '') => `<label><span>${l}</span><input data-t="info" data-f="${f}" value="${esc(v ?? '')}" ${extra} ${ro}></label>`;
  const jk = mg ? `<div class="uic"><h4>受給者証（請求に使います）</h4><div class="uig">${KID_F.filter(([f]) => f !== 'name').map(([f, l]) => `<label><span>${l}</span>${kidInput(k, f, k[f])}</label>`).join('')}</div></div>` : '';
  const scCard = `<div class="uic"><h4>相談支援</h4><div class="uig">${SC ? kin('soudan_office', '相談支援事業所名', i.soudan_office, 'maxlength="100"') + kin('soudan_person', '担当の相談支援専門員', i.soudan_person, 'maxlength="60"') : '<p class="note wide">相談支援事業所・担当者の欄は、管理者が supabase/leo_jukyusha_form.sql を実行すると出ます。</p>'}</div></div>`;
  if (onJk) {   // 「受給者証」タブ：受給者証・原本の確認・相談支援（保存は uiSaveJk。送迎などの欄はこのタブにないので触りません）
    return `<button class="back" onclick="uiOpen(null)">← 児童の一覧へ</button>${css}<h3>${esc(nm)}${mark}${demoNote()}</h3>${tabBar('jukyusha')}
      <p class="note">受給者証の内容（請求に使います）、原本をいつ・だれが確認したか、相談支援事業所です。保護者の入力は <a href="#leo/jukyusha">受給者証の入力（保護者）</a> で確認して反映できます。${mg ? '' : '（見るだけです。直すのは児発管・事務・管理者）'}</p>
      <div id="uiw" data-name="${esc(nm)}"${aliasAttr}>${jk}${JC !== undefined ? jcHtml(JC, mg, jcMe) : ''}${scCard}</div>
      ${mg ? `<button onclick="uiSaveJk()">保存</button> <span id="ui_msg"></span><span class="note"> 上の「受給者証」と「相談支援」を保存します。「原本を確認した」は、その場で別に記録します。</span>` : ''}`;
  }
  const leaveBox = nm ? `<div class="uic"><h4>退所</h4><p class="note">退所日を入れると、その日までは今まで通り、翌日以降は利用予定・カレンダー・送迎に出なくなります。記録は消えません。型表は変更しません（型表の「保存」は押さないでください）。日付を空にして「保存」しても、すでに入っている退所日は消えません。取り消すときは「復帰する」を押します。</p>
      ${mg ? `<div class="uig"><label><span>退所日（この日まで在籍）</span><input type="date" id="ui_left" data-was="${clusterLeft ? '1' : ''}" value="${esc(String(clusterLeft).slice(0, 10))}"></label></div>
        <p style="padding:0 10px 10px"><button type="button" onclick="uiLeave()">退所にする</button>${clusterLeft ? ` <button type="button" onclick="uiReturn()">復帰する</button>` : ''}</p>` : `<p style="padding:0 10px 10px">${clusterLeft ? `退所日：${esc(String(clusterLeft).slice(0, 10).replace(/-/g, '/'))}` : '在籍中'}</p>`}</div>` : '';
  return `<button class="back" onclick="uiOpen(null)">← 児童の一覧へ</button>${css}<h3>${nm ? esc(nm) : '（新しい児童）'}${nm ? mark : ''}${demoNote()}</h3>
    ${cur && cur.raws.length > 1 ? `<p class="note">同じ児童としてまとめています（${cur.raws.map(esc).join('、')}）。保存すると、空白だけ違う表記は「${esc(nm)}」に揃えます。</p>` : ''}
    <div id="uiw" data-name="${esc(nm || '')}"${aliasAttr}>
    ${UI.adding ? `<div class="uic"><div class="uig"><label><span>児童名（日誌と同じ表記）</span><input id="ui_newname" data-t="new"></label></div></div>` : ''}
    ${nm ? tabBar('basic') : ''}
    <p class="uil">${i.album_url ? `<a href="${esc(i.album_url)}" target="_blank" rel="noopener">📷 Googleフォト アルバム</a>` : ''}</p>
    ${UI.adding ? jk + scCard : ''}
    <div class="uic"><h4>① 送迎</h4><div class="uig">
      <label><span>送迎の種類</span><select data-t="info" data-f="transport_mode" ${ro}><option value=""></option>${TMODE.map(o => `<option ${o === i.transport_mode ? 'selected' : ''}>${o}</option>`).join('')}</select></label>
      <label class="wide"><span>送迎の曜日</span>${WD.map(w => `<label style="display:inline-block;margin-right:10px"><input type="checkbox" class="ui_wd" value="${w}" ${(i.transport_days || []).includes(w) ? 'checked' : ''} ${ro}> ${w}</label>`).join('')}</label>
      ${kin('pickup_place', '乗る場所（迎え）', i.pickup_place)}${kin('dropoff_place', '降りる場所（送り）', i.dropoff_place)}
      <label class="wide"><span>送迎の配慮（座席・チャイルドシート・引き渡し相手・アレルギー等）※送迎画面にも出ます</span><textarea data-t="care" data-f="note" rows="3" ${ro}>${esc(C[nm] || '')}</textarea></label>
      <label class="wide"><span>送迎のメモ</span><textarea data-t="info" data-f="transport_note" rows="2" ${ro}>${esc(i.transport_note || '')}</textarea></label></div></div>
    <div class="uic"><h4>② 保護者・連絡先</h4><div class="uig">${INFO_F.map(([f, l]) => kin(f, l, i[f])).join('')}</div></div>
    <div class="uic"><h4>③ Googleフォト・メモ</h4><div class="uig">${kin('album_url', '共有アルバムのリンク（https://…）', i.album_url, 'type="url"')}<label class="wide"><span>メモ</span><textarea data-t="info" data-f="note" rows="3" ${ro}>${esc(i.note || '')}</textarea></label></div></div>
    ${leaveBox}
    </div>${mg ? `<button onclick="uiSave()">保存</button> <span id="ui_msg"></span>` : ''}${mg && nm ? `<p style="margin-top:28px"><button onclick="uiDelete()" style="color:#c00;border-color:#c00">この児童を削除</button></p>` : ''}`;
};
window.uiRoster = mode => { UI.roster = mode; renderLeoView('userinfo'); };
async function uiWriteLeft(name, day) {
  const w = $('uiw');
  const names = [...new Set([uiCanon(name), name, ...uiReadAliases(w)].filter(Boolean))];
  const rows = names.map(n => ({ name: n, left_on: day, updated_at: new Date().toISOString() }));
  await sb('leo_child_info?on_conflict=name', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows) });
}
window.uiLeave = async () => {
  const w = $('uiw'), name = w && w.dataset.name, m = $('ui_msg'), day = ($('ui_left') && $('ui_left').value || '').trim();
  if (!name) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) { if (m) m.textContent = '退所日を入れてください。'; return; }
  if (!confirm(`「${name}」を ${day.replace(/-/g, '/')} で退所にします。\n\n記録は消えません。この日の翌日以降、利用予定・カレンダー・送迎に出なくなります。\n型表は変更しません。`)) return;
  if (DEMO) { if (m) m.textContent = '見本モードなので保存しません。'; return; }
  try { await uiWriteLeft(name, day); await renderLeoView('userinfo'); const mm = $('ui_msg'); if (mm) mm.textContent = '退所にしました。記録はそのままです。'; }
  catch (e) { if (m) m.textContent = e.message + '（退所日を保存できないときは、管理者が supabase/leo_left.sql を実行したか確認してください）'; }
};
window.uiReturn = async () => {
  const w = $('uiw'), name = w && w.dataset.name, m = $('ui_msg');
  if (!name) return;
  if (!confirm(`「${name}」の退所を取り消して、在籍に戻します。記録はそのままです。`)) return;
  if (DEMO) { if (m) m.textContent = '見本モードなので保存しません。'; return; }
  try { await uiWriteLeft(name, null); await renderLeoView('userinfo'); const mm = $('ui_msg'); if (mm) mm.textContent = '在籍に戻しました。'; }
  catch (e) { if (m) m.textContent = e.message + '（管理者が supabase/leo_left.sql を実行したか確認してください）'; }
};
window.uiDelete = async () => {
  const w = $('uiw'), name = w && w.dataset.name, m = $('ui_msg'); if (!name) return;
  const aliases = uiReadAliases(w).filter(n => n && n !== name);
  const extra = aliases.length ? `\n同じ児童の別表記も消します：${aliases.join('、')}` : '';
  if (!confirm(`「${name}」を削除します。${extra}\n\n消えるもの：受給者証・送迎・連絡先・アセスメント（利用者情報の全項目）\n消えないもの：日誌などの記録\n\n元に戻せません。よろしいですか？`)) return;
  if (DEMO) { alert('見本モードなので削除しません。'); return; }
  try {
    const names = [...new Set([name, ...uiReadAliases(w)])];
    for (const n of names) for (const [t, c] of UI_NAME_TABLES)
      await sb(`${t}?${c}=eq.${encodeURIComponent(n)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    UI.sel = null; UI.adding = false; await renderLeoView('userinfo'); const mm = $('ui_msg'); if (mm) mm.textContent = '削除しました。';
  } catch (e) { (m || { }).textContent = e.message; alert('削除できませんでした：' + e.message); }
};
window.uiTab = t => { UI.tab = t; renderLeoView('userinfo'); window.scrollTo(0, 0); };
window.uiOpen = n => { UI.tab = 'basic'; UI.sel = n; UI.adding = false; renderLeoView('userinfo'); window.scrollTo(0, 0); };
window.uiAdd = () => { UI.sel = null; UI.adding = true; renderLeoView('userinfo'); };
const kidInput = (k, f, v) => { const h = document.createElement('div'); return (f === 'kind' ? `<select data-t="kid" data-f="kind">${['放デイ', '児発'].map(o => `<option ${o === v ? 'selected' : ''}>${o}</option>`).join('')}</select>`
    : f === 'cap_monthly' ? `<select data-t="kid" data-f="cap_monthly">${[0, 4600, 37200].map(o => `<option ${o == v ? 'selected' : ''}>${o}</option>`).join('')}</select>`
    : f === 'mushouka' ? `<input type="checkbox" data-t="kid" data-f="mushouka" ${v ? 'checked' : ''}>`
    : f === 'gensan' ? `<select data-t="kid" data-f="gensan">${[['', 'なし'], ['未計画', '未作成（1〜2月目）'], ['未計画2', '未作成（3月目以降）']].map(([o, l]) => `<option value="${o}" ${(v || [])[0] === o || (!o && !(v || []).length) ? 'selected' : ''}>${l}</option>`).join('')}</select>`
    : `<input data-t="kid" data-f="${f}" value="${esc(v ?? '')}" ${/contract_start|contract_end|first_date/.test(f) ? 'type="date"' : ''}>`); };
async function uiSavePlan() {
  const w = $('uiw'), m = $('ui_msg'), name = uiCanon(w.dataset.name), o = {};
  w.querySelectorAll('[data-t="pl"]').forEach(x => o[x.dataset.f] = x.value.trim() || null);
  if (o.source_url && !/^https:\/\//.test(o.source_url)) { m.textContent = 'リンクは https:// で始まるものを入れてください。'; return; }
  if (DEMO) { m.textContent = '見本モードなので保存しません。'; return; }
  try {
    await sb('leo_child_plan?on_conflict=name', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify([{ name, ...o, updated_at: new Date().toISOString() }]) });
    await uiDropSpaceAliases(w, name);
    UI.sel = name; await renderLeoView('userinfo'); $('ui_msg').textContent = '保存しました。';
  } catch (e) { m.textContent = e.message; }
}
async function uiSaveAssess() {
  const w = $('uiw'), m = $('ui_msg'), name = uiCanon(w.dataset.name), data = {};
  w.querySelectorAll('[data-t="as"]').forEach(x => { if (x.value.trim()) data[x.dataset.f] = x.value.trim(); });
  if (DEMO) { m.textContent = '見本モードなので保存しません。'; return; }
  try {
    await sb('leo_child_assess?on_conflict=name', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify([{ name, data, source: 'ポータル入力', updated_at: new Date().toISOString() }]) });
    await uiDropSpaceAliases(w, name);
    UI.sel = name; await renderLeoView('userinfo'); $('ui_msg').textContent = '保存しました。';
  } catch (e) { m.textContent = e.message; }
}
async function uiSaveJk() {   // 「受給者証」タブの保存：受給者証（leo_children）と相談支援（leo_child_info の2列だけ）。送迎・連絡先・メモは触らない
  const w = $('uiw'), m = $('ui_msg'), name = uiCanon(w.dataset.name);
  const get = t => { const o = {}; w.querySelectorAll(`[data-t="${t}"][data-f]`).forEach(x => o[x.dataset.f] = x.type === 'checkbox' ? x.checked : x.value.trim()); return o; };
  const kid = get('kid'), info = get('info');
  const hasKid = Object.values(kid).some(v => v && v !== '放デイ' && v !== '4600');
  if (hasKid) {
    if (!/^\d{10}$/.test(kid.jukyusha_no) || !/^\d{6}$/.test(kid.city_no)) { m.textContent = '受給者証番号は10桁・市町村番号は6桁の数字で入れてください（受給者証を入れない場合は受給者証の欄を空のままに）。'; return; }
    kid.name = name; kid.cap_monthly = +kid.cap_monthly; kid.contract_days = kid.contract_days ? +kid.contract_days : null; kid.contract_start = kid.contract_start || null; kid.contract_end = kid.contract_end || null;
    kid.first_date = kid.first_date || null; kid.kinyu_no = kid.kinyu_no ? +kid.kinyu_no : null; kid.gensan = kid.gensan ? [kid.gensan] : []; kid.guardian_kana = kid.guardian_kana || null; kid.kana = kid.kana || null;
  }
  const hasInfo = 'soudan_office' in info || 'soudan_person' in info;
  if (hasInfo) { info.name = name; Object.keys(info).forEach(f => { if (info[f] === '') info[f] = null; }); }
  if (DEMO) { m.textContent = '見本モードなので保存しません。'; return; }
  const up = (t, k, r) => sb(`${t}?on_conflict=${k}`, { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify([r]) });
  try {
    if (hasKid) await up('leo_children', 'name', kid);
    if (hasInfo) await up('leo_child_info', 'name', info);
    await uiDropSpaceAliases(w, name);
    UI.sel = name; await renderLeoView('userinfo'); $('ui_msg').textContent = '保存しました。';
  } catch (e) { m.textContent = e.message; }
}
async function uiSave() {
  const w = $('uiw'), m = $('ui_msg'), name = uiCanon(UI.adding ? $('ui_newname').value : w.dataset.name);
  if (!name) { m.textContent = '児童名を入れてください。'; return; }
  const get = t => { const o = {}; w.querySelectorAll(`[data-t="${t}"][data-f]`).forEach(x => o[x.dataset.f] = x.type === 'checkbox' ? x.checked : x.value.trim()); return o; };
  const kid = get('kid'), info = get('info'), care = get('care');
  const leftEl = $('ui_left');
  if (leftEl && leftEl.value.trim()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(leftEl.value.trim())) { m.textContent = '退所日は日付で入れてください。'; return; }
    info.left_on = leftEl.value.trim();
  }
  info.name = name; info.transport_days = [...w.querySelectorAll('.ui_wd:checked')].map(x => x.value);
  Object.keys(info).forEach(f => { if (info[f] === '') info[f] = null; }); info.transport_days = info.transport_days || [];
  if (info.album_url && !/^https:\/\//.test(info.album_url)) { m.textContent = 'アルバムのリンクは https:// で始まるものを入れてください。'; return; }
  const hasKid = Object.values(kid).some(v => v && v !== '放デイ' && v !== '4600');
  if (hasKid) {
    if (!/^\d{10}$/.test(kid.jukyusha_no) || !/^\d{6}$/.test(kid.city_no)) { m.textContent = '受給者証番号は10桁・市町村番号は6桁の数字で入れてください（受給者証を入れない場合は受給者証の欄を空のままに）。'; return; }
    kid.name = name; kid.cap_monthly = +kid.cap_monthly; kid.contract_days = kid.contract_days ? +kid.contract_days : null; kid.contract_start = kid.contract_start || null; kid.contract_end = kid.contract_end || null;
    kid.first_date = kid.first_date || null; kid.kinyu_no = kid.kinyu_no ? +kid.kinyu_no : null; kid.gensan = kid.gensan ? [kid.gensan] : []; kid.guardian_kana = kid.guardian_kana || null; kid.kana = kid.kana || null;
  }
  if (DEMO) { m.textContent = '見本モードなので保存しません。'; return; }
  const up = (t, k, r) => sb(`${t}?on_conflict=${k}`, { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify([r]) });
  try {
    if (hasKid) await up('leo_children', 'name', kid);
    await up('leo_child_info', 'name', info);
    await up('leo_child_care', 'child', { child: name, note: care.note || null });
    await uiDropSpaceAliases(w, name);
    UI.sel = name; UI.adding = false; await renderLeoView('userinfo'); $('ui_msg').textContent = '保存しました。';
  } catch (e) { m.textContent = e.message + (info.left_on ? '（退所日を保存できないときは、管理者が supabase/leo_left.sql を実行したか確認してください）' : ''); }
}
const loadSjis = () => window.Encoding ? Promise.resolve() : new Promise((ok, ng) => { const s = document.createElement('script');
  s.src = 'vendor/encoding.min.js'; s.onload = ok; s.onerror = () => ng(new Error('文字コード変換の部品を読み込めませんでした')); document.head.appendChild(s); });
async function makeCsv() {
  const out = $('csv_out'), office = '2450201047';
  const _o = office;
  try { await loadSjis(); if (!window.LeoBilling) await new Promise((ok, ng) => { const s = document.createElement('script'); s.src = 'leo_billing.js'; s.onload = ok; s.onerror = ng; document.head.appendChild(s); });
    const kids = DEMO ? DEMO_BILL.kids : await sb('leo_children'), { nikki, flags } = await billData(), F = {}, K = {};
    flags.forEach(f => F[f.day + f.child] = f);
    kids.forEach(k => K[k.name] = { ...k, contract_start: (k.contract_start || '').replace(/-/g, ''), first_date: (k.first_date || '').replace(/-/g, '') });
    const og = [...document.querySelectorAll('input.og:checked')].map(i => i.value);
    const recs = nikki.map(n => { const f = F[n.day + n.child] || {}; return { day: n.day, child: n.child, status: n.kind === '欠席' ? '欠席' : '出席', start: n.start_time, end: n.end_time,
      pick: isTrip(n.pick_driver), drop: isTrip(n.drop_driver), holiday: f.holiday, absent_support: f.absent_support, kosodate: f.kosodate }; });
    const ym = BILL_MONTH.replace('-', ''), r = LeoBilling.build(ym, office, K, recs, og), chk = await billChecks(nikki, flags);
    const nm = [...new Set(nikki.map(n => n.child))].filter(n => !K[n]);
    const exp = Object.values(K).filter(k => k.contract_end && nikki.some(n => n.child === k.name) && String(k.contract_end).replace(/-/g, '').slice(0, 6) < ym).map(k => `${k.name}：受給者証の有効期限（${k.contract_end}）が対象月より前です。新しい受給者証の内容に更新してください`);
    const file = (rows, name) => { const b = new Blob([new Uint8Array(Encoding.convert(Encoding.stringToCode(LeoBilling.toCsv(rows)), { to: 'SJIS', from: 'UNICODE' }))], { type: 'text/csv' });
      return `<a class="card" style="display:inline-block" href="${URL.createObjectURL(b)}" download="${name}">⬇ ${name}</a>`; };
    const yen = n => n.toLocaleString('ja-JP');
    out.innerHTML = `${file(r.claim, `K112${ym.slice(2)}.CSV`)} ${file(r.jisseki, `K611${ym.slice(2)}.CSV`)}
      <table class="tbl"><tr><th>児童</th><th>利用日数</th><th>送迎(片道)</th><th>単位</th><th>費用</th><th>利用者負担</th><th>給付費</th></tr>${r.bills.map(b => `<tr><td>${esc(b.name)}</td><td>${b.use}</td><td>${b.trips}</td><td>${yen(b.units)}</td><td>${yen(b.cost)}</td><td>${yen(b.burden)}</td><td>${yen(b.benefit)}</td></tr>`).join('')}</table>
      <h4>要件チェック</h4>${chk.length ? '' : '<p>気になる点はありません。</p>'}${[...nm.map(n => `${n}：マスタがないので入れていません`), ...r.warn, ...exp, ...chk].map(w => `<p class="note" style="color:#c00">⚠ ${esc(w)}</p>`).join('')}
      <p class="note">作ったファイルは、取込送信ソフトで読み込んで、エラーと金額を確かめてください（送信はまだしないでください）。</p>`; }
  catch (e) { out.textContent = e.message; }
}

// ===== 個別支援計画：レオの実際の流れ（作成マニュアル 2026年10月版・レオ個別支援計画ボットの手順）に合わせた「いまどこ？」画面 =====
// 正は Google の「レオ 個別支援計画 管理表」。この画面は見るだけ（書き換えない）。保護者への送付は児発管がLINE 1対1で行う。
const PLAN_LINKS = {
  管理表: 'gl:g15',
  アンケート: 'gl:g16',
  同意リンク一覧: 'gl:g17',
  計画フォルダ: 'gl:g18',
  記録フォルダ: 'gl:g19',
};
const JP_HOLIDAYS = new Set(['2026-01-01','2026-01-12','2026-02-11','2026-02-23','2026-03-20','2026-04-29','2026-05-03','2026-05-04','2026-05-05','2026-05-06','2026-07-20','2026-08-11','2026-09-21','2026-09-22','2026-09-23','2026-10-12','2026-11-03','2026-11-23',
  '2027-01-01','2027-01-11','2027-02-11','2027-02-23','2027-03-21','2027-03-22','2027-04-29','2027-05-03','2027-05-04','2027-05-05','2027-07-19','2027-08-11','2027-09-20','2027-09-23','2027-10-11','2027-11-03','2027-11-23']);
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const isOff = d => d.getDay() === 0 || d.getDay() === 6 || JP_HOLIDAYS.has(ymd(d));
const prevWork = d => { const x = new Date(d); do x.setDate(x.getDate() - 1); while (isOff(x)); return x; };
// plan_tools.py dates と同じ：期間＝開始月1日〜6か月目の末日。本案＝1日（土日祝なら直前の平日）、会議・原案・アセスメントはその前の平日に1日ずつ
function planDates(y, m) {
  const start = new Date(y, m - 1, 1), end = new Date(y, m + 5, 0), honan = isOff(start) ? prevWork(start) : start;
  const kaigi = prevWork(honan), genan = prevWork(kaigi), assess = prevWork(genan);
  return { start, end, honan, kaigi, genan, assess };
}
const md = d => `${d.getMonth() + 1}/${d.getDate()}（${'日月火水木金土'[d.getDay()]}）`;
// 管理表の列 → 10ステップのどこまで来たか
const PLAN_FLOW = [
  ['① 一覧メール', '自動', '毎月15日・28日 朝8時に、翌月に計画が始まる子の一覧が届く'],
  ['② LINEで2つ送る', '児発管', 'アンケート（共通リンク）＋その子のモニタリング記録PDF をLINE 1対1で', ['アンケート', '記録フォルダ']],
  ['③ 保護者が回答', '保護者', '回答日は管理表に自動で入る'],
  ['④ 下書きができる', '自動', 'ボットが 前回計画＋今期のモニタリング記録＋回答 から、アセスメント・原案・会議録・本案の4つを1つのドキュメントに', ['計画フォルダ']],
  ['⑤ 確認・修正 →「計画書作成」＝済', '児発管', '済は手で（ここだけ自動ではない）', ['計画フォルダ', '管理表']],
  ['⑥ 原案の同意', '児発管→保護者', '原案用の同意リンクをLINE 1対1で。届くと「原案署名」が自動で済', ['同意リンク一覧']],
  ['⑦ 担当者会議', '会議', '原案の同意のあと。児発管・保育士、場所レオ。内容は下書きの会議録で直す'],
  ['⑧ 本案の同意', '児発管→保護者', '本案用の同意リンクをLINE 1対1で。届くと「本案署名」が自動で済、次の期の行ができる', ['同意リンク一覧']],
  ['⑨ 計画スタート', '自動', '計画期間6か月。業務日誌Q列「活動記録」が次のモニタリング記録のもと'],
];
function planStage(r) {
  if (r['本案署名'] === '済') return 8;
  if (r['原案署名'] === '済') return 6;      // 会議 → 本案の同意 待ち
  if (r['計画書作成'] === '済') return 5;    // 原案の同意 待ち
  if (r['フォーム回答日']) return 3;         // 下書き → 確認 待ち
  return 1;                                 // アンケート送付・回答 待ち
}
const PLAN_DEMO_ROWS = [
  { 児童名: '児童A', 現在の期: '2期', 現在の計画期間: '2026年5月〜2026年10月', 次期開始月: '2026年11月', フォーム送付目安日: '2026/10/15', フォーム回答日: '', 計画書作成: '未', 原案署名: '未', 本案署名: '未', 備考: '', _track: { child: '児童A', term_no: 2, period_from: '2026-05-01', period_to: '2026-10-31', next_start: '2026-11-01' } },
  { 児童名: '児童B', 現在の期: '1期', 現在の計画期間: '2026年5月〜2026年10月', 次期開始月: '2026年11月', フォーム送付目安日: '2026/10/15', フォーム回答日: '2026/10/12', 計画書作成: '済', 原案署名: '未', 本案署名: '未', 備考: '', _track: { child: '児童B', term_no: 1, period_from: '2026-05-01', period_to: '2026-10-31', next_start: '2026-11-01' } },
  { 児童名: '児童C', 現在の期: '3期', 現在の計画期間: '2026年4月〜2026年9月', 次期開始月: '2026年10月', フォーム送付目安日: '至急', フォーム回答日: '2026/09/20', 計画書作成: '済', 原案署名: '済', 本案署名: '未', 備考: '（見本）会議日の調整中', _track: { child: '児童C', term_no: 3, period_from: '2026-04-01', period_to: '2026-09-30', next_start: '2026-10-01' } },
  { 児童名: '児童D', 現在の期: '1期', 現在の計画期間: '2026年10月〜2027年3月', 次期開始月: '2027年4月', フォーム送付目安日: '2027/03/15', フォーム回答日: '2026/09/18', 計画書作成: '済', 原案署名: '済', 本案署名: '済', 備考: '', _track: { child: '児童D', term_no: 1, period_from: '2026-10-01', period_to: '2027-03-31', next_start: '2027-04-01' } },
];
// ===== ⑤ 個別支援計画（ポータル内で作る）：保護者アンケート → 職員モニタリング → 4書類（アセスメント・原案・会議録・本案）→ 同意（原案→会議→本案） =====
const PLAN_STEPS2 = ['保護者アンケート', '職員モニタリング', '下書き（4書類）', '確認・計画書作成＝済', '原案の同意', '担当者会議', '本案の同意'];
const reiwa = d => `令和${d.getFullYear() - 2018}年${d.getMonth() + 1}月${d.getDate()}日`;
const isoD = d => ymd(d);
function planSkeleton(name, n, d) {
  const [sei, mei] = String(name).split(/\s+/), nm = `${sei}　${mei || ''}`, per = `${reiwa(d.start)} 〜 ${reiwa(d.end)}`;
  const five = big => ['1.健康・生活', '2.運動・感覚', '3.認知・行動', '4.言語・コミュニケーション', '5.人間関係・社会性'].map(x => `${x}\n目標：\n支援：`).join('\n\n');
  return {
    assessment: `#T アセスメントシート\n#R 作成日：${reiwa(d.assess)}\n#R 【利用者名】${nm}\n#R 【作成者】児童発達支援管理責任者 ${gl('name:jihatsukan','【児発管氏名】')}\n\n【基本情報・背景】\n\n【現在の状況と課題】\n・健康・生活\n\n・運動・感覚\n\n・認知・行動\n\n・言語・コミュニケーション\n\n・人間関係・社会性\n\n【保護者の意向】\n・`,
    genan: `#T 個別支援計画書（原案）\n#R 【利用者名】${nm}\n#R 【作成日】${reiwa(d.genan)}\n#R 【計画期間】${per}\n#R 【作成者】児童発達支援管理責任者 ${gl('name:jihatsukan','【児発管氏名】')}\n\n【 総合的な援助の方針 】\n\n【長期目標】\n\n【短期目標と支援内容】\n${five()}\n\n\n#R 同意フォームにて同意（${reiwa(d.genan)}）`,
    kaigi: `#T 個別支援計画策定に係る担当者会議録\n#R 【利用者名】${nm}\n#R 開催日：${reiwa(d.kaigi)}\n#R 場所：レオ\n#R 参加者：${gl('name:jihatsukan','【児発管氏名】')}（児発管）、${gl('name:hoiku1','【保育士氏名】')}（保育士）、${gl('name:hoiku2','【保育士氏名】')}（保育士）\n\n【会議の要旨】\n児発管より、\n保育士より、\n保育士より、\n結論として、`,
    honan: `#T 個別支援計画書（第${n}期）\n#R 【利用者名】${nm}\n#R 【作成日】${reiwa(d.honan)}\n#R 【計画期間】${per}\n#R 【作成者】児童発達支援管理責任者 ${gl('name:jihatsukan','【児発管氏名】')}\n\n【 総合的な援助の方針 】\n\n【長期目標】\n\n【短期目標と支援内容】\n${five()}\n\n\n#R 同意フォームにて同意（${reiwa(d.honan)}）` };
}
const markupHtml = t => esc(t || '').split('\n').map(l => l.startsWith('#T ') ? `<h2 style="text-align:center">${l.slice(3)}</h2>` : l.startsWith('#R ') ? `<div style="text-align:right">${l.slice(3)}</div>` : `<div>${l || '&nbsp;'}</div>`).join('');
const plainText = t => String(t || '').replace(/^#[TR] /gm, '');
const PLAN_DEMO_DB = { plans: [{ id: 1, child: '児童B', term_no: 2, start_on: '2026-11-01', end_on: '2027-04-30', assess_on: '2026-10-27', genan_on: '2026-10-28', kaigi_on: '2026-10-29', honan_on: '2026-10-30',
    assessment: null, genan: null, kaigi: null, honan: null, plan_made: false, genan_consent_at: null, honan_consent_at: null, verified: true },
  { id: 2, child: '児童A', term_no: 2, start_on: '2026-05-01', end_on: '2026-10-31', imported_from: '（見本）既存の計画書ドキュメント', verified: true, note: '実際の期間：令和8年5月8日〜令和8年11月7日。元：Googleドキュメント（4書類に分けて取り込み）', honan: '（見本）取り込んだ今期の本案の本文', plan_made: true, genan_consent_at: '2026-04-28', honan_consent_at: '2026-04-30' }],
  mon: [{ child: '児童B', term: '第2期', answers: { grade: '小1', adl: 3, body: 4, emo: 2, env: 3, comm: 3, social: 2, wish: '（見本）友だちとの関わりを増やしたい' }, submitted_at: '2026-10-12' }],
  staff: [{ child: '児童B', term: '第2期', text: '（見本）5/1〜10/14 の活動記録から：公園で鬼ごっこ…', source: '自動（簡易）' }] };
PLAN_DEMO_DB.sends = [{ kind: 'mon', child: '児童C', term: '第5期', sent_at: '2026-10-03T10:00:00+09:00', via: 'ポータル' }, { kind: 'doui', child: '児童B', term: '第2期', plan_id: 1, doc: '原案', sent_at: '2026-10-05T10:00:00+09:00', via: 'ポータル' }, { kind: 'doui', child: '児童B', term: '第2期', plan_id: 1, doc: '原案', sent_at: '2026-10-11T10:00:00+09:00', via: 'ポータル' }];
PLAN_DEMO_DB.clinks = [];
// 管理表：ポータルの leo_plan_track（児童1行）を読む。空・取得失敗のときは従来の sheetRows('keikaku') に戻す（読み取りだけ。シートへは書き戻さない）
const ymj = d => { const [y, m] = String(d).split('-'); return `${y}年${+m}月`; };
const slashD = d => d ? String(d).replace(/-/g, '/') : '';
const trackToRow = t => ({ 児童名: t.child, 現在の期: `${t.term_no}期`, 現在の計画期間: t.period_from && t.period_to ? `${ymj(t.period_from)}〜${ymj(t.period_to)}` : '', 次期開始月: t.next_start ? ymj(t.next_start) : '',
  フォーム送付目安日: t.survey_due ? slashD(t.survey_due) : '至急', フォーム回答日: slashD(t.survey_answered_at), 計画書作成: t.plan_made ? '済' : '未', 原案署名: t.genan_consent_at ? '済' : '未', 本案署名: t.honan_consent_at ? '済' : '未', 備考: t.note || '', 根拠資料: t.source_ref || '', _track: t });
async function trackRows() {
  try { const t = await sb('leo_plan_track?order=next_start,child'); if (t.length) return t.map(trackToRow); } catch (e) { }
  return sheetRows('keikaku');
}
let PLAN_OPEN = '';
/* plan-cycle:start */
function planNormName(s) { return String(s || '').replace(/[\s\u3000]/g, ''); }
function planTermNo(term) {
  const s = String(term || '').replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
  const m = s.match(/(\d+)\s*期/);
  return m ? +m[1] : null;
}
// カードに出している期と、同じ期の記録だけを使う。ひとつ前の期の回答は借りない（期の数字が先に進んだときは、管理表の現在の期を戻す）。
function planExactTerm(list, name, term) {
  const norm = planNormName(name), want = planTermNo(term);
  if (want == null) return null;
  const hit = (list || []).filter(x => x && planNormName(x.child) === norm && planTermNo(x.term) === want);
  hit.sort((a, b) => String(b.submitted_at || '').localeCompare(String(a.submitted_at || '')));
  return hit[0] || null;
}
function planPeriodPast(periodTo, today) {
  if (!periodTo || !today) return false;
  const end = new Date(String(periodTo).slice(0, 10) + 'T00:00:00+09:00');
  return !isNaN(end.getTime()) && end < today;
}
// 急ぎの欄に出すか。期の数字はここでは足さない。
function planCardFlags({ st, start, periodTo, today, waiting, answered, active }) {
  const on = active !== false && st < 7;
  const startPast = !!(on && start && start < today);
  const periodPast = !!(on && planPeriodPast(periodTo, today));
  const over = startPast || periodPast;
  const soon = !!(on && start && !over && (start - today) / 864e5 <= 45);
  const urgent = !!(on && (over || soon || waiting || answered));
  return { startPast, periodPast, over, soon, urgent };
}
/* plan-cycle:end */
async function planData() {
  if (DEMO) return { rows: PLAN_DEMO_ROWS, ...PLAN_DEMO_DB };
  const [rows, plans, links, ans, staff] = await Promise.all([trackRows(), sb('leo_plans?order=child,term_no'), sb('leo_mon_links?select=token,child,term').catch(() => []),
    sb('leo_mon_answers?order=submitted_at.desc').catch(() => []), sb('leo_staff_mon').catch(() => [])]);
  const [sends, clinks] = await Promise.all([sb('leo_link_sends?order=sent_at').catch(() => []), sb('leo_plan_consent_links?select=token,plan_id,doc,used_at,expires_at&order=link_id').catch(() => [])]);
  const L = Object.fromEntries(links.map(l => [l.token, l]));
  return { rows, plans, links, sends, clinks, staff, mon: ans.map(a => ({ ...L[a.token], answers: a.answers, submitted_at: a.submitted_at })) };
}
LEO_VIEWS.plan = async function () {
  const [D0, LEFT] = await Promise.all([planData(), loadLeftIndex()]), rows = D0.rows.filter(r => r['児童名'] && !String(r['児童名']).startsWith('※')), tday = today(), t = new Date(tday + 'T00:00:00+09:00'), mg = canManage();
  const N = s => String(s || '').replace(/\s/g, '');
  const cards = rows.map(r => {
    const name = r['児童名'], m = String(r['次期開始月'] || '').match(/(\d{4})年(\d{1,2})月/), d = m ? planDates(+m[1], +m[2]) : null;
    const gone = leftDone(LEFT, name, tday), ldate = leftOnOf(LEFT, name);
    const nextIso = d ? isoD(d.start) : '', leavingBeforeNext = !!(ldate && nextIso && nextIso > ldate);
    // カードの期は「いま作っている次の期」＝現在の期+1。次期開始月が過ぎても、ここでは期を足さない。
    const cur = parseInt(String(r['現在の期']).replace(/\D/g, '')) || 0, n = cur + 1, term = `第${n}期`;
    const p = D0.plans.find(x => N(x.child) === N(name) && x.term_no === n), now = D0.plans.find(x => N(x.child) === N(name) && x.term_no === cur);
    const mon = planExactTerm(D0.mon, name, term);
    const sm = planExactTerm(D0.staff, name, term);
    const ago = x => Math.floor((t - new Date(new Date(x).toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' }) + 'T00:00:00+09:00')) / 864e5);
    const wait = [];
    const pend = (label, list, kind, doc) => { if (!list.length) return; const f = list[0], l = list[list.length - 1];
      wait.push({ label, days: ago(f.sent_at), n: list.length, last: l.sent_at, via: l.via, arg: `'${kind}','${esc(name)}','${l.term || term}',${l.plan_id || 0},'${doc || ''}'` }); };
    const S = (D0.sends || []).filter(x => N(x.child) === N(name));
    if (!mon && !r['フォーム回答日']) pend('保護者アンケート', S.filter(x => x.kind === 'mon' && x.term === term), 'mon');
    if (p && !p.genan_consent_at) pend('原案の同意', S.filter(x => x.kind === 'doui' && x.plan_id === p.id && x.doc === '原案'), 'doui', '原案');
    if (p && p.genan_consent_at && !p.honan_consent_at) pend('本案の同意', S.filter(x => x.kind === 'doui' && x.plan_id === p.id && x.doc === '本案'), 'doui', '本案');
    const waitHtml = () => wait.map(w => `<p style="background:${w.days >= 7 ? '#fde8e8' : '#fff8db'};padding:8px;border-radius:6px;margin:6px 0"><small>⏳ <b>${w.label}</b>：送って <b>${w.days}日</b>・返事なし（${w.n}回送付、最後 ${md(new Date(w.last))}・${esc(w.via)}）</small></p>`).join('');
    const done = [!!mon || !!r['フォーム回答日'], !!sm, !!(p && p.genan && p.honan && p.assessment && p.kaigi), !!(p && p.plan_made), !!(p && p.genan_consent_at), !!(p && p.genan_consent_at && d && t >= d.kaigi), !!(p && p.honan_consent_at)];
    const st = done.indexOf(false) < 0 ? 7 : done.indexOf(false);
    const answered = !!(mon || r['フォーム回答日']);
    const flags = planCardFlags({ st, start: d && d.start, periodTo: r._track && r._track.period_to, today: t, waiting: wait.length > 0, answered, active: !gone && !leavingBeforeNext });
    const over = flags.over, soon = flags.soon;
    const key = N(name), open = PLAN_OPEN === key || (DEMO && /open=1/.test(location.search) && name === '児童B');
    const btn = (label, fn, dis) => `<button ${dis ? 'disabled' : ''} onclick="${fn}" style="display:block;width:100%;margin:6px 0;padding:12px;font-size:16px;border-radius:8px">${label}</button>`;
    const W = wait[0], ds = x => x ? md(x) : '';
    const rb = (l, f, dis) => mg ? btn(l, f, dis) : '';
    let act = '', ab = '';
    if (gone) act = `退所（${(ldate || '').replace(/-/g, '/')}）。記録は残しています`;
    else if (leavingBeforeNext && st < 7) act = `退所予定（${ldate.replace(/-/g, '/')}）。次の計画が始まる前に退所するため、急ぎの対象から外しています`;
    else if (st >= 7) act = '✅ 本案の同意まで済み。いまやることはありません';
    else if (st === 0) { if (W) { act = `保護者アンケートの返事待ち（${W.days}日経過）`; ab = rb('再送用にリンクをコピー', `planResend(${W.arg})`); } else { act = '保護者アンケートのリンクを送る'; ab = rb('アンケートのリンクを作る（コピーしてLINEで送る）', `planLink('mon','${esc(name)}','${term}',0,'')`); } }
    else if (st === 1) { act = '職員モニタリングを作る'; ab = rb('活動記録から作る', `staffMon('${esc(name)}','${term}',${cur})`); }
    else if (st === 2) { if (p) { act = '計画書の4書類を確認する'; ab = btn('書類を開いて直す', `planEdit(${p.id})`); } else { act = '計画書のひな形を作る'; ab = d ? rb('計画書を作る（ひな形）', `planNew('${esc(name)}',${n},${d.start.getFullYear()},${d.start.getMonth() + 1})`) : ''; } }
    else if (st === 3) { act = '内容を確認して「計画書作成＝済」にする'; ab = rb('確認した（計画書作成＝済）', `planMade(${p.id})`, !(p.genan && p.honan)); }
    else if (st === 4) { if (W) { act = `原案の同意の返事待ち（${W.days}日経過）`; ab = rb('再送用にリンクをコピー', `planResend(${W.arg})`); } else { act = '原案を保護者に送る'; ab = rb('原案の同意リンクを作る', `planLink('doui','','',${p.id},'原案')`); } }
    else if (st === 5) { act = `担当者会議を行う${d ? '（' + ds(d.kaigi) + '）' : ''}。終わったら本案を送る`; ab = rb('本案の同意リンクを作る', `planLink('doui','','',${p.id},'本案')`); }
    else { if (W) { act = `本案の同意の返事待ち（${W.days}日経過）`; ab = rb('再送用にリンクをコピー', `planResend(${W.arg})`); } else { act = '本案を保護者に送る'; ab = rb('本案の同意リンクを作る', `planLink('doui','','',${p.id},'本案')`); } }
    const linkAct = /リンク|コピー/.test(ab) && !/^<button disabled/.test(ab);
    const how = linkAct ? `<div style="background:#f4f7ff;border-radius:6px;padding:8px;margin:6px 0;font-size:15px">1. 下の青いボタンを押してコピー → 2. 公式LINEで<b>${esc(name)}</b>さんの保護者のトークに貼って送る</div>` : '';
    const checks = PLAN_STEPS2.map((lb, i) => `<div style="color:${done[i] ? '#2a7a2a' : i === st ? '#c00' : '#999'}">${done[i] ? '✔' : i === st ? '▶' : '・'} ${lb}</div>`).join('');
    const urgent = flags.urgent;
    const lateBadge = flags.startPast ? '　<span class="badge">開始月を過ぎています</span>' : flags.periodPast ? '　<span class="badge">今の計画期間を過ぎています</span>' : '';
    return { st, over, d, urgent, gone, key, wait: wait.map(w => ({ ...w, name, key: N(name) })), html: `<div class="card" style="border-left:6px solid ${gone ? '#888' : st >= 7 ? '#3a3' : over ? '#d33' : urgent ? '#e6b800' : '#ccc'};padding:14px">
      <div style="font-size:17px"><b>${esc(name)}</b>${leftMark(LEFT, name, tday)}　<small>${term}${d ? `（${d.start.getFullYear()}/${md(d.start)}〜）` : ''}</small>${lateBadge}</div>
      <div style="display:flex;gap:2px;margin:8px 0">${PLAN_STEPS2.map((_, i) => `<span style="flex:1;height:8px;border-radius:3px;background:${done[i] ? '#3a3' : i === st ? '#e6b800' : '#ddd'}"></span>`).join('')}</div>
      <div style="font-size:20px;font-weight:bold;margin:8px 0;color:${st >= 7 ? '#2a7a2a' : '#c00'}">${act}</div>
      ${how}${ab}
      <details style="margin-top:8px" ${open ? 'open' : ''} ontoggle="if(this.open)PLAN_OPEN='${key}'"><summary style="cursor:pointer;color:#36c">くわしく見る</summary>
        <div style="margin-top:8px;font-size:14px">${checks}</div>
        <div>${waitHtml()}
        
        ${d ? `<p><small>書類に入れる日付（作成者 ${gl('name:jihatsukan','【児発管氏名】')}）：アセスメント ${md(d.assess)}・原案 ${md(d.genan)}・担当者会議 ${md(d.kaigi)}・本案 ${md(d.honan)}</small></p>` : '<p class="note">管理表の「次期開始月」がありません。</p>'}
        <h4>今の計画（第${cur}期）</h4>${now ? `<p><small>${now.imported_from ? '取り込み元：' + esc(now.imported_from) : 'ポータルで作成'}${now.verified ? '　✅ 確認済' : '　<span class="badge">未確認</span>'}</small></p>${now.note ? `<p><small>${esc(now.note)}</small></p>` : ''}${btn('今の計画書を見る・印刷', `planPrint(${now.id})`)}` : '<p class="note">まだ取り込んでいません（未確認）。</p>'}
        <h4>1. 保護者アンケート</h4>${mon ? `<p><small>回答 ${new Date(mon.submitted_at).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' })}：${esc(Object.entries(mon.answers).filter(([k, v]) => typeof v === 'string' && v).map(([k, v]) => v).join('／')).slice(0, 200)}</small></p>` : '<p class="note">まだ回答がありません。</p>'}
        ${mg ? btn('アンケートのリンクを作る（コピーしてLINEで送る）', `planLink('mon','${esc(name)}','${term}',0,'')`) : ''}
        <h4>2. 職員モニタリング</h4>${sm ? `<details><summary>${esc(sm.source)}（タップで読む）</summary><p style="white-space:pre-wrap"><small>${esc(sm.text)}</small></p></details>` : '<p class="note">まだありません。</p>'}
        ${mg ? btn('活動記録から作る（今の計画期間）', `staffMon('${esc(name)}','${term}',${cur})`) : ''}
        <h4>3. 計画書（4書類）</h4>
        ${p ? `${btn('書類を開いて直す', `planEdit(${p.id})`)}${btn('印刷する', `planPrint(${p.id})`)}
          ${mg && !p.plan_made ? btn('確認した（計画書作成＝済）', `planMade(${p.id})`, !(p.genan && p.honan)) : `<p><small>${p.plan_made ? '✅ 計画書作成＝済' : ''}</small></p>`}
          <h4>4. 同意（原案 → 担当者会議 → 本案）</h4>
          <p><small>原案：${p.genan_consent_at ? '✅ ' + new Date(p.genan_consent_at).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' }) : 'まだ'}／本案：${p.honan_consent_at ? '✅ ' + new Date(p.honan_consent_at).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' }) : 'まだ'}</small></p>
          ${mg ? btn('原案の同意リンクを作る', `planLink('doui','','',${p.id},'原案')`, !p.plan_made) + btn('本案の同意リンクを作る（原案の同意と会議のあと）', `planLink('doui','','',${p.id},'本案')`, !p.genan_consent_at) : ''}`
          : (mg && d ? btn(`第${n}期の計画書を作る（ひな形）`, `planNew('${esc(name)}',${n},${d.start.getFullYear()},${d.start.getMonth() + 1})`) : '<p class="note">まだありません。</p>')}
        <div id="pm_${key}"></div></div>
      </details></div>` };
  }).sort((a, b) => (a.st >= 7) - (b.st >= 7) || b.over - a.over || (a.d?.start || 0) - (b.d?.start || 0));
  const live = cards.filter(c => !c.gone), leftCards = cards.filter(c => c.gone);
  return `<h3>個別支援計画</h3>${demoNote()}<p class="note">各カードの赤い行と下のボタンだけ進めれば大丈夫です。細かい情報は「くわしく見る」にあります。保護者へのリンクはコピーして、公式LINEの1対1トークで送ってください（ポータルからは送りません）。本文の下書きはボットが作ります。退所日を過ぎた児童は下に分けています（記録は残しています）。</p>
    ${live.filter(c => c.urgent).map(c => c.html).join('') || '<p class="note">いま急ぎの子はいません。</p>'}${live.some(c => !c.urgent) ? `<details style="margin-top:10px" ${live.some(c => !c.urgent && PLAN_OPEN === c.key) ? 'open' : ''}><summary style="cursor:pointer;font-weight:bold">いま急ぎではない子（${live.filter(c => !c.urgent).length}人）</summary>${live.filter(c => !c.urgent).map(c => c.html).join('')}</details>` : ''}${leftCards.length ? `<details style="margin-top:10px" ${leftCards.some(c => PLAN_OPEN === c.key) ? 'open' : ''}><summary style="cursor:pointer;font-weight:bold">退所した児童（${leftCards.length}人・記録は残しています）</summary>${leftCards.map(c => c.html).join('')}</details>` : ''}${cards.length ? '' : '<p>管理表の行がありません。</p>'}${mg ? trackEditList(rows) : ''}<div id="plan_editor"></div>`;
};
// 管理表の行を直す（児発管・管理者・事務）。ポータルの表だけを直す。Googleの管理表へは書き戻さない
function trackEditList(rows) {
  const tr = rows.filter(r => r._track);
  if (!tr.length) return '';
  return `<details style="margin-top:14px"><summary style="cursor:pointer;font-weight:bold">管理表の行を直す（${tr.length}人）</summary><p class="note">ここで直すのはポータルの管理表だけです。Googleの管理表は変わりません（11/1までは両方が動きます）。カードに出る期は、ここの「現在の期」のひとつ先です。次期開始日が、カードの開始日です。日付が過ぎただけでは期は進みません。</p>
    ${tr.map(r => `<p style="margin:6px 0"><button onclick="trackEdit('${esc(r.児童名)}')" style="padding:8px 12px">${esc(r.児童名)}</button> <small>${esc(r.現在の期)}・${esc(r.現在の計画期間)}</small></p>`).join('')}</details>`;
}
const TRACK_FIELDS = [['term_no', '現在の期（数字）', 'number'], ['period_from', '計画期間 開始', 'date'], ['period_to', '計画期間 終了', 'date'], ['next_start', '次期開始日（1日）', 'date'], ['survey_due', 'アンケート送付目安日（空＝至急）', 'date'],
  ['survey_answered_at', 'アンケート回答日', 'date'], ['genan_date', '原案の予定日', 'date'], ['kaigi_date', '会議の予定日', 'date'], ['honan_date', '本案の予定日', 'date']];
async function trackEdit(name) {
  if (DEMO) { $('plan_editor').innerHTML = '<div class="card"><p class="note">見本モードなので保存しません。本番では、この欄で「現在の期」と「次期開始日」を直せます。</p></div>'; $('plan_editor').scrollIntoView(); return; }
  const t = (await sb(`leo_plan_track?child=eq.${encodeURIComponent(name)}`))[0]; if (!t) return;
  $('plan_editor').innerHTML = `<div class="card"><h3>${esc(t.child)}　管理表の行</h3>
    ${TRACK_FIELDS.map(([k, l, ty]) => `<label style="display:block;margin:6px 0"><small>${l}</small><br><input id="te_${k}" type="${ty}" value="${esc(t[k] ?? '')}" style="font-size:16px;padding:6px"></label>`).join('')}
    <label style="display:block;margin:6px 0"><input id="te_plan_made" type="checkbox" ${t.plan_made ? 'checked' : ''}> 計画書作成＝済</label>
    <p class="note">原案・本案の同意日は、保護者の同意ページから自動で入ります（ここでは直しません）。</p>
    <label style="display:block;margin:6px 0"><small>備考</small><br><textarea id="te_note" rows="4" style="width:100%;box-sizing:border-box;font-size:15px">${esc(t.note || '')}</textarea></label>
    <button onclick="trackSave('${esc(t.child)}')">保存</button><div id="te_msg"></div></div>`;
  $('plan_editor').scrollIntoView();
}
async function trackSave(name) {
  if (DEMO) { $('te_msg').textContent = '見本モードなので保存しません。'; return; }
  const b = { plan_made: $('te_plan_made').checked, note: $('te_note').value.trim() || null };
  for (const [k, , ty] of TRACK_FIELDS) { const v = $('te_' + k).value; b[k] = v === '' ? null : ty === 'number' ? +v : v; }
  if (!b.term_no) { $('te_msg').textContent = '期を入れてください。'; return; }
  if (b.next_start && !/-01$/.test(b.next_start)) { $('te_msg').textContent = '次期開始日は1日にしてください。'; return; }
  try { await sb(`leo_plan_track?child=eq.${encodeURIComponent(name)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(b) }); renderLeoView('plan'); } catch (e) { $('te_msg').textContent = e.message; }
}
function planWaitList(cards) {
  const w = cards.flatMap(c => c.wait).sort((a, b) => b.days - a.days);
  if (!w.length) return '';
  return `<div class="card" style="border-left:6px solid #d33"><b>返事待ちの家庭</b><p class="note">リンクを送ってからの日数です（7日以上は赤）。名前をタップするとその子の欄が開きます。</p>
    ${w.map(x => `<p style="margin:6px 0;cursor:pointer" onclick="PLAN_OPEN='${x.key}';renderLeoView('plan')"><span style="display:inline-block;min-width:3.5em;font-weight:bold;color:${x.days >= 7 ? '#c00' : '#a60'}">${x.days}日</span>${esc(x.name)}　<small>${x.label}（${x.n}回送付）</small></p>`).join('')}</div>`;
}
const pmsg = (name, t) => { const el = document.querySelector(`[id^="pm_${String(name).replace(/\s/g, '')}"]`) || $('plan_editor'); if (el) el.innerHTML = t; else alert(t); };
async function planNew(name, n, y, m) {
  const d = planDates(y, m), sk = planSkeleton(name, n, d);
  if (DEMO) { pmsg(name, '<p class="note">見本モードなので作りません。</p>'); return; }
  try { await sb('leo_plans', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ child: name, term_no: n, start_on: isoD(d.start), end_on: isoD(d.end),
      assess_on: isoD(d.assess), genan_on: isoD(d.genan), kaigi_on: isoD(d.kaigi), honan_on: isoD(d.honan), ...sk }) }); renderLeoView('plan'); } catch (e) { pmsg(name, esc(e.message)); }
}
async function planGet(id) { return DEMO ? PLAN_DEMO_DB.plans.find(p => p.id === id) : (await sb(`leo_plans?id=eq.${id}`))[0]; }
async function planEdit(id) {
  const p = await planGet(id), [y, m] = p.start_on.split('-').map(Number), sk = planSkeleton(p.child, p.term_no, planDates(y, m));
  const f = (k, l) => `<label><b>${l}</b><textarea id="pe_${k}" rows="14" style="width:100%;font-size:15px;box-sizing:border-box">${esc(p[k] || sk[k])}</textarea></label>`;
  $('plan_editor').innerHTML = `<div class="card"><h3>${esc(p.child)}　第${p.term_no}期</h3><p class="note">#T＝中央の見出し、#R＝右寄せの行。表や記号は使いません。${p.plan_made ? '<b>計画書作成＝済のため、ボットは上書きしません。</b>' : ''}</p>
    ${f('assessment', '① アセスメントシート')}${f('genan', '② 個別支援計画書（原案）')}${f('kaigi', '③ 担当者会議録')}${f('honan', `④ 個別支援計画書（第${p.term_no}期）`)}
    <button onclick="planSave(${id})">保存</button> <button onclick="planPrint(${id})">印刷</button><div id="pe_msg"></div></div>`;
  $('plan_editor').scrollIntoView();
}
async function planSave(id) {
  const b = Object.fromEntries(['assessment', 'genan', 'kaigi', 'honan'].map(k => [k, $('pe_' + k).value]));
  if (DEMO) { $('pe_msg').textContent = '見本モードなので保存しません。'; return; }
  try { await sb(`leo_plans?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(b) }); $('pe_msg').textContent = '保存しました。'; } catch (e) { $('pe_msg').textContent = e.message; }
}
async function planMade(id) {
  if (DEMO) { alert('見本モードなので保存しません'); return; }
  try { await sb(`leo_plans?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ plan_made: true }) }); renderLeoView('plan'); } catch (e) { alert(e.message); }
}
async function planPrint(id) {
  const p = await planGet(id), docs = p.imported_from && !p.genan ? [p.honan] : [p.assessment, p.genan, p.kaigi, p.honan];
  const w = window.open('', '_blank'); if (!w) { alert('ポップアップを許可してください'); return; }
  w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(p.child)} 第${p.term_no}期</title><style>body{font-family:"Hiragino Mincho ProN","Yu Mincho",serif;font-size:11pt;line-height:1.7;margin:20mm}h2{font-size:15pt}.pb{page-break-before:always}</style>` +
    docs.filter(Boolean).map((t, i) => `<div class="${i ? 'pb' : ''}">${markupHtml(t)}</div>`).join('') + '<script>setTimeout(()=>print(),300)<\/script>'); w.document.close();
}
// リンクのコピー：結果をボタンのすぐ下に必ず表示（成功＝緑、失敗＝URL欄を出して手でコピー）
async function copyUrl(url) {
  try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(url); return true; } } catch (e) { }
  try { const ta = document.createElement('textarea'); ta.value = url; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok; } catch (e) { return false; }
}
function copyBtnEl() { const e = window.event; return e && e.currentTarget && e.currentTarget.tagName === 'BUTTON' ? e.currentTarget : null; }
function copyNote(b, html, child) {
  if (!b) { pmsg(child || '', html); return; }
  let m = b.nextElementSibling; if (!m || !m.classList.contains('copymsg')) { m = document.createElement('div'); m.className = 'copymsg'; b.insertAdjacentElement('afterend', m); }
  m.innerHTML = html; m.scrollIntoView({ block: 'nearest' });
}
function copyResult(b, url, ok, child, extra) {
  const e = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  if (b) { if (!b.dataset.orig) b.dataset.orig = b.textContent; b.textContent = ok ? 'コピーしました ✔' : b.dataset.orig; clearTimeout(b._t); if (ok) b._t = setTimeout(() => { b.textContent = b.dataset.orig; }, 5000); }
  copyNote(b, ok ? `<p style="background:#e6f6e6;color:#1a6b1a;padding:10px;border-radius:6px;font-weight:bold;margin:6px 0">コピーしました。公式LINEの1対1トークに貼って送ってください。</p><p class="note">${extra || ''}</p>`
    : `<p style="background:#fde8e8;color:#b00;padding:10px;border-radius:6px;font-weight:bold;margin:6px 0">自動でコピーできませんでした。下のリンクを長押し（または選択）してコピーし、公式LINEの1対1トークに貼って送ってください。</p><input readonly value="${e(url)}" onfocus="this.select()" onclick="this.select()" style="width:100%;font-size:14px"><p class="note">${extra || ''}</p>`, child);
}
function copyError(b, msg, child) { copyNote(b, `<p style="background:#fde8e8;color:#b00;padding:10px;border-radius:6px;font-weight:bold;margin:6px 0">失敗しました：${String(msg).replace(/[<&]/g, '')}</p>`, child); }
async function planLink(kind, child, term, planId, doc) {
  if (DEMO) { pmsg(child || '児童B', `<p class="note">見本：${location.origin}${location.pathname.replace(/[^/]*$/, '')}hogosha.html?k=${kind}&demo=1${doc ? '&doc=' + encodeURIComponent(doc) : ''}</p>`); return; }
  const B = copyBtnEl(); if (B) B.disabled = true;
  try { const tok = await sb('rpc/leo_make_token_link', { method: 'POST', body: JSON.stringify({ p_kind: kind, p_child: child, p_term: term, p_plan: planId || null, p_doc: doc }) });
    const url = `${location.origin}${location.pathname.replace(/[^/]*$/, '')}hogosha.html?k=${kind}&t=${tok}`;
    const ok = await copyUrl(url);
    await planLogSend(kind, child, term, planId, doc, tok, null);
    copyResult(B, url, ok, child, 'ほかの家庭には送らないでください。' + (kind === 'doui' ? 'リンクは30日で期限が切れ、同意が1回入ると使えなくなります。あとで本文を直したときは、リンクをもう一度作ってください。' : '')); }
  catch (e) { copyError(B, e.message, child); }
  finally { if (B) B.disabled = false; }
}
async function planLogSend(kind, child, term, planId, doc, tok, url, via) {
  try { if (!child && planId) { const p = await planGet(planId); child = p.child; term = `第${p.term_no}期`; }
    await sb('leo_link_sends', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ kind, child, term, plan_id: planId || null, doc: doc || null, token: tok, url, via: via || 'ポータル' }) }); } catch (e) { }
}
// 再送：前と同じリンクをコピーし、送った記録を足す（ポータルからは送らない）
async function planResend(kind, child, term, planId, doc) {
  const B = copyBtnEl();
  if (DEMO) { copyNote(B, '<p class="note">見本：リンクをコピーして、送った記録を1件足します。</p>', child); return; }
  try {
  const D0 = await planData(), N = s => String(s || '').replace(/\s/g, '');
  const prev = (D0.sends || []).filter(x => x.kind === kind && N(x.child) === N(child) && (kind === 'mon' ? x.term === term : x.plan_id === planId && x.doc === doc)).pop();
  let tok = kind === 'mon' ? (D0.links.find(l => N(l.child) === N(child) && l.term === term) || {}).token : (D0.clinks.filter(l => l.plan_id === planId && l.doc === doc && !l.used_at && new Date(l.expires_at) > new Date()).pop() || {}).token;
  let url = tok ? `${location.origin}${location.pathname.replace(/[^/]*$/, '')}hogosha.html?k=${kind}&t=${tok}` : prev && prev.url;
  if (!url) { await planLink(kind, kind === 'mon' ? child : '', kind === 'mon' ? term : '', planId, doc); return; }
  const ok = await copyUrl(url);
  await planLogSend(kind, child, term, planId, doc, tok || null, tok ? null : url, tok ? 'ポータル（再送）' : 'Google（再送）');
  copyResult(B, url, ok, child, (tok ? '' : 'これはGoogleフォームのリンクです（全員共通）。') + '送った記録を1件足しました。');
  } catch (e) { copyError(B, e.message, child); }
}
// ④ 職員モニタリング：今の計画期間の活動記録（日誌Q列＋ポータルの下書き由来）を日付順にまとめる。ボットが文章に整える
async function staffMon(name, term, cur) {
  const B = copyBtnEl(), NN = x => String(x || '').replace(/[\s\u3000]/g, '');
  const bad = h => copyNote(B, `<p style="background:#fde8e8;color:#b00;padding:10px;border-radius:6px;font-weight:bold;margin:6px 0">${h}</p>`, name);
  if (DEMO) { copyNote(B, '<p class="note">見本モードなので作りません。</p>', name); return; }
  if (B) B.disabled = true;
  try {
    copyNote(B, '<p class="note">作っています…</p>', name);
    const r = (await trackRows()).find(x => NN(x['児童名']) === NN(name)) || {}, tk = r._track || {};
    const m = String(r['現在の計画期間'] || '').match(/(\d{4})年\s*(\d{1,2})月/);
    let from = m ? `${m[1]}-${String(m[2]).padStart(2, '0')}-01` : (tk.period_from || null);
    if (!from && tk.next_start) from = addDays(tk.next_start, -183);
    if (!from) from = addDays(today(), -183);
    const to = today();
    const full = (await sb(`leo_nikki_full?day=gte.${from}&day=lte.${to}&order=day&select=day,child,activity_text`)).filter(x => NN(x.child) === NN(name) && x.activity_text && String(x.activity_text).trim());
    // 日誌（DB）に行がない過去の日は、活動記録（leo_activity）から直接補う
    const have = new Set(full.map(x => x.day));
    const extra = (await sb(`leo_activity?day=gte.${from}&day=lte.${to}&order=day&select=day,child,text`)).filter(x => NN(x.child) === NN(name) && x.text && String(x.text).trim() && !have.has(x.day)).map(x => ({ day: x.day, child: x.child, activity_text: x.text }));
    const rows = full.concat(extra).sort((a, b) => a.day < b.day ? -1 : a.day > b.day ? 1 : 0);
    if (!rows.length) { bad(`この期間（${from}〜${to}）の活動記録がありません。日誌に活動記録が入っていません`); return; }
    const text = `【${from}〜${to} の活動記録から（${rows.length}日分）】\n` + rows.map(x => `${fmtDay(x.day)}　${x.activity_text}`).join('\n');
    await sb('leo_staff_mon?on_conflict=child,term', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ child: name, term, period_from: from, period_to: to, text: text.slice(0, 20000), source: '自動（簡易）' }) });
    copyNote(B, `<p style="background:#e6f6e6;color:#1a6b1a;padding:10px;border-radius:6px;font-weight:bold;margin:6px 0">作りました（${rows.length}日分）</p>`, name);
    setTimeout(() => renderLeoView('plan'), 1500);
  } catch (e) { bad('失敗しました：' + esc(e.message)); }
  finally { if (B) B.disabled = false; }
}
// ===== 配置表・型表・管理表の入力（児発管・管理者・事務）＋ 送迎の配慮 =====
const MASTER_LABEL = { kata: '送迎 型表', keikaku: '個別支援計画 管理表', haichi: '職員配置表', care: '送迎の配慮（児童ごと）' };
let MASTER_KIND = 'kata';
// 型表の画面上の列順だけ。data-c は保存されている列名のまま（迎え時間＝迎え開始、送り時間＝送り終了、送り場所＝送り場所（空欄なら自宅））。ここに無い列は今の順でうしろ。
const KATA_COL_SLOTS = [
  ['曜日'], ['児童名'], ['利用週'], ['利用開始'], ['利用終了'], ['迎え順'],
  ['迎え開始', '迎え時間'], ['迎え場所'], ['学校お迎え時刻（基準）※空欄なら迎え開始'], ['迎え担当'], ['送り順'],
  ['送り終了', '送り時間'], ['送り場所（空欄なら自宅）', '送り場所'], ['送り担当'],
];
function orderKataCols(cols) {
  const left = [...cols];
  const out = [];
  for (const names of KATA_COL_SLOTS) {
    let picked = -1;
    for (const n of names) { const i = left.indexOf(n); if (i >= 0) { picked = i; break; } }
    if (picked >= 0) out.push(left.splice(picked, 1)[0]);
  }
  return out.concat(left);
}
// 型表の見出しだけ。保存する列名（data-c）は変えない。
function kataColLabel(c) {
  if (c === '迎え開始') return '迎え時間';
  if (c === '送り終了') return '送り時間';
  if (c === '学校お迎え時刻（基準）※空欄なら迎え開始') return '学校お迎え時刻';
  return c;
}
LEO_VIEWS.master = async function () {
  if (!canManage()) return '<p>この画面は児発管・管理者・事務だけです。</p>';
  const tabs = '<p class="ptabs">' + Object.entries(MASTER_LABEL).map(([k, l]) => `<button class="${k === MASTER_KIND ? 'on' : ''}" onclick="MASTER_KIND='${k}';renderLeoView('master')">${l}</button>`).join('') + '</p>';
  if (MASTER_KIND === 'care') {
    const [kids, cc, LEFT] = await Promise.all([[...new Set((await sheetRows('kata')).map(r => r['児童名']).filter(Boolean))], DEMO ? [{ child: '児童A', note: '（見本）助手席の後ろ。降車時は母へ直接引き渡し。' }] : sb('leo_child_care'), loadLeftIndex()]);
    const C2 = Object.fromEntries(cc.map(x => [x.child, x.note])), tday = today();
    return `<h3>送迎の配慮</h3>${demoNote()}${tabs}<p class="note">座席・チャイルドシート・引き渡す相手・酔いやすさ・アレルギーなど。送迎画面で運転手に出ます。退所の印は表示だけです（ここを保存しても型表は変わりません）。</p>
      ${kids.map(k => `<label>${esc(k)}${leftDone(LEFT, k, tday) ? '（退所）' : leftOnOf(LEFT, k) ? '（退所予定）' : ''}<input class="care" data-c="${esc(k)}" value="${esc(C2[k] || '')}"></label>`).join('')}<button onclick="saveCare()">保存</button><div id="ms_msg"></div>`;
  }
  const own = DEMO ? [] : await sb(`leo_master?kind=eq.${MASTER_KIND}&order=row_no`), g = DEMO ? DEMO_DATA[MASTER_KIND] : (await sb(`leo_sheet?kind=eq.${MASTER_KIND}&order=row_no`)).map(r => r.data);
  const rows = own.length ? own.map(r => r.data) : g;
  let cols = [...new Set([...g, ...rows].flatMap(Object.keys))];
  if (MASTER_KIND === 'kata') cols = orderKataCols(cols);
  return `<h3>${MASTER_LABEL[MASTER_KIND]}の入力</h3>${demoNote()}${tabs}
    <p class="note">${own.length ? 'ポータルで入力した内容です（ポータルの画面はこちらを使います）。' : 'まだポータルで入力していません。下はGoogleの表の写しです。「保存」するとポータルの表になります（Googleの表は変わりません）。'}11/1まではGoogleの表も今まで通り使ってください。文字は切れずに全部出ます。窓が狭いときは表を横に滑らせてください。</p>
    <div class="sheet-scroll"><table class="msheet"><tr>${cols.map(c => `<th data-c="${esc(c)}">${esc(MASTER_KIND === 'kata' ? kataColLabel(c) : c)}</th>`).join('')}</tr>${[...rows, {}].map(r => `<tr class="mrow">${cols.map(c => `<td><input data-c="${esc(c)}" value="${esc(r[c] ?? '')}" oninput="fitMasterInput(this)"></td>`).join('')}</tr>`).join('')}</table></div>
    <button onclick="renderLeoView('master').then(()=>{})" style="display:none"></button><button onclick="addMasterRow()">＋ 行を足す</button> <button onclick="saveMaster()">保存</button><div id="ms_msg"></div>`;
};
// 型表などの入力欄。短い列は中身（曜日は1文字、時刻は HH:MM）に合わせ、見出しは折り返す。保存する中身は変えない。
function masterTextPx(text, font) {
  const probe = document.createElement('span');
  probe.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;white-space:pre;';
  probe.style.font = font;
  probe.textContent = text || '';
  document.body.appendChild(probe);
  const w = probe.getBoundingClientRect().width;
  probe.remove();
  return w;
}
function masterFloorText(col) {
  const c = String(col || '');
  if (c === '曜日') return '月';
  if (c.includes('利用週')) return '毎週';
  if (/(開始|終了|時刻)$/.test(c)) return '00:00';
  if (/時間\(h\)/.test(c)) return '00.00';
  if (/(順|児童数)$/.test(c)) return '00';
  if (c === '保護者送迎') return '○';
  if (/署名|計画書作成/.test(c)) return '済';
  if (c === '現在の期') return '10期';
  if (c.includes('常勤')) return '非常勤';
  return 'あいう';
}
function masterPad(cs) {
  return (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0) + (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.borderRightWidth) || 0) + 2;
}
function masterBasis(col, value, font) {
  const floor = masterFloorText(col);
  return masterTextPx(value, font) > masterTextPx(floor, font) ? (value || floor) : floor;
}
function fitMasterSheet() {
  const table = document.querySelector('table.msheet');
  if (!table) return;
  const sample = table.querySelector('input');
  if (!sample) return;
  const cs = getComputedStyle(sample);
  const extra = masterPad(cs);
  const byCol = {};
  table.querySelectorAll('input').forEach(inp => {
    const col = inp.dataset.c || '';
    const basis = masterBasis(col, inp.value, cs.font);
    byCol[col] = Math.max(byCol[col] || 0, Math.ceil(masterTextPx(basis, cs.font) + extra));
  });
  table.querySelectorAll('input').forEach(inp => { inp.style.width = byCol[inp.dataset.c] + 'px'; });
  table.querySelectorAll('th').forEach(th => {
    const w = byCol[th.dataset.c || th.textContent];
    if (!w) return;
    th.style.width = w + 'px';
    th.style.maxWidth = w + 'px';
  });
}
function fitMasterInput(el) {
  if (!el) return;
  const cs = getComputedStyle(el);
  const basis = masterBasis(el.dataset.c || '', el.value, cs.font);
  const need = Math.ceil(masterTextPx(basis, cs.font) + masterPad(cs));
  if (need > el.getBoundingClientRect().width + 1) el.style.width = need + 'px';
}
function addMasterRow() {
  const t = document.querySelector('tr.mrow:last-child');
  const row = t.cloneNode(true);
  row.querySelectorAll('input').forEach(i => { i.value = ''; });
  t.parentNode.appendChild(row);
  fitMasterSheet();
}
async function saveMaster() {
  const rows = [...document.querySelectorAll('tr.mrow')].map(tr => Object.fromEntries([...tr.querySelectorAll('input')].map(i => [i.dataset.c, i.value.trim()]).filter(([, v]) => v))).filter(o => Object.keys(o).length);
  const m = $('ms_msg'); if (DEMO) { m.textContent = `見本モードなので保存しません（${rows.length}行）。`; return; }
  try { await sb(`leo_master?kind=eq.${MASTER_KIND}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    if (rows.length) await sb('leo_master', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(rows.map((d, i) => ({ kind: MASTER_KIND, row_no: i + 1, data: d }))) });
    m.textContent = `${rows.length}行を保存しました。`; } catch (e) { m.textContent = e.message; }
}
async function saveCare() {
  const rows = [...document.querySelectorAll('input.care')].map(i => ({ child: i.dataset.c, note: i.value.trim() || null })), m = $('ms_msg');
  if (DEMO) { m.textContent = '見本モードなので保存しません。'; return; }
  try { await sb('leo_child_care?on_conflict=child', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows) }); m.textContent = '保存しました。'; } catch (e) { m.textContent = e.message; }
}

// ===== 加算・人員の要件チェック（請求CSVの前に） =====
async function billChecks(nikki, flags) {
  const out = [], by = {}; nikki.filter(n => n.kind === '利用').forEach(n => (by[n.day] ||= new Set()).add(n.child));
  let hai = []; try { hai = await sheetRows('haichi'); } catch (e) { }
  const staffOn = d => new Set(hai.filter(r => String(r['日付'] || '').replace(/\//g, '-').slice(0, 10) === d).map(r => r['職員名'])).size;
  for (const [d, s] of Object.entries(by)) {
    if (s.size > 10) out.push(`${fmtDay(d)}：利用${s.size}人（定員10）。定員超過になっていないか確認`);
    const n = staffOn(d); if (hai.length && n < 2) out.push(`${fmtDay(d)}：配置表の職員が${n}人。児童指導員・保育士等2人以上が必要（人員欠如減算に注意）`);
  }
  flags.filter(f => f.absent_support && !(f.absent_note || '').trim()).forEach(f => out.push(`${fmtDay(f.day)} ${f.child}：欠席時対応の記録内容が空です`));
  const ab = new Set(nikki.filter(n => n.kind === '欠席').map(n => n.day + n.child));
  flags.filter(f => f.absent_support && !ab.has(f.day + f.child)).forEach(f => out.push(`${fmtDay(f.day)} ${f.child}：欠席時対応の印があるが、日誌では欠席になっていません`));
  const nt = nikki.filter(n => n.kind === '利用' && (!n.start_time || !n.end_time)); nt.forEach(n => out.push(`${fmtDay(n.day)} ${n.child}：開始・終了時間がありません（算定できません）`));
  return out;
}

// ===== ① LINE報告の下書き（「活動記録 下書き（業務日誌用）」ドキュメントの置き換え） =====
// 書く→「LINE用にコピー」→公式LINEの1対1トークに貼って送る（送るのは職員。ポータルからは送らない）→ 日誌の活動記録（である調）はボットが作る
let LINE_DAY = today();
const LINE_DEMO = { kids: ['児童A', '児童B', '児童C'], drafts: [{ id: 1, day: today(), child: '児童A', body: '本日もありがとうございました。\n（見本）公園で鬼ごっこをして、たくさん走りました。おやつも完食です。\n職員X', author_name: '職員X', sent_line: true }],
  act: [{ day: today(), child: '児童A', text: '（見本）公園で鬼ごっこをし、たくさん走った。おやつは完食した。', source: 'ボット' }] };
LEO_VIEWS.line = async function () {
  let kids, drafts, act;
  if (DEMO) ({ kids, drafts, act } = LINE_DEMO);
  else { const [n, d, a] = await Promise.all([sb(`leo_nikki?day=eq.${LINE_DAY}&kind=eq.利用&select=child&order=row_no`), sb(`leo_line_drafts?day=eq.${LINE_DAY}&order=updated_at.desc`), sb(`leo_activity?day=eq.${LINE_DAY}`)]);
    kids = [...new Set(n.map(x => x.child).filter(Boolean))]; drafts = d; act = a; }
  const A = Object.fromEntries(act.map(x => [x.child, x])), D = {}; drafts.forEach(x => (D[x.child] ||= x));
  const me = DEMO ? '職員X' : await myName();
  return `<h3>LINE報告を書く</h3><a href="https://chat.line.biz/U09e93081492c29e963d2bba78499043f" target="_blank" rel="noopener" style="display:block;background:#06c755;color:#fff;text-align:center;font-size:20px;font-weight:bold;padding:14px;border-radius:10px;text-decoration:none;margin:6px 0 12px">💬 公式LINEを開く（新しいタブ）</a>${demoNote()}
    <p class="ptabs"><button onclick="LINE_DAY=addDays(LINE_DAY,-1);renderLeoView('line')">← 前の日</button> <b>${fmtDay(LINE_DAY)}</b> <button onclick="LINE_DAY=addDays(LINE_DAY,1);renderLeoView('line')">次の日 →</button></p>
    <p class="note">保護者さんへの報告文を、子どもごとに書きます。書けたら「LINE用にコピー」→ 公式LINEの1対1トークに貼って送ってください。日誌の活動記録（である調）は自動で作ります。</p>
    ${kids.map(k => { const d = D[k], a = A[k], id = 'ln_' + btoa(unescape(encodeURIComponent(k))).replace(/=/g, '');
      return `<details class="card" ${d ? '' : 'open'} style="padding:0"><summary style="padding:14px;font-size:17px;cursor:pointer"><b>■${esc(k)}</b>　<small>${d ? (d.sent_line ? '✅ LINE送信済' : '✏️ 下書きあり') : '⬜ まだ'}${a ? '／日誌 ' + esc(a.source) : ''}</small></summary>
        <div style="padding:0 14px 14px"><textarea id="${id}" rows="30" style="width:100%;font-size:16px;box-sizing:border-box" placeholder="本日もありがとうございました。…">${esc(d ? d.body : '')}</textarea>
        <p class="note">最後の行に名前（${esc(me || '自分の名前')}）を入れてください。</p>
        <button onclick="saveLine('${esc(k)}','${id}',${d ? d.id : 'null'})">保存</button>
        <button onclick="copyLine('${id}','${esc(k)}',${d ? d.id : 'null'})">LINE用にコピー（送った印をつける）</button>
        ${a ? `<details style="margin-top:8px"><summary>日誌の活動記録（${esc(a.source)}）</summary><p style="white-space:pre-wrap">${esc(a.text)}</p></details>` : ''}<div id="${id}_m"></div></div></details>`; }).join('') || '<p>この日の日誌に利用の子がいません。</p>'}`;
};
async function saveLine(child, id, did) {
  const body = $(id).value.trim(), m = $(id + '_m'); if (!body) { m.textContent = '本文を書いてください。'; return; }
  if (DEMO) { m.textContent = '見本モードなので保存しません。'; return; }
  try { const name = await myName();
    if (did) await sb(`leo_line_drafts?id=eq.${did}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ body, updated_at: new Date().toISOString() }) });
    else await sb('leo_line_drafts', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ day: LINE_DAY, child, body, author_name: name }) });
    await sb('rpc/leo_activity_from_drafts', { method: 'POST', body: JSON.stringify({ p_day: LINE_DAY }) });
    try {
      const [nk, ac] = await Promise.all([
        sb(`leo_nikki?day=eq.${LINE_DAY}&child=eq.${encodeURIComponent(child)}&kind=eq.利用&select=row_no,activity`),
        sb(`leo_activity?day=eq.${LINE_DAY}&child=eq.${encodeURIComponent(child)}&select=text`)]);
      const row = nk[0], text = (ac[0] && ac[0].text || '').trim();
      if (row && text && !String(row.activity || '').trim())
        await sb('leo_edits', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify([{ target: 'nikki', day: LINE_DAY, row_key: String(row.row_no), field: 'activity', old_value: row.activity || '', new_value: text.slice(0, 4000) }]) });
    } catch (e) { }
    m.textContent = '保存し、日誌の活動記録へ転記しました。'; } catch (e) { m.textContent = e.message; }
}
async function copyLine(id, child, did) {
  const m = $(id + '_m'); try { await navigator.clipboard.writeText($(id).value); m.textContent = 'コピーしました。公式LINEのトークに貼って送ってください。'; } catch (e) { m.textContent = 'コピーできませんでした。長押しで選んでコピーしてください。'; }
  if (!DEMO && did) try { await sb(`leo_line_drafts?id=eq.${did}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ sent_line: true }) }); } catch (e) { }
}

// ===== 日誌（児童ごと・日ごと）：Google日誌の内容を読み取り表示＋職員の下書き（です・ます調）。11/1まで並行運転（日誌は読み取りだけ） =====
let DIA_DAY = today();
const DIA_DEMO = { rows: [{ child: '児童A', kind: '利用', start_time: '14:45', end_time: '17:00', pick_driver: '職員X', drop_driver: '職員Y', activity: '（見本）公園で鬼ごっこをした。' }], drafts: [{ child: '児童A', day: today(), body: '（見本）公園で鬼ごっこをしました。', author: '職員X' }] };
LEO_VIEWS.diary = async function () {
  let rows, drafts, act = [];
  if (DEMO) ({ rows, drafts } = DIA_DEMO);
  else {
    const [n, d, a] = await Promise.all([
      sb(`leo_nikki?day=eq.${DIA_DAY}&kind=in.(利用,欠席)&order=row_no`),
      sb(`leo_diary_draft?day=eq.${DIA_DAY}`).catch(() => null),
      sb(`leo_activity?day=eq.${DIA_DAY}`).catch(() => [])]);
    rows = n; drafts = d; act = a || [];
  }
  const noTable = drafts === null; drafts = drafts || [];
  const D = Object.fromEntries(drafts.map(x => [x.child, x]));
  const A = Object.fromEntries(act.map(x => [ldNN(x.child), x]));
  const me = DEMO ? '職員X' : await myName();
  const idOf = k => 'dr_' + btoa(unescape(encodeURIComponent(k))).replace(/=/g, '');
  return `<h3>日誌（児童ごと）</h3>${demoNote()}
    <p class="ptabs"><button onclick="DIA_DAY=addDays(DIA_DAY,-1);renderLeoView('diary')">← 前の日</button> <b>${fmtDay(DIA_DAY)}</b> <button onclick="DIA_DAY=addDays(DIA_DAY,1);renderLeoView('diary')">次の日 →</button></p>
    <p class="note">活動記録は、Google日誌の内容に加え、LINE下書きから自動転記された分も表示します。下の「下書き」欄への保存だけでは日誌には入りません（トップの「LINEの下書き」から保存してください）。迎え・送りの名前は届け出上の担当です。</p>
    ${noTable ? '<p style="color:#c00">下書きの保存場所がまだありません（管理者が準備中です）。</p>' : ''}
    ${rows.map(r => { const k = r.child, d = D[k], id = idOf(k), a = A[ldNN(k)], actText = (a && a.text) || r.activity, actSrc = a ? a.source : (r.activity ? '日誌から' : '');
      return `<details class="card" ${d ? '' : 'open'} style="padding:0"><summary style="padding:14px;font-size:17px;cursor:pointer"><b>■${esc(k)}</b>　<small>${esc(r.kind)}${r.start_time ? ' ' + esc(r.start_time) + '〜' + esc(r.end_time || '') : ''}／${d ? '✏️ 下書きあり' : '⬜ 下書きなし'}${actSrc ? '／活動 ' + esc(actSrc) : ''}</small></summary>
        <div style="padding:0 14px 14px"><p class="note">迎え：${esc(filingDriverName(r.pick_driver) || '-')}　送り：${esc(filingDriverName(r.drop_driver) || '-')}</p>
        ${actText ? `<p style="white-space:pre-wrap"><b>日誌の活動記録${actSrc ? '（' + esc(actSrc) + '）' : ''}</b><br>${esc(actText)}</p>` : '<p class="note">日誌の活動記録は、まだありません。</p>'}
        <b>下書き（です・ます調）</b>${d ? `<small>　${esc(d.author || '')}</small>` : ''}
        <textarea id="${id}" rows="30" style="width:100%;font-size:16px;box-sizing:border-box" ${noTable ? 'disabled' : ''}>${esc(d ? d.body : '')}</textarea>
        <button ${noTable ? 'disabled' : ''} onclick="saveDiary('${esc(k)}','${id}')">保存</button><div id="${id}_m"></div></div></details>`; }).join('') || '<p>この日の日誌に利用の子がいません。</p>'}`;
};
async function saveDiary(child, id) {
  const body = $(id).value.trim(), m = $(id + '_m'); if (!body) { m.textContent = '本文を書いてください。'; return; }
  if (DEMO) { m.textContent = '見本モードなので保存しません。'; return; }
  try { const author = await myName();
    await sb('leo_diary_draft?on_conflict=child,day', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ child, day: DIA_DAY, body, author, updated_at: new Date().toISOString() }) });
    m.textContent = '保存しました。'; } catch (e) { m.textContent = e.message; }
}

// ===== LINEの下書き（トップのタブ）：利用児童ごとに報告文を書く → leo_line_drafts ＋ 日誌の活動記録（leo_activity）へ自動転記 =====
// 以前は leo_diary_draft だけに保存しており転記されなかった。表示は旧下書きも読む（初回保存で転記元へ移す）。
let LD_DAY = today();
const ldId = k => 'ld_' + btoa(unescape(encodeURIComponent(k))).replace(/=/g, '');
function ldMergeDrafts(lineDrafts, diaryDrafts) {
  const D = {};
  (diaryDrafts || []).forEach(x => { D[ldNN(x.child)] = { child: x.child, body: x.body, author: x.author || '', lineId: null }; });
  (lineDrafts || []).forEach(x => {
    const k = ldNN(x.child), cur = D[k];
    if (!cur || !cur.lineId || (x.updated_at && (!cur.updated_at || x.updated_at >= cur.updated_at)))
      D[k] = { child: x.child, body: x.body, author: x.author_name || x.author || '', lineId: x.id, updated_at: x.updated_at, sent_line: !!x.sent_line };
  });
  return D;
}
LEO_VIEWS.linedraft = async function () {
  let kids, D = {}, act = [], noTable = false;
  if (DEMO) {
    kids = ['児童A', '児童B', '児童C'];
    D = ldMergeDrafts([{ id: 1, child: '児童A', body: '（見本）本日もありがとうございました。公園で鬼ごっこをしました。\n職員X', author_name: '職員X', updated_at: '9' }], []);
    act = [{ child: '児童A', text: '（見本）公園で鬼ごっこをした。', source: '自動（簡易）' }];
  } else {
    const [n, line, diary, a] = await Promise.all([
      sb(`leo_nikki?day=eq.${LD_DAY}&kind=eq.利用&select=child,row_no&order=row_no`),
      sb(`leo_line_drafts?day=eq.${LD_DAY}&order=updated_at.desc`).catch(() => null),
      sb(`leo_diary_draft?day=eq.${LD_DAY}`).catch(() => []),
      sb(`leo_activity?day=eq.${LD_DAY}`).catch(() => [])]);
    if (line === null) noTable = true;
    kids = [...new Set(n.map(x => x.child).filter(Boolean))];
    D = ldMergeDrafts(line || [], diary || []);
    act = a || [];
  }
  const A = Object.fromEntries(act.map(x => [ldNN(x.child), x]));
  const done = kids.filter(k => D[ldNN(k)]).length;
  return `<h3>✉️ LINEの下書き</h3><a href="https://chat.line.biz/U09e93081492c29e963d2bba78499043f" target="_blank" rel="noopener" style="display:block;background:#06c755;color:#fff;text-align:center;font-size:20px;font-weight:bold;padding:14px;border-radius:10px;text-decoration:none;margin:6px 0 12px">💬 公式LINEを開く（新しいタブ）</a>${demoNote()}
    <p class="ptabs"><button onclick="LD_DAY=addDays(LD_DAY,-1);renderLeoView('linedraft')">← 前の日</button> <input type="date" value="${LD_DAY}" onchange="if(this.value){LD_DAY=this.value;renderLeoView('linedraft')}" style="font-size:16px"> <button onclick="LD_DAY=addDays(LD_DAY,1);renderLeoView('linedraft')">次の日 →</button> <button onclick="LD_DAY=today();renderLeoView('linedraft')">今日</button></p>
    <p style="font-size:18px"><b>${fmtDay(LD_DAY)}：${done} / ${kids.length}人 書けました</b>${kids.length - done ? `（まだ：${kids.filter(k => !D[ldNN(k)]).map(esc).join('、')}）` : kids.length ? ' ✅ 全員書けました' : ''}</p>
    <p class="note">です・ます調で書いて「保存」すると、日誌の活動記録にも自動で入ります。「コピー」して公式LINEの1対1トークに貼って送ってください。</p>
    ${noTable ? '<p style="color:#c00">保存場所の準備ができていません（管理者が leo_line_drafts / leo_activity_from_drafts を用意してください）。</p>' : ''}
    ${kids.map(k => { const d = D[ldNN(k)], a = A[ldNN(k)], id = ldId(k), did = d && d.lineId != null ? d.lineId : 'null';
      return `<div class="card"><b style="font-size:17px">■${esc(k)}</b>　<span id="${id}_s">${d ? (d.sent_line ? '✅ LINE送信済' : '✅ 書いた') : '⬜ まだ'}</span>${d && d.author ? `<small>　${esc(d.author)}</small>` : ''}${a ? `　<small id="${id}_a">／日誌 ${esc(a.source)}</small>` : `<small id="${id}_a"></small>`}
        <textarea id="${id}" rows="30" style="width:100%;font-size:16px;box-sizing:border-box;margin-top:6px" ${noTable ? 'disabled' : ''} oninput="ldDirty('${id}')">${esc(d ? d.body : '')}</textarea>
        <button ${noTable ? 'disabled' : ''} onclick="ldSave('${esc(k)}','${id}',${did})">保存</button>
        <button id="${id}_c" onclick="ldCopy('${id}',${did})">コピー</button> <span id="${id}_cm" style="color:#080"></span> <span id="${id}_m"></span>
        ${a ? `<details style="margin-top:8px"><summary>日誌の活動記録（${esc(a.source)}）</summary><p style="white-space:pre-wrap">${esc(a.text)}</p></details>` : ''}</div>`; }).join('') || '<p>この日の利用の子がいません。</p>'}`;
};
function ldDirty(id) { const m = $(id + '_m'); m.style.color = '#c60'; m.textContent = '● 未保存'; }
async function ldSave(child, id, did) {
  const body = $(id).value.trim(), m = $(id + '_m'); if (!body) { m.style.color = '#c00'; m.textContent = '本文を書いてください。'; return; }
  if (DEMO) { m.textContent = '見本モードなので保存しません。'; return; }
  try {
    const author = await myName();
    if (did) await sb(`leo_line_drafts?id=eq.${did}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ body, updated_at: new Date().toISOString() }) });
    else await sb('leo_line_drafts', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ day: LD_DAY, child, body, author_name: author }) });
    // 旧画面・日誌（児童ごと）と共有するため diary_draft にも残す（無くても転記は進む）
    try { await sb('leo_diary_draft?on_conflict=child,day', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ child, day: LD_DAY, body, author, updated_at: new Date().toISOString() }) }); } catch (e) { }
    await sb('rpc/leo_activity_from_drafts', { method: 'POST', body: JSON.stringify({ p_day: LD_DAY }) });
    // Google日誌のQ列が空なら、直し依頼として活動記録を送る（1分ほどで反映）
    try {
      const [nk, ac] = await Promise.all([
        sb(`leo_nikki?day=eq.${LD_DAY}&child=eq.${encodeURIComponent(child)}&kind=eq.利用&select=row_no,activity`),
        sb(`leo_activity?day=eq.${LD_DAY}&child=eq.${encodeURIComponent(child)}&select=text`)]);
      const row = nk[0], text = (ac[0] && ac[0].text || '').trim();
      if (row && text && !String(row.activity || '').trim())
        await sb('leo_edits', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify([{ target: 'nikki', day: LD_DAY, row_key: String(row.row_no), field: 'activity', old_value: row.activity || '', new_value: text.slice(0, 4000) }]) });
    } catch (e) { }
    m.style.color = '#080'; m.textContent = '✔ 保存し、日誌の活動記録へ転記しました';
    $(id + '_s').textContent = '✅ 書いた';
    const aa = $(id + '_a'); if (aa) aa.textContent = '／日誌 自動（簡易）';
  } catch (e) { m.style.color = '#c00'; m.textContent = '保存できません：' + e.message; }
}
async function ldCopy(id, did) {
  const cm = $(id + '_cm'), b = $(id + '_c');
  try { await navigator.clipboard.writeText($(id).value); cm.style.color = '#080'; cm.textContent = 'コピーしました'; b.textContent = 'コピーしました ✔'; }
  catch (e) { cm.style.color = '#c00'; cm.textContent = 'コピーできません。文字を長押しで選んでコピーしてください'; return; }
  if (!DEMO && did) try { await sb(`leo_line_drafts?id=eq.${did}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ sent_line: true }) }); $(id + '_s').textContent = '✅ LINE送信済'; } catch (e) { }
  setTimeout(() => { cm.textContent = ''; b.textContent = 'コピー'; }, 5000);
}
function leoEditing() {
  let hash = '';
  try { hash = decodeURIComponent((typeof location !== 'undefined' && location.hash) || ''); } catch (e) { hash = (typeof location !== 'undefined' && location.hash) || ''; }
  if (typeof window !== 'undefined' && window.SG_EDIT && /^#leo\/day\//.test(hash)) return true;
  if (typeof CAL !== 'undefined' && CAL && CAL.edit && (hash === '#leo/cal' || /^#leo\/day\//.test(hash))) return true;
  return false;
}
function leoViewsLive() {
  if (leoEditing()) return;
  if (typeof location === 'undefined') return;
  let hash = '';
  try { hash = decodeURIComponent(location.hash || ''); } catch (e) { hash = location.hash || ''; }
  if (hash === '#leo' || hash === '#leo/') {
    if (typeof leoHomeCal === 'function') leoHomeCal();
    if (typeof leoHomeStatus === 'function') leoHomeStatus();
    return;
  }
  const day = hash.match(/^#leo\/day\/(\d{4}-\d{2}-\d{2})$/);
  if (day) { if (typeof renderSgDay === 'function') renderSgDay(day[1]); return; }
  const view = hash.match(/^#leo\/(sougei|sougeiall|kids|cal)$/);
  if (view && typeof renderLeoView === 'function') renderLeoView(view[1]);
}
function leoCalWatch() {
  if (typeof document === 'undefined' || typeof window === 'undefined' || window._leoCalWatch) return;
  window._leoCalWatch = true;
  const kick = () => { if (document.visibilityState === 'hidden') return; leoViewsLive(); };
  if (typeof document.addEventListener === 'function') document.addEventListener('visibilitychange', kick);
  if (typeof window.addEventListener === 'function') window.addEventListener('focus', kick);
  if (typeof setInterval === 'function') setInterval(kick, 120000);
}
try { leoCalWatch(); } catch (e) { /* 画面が無いとき */ }
