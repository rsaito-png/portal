// 日誌で欠席（加算対応）を書いて足す。node tools/leo_absent_nikki_test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const leo = read('leo.js');
const sql = read('supabase/leo_add_kesseki.sql');
const html = read('index.html');

function between(src, a, b) {
  const i = src.indexOf(a);
  const j = src.indexOf(b, i + a.length);
  assert.ok(i >= 0 && j > i, a + ' .. ' + b);
  return src.slice(i, j);
}

const nikkiFn = between(leo, 'async nikki()', 'async jisseki()');
const diaryFn = between(leo, 'LEO_VIEWS.diary = async function', 'async function saveDiary');
const saveFn = between(leo, 'async function saveNikki()', 'async function renderLeoView');
assert.ok(nikkiFn.includes("r.kind === '利用' || r.kind === '欠席'"));
assert.ok(nikkiFn.includes('leoAbsCardHtml'));
assert.ok(nikkiFn.includes('leoAbsAddHtml'));
assert.ok(!nikkiFn.includes('請求の印'));
assert.ok(!diaryFn.includes('請求の印'));
assert.ok(diaryFn.includes("r.kind === '欠席'"));
assert.ok(diaryFn.includes('leoAbsAddHtml'));
assert.ok(diaryFn.includes('leoMealBox(k, meals[leoMealNorm(k)], r, false)'));
assert.ok(saveFn.includes('leoAbsError'));
assert.ok(saveFn.includes('leoSaveAbsFlags'));
assert.ok(saveFn.includes("i.dataset.kind === 'abs'"));
assert.ok(leo.includes('rpc/leo_add_kesseki'));
assert.ok(sql.includes("title,"));
assert.ok(sql.includes('欠席（欠席時対応加算）'));
assert.ok(sql.includes('leo_record_day'));
assert.ok(sql.includes('leo_jisseki_from_nikki'));
assert.ok(sql.includes("kind = '欠席'"));
assert.ok(!sql.includes("'キャンセル'"), 'この関数はキャンセルを作らない');
assert.ok(sql.includes('leo_day_flags_absent_note_required'));
assert.ok(html.includes('leo.js?v=20261103extra'));

const sandbox = {
  DEMO: true,
  console,
  ROLE: '職員',
  DUTY: '現場支援員',
  C: { supabaseUrl: 'http://example.test', supabaseKey: 'x' },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  location: { origin: 'http://localhost', pathname: '/', hash: '#leo/nikki', search: '?demo=1' },
  navigator: { clipboard: { writeText: async () => {} } },
  document: {
    getElementById: () => null,
    addEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    body: { classList: { toggle() {} } },
  },
  fetch: async () => { throw new Error('no fetch'); },
  setInterval() { return 0; },
  setTimeout() { return 0; },
  clearTimeout() {},
  btoa,
  atob,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.$ = id => sandbox.document.getElementById(id);
vm.createContext(sandbox);
vm.runInContext(read('leo_left.js'), sandbox, { filename: 'leo_left.js' });
vm.runInContext(read('leo_driver.js'), sandbox, { filename: 'leo_driver.js' });
vm.runInContext(read('leo_meal.js'), sandbox, { filename: 'leo_meal.js' });
vm.runInContext(leo, sandbox, { filename: 'leo.js' });

async function main() {
const nikkiHtml = await vm.runInContext('LEO_VIEWS.nikki()', sandbox);
assert.ok(nikkiHtml.includes('児童D'), '見本の欠席児童が出る');
assert.ok(nikkiHtml.includes('加算対応をした'));
assert.ok(nikkiHtml.includes('checked'));
assert.ok(nikkiHtml.includes('（見本）母より発熱の連絡'));
assert.ok(nikkiHtml.includes('欠席（加算対応）を追加'));
assert.ok(nikkiHtml.includes('児童A'), '利用の子も出る');
assert.ok(!nikkiHtml.includes('請求の印'));
const selAt = nikkiHtml.indexOf('id="nk_abs_child"');
assert.ok(selAt > 0, '追加の児童欄がある');
const select = nikkiHtml.slice(selAt, nikkiHtml.indexOf('</select>', selAt) + 9);
assert.ok(select.includes('児童A') && select.includes('児童C'));
assert.ok(!select.includes('児童D'), 'すでに欠席の子は追加欄に出さない');
assert.ok(!select.includes('児童B'), '退所した子は追加欄に出さない');

const diaryHtml = await vm.runInContext('LEO_VIEWS.diary()', sandbox);
assert.ok(diaryHtml.includes('児童D') && diaryHtml.includes('加算対応をした'));
assert.ok(diaryHtml.includes('saveAbsDiary(this)'));
assert.ok(diaryHtml.includes('id="dr_abs_child"'));
assert.ok(diaryHtml.includes('児童A') && diaryHtml.includes('下書き'));
assert.ok(!diaryHtml.includes('請求の印'));

assert.strictEqual(sandbox.leoAbsError([{ child: '児童A', absent_support: true, absent_note: '  ' }]),
  '児童Aさん：加算対応をしたときは、連絡した相手と話した内容を書いてください。');
assert.strictEqual(sandbox.leoAbsError([{ child: '児童A', absent_support: false, absent_note: '' }]), '');
assert.strictEqual(sandbox.leoAbsError([{ child: '児童A', absent_support: true, absent_note: '母へ連絡' }]), '');

const calls = [];
sandbox.DEMO = false;
sandbox.sb = async (p, opt = {}) => {
  calls.push({ path: p, method: opt.method || 'GET', body: opt.body || '' });
  return null;
};
sandbox.renderLeoView = async () => { calls.push({ path: 'render', method: 'VIEW' }); };
const els = {
  nk_abs_msg: { textContent: '' },
  nk_abs_child: { value: '児童A' },
  nk_abs_contact: { value: '2026-11-02' },
};
sandbox.document.getElementById = id => els[id] || null;
await sandbox.leoAddKesseki('nk', '2026-11-02');
const add = calls.find(c => c.path === 'rpc/leo_add_kesseki');
assert.ok(add && add.method === 'POST');
assert.deepStrictEqual(JSON.parse(add.body), { p_day: '2026-11-02', p_child: '児童A', p_contact: '2026-11-02' });
assert.ok(calls.some(c => c.path === 'render'));

calls.length = 0;
els.nk_abs_contact.value = '2026-11-03';
await sandbox.leoAddKesseki('nk', '2026-11-02');
assert.ok(!calls.some(c => c.path === 'rpc/leo_add_kesseki'));
assert.ok(els.nk_abs_msg.textContent.includes('後にはできません'));

const saved = { textContent: '' };
const note = { value: '   ', dataset: { kind: 'abs' } };
const box = { checked: true, dataset: { kind: 'abs' }, value: '' };
const card = {
  getAttribute: k => (k === 'data-child' ? '児童A' : ''),
  querySelector: sel => (sel.includes('absent_support') ? box : note),
  querySelectorAll: () => [],
};
const view = {
  querySelectorAll: sel => (sel === '[data-abs="1"]' ? [card] : []),
};
sandbox.document.getElementById = id => (id === 'view' || id === 'saved' ? (id === 'saved' ? saved : view) : null);
sandbox.document.querySelectorAll = () => [];
await sandbox.saveNikki();
assert.ok(saved.textContent.includes('話した内容'));
assert.ok(!calls.some(c => String(c.path).includes('leo_day_flags')));

note.value = '母より発熱。次は金曜。';
box.checked = true;
calls.length = 0;
await sandbox.saveNikki();
const flag = calls.find(c => c.path.includes('leo_day_flags'));
assert.ok(flag, '欠席時対応を leo_day_flags に保存する');
const body = JSON.parse(flag.body);
assert.strictEqual(body[0].child, '児童A');
assert.strictEqual(body[0].absent_support, true);
assert.strictEqual(body[0].absent_note, '母より発熱。次は金曜。');
assert.ok(saved.textContent.includes('欠席時対応を保存しました'));

const absMsg = { textContent: '' };
const selfCard = {
  matches: sel => sel === '[data-abs="1"]',
  getAttribute: () => '児童D',
  querySelector(sel) {
    if (String(sel).includes('absent_support')) return { checked: true };
    if (String(sel).includes('absent_note')) return { value: '母へ連絡した' };
    if (sel === '.abs_msg') return absMsg;
    return null;
  },
  querySelectorAll: () => [],
};
const one = sandbox.leoReadAbs(selfCard);
assert.strictEqual(one.length, 1);
assert.strictEqual(one[0].absent_note, '母へ連絡した');
sandbox.DEMO = true;
await sandbox.saveAbsDiary({ closest: () => selfCard });
assert.strictEqual(absMsg.textContent, '見本モードなので保存しません。');

console.log('leo_absent_nikki_test: ok');
}

main().catch(err => { console.error(err); process.exit(1); });
