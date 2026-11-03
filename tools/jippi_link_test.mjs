// 実費の支払いリンク判定。Square には繋がない。
// 実行: node --experimental-strip-types tools/jippi_link_test.mjs
import fs from 'fs';
import path from 'path';
import vm from 'node:vm';
import { fileURLToPath } from 'url';
import { squareDecision } from '../supabase/functions/_shared/square.ts';
import { jippiIdempotencyKey, jippiNeedsLink, jippiPaymentNote } from '../supabase/functions/_shared/jippi_link.ts';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let n = 0, fails = 0;
const ok = (c, m) => { n++; if (!c) { fails++; console.error('FAIL', m); } else console.log('ok  ', m); };
const eq = (a, b, m) => ok(a === b, m + ' (' + JSON.stringify(a) + ')');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
eq(jippiNeedsLink({ lunch: 0, snack: 0, pay_link: null, pay_link_amount: null }).action, 'zero', 'zero skipped');
eq(jippiNeedsLink({ lunch: 0, snack: 0, burden: 0, pay_link: null }).action, 'zero', 'zero burden skipped');
eq(jippiNeedsLink({ lunch: 600, snack: 0, pay_link: null, pay_link_amount: null }).action, 'create', 'lunch only creates');
eq(jippiNeedsLink({ lunch: 0, snack: 0, burden: 4600, pay_link: null }).action, 'create', 'burden only creates');
eq(jippiNeedsLink({ lunch: 0, snack: 0, burden: 4600, pay_link: null }).amount, 4600, 'burden only amount');
eq(jippiNeedsLink({ lunch: 600, snack: 300, pay_link: null }).action, 'create', 'missing link creates');
eq(jippiNeedsLink({ lunch: 600, snack: 300 }).amount, 900, 'missing burden is zero');
eq(jippiNeedsLink({ lunch: 600, snack: 300, pay_link: 'https://square.link/u/abc', pay_link_amount: null }).action, 'create', 'link without recorded amount is recreated');
eq(jippiNeedsLink({ lunch: 600, snack: 300, pay_link: 'https://square.link/u/abc', pay_link_amount: 800 }).action, 'create', 'changed amount recreates');
eq(jippiNeedsLink({ lunch: 600, snack: 300, pay_link: 'https://square.link/u/abc', pay_link_amount: 900 }).action, 'unchanged', 'same amount kept');
eq(jippiNeedsLink({ lunch: 600, snack: 300, burden: 4600, pay_link: 'https://square.link/u/abc', pay_link_amount: 900 }).action, 'create', 'added burden recreates');
eq(jippiNeedsLink({ lunch: 600, snack: 300, burden: 4600, pay_link: 'https://square.link/u/abc', pay_link_amount: 5500 }).action, 'unchanged', 'lunch+snack+burden kept');
eq(jippiNeedsLink({ lunch: 600, snack: 300, burden: 4600, pay_link: 'https://square.link/u/abc', pay_link_amount: 5500 }).amount, 5500, 'total includes burden');
eq(jippiNeedsLink({ lunch: '600', snack: '300', pay_link: 'https://square.link/u/abc', pay_link_amount: '900' }).action, 'unchanged', 'numeric strings');
eq(jippiNeedsLink({ lunch: '600', snack: '300', burden: '4600', pay_link: 'https://square.link/u/abc', pay_link_amount: '5500' }).action, 'unchanged', 'burden numeric string');
eq(jippiNeedsLink({ lunch: 600, snack: 300, pay_link: 'http://square.link/u/abc', pay_link_amount: 900 }).action, 'create', 'non-https is replaced');
eq(jippiNeedsLink({ lunch: -1, snack: 10 }).action, 'bad', 'negative rejected');
eq(jippiNeedsLink({ lunch: 600, snack: 300, burden: -1 }).action, 'bad', 'negative burden rejected');
eq(jippiNeedsLink({ lunch: 100000, snack: 1 }).action, 'bad', 'over cap rejected');
eq(jippiNeedsLink({ lunch: 600, snack: 300, burden: 100000 }).action, 'bad', 'burden pushes over cap');
eq(jippiNeedsLink({ lunch: 1.5, snack: 1 }).action, 'bad', 'fraction rejected');
eq(jippiNeedsLink({ lunch: 600, snack: 300, burden: 1.5 }).action, 'bad', 'fraction burden rejected');

const note = jippiPaymentNote('2026-09');
eq(note, 'leo-jippi 2026-09', 'payment note');
ok(!UUID.test(note), 'payment note is not a payment id');
const decided = squareDecision({
  type: 'payment.updated',
  data: { object: { payment: { id: 'payj', status: 'COMPLETED', order_id: 'ord-jippi', amount_money: { amount: 900, currency: 'JPY' }, total_money: { amount: 900, currency: 'JPY' }, note } } },
});
eq(decided.paymentId, null, 'webhook candidate has no sct payment id');
ok(decided.action === 'pay' && decided.orderId === 'ord-jippi', 'amount check still belongs to the webhook matcher');

const k1 = await jippiIdempotencyKey('2026-09', '児童A', 900);
const k2 = await jippiIdempotencyKey('2026-09', '児童A', 900);
const k3 = await jippiIdempotencyKey('2026-09', '児童A', 901);
eq(k1, k2, 'same amount reuses the key');
ok(k1 !== k3, 'new amount gets a new key');
ok(k1.startsWith('jippi1-') && k1.length <= 45 && !k1.includes('児童A'), 'key is short and has no child name');

const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const sql = read('supabase/leo_jippi.sql');
ok(sql.includes('add column if not exists pay_link_amount'), 'column add is re-runnable');
ok(sql.includes('add column if not exists burden int not null default 0'), 'burden column add is re-runnable');
ok(sql.includes('pay_link_amount') && sql.includes('can_manage()'), 'amount column and manage grant');
ok(!/sq0atp-|EAAA[A-Za-z0-9_-]{20}|sk_live_/.test(sql), 'sql has no payment secret');

const fn = read('supabase/functions/jippi-checkout/index.ts');
const ui = read('leo_jippi.js');
const hook = read('supabase/functions/square-webhook/index.ts');
ok(fn.includes('quick_pay') && fn.includes('jippiNeedsLink') && fn.includes('can_manage') && fn.includes('hostedCheckoutUrl'), 'checkout creates a hosted quick pay link');
ok(fn.includes('lunch,snack,burden,pay_link,pay_link_amount'), 'checkout reads burden');
ok(fn.includes('lunch+snack+burden'), 'checkout amount comment includes burden');
ok(!fn.includes('sct_payments?') && !fn.includes('SQUARE_ACCESS_TOKEN='), 'checkout does not update sct payments or embed a token');
ok(fn.includes('古いリンクは Square 上では無効化しない'), 'old links are left active');
ok(ui.includes('この月のリンクを作成／更新') && ui.includes('この人のリンク'), 'buttons');
ok(ui.includes('この画面から随時作成できます') && ui.includes('金額が同じリンクは作り直しません'), 'note');
ok(ui.includes('利用料（利用者負担額）は手打ち、お昼代・おやつ代は取り込みです'), 'hand entry note');
ok(ui.includes('jiBurden') && ui.includes('jiAmt(r)') && ui.includes('・利用料'), 'burden input, total, and line text');
ok(!ui.includes('利用者負担額は含みません'), 'old exclusion note is gone');
ok(ui.includes("if (DEMO)") && ui.indexOf('見本モードでは呼び出しません') < ui.indexOf("'/functions/v1/jippi-checkout'"), 'demo does not call the function');
ok(!ui.includes('SQUARE_ACCESS_TOKEN'), 'token is not in the page');
ok(hook.includes('sct_payments') && hook.includes('leo-jippi') && !hook.includes('leo_jippi'), 'webhook still matches only sct payments');
ok(read('supabase/config.toml').includes('[functions.square-webhook]') && !read('supabase/config.toml').includes('[functions.jippi-checkout]'), 'jippi keeps jwt verification');
ok(read('index.html').includes('leo_jippi.js?v=20261103burden'), 'page loads the new script');
const imp = read('tools/jippi_import.py');
ok(imp.includes('burden') && !imp.includes("'burden'") && !imp.includes('"burden"'), 'import leaves hand-entered burden alone');

const els = {};
const patches = [];
let rows = [];
const sandbox = {
  DEMO: true,
  ROLE: '事務',
  LEO_VIEWS: {},
  today: () => '2026-11-03',
  gl: (_k, fb) => fb ?? '',
  esc: (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
  canManage: () => true,
  demoNote: () => '',
  console,
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  navigator: { clipboard: { writeText: async () => {} } },
  fetch: async () => { throw new Error('no fetch'); },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.$ = (id) => els[id] || (els[id] = { textContent: '', value: '' });
sandbox.sb = async (path, opt = {}) => {
  if ((opt.method || 'GET') === 'PATCH') {
    const body = JSON.parse(opt.body);
    patches.push({ path, body });
    Object.assign(rows[0], body);
    return null;
  }
  return rows.map((r) => ({ ...r }));
};
sandbox.renderLeoView = async (name) => { sandbox.__html = await sandbox.LEO_VIEWS[name](); };
vm.createContext(sandbox);
vm.runInContext(read('leo_jippi.js'), sandbox, { filename: 'leo_jippi.js' });

const demoHtml = await sandbox.LEO_VIEWS.jippi();
ok(demoHtml.includes('<th>利用料</th>') && demoHtml.includes('id="jb0"'), 'demo shows burden input');
ok(demoHtml.includes('900円') && demoHtml.includes('value="0"'), 'demo total is lunch+snack+0');
const line = sandbox.jiText({ child: '児童 A', guardian: '保護者A', lunch: 600, snack: 300, burden: 4600, pay_link: 'https://square.link/u/abc' });
ok(line.includes('・利用料 4,600円') && line.includes('・お昼代 600円') && line.includes('・おやつ代 300円') && line.includes('・合計 5,500円'), 'line text includes burden');
ok(line.includes('https://square.link/u/abc'), 'line text keeps the pay link');

sandbox.DEMO = true;
sandbox.JI_MSG = '';
sandbox.$('jb0').value = '4600';
await sandbox.jiBurden(0);
await new Promise((resolve) => setTimeout(resolve, 0));
ok(patches.length === 0, 'demo burden does not patch');
ok(sandbox.__html.includes('5,500円') && sandbox.__html.includes('value="4600"'), 'demo preview total includes burden');
ok(sandbox.__html.includes('見本モードなので保存しません'), 'demo says it does not save');

sandbox.DEMO = false;
rows = [{ ym: '2026-10', child: '児童A', guardian: '保護者A', lunch: 600, snack: 300, burden: 0, pay_link: 'https://square.link/u/old', pay_link_amount: 900, sent: false }];
await sandbox.LEO_VIEWS.jippi();
sandbox.$('jb0').value = '4,600';
await sandbox.jiBurden(0);
await new Promise((resolve) => setTimeout(resolve, 0));
eq(patches.at(-1) && patches.at(-1).body.burden, 4600, 'burden saves on change');
ok(patches.at(-1).path.includes('child=eq.' + encodeURIComponent('児童A')), 'patch targets the child');
ok(sandbox.__html.includes('5,500円') && sandbox.__html.includes('value="4600"'), 'saved total is lunch+snack+burden');
ok(sandbox.__html.includes('保存しました'), 'save message');
const before = patches.length;
sandbox.$('jb0').value = 'abc';
await sandbox.jiBurden(0);
eq(patches.length, before, 'invalid burden is not saved');
ok(els.jmsg.textContent.includes('整数'), 'invalid burden message');

console.log(fails ? 'failed ' + fails + '/' + n : 'jippi ok ' + n);
process.exit(fails ? 1 : 0);
