// レオ 予定（#leo/cal）：利用予定・送迎・職員の勤務。日／週／月。児発管・管理者・事務が入力、職員は見る
// データ：leo_events（11/1まではGoogleカレンダーから毎時取り込み＝読むだけ。ポータルで直した予定は上書きされない）
const CAL = { mode: 'day', d: null, edit: null };
const CK = { 利用: '#2a7', 休み: '#999', 迎え: '#06c', 送り: '#c60', 勤務: '#555', 不在: '#b33', 休所: '#b33', その他: '#777' };
const calDow = d => '月火水木金土日'[(new Date(d + 'T00:00:00+09:00').getDay() + 6) % 7];
const calMd = d => `${+d.slice(5, 7)}/${+d.slice(8)}（${calDow(d)}）`;
const nk = s => String(s || '').replace(/[\s　]/g, '');
function calRange() {
  const d = CAL.d;
  if (CAL.mode === 'day') return [d, d];
  if (CAL.mode === 'week') { const w = (new Date(d + 'T00:00:00+09:00').getDay() + 6) % 7; return [addDays(d, -w), addDays(d, 6 - w)]; }
  const f = d.slice(0, 8) + '01', w = (new Date(f + 'T00:00:00+09:00').getDay() + 6) % 7, nx = addDays(f, 32).slice(0, 8) + '01';
  return [addDays(f, -w), addDays(nx, (7 - (new Date(nx + 'T00:00:00+09:00').getDay() + 6) % 7) % 7 - 1)];
}
function calDemo() {
  const d = CAL.d, t = (k, o) => ({ id: Math.random(), day: d, kind: k, kids: [], source: 'portal', ...o });
  return [t('利用', { child: '児童A', start_time: '13:30', end_time: '17:00' }), t('利用', { child: '児童B', start_time: '14:00', end_time: '17:30', parent_drop: true }),
    t('休み', { child: '児童C' }), t('迎え', { staff: '職員X', kids: ['児童A'], start_time: '13:00', end_time: '13:30' }),
    t('送り', { staff: '職員Y', kids: ['児童A', '児童B'], start_time: '17:00', end_time: '18:00' }), t('不在', { staff: '職員Z', title: '午後不在' })];
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
const calTag = (k, s) => `<span style="background:${CK[k]};color:#fff;border-radius:4px;padding:0 4px;font-size:12px">${s || k}</span>`;
const calEd = e => canManage() && !DEMO ? ` <a href="javascript:void 0" onclick="calEdit(${e.id})" style="font-size:12px">直す</a>` : '';

function calDay(d, evs, care) {
  const es = evs.filter(e => e.day === d), use = es.filter(e => e.kind === '利用'), off = es.filter(e => e.kind === '休み');
  const route = es.filter(e => e.kind === '迎え' || e.kind === '送り').sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
  const staff = es.filter(e => e.kind === '勤務' || e.kind === '不在'), other = es.filter(e => e.kind === '休所' || e.kind === 'その他');
  const sideTxt = (lst, parent, word, name) => parent ? `保護者${word}` : lst.length ? lst.map(x => `${x.staff ? esc(x.staff) : '<b style="color:#c00">担当なし</b>'} ${esc((x.kid_times && x.kid_times[name]) || x.start_time)}${x.kid_places && x.kid_places[name] && x.kid_places[name] !== '自宅' ? `<br><small>${esc(x.kid_places[name])}</small>` : ''}`).join('・') + (lst.length > 1 ? ' ⚠複数' : '') : `<span style="color:#b33">${word}なし</span>`;
  let h = other.map(e => `<p>${calTag(e.kind)} ${esc(e.title || e.note)}${calEd(e)}</p>`).join('');
  h += `<h4>利用 ${use.length}人${off.length ? `／休み ${off.length}人` : ''}</h4>`;
  h += use.length ? `<table><tr><th>児童</th><th>時間</th><th>迎え（☆）</th><th>送り（★）</th></tr>${use.map(e => {
    const t = calKid(es, e.child), c = care[nk(e.child)];
    return `<tr><td>${esc(e.child)}${c ? `<br><small style="color:#c60">⚠ ${esc(c)}</small>` : ''}${e.note ? `<br><small>${esc(e.note)}</small>` : ''}${calEd(e)}</td><td>${esc(e.start_time)}〜${esc(e.end_time)}</td>
      <td>${sideTxt(t.pick, e.parent_drop, '送り', e.child)}</td><td>${sideTxt(t.drop, e.parent_pick, '迎え', e.child)}</td></tr>`;
  }).join('')}</table>` : '<p>利用の予定はありません。</p>';
  if (off.length) h += `<p>${calTag('休み')} ${off.map(e => esc(e.child) + calEd(e)).join('、')}</p>`;
  if (route.length) h += `<h4>送迎</h4><table><tr><th>時刻</th><th></th><th>運転</th><th>順番</th></tr>${route.map(e =>
    `<tr><td>${esc(e.start_time)}〜${esc(e.end_time)}</td><td>${calTag(e.kind, e.kind === '迎え' ? '☆迎え' : '★送り')}</td><td>${e.staff ? esc(e.staff) : '<b style="color:#c00">担当なし</b>'}</td><td>${e.kid_times ? (e.kids || []).map((n, i) => `${i + 1}. ${esc(n)} ${esc(e.kid_times[n] || '')}${e.kid_places && e.kid_places[n] ? ` <small>＠${esc(e.kid_places[n])}</small>` : ''}`).join('<br>') : (e.kids || []).map(esc).join(' → ') + (e.place ? `<br><small>${esc(e.place)}</small>` : '')}${calEd(e)}</td></tr>`).join('')}</table>`;
  if (staff.length) h += `<h4>職員</h4>${staff.map(e => `<p>${calTag(e.kind)} ${esc(e.staff)} ${esc(e.title || e.note || '')}${calEd(e)}</p>`).join('')}`;
  return h;
}
function calWeek(evs) {
  const [a] = calRange();
  return Array.from({ length: 7 }, (_, i) => addDays(a, i)).map(d => {
    const es = evs.filter(e => e.day === d), u = es.filter(e => e.kind === '利用'), off = es.filter(e => e.kind === '休み'), st = es.filter(e => e.kind === '不在' || e.kind === '休所');
    return `<div onclick="calOpen('${d}')" style="border-bottom:1px solid #ddd;padding:6px 0;cursor:pointer${d === today() ? ';background:#fffbe6' : ''}">
      <b>${calMd(d)}</b> 利用${u.length}人 ${off.length ? `休み${off.length}` : ''}<br><small>${u.map(e => esc(e.child.split(/[\s　]/).pop())).join('・')}</small>
      ${st.map(e => `<br><small style="color:#b33">${esc(e.kind === '休所' ? e.title : e.staff + ' ' + (e.title || ''))}</small>`).join('')}</div>`;
  }).join('');
}
function calMonth(evs) {
  const [a, b] = calRange(), m = CAL.d.slice(0, 7); let h = '<table style="table-layout:fixed;width:100%;text-align:center"><tr>' + [...'月火水木金土日'].map(x => `<th>${x}</th>`).join('') + '</tr>';
  for (let d = a; d <= b; d = addDays(d, 1)) {
    if (calDow(d) === '月') h += '<tr>';
    const es = evs.filter(e => e.day === d), u = es.filter(e => e.kind === '利用').length, cl = es.some(e => e.kind === '休所');
    h += `<td onclick="calOpen('${d}')" style="cursor:pointer;padding:4px 0;${d.slice(0, 7) !== m ? 'color:#bbb;' : ''}${d === today() ? 'background:#fffbe6;' : ''}">${+d.slice(8)}<br><small style="color:${cl ? '#b33' : '#2a7'}">${cl ? '休所' : u ? u + '人' : ''}</small></td>`;
    if (calDow(d) === '日') h += '</tr>';
  }
  return h + '</table>';
}
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
window.calMove = n => { CAL.d = CAL.mode === 'month' ? addDays(CAL.d.slice(0, 8) + '15', 30 * n).slice(0, 8) + '01' : addDays(CAL.d, n * (CAL.mode === 'week' ? 7 : 1)); renderLeoView('cal'); };
window.calEdit = id => { CAL.edit = id; renderLeoView('cal'); window.scrollTo(0, 0); };
window.calSave = async () => {
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
window.calDel = async () => { if (!confirm('この予定を削除しますか？')) return; await sb('leo_events?id=eq.' + CAL.edit, { method: 'DELETE' }); CAL.edit = null; renderLeoView('cal'); };

LEO_VIEWS.cal = async function () {
  CAL.d = CAL.d || today();
  const [evs, cc, ch] = await Promise.all([calLoad(), DEMO ? [] : sb('leo_child_care?select=child,note').catch(() => []), canManage() && !DEMO ? sb('leo_children?select=name').catch(() => []) : []]);
  const care = Object.fromEntries(cc.filter(x => x.note).map(x => [nk(x.child), x.note]));
  const [a, b] = calRange(), btn = (m, l) => `<button onclick="calMode('${m}')"${CAL.mode === m ? ' style="font-weight:bold;background:#06c;color:#fff"' : ''}>${l}</button>`;
  let h = `<h3>児童の利用・送迎予定</h3>${demoNote()}<p class="calbar"><style>.calbar button{width:auto !important;display:inline-block !important;padding:6px 12px !important;margin:2px !important}</style>${btn('day', '日')}${btn('week', '週')}${btn('month', '月')}
    <button onclick="calMove(-1)">◀</button><button onclick="CAL.d=today();renderLeoView('cal')">今日</button><button onclick="calMove(1)">▶</button>
    ${canManage() && !DEMO ? ` <button onclick="calEdit('new')">＋追加</button>` : ''}</p>
    <h4 style="margin:4px 0">${CAL.mode === 'day' ? calMd(a) : CAL.mode === 'week' ? `${calMd(a)}〜${calMd(b)}` : `${+CAL.d.slice(0, 4)}年${+CAL.d.slice(5, 7)}月`}</h4>`;
  if (CAL.edit) {
    const e = CAL.edit === 'new' ? { day: CAL.d, kind: '利用', kids: [] } : evs.find(x => x.id === CAL.edit) || {};
    h += calForm(e, [...new Set([...ch.map(x => x.name), ...evs.map(x => x.child).filter(Boolean)])].sort(), [...new Set(evs.map(x => x.staff).filter(Boolean))].sort());
  }
  h += CAL.mode === 'day' ? calDay(a, evs, care) : CAL.mode === 'week' ? calWeek(evs) : calMonth(evs);
  h += `<p style="margin-top:12px;font-size:13px">関連：<a href="#leo/sougei">自分の送迎</a>・<a href="#leo/kata">送迎 型表</a>・<a href="#leo/haichi">職員配置表</a>${canManage() ? '・<a href="#leo/userinfo">利用者情報</a>' : ''}</p>
    <p class="note">11/1まではGoogleカレンダーの予定を毎時取り込んでいます（Google側は変えません）。ポータルで直した予定はそのまま残ります。</p>`;
  return h;
};
