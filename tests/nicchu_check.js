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

assert.strictEqual(ncReiwa(2019), '元');
assert.strictEqual(ncReiwa(2026), '8');
assert.strictEqual(ncJissekiMinutes('07:00', '13:00'), 360);
assert.strictEqual(ncJissekiBand(239), 'under');
assert.strictEqual(ncJissekiBand(240), 'over');
assert.strictEqual(ncJissekiBand(360), 'over');
assert.strictEqual(ncJissekiMeal('あり'), '1');
assert.strictEqual(ncJissekiMeal('なし'), '');
assert.strictEqual(ncJissekiTransport('往復'), '2');
assert.strictEqual(ncJissekiTransport('迎えのみ'), '1');
assert.strictEqual(ncJissekiTransport('送りのみ'), '1');
assert.strictEqual(ncJissekiTransport('なし'), '');

const sample = [
  { present: true, service_date: '2019-10-01', start_time: '09:30', end_time: '16:00', meal_served: 'あり', transport: '往復' },
  { present: true, service_date: '2019-10-03', start_time: '09:30', end_time: '16:00', meal_served: 'あり', transport: '往復' },
  { present: true, service_date: '2019-10-05', start_time: '09:30', end_time: '16:00', meal_served: 'あり', transport: '往復' },
  { present: true, service_date: '2019-10-13', start_time: '09:30', end_time: '12:00', meal_served: 'なし', transport: '迎えのみ' },
  { present: true, service_date: '2019-10-27', start_time: '09:30', end_time: '16:00', meal_served: 'あり', transport: '往復' },
  { present: false, service_date: '2019-10-02', start_time: '09:30', end_time: '16:00', meal_served: 'あり', transport: '往復' }
];
const sheet = ncJissekiSheet(sample);
assert.strictEqual(sheet.lines.length, 5);
assert.strictEqual(sheet.lines[0].weekday, '火');
assert.strictEqual(sheet.lines[0].dayLabel, '1日');
assert.strictEqual(sheet.lines[3].band, 'under');
assert.strictEqual(sheet.lines[3].minutes, 150);
assert.strictEqual(sheet.lines[3].meal, '');
assert.strictEqual(sheet.lines[3].transport, '1');
assert.deepStrictEqual(sheet.totals, { under: 1, over: 4, meal: 4, transport: 9 });
assert.strictEqual(sheet.pages.length, 1);
assert.strictEqual(sheet.pages[0].length, 20);
assert.strictEqual(sheet.pages[0][5], null);

const sunday = ncJissekiSheet([{ present: true, service_date: '2026-10-25', start_time: '07:00', end_time: '13:00', meal_served: 'あり', transport: '往復' }]);
assert.strictEqual(sunday.lines[0].weekday, '日');
assert.strictEqual(sunday.lines[0].band, 'over');
assert.strictEqual(sunday.totals.meal, 1);
assert.strictEqual(sunday.totals.transport, 2);

const many = [];
for (let d = 1; d <= 21; d++) many.push({ present: true, service_date: '2026-10-' + String(d).padStart(2, '0'), start_time: '07:00', end_time: '11:00', meal_served: 'なし', transport: 'なし' });
const long = ncJissekiSheet(many);
assert.strictEqual(long.pages.length, 2);
assert.strictEqual(long.pages[1][0].dayLabel, '21日');
assert.strictEqual(long.totals.over, 21);

assert.deepStrictEqual(ncJissekiMasterErrors({ recipient_no: '0000099999', office_no: '2460200999', kubun: '区分３', monthly_quota: '5' }), []);
assert.ok(ncJissekiMasterErrors({ recipient_no: '12a' }).some(e => e.includes('受給者番号')));
assert.ok(ncJissekiMasterErrors({ monthly_quota: '0' }).some(e => e.includes('支給量')));
assert.ok(ncJissekiMasterErrors({ kubun: '区分９' }).some(e => e.includes('区分')));

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
assert.ok(html.includes("id === 'nicchu' && sub === 'jisseki'"));
assert.ok(html.includes("id === 'nicchu' && sub === 'sign'"));
const win = {};
vm.runInNewContext(fs.readFileSync(path.join(root, 'config.js'), 'utf8'), { window: win });
const office = win.PORTAL_CONFIG.offices.find(o => o.id === 'nicchu');
assert.ok(office);
assert.strictEqual(office.id, 'nicchu');
assert.strictEqual(office.name, '日中一時支援');
assert.strictEqual(office.kind, '星心会レスパイトスタジオ');
assert.strictEqual(office.tiles.length, 2);
assert.strictEqual(String(office.tiles[0][1]), '支援記録');
assert.strictEqual(String(office.tiles[0][2]), '#nicchu/log');
assert.strictEqual(String(office.tiles[1][1]), '実績記録票（印刷）');
assert.strictEqual(String(office.tiles[1][2]), '#nicchu/jisseki');
assert.strictEqual(win.PORTAL_CONFIG.esign.officeDefaults['日中一時支援'].place, '星心会レスパイトスタジオ');
const kin = fs.readFileSync(path.join(root, 'kin_visit.js'), 'utf8');
assert.ok(!kin.includes('nicchu'));
const sql = fs.readFileSync(path.join(root, 'supabase/nicchu.sql'), 'utf8');
['nicchu_user', 'nicchu_helper', 'nicchu_day', 'nicchu_record', 'nicchu_sign_log', 'nicchu_can', 'nicchu_sign_later'].forEach(n => assert.ok(sql.includes(n), n));
assert.ok(sql.includes("office in ('日中一時支援', 'レスパイト', '日中一時')"));
assert.ok(sql.includes('drop constraint if exists nicchu_record_when_present'));
assert.ok(sql.includes('drop constraint if exists nicchu_record_sign_shape'));
assert.ok(sql.includes('nicchu_office'));
assert.ok(sql.includes('recipient_no'));
assert.ok(src.includes('四日市市障害者（児）日中一時支援サービス提供実績記録票'));
assert.ok(src.includes('利用者確認印'));
assert.ok(!src.includes('nc-ring">入浴'));
assert.ok(!/signer_kind is not null/.test(sql));
assert.ok(!/alter table public\.kin_/i.test(sql));
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
assert.ok(readme.includes('日中一時支援'));
assert.ok(readme.includes('山川美恵子'));
assert.ok(!readme.includes('あとで署名'));
assert.ok(!/日置|柘山/.test(sql + src + html + readme));

console.log('nicchu_check ok');
