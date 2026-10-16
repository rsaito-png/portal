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
    { 児童名: '児童A', 曜日: '月', 利用開始: '14:45', 利用終了: '17:00', 迎え担当: '職員X', 迎え開始: '14:30', 送り担当: '職員Y', 送り終了: '17:15', 迎え場所: '〇〇小学校', '送り場所（空欄なら自宅）': '' },
    { 児童名: '児童B', 曜日: '月', 利用開始: '15:00', 利用終了: '17:30', 迎え担当: '職員Y', 迎え開始: '14:40', 送り担当: '職員X', 送り終了: '17:40', 迎え場所: '△△小学校', '送り場所（空欄なら自宅）': '〇〇園' },
    { 児童名: '児童C', 曜日: '火', 利用開始: '10:00', 利用終了: '13:00', 保護者送迎: '○' },
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

async function sb(path, opt = {}) {
  const s = JSON.parse(localStorage.getItem('sess') || '{}');
  const r = await fetch(C.supabaseUrl + '/rest/v1/' + path, { ...opt,
    headers: { apikey: C.supabaseKey, Authorization: 'Bearer ' + s.token, 'Content-Type': 'application/json', ...(opt.headers || {}) } });
  if (!r.ok) throw new Error('読み込めませんでした（' + r.status + '）');
  return r.status === 204 || r.status === 201 ? null : r.json();
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
const MASTER_DEMO = {};
async function myName() {
  if (DEMO) return DEMO_DATA.me;
  const p = await sb('staff_profiles?select=nikki_name');
  return p[0]?.nikki_name || '';
}
const same = (a, b) => a && b && a.replace(/\s/g, '') === b.replace(/\s/g, '');
const demoNote = () => DEMO ? '<p class="note">見本データです（架空）</p>' : '';

const LEO_VIEWS = {
  async sougei() {
    const [rows, me, cc] = await Promise.all([loadNikki(), myName(), DEMO ? [{ child: '児童A', note: '（見本）助手席の後ろ。降車時は母へ直接引き渡し。' }] : sb('leo_child_care').catch(() => [])]);
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
    const [rows, cc] = await Promise.all([loadNikki(), DEMO ? [] : sb('leo_child_care').catch(() => [])]);
    const CARE = Object.fromEntries(cc.filter(x => x.note).map(x => [x.child, x.note]));
    const days = byDay(rows.filter(r => r.kind === '利用'));
    const cell = (v, ng) => v ? esc(v) : `<b style="color:#c00">${ng}</b>`;
    return `<h3>${PLABEL[PERIOD]}の送迎（全員分）</h3>${periodTabs('sougeiall')}${demoNote()}<p><a href="#leo/sougei">自分の担当だけ見る</a>　<small>変更はカレンダー・日誌が正です。赤字は未確定（担当者か車が空）。</small></p>` + (days.length ? days.map(([d, rs]) => {
      const jobs = [];
      rs.forEach(r => {
        jobs.push({ t: r.pick_time, k: '迎え', c: r.child, p: r.pick_place, dr: r.pick_driver, car: r.pick_car });
        jobs.push({ t: r.drop_time, k: '送り', c: r.child, p: r.drop_place, dr: r.drop_driver, car: r.drop_car });
      });
      jobs.sort((a, b) => (a.t || '99').localeCompare(b.t || '99'));
      const bad = jobs.filter(j => !j.dr || !j.car).length;
      return `<h4>${fmtDay(d)}　${bad ? `<span style="color:#c00">未確定 ${bad}件</span>` : '全て確定'}</h4><table><tr><th>時刻</th><th></th><th>児童</th><th>場所</th><th>担当</th><th>車</th></tr>${jobs.map(j =>
        `<tr><td>${esc(j.t)}</td><td>${j.k}</td><td>${esc(j.c)}${CARE[j.c] ? `<br><small style="color:#c60">⚠ ${esc(CARE[j.c])}</small>` : ''}</td><td>${esc(j.p) || '自宅'}</td><td>${cell(j.dr, '未定')}</td><td>${cell(j.car, '未定')}</td></tr>`).join('')}</table>`;
    }).join('') : noTab());
  },
  async kids() {
    const [rows, cc, ci, cp] = await Promise.all([loadNikki(), DEMO ? [] : sb('leo_child_care').catch(() => []), DEMO ? [] : sb('leo_child_info?select=name,note').catch(() => []), DEMO ? [] : sb('leo_child_plan').catch(() => [])]);
    const N = s => String(s || '').replace(/\s/g, '');
    const PL = Object.fromEntries(cp.map(x => [N(x.name), x]));
    const days = byDay(rows);
    const msg = c => [...cc.filter(x => N(x.child) === N(c) && x.note).map(x => '送迎の配慮：' + x.note), ...ci.filter(x => N(x.name) === N(c) && x.note).map(x => 'メモ：' + x.note)];
    return `<h3>${PLABEL[PERIOD]}の利用児童</h3>${periodTabs('kids')}${demoNote()}<p><small>伝達事項は <a href="#leo/userinfo">利用者情報</a>（メモ・送迎の配慮）に書いたものです。</small></p>` + (days.length ? days.map(([d, rs]) => {
      const use = rs.filter(r => r.kind === '利用'), abs = rs.filter(r => r.kind === '欠席');
      return `<h4>${fmtDay(d)}（${use.length}人）</h4>${use.map(r => { const m = msg(r.child);
        return `<div class="card" style="margin:8px 0"><b style="font-size:18px">${esc(r.child)}</b>　${esc(r.service)}　${esc(r.start_time)}〜${esc(r.end_time)}<br><small>迎え：${esc(r.pick_time)} ${esc(r.pick_place || '自宅')}（${esc(r.pick_driver) || '未定'}）／送り：${esc(r.drop_time)} ${esc(r.drop_place || '自宅')}（${esc(r.drop_driver) || '未定'}）</small>
        ${m.length ? `<div style="background:#fff6e5;border-left:4px solid #e8833a;padding:6px 8px;margin:6px 0">${m.map(x => '⚠ ' + esc(x)).join('<br>')}</div>` : ''}
        ${PL[N(r.child)] ? `<details style="margin-top:6px"><summary style="cursor:pointer;font-weight:bold;color:#36c">📋 個別支援計画（${esc(PL[N(r.child)].term || '')}　${esc(PL[N(r.child)].period || '')}）を読む</summary><div style="white-space:pre-wrap;line-height:1.7;background:#f7f9fc;border:1px solid #dde;border-radius:6px;padding:10px;margin-top:6px">${planText(PL[N(r.child)].body)}</div></details>`
        : `<button onclick="PLAN_OPEN='${N(r.child)}';location.hash='leo/plan'">📋 個別支援計画を開く</button>`}</div>`; }).join('')}
        ${abs.length ? `<p>欠席：${abs.map(r => esc(r.child)).join('、')}</p>` : ''}`;
    }).join('') : noTab());
  },
  async kata() {
    const rows = await sheetRows('kata');
    const dows = [...new Set(rows.map(r => r['曜日']).filter(Boolean))].sort((a, b) => '月火水木金土日'.indexOf(a) - '月火水木金土日'.indexOf(b));
    return `<h3>送迎 型表（曜日ごと・見るだけ）</h3>${demoNote()}<p class="note">いつもの予定です。その日の変更は日誌・カレンダーが正です。</p>` + dows.map(w =>
      `<h4>${w}曜日</h4><table><tr><th>児童</th><th>迎え</th><th>送り</th></tr>${rows.filter(r => r['曜日'] === w).map(r => r['保護者送迎']
        ? `<tr><td>${esc(r['児童名'])}</td><td colspan="2">保護者送迎（${esc(r['利用開始'])}〜${esc(r['利用終了'])}）</td></tr>`
        : `<tr><td>${esc(r['児童名'])}</td><td>${esc(r['迎え開始'])} ${esc(r['迎え担当'])}<br><small>${esc(r['迎え場所'])}</small></td><td>${esc(r['送り終了'])} ${esc(r['送り担当'])}<br><small>${esc(r['送り場所（空欄なら自宅）']) || '自宅'}</small></td></tr>`).join('')}</table>`).join('');
  },
  async keikaku() {
    const rows = await sheetRows('keikaku');
    const t = new Date(today() + 'T00:00:00+09:00');
    const due = r => { // 期限＝次期開始月の1日。送付目安日が「至急」なら期限切れ扱い
      const m = String(r['次期開始月']).match(/(\d{4})年(\d{1,2})月/); return m ? new Date(+m[1], +m[2] - 1, 1) : null; };
    const level = r => { const d = due(r), done = r['本案署名'] === '済';
      if (done) return ['ok', '本案署名済'];
      if (r['フォーム送付目安日'] === '至急' || (d && d < t)) return ['over', '期限切れ'];
      if (d && (d - t) / 864e5 <= 30) return ['soon', '30日以内'];
      return ['', '']; };
    const list = rows.map(r => ({ r, l: level(r), d: due(r) })).sort((a, b) => (a.d || 0) - (b.d || 0));
    return `<h3>個別支援計画 管理表（見るだけ）</h3>${demoNote()}<p class="note">赤＝期限切れ、黄＝30日以内。期限は「次期開始月」の1日として計算しています。</p>` +
      list.map(({ r, l }) => `<div class="card rec kk ${l[0]}"><b>${esc(r['児童名'])}</b> ${l[1] ? `<span class="badge">${l[1]}</span>` : ''}
        <br>${esc(r['現在の期'])}・${esc(r['現在の計画期間'])}<br>次期開始：<b>${esc(r['次期開始月'])}</b>　フォーム送付目安：${esc(r['フォーム送付目安日'])}
        <br><small>フォーム回答 ${esc(r['フォーム回答日']) || 'なし'}／計画書 ${esc(r['計画書作成'])}／原案署名 ${esc(r['原案署名'])}／本案署名 ${esc(r['本案署名'])}</small></div>`).join('');
  },
  async haichi() {
    const rows = await sheetRows('haichi');
    const t = today().replace(/-/g, '/');
    const days = [...new Set(rows.map(r => r['日付']))];
    const pick = DEMO ? days : days.filter(d => d >= t).slice(0, 7);
    const show = pick.length ? pick : days.slice(-3);
    return `<h3>職員配置表（見るだけ）</h3>${demoNote()}<p class="note">日誌から作られた配置です（${pick.length ? '今日以降' : '直近'}）。</p>` + show.map(d => {
      const rs = rows.filter(r => r['日付'] === d);
      return `<h4>${esc(d)}（${esc(rs[0]['曜日'])}） 児童${esc(rs[0]['利用児童数'])}人</h4><table><tr><th>職員</th><th>時間</th><th>役割</th></tr>${rs.map(r =>
        `<tr><td>${esc(r['職員名'])}<br><small>${esc(r['常勤/非常勤'])}</small></td><td>${esc(r['配置開始'])}〜${esc(r['配置終了'])}</td><td><small>${esc(r['役割(日誌)'])}</small></td></tr>`).join('')}</table>`;
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
    return `<h3>今日の日誌（見る・直す）</h3>${demoNote()}<p class="note">直したらすぐ日誌に反映されます（1分ほど）。日誌のほうが先に変わっていたときは反映せず「衝突」になります。食事・おやつは日誌で直接直してください。</p>` +
      rows.map(r => `<div class="card rec"><b>${esc(r.child)}</b>（${esc(r.service)}）
        ${NIKKI_FIELDS.map(([f, l]) => f === 'activity'
          ? `<label>${l}<textarea rows="6" data-row="${r.row_no}" data-f="${f}" data-old="${esc(r[f])}">${esc(r[f])}</textarea></label>`
          : `<label>${l}<input data-row="${r.row_no}" data-f="${f}" data-old="${esc(r[f])}" value="${esc(r[f])}"></label>`).join('')}</div>`).join('') +
      `<button onclick="saveNikki()">直した所を送る</button><div id="saved"></div>`;
  },
  async jisseki() {
    const rows = DEMO ? DEMO_DATA.jisseki : await sb('leo_jisseki?order=day.desc,child&limit=200');
    return `<h3>実績記録（見るだけ）</h3>${demoNote()}<p class="note">利用料・加算などの請求の項目はここには出しません。</p>
      <table><tr><th>日付</th><th>児童</th><th>状況</th><th>時間</th></tr>${rows.map(r =>
      `<tr><td>${esc(r.day)}</td><td>${esc(r.child)}</td><td>${esc(r.status)}</td><td>${esc(r.start_time)}〜${esc(r.end_time)}</td></tr>`).join('')}</table>
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

// ===== 職責（管理者／児発管／現場支援員／事務） =====
let DUTY = '現場支援員';
const canManage = () => ROLE === '事務' || ['管理者', '児発管'].includes(DUTY);
async function loadDuty() {
  if (DEMO) { DUTY = new URLSearchParams(location.search).get('duty') || (ROLE === '事務' ? '管理者' : '現場支援員'); return; }
  try { const p = await sb('staff_profiles?select=duty'); DUTY = p[0]?.duty || '現場支援員'; } catch (e) { }
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
  // 1. 個別支援計画：期限切れ・30日以内（管理表）
  try {
    const kk = await sheetRows('keikaku'); const t = new Date(today() + 'T00:00:00+09:00');
    kk.forEach(r => { const m = String(r['次期開始月'] || '').match(/(\d{4})年(\d{1,2})月/); if (!m || r['本案署名'] === '済') return;
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
  const ch = [...document.querySelectorAll('.rec input, .rec textarea')].filter(i => i.value !== i.dataset.old)
    .map(i => ({ target: 'nikki', day: today(), row_key: i.dataset.row, field: i.dataset.f, old_value: i.dataset.old, new_value: i.value }));
  if (!ch.length) { $('saved').textContent = '変更はありません。'; return; }
  if (DEMO) { $('saved').textContent = `見本モードなので保存しません（${ch.length}件の修正）。`; return; }
  try { await sb('leo_edits', { method: 'POST', body: JSON.stringify(ch), headers: { Prefer: 'return=minimal' } });
    $('saved').textContent = `${ch.length}件を送りました。1分ほどで日誌に反映されます。`; document.querySelectorAll(".rec input, .rec textarea").forEach(i => { i.dataset.old = i.value; }); }
  catch (e) { $('saved').textContent = e.message; }
}

async function renderLeoView(name) {
  $('view').innerHTML = '<p>読み込み中…</p>';
  await loadDuty();
  try { $('view').innerHTML = `<button class="back" onclick="location.hash='leo'">← レオへ</button>` + await LEO_VIEWS[name](); }
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
    <h4>2. ファイルを作る</h4>${monthTabs('seikyu')}<p class="note">上の月が、請求の対象月です。</p><label>事業所番号（10桁）<input id="office_no" value="${esc(localStorage.getItem('leo_office_no') || (DEMO ? '9999999999' : ''))}" size="12"></label>
    <p class="note">事業所全体にかかる減算（今はなし。かかった月だけ印を付けます。基本報酬のサービスコードが減算用のコードに変わります）：
      ${OFFICE_GENSAN.map(([k, l]) => `<label><input type="checkbox" class="og" value="${k}">${l}</label>`).join(' ')}</p>
    <button onclick="makeCsv()">請求CSVを作る（K112/K122・K611）</button><div id="csv_out"></div>`;
};
// ===== 利用者情報（児童ごとにワンストップ）：受給者証(leo_children)・送迎の配慮(leo_child_care)・連絡先/送迎/アルバム(leo_child_info) =====
const UI = { sel: null, adding: false, tab: 'basic' };
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
LEO_VIEWS.userinfo = async function () {
  const mg = canManage();
  const [kids, infos, cares, nk, asses, plans] = DEMO ? [DEMO_BILL.kids, [], [], [], [], []] : await Promise.all([mg ? sb('leo_children?order=name') : [], sb('leo_child_info?order=name').catch(() => []), sb('leo_child_care').catch(() => []), billData().then(d => d.nikki).catch(() => []), sb('leo_child_assess?order=name').catch(() => []), sb('leo_child_plan').catch(() => [])]);
  const PLN = Object.fromEntries(plans.map(x => [x.name, x]));
  const A = Object.fromEntries(asses.map(x => [x.name, x]));
  const I = Object.fromEntries(infos.map(x => [x.name, x])), K = Object.fromEntries(kids.map(x => [x.name, x])), C = Object.fromEntries(cares.map(x => [x.child, x.note]));
  const names = [...new Set([...kids.map(x => x.name), ...infos.map(x => x.name), ...cares.map(x => x.child), ...asses.map(x => x.name), ...nk.map(n => n.child)])].filter(Boolean).sort((a, b) => a.localeCompare(b, 'ja'));
  const css = `<style>.ui-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin:8px 0}.ui-list a{display:block;border:1px solid #ccd;border-radius:8px;padding:10px;background:#fff;text-decoration:none;color:#222}.ui-list a small{display:block;color:#666}.uic{border:1px solid #ccd;border-radius:8px;margin:8px 0;background:#fff}.uic h4{margin:0;padding:8px 10px;background:#eef;border-radius:8px 8px 0 0}.uig{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:6px 12px;padding:8px 10px}.uig label span{display:block;font-size:.8em;color:#555}.uig input:not([type=checkbox]),.uig select,.uig textarea{width:100%;box-sizing:border-box;margin:2px 0;padding:8px}.uig .wide{grid-column:1/-1}.uil a{margin-right:10px}</style>`;
  const nm = UI.sel;
  if (!nm && !UI.adding) {
    return `<h3>利用者情報</h3>${demoNote()}${css}<p class="note">児童ごとの受給者証・送迎・連絡先・Googleフォト・個別支援計画を、ここ1か所にまとめています。児童を選んでください。${mg ? '' : '（見るだけです。直すのは児発管・事務・管理者）'}</p>
      <div class="ui-list">${names.map(n => `<a href="#" onclick="uiOpen(${esc(JSON.stringify(n))});return false"><b>${esc(n)}</b><small>${[K[n] ? '受給者証' + (K[n].jukyusha_no ? '○' : '未') : '', I[n] ? (I[n].transport_mode || '') : '送迎未入力'].filter(Boolean).join(' ／ ')}</small></a>`).join('')}</div>
      ${mg ? `<button onclick="uiAdd()">＋ 児童を追加</button>` : ''}
      <p class="note">請求CSVは <a href="#leo/seikyu">請求</a> から（ここの受給者証の内容が使われます）。</p>`;
  }
  const k = K[nm] || {}, i = I[nm] || {}, ro = mg ? '' : 'disabled';
  if (UI.tab === 'plan' && nm) {
    const p = PLN[nm] || {};
    const tabs = `<p><button class="back" onclick="uiTab('basic')">基本</button> <button class="back" onclick="uiTab('assess')">アセスメント</button> <b style="padding:6px 10px;border-bottom:3px solid #36c">個別支援計画</b></p>`;
    return `<button class="back" onclick="uiOpen(null)">← 児童の一覧へ</button>${css}<h3>${esc(nm)}${demoNote()}</h3>${tabs}
      <p class="note">現行の個別支援計画の本文です。今日の利用児童のカードから読めます。${p.updated_at ? '更新：' + esc(String(p.updated_at).slice(0, 10)) + '。' : 'まだ入っていません。'}${mg ? '' : '（見るだけです。直すのは児発管・事務・管理者）'}</p>
      <div id="uiw" data-name="${esc(nm)}"><div class="uic"><div class="uig">
        <label><span>期（例：第2期）</span><input data-t="pl" data-f="term" value="${esc(p.term || '')}" ${ro}></label>
        <label><span>計画期間</span><input data-t="pl" data-f="period" value="${esc(p.period || '')}" ${ro}></label>
        <label class="wide"><span>元の計画書（Googleドキュメント等）のリンク　https://…</span><input data-t="pl" data-f="source_url" type="url" value="${esc(p.source_url || '')}" ${ro}></label>
        <label class="wide"><span>計画書の本文（援助の方針・長期目標・短期目標と支援内容）。元の計画書からコピーして貼れます</span><textarea data-t="pl" data-f="body" rows="22" ${ro}>${esc(p.body || '')}</textarea></label></div></div>
        ${p.source_url ? `<p class="uil"><a href="${esc(p.source_url)}" target="_blank" rel="noopener">📄 元の計画書を開く</a></p>` : ''}</div>
      ${mg ? `<button onclick="uiSavePlan()">保存</button> <span id="ui_msg"></span>` : ''}`;
  }
  if (UI.tab === 'assess' && nm) {
    const a = A[nm] || {}, d = a.data || {};
    const tabs = `<p><button class="back" onclick="uiTab('basic')">基本</button> <b style="padding:6px 10px;border-bottom:3px solid #36c">アセスメント</b> <button class="back" onclick="uiTab('plan')">個別支援計画</button></p>`;
    return `<button class="back" onclick="uiOpen(null)">← 児童の一覧へ</button>${css}<h3>${esc(nm)}${demoNote()}</h3>${tabs}
      <p class="note">${a.source ? '取り込み元：' + esc(a.source) + '。' : 'まだ入力がありません。'}診断名・服薬などの機微情報を含みます。レオ職員だけが見られます。${mg ? '' : '（見るだけです。直すのは児発管・事務・管理者）'}</p>
      <div id="uiw" data-name="${esc(nm)}">${ASSESS_SECTIONS.map(([t, fs]) => `<div class="uic"><h4>${t}</h4><div class="uig">${fs.map(([f, l, w]) => `<label${w ? ' class="wide"' : ''}><span>${l}</span>${w ? `<textarea data-t="as" data-f="${f}" rows="2" ${ro}>${esc(d[f] || '')}</textarea>` : `<input data-t="as" data-f="${f}" value="${esc(d[f] || '')}" ${ro}>`}</label>`).join('')}</div></div>`).join('')}</div>
      ${mg ? `<button onclick="uiSaveAssess()">保存</button> <span id="ui_msg"></span>` : ''}`;
  }
  const kin = (f, l, v, extra = '') => `<label><span>${l}</span><input data-t="info" data-f="${f}" value="${esc(v ?? '')}" ${extra} ${ro}></label>`;
  const jk = mg ? `<div class="uic"><h4>① 受給者証（請求に使います）</h4><div class="uig">${KID_F.filter(([f]) => f !== 'name').map(([f, l]) => `<label><span>${l}</span>${kidInput(k, f, k[f])}</label>`).join('')}</div></div>` : '';
  return `<button class="back" onclick="uiOpen(null)">← 児童の一覧へ</button>${css}<h3>${nm ? esc(nm) : '（新しい児童）'}${demoNote()}</h3>
    <div id="uiw" data-name="${esc(nm || '')}">
    ${UI.adding ? `<div class="uic"><div class="uig"><label><span>児童名（日誌と同じ表記）</span><input id="ui_newname" data-t="new"></label></div></div>` : ''}
    ${nm ? `<p><b style="padding:6px 10px;border-bottom:3px solid #36c">基本</b> <button class="back" onclick="uiTab('assess')">アセスメント${A[nm] ? '' : '（未入力）'}</button> <button class="back" onclick="uiTab('plan')">個別支援計画${PLN[nm] ? '' : '（未入力）'}</button></p>` : ''}
    <p class="uil">${i.album_url ? `<a href="${esc(i.album_url)}" target="_blank" rel="noopener">📷 Googleフォト アルバム</a>` : ''}</p>
    ${jk}
    <div class="uic"><h4>${mg ? '②' : '①'} 送迎</h4><div class="uig">
      <label><span>送迎の種類</span><select data-t="info" data-f="transport_mode" ${ro}><option value=""></option>${TMODE.map(o => `<option ${o === i.transport_mode ? 'selected' : ''}>${o}</option>`).join('')}</select></label>
      <label class="wide"><span>送迎の曜日</span>${WD.map(w => `<label style="display:inline-block;margin-right:10px"><input type="checkbox" class="ui_wd" value="${w}" ${(i.transport_days || []).includes(w) ? 'checked' : ''} ${ro}> ${w}</label>`).join('')}</label>
      ${kin('pickup_place', '乗る場所（迎え）', i.pickup_place)}${kin('dropoff_place', '降りる場所（送り）', i.dropoff_place)}
      <label class="wide"><span>送迎の配慮（座席・チャイルドシート・引き渡し相手・アレルギー等）※送迎画面にも出ます</span><textarea data-t="care" data-f="note" rows="3" ${ro}>${esc(C[nm] || '')}</textarea></label>
      <label class="wide"><span>送迎のメモ</span><textarea data-t="info" data-f="transport_note" rows="2" ${ro}>${esc(i.transport_note || '')}</textarea></label></div></div>
    <div class="uic"><h4>${mg ? '③' : '②'} 保護者・連絡先</h4><div class="uig">${INFO_F.map(([f, l]) => kin(f, l, i[f])).join('')}</div></div>
    <div class="uic"><h4>${mg ? '④' : '③'} Googleフォト・メモ</h4><div class="uig">${kin('album_url', '共有アルバムのリンク（https://…）', i.album_url, 'type="url"')}<label class="wide"><span>メモ</span><textarea data-t="info" data-f="note" rows="3" ${ro}>${esc(i.note || '')}</textarea></label></div></div>
    </div>${mg ? `<button onclick="uiSave()">保存</button> <span id="ui_msg"></span>` : ''}${mg && nm ? `<p style="margin-top:28px"><button onclick="uiDelete()" style="color:#c00;border-color:#c00">この児童を削除</button></p>` : ''}`;
};
window.uiDelete = async () => {
  const w = $('uiw'), name = w && w.dataset.name, m = $('ui_msg'); if (!name) return;
  if (!confirm(`「${name}」を削除します。\n\n消えるもの：受給者証・送迎・連絡先・アセスメント（利用者情報の全項目）\n消えないもの：日誌などの記録\n\n元に戻せません。よろしいですか？`)) return;
  if (DEMO) { alert('見本モードなので削除しません。'); return; }
  try {
    for (const [t, c] of [['leo_child_plan', 'name'], ['leo_child_assess', 'name'], ['leo_child_info', 'name'], ['leo_child_care', 'child'], ['leo_children', 'name']])
      await sb(`${t}?${c}=eq.${encodeURIComponent(name)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
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
  const w = $('uiw'), m = $('ui_msg'), name = w.dataset.name, o = {};
  w.querySelectorAll('[data-t="pl"]').forEach(x => o[x.dataset.f] = x.value.trim() || null);
  if (o.source_url && !/^https:\/\//.test(o.source_url)) { m.textContent = 'リンクは https:// で始まるものを入れてください。'; return; }
  if (DEMO) { m.textContent = '見本モードなので保存しません。'; return; }
  try {
    await sb('leo_child_plan?on_conflict=name', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify([{ name, ...o, updated_at: new Date().toISOString() }]) });
    await renderLeoView('userinfo'); $('ui_msg').textContent = '保存しました。';
  } catch (e) { m.textContent = e.message; }
}
async function uiSaveAssess() {
  const w = $('uiw'), m = $('ui_msg'), name = w.dataset.name, data = {};
  w.querySelectorAll('[data-t="as"]').forEach(x => { if (x.value.trim()) data[x.dataset.f] = x.value.trim(); });
  if (DEMO) { m.textContent = '見本モードなので保存しません。'; return; }
  try {
    await sb('leo_child_assess?on_conflict=name', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify([{ name, data, source: 'ポータル入力', updated_at: new Date().toISOString() }]) });
    await renderLeoView('userinfo'); $('ui_msg').textContent = '保存しました。';
  } catch (e) { m.textContent = e.message; }
}
async function uiSave() {
  const w = $('uiw'), m = $('ui_msg'), name = (UI.adding ? $('ui_newname').value : w.dataset.name).trim();
  if (!name) { m.textContent = '児童名を入れてください。'; return; }
  const get = t => { const o = {}; w.querySelectorAll(`[data-t="${t}"][data-f]`).forEach(x => o[x.dataset.f] = x.type === 'checkbox' ? x.checked : x.value.trim()); return o; };
  const kid = get('kid'), info = get('info'), care = get('care');
  info.name = name; info.transport_days = [...w.querySelectorAll('.ui_wd:checked')].map(x => x.value);
  Object.keys(info).forEach(f => { if (info[f] === '') info[f] = null; }); info.transport_days = info.transport_days || [];
  if (info.album_url && !/^https:\/\//.test(info.album_url)) { m.textContent = 'アルバムのリンクは https:// で始まるものを入れてください。'; return; }
  const hasKid = Object.values(kid).some(v => v && v !== '放デイ' && v !== '4600');
  if (hasKid) {
    if (!/^\d{10}$/.test(kid.jukyusha_no) || !/^\d{6}$/.test(kid.city_no)) { m.textContent = '受給者証番号は10桁・市町村番号は6桁の数字で入れてください（受給者証を入れない場合は①を空のままに）。'; return; }
    kid.name = name; kid.cap_monthly = +kid.cap_monthly; kid.contract_days = kid.contract_days ? +kid.contract_days : null; kid.contract_start = kid.contract_start || null; kid.contract_end = kid.contract_end || null;
    kid.first_date = kid.first_date || null; kid.kinyu_no = kid.kinyu_no ? +kid.kinyu_no : null; kid.gensan = kid.gensan ? [kid.gensan] : []; kid.guardian_kana = kid.guardian_kana || null; kid.kana = kid.kana || null;
  }
  if (DEMO) { m.textContent = '見本モードなので保存しません。'; return; }
  const up = (t, k, r) => sb(`${t}?on_conflict=${k}`, { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify([r]) });
  try {
    if (hasKid) await up('leo_children', 'name', kid);
    await up('leo_child_info', 'name', info);
    await up('leo_child_care', 'child', { child: name, note: care.note || null });
    UI.sel = name; UI.adding = false; await renderLeoView('userinfo'); $('ui_msg').textContent = '保存しました。';
  } catch (e) { m.textContent = e.message; }
}
const loadSjis = () => window.Encoding ? Promise.resolve() : new Promise((ok, ng) => { const s = document.createElement('script');
  s.src = 'vendor/encoding.min.js'; s.onload = ok; s.onerror = () => ng(new Error('文字コード変換の部品を読み込めませんでした')); document.head.appendChild(s); });
async function makeCsv() {
  const out = $('csv_out'), office = $('office_no').value.trim();
  if (!/^\d{10}$/.test(office)) { out.textContent = '事業所番号を10桁で入れてください。'; return; }
  localStorage.setItem('leo_office_no', office);
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
// 正は Google の「レオ 個別支援計画 管理表」。この画面は見るだけ（書き換えない）。保護者への送付は齊藤がLINE 1対1で行う。
const PLAN_LINKS = {
  管理表: 'https://docs.google.com/spreadsheets/d/1xJDYdWF1BvZKndQ6FA3OLrMTYPDaQPcYQGrBakcaT7o/edit',
  アンケート: 'https://docs.google.com/forms/d/1GHayxueTza8GrcPJDC17SGMXEgybxvFyvaLbpzWoRyo/viewform',
  同意リンク一覧: 'https://docs.google.com/spreadsheets/d/1NK4rdf6QuYEEuZByRMGFK5BETBY9ZHoaEte7H-BndL4/edit',
  計画フォルダ: 'https://drive.google.com/drive/folders/1BCGuiFmFZocXZU1r361dMtgnWL9icnL7',
  記録フォルダ: 'https://drive.google.com/drive/folders/1OZ5I8qcG3D-sO5i3VelZTB5XFtVJ5rvu',
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
  ['② LINEで2つ送る', '齊藤', 'アンケート（共通リンク）＋その子のモニタリング記録PDF をLINE 1対1で', ['アンケート', '記録フォルダ']],
  ['③ 保護者が回答', '保護者', '回答日は管理表に自動で入る'],
  ['④ 下書きができる', '自動', 'ボットが 前回計画＋今期のモニタリング記録＋回答 から、アセスメント・原案・会議録・本案の4つを1つのドキュメントに', ['計画フォルダ']],
  ['⑤ 確認・修正 →「計画書作成」＝済', '齊藤', '済は手で（ここだけ自動ではない）', ['計画フォルダ', '管理表']],
  ['⑥ 原案の同意', '齊藤→保護者', '原案用の同意リンクをLINE 1対1で。届くと「原案署名」が自動で済', ['同意リンク一覧']],
  ['⑦ 担当者会議', '会議', '原案の同意のあと。齊藤・中村友香・中村文、場所レオ。内容は下書きの会議録で直す'],
  ['⑧ 本案の同意', '齊藤→保護者', '本案用の同意リンクをLINE 1対1で。届くと「本案署名」が自動で済、次の期の行ができる', ['同意リンク一覧']],
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
  { 児童名: '児童A', 現在の期: '2期', 現在の計画期間: '2026年5月〜2026年10月', 次期開始月: '2026年11月', フォーム送付目安日: '2026/10/15', フォーム回答日: '', 計画書作成: '未', 原案署名: '未', 本案署名: '未', 備考: '' },
  { 児童名: '児童B', 現在の期: '1期', 現在の計画期間: '2026年5月〜2026年10月', 次期開始月: '2026年11月', フォーム送付目安日: '2026/10/15', フォーム回答日: '2026/10/12', 計画書作成: '済', 原案署名: '未', 本案署名: '未', 備考: '' },
  { 児童名: '児童C', 現在の期: '3期', 現在の計画期間: '2026年4月〜2026年9月', 次期開始月: '2026年10月', フォーム送付目安日: '至急', フォーム回答日: '2026/09/20', 計画書作成: '済', 原案署名: '済', 本案署名: '未', 備考: '（見本）会議日の調整中' },
  { 児童名: '児童D', 現在の期: '1期', 現在の計画期間: '2026年10月〜2027年3月', 次期開始月: '2027年4月', フォーム送付目安日: '2027/03/15', フォーム回答日: '2026/09/18', 計画書作成: '済', 原案署名: '済', 本案署名: '済', 備考: '' },
];
// ===== ⑤ 個別支援計画（ポータル内で作る）：保護者アンケート → 職員モニタリング → 4書類（アセスメント・原案・会議録・本案）→ 同意（原案→会議→本案） =====
const PLAN_STEPS2 = ['保護者アンケート', '職員モニタリング', '下書き（4書類）', '確認・計画書作成＝済', '原案の同意', '担当者会議', '本案の同意'];
const reiwa = d => `令和${d.getFullYear() - 2018}年${d.getMonth() + 1}月${d.getDate()}日`;
const isoD = d => ymd(d);
function planSkeleton(name, n, d) {
  const [sei, mei] = String(name).split(/\s+/), nm = `${sei}　${mei || ''}`, per = `${reiwa(d.start)} 〜 ${reiwa(d.end)}`;
  const five = big => ['1.健康・生活', '2.運動・感覚', '3.認知・行動', '4.言語・コミュニケーション', '5.人間関係・社会性'].map(x => `${x}\n目標：\n支援：`).join('\n\n');
  return {
    assessment: `#T アセスメントシート\n#R 作成日：${reiwa(d.assess)}\n#R 【利用者名】${nm}\n#R 【作成者】児童発達支援管理責任者 齊藤連\n\n【基本情報・背景】\n\n【現在の状況と課題】\n・健康・生活\n\n・運動・感覚\n\n・認知・行動\n\n・言語・コミュニケーション\n\n・人間関係・社会性\n\n【保護者の意向】\n・`,
    genan: `#T 個別支援計画書（原案）\n#R 【利用者名】${nm}\n#R 【作成日】${reiwa(d.genan)}\n#R 【計画期間】${per}\n#R 【作成者】児童発達支援管理責任者 齊藤連\n\n【 総合的な援助の方針 】\n\n【長期目標】\n\n【短期目標と支援内容】\n${five()}\n\n\n#R 同意フォームにて同意（${reiwa(d.genan)}）`,
    kaigi: `#T 個別支援計画策定に係る担当者会議録\n#R 【利用者名】${nm}\n#R 開催日：${reiwa(d.kaigi)}\n#R 場所：レオ\n#R 参加者：齊藤連（児発管）、中村友香（保育士）、中村文（保育士）\n\n【会議の要旨】\n齊藤より、\n中村（友）より、\n中村（文）より、\n結論として、`,
    honan: `#T 個別支援計画書（第${n}期）\n#R 【利用者名】${nm}\n#R 【作成日】${reiwa(d.honan)}\n#R 【計画期間】${per}\n#R 【作成者】児童発達支援管理責任者 齊藤連\n\n【 総合的な援助の方針 】\n\n【長期目標】\n\n【短期目標と支援内容】\n${five()}\n\n\n#R 同意フォームにて同意（${reiwa(d.honan)}）` };
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
async function planData() {
  if (DEMO) return { rows: PLAN_DEMO_ROWS, ...PLAN_DEMO_DB };
  const [rows, plans, links, ans, staff] = await Promise.all([trackRows(), sb('leo_plans?order=child,term_no'), sb('leo_mon_links?select=token,child,term').catch(() => []),
    sb('leo_mon_answers?order=submitted_at.desc').catch(() => []), sb('leo_staff_mon').catch(() => [])]);
  const [sends, clinks] = await Promise.all([sb('leo_link_sends?order=sent_at').catch(() => []), sb('leo_plan_consent_links?select=token,plan_id,doc,used_at,expires_at&order=link_id').catch(() => [])]);
  const L = Object.fromEntries(links.map(l => [l.token, l]));
  return { rows, plans, links, sends, clinks, staff, mon: ans.map(a => ({ ...L[a.token], answers: a.answers, submitted_at: a.submitted_at })) };
}
LEO_VIEWS.plan = async function () {
  const D0 = await planData(), rows = D0.rows.filter(r => r['児童名'] && !String(r['児童名']).startsWith('※')), t = new Date(today() + 'T00:00:00+09:00'), mg = canManage();
  const N = s => String(s || '').replace(/\s/g, '');
  const cards = rows.map(r => {
    const name = r['児童名'], m = String(r['次期開始月'] || '').match(/(\d{4})年(\d{1,2})月/), d = m ? planDates(+m[1], +m[2]) : null;
    const cur = parseInt(String(r['現在の期']).replace(/\D/g, '')) || 0, n = cur + 1, term = `第${n}期`;
    const p = D0.plans.find(x => N(x.child) === N(name) && x.term_no === n), now = D0.plans.find(x => N(x.child) === N(name) && x.term_no === cur);
    const mon = D0.mon.find(x => N(x.child) === N(name) && x.term === term), sm = D0.staff.find(x => N(x.child) === N(name) && x.term === term);
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
    const st = done.indexOf(false) < 0 ? 7 : done.indexOf(false), over = d && st < 7 && d.start < t, soon = d && st < 7 && !over && (d.start - t) / 864e5 <= 45;
    const key = N(name), open = PLAN_OPEN === key || (DEMO && /open=1/.test(location.search) && name === '児童B');
    const btn = (label, fn, dis) => `<button ${dis ? 'disabled' : ''} onclick="${fn}" style="display:block;width:100%;margin:6px 0;padding:12px;font-size:16px;border-radius:8px">${label}</button>`;
    const W = wait[0], ds = x => x ? md(x) : '';
    const rb = (l, f, dis) => mg ? btn(l, f, dis) : '';
    let act = '', ab = '';
    if (st >= 7) act = '✅ 本案の同意まで済み。いまやることはありません';
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
    const urgent = st < 7 && (over || soon || wait.length > 0);
    return { st, over, d, urgent, key, wait: wait.map(w => ({ ...w, name, key: N(name) })), html: `<div class="card" style="border-left:6px solid ${st >= 7 ? '#3a3' : over ? '#d33' : soon ? '#e6b800' : '#ccc'};padding:14px">
      <div style="font-size:17px"><b>${esc(name)}</b>　<small>${term}${d ? `（${d.start.getFullYear()}/${md(d.start)}〜）` : ''}</small>${over ? '　<span class="badge">開始月を過ぎています</span>' : ''}</div>
      <div style="display:flex;gap:2px;margin:8px 0">${PLAN_STEPS2.map((_, i) => `<span style="flex:1;height:8px;border-radius:3px;background:${done[i] ? '#3a3' : i === st ? '#e6b800' : '#ddd'}"></span>`).join('')}</div>
      <div style="font-size:20px;font-weight:bold;margin:8px 0;color:${st >= 7 ? '#2a7a2a' : '#c00'}">${act}</div>
      ${how}${ab}
      <details style="margin-top:8px" ${open ? 'open' : ''} ontoggle="if(this.open)PLAN_OPEN='${key}'"><summary style="cursor:pointer;color:#36c">くわしく見る</summary>
        <div style="margin-top:8px;font-size:14px">${checks}</div>
        <div>${waitHtml()}
        
        ${d ? `<p><small>書類に入れる日付（作成者 齊藤連）：アセスメント ${md(d.assess)}・原案 ${md(d.genan)}・担当者会議 ${md(d.kaigi)}・本案 ${md(d.honan)}</small></p>` : '<p class="note">管理表の「次期開始月」がありません。</p>'}
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
  return `<h3>個別支援計画</h3>${demoNote()}<p class="note">各カードの赤い行と下のボタンだけ進めれば大丈夫です。細かい情報は「くわしく見る」にあります。保護者へのリンクはコピーして、公式LINEの1対1トークで送ってください（ポータルからは送りません）。本文の下書きはボットが作ります。</p>
    ${cards.filter(c => c.urgent).map(c => c.html).join('') || '<p class="note">いま急ぎの子はいません。</p>'}${cards.some(c => !c.urgent) ? `<details style="margin-top:10px" ${cards.some(c => !c.urgent && PLAN_OPEN === c.key) ? 'open' : ''}><summary style="cursor:pointer;font-weight:bold">いま急ぎではない子（${cards.filter(c => !c.urgent).length}人）</summary>${cards.filter(c => !c.urgent).map(c => c.html).join('')}</details>` : ''}${cards.length ? '' : '<p>管理表の行がありません。</p>'}${mg ? trackEditList(rows) : ''}<div id="plan_editor"></div>`;
};
// 管理表の行を直す（児発管・管理者・事務）。ポータルの表だけを直す。Googleの管理表へは書き戻さない
function trackEditList(rows) {
  const tr = rows.filter(r => r._track);
  if (!tr.length) return '';
  return `<details style="margin-top:14px"><summary style="cursor:pointer;font-weight:bold">管理表の行を直す（${tr.length}人）</summary><p class="note">ここで直すのはポータルの管理表だけです。Googleの管理表は変わりません（11/1までは両方が動きます）。</p>
    ${tr.map(r => `<p style="margin:6px 0"><button onclick="trackEdit('${esc(r.児童名)}')" style="padding:8px 12px">${esc(r.児童名)}</button> <small>${esc(r.現在の期)}・${esc(r.現在の計画期間)}</small></p>`).join('')}</details>`;
}
const TRACK_FIELDS = [['term_no', '現在の期（数字）', 'number'], ['period_from', '計画期間 開始', 'date'], ['period_to', '計画期間 終了', 'date'], ['next_start', '次期開始日（1日）', 'date'], ['survey_due', 'アンケート送付目安日（空＝至急）', 'date'],
  ['survey_answered_at', 'アンケート回答日', 'date'], ['genan_date', '原案の予定日', 'date'], ['kaigi_date', '会議の予定日', 'date'], ['honan_date', '本案の予定日', 'date']];
async function trackEdit(name) {
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
  if (DEMO) { pmsg(name, '<p class="note">見本モードなので作りません。</p>'); return; }
  try { const r = (await trackRows()).find(x => x['児童名'] === name) || {}, m = String(r['現在の計画期間'] || '').match(/(\d{4})年(\d{1,2})月/);
    const from = m ? `${m[1]}-${String(m[2]).padStart(2, '0')}-01` : addDays(today(), -183), to = today();
    const rows = (await sb(`leo_nikki_full?day=gte.${from}&day=lte.${to}&order=day&select=day,child,activity_text`)).filter(x => String(x.child).replace(/\s/g, '') === name.replace(/\s/g, '') && x.activity_text);
    if (!rows.length) { pmsg(name, '<p class="note">この期間の活動記録がありません。</p>'); return; }
    const text = `【${from}〜${to} の活動記録から（${rows.length}日分）】\n` + rows.map(x => `${fmtDay(x.day)}　${x.activity_text}`).join('\n');
    await sb('leo_staff_mon?on_conflict=child,term', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ child: name, term, period_from: from, period_to: to, text: text.slice(0, 20000), source: '自動（簡易）' }) });
    renderLeoView('plan'); } catch (e) { pmsg(name, esc(e.message)); }
}
// ===== 配置表・型表・管理表の入力（児発管・管理者・事務）＋ 送迎の配慮 =====
const MASTER_LABEL = { kata: '送迎 型表', keikaku: '個別支援計画 管理表', haichi: '職員配置表', care: '送迎の配慮（児童ごと）' };
let MASTER_KIND = 'kata';
LEO_VIEWS.master = async function () {
  if (!canManage()) return '<p>この画面は児発管・管理者・事務だけです。</p>';
  const tabs = '<p class="ptabs">' + Object.entries(MASTER_LABEL).map(([k, l]) => `<button class="${k === MASTER_KIND ? 'on' : ''}" onclick="MASTER_KIND='${k}';renderLeoView('master')">${l}</button>`).join('') + '</p>';
  if (MASTER_KIND === 'care') {
    const kids = [...new Set((await sheetRows('kata')).map(r => r['児童名']).filter(Boolean))], cc = DEMO ? [{ child: '児童A', note: '（見本）助手席の後ろ。降車時は母へ直接引き渡し。' }] : await sb('leo_child_care');
    const C2 = Object.fromEntries(cc.map(x => [x.child, x.note]));
    return `<h3>送迎の配慮</h3>${demoNote()}${tabs}<p class="note">座席・チャイルドシート・引き渡す相手・酔いやすさ・アレルギーなど。送迎画面で運転手に出ます。</p>
      ${kids.map(k => `<label>${esc(k)}<input class="care" data-c="${esc(k)}" value="${esc(C2[k] || '')}"></label>`).join('')}<button onclick="saveCare()">保存</button><div id="ms_msg"></div>`;
  }
  const own = DEMO ? [] : await sb(`leo_master?kind=eq.${MASTER_KIND}&order=row_no`), g = DEMO ? DEMO_DATA[MASTER_KIND] : (await sb(`leo_sheet?kind=eq.${MASTER_KIND}&order=row_no`)).map(r => r.data);
  const rows = own.length ? own.map(r => r.data) : g, cols = [...new Set([...g, ...rows].flatMap(Object.keys))];
  return `<h3>${MASTER_LABEL[MASTER_KIND]}の入力</h3>${demoNote()}${tabs}
    <p class="note">${own.length ? 'ポータルで入力した内容です（ポータルの画面はこちらを使います）。' : 'まだポータルで入力していません。下はGoogleの表の写しです。「保存」するとポータルの表になります（Googleの表は変わりません）。'}11/1まではGoogleの表も今まで通り使ってください。</p>
    <div style="overflow-x:auto"><table class="tbl"><tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr>${[...rows, {}].map(r => `<tr class="mrow">${cols.map(c => `<td><input data-c="${esc(c)}" value="${esc(r[c] ?? '')}" size="8"></td>`).join('')}</tr>`).join('')}</table></div>
    <button onclick="renderLeoView('master').then(()=>{})" style="display:none"></button><button onclick="addMasterRow()">＋ 行を足す</button> <button onclick="saveMaster()">保存</button><div id="ms_msg"></div>`;
};
function addMasterRow() { const t = document.querySelector('tr.mrow:last-child'); t.parentNode.appendChild(t.cloneNode(true)).querySelectorAll('input').forEach(i => i.value = ''); }
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
  return `<h3>LINE報告を書く</h3>${demoNote()}
    <p class="ptabs"><button onclick="LINE_DAY=addDays(LINE_DAY,-1);renderLeoView('line')">← 前の日</button> <b>${fmtDay(LINE_DAY)}</b> <button onclick="LINE_DAY=addDays(LINE_DAY,1);renderLeoView('line')">次の日 →</button></p>
    <p class="note">保護者さんへの報告文を、子どもごとに書きます。書けたら「LINE用にコピー」→ 公式LINEの1対1トークに貼って送ってください。日誌の活動記録（である調）は自動で作ります。</p>
    ${kids.map(k => { const d = D[k], a = A[k], id = 'ln_' + btoa(unescape(encodeURIComponent(k))).replace(/=/g, '');
      return `<details class="card" ${d ? '' : 'open'} style="padding:0"><summary style="padding:14px;font-size:17px;cursor:pointer"><b>■${esc(k)}</b>　<small>${d ? (d.sent_line ? '✅ LINE送信済' : '✏️ 下書きあり') : '⬜ まだ'}${a ? '／日誌 ' + esc(a.source) : ''}</small></summary>
        <div style="padding:0 14px 14px"><textarea id="${id}" rows="8" style="width:100%;font-size:16px;box-sizing:border-box" placeholder="本日もありがとうございました。…">${esc(d ? d.body : '')}</textarea>
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
    m.textContent = '保存しました。'; } catch (e) { m.textContent = e.message; }
}
async function copyLine(id, child, did) {
  const m = $(id + '_m'); try { await navigator.clipboard.writeText($(id).value); m.textContent = 'コピーしました。公式LINEのトークに貼って送ってください。'; } catch (e) { m.textContent = 'コピーできませんでした。長押しで選んでコピーしてください。'; }
  if (!DEMO && did) try { await sb(`leo_line_drafts?id=eq.${did}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ sent_line: true }) }); } catch (e) { }
}

// ===== 日誌（児童ごと・日ごと）：Google日誌の内容を読み取り表示＋職員の下書き（です・ます調）。11/1まで並行運転（日誌は読み取りだけ） =====
let DIA_DAY = today();
const DIA_DEMO = { rows: [{ child: '児童A', kind: '利用', start_time: '14:45', end_time: '17:00', pick_driver: '職員X', drop_driver: '職員Y', activity: '（見本）公園で鬼ごっこをした。' }], drafts: [{ child: '児童A', day: today(), body: '（見本）公園で鬼ごっこをしました。', author: '職員X' }] };
LEO_VIEWS.diary = async function () {
  let rows, drafts;
  if (DEMO) ({ rows, drafts } = DIA_DEMO);
  else { const [n, d] = await Promise.all([sb(`leo_nikki?day=eq.${DIA_DAY}&kind=in.(利用,欠席)&order=row_no`), sb(`leo_diary_draft?day=eq.${DIA_DAY}`).catch(() => null)]); rows = n; drafts = d; }
  const noTable = drafts === null; drafts = drafts || [];
  const D = Object.fromEntries(drafts.map(x => [x.child, x]));
  const me = DEMO ? '職員X' : await myName();
  const idOf = k => 'dr_' + btoa(unescape(encodeURIComponent(k))).replace(/=/g, '');
  return `<h3>日誌（児童ごと）</h3>${demoNote()}
    <p class="ptabs"><button onclick="DIA_DAY=addDays(DIA_DAY,-1);renderLeoView('diary')">← 前の日</button> <b>${fmtDay(DIA_DAY)}</b> <button onclick="DIA_DAY=addDays(DIA_DAY,1);renderLeoView('diary')">次の日 →</button></p>
    <p class="note">上はGoogleの日誌から読み取った内容（見るだけ）。下の「下書き」は、です・ます調で書いて保存します。11/1までは、いまの日誌が正式です（ここへ書いても日誌には入りません）。</p>
    ${noTable ? '<p style="color:#c00">下書きの保存場所がまだありません（管理者が準備中です）。</p>' : ''}
    ${rows.map(r => { const k = r.child, d = D[k], id = idOf(k);
      return `<details class="card" ${d ? '' : 'open'} style="padding:0"><summary style="padding:14px;font-size:17px;cursor:pointer"><b>■${esc(k)}</b>　<small>${esc(r.kind)}${r.start_time ? ' ' + esc(r.start_time) + '〜' + esc(r.end_time || '') : ''}／${d ? '✏️ 下書きあり' : '⬜ 下書きなし'}</small></summary>
        <div style="padding:0 14px 14px"><p class="note">迎え：${esc(r.pick_driver || '-')}　送り：${esc(r.drop_driver || '-')}</p>
        ${r.activity ? `<p style="white-space:pre-wrap"><b>日誌の活動記録</b><br>${esc(r.activity)}</p>` : '<p class="note">日誌の活動記録は、まだありません。</p>'}
        <b>下書き（です・ます調）</b>${d ? `<small>　${esc(d.author || '')}</small>` : ''}
        <textarea id="${id}" rows="6" style="width:100%;font-size:16px;box-sizing:border-box" ${noTable ? 'disabled' : ''}>${esc(d ? d.body : '')}</textarea>
        <button ${noTable ? 'disabled' : ''} onclick="saveDiary('${esc(k)}','${id}')">保存</button><div id="${id}_m"></div></div></details>`; }).join('') || '<p>この日の日誌に利用の子がいません。</p>'}`;
};
async function saveDiary(child, id) {
  const body = $(id).value.trim(), m = $(id + '_m'); if (!body) { m.textContent = '本文を書いてください。'; return; }
  if (DEMO) { m.textContent = '見本モードなので保存しません。'; return; }
  try { const author = await myName();
    await sb('leo_diary_draft?on_conflict=child,day', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ child, day: DIA_DAY, body, author, updated_at: new Date().toISOString() }) });
    m.textContent = '保存しました。'; } catch (e) { m.textContent = e.message; }
}
