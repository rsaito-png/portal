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
const sheetRows = async kind => DEMO ? DEMO_DATA[kind] : (await sb(`leo_sheet?kind=eq.${kind}&order=row_no`)).map(r => r.data);
async function myName() {
  if (DEMO) return DEMO_DATA.me;
  const p = await sb('staff_profiles?select=nikki_name');
  return p[0]?.nikki_name || '';
}
const same = (a, b) => a && b && a.replace(/\s/g, '') === b.replace(/\s/g, '');
const demoNote = () => DEMO ? '<p class="note">見本データです（架空）</p>' : '';

const LEO_VIEWS = {
  async sougei() {
    const [rows, me] = await Promise.all([loadNikki(), myName()]);
    const days = byDay(rows.filter(r => r.kind === '利用'));
    return `<h3>${PLABEL[PERIOD]}の送迎（${esc(me) || '名前未登録'} さんの担当）</h3>${periodTabs('sougei')}${demoNote()}` + (days.length ? days.map(([d, rs]) => {
      const jobs = [];
      rs.forEach(r => {
        if (same(r.pick_driver, me)) jobs.push({ t: r.pick_time, k: '迎え', c: r.child, p: r.pick_place, car: r.pick_car });
        if (same(r.drop_driver, me)) jobs.push({ t: r.drop_time, k: '送り', c: r.child, p: r.drop_place, car: r.drop_car });
      });
      jobs.sort((a, b) => (a.t || '').localeCompare(b.t || ''));
      return `<h4>${fmtDay(d)}</h4>` + (jobs.length ? `<table><tr><th>時刻</th><th></th><th>児童</th><th>場所</th><th>車</th></tr>${jobs.map(j =>
        `<tr><td>${esc(j.t)}</td><td>${j.k}</td><td>${esc(j.c)}</td><td>${esc(j.p)}</td><td>${esc(j.car)}</td></tr>`).join('')}</table>` : '<p>担当はありません。</p>');
    }).join('') : noTab());
  },
  async kids() {
    const days = byDay(await loadNikki());
    return `<h3>${PLABEL[PERIOD]}の利用児童</h3>${periodTabs('kids')}${demoNote()}` + (days.length ? days.map(([d, rows]) => {
      const use = rows.filter(r => r.kind === '利用'), abs = rows.filter(r => r.kind === '欠席');
      return `<h4>${fmtDay(d)}（${use.length}人）</h4><table><tr><th>児童</th><th>サービス</th><th>時間</th><th>迎え</th><th>送り</th></tr>${use.map(r =>
        `<tr><td>${esc(r.child)}</td><td>${esc(r.service)}</td><td>${esc(r.start_time)}〜${esc(r.end_time)}</td><td>${esc(r.pick_place || r.pick_driver)}</td><td>${esc(r.drop_place || r.drop_driver)}</td></tr>`).join('')}</table>
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
  try { $('view').innerHTML = `<button class="back" onclick="location.hash='leo'">← レオへ</button>` + await LEO_VIEWS[name](); }
  catch (e) { $('view').innerHTML = `<button class="back" onclick="location.hash='leo'">← レオへ</button><p>${esc(e.message)}</p>`; }
}
