// 現場職員が #leo/kata で型表と送迎の配慮を直し、管理表・配置表は児発管側のまま。
// node tools/leo_kata_edit_test.js
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
  C: { supabaseUrl: 'http://example.test', supabaseKey: 'x' },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  location: { origin: 'http://localhost', pathname: '/', hash: '#leo/kata', search: '?demo=1' },
  navigator: { clipboard: { writeText: async () => {} } },
  document: { getElementById: () => null, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], body: { classList: { toggle() {}, add() {}, remove() {} } } },
  fetch: async () => { throw new Error('no fetch'); },
  setInterval() { return 0; },
  setTimeout() { return 0; },
  clearTimeout() {},
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
const msg = { textContent: '' };
sandbox.$ = id => (id === 'ms_msg' ? msg : { textContent: '', value: '', style: {} });
vm.createContext(sandbox);
vm.runInContext(read('leo_left.js'), sandbox, { filename: 'leo_left.js' });
vm.runInContext(read('leo.js'), sandbox, { filename: 'leo.js' });

const run = src => vm.runInContext(src, sandbox);
const kata = () => run('LEO_VIEWS.kata()');
const master = () => run('LEO_VIEWS.master()');

(async () => {
  let html = await kata();
  assert.ok(html.includes('<h3>送迎 型表</h3>'), '見出し');
  assert.ok(!html.includes('見るだけ'), '見るだけをやめている');
  assert.ok(html.includes('ポータルに保存した型表が正') || html.includes('ポータルの型表が正'), 'ポータルが正');
  assert.ok(html.includes('onclick="addMasterRow()"'), '行を足せる');
  assert.ok(html.includes('onclick="saveMaster()"'), '保存できる');
  assert.ok(html.includes('data-c="児童名"'), '列名で保存する');
  assert.ok(html.includes('value="児童A"'), '見本の行が出る');
  assert.ok(html.includes('送迎の配慮（児童ごと）'), '配慮のタブ');
  assert.ok(html.includes("renderLeoView('kata')"), 'タブは型表の画面に留まる');
  assert.ok(!html.includes('個別支援計画 管理表'), '管理表のタブは出さない');
  assert.ok(!html.includes('職員配置表'), '配置表のタブは出さない');
  assert.ok(!html.includes('この画面は児発管'), '現場支援員でも開く');

  run("MASTER_KIND = 'care'");
  html = await kata();
  assert.ok(html.includes('<h3>送迎の配慮</h3>'));
  assert.ok(html.includes('onclick="saveCare()"'));
  assert.ok(html.includes('レオの職員が直せます'));
  assert.ok(html.includes('data-c="児童A"'));
  assert.ok(html.includes('助手席の後ろ'));

  run("MASTER_KIND = 'keikaku'");
  html = await kata();
  assert.strictEqual(run('MASTER_KIND'), 'kata', '管理表の選択は型表画面に持ち込まない');
  assert.ok(html.includes('onclick="saveMaster()"'));
  assert.ok(!html.includes('個別支援計画'));

  html = await master();
  assert.ok(html.includes('この画面は児発管・管理者・事務だけです。'), '入力画面は児発管側のまま');

  run("DUTY = '児発管'");
  run("MASTER_KIND = 'haichi'");
  html = await master();
  assert.ok(html.includes('職員配置表'), '児発管は配置表も開ける');
  assert.ok(html.includes('個別支援計画 管理表'));
  assert.ok(html.includes("renderLeoView('master')"));

  run("MASTER_KIND = 'kata'");
  msg.textContent = '';
  const calls = [];
  sandbox.document.querySelectorAll = sel => {
    if (sel !== 'tr.mrow') return [];
    return [{
      querySelectorAll: s => (String(s).includes('input') ? [
        { dataset: { c: '曜日' }, value: ' 木 ' },
        { dataset: { c: '児童名' }, value: '児童Z' },
        { dataset: { c: '迎え場所' }, value: '' },
      ] : []),
    }];
  };
  sandbox.DEMO = true;
  await run('saveMaster()');
  assert.ok(msg.textContent.includes('見本モードなので保存しません（1行）'), msg.textContent);
  sandbox.sb = async () => { throw new Error('見本で保存先を呼ばない'); };
  await run('saveMaster()');

  sandbox.DEMO = false;
  sandbox.sb = async (p, opt = {}) => {
    calls.push({ path: p, method: opt.method || 'GET', body: opt.body || '' });
    return null;
  };
  msg.textContent = '';
  await run('saveMaster()');
  assert.strictEqual(calls.length, 3);
  assert.ok(calls[0].path.startsWith('leo_master?kind=eq.kata') && calls[0].method === 'DELETE');
  const body = JSON.parse(calls[1].body);
  assert.deepStrictEqual(body, [{ kind: 'kata', row_no: 1, data: { 曜日: '木', 児童名: '児童Z' } }]);
  assert.ok(calls[2].path.includes('rpc/leo_kata_apply') && calls[2].method === 'POST');
  assert.ok(msg.textContent.includes('1行を保存') && msg.textContent.includes('今日以降の予定に反映'));

  run("MASTER_KIND = 'keikaku'");
  calls.length = 0;
  sandbox.document.querySelectorAll = sel => (sel === 'tr.mrow' ? [{
    querySelectorAll: () => [{ dataset: { c: '児童名' }, value: '児童A' }],
  }] : []);
  await run('saveMaster()');
  assert.ok(calls[0].path.includes('kind=eq.keikaku'), '児発管の管理表は今までどおり kind で保存');
  assert.ok(!calls[0].path.includes('kind=eq.kata'));

  const sql = read('supabase/leo_kata_staff.sql');
  const plan = read('supabase/leo_plan.sql');
  for (const src of [sql, plan]) {
    assert.ok(src.includes("public.my_office() = 'レオ' and kind = 'kata'"), '型表の書き込みはレオ所属');
    assert.ok(src.includes("public.my_office() = 'レオ' or public.can_manage()"), '配慮の書き込みはレオ所属');
    assert.ok(!/lm_write[\s\S]{0,180}using \(public\.can_manage\(\)\)/.test(src), '型表の書き込みが can_manage だけに戻っていない');
  }
  assert.ok(sql.includes('keikaku') && sql.includes('haichi'));
  assert.ok(plan.includes('create policy lm_read'));

  console.log('leo_kata_edit_test ok');
})().catch(e => { console.error(e); process.exit(1); });
