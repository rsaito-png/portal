const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'me.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const cfg = fs.readFileSync(path.join(root, 'config.js'), 'utf8');
const sql = fs.readFileSync(path.join(root, 'supabase/staff_me.sql'), 'utf8');

assert.ok(html.includes('me.js?v='));
assert.ok(html.includes("id === 'me'"));
assert.ok(html.includes('入職・年末調整の届出'));
assert.ok(html.includes('#me'));
assert.ok(cfg.includes('#me/list'));
assert.ok(src.includes('console') === false || !/console\.(log|debug|info|warn|error)\([^)]*(my_number|account_number|mn_num)/.test(src));
assert.ok(!src.includes('staff_todo'));
assert.ok(!src.includes('notify_enqueue'));
assert.ok(!src.includes('doc_issue'));
assert.ok(sql.includes("my_role() = '事務'"));
assert.ok(sql.includes('is_chair()'));
assert.ok(sql.includes('staff_bank_accounts'));
assert.ok(sql.includes('staff_my_numbers'));
assert.ok(sql.includes('staff_dependent_my_numbers'));
assert.ok(sql.includes('staff_ye_declarations'));
assert.ok(sql.includes("staff_my_number_valid"));
assert.ok(sql.includes("revoke delete on public.staff_bank_accounts"));
assert.ok(sql.includes("revoke delete on public.staff_my_numbers"));
assert.ok(sql.includes("staff-ye-docs"));
assert.ok(sql.includes('purpose_ack'));
// 管理者や staff_admin_can を RLS に使わない
const policies = sql.split('create policy');
for (const p of policies.slice(1)) {
  assert.ok(!p.split(';')[0].includes('staff_admin_can'), 'policy must not use staff_admin_can');
  assert.ok(!p.split(';')[0].includes("my_duty()"), 'policy must not use my_duty');
}

const sandbox = {};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
assert.strictEqual(sandbox.meNumberValid('123456789016'), true);
assert.strictEqual(sandbox.meNumberValid('123456789010'), false);
assert.strictEqual(sandbox.meNumberValid('123'), false);
assert.strictEqual(sandbox.meMaskNumber('1234567'), '•••4567');
assert.strictEqual(sandbox.meMaskNumber('123456789016'), '••••••••9016');
assert.ok(sandbox.meToKana('さいとう れん').includes('サイトウ'));
assert.strictEqual(typeof sandbox.renderMe, 'function');
assert.strictEqual(typeof sandbox.renderMeList, 'function');
assert.strictEqual(typeof sandbox.renderMeDetail, 'function');

const uk = fs.readFileSync(path.join(root, 'uketsuke.js'), 'utf8');
assert.ok(uk.includes("me: '入職・年末調整の届出'"));

console.log('me_check ok');
