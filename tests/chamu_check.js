// 茶夢: 日誌の転記と、署名済みだけを生活介護（種類22）の国保連CSVにする。B型の計算表には触らない。
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
vm.runInThisContext(fs.readFileSync(path.join(root, 'vendor/encoding.min.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(root, 'rydeen-billing-lib.js'), 'utf8') + ';globalThis.RydBilling=RydBilling;');
const src = fs.readFileSync(path.join(root, 'chamu.js'), 'utf8');
vm.runInThisContext(src.split('/* cm-pure */')[1].split('/* /cm-pure */')[0]);
const { buildBillingFiles, bytesLatin1 } = globalThis.RydBilling;
const L = ChamuLib;

const defaults = L.DEFAULTS;
assert.strictEqual(defaults.office_no, '2410202663');
assert.strictEqual(defaults.service_type, '22');
assert.strictEqual(defaults.region_code, '06');
assert.strictEqual(defaults.unit_price, '10.37');
assert.strictEqual(defaults.shogu_item, '5175');
assert.strictEqual(defaults.ishi_gen, true);
assert.strictEqual(L.bandOf('10:00', '16:00'), '6時間以上7時間未満');
assert.strictEqual(L.bandOf('10:00', '13:00'), '3時間以上4時間未満');
assert.strictEqual(L.bandOf('10:00', '12:30'), '3時間未満');
assert.strictEqual(L.lastDay('2026-10'), '31');
assert.strictEqual(L.lastDay('2026-02'), '28');

const baseUser = over => ({ user_id: 'u1', name: '利用者A', present: true, start_time: '10:00', end_time: '16:00', transport: '往復', meal: 'あり', support_note: '落ち着いて過ごした', ...over });
const form = users => ({ journal_date: '2026-10-01', staff_name: '職員', weather: '晴れ', menu: 'カレー', note: '', users });
assert.deepStrictEqual(L.validateJournal(form([baseUser()])), []);
assert.ok(L.validateJournal(form([baseUser({ present: null })])).some(e => e.includes('出欠')));
assert.ok(L.validateJournal(form([baseUser({ end_time: '09:00' })])).some(e => e.includes('終了')));
assert.ok(L.validateJournal(form([baseUser()]), defaults).length === 0);
const blank = L.prepareLine(baseUser({ start_time: '', end_time: '' }), defaults);
assert.strictEqual(blank.filled, true);
assert.strictEqual(blank.start_time, '10:00');
assert.strictEqual(blank.end_time, '16:00');

const plan1 = L.syncPlan([baseUser()], [], defaults);
assert.strictEqual(plan1.upsert.length, 1);
assert.strictEqual(plan1.upsert[0].signature_data, null);
assert.strictEqual(plan1.upsert[0].signed_at, null);
assert.strictEqual(plan1.del.length, 0);
const kept = L.syncPlan([baseUser()], [{ id: 'r1', user_id: 'u1', start_time: '10:00', end_time: '16:00', transport: '往復', meal: 'あり', support_note: '落ち着いて過ごした', signed_at: '2026-10-02T00:00:00Z' }], defaults);
assert.strictEqual(kept.upsert.length, 0);
assert.strictEqual(kept.del.length, 0);
const changed = L.syncPlan([baseUser({ meal: 'なし' })], [{ id: 'r1', user_id: 'u1', start_time: '10:00', end_time: '16:00', transport: '往復', meal: 'あり', support_note: '落ち着いて過ごした', signed_at: 't' }], defaults);
assert.strictEqual(changed.upsert.length, 1);
assert.strictEqual(changed.upsert[0].signed_at, null);
assert.ok(changed.notes.some(n => n.includes('署名を取り直')));
const drop = L.syncPlan([baseUser({ present: false })], [{ id: 'r1', user_id: 'u1', signed_at: null }], defaults);
assert.deepStrictEqual(drop.del, ['r1']);
const absent = L.syncPlan([baseUser({ present: false })], [{ id: 'r1', user_id: 'u1', signed_at: 't' }], defaults);
assert.deepStrictEqual(absent.del, []);
assert.ok(absent.notes.some(n => n.includes('残して')));

const user = (over = {}) => ({
  id: 'u1', name: 'テスト', kana: 'テスト', support_level: 4, recipient_no: '0000000001', city_no: '242012',
  cap_management: '無', cap_amount: 0, decision_code: '221000', contract_days: '原則',
  contract_start: '2026-03-01', contract_end: '2027-07-31', service_start: '2026-03-02', provider_entry_no: '1',
  meal_addon: true, transport_class: '2', ...over,
});
const rec = (over = {}) => ({ user_id: 'u1', service_date: '2026-10-01', start_time: '10:00', end_time: '16:00', transport: '往復', meal: 'あり', signed_at: '2026-10-02T01:00:00Z', ...over });
const run = (users, records, settings) => {
  const input = L.buildBillingInput(2026, 10, { settings: settings || { ...defaults }, users, records });
  assert.deepStrictEqual(input.blocking, [], input.blocking.join(' / '));
  const files = buildBillingFiles(2026, 10, { office: input.office, users: input.users, agg: input.agg }, new Date(2026, 10, 15));
  assert.deepStrictEqual(files.issues, [], files.issues.join(' / '));
  return { input, files, text: bytesLatin1(files.j111.bytes) + '\n' + bytesLatin1(files.j611.bytes) };
};

{
  const { files, text } = run([user()], [rec(), rec({ service_date: '2026-10-02', signed_at: null })]);
  const sum = 640 + 20 + 30, shogu = Math.round(sum * 0.096), total = sum + shogu;
  assert.strictEqual(files.summary.totalUnits, total, '区分4・6時間・医減・往復・食事');
  assert.strictEqual(files.summary.totalCost, Math.floor(total * 10.37));
  assert.strictEqual(files.summary.totalBurden, 0);
  assert.strictEqual(files.summary.ishiGen, true);
  assert.ok(text.includes('22HG18'), '医減 区分4 6-7時間');
  assert.ok(text.includes('225070'), '食事');
  assert.ok(text.includes('226592'), '送迎Ⅱ');
  assert.ok(text.includes('225175'), '処遇改善Ⅱロ');
  assert.ok(text.includes('221000') && text.includes('2410202663') && text.includes('"22"'));
  assert.ok(text.includes('0701'), '生活介護の実績記録票');
  assert.strictEqual(files.summary.users, 1);
}

{
  const { files, text } = run(
    [user({ id: 'u2', support_level: 3, city_no: '242024', recipient_no: '0000000002' })],
    [rec({ user_id: 'u2', transport: '片道', meal: 'なし' })]
  );
  const sum = 571 + 10, total = sum + Math.round(sum * 0.096);
  assert.strictEqual(files.summary.totalUnits, total, '区分3・片道・食事なし');
  assert.ok(text.includes('22HG30'));
  assert.ok(!text.includes('225070'));
}

{
  const { text } = run([user()], [rec()], { ...defaults, ishi_gen: false });
  assert.ok(text.includes('22HG12'), '医師配置ありの基本コード');
  assert.ok(!text.includes('22HG18'));
}

{
  const input = L.buildBillingInput(2026, 10, { settings: defaults, users: [user()], records: [rec({ signed_at: null })] });
  assert.strictEqual(input.agg.length, 0);
  assert.strictEqual(input.unsignedCount, 1);
  assert.strictEqual(input.signedCount, 0);
}

{
  const input = L.buildBillingInput(2026, 10, { settings: defaults, users: [user({ recipient_no: '' })], records: [rec()] });
  assert.ok(input.blocking.some(b => b.includes('受給者証')));
}

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const cfg = fs.readFileSync(path.join(root, 'config.js'), 'utf8');
assert.ok(html.includes('chamu.js?v=20261030chamu'));
assert.ok(html.includes("id === 'chamu' && sub && typeof renderChamu"));
assert.ok(cfg.includes("#chamu/journal") && cfg.includes("#chamu/records") && cfg.includes("#chamu/billing") && cfg.includes("#chamu/users"));
assert.ok(!cfg.includes('1FAIpQLScQvvpN0PxPNc6hUVuSth5OWDPY0wl_dkKgMOF1gpb5a5036g'));
assert.ok(cfg.includes('#rydeen/journal') && cfg.includes('#rydeen/billing'));
assert.ok(src.includes('職員が入力するのはここだけ'));
assert.ok(src.includes('署名をもらうと'));
assert.ok(src.includes('createSignPad'));
assert.ok(!src.includes('bp_journal') && !src.includes('bp_service_records'));
const sql = fs.readFileSync(path.join(root, 'supabase/chamu.sql'), 'utf8');
assert.ok(sql.includes('chamu_can()') && sql.includes('chamu_can_bill()') && sql.includes('2410202663'));
assert.ok(sql.includes("office = '茶夢'") && sql.includes('enable row level security'));
assert.ok(!sql.includes('日置') && !sql.includes('0000222844'));

console.log('chamu_check ok');
