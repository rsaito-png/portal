// レオの実データ画面（データは Supabase。ログイン職員でレオ所属の人だけ読める＝RLS）
// 見本モードでは下の DEMO_DATA（架空の児童A〜D）だけを使う
const DEMO_DATA = {
  me: '職員X',
  nikki: [
    { row_no: 9,  kind: '利用', child: '児童A', service: '放デイ', pick_driver: '職員X', pick_place: '〇〇小学校', pick_time: '14:30', pick_car: '1号車', start_time: '14:45', end_time: '17:00', drop_driver: '職員Y', drop_place: '自宅', drop_time: '17:15', drop_car: '2号車', meal: '', snack: 'あり' },
    { row_no: 10, kind: '利用', child: '児童B', service: '放デイ', pick_driver: '職員Y', pick_place: '△△小学校', pick_time: '14:40', pick_car: '2号車', start_time: '15:00', end_time: '17:30', drop_driver: '職員X', drop_place: '〇〇園', drop_time: '17:40', drop_car: '1号車', meal: '', snack: 'あり' },
    { row_no: 11, kind: '利用', child: '児童C', service: '児発', pick_driver: '送迎なし', pick_place: '', pick_time: '', pick_car: '', start_time: '10:00', end_time: '13:00', drop_driver: '送迎なし', drop_place: '', drop_time: '', drop_car: '', meal: 'あり', snack: '' },
    { row_no: 20, kind: '欠席', child: '児童D' },
  ],
  jisseki: [
    { day: '(今日)', child: '児童A', status: '未送付', start_time: '14:45', end_time: '17:00', source: '日誌' },
    { day: '(今日)', child: '児童B', status: '未送付', start_time: '15:00', end_time: '17:30', source: '日誌' },
    { day: '(昨日)', child: '児童C', status: '送付済み', start_time: '10:00', end_time: '13:00', source: '日誌' },
  ],
};
// 日誌で「直せる」項目（ポータルでは修正依頼として保存→確認後にGoogleの日誌へ反映）
const NIKKI_FIELDS = [['pick_place','迎え場所'],['pick_time','迎え時刻'],['pick_driver','迎え運転手'],['start_time','開始'],['end_time','終了'],
  ['drop_time','送り時刻'],['drop_driver','送り運転手'],['drop_place','送り場所'],['meal','食事'],['snack','おやつ']];

const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function sb(path, opt = {}) {
  const s = JSON.parse(localStorage.getItem('sess') || '{}');
  const r = await fetch(C.supabaseUrl + '/rest/v1/' + path, { ...opt,
    headers: { apikey: C.supabaseKey, Authorization: 'Bearer ' + s.token, 'Content-Type': 'application/json', ...(opt.headers || {}) } });
  if (!r.ok) throw new Error('読み込めませんでした（' + r.status + '）');
  return r.status === 204 || r.status === 201 ? null : r.json();
}
async function loadNikki() {
  if (DEMO) return DEMO_DATA.nikki;
  return sb(`leo_nikki?day=eq.${today()}&order=row_no`);
}
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
    const jobs = [];
    rows.filter(r => r.kind === '利用').forEach(r => {
      if (same(r.pick_driver, me)) jobs.push({ t: r.pick_time, k: '迎え', c: r.child, p: r.pick_place, car: r.pick_car });
      if (same(r.drop_driver, me)) jobs.push({ t: r.drop_time, k: '送り', c: r.child, p: r.drop_place, car: r.drop_car });
    });
    jobs.sort((a, b) => (a.t || '').localeCompare(b.t || ''));
    return `<h3>今日の送迎（${esc(me) || '名前未登録'} さんの担当）</h3>${demoNote()}` + (jobs.length
      ? `<table><tr><th>時刻</th><th></th><th>児童</th><th>場所</th><th>車</th></tr>${jobs.map(j =>
        `<tr><td>${esc(j.t)}</td><td>${j.k}</td><td>${esc(j.c)}</td><td>${esc(j.p)}</td><td>${esc(j.car)}</td></tr>`).join('')}</table>`
      : '<p>今日の担当はありません。</p>');
  },
  async kids() {
    const rows = await loadNikki();
    const use = rows.filter(r => r.kind === '利用'), abs = rows.filter(r => r.kind === '欠席');
    return `<h3>今日の利用児童（${use.length}人）</h3>${demoNote()}
      <table><tr><th>児童</th><th>サービス</th><th>時間</th><th>迎え</th><th>送り</th></tr>${use.map(r =>
      `<tr><td>${esc(r.child)}</td><td>${esc(r.service)}</td><td>${esc(r.start_time)}〜${esc(r.end_time)}</td><td>${esc(r.pick_place || r.pick_driver)}</td><td>${esc(r.drop_place || r.drop_driver)}</td></tr>`).join('')}</table>
      ${abs.length ? `<p>欠席：${abs.map(r => esc(r.child)).join('、')}</p>` : ''}`;
  },
  async nikki() {
    const rows = (await loadNikki()).filter(r => r.kind === '利用');
    return `<h3>今日の日誌（見る・直す）</h3>${demoNote()}<p class="note">直した内容は「修正依頼」として保存され、確認後に日誌へ反映されます。</p>` +
      rows.map(r => `<div class="card rec"><b>${esc(r.child)}</b>（${esc(r.service)}）
        ${NIKKI_FIELDS.map(([f, l]) => `<label>${l}<input data-row="${r.row_no}" data-f="${f}" data-old="${esc(r[f])}" value="${esc(r[f])}"></label>`).join('')}</div>`).join('') +
      `<button onclick="saveNikki()">直した所を送る</button><div id="saved"></div>`;
  },
  async jisseki() {
    const rows = DEMO ? DEMO_DATA.jisseki : await sb('leo_jisseki?order=day.desc,child&limit=200');
    return `<h3>実績記録（見る・直す）</h3>${demoNote()}<p class="note">利用料・加算などの請求の項目はここには出しません。</p>
      <table><tr><th>日付</th><th>児童</th><th>状況</th><th>時間</th></tr>${rows.map(r =>
      `<tr><td>${esc(r.day)}</td><td>${esc(r.child)}</td><td>${esc(r.status)}</td><td>${esc(r.start_time)}〜${esc(r.end_time)}</td></tr>`).join('')}</table>
      <p class="note">直したいときは日誌側で直すと、夜の転記で実績にも入ります。</p>`;
  },
};

async function saveNikki() {
  const ch = [...document.querySelectorAll('.rec input')].filter(i => i.value !== i.dataset.old)
    .map(i => ({ target: 'nikki', day: today(), row_key: i.dataset.row, field: i.dataset.f, old_value: i.dataset.old, new_value: i.value }));
  if (!ch.length) { $('saved').textContent = '変更はありません。'; return; }
  if (DEMO) { $('saved').textContent = `見本モードなので保存しません（${ch.length}件の修正）。`; return; }
  try { await sb('leo_edits', { method: 'POST', body: JSON.stringify(ch), headers: { Prefer: 'return=minimal' } });
    $('saved').textContent = `${ch.length}件の修正依頼を送りました。`; ch.forEach(() => {}); }
  catch (e) { $('saved').textContent = e.message; }
}

async function renderLeoView(name) {
  $('view').innerHTML = '<p>読み込み中…</p>';
  try { $('view').innerHTML = `<button class="back" onclick="location.hash='leo'">← レオへ</button>` + await LEO_VIEWS[name](); }
  catch (e) { $('view').innerHTML = `<button class="back" onclick="location.hash='leo'">← レオへ</button><p>${esc(e.message)}</p>`; }
}
