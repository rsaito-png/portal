// 日中一時の入力チェックと、画面の配線（金斗雲の訪問記録には触らない）
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'nicchu.js'), 'utf8');
const pure = src.split('/* nc-pure */')[1].split('/* /nc-pure */')[0];
vm.runInThisContext(pure);

const sig = 'data:image/png;base64,aaaa';
const base = (over = {}) => ({
  service_date: '2026-10-25', staff_name: '職員A', weather: '晴れ', meal_menu: 'カレー', general_notes: '',
  users: [{ user_id: 1, name: '利用者A', present: true, start_time: '07:00', end_time: '13:00', transport: '往復', meal_served: 'あり', activity: '制作', state: '穏やか', signer_kind: 'あとで署名', sign_reason: '', signature: '' }],
  ...over
});

assert.deepStrictEqual(ncValidate(base()), []);
assert.strictEqual(ncWeekday('2026-10-25'), '日');
assert.strictEqual(ncWeekday('2026-10-26'), '月');
assert.strictEqual(ncFmtDay('2026-10-25'), '10/25（日）');
assert.strictEqual(ncWeekday('2026-02-31'), '');
assert.strictEqual(ncNextMonth('2026-10'), '2026-11-01');
assert.ok(ncValidate(base({ service_date: '2026-02-31' })).some(e => e.includes('日付')));
assert.ok(ncValidate(base({ staff_name: '  ' })).some(e => e.includes('記入者')));
assert.ok(ncValidate({ ...base(), users: [{ ...base().users[0], present: false }] }).some(e => e.includes('1人も')));
assert.ok(ncValidate({ ...base(), users: [{ ...base().users[0], end_time: '06:00' }] }).some(e => e.includes('退所')));
assert.ok(ncValidate({ ...base(), users: [{ ...base().users[0], activity: '  ' }] }).some(e => e.includes('活動')));
assert.ok(ncValidate({ ...base(), users: [{ ...base().users[0], signer_kind: '本人', signature: '' }] }).some(e => e.includes('署名がありません')));
assert.ok(ncValidate({ ...base(), users: [{ ...base().users[0], signer_kind: '署名困難', sign_reason: '' }] }).some(e => e.includes('理由')));
assert.deepStrictEqual(ncValidate({ ...base(), users: [{ ...base().users[0], signer_kind: '本人', signature: sig }] }), []);
assert.deepStrictEqual(ncValidate({ ...base(), users: [{ ...base().users[0], signer_kind: '署名困難', sign_reason: '手指の麻痺' }] }), []);
assert.ok(ncValidate({ ...base(), weather: '台風' }).some(e => e.includes('天気')));

const later = ncRecordBody(base().users[0], null, '2026-10-25T00:00:00.000Z');
assert.strictEqual(later.sign_status, '署名待ち');
assert.strictEqual(later.signature, null);
assert.strictEqual(later.signed_at, null);
assert.strictEqual(ncNeedLog(later, null), false);

const hard = ncRecordBody({ ...base().users[0], signer_kind: '署名困難', sign_reason: '  手指  ' }, null, '2026-10-25T00:00:00.000Z');
assert.strictEqual(hard.sign_status, '署名済');
assert.strictEqual(hard.signature, null);
assert.strictEqual(hard.sign_reason, '手指');
assert.strictEqual(hard.signed_at, '2026-10-25T00:00:00.000Z');
assert.strictEqual(ncNeedLog(hard, null), true);
assert.strictEqual(ncNeedLog(hard, hard), false);

const signed = ncRecordBody({ ...base().users[0], signer_kind: 'ご家族', signature: sig }, null, '2026-10-25T00:00:00.000Z');
assert.strictEqual(signed.signature, sig);
const again = ncRecordBody({ ...base().users[0], signer_kind: 'ご家族', signature: sig, activity: '散歩' }, signed, '2026-10-26T00:00:00.000Z');
assert.strictEqual(again.signed_at, signed.signed_at);
assert.strictEqual(again.activity, '散歩');
assert.strictEqual(ncNeedLog(again, signed), false);

const absent = ncRecordBody({ ...base().users[0], present: false }, signed, '2026-10-25T00:00:00.000Z');
assert.strictEqual(absent.present, false);
assert.strictEqual(absent.start_time, null);
assert.strictEqual(absent.sign_status, null);
assert.strictEqual(absent.signature, null);

assert.deepStrictEqual(ncLaterValidate([], '本人', '', sig), ['署名する記録を選んでください']);
assert.deepStrictEqual(ncLaterValidate([1], '本人', '', ''), ['署名がありません']);
assert.deepStrictEqual(ncLaterValidate([1], '署名困難', '', sig), ['署名困難の理由を入れてください']);
assert.deepStrictEqual(ncLaterValidate([1, 2], '本人', '', sig), []);
const patch = ncLaterPatch('本人', '', sig, '2026-10-26T01:00:00.000Z');
assert.strictEqual(patch.sign_status, '署名済');
assert.strictEqual(patch.signature, sig);
assert.strictEqual(ncLaterPatch('署名困難', '疲れ', sig, '2026-10-26T01:00:00.000Z').signature, null);

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.ok(html.includes('nicchu.js'));
assert.ok(html.includes("id === 'nicchu' && sub === 'log'"));
assert.ok(html.includes("id === 'nicchu' && sub === 'sign'"));
const win = {};
vm.runInNewContext(fs.readFileSync(path.join(root, 'config.js'), 'utf8'), { window: win });
const office = win.PORTAL_CONFIG.offices.find(o => o.id === 'nicchu');
assert.ok(office);
assert.strictEqual(office.kind, '日中一時支援');
assert.strictEqual(String(office.tiles[0][2]), '#nicchu/log');
assert.strictEqual(String(office.tiles[1][2]), '#nicchu/sign');
const kin = fs.readFileSync(path.join(root, 'kin_visit.js'), 'utf8');
assert.ok(!kin.includes('nicchu'));
const sql = fs.readFileSync(path.join(root, 'supabase/nicchu.sql'), 'utf8');
['nicchu_user', 'nicchu_helper', 'nicchu_day', 'nicchu_record', 'nicchu_sign_log', 'nicchu_can', 'nicchu_sign_later'].forEach(n => assert.ok(sql.includes(n), n));
assert.ok(!/alter table public\.kin_/i.test(sql));
assert.ok(!/日置|柘山|大坪/.test(sql + src + html));

console.log('nicchu_check ok');
