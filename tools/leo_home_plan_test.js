// 今日やることの個別支援計画は、個別支援計画（管理）と同じ進み具合から出す。
// node tools/leo_home_plan_test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const sandbox = {
  DEMO: true,
  console,
  ROLE: '職員',
  DUTY: '児発管',
  C: { supabaseUrl: 'http://example.test', supabaseKey: 'x' },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  location: { origin: 'http://localhost', pathname: '/', hash: '#leo/home', search: '?demo=1&duty=児発管' },
  navigator: { clipboard: { writeText: async () => {} } },
  document: { getElementById: () => null, addEventListener() {}, querySelector: () => null, body: { classList: { toggle() {} }, appendChild() {}, removeChild() {} } },
  fetch: async () => { throw new Error('no fetch'); },
  setInterval() { return 0; },
  setTimeout() { return 0; },
  clearTimeout() {},
  btoa,
  atob,
  URLSearchParams,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.$ = () => ({ textContent: '', style: {}, value: '', innerHTML: '' });
vm.createContext(sandbox);
vm.runInContext(read('leo_left.js'), sandbox, { filename: 'leo_left.js' });
vm.runInContext(read('gl.js'), sandbox, { filename: 'gl.js' });
vm.runInContext(read('leo.js') + '\nthis.__leo = { LEO_VIEWS, planData, loadLeftIndex, today, planChildStatus, planHomeTodos, planUrgencyLabel, setDuty(v) { DUTY = v; } };', sandbox, { filename: 'leo.js' });

const plain = v => JSON.parse(JSON.stringify(v));
const planChildStatus = sandbox.__leo.planChildStatus;
const planHomeTodos = sandbox.__leo.planHomeTodos;
const planUrgencyLabel = sandbox.__leo.planUrgencyLabel;
const leftIndex = vm.runInContext('leftIndex', sandbox);
const tday = '2026-11-02';
const t = new Date(tday + 'T00:00:00+09:00');

function pack(rows, plans, staff, sends) {
  return { rows, plans: plans || [], mon: [], staff: staff || [], sends: sends || [] };
}
const docs = { genan: '原案', honan: '本案', assessment: 'アセス', kaigi: '会議', plan_made: true, genan_consent_at: '2026-10-20T00:00:00+09:00', honan_consent_at: null };

// 本案の同意を送って3日、開始月は過ぎている
{
  const row = { 児童名: '児童E', 現在の期: '2期', 次期開始月: '2026年11月', フォーム回答日: '2026/10/01', _track: { period_to: '2026-10-31' } };
  const D0 = pack([row], [{ id: 9, child: '児童E', term_no: 3, ...docs }], [{ child: '児童E', term: '第3期', text: '見本', submitted_at: '2026-10-02' }],
    [{ kind: 'doui', child: '児童E', term: '第3期', plan_id: 9, doc: '本案', sent_at: '2026-10-30T10:00:00+09:00', via: 'ポータル' }]);
  const s = planChildStatus(row, D0, {}, tday, t);
  assert.strictEqual(s.st, 6);
  assert.strictEqual(s.act, '本案の同意の返事待ち（3日経過）');
  assert.strictEqual(planUrgencyLabel(s.flags), '開始月を過ぎています');
  assert.ok(s.flags.over && s.flags.urgent);
  const todos = plain(planHomeTodos(D0, {}, tday, t));
  assert.strictEqual(todos.length, 1);
  assert.deepStrictEqual(todos[0], [0, '📝', '児童Eさん　本案の同意の返事待ち（3日経過）', '#leo/plan', '開始月を過ぎています']);
}

// 本案まで終わった子は出さない
{
  const row = { 児童名: '児童E', 現在の期: '2期', 次期開始月: '2026年11月', フォーム回答日: '2026/10/01', _track: { period_to: '2026-10-31' } };
  const D0 = pack([row], [{ id: 9, child: '児童E', term_no: 3, ...docs, honan_consent_at: '2026-10-31T00:00:00+09:00' }],
    [{ child: '児童E', term: '第3期', text: '見本', submitted_at: '2026-10-02' }]);
  const s = planChildStatus(row, D0, {}, tday, t);
  assert.strictEqual(s.st, 7);
  assert.strictEqual(s.act, '✅ 本案の同意まで済み。いまやることはありません');
  assert.deepStrictEqual(plain(planHomeTodos(D0, {}, tday, t)), []);
}

// 退所した子は出さない（left_on の翌日以降）
{
  const row = { 児童名: '児童E', 現在の期: '2期', 次期開始月: '2026年11月', フォーム回答日: '', _track: { period_to: '2026-10-31' } };
  const D0 = pack([row]);
  const LEFT = leftIndex([{ name: '児童E', left_on: '2026-10-31' }]);
  const s = planChildStatus(row, D0, LEFT, tday, t);
  assert.strictEqual(s.gone, true);
  assert.ok(s.act.startsWith('退所（'));
  assert.deepStrictEqual(plain(planHomeTodos(D0, LEFT, tday, t)), []);
}

// 次の計画が退所日よりあとに始まる子は出さない
{
  const row = { 児童名: '児童E', 現在の期: '2期', 次期開始月: '2026年11月', フォーム回答日: '2026/10/01', _track: { period_to: '2026-09-30' } };
  const D0 = pack([row]);
  const LEFT = leftIndex([{ name: '児童E', left_on: '2026-10-15' }]);
  const day = '2026-10-01', now = new Date(day + 'T00:00:00+09:00');
  const s = planChildStatus(row, D0, LEFT, day, now);
  assert.strictEqual(s.gone, false);
  assert.strictEqual(s.leavingBeforeNext, true);
  assert.deepStrictEqual(plain(planHomeTodos(D0, LEFT, day, now)), []);
}

// いま急ぎではない子（開始が先で、回答も返事待ちもない）は出さない
{
  const row = { 児童名: '児童F', 現在の期: '1期', 次期開始月: '2027年4月', フォーム回答日: '', _track: { period_to: '2027-03-31' } };
  const D0 = pack([row]);
  const s = planChildStatus(row, D0, {}, tday, t);
  assert.strictEqual(s.st, 0);
  assert.strictEqual(s.flags.urgent, false);
  assert.deepStrictEqual(plain(planHomeTodos(D0, {}, tday, t)), []);
}

// 今の計画期間だけ過ぎている子は、開始月より先でも先頭（赤）
{
  const row = { 児童名: '児童G', 現在の期: '1期', 次期開始月: '2027年1月', フォーム回答日: '', _track: { period_to: '2026-06-30' } };
  const D0 = pack([row]);
  const s = planChildStatus(row, D0, {}, tday, t);
  assert.strictEqual(s.act, '保護者アンケートのリンクを送る');
  assert.strictEqual(s.flags.startPast, false);
  assert.strictEqual(planUrgencyLabel(s.flags), '今の計画期間を過ぎています');
  const todos = planHomeTodos(D0, {}, tday, t);
  assert.strictEqual(todos[0][0], 0);
  assert.strictEqual(todos[0][4], '今の計画期間を過ぎています');
}

// 開始月を過ぎているものが、過ぎていない急ぎより先
{
  const over = { 児童名: '児童E', 現在の期: '2期', 次期開始月: '2026年11月', フォーム回答日: '2026/10/01', _track: { period_to: '2026-10-31' } };
  const soon = { 児童名: '児童H', 現在の期: '1期', 次期開始月: '2027年4月', フォーム回答日: '2026/10/01', _track: { period_to: '2027-03-31' } };
  const D0 = pack([soon, over], [{ id: 9, child: '児童E', term_no: 3, ...docs }],
    [{ child: '児童E', term: '第3期', text: '見本', submitted_at: '2026-10-02' }, { child: '児童H', term: '第2期', text: '見本', submitted_at: '2026-10-02' }],
    [{ kind: 'doui', child: '児童E', plan_id: 9, doc: '本案', sent_at: '2026-10-30T10:00:00+09:00', via: 'ポータル' }]);
  const todos = planHomeTodos(D0, {}, tday, t);
  todos.sort((a, b) => a[0] - b[0]);
  assert.ok(todos[0][2].includes('児童Eさん　本案の同意の返事待ち（3日経過）'));
  assert.strictEqual(todos[0][4], '開始月を過ぎています');
  assert.ok(todos[1][2].startsWith('児童Hさん　'));
  assert.ok(todos[0][0] < todos[1][0]);
  assert.strictEqual(todos[1][3], '#leo/plan');
}

// 担当者会議の文面は管理画面と同じ
{
  const row = { 児童名: '児童E', 現在の期: '2期', 次期開始月: '2027年4月', フォーム回答日: '2026/10/01', _track: { period_to: '2027-03-31' } };
  const D0 = pack([row], [{ id: 3, child: '児童E', term_no: 3, ...docs }], [{ child: '児童E', term: '第3期', text: '見本', submitted_at: '2026-10-02' }]);
  const s = planChildStatus(row, D0, {}, tday, t);
  assert.strictEqual(s.st, 5);
  assert.match(s.act, /^担当者会議を行う（.+）。終わったら本案を送る$/);
  const todos = planHomeTodos(D0, {}, tday, t);
  assert.strictEqual(todos[0][2], '児童Eさん　' + s.act);
  assert.strictEqual(todos[0][0], 1);
}

// 見本データでも、管理画面の次の行動と今日やることが一致する。退所の児童B・児童Dは出さない。
(async () => {
  const day = sandbox.__leo.today();
  const now = new Date(day + 'T00:00:00+09:00');
  const D0 = await sandbox.__leo.planData();
  const LEFT = await sandbox.__leo.loadLeftIndex();
  const todos = planHomeTodos(D0, LEFT, day, now);
  const names = todos.map(x => x[2]);
  assert.ok(todos.every(x => x[3] === '#leo/plan'));
  assert.ok(todos.filter(x => x[4] === '開始月を過ぎています' || x[4] === '今の計画期間を過ぎています').every(x => x[0] === 0));
  assert.ok(!names.some(x => x.includes('児童B')), '退所の児童B');
  assert.ok(!names.some(x => x.includes('児童D')), '退所の児童D');
  for (const r of D0.rows) {
    const s = planChildStatus(r, D0, LEFT, day, now);
    const hit = todos.find(x => x[2].startsWith(s.name + 'さん'));
    if (s.gone || s.leavingBeforeNext || s.st >= 7 || !s.flags.urgent) assert.strictEqual(hit, undefined, s.name);
    else {
      assert.ok(hit, s.name);
      assert.strictEqual(hit[2], s.name + 'さん　' + s.act);
      assert.strictEqual(hit[4], planUrgencyLabel(s.flags) || '個別支援計画（管理）');
    }
  }
  if (day === '2026-11-02') {
    assert.ok(names.some(x => x === '児童Aさん　保護者アンケートのリンクを送る'), names.join(' / '));
    assert.ok(names.some(x => x === '児童Cさん　職員モニタリングを作る'), names.join(' / '));
  }
  sandbox.__leo.setDuty('児発管');
  const home = await sandbox.__leo.LEO_VIEWS.home();
  const plan = await sandbox.__leo.LEO_VIEWS.plan();
  for (const item of todos) {
    assert.ok(home.includes(item[2]), item[2]);
    assert.ok(plan.includes(item[2].split('　')[1]), item[2]);
  }
  assert.ok(home.includes('href="#leo/plan"'));
  assert.ok(!home.includes('#leo/keikaku'));
  assert.ok(!home.includes('さんの計画の更新'));
  assert.ok(home.includes('ヒヤリハットの確認'));
  assert.ok(home.includes('#leo/hiyari'));
  assert.ok(home.includes('保護者の実績確認がまだ 1家庭（見本）'));
  assert.ok(home.includes('#leo/kakunin'));
  assert.ok(home.includes('日誌の直しが反映できなかったもの'));
  assert.ok(home.includes('#leo/edits'));
  const overdue = todos.find(x => x[0] === 0);
  if (overdue) {
    const homePos = home.indexOf(overdue[2]);
    const hyPos = home.indexOf('ヒヤリハットの確認');
    assert.ok(homePos >= 0 && homePos < hyPos, '期限を過ぎた計画がヒヤリハットより先');
  }
  assert.ok(plan.includes('height:8px'));
  const bAt = plan.indexOf('<b>児童B</b>');
  const bSlice = plan.slice(bAt, plan.indexOf('くわしく見る', bAt));
  assert.ok(bSlice.includes('退所（'), '退所のカードは退所の文');
  assert.ok(!bSlice.includes('<button'), '退所のカードの表にはボタンを出さない');
  assert.ok(read('leo.js').includes('async keikaku()'));
  assert.ok(read('leo.js').includes("sheetRows('keikaku')"));
  const homeFn = read('leo.js').slice(read('leo.js').indexOf('LEO_VIEWS.home = async function'), read('leo.js').indexOf('async function leoRecordDay'));
  assert.ok(!homeFn.includes("sheetRows('keikaku')"));
  assert.ok(!homeFn.includes('#leo/keikaku'));
  assert.ok(homeFn.includes('planHomeTodos'));
  assert.ok(read('index.html').includes('leo.js?v=20261112abs'));
  console.log('leo_home_plan_test ok');
})().catch(e => { console.error(e); process.exit(1); });
