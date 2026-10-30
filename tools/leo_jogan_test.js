// 上限額管理のメール下書き（node tools/leo_jogan_test.js）
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const J = require('../leo_jogan.js');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

const base = { partnerName: '見本学園', email: 'demo-a@example.com', ym: '2026-09', totalYen: 12345 };
const leo = J.joganDraft(base);
const other = J.joganDraft(Object.assign({}, base, { partnerName: '見本学園' }));
assert.strictEqual(leo.ok, true);
assert.strictEqual(leo.subject, other.subject);
assert.strictEqual(leo.body, other.body, '区分が違っても文面は同じ');
assert.strictEqual(leo.subject, 'レオ　上限額管理　9月');
assert.ok(leo.body.startsWith('見本学園御中\n'), '宛名');
assert.ok(leo.body.includes('令和8年9月分の利用金額（総費用額）をお送りします。'), '利用金額の送付');
assert.ok(leo.body.includes('総費用額：12,345円'), '総費用額');
assert.ok(leo.body.endsWith('レオ　宮本'), '署名');
assert.ok(!leo.body.includes('調整する') && !leo.body.includes('調整される'), '区分名は文面に出ない');
assert.strictEqual(J.JOGAN_SIGN, 'レオ　宮本');
assert.ok(leo.mailto.startsWith('mailto:demo-a@example.com?'), 'mailto');
assert.ok(leo.mailto.includes(encodeURIComponent(leo.subject)));
assert.ok(leo.mailto.includes(encodeURIComponent(leo.body)));
assert.ok(leo.gmail.startsWith('https://mail.google.com/mail/?'), 'Gmail下書き');
assert.ok(leo.gmail.includes('view=cm'));
assert.ok(!leo.gmail.includes('/send'), '送信APIのURLではない');

assert.strictEqual(J.joganDraft(Object.assign({}, base, { email: '' })).reason, 'no-email');
assert.strictEqual(J.joganDraft(Object.assign({}, base, { email: '   ' })).reason, 'no-email');
assert.strictEqual(J.joganDraft(Object.assign({}, base, { totalYen: null })).reason, 'no-amount');
assert.strictEqual(J.joganDraft(Object.assign({}, base, { totalYen: '' })).reason, 'no-amount');
const zero = J.joganDraft(Object.assign({}, base, { totalYen: 0 }));
assert.strictEqual(zero.ok, true);
assert.ok(zero.body.includes('総費用額：0円'));

assert.strictEqual(J.joganParseYen(''), null);
assert.strictEqual(J.joganParseYen('12,345'), 12345);
assert.strictEqual(J.joganParseYen('１２３'), 123);
assert.ok(Number.isNaN(J.joganParseYen('-1')));
assert.ok(Number.isNaN(J.joganParseYen('1.5')));
assert.strictEqual(J.joganSubject('2019-05'), 'レオ　上限額管理　5月');
assert.ok(J.joganBody({ partnerName: '見本', ym: '2019-05', totalYen: 1 }).includes('令和元年5月分'));
assert.strictEqual(J.joganBody({ partnerName: '見本学園', ym: '2026-10', totalYen: 1000 }),
  J.joganBody({ partnerName: '見本学園', ym: '2026-10', totalYen: 1000 }));

const cfgSrc = read('config.js');
global.window = {};
require('../config.js');
const leoOffice = window.PORTAL_CONFIG.offices.find(o => o.id === 'leo');
const miyamoto = leoOffice.who.find(w => w[0] === '宮本がする');
assert.deepStrictEqual(miyamoto[1].slice(0, 4), ['利用料実費請求', '国保連請求', '保護者の実績確認', 'サービス提供実績記録表']);
assert.ok(miyamoto[1].includes('上限額管理'), '宮本がするに上限額管理');
assert.ok(!leoOffice.routine || !leoOffice.routine.includes('上限額管理'), 'routine から外す');
assert.ok(!cfgSrc.includes("routine:"), 'routine 自体を外した');
const tile = leoOffice.tiles.find(t => t[1] === '上限額管理');
const jippi = leoOffice.tiles.find(t => t[1] === '利用料実費請求');
assert.strictEqual(tile[2], '#leo/jogan');
assert.ok(!String(tile[3]).includes('準備中'));
assert.strictEqual(tile[6], jippi[6], '実費請求と同じ見せ方');
assert.strictEqual(tile[6], '児発管');

const index = read('index.html');
const leojs = read('leo.js');
assert.ok(index.includes('leo_jogan.js'));
assert.ok(index.includes("(t[6] === '児発管' && canManage())"));
assert.ok(leojs.includes("const canManage = () => ROLE === '事務' || ['管理者', '児発管'].includes(DUTY);"));
function canManage(role, duty) { return role === '事務' || ['管理者', '児発管'].includes(duty); }
function vis(tileRole, role, duty) {
  return !tileRole || duty === '管理者' || tileRole === role || tileRole === duty || (tileRole === '児発管' && canManage(role, duty));
}
assert.strictEqual(vis('児発管', '事務', '現場支援員'), true, '宮本（事務）に出る');
assert.strictEqual(vis('児発管', '事務', '事務'), true);
assert.strictEqual(vis('児発管', '職員', '児発管'), true);
assert.strictEqual(vis('児発管', '職員', '管理者'), true);
assert.strictEqual(vis('児発管', '職員', '現場支援員'), false, '現場支援員には出ない');

const sql = read('supabase/leo_jogan.sql');
assert.ok(sql.includes('enable row level security'));
assert.ok(sql.includes('public.can_manage()'));
assert.ok(sql.includes("side in ('レオが管理', '他所が管理')"));
assert.ok(!sql.includes('調整する'));
for (const name of ['市川碧音', '大森愛子', '西山琴', '日置大智', '山根一輝', '裏川遥大', '谷口惺太朗', '増田匠杜']) {
  assert.ok(sql.includes(name), name);
}
assert.ok(/裏川遥大', 'レオが管理', 'さくら四日市・ウィズユー', null\)/.test(sql), '裏川はメール空');
assert.ok(sql.includes('SQL Editor'));
assert.ok(!read('leo_jogan.js').includes('調整する'));

console.log('leo_jogan_test: ok');
