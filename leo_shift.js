// レオ（共生型）職員の「シフト」（#leo/shift）。2026-11-11 齊藤さん。
// 大前提：実態と勤務実績表は別。勤務実績表（kinmu_* / leo_kinmu_lib.js）・茶夢配置表とは一切つながない。
// データは staff_shift_base（いつもの型）＋ staff_shift_day（その日だけ：休み／時間変更／追加）。読むのは rpc/staff_shift_get、書くのは rpc/staff_shift_set_base・staff_shift_set_day。
// ここを見る所：予定カレンダーの「勤務」（leo_cal.js / leo_home_cal.js）、送迎の運転手候補・日誌の運転手欄（leo.js / leo_cal.js）。
// 表に載るのは型か変更がある人（非常勤）。載っていない人（齊藤・中村友香など常勤）は、これまでどおり毎日候補に出す。
(function (g) {
  const DOWS = '日月火水木金土';
  const nz = s => String(s ?? '').replace(/[\s\u3000]/g, '').replace(/(先生|さん)$/, '');
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const dt = s => new Date(String(s).slice(0, 10) + 'T00:00:00Z');
  const addDays = (s, n) => { const d = dt(s); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };
  const dowOf = s => dt(s).getUTCDay();
  const mondayOf = s => addDays(s, -((dowOf(s) + 6) % 7));
  const min = t => { const m = String(t || '').match(/^(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
  const hm = t => { const m = min(t); return m == null ? '' : `${Math.floor(m / 60)}:${pad(m % 60)}`; };
  const span = s => `${hm(s.start)}〜${hm(s.end)}`;
  // 表示名：日誌の名前（全角空白）を半角空白にして出す。例「横田　祥」→「横田 祥」
  const showName = s => String(s ?? '').replace(/\u3000/g, ' ').trim();

  const isHol = day => { const H = typeof JP_HOLIDAYS !== 'undefined' ? JP_HOLIDAYS : g.JP_HOLIDAYS; return !!(H && typeof H.has === 'function' && H.has(String(day).slice(0, 10))); };
  // その日の1人分。state: base=いつもの型（緑）／change=時間変更（黄）／off=休み（赤）／add=型なしの追加（黄）／none=入らない
  function shiftCell(data, day, uid) {
    const d = data || {};
    const base = (d.base || []).filter(b => b.user_id === uid && +b.dow === dowOf(day)).sort((a, b) => min(a.start) - min(b.start));
    const rows = (d.days || []).filter(x => x.user_id === uid && String(x.day).slice(0, 10) === day);
    const off = rows.find(x => x.kind === '休み');
    const chg = rows.find(x => x.kind === '時間変更');
    const adds = rows.filter(x => x.kind === '追加');
    const baseSlots = base.map(b => ({ start: b.start, end: b.end }));
    if (off) return { state: 'off', slots: [], base: baseSlots, note: off.note || '', rows };
    // 祝日（カレンダーの赤い日）は、いつもの型では入らない。その日だけの時間変更・追加は出す（ゆか先生指定 2026-11-13）
    if (isHol(day) && !chg && !adds.length) return { state: 'hol', slots: [], base: baseSlots, note: '', rows };
    let slots = chg ? [{ start: chg.start, end: chg.end }] : baseSlots.slice();
    adds.forEach(a => slots.push({ start: a.start, end: a.end, add: true, id: a.id }));
    slots.sort((a, b) => min(a.start) - min(b.start));
    const state = chg ? 'change' : adds.length ? (baseSlots.length ? 'change' : 'add') : (slots.length ? 'base' : 'none');
    const note = [chg && chg.note, ...adds.map(a => a.note)].filter(Boolean).join('・');
    return { state, slots, base: baseSlots, note, rows };
  }
  // その日の全員分（表に載る人だけ）
  function shiftDay(data, day) {
    return ((data && data.staff) || []).map(s => ({ user_id: s.user_id, name: s.name, ...shiftCell(data, day, s.user_id) }));
  }
  // その日（time を渡すとその時刻の前後30分も含めて）入っている人の名前
  function shiftOnDuty(data, day, time) {
    const t = min(time);
    return shiftDay(data, day).filter(c => c.slots.some(s => t == null || (t >= min(s.start) - 30 && t <= min(s.end) + 30))).map(c => c.name);
  }
  // 運転手・職員の候補。main=この日入る人（表に載らない常勤＋シフトの人）／other=シフト外の非常勤／off=休み（候補から外す）
  function shiftCandidates(names, data, day, time) {
    const out = { main: [], other: [], off: [] };
    const list = (names || []).map(n => String(n ?? '').trim()).filter(Boolean);
    if (!data || !(data.staff || []).length || !day) { out.main = list; return out; }
    const cells = shiftDay(data, day);
    const byName = new Map(cells.map(c => [nz(c.name), c]));
    const on = new Set(shiftOnDuty(data, day, time).map(nz));
    list.forEach(n => {
      const c = byName.get(nz(n));
      if (!c) out.main.push(n);
      else if (c.state === 'off') out.off.push(n);
      else if (on.has(nz(n))) out.main.push(n);
      else out.other.push(n);
    });
    return out;
  }
  // <option> の並び（シフトで絞る）。今の保存値は必ず残して選んだ状態にする（書き換えない）
  function shiftOptionsHtml(names, data, day, time, cur, blank) {
    const e = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const v = String(cur ?? '').trim();
    const seen = new Set(), uniq = [];
    const src = typeof leoPickerNames === 'function' ? leoPickerNames(names) : names;
    (src || []).forEach(n => { const t = String(n ?? '').trim(), k = nz(t); if (t && !seen.has(k)) { seen.add(k); uniq.push(t); } });
    const c = shiftCandidates(uniq, data, day, time);
    const sortJa = a => a.sort((x, y) => x.localeCompare(y, 'ja'));
    const has = v && uniq.some(n => nz(n) === nz(v));
    const opt = n => `<option value="${e(nz(n) === nz(v) ? v : n)}"${nz(n) === nz(v) ? ' selected' : ''}>${e(nz(n) === nz(v) ? v : n)}</option>`;
    let h = `<option value="">${e(blank || '— 選んでください —')}</option>`;
    if (v && !has) h += `<option value="${e(v)}" selected>${e(v)}</option>`;
    h += sortJa(c.main).map(opt).join('');
    if (c.other.length) h += `<optgroup label="シフト外">${sortJa(c.other).map(opt).join('')}</optgroup>`;
    const offCur = c.off.filter(n => nz(n) === nz(v));
    if (offCur.length) h += `<optgroup label="この日は休み">${offCur.map(opt).join('')}</optgroup>`;
    return h;
  }
  // 予定カレンダー用の「勤務」「不在」（leo_events と同じ形・id なしなので直すボタンは出ない）
  function shiftEvents(data, from, to) {
    const out = [];
    if (!data || !(data.staff || []).length) return out;
    for (let d = from; d <= to; d = addDays(d, 1)) {
      shiftDay(data, d).forEach(c => {
        if (c.state === 'off') out.push({ day: d, kind: '不在', staff: c.name, title: '休み' + (c.note ? '（' + c.note + '）' : ''), start_time: null, end_time: null, source: 'shift', _shift: true });
        else if (c.slots.length) out.push({ day: d, kind: '勤務', staff: c.name, title: c.slots.map(span).join('・') + (c.state !== 'base' ? '（その日だけ）' : ''), start_time: null, end_time: null, source: 'shift', _shift: true });
      });
    }
    return out;
  }
  // 予定に足す。同じ日・同じ人の古い「勤務」「不在」（Google由来など）はシフト側を優先して隠す
  function shiftMergeEvents(evs, data, from, to) {
    const add = shiftEvents(data, from, to);
    if (!add.length) return evs || [];
    const managed = new Set(((data && data.staff) || []).map(s => nz(s.name)));
    const keep = (evs || []).filter(e => !((e.kind === '勤務' || e.kind === '不在') && e.staff && managed.has(nz(e.staff)) && e.day >= from && e.day <= to));
    return keep.concat(add);
  }
  // 打刻との照らし合わせ（管理者だけ）。10分より大きいずれ・打刻なし・シフト外の打刻
  function shiftPunchGaps(data, days, todayStr) {
    const out = [], P = (data && data.punches) || null;
    if (!P) return out;
    const nameOf = Object.fromEntries(((data && data.staff) || []).map(s => [s.user_id, s.name]));
    days.forEach(d => {
      if (todayStr && d > todayStr) return;
      shiftDay(data, d).forEach(c => {
        const p = P.find(x => x.user_id === c.user_id && String(x.day).slice(0, 10) === d);
        const nm = showName(nameOf[c.user_id] || c.name), md = `${+d.slice(5, 7)}/${+d.slice(8, 10)}（${DOWS[dowOf(d)]}）`;
        if (!c.slots.length) { if (p && p.in) out.push(`${md} ${nm}：予定はありませんが、打刻 ${p.in}〜${p.out || ''} があります。`); return; }
        const s0 = min(c.slots[0].start), e0 = min(c.slots[c.slots.length - 1].end);
        if (!p || !p.in) { if (d < todayStr) out.push(`${md} ${nm}：予定 ${span(c.slots[0])} ですが、出勤の打刻がありません。`); return; }
        if (min(p.in) - s0 > 10) out.push(`${md} ${nm}：予定 ${hm(c.slots[0].start)} ですが、出勤の打刻は ${p.in} でした。`);
        if (p.out && Math.abs(min(p.out) - e0) > 10) out.push(`${md} ${nm}：予定の終わり ${hm(c.slots[c.slots.length - 1].end)} ですが、退勤の打刻は ${p.out} でした。`);
      });
    });
    return out;
  }

  // ===== 読み込み（期間ごとに覚える。保存したら消す） =====
  const cache = new Map();
  const DEMO_SHIFT = () => ({ can_edit: true,
    staff: [{ user_id: 'a', name: '職員　A' }, { user_id: 'b', name: '職員　B' }],
    base: [{ user_id: 'a', dow: 1, start: '10:30', end: '14:30' }, { user_id: 'a', dow: 5, start: '10:30', end: '14:30' }, { user_id: 'b', dow: 2, start: '14:00', end: '17:00' }],
    days: [], pick: [], punches: null });
  async function shiftLoad(from, to) {
    if (typeof DEMO !== 'undefined' && DEMO) return DEMO_SHIFT();
    if (typeof sb !== 'function') return null;
    const k = from + '|' + to;
    if (!cache.has(k)) cache.set(k, sb('rpc/staff_shift_get', { method: 'POST', body: JSON.stringify({ p_from: from, p_to: to }) }).catch(() => null));
    const data = await cache.get(k);
    return shiftWithoutHidden(data);
  }
  // シフトの戻りは名前だけ（所属は付かない）。レオの職員でない人は表・候補・その人の型から外す。データベースは変えない。
  function shiftWithoutHidden(data) {
    if (!data || typeof leoListedStaff !== 'function') return data;
    const hidden = row => !!(row && row.name && !leoListedStaff(row.name));
    const ids = new Set();
    (data.staff || []).forEach(s => { if (hidden(s)) ids.add(s.user_id); });
    (data.pick || []).forEach(s => { if (hidden(s)) ids.add(s.user_id); });
    if (!ids.size) return data;
    const keep = row => !row || !ids.has(row.user_id);
    return {
      ...data,
      staff: (data.staff || []).filter(s => !hidden(s)),
      pick: (data.pick || []).filter(s => !hidden(s)),
      base: (data.base || []).filter(keep),
      days: (data.days || []).filter(keep),
      punches: Array.isArray(data.punches) ? data.punches.filter(keep) : data.punches,
    };
  }
  const shiftClear = () => cache.clear();

  const api = { shiftCell, shiftDay, shiftOnDuty, shiftCandidates, shiftOptionsHtml, shiftEvents, shiftMergeEvents, shiftPunchGaps, shiftLoad, shiftClear, shiftMonday: mondayOf, shiftAddDays: addDays, shiftDow: dowOf, shiftSpan: span, shiftShowName: showName };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  Object.assign(g, api);

  if (typeof document === 'undefined' || typeof LEO_VIEWS === 'undefined') return;

  // ===== 画面 #leo/shift =====
  const SH = g.SH = g.SH || { week: '', data: null, edit: null };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const todayJ = () => (typeof today === 'function' ? today() : new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' }));
  const md = d => `${+d.slice(5, 7)}/${+d.slice(8, 10)}（${DOWS[dowOf(d)]}）`;
  const css = `<style>
  .sh-nav{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:8px 0 12px}
  .sh-nav b{font-size:15px;margin:0 4px}
  .sh-nav button,.sh-box button,.sh-note button{width:auto!important;display:inline-block!important;padding:6px 14px!important;min-height:40px;margin:0!important}
  .sh-box button.inl{min-height:32px;padding:2px 10px!important}
  .sh-wrap{overflow-x:auto}
  table.sh-t{table-layout:fixed;border-collapse:separate;border-spacing:0;width:100%;min-width:640px;background:#fff;border:1px solid var(--pl-line,#e6dcc6);border-radius:14px;overflow:hidden;font-size:14px}
  .sh-t th,.sh-t td{border-bottom:1px solid var(--pl-line,#eee3cc);border-right:1px solid var(--pl-line,#eee3cc);padding:6px;text-align:center;vertical-align:middle}
  .sh-t th{background:#f4ecd9;font-weight:700}
  .sh-t th:first-child{width:7.5em}
  .sh-t th.today{background:#e9b949;color:#2b2a33}
  .sh-t td.nm{text-align:left;font-weight:700;white-space:nowrap}
  .sh-c{display:block;border-radius:10px;padding:6px 4px;min-height:22px;line-height:1.35}
  .sh-c.base{background:#e4f1e7;color:#1f4d33}.sh-c.change,.sh-c.add{background:#fdeebd;color:#5c4400}.sh-c.off{background:#f6d9d3;color:#a3281a;font-weight:700}.sh-c.none{color:#bbb}.sh-c.hol{color:#d32f2f}
  .sh-c small{display:block;font-size:11px;opacity:.85}
  .sh-ed .sh-c,.sh-ed .sh-nmb{cursor:pointer}.sh-ed .sh-c:hover{outline:2px solid #e9b949}
  .sh-nmb{text-decoration:underline dotted;text-underline-offset:3px}
  .sh-lg{font-size:13px;margin:10px 0}.sh-lg span{display:inline-block;margin-right:12px}.sh-lg i{display:inline-block;width:12px;height:12px;border-radius:3px;vertical-align:-1px;margin-right:4px}
  .sh-cards{display:none}
  .sh-card{background:#fff;border:1px solid var(--pl-line,#e6dcc6);border-radius:16px;padding:10px 12px;margin-bottom:10px}
  .sh-card.today{border:2px solid #e9b949}
  .sh-card h4{margin:0 0 6px;font-size:15px}
  .sh-row{display:flex;align-items:center;gap:10px;padding:4px 0}.sh-row .sh-nmb{min-width:6.5em;font-weight:700}.sh-row .sh-c{flex:1;text-align:center}
  .sh-warn{background:#fff3d6;border-left:4px solid #e0a100;padding:8px 10px;margin:10px 0;font-size:13px;line-height:1.6;border-radius:6px}
  .sh-pop{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:50;display:flex;align-items:center;justify-content:center;padding:12px}
  .sh-box{background:#fff;border-radius:18px;padding:16px;max-width:440px;width:100%;max-height:90vh;overflow:auto;box-shadow:0 10px 30px rgba(0,0,0,.25)}
  .sh-box h4{margin:0 0 8px}.sh-box label{display:block;margin:6px 0}.sh-box input[type=time]{width:8em}
  .sh-box .sh-acts{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}
  .sh-slot{display:flex;gap:6px;align-items:center;margin:4px 0}
  @media (max-width:700px){.sh-wrap{display:none}.sh-cards{display:block}}
  </style>`;
  function cellHtml(c, day, uid, ed) {
    const txt = c.state === 'off' ? '休み' : c.state === 'hol' ? '祝日' : c.slots.length ? c.slots.map(span).join('<br>') : '—';
    const sub = c.state === 'off' ? (c.note ? `<small>${esc(c.note)}</small>` : '') : c.state === 'change' || c.state === 'add' ? `<small>${c.state === 'add' ? '追加' : '時間変更'}${c.note ? '・' + esc(c.note) : ''}</small>` : '';
    const on = ed ? ` role="button" tabindex="0" onclick="shOpenDay('${day}','${uid}')"` : '';
    return `<span class="sh-c ${c.state}"${on}>${txt}${sub}</span>`;
  }
  function nameHtml(s, ed) {
    const on = ed ? ` role="button" tabindex="0" onclick="shOpenBase('${s.user_id}')"` : '';
    return `<span class="sh-nmb"${on}>${esc(showName(s.name))}</span>`;
  }
  LEO_VIEWS.shift = async function () {
    const t = todayJ();
    SH.week = SH.week || mondayOf(t);
    const a = SH.week, b = addDays(a, 6);
    const data = await shiftLoad(a, b);
    SH.data = data;
    if (!data) return `<h3>シフト</h3><p class="note">シフトを読み込めませんでした。少し待ってから開き直してください。</p>`;
    const ed = !!data.can_edit;
    let days = [0, 1, 2, 3, 4].map(i => addDays(a, i));
    [5, 6].forEach(i => { const d = addDays(a, i); if (shiftDay(data, d).some(c => c.state !== 'none' && c.state !== 'hol')) days.push(d); });
    const staff = data.staff || [];
    const fumi = staff.some(s => nz(s.name) === '中村文');
    const head = `<h3>シフト</h3>
      <div class="sh-nav"><button class="sub" onclick="shWeek(-1)">◀ 前の週</button><b>${md(a)}〜${md(days[days.length - 1])}</b><button class="sub" onclick="shWeek(1)">次の週 ▶</button><button class="sub" onclick="shWeek(0)">今週</button></div>`;
    const table = `<div class="sh-wrap${ed ? ' sh-ed' : ''}"><table class="sh-t"><tr><th>職員</th>${days.map(d => `<th class="${d === t ? 'today' : ''}">${DOWS[dowOf(d)]} ${+d.slice(8, 10)}</th>`).join('')}</tr>
      ${staff.map(s => `<tr><td class="nm">${nameHtml(s, ed)}</td>${days.map(d => `<td>${cellHtml(shiftCell(data, d, s.user_id), d, s.user_id, ed)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${days.length + 1}">まだ誰も入っていません。</td></tr>`}</table></div>`;
    const cards = `<div class="sh-cards${ed ? ' sh-ed' : ''}">${days.map(d => {
      const cs = shiftDay(data, d).filter(c => (c.state !== 'none' && c.state !== 'hol') || ed);
      return `<div class="sh-card${d === t ? ' today' : ''}"><h4>${md(d)}${d === t ? '　今日' : ''}</h4>${cs.map(c => `<div class="sh-row">${nameHtml(c, ed)}${cellHtml(c, d, c.user_id, ed)}</div>`).join('') || '<p class="note" style="margin:0">入る人はいません。</p>'}</div>`;
    }).join('')}</div>`;
    const legend = `<p class="sh-lg"><span><i style="background:#cfe6d6"></i>いつもの型</span><span><i style="background:#f7dc85"></i>その日だけ時間変更・追加</span><span><i style="background:#eeb3a8"></i>その日だけ休み</span></p>`;
    const how = ed && (data.pick || []).length ? `<p class="sh-note"><button class="sub" onclick="shAddStaff()">＋ 職員を表に足す</button></p>` : '';
    const fumiNote = '';
    const gaps = shiftPunchGaps(data, days, t);
    const warn = data.punches ? (gaps.length ? `<div class="sh-warn"><b>打刻とのずれ</b><br>${gaps.map(esc).join('<br>')}</div>` : '') : '';
    return css + head + table + cards + legend + how + fumiNote + warn + `<div id="sh_pop"></div>`;
  };
  const rerender = () => { if (typeof renderLeoView === 'function') renderLeoView('shift'); };
  g.shWeek = n => { SH.week = n === 0 ? mondayOf(todayJ()) : addDays(SH.week || mondayOf(todayJ()), 7 * n); rerender(); };
  const pop = html => { const el = document.getElementById('sh_pop'); if (el) el.innerHTML = html ? `<div class="sh-pop" onclick="if(event.target===this)shClose()"><div class="sh-box">${html}</div></div>` : ''; };
  g.shClose = () => pop('');
  const nameOfUid = uid => showName(((SH.data && (SH.data.staff || []).concat(SH.data.pick || [])) || []).find(s => s.user_id === uid)?.name || '');
  g.shOpenDay = (day, uid) => {
    const c = shiftCell(SH.data, day, uid);
    const s0 = (c.slots[0] || c.base[0] || {}).start || '', e0 = (c.slots[c.slots.length - 1] || c.base[c.base.length - 1] || {}).end || '';
    const adds = (c.rows || []).filter(r => r.kind === '追加');
    pop(`<h4>${esc(md(day))} ${esc(nameOfUid(uid))}</h4>
      <label>時間 <input type="time" id="sh_st" value="${esc(String(s0).slice(0, 5))}"> 〜 <input type="time" id="sh_en" value="${esc(String(e0).slice(0, 5))}"></label>
      <label>メモ <input id="sh_note" maxlength="80" style="width:100%" placeholder="例：通院のため" value="${esc(c.note || '')}"></label>
      <div class="sh-acts"><button onclick="shSaveDay('${day}','${uid}','休み')">休み</button><button onclick="shSaveDay('${day}','${uid}','時間変更')">時間変更</button><button onclick="shSaveDay('${day}','${uid}','追加')">追加</button>${(c.rows || []).length ? `<button class="sub" onclick="shSaveDay('${day}','${uid}','型に戻す')">型に戻す</button>` : ''}</div>
      ${adds.length ? `<p class="note">追加した時間：${adds.map(r => `${span(r)} <button class="inl" onclick="shSaveDay('${day}','${uid}','削除',${+r.id})">消す</button>`).join('　')}</p>` : ''}
      <p><button class="sub" onclick="shClose()">閉じる</button></p><p id="sh_msg" class="note"></p>`);
  };
  const call = (fn, body) => sb('rpc/' + fn, { method: 'POST', body: JSON.stringify(body) });
  g.shSaveDay = async (day, uid, kind, id) => {
    if (typeof DEMO !== 'undefined' && DEMO) return alert('見本モードでは保存しません。');
    const v = k => (document.getElementById(k) || {}).value || '';
    if ((kind === '時間変更' || kind === '追加') && !(v('sh_st') && v('sh_en') && v('sh_en') > v('sh_st'))) { const m = document.getElementById('sh_msg'); if (m) m.textContent = '始まりと終わりの時間を入れてください。'; return; }
    try {
      await call('staff_shift_set_day', { p_day: day, p_user: uid, p_kind: kind, p_start: v('sh_st') || null, p_end: v('sh_en') || null, p_note: v('sh_note') || null, p_id: id || null });
      shiftClear(); rerender();
    } catch (e) { const m = document.getElementById('sh_msg'); if (m) m.textContent = e.message; else alert(e.message); }
  };
  function baseForm(uid) {
    const base = ((SH.data && SH.data.base) || []).filter(b => b.user_id === uid);
    const rows = [1, 2, 3, 4, 5, 6, 0].map(dw => {
      const sl = base.filter(b => +b.dow === dw).sort((x, y) => min(x.start) - min(y.start));
      const list = (sl.length ? sl : []).map(s => `<div class="sh-slot"><input type="time" data-dw="${dw}" class="sh-bs" value="${esc(String(s.start).slice(0, 5))}"> 〜 <input type="time" data-dw="${dw}" class="sh-be" value="${esc(String(s.end).slice(0, 5))}"> <button class="inl" onclick="this.parentNode.remove()">消す</button></div>`).join('');
      return `<div data-day="${dw}" style="border-top:1px solid #eee;padding:6px 0"><b>${DOWS[dw]}</b> <span class="sh-slots">${list || '<small class="note">なし</small>'}</span> <button class="inl" onclick="shAddSlot(this,${dw})">＋ 時間</button></div>`;
    }).join('');
    return `<h4>${esc(nameOfUid(uid))} さんのいつもの型</h4>${rows}
      <div class="sh-acts"><button onclick="shSaveBase('${uid}')">保存する</button><button class="sub" onclick="shClose()">閉じる</button></div><p id="sh_msg" class="note"></p>`;
  }
  g.shOpenBase = uid => pop(baseForm(uid));
  g.shAddSlot = (btn, dw) => {
    const box = btn.parentNode.querySelector('.sh-slots');
    if (box.querySelector('small')) box.innerHTML = '';
    box.insertAdjacentHTML('beforeend', `<div class="sh-slot"><input type="time" data-dw="${dw}" class="sh-bs"> 〜 <input type="time" data-dw="${dw}" class="sh-be"> <button class="inl" onclick="this.parentNode.remove()">消す</button></div>`);
  };
  g.shSaveBase = async uid => {
    if (typeof DEMO !== 'undefined' && DEMO) return alert('見本モードでは保存しません。');
    const msg = t => { const m = document.getElementById('sh_msg'); if (m) m.textContent = t; };
    const per = {};
    for (const row of document.querySelectorAll('.sh-box .sh-slot')) {
      const s = row.querySelector('.sh-bs').value, e = row.querySelector('.sh-be').value, dw = +row.querySelector('.sh-bs').dataset.dw;
      if (!s && !e) continue;
      if (!s || !e || e <= s) return msg(`${DOWS[dw]}曜の時間を確かめてください（終わりは始まりより後）。`);
      (per[dw] = per[dw] || []).push({ start: s, end: e });
    }
    const had = new Set(((SH.data && SH.data.base) || []).filter(b => b.user_id === uid).map(b => +b.dow));
    try {
      for (const dw of [0, 1, 2, 3, 4, 5, 6]) if (per[dw] || had.has(dw)) await call('staff_shift_set_base', { p_user: uid, p_dow: dw, p_slots: per[dw] || [] });
      shiftClear(); rerender();
    } catch (e) { msg(e.message); }
  };
  g.shAddStaff = () => {
    const inT = new Set(((SH.data && SH.data.staff) || []).map(s => s.user_id));
    const cand = ((SH.data && SH.data.pick) || []).filter(p => !inT.has(p.user_id));
    if (!cand.length) return pop('<p>足せる職員はいません。</p><p><button class="sub" onclick="shClose()">閉じる</button></p>');
    pop(`<h4>表に足す職員</h4>
      <select id="sh_pick" style="width:100%">${cand.map(p => `<option value="${esc(p.user_id)}">${esc(showName(p.name))}</option>`).join('')}</select>
      <div class="sh-acts"><button onclick="(function(){var u=document.getElementById('sh_pick').value;shOpenBase(u);})()">型を入れる</button><button class="sub" onclick="shClose()">閉じる</button></div>`);
  };
})(typeof window !== 'undefined' ? window : globalThis);
