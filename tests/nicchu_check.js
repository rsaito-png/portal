// 日中一時の入力チェックと、画面の配線（金斗雲の訪問記録には触らない）
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'nicchu.js'), 'utf8');
const pure = src.split('/* nc-pure */')[1].split('/* /nc-pure */')[0];
vm.runInThisContext(pure);

const base = (over = {}) => ({
  service_date: '2026-10-25', staff_name: '山川美恵子', weather: '晴れ', meal_menu: 'カレー', general_notes: '',
  users: [{ user_id: 1, name: '利用者A', present: true, start_time: '07:00', end_time: '13:00', transport: '往復', meal_served: 'あり', activity: '制作', state: '穏やか' }],
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
assert.ok(ncValidate({ ...base(), weather: '台風' }).some(e => e.includes('天気')));

const body = ncRecordBody(base().users[0]);
assert.strictEqual(body.present, true);
assert.strictEqual(body.start_time, '07:00');
assert.strictEqual(body.end_time, '13:00');
assert.strictEqual(body.activity, '制作');
assert.strictEqual(body.signer_kind, null);
assert.strictEqual(body.sign_reason, null);
assert.strictEqual(body.signature, null);
assert.strictEqual(body.sign_status, null);
assert.strictEqual(body.signed_at, null);

const absent = ncRecordBody({ ...base().users[0], present: false });
assert.strictEqual(absent.present, false);
assert.strictEqual(absent.start_time, null);
assert.strictEqual(absent.activity, null);
assert.strictEqual(absent.signature, null);
assert.strictEqual(absent.sign_status, null);

assert.ok(!src.includes('あとで署名'));
assert.ok(!src.includes('createSignPad'));
assert.ok(!src.includes('__other'));
assert.ok(!src.includes('nicchu_sign_log'));
assert.ok(!src.includes('nicchu_helper?on_conflict'));
['山川美恵子', '大坪シズカ', '齊藤連'].forEach(n => assert.ok(src.includes(n), n));
assert.ok(src.includes('← 日中一時支援へ'));
assert.ok(src.includes('星心会レスパイトスタジオ'));

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.ok(html.includes('nicchu.js'));
assert.ok(html.includes("id === 'nicchu' && sub === 'log'"));
assert.ok(html.includes("id === 'nicchu' && sub === 'sign'"));
const win = {};
vm.runInNewContext(fs.readFileSync(path.join(root, 'config.js'), 'utf8'), { window: win });
const office = win.PORTAL_CONFIG.offices.find(o => o.id === 'nicchu');
assert.ok(office);
assert.strictEqual(office.id, 'nicchu');
assert.strictEqual(office.name, '日中一時支援');
assert.strictEqual(office.kind, '星心会レスパイトスタジオ');
assert.strictEqual(office.tiles.length, 1);
assert.strictEqual(String(office.tiles[0][1]), '支援記録');
assert.strictEqual(String(office.tiles[0][2]), '#nicchu/log');
assert.strictEqual(win.PORTAL_CONFIG.esign.officeDefaults['日中一時支援'].place, '星心会レスパイトスタジオ');
const kin = fs.readFileSync(path.join(root, 'kin_visit.js'), 'utf8');
assert.ok(!kin.includes('nicchu'));
const sql = fs.readFileSync(path.join(root, 'supabase/nicchu.sql'), 'utf8');
['nicchu_user', 'nicchu_helper', 'nicchu_day', 'nicchu_record', 'nicchu_sign_log', 'nicchu_can', 'nicchu_sign_later'].forEach(n => assert.ok(sql.includes(n), n));
assert.ok(sql.includes("office in ('日中一時支援', 'レスパイト', '日中一時')"));
assert.ok(sql.includes('drop constraint if exists nicchu_record_when_present'));
assert.ok(sql.includes('drop constraint if exists nicchu_record_sign_shape'));
assert.ok(!/signer_kind is not null/.test(sql));
assert.ok(!/alter table public\.kin_/i.test(sql));
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
assert.ok(readme.includes('日中一時支援'));
assert.ok(readme.includes('山川美恵子'));
assert.ok(!readme.includes('あとで署名'));
assert.ok(!/日置|柘山/.test(sql + src + html + readme));

console.log('nicchu_check ok');
