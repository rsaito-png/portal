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
    <details class="card"><summary><b>＋ 報告する</b></summary>
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
      <p class="note">${r.status}${staff.length ? (notRead(r).length ? '　まだ読んでいない人：' + notRead(r).map(esc).join('、') : '　全員読みました') : ''}</p>
      ${canManage() && r.status === '未確認' ? `<label>再発防止の改善策<textarea id="hp_${r.id}" rows="2">${esc(r.prevention || '')}</textarea></label>
        <label>ひとこと（全員に見えます）<input id="hc_${r.id}"></label><button onclick="hyCheck(${r.id})">確認した</button>` : ''}</div>`).join('') || '<p>まだ報告はありません。</p>'}`;
};
async function hySave() {
  const v = id => document.getElementById(id).value.trim(), m = document.getElementById('hy_msg');
  if (!v('hy_at') || !v('hy_what')) { m.textContent = '「いつ」と「何があったか」は必ず書いてください。'; return; }
  if (DEMO) { m.textContent = '見本モードなので保存しません。'; return; }
  try { await sb('hiyari', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ occurred_at: new Date(v('hy_at')).toISOString(), place: v('hy_place'), kind: v('hy_kind'), child_label: v('hy_child'), what: v('hy_what'), response: v('hy_resp'), prevention: v('hy_prev'), service: '' }) });
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
    `<h4>まだ画面がないもの（準備中）</h4><p class="note">モニタリング・担当者会議の予定／加算の要件チェック／送迎表の配慮事項／アセスメント記入。できしだいここに出ます。</p>`;
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
  kids: [{ name: '児童A', kana: 'ｼﾞﾄﾞｳA', jukyusha_no: '9900000001', city_no: '999999', kind: '放デイ', cap_monthly: 4600, mushouka: false, contract_days: 23, contract_start: '2026-04-01' },
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
const KID_F = [['name', '児童名（日誌と同じ）'], ['kana', 'フリガナ（半角ｶﾅ）'], ['jukyusha_no', '受給者証番号（10桁）'], ['city_no', '市町村番号（6桁）'], ['kind', '種別'], ['cap_monthly', '負担上限月額'],
  ['mushouka', '無償化'], ['contract_days', '契約支給量（日）'], ['contract_start', '契約開始日']];
LEO_VIEWS.seikyu = async function () {
  if (!canBill()) return '<p>この画面は事務・管理者だけです。</p>';
  const kids = DEMO ? DEMO_BILL.kids : await sb('leo_children?order=name'), { nikki } = await billData();
  const names = [...new Set(nikki.map(n => n.child))], known = new Set(kids.map(k => k.name)), missing = names.filter(n => !known.has(n));
  const inp = (k, f, v) => f === 'kind' ? `<select data-f="kind">${['放デイ', '児発'].map(o => `<option ${o === v ? 'selected' : ''}>${o}</option>`).join('')}</select>`
    : f === 'cap_monthly' ? `<select data-f="cap_monthly">${[0, 4600, 37200].map(o => `<option ${o == v ? 'selected' : ''}>${o}</option>`).join('')}</select>`
    : f === 'mushouka' ? `<input type="checkbox" data-f="mushouka" ${v ? 'checked' : ''}>` : `<input data-f="${f}" value="${esc(v ?? '')}" ${f === 'contract_start' ? 'type="date"' : ''} size="${f === 'name' ? 10 : 12}">`;
  const row = k => `<tr class="kid">${KID_F.map(([f]) => `<td>${inp(k, f, k[f])}</td>`).join('')}</tr>`;
  return `<h3>請求CSVを作る（事務）</h3>${demoNote()}${monthTabs('seikyu')}
    <p class="note">ここで作るのはファイルだけです。国保連への送信は今まで通り「取込送信ソフト」で、中身を確かめてから行ってください。単価は6級地 10.36円（児発・放デイ／センター以外）。</p>
    <h4>1. 児童マスタ（受給者証）</h4>${missing.length ? `<p class="note" style="color:#c00">この月の日誌にいて、マスタにない児童：${missing.map(esc).join('、')}（下の空き行に入れてください）</p>` : ''}
    <div style="overflow-x:auto"><table class="tbl"><tr>${KID_F.map(([, l]) => `<th>${l}</th>`).join('')}</tr>${kids.map(row).join('')}${(missing.length ? missing.map(n => ({ name: n })) : [{}]).map(row).join('')}</table></div>
    <button onclick="saveKids()">マスタを保存</button> <span id="kd_msg"></span>
    <h4>2. ファイルを作る</h4><label>事業所番号（10桁）<input id="office_no" value="${esc(localStorage.getItem('leo_office_no') || (DEMO ? '9999999999' : ''))}" size="12"></label>
    <button onclick="makeCsv()">請求CSVを作る（J111・J611）</button><div id="csv_out"></div>`;
};
async function saveKids() {
  const rows = [...document.querySelectorAll('tr.kid')].map(tr => { const o = {}; tr.querySelectorAll('[data-f]').forEach(i => o[i.dataset.f] = i.type === 'checkbox' ? i.checked : i.value.trim()); return o; }).filter(o => o.name);
  const m = $('kd_msg'), bad = rows.find(r => !/^\d{10}$/.test(r.jukyusha_no) || !/^\d{6}$/.test(r.city_no));
  if (bad) { m.textContent = `${bad.name}：受給者証番号は10桁・市町村番号は6桁の数字で入れてください。`; return; }
  rows.forEach(r => { r.cap_monthly = +r.cap_monthly; r.contract_days = r.contract_days ? +r.contract_days : null; r.contract_start = r.contract_start || null; });
  if (DEMO) { m.textContent = '見本モードなので保存しません。'; return; }
  try { await sb('leo_children?on_conflict=name', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows) }); m.textContent = '保存しました。'; }
  catch (e) { m.textContent = e.message; }
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
    kids.forEach(k => K[k.name] = { ...k, contract_start: (k.contract_start || '').replace(/-/g, '') });
    const recs = nikki.map(n => { const f = F[n.day + n.child] || {}; return { day: n.day, child: n.child, status: n.kind === '欠席' ? '欠席' : '出席', start: n.start_time, end: n.end_time,
      pick: isTrip(n.pick_driver), drop: isTrip(n.drop_driver), holiday: f.holiday, absent_support: f.absent_support, kosodate: f.kosodate }; });
    const ym = BILL_MONTH.replace('-', ''), r = LeoBilling.build(ym, office, K, recs);
    const nm = [...new Set(nikki.map(n => n.child))].filter(n => !K[n]);
    const file = (rows, name) => { const b = new Blob([new Uint8Array(Encoding.convert(Encoding.stringToCode(LeoBilling.toCsv(rows)), { to: 'SJIS', from: 'UNICODE' }))], { type: 'text/csv' });
      return `<a class="card" style="display:inline-block" href="${URL.createObjectURL(b)}" download="${name}">⬇ ${name}</a>`; };
    const yen = n => n.toLocaleString('ja-JP');
    out.innerHTML = `${file(r.claim, `J111${ym.slice(2)}.CSV`)} ${file(r.jisseki, `J611${ym.slice(2)}.CSV`)}
      <table class="tbl"><tr><th>児童</th><th>利用日数</th><th>送迎(片道)</th><th>単位</th><th>費用</th><th>利用者負担</th><th>給付費</th></tr>${r.bills.map(b => `<tr><td>${esc(b.name)}</td><td>${b.use}</td><td>${b.trips}</td><td>${yen(b.units)}</td><td>${yen(b.cost)}</td><td>${yen(b.burden)}</td><td>${yen(b.benefit)}</td></tr>`).join('')}</table>
      ${[...nm.map(n => `${n}：マスタがないので入れていません`), ...r.warn].map(w => `<p class="note" style="color:#c00">⚠ ${esc(w)}</p>`).join('')}
      <p class="note">作ったファイルは、取込送信ソフトで読み込んで、エラーと金額を確かめてください（送信はまだしないでください）。</p>`; }
  catch (e) { out.textContent = e.message; }
}
