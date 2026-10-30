// myName()/loadDuty() は staff_profiles を「ログイン中の自分の行」に絞る。node tools/leo_myname_test.js
// 事務は RLS で全員の行が読めるため、絞らないと先頭の他人の行（例: 安藤）を自分の名前にしてしまう。
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const UID = '11111111-2222-3333-4444-555555555555';
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const mkSandbox = (sess, demo) => {
  const sb = {
    DEMO: !!demo, console, ROLE: '',
    C: { supabaseUrl: 'http://example.test', supabaseKey: 'x' },
    localStorage: { getItem: k => (k === 'sess' ? sess : null), setItem() {}, removeItem() {} },
    location: { origin: 'http://localhost', pathname: '/', hash: '#leo', search: '' },
    navigator: { clipboard: { writeText: async () => {} } },
    document: { getElementById: () => null, addEventListener() {}, querySelector: () => null },
    fetch: async () => { throw new Error('no fetch'); },
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    setInterval() { return 0; }, setTimeout() { return 0; }, clearTimeout() {},
  };
  sb.window = sb; sb.globalThis = sb; sb.$ = () => ({ textContent: '', style: {}, value: '' });
  vm.createContext(sb);
  vm.runInContext(read('leo_left.js'), sb); vm.runInContext(read('leo_driver.js'), sb); vm.runInContext(read('leo.js'), sb);
  return sb;
};
const jwt = payload => 'h.' + b64(payload) + '.s';
// 全員分の行を返す DB（事務の見え方）。user_id=eq. があればその行だけ返す。
const ROWS = [
  { user_id: 'aaaaaaaa-0000-0000-0000-000000000001', nikki_name: '安藤　尚子', duty: '管理者' },
  { user_id: UID, nikki_name: '宮本　幸子', duty: '事務' },
];
const fakeSb = calls => async path => {
  calls.push(String(path));
  const m = String(path).match(/user_id=eq\.([^&]+)/);
  return m ? ROWS.filter(r => r.user_id === m[1]) : ROWS;
};
(async () => {
  // ログイン中: 自分の行に絞る
  let sbx = mkSandbox(JSON.stringify({ token: jwt({ sub: UID }) }));
  let calls = []; vm.runInContext('sb = ' + 'globalThis.__sb', Object.assign(sbx, { __sb: fakeSb(calls) }));
  assert.strictEqual(await vm.runInContext('myName()', sbx), '宮本　幸子');
  assert.ok(calls[0].includes('user_id=eq.' + UID) && calls[0].includes('select=nikki_name'), calls[0]);
  assert.strictEqual(await vm.runInContext('loadDuty().then(() => DUTY)', sbx), '事務');
  assert.ok(calls[1].includes('user_id=eq.' + UID) && calls[1].includes('select=duty'), calls[1]);
  // 自分の行が無いときは先頭の他人にフォールバックしない
  sbx = mkSandbox(JSON.stringify({ token: jwt({ sub: '99999999-0000-0000-0000-000000000009' }) }));
  Object.assign(sbx, { __sb: fakeSb([]) }); vm.runInContext('sb = globalThis.__sb', sbx);
  assert.strictEqual(await vm.runInContext('myName()', sbx), '');
  // uid が取れない（壊れたトークン・未ログイン）: 従来どおり絞らない
  for (const sess of [null, '{}', 'not json', JSON.stringify({ token: 'abc' }), JSON.stringify({ token: jwt({ sub: 'x; drop' }) })]) {
    sbx = mkSandbox(sess); calls = []; Object.assign(sbx, { __sb: fakeSb(calls) }); vm.runInContext('sb = globalThis.__sb', sbx);
    assert.strictEqual(await vm.runInContext('myName()', sbx), '安藤　尚子');
    assert.strictEqual(calls[0], 'staff_profiles?select=nikki_name');
  }
  // 見本モードは今までどおり（DB に触らない）
  sbx = mkSandbox(JSON.stringify({ token: jwt({ sub: UID }) }), true); calls = [];
  Object.assign(sbx, { __sb: fakeSb(calls) }); vm.runInContext('sb = globalThis.__sb', sbx);
  assert.strictEqual(await vm.runInContext('myName()', sbx), vm.runInContext('DEMO_DATA.me', sbx));
  assert.strictEqual(calls.length, 0);
  console.log('leo_myname_test OK');
})().catch(e => { console.error(e); process.exit(1); });
