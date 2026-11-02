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
assert.strictEqual(defaults.default_start, '11:00');
assert.strictEqual(defaults.default_end, '15:00');
assert.strictEqual(defaults.standard_band, '4時間以上5時間未満');
assert.strictEqual(L.bandOf('11:00', '15:00'), '4時間以上5時間未満');
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
assert.strictEqual(blank.start_time, '11:00');
assert.strictEqual(blank.end_time, '15:00');

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
assert.ok(html.includes('chamu.js?v=202611021700'));
assert.ok(html.includes('leo_kinmu.js?v=20261102kinmu'));
assert.deepStrictEqual(L.journalSavedNotice([]), { title: '保存しました', body: '記録票に転記しました。' });
assert.deepStrictEqual(L.journalSavedNotice(null), { title: '保存しました', body: '記録票に転記しました。' });
assert.strictEqual(L.journalSavedNotice(['  ', '利用者A: 時刻空欄→11:00-15:00補完']).body, '記録票に転記しました。\n利用者A: 時刻空欄→11:00-15:00補完');
assert.ok(!/給与|受給者証/.test(L.journalSavedNotice(['利用者A: 署名を取り直してください。']).body));
assert.ok(html.includes("id === 'chamu' && sub && typeof renderChamu"));
assert.ok(cfg.includes("#chamu/journal") && cfg.includes("#chamu/haichi") && cfg.includes("#chamu/kinmu") && cfg.includes("#chamu/records") && cfg.includes("#chamu/billing") && cfg.includes("#chamu/users"));
assert.ok(!cfg.includes('1FAIpQLScQvvpN0PxPNc6hUVuSth5OWDPY0wl_dkKgMOF1gpb5a5036g'));
assert.ok(cfg.includes('#rydeen/journal') && cfg.includes('#rydeen/billing'));
assert.ok(src.includes('職員が入力するのはここだけ'));
assert.ok(src.includes('署名をもらうと'));
assert.ok(src.includes('createSignPad'));
assert.ok(!src.includes('bp_journal') && !src.includes('bp_service_records'));
const sql = fs.readFileSync(path.join(root, 'supabase/chamu.sql'), 'utf8');
assert.ok(sql.includes('chamu_can()') && sql.includes('chamu_can_bill()') && sql.includes('2410202663'));
assert.ok(sql.includes("default '11:00'") && sql.includes("default '15:00'") && sql.includes("default '4時間以上5時間未満'"));
assert.ok(sql.includes("values (1, '4時間以上5時間未満', '11:00', '15:00')"));
assert.ok(!sql.includes("default '10:00'") && !sql.includes("default '16:00'") && !sql.includes("default '6時間以上7時間未満'"));
assert.ok(src.includes("default_start: '11:00'") && src.includes("default_end: '15:00'") && src.includes('11:00–15:00'));
assert.ok(!src.includes("default_start: '10:00'") && !src.includes("|| '10:00'") && !src.includes("'16:00'") && !src.includes('10:00–16:00'));
assert.ok(sql.includes("office = '茶夢'") && sql.includes('enable row level security'));
assert.ok(!sql.includes('日置') && !sql.includes('0000222844'));

assert.deepStrictEqual(L.translateRequest('  olá  '), { body: { text: 'olá' } });
assert.strictEqual(L.translateRequest('').error, '訳す文を入れてください');
assert.strictEqual(L.translateRequest('   ').error, '訳す文を入れてください');
assert.strictEqual(L.translateRequest('あ'.repeat(2000)).body.text.length, 2000);
assert.strictEqual(L.translateRequest('あ'.repeat(2001)).error, '2000文字以内にしてください');
assert.strictEqual(L.translateResult(200, { translated: ' こんにちは ' }).translated, 'こんにちは');
assert.strictEqual(L.translateResult(200, { translated: '   ' }).error, '翻訳できませんでした');
assert.strictEqual(L.translateResult(400, { error: '訳す文を入れてください' }).error, '訳す文を入れてください');
assert.strictEqual(L.translateResult(403, {}).error, 'この操作の権限がありません');
assert.strictEqual(L.translateResult(404, {}).error, '翻訳の機能がまだ有効になっていません');
assert.strictEqual(L.translateResult(502, { error: 'xai-secretkeyvalue leak' }).error, '翻訳できませんでした');
assert.ok(src.includes("cmTranslate('j_note')") || src.includes('cmNoteField(\'j_note\''));
assert.ok(src.includes('日本語にする') && src.includes('/functions/v1/chamu-translate'));
assert.ok(src.includes('確認用。保存されるのは上の原文です'));
assert.ok(src.includes('note: form.note.trim()') && src.includes("support_note: u.present ? (u.support_note || '') : null"));
const saveFn = src.slice(src.indexOf('async function cmSaveJournal'), src.indexOf('async function cmApplySync'));
assert.ok(saveFn.includes('cmJournal()') && saveFn.indexOf('await cmJournal()') < saveFn.indexOf('cmNotice('));
assert.ok(saveFn.includes('journalSavedNotice') && saveFn.includes("notice: '保存できませんでした'"));
assert.ok(saveFn.includes('日誌を保存できませんでした。もう一度押してください。'));
assert.ok(src.includes('function cmNotice') && src.includes("el.id = 'cm_dlg'") && src.includes('通信できませんでした'));
assert.ok(src.includes('data-cm-save') && src.includes('保存して記録票に転記'));
assert.ok(!src.includes('XAI_API_KEY'));
const fn = fs.readFileSync(path.join(root, 'supabase/functions/chamu-translate/index.ts'), 'utf8');
assert.ok(fn.includes('rpc/chamu_can') && fn.includes('XAI_API_KEY') && fn.includes('grok-4-fast-non-reasoning'));
assert.ok(fn.includes('https://api.x.ai/v1/chat/completions') && fn.includes('固有名詞') && fn.includes('訳文だけ'));
assert.ok(!/xai-[A-Za-z0-9]{8,}/.test(fn));
const toml = fs.readFileSync(path.join(root, 'supabase/config.toml'), 'utf8');
assert.ok(toml.includes('chamu-translate'));
assert.ok(!/\[functions\.chamu-translate\][^[]*verify_jwt\s*=\s*false/.test(toml));

const shiftSql = fs.readFileSync(path.join(root, 'supabase/chamu_shift.sql'), 'utf8');
assert.ok(shiftSql.includes('enable row level security'));
assert.ok(shiftSql.includes('using (public.chamu_can())'));
assert.ok(shiftSql.includes('grant select on public.chamu_shift to authenticated'));
assert.ok(shiftSql.includes('revoke all on public.chamu_shift from anon, authenticated, public'));
assert.ok(!/grant\s+(insert|update|delete|all)\b/i.test(shiftSql));
assert.ok(!/for\s+(insert|update|delete|all)\b/i.test(shiftSql));
assert.ok(!shiftSql.includes('leo_sheet') && !shiftSql.includes('時給') && !shiftSql.includes('1150') && !shiftSql.includes('80000') && !shiftSql.includes('11.5'));
assert.ok(shiftSql.includes("staff_name <> '中村文' or (start_time = '14:00' and end_time = '17:00')"));
assert.ok(shiftSql.includes("staff_name <> '加藤幸弘' or dow = '水'"));
assert.ok(shiftSql.includes("staff_name <> '安藤尚子' or dow <> '水'"));
const seed = [];
const seedRe = /\('([月火水木金])', '([^']+)', '(常勤|非常勤)', '(\d{2}:\d{2})', '(\d{2}:\d{2})', (\d+)\)/g;
let seedM;
while ((seedM = seedRe.exec(shiftSql))) seed.push({ dow: seedM[1], staff_name: seedM[2], employment: seedM[3], start_time: seedM[4], end_time: seedM[5], sort: +seedM[6] });
assert.strictEqual(seed.length, 20);
assert.deepStrictEqual(L.shiftIssues(seed), []);
['月', '火', '水', '木', '金'].forEach(dow => {
  assert.deepStrictEqual(seed.filter(r => r.dow === dow && r.employment === '常勤').map(r => r.staff_name), ['齊藤', '中村友香'], dow);
});
assert.deepStrictEqual(seed.filter(r => r.staff_name === '安藤尚子').map(r => [r.dow, r.start_time, r.end_time]), [
  ['月', '11:00', '14:00'], ['火', '11:00', '14:00'], ['木', '11:00', '14:00'], ['金', '11:00', '14:30'],
]);
assert.deepStrictEqual(seed.filter(r => r.staff_name === '加藤幸弘').map(r => [r.dow, r.start_time, r.end_time]), [['水', '11:00', '14:00']]);
assert.strictEqual(seed.filter(r => r.staff_name === '中村文').length, 5);
const weekDates = { 月: '2026-11-02', 火: '2026-11-03', 水: '2026-11-04', 木: '2026-11-05', 金: '2026-11-06' };
let fumiMin = 0;
Object.entries(weekDates).forEach(([dow, ymd]) => {
  assert.strictEqual(L.dowOf(ymd), dow);
  const day = L.dayShift(ymd, seed);
  assert.strictEqual(day.open, true);
  assert.deepStrictEqual(day.people.map(p => p.name), seed.filter(r => r.dow === dow).sort((a, b) => a.sort - b.sort).map(r => r.staff_name));
  const fumi = day.people.find(p => p.name === '中村文');
  assert.deepStrictEqual([fumi.start, fumi.end], ['14:00', '17:00']);
  fumiMin += 180;
  const htmlDay = L.dayShiftHtml(ymd, seed);
  day.people.forEach(p => { assert.ok(htmlDay.includes(p.name) && htmlDay.includes(p.start + '〜' + p.end)); });
  assert.ok(!htmlDay.includes('時給') && !htmlDay.includes('円'));
});
assert.strictEqual(fumiMin, 900);
assert.deepStrictEqual(L.dayShift('2026-11-02', seed).notes, []);
assert.deepStrictEqual(L.dayShift('2026-11-05', seed).notes, []);
assert.deepStrictEqual(L.dayShift('2026-11-06', seed).notes, ['安藤尚子と中村文が 14:00〜14:30 重なっています']);
assert.ok(L.dayShift('2026-11-04', seed).people.some(p => p.name === '齊藤'));
assert.ok(!L.dayShift('2026-11-04', seed).people.some(p => p.name === '安藤尚子'));
assert.ok(L.dayShift('2026-11-05', seed).people.some(p => p.name === '安藤尚子' && p.start === '11:00' && p.end === '14:00'));
const sat = L.dayShift('2026-11-07', seed), sun = L.dayShift('2026-11-08', seed);
assert.strictEqual(sat.dow, '土');
assert.strictEqual(sun.dow, '日');
assert.strictEqual(sat.open, false);
assert.strictEqual(sun.open, false);
assert.strictEqual(sat.people.length, 0);
assert.ok(L.dayShiftHtml('2026-11-07', seed).includes('土日は配置がありません'));
const weekHtml = L.weekShiftHtml(seed);
assert.ok(weekHtml.includes('10:00〜18:00') && weekHtml.includes('14:30') && weekHtml.includes('配置はありません'));
assert.ok(weekHtml.includes('安藤尚子と中村文が 14:00〜14:30 重なっています'));
['齊藤', '中村友香', '安藤尚子', '中村文', '加藤幸弘'].forEach(n => assert.ok(weekHtml.includes(n), n));
assert.ok(!weekHtml.includes('時給') && !weekHtml.includes('1150') && !weekHtml.includes('80000') && !weekHtml.includes('11.5') && !weekHtml.includes('円'));
const dirty = L.dayShiftHtml('2026-11-02', [{ dow: '月', staff_name: '齊藤', employment: '常勤', start_time: '10:00', end_time: '18:00', hourly_wage: 'secret-pay' }]);
assert.ok(dirty.includes('齊藤') && dirty.includes('10:00〜18:00') && !dirty.includes('secret-pay'));
assert.ok(L.shiftIssues([{ dow: '火', staff_name: '加藤幸弘', employment: '非常勤', start_time: '11:00', end_time: '14:00' }]).some(s => s.includes('水曜')));
assert.ok(L.shiftIssues([{ dow: '月', staff_name: '中村文', employment: '非常勤', start_time: '14:30', end_time: '17:00' }]).some(s => s.includes('14:00〜17:00')));
assert.ok(L.shiftIssues([{ dow: '土', staff_name: '齊藤', employment: '常勤', start_time: '10:00', end_time: '18:00' }]).some(s => s.includes('土日')));
assert.ok(src.includes('CM_SHIFT_Q') && src.includes('chamu_shift?select=dow,staff_name,employment,start_time,end_time,sort'));
assert.ok(src.includes('ChamuLib.dayShiftHtml(date, shift.rows)') && src.includes('haichi: cmHaichi'));
assert.ok(src.includes('supabase/chamu_shift.sql') && !src.includes('leo_sheet') && !src.includes('時給') && !src.includes('1150') && !src.includes('80000'));

console.log('chamu_check ok');
