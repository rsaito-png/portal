// 実費の支払いリンク判定。Square には繋がない。
// 実行: node --experimental-strip-types tools/jippi_link_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { squareDecision } from '../supabase/functions/_shared/square.ts';
import { jippiIdempotencyKey, jippiNeedsLink, jippiPaymentNote } from '../supabase/functions/_shared/jippi_link.ts';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let n = 0, fails = 0;
const ok = (c, m) => { n++; if (!c) { fails++; console.error('FAIL', m); } else console.log('ok  ', m); };
const eq = (a, b, m) => ok(a === b, m + ' (' + JSON.stringify(a) + ')');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
eq(jippiNeedsLink({ lunch: 0, snack: 0, pay_link: null, pay_link_amount: null }).action, 'zero', 'zero skipped');
eq(jippiNeedsLink({ lunch: 600, snack: 0, pay_link: null, pay_link_amount: null }).action, 'create', 'lunch only creates');
eq(jippiNeedsLink({ lunch: 600, snack: 300, pay_link: null }).action, 'create', 'missing link creates');
eq(jippiNeedsLink({ lunch: 600, snack: 300, pay_link: 'https://square.link/u/abc', pay_link_amount: null }).action, 'create', 'link without recorded amount is recreated');
eq(jippiNeedsLink({ lunch: 600, snack: 300, pay_link: 'https://square.link/u/abc', pay_link_amount: 800 }).action, 'create', 'changed amount recreates');
eq(jippiNeedsLink({ lunch: 600, snack: 300, pay_link: 'https://square.link/u/abc', pay_link_amount: 900 }).action, 'unchanged', 'same amount kept');
eq(jippiNeedsLink({ lunch: '600', snack: '300', pay_link: 'https://square.link/u/abc', pay_link_amount: '900' }).action, 'unchanged', 'numeric strings');
eq(jippiNeedsLink({ lunch: 600, snack: 300, pay_link: 'http://square.link/u/abc', pay_link_amount: 900 }).action, 'create', 'non-https is replaced');
eq(jippiNeedsLink({ lunch: -1, snack: 10 }).action, 'bad', 'negative rejected');
eq(jippiNeedsLink({ lunch: 100000, snack: 1 }).action, 'bad', 'over cap rejected');
eq(jippiNeedsLink({ lunch: 1.5, snack: 1 }).action, 'bad', 'fraction rejected');

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
ok(sql.includes('pay_link_amount') && sql.includes('can_manage()'), 'amount column and manage grant');
ok(!/sq0atp-|EAAA[A-Za-z0-9_-]{20}|sk_live_/.test(sql), 'sql has no payment secret');

const fn = read('supabase/functions/jippi-checkout/index.ts');
const ui = read('leo_jippi.js');
const hook = read('supabase/functions/square-webhook/index.ts');
ok(fn.includes('quick_pay') && fn.includes('jippiNeedsLink') && fn.includes('can_manage') && fn.includes('hostedCheckoutUrl'), 'checkout creates a hosted quick pay link');
ok(!fn.includes('sct_payments?') && !fn.includes('SQUARE_ACCESS_TOKEN='), 'checkout does not update sct payments or embed a token');
ok(fn.includes('古いリンクは Square 上では無効化しない'), 'old links are left active');
ok(ui.includes('この月のリンクを作成／更新') && ui.includes('この人のリンク'), 'buttons');
ok(ui.includes('この画面から随時作成できます') && ui.includes('金額が同じリンクは作り直しません'), 'note');
ok(ui.includes("if (DEMO)") && ui.indexOf('見本モードでは呼び出しません') < ui.indexOf("'/functions/v1/jippi-checkout'"), 'demo does not call the function');
ok(!ui.includes('SQUARE_ACCESS_TOKEN'), 'token is not in the page');
ok(hook.includes('sct_payments') && hook.includes('leo-jippi') && !hook.includes('leo_jippi'), 'webhook still matches only sct payments');
ok(read('supabase/config.toml').includes('[functions.square-webhook]') && !read('supabase/config.toml').includes('[functions.jippi-checkout]'), 'jippi keeps jwt verification');
ok(read('index.html').includes('leo_jippi.js?v=20261030jippi'), 'page loads the new script');

console.log(fails ? 'failed ' + fails + '/' + n : 'jippi ok ' + n);
process.exit(fails ? 1 : 0);
