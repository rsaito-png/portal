// 記録記入: ログイン職員の初期値、棟ごとの予定、空でも保存できる担当者名、ホームの並び。
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'kin_visit.js'), 'utf8');
const pure = src.split('/* kv-pure */')[1].split('/* /kv-pure */')[0];
vm.runInThisContext(pure);

assert.strictEqual(kvInitialStaff(true, '', '齊藤連'), '齊藤連');
assert.strictEqual(kvInitialStaff(true, null, '  '), '');
assert.strictEqual(kvInitialStaff(false, '見本ヘルパー', '齊藤連'), '見本ヘルパー');
assert.strictEqual(kvInitialStaff(false, null, '齊藤連'), '');
assert.strictEqual(kvInitialStaff(false, '', '齊藤連'), '');

const users = [
  { id: 1, name: '見本太郎', name_kana: 'みほん たろう' },
  { id: 2, name: '見本花子', name_kana: 'みほん はなこ' },
  { id: 3, name: '見本次郎', name_kana: '' }
];
const supplies = [
  { user_id: 1, service: '身体介護', weekday: 1, start_time: '06:30:00', end_time: '07:10:00', content: '朝の支援', building: '見本棟B', plan_from: null, plan_to: null },
  { user_id: 2, service: '身体介護', weekday: 1, start_time: '07:15:00', end_time: '07:35:00', content: '着替え', building: '見本棟B', plan_from: null, plan_to: null },
  { user_id: 3, service: '家事援助', weekday: 6, start_time: '12:00:00', end_time: '12:40:00', content: '昼', building: '見本棟B', plan_from: null, plan_to: null },
  { user_id: 1, service: '身体介護', weekday: 1, start_time: '18:30:00', end_time: '19:10:00', content: '夕食', building: '見本棟A', plan_from: '2026-10-01', plan_to: '2026-10-31' },
  { user_id: 3, service: '身体介護', weekday: null, start_time: '09:00:00', end_time: '09:30:00', content: '手入力以外', building: '', plan_from: null, plan_to: null }
];
const slots = kvSlotsFromSupplies(supplies, users);
const buildings = kvBuildingsFromSlots(slots);
assert.deepStrictEqual(buildings.map(b => b.ja), ['見本棟A', '見本棟B']);
assert.deepStrictEqual(buildings[1].users.map(u => u.name), ['見本太郎', '見本花子', '見本次郎']);
const bBands = kvBandsForBuilding(slots, '見本棟B').map(b => b.ja);
assert.deepStrictEqual(bBands, ['朝', '土日昼']);
assert.deepStrictEqual(kvBandsForBuilding(slots, '見本棟A').map(b => b.key), ['yu']);

const mon = kvBuildingEntries(slots, buildings[1], 'asa', 1, '2026-10-26');
assert.deepStrictEqual(mon.map(e => e.user.name), ['見本太郎', '見本花子']);
assert.strictEqual(mon[0].slot.content, '朝の支援');
assert.deepStrictEqual(kvBuildingEntries(slots, buildings[1], 'asa', 2, '2026-10-27').map(e => e.user.name), []);
const sat = kvBuildingEntries(slots, buildings[1], 'hiru', 6, '2026-10-31');
assert.deepStrictEqual(sat.map(e => e.user.name), ['見本次郎']);
assert.strictEqual(kvBuildingEntries(slots, buildings[0], 'yu', 1, '2026-11-01').length, 0);
assert.strictEqual(kvPickBuildingBand(slots, buildings[1], 1, 7 * 60, '2026-10-26'), 'asa');
assert.strictEqual(kvPickBuildingBand(slots, buildings[1], 6, 12 * 60, '2026-10-31'), 'hiru');

const picked = kvPickSlot(slots, 1, 1, 18 * 60, '2026-10-26');
assert.strictEqual(picked.slot.start, '18:30');
assert.strictEqual(picked.weekdayMatched, true);
const off = kvPickSlot(slots, 1, 3, 8 * 60, '2026-10-28');
assert.strictEqual(off.weekdayMatched, false);

const body = kvVisitBody({ visit_date: '2026-10-30', user_id: 1, staff_name: '  ', service: '身体介護', start_time: '06:30', end_time: '07:10', content: '', signer: 'あとで署名', report1: '変化なし', ack: false, instruction_ready: true, instruction_id: '指示なし', updated_at: 't', recorded_at: 't' });
assert.strictEqual(body.staff_name, null);
assert.strictEqual(body.sign_status, '未署名');
assert.strictEqual(body.late_signed, 'はい');
assert.strictEqual(body.instruction_id, '指示なし');
assert.strictEqual(body.content, null);
assert.ok(!('signature_png' in body));
assert.deepStrictEqual(kvWriteErrors({ visit_date: '2026-10-30', user_id: 1, start_time: '06:30', end_time: '07:10', signer: 'あとで署名', staff_name: '' }), []);
assert.ok(kvWriteErrors({ visit_date: '2026-10-30', user_id: 1, start_time: '06:30', end_time: '07:10', signer: '本人', signature: '' }).includes('署名'));
assert.deepStrictEqual(kvWriteErrors({ visit_date: '2026-10-30', user_id: 1, start_time: '06:30', end_time: '07:10', signer: '本人', signature: 'data:image/png;base64,xx' }), []);

const kept = kvVisitBody({ visit_date: '2026-10-30', user_id: 1, staff_name: '見本ヘルパー', start_time: '09:00', end_time: '10:00', signer: '署名困難', sign_reason: '確認済み', updated_at: 't' });
assert.strictEqual(kept.staff_name, '見本ヘルパー');
assert.strictEqual(kept.sign_status, '署名済み');
assert.strictEqual(kept.signer_kind, '署名困難');
assert.strictEqual(kept.sign_reason, '確認済み');

const pending = [
  { userName: '見本太郎', visit_date: '2026-10-26', start_time: '06:30', sign_status: '未署名', late_signed: 'はい' },
  { userName: '見本太郎', visit_date: '2026-10-27', start_time: '07:00', sign_status: '未署名', late_signed: 'はい' },
  { userName: '見本花子', visit_date: '2026-10-20', start_time: '09:00', sign_status: '未署名', late_signed: 'はい' },
  { userName: '見本太郎', visit_date: '2026-10-26', start_time: '18:00', sign_status: '署名済み', late_signed: 'はい' }
];
assert.strictEqual(kvPendingLater(pending, '見本太郎', '2026-10-26').length, 2);
assert.strictEqual(kvPendingSummary(pending, '2026-10-30').thisWeek.users[0].count, 2);
assert.strictEqual(kvWeekStart('2026-10-30'), '2026-10-26');

assert.ok(src.includes('同じ建物で連続'));
assert.ok(src.includes('まとめて署名'));
assert.ok(src.includes('ログイン中の職員名を入れています'));
assert.ok(src.includes('full_name,nikki_name'));
assert.ok(src.includes("if (id === 'new' && KV.ctx && KV.ctx.ready) b.instruction_id = KV.ctx.value"));
assert.ok(!src.includes("'instruction_id'"));
assert.ok(src.includes('毎回書く必要はありません'));
assert.ok(!src.includes('nicchu'));

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.ok(html.includes("sub === 'write'") && html.includes('renderKinWrite'));
assert.ok(html.includes("sub === 'visit'"));

const win = {};
vm.runInNewContext(fs.readFileSync(path.join(root, 'config.js'), 'utf8'), { window: win });
const office = win.PORTAL_CONFIG.offices.find(o => o.id === 'kintoun');
assert.deepStrictEqual(Array.from(office.groups.slice(0, 4), g => g[1]), ['打刻', '記録記入', 'スケジュール表', '今月の記録']);
assert.ok(!office.groups.some(g => g[1] === '毎日の記録'));
assert.ok(!src.includes('毎日の記録') && !fs.readFileSync(path.join(root, 'config.js'), 'utf8').includes('毎日の記録'));
const byName = Object.fromEntries(office.tiles.map(t => [t[1], t[2]]));
assert.strictEqual(byName['記録記入'], '#kintoun/write');
assert.strictEqual(byName['今月の記録'], '#kintoun/visit');
assert.strictEqual(byName['出退勤打刻'], '#dakoku');
assert.strictEqual(byName['土日スケジュール'], 'gl:g23');
assert.ok(!office.tiles.some(t => t[1] === '訪問記録'));

console.log('kin_visit gas ok');
