// 受給者証の期限。今日やること（#leo/home。中村友香担当から開く画面）に出す。node tools/leo_cert_todo_test.js
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
  history: { replaceState(_a, _b, url) { sandbox.location.hash = String(url).split('#').pop() ? '#' + String(url).split('#').pop() : ''; sandbox.__replaced = url; } },
  navigator: { clipboard: { writeText: async () => {} } },
  document: { getElementById: () => null, addEventListener() {}, querySelector: () => null, body: { classList: { toggle() {} }, appendChild() {}, removeChild() {} } },
  fetch: async () => { throw new Error('no fetch'); },
  setInterval() { return 0; },
  setTimeout() { return 0; },
  clearTimeout() {},
  btoa, atob, URLSearchParams,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.$ = () => ({ textContent: '', style: {}, value: '', innerHTML: '' });
vm.createContext(sandbox);
vm.runInContext(read('leo_left.js'), sandbox, { filename: 'leo_left.js' });
vm.runInContext(read('gl.js'), sandbox, { filename: 'gl.js' });
vm.runInContext(read('leo.js') + '\nthis.__leo = { leoCertTodos, leoTodoItem, leoAddDays, leoUserinfoFromHash, LEO_VIEWS, UI };', sandbox, { filename: 'leo.js' });
const { leoCertTodos, leoTodoItem, leoAddDays, leoUserinfoFromHash, LEO_VIEWS, UI } = sandbox.__leo;
const leftIndex = vm.runInContext('leftIndex', sandbox);

const today = '2026-11-05';
const rows = [
  { name: '児童A', contract_end: '2026-11-12' },
  { name: '児童遠', contract_end: '2026-11-13' },
  { name: '児童C', contract_end: '2026-11-04' },
  { name: '児童今', contract_end: '2026-11-05' },
  { name: '児童B', contract_end: '2026-11-06' },
  { name: '児童空', contract_end: '' },
  { name: '児童決', valid_to: '2026-11-08' },
  { name: '児童上', cap_to: '2025-12-01' },
];
const LEFT = leftIndex([{ name: '児童B', left_on: '2026-10-31' }]);
const items = leoCertTodos(rows, LEFT, today);
const plain = items.map(x => String(x[2]).replace(/<[^>]*>/g, ''));
assert.ok(plain.includes('児童Aの受給者証が 11/12 で切れます'), plain.join(' | '));
assert.ok(plain.includes('児童今の受給者証が 11/5 で切れます'), '当日は切れる日として出す');
assert.ok(plain.includes('児童Cの受給者証が 11/4 で切れています'), plain.join(' | '));
assert.ok(plain.includes('児童決の支給決定が 11/8 で切れます'));
assert.ok(plain.includes('児童上の上限額管理が 2025/12/1 で切れています'));
assert.ok(!plain.some(s => s.includes('児童遠')), '8日先は出さない');
assert.ok(!plain.some(s => s.includes('児童B')), '退所した子は出さない');
assert.ok(!plain.some(s => s.includes('児童空')));
const over = items.find(x => String(x[2]).includes('児童C'));
assert.strictEqual(over[0], 0, '過ぎたものは赤い急の列');
assert.ok(String(over[2]).includes('color:#d33'));
const soon = items.find(x => String(x[2]).includes('児童A'));
assert.strictEqual(soon[0], 1);
assert.ok(soon[3].includes('#leo/userinfo?child=') && soon[3].includes('tab=jukyusha'));
assert.ok(soon[4].includes(soon[3]) && soon[4].includes('href="#leo/jukyusha"'));
assert.ok(items.findIndex(x => String(x[2]).includes('児童C')) < items.findIndex(x => String(x[2]).includes('児童A')), '過ぎたものが先');

const gone = leoCertTodos([{ name: '児童A', contract_end: '2026-12-01' }], LEFT, today);
assert.strictEqual(gone.length, 0, '日付を先にすると消える');

const keys = items.map(x => leoTodoItem(x).key);
assert.strictEqual(new Set(keys).size, keys.length, '児童ごとに依頼の鍵を分ける');
assert.ok(keys.every(k => k.startsWith('leo:cert:')));

sandbox.location.hash = '#leo/userinfo?child=' + encodeURIComponent('児童 A') + '&tab=jukyusha';
leoUserinfoFromHash();
assert.strictEqual(UI.sel, '児童 A');
assert.strictEqual(UI.tab, 'jukyusha');
assert.strictEqual(UI.adding, false);
assert.ok(String(sandbox.__replaced).endsWith('#leo/userinfo'));

const cfg = read('config.js');
const idx = read('index.html');
assert.ok(cfg.includes("'今日やること（児発管）', '#leo/home'"));
const whoLine = cfg.split('\n').find(l => l.includes('who:') && l.includes('中村友香担当'));
const who = whoLine.slice(whoLine.indexOf('中村友香担当'), whoLine.indexOf('事務担当'));
assert.ok(!who.includes('今日やること（児発管）') && cfg.includes("todoTop: ''"), '今日やることはホーム最上段に1つだけ（中村の欄に重ねない）');
const homeFn = read('leo.js').slice(read('leo.js').indexOf('LEO_VIEWS.home = async function'), read('leo.js').indexOf('async function leoRecordDay'));
assert.ok(homeFn.includes('leoCertTodos'), '同じ今日やること画面に出す');
assert.ok(!/if \(canLeoHomeTodo\(\)\)[\s\S]{0,120}leoCertTodos/.test(homeFn), '中村が見る一覧を、依頼ボタンの人だけにしない');
assert.ok(/leo\.js\?v=/.test(idx));
assert.strictEqual(leoAddDays('2026-11-05', 7), '2026-11-12');
assert.strictEqual(typeof LEO_VIEWS.home, 'function');
sandbox.DUTY = '児発管';
sandbox.ROLE = '職員';
LEO_VIEWS.home().then(html => {
  assert.ok(html.includes('今日やること（児発管）'));
  assert.ok(html.includes('児童Aの受給者証が') && html.includes('で切れます'), '児発管の今日やることに出る');
  assert.ok(html.includes('児童Cの受給者証が') && html.includes('で切れています') && html.includes('color:#d33'));
  assert.ok(!html.includes('児童Bの受給者証'), '退所の見本は出さない');
  assert.ok(!html.includes('児童Dの受給者証'));
  assert.ok(html.includes('href="#leo/jukyusha"') && html.includes('tab=jukyusha'));
  console.log('leo_cert_todo_test ok');
}).catch(e => { console.error(e); process.exit(1); });
