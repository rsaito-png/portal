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
assert.strictEqual(defaults.default_end, '14:00');
assert.strictEqual(L.INTAKE_DEFAULT, '100%');
assert.strictEqual(L.RICE_DEFAULT, '200g');
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
assert.strictEqual(blank.end_time, '14:00');
const filledEat = L.prepareLine(baseUser({ intake: '', intake_note: '残した' }), defaults);
assert.strictEqual(filledEat.intake, '100%');
assert.strictEqual(filledEat.intake_note, null);

const plan1 = L.syncPlan([baseUser()], [], defaults);
assert.strictEqual(plan1.upsert.length, 1);
assert.strictEqual(plan1.upsert[0].signature_data, null);
assert.ok(!('staff_name' in plan1.upsert[0]), '転記する実績票に記入者名は載せない');
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
assert.ok(/chamu\.js\?v=\d+/.test(html));
assert.ok(/leo\.js\?v=\d+/.test(html));
assert.ok(src.includes('@media screen and (min-width:900px)'));
assert.ok(src.includes('font-size:51px') && src.includes('font-size:17px'));
assert.ok(src.includes('.cm textarea{min-height:72px}') && src.includes('.cm textarea{min-height:216px}'));
assert.ok(src.includes('class="cm-who"'));
assert.ok(/leo_kinmu\.js\?v=\d+/.test(html));
assert.deepStrictEqual(L.journalSavedNotice([]), { title: '保存しました', body: '記録票に転記しました。' });
assert.deepStrictEqual(L.journalSavedNotice(null), { title: '保存しました', body: '記録票に転記しました。' });
assert.strictEqual(L.journalSavedNotice(['  ', '利用者A: 時刻空欄→11:00-15:00補完']).body, '記録票に転記しました。\n利用者A: 時刻空欄→11:00-15:00補完');
assert.ok(!/給与|受給者証/.test(L.journalSavedNotice(['利用者A: 署名を取り直してください。']).body));
assert.ok(html.includes("id === 'chamu' && sub && typeof renderChamu"));
assert.ok(cfg.includes("#chamu/journal") && cfg.includes("#chamu/kondate") && cfg.includes("#chamu/haichi") && cfg.includes("#chamu/kinmu") && cfg.includes("#chamu/records") && cfg.includes("#chamu/billing") && cfg.includes("#chamu/users"));
assert.ok(!cfg.includes('gl:g8'));
assert.ok(!cfg.includes('1FAIpQLScQvvpN0PxPNc6hUVuSth5OWDPY0wl_dkKgMOF1gpb5a5036g'));
assert.ok(cfg.includes('#rydeen/journal') && cfg.includes('#rydeen/billing'));
assert.ok(src.includes('職員が入力するのはここだけ'));
assert.ok(src.includes('署名をもらうと'));
assert.ok(src.includes('createSignPad'));
assert.ok(!src.includes('bp_journal') && !src.includes('bp_service_records'));
const sql = fs.readFileSync(path.join(root, 'supabase/chamu.sql'), 'utf8');
assert.ok(sql.includes('chamu_can()') && sql.includes('chamu_can_bill()') && sql.includes('2410202663'));
assert.ok(sql.includes("default '11:00'") && sql.includes("default '14:00'") && sql.includes("default '4時間以上5時間未満'"));
assert.ok(sql.includes("values (1, '4時間以上5時間未満', '11:00', '14:00')"));
assert.ok(sql.includes("default_end = '15:00'"));
assert.ok(!sql.includes("default '15:00'") && !sql.includes("default '10:00'") && !sql.includes("default '16:00'") && !sql.includes("default '6時間以上7時間未満'"));
assert.ok(sql.includes('extra_offices') && sql.includes("'茶夢' = any (coalesce(extra_offices, '{}'::text[]))"));
assert.ok(src.includes("default_start: '11:00'") && src.includes("default_end: '14:00'") && src.includes("|| '14:00'") && src.includes('11:00–14:00'));
assert.ok(!src.includes("default_end: '15:00'") && !src.includes("|| '15:00'") && !src.includes('11:00–15:00'));
assert.ok(src.includes('初期は100%') && src.includes('初期は200g') && !src.includes('初期は150g') && src.includes('começa em 200g') && !src.includes('começa em 150g') && src.includes('ChamuLib.INTAKE_DEFAULT') && src.includes('ChamuLib.RICE_DEFAULT'));
assert.ok(!src.includes('未記入でも保存できます') && !src.includes('Pode salvar sem preencher'));
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
  ['月', '11:00', '14:00'], ['火', '11:00', '14:00'], ['木', '11:00', '14:00'], ['金', '11:00', '14:00'],
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
  assert.ok(!htmlDay.includes('時給') && !htmlDay.includes('円') && !htmlDay.includes('重なって'));
  assert.deepStrictEqual(day.notes, []);
});
assert.strictEqual(fumiMin, 900);
assert.deepStrictEqual(L.dayShift('2026-11-06', seed).people.find(p => p.name === '安藤尚子'), { dow: '金', name: '安藤尚子', employment: '非常勤', start: '11:00', end: '14:00', sort: 30 });
assert.deepStrictEqual(L.dayShift('2026-11-02', seed).notes, []);
assert.deepStrictEqual(L.dayShift('2026-11-05', seed).notes, []);
assert.deepStrictEqual(L.dayShift('2026-11-06', seed).notes, []);
const friOverlap = L.dayShift('2026-11-06', seed.map(r => r.dow === '金' && r.staff_name === '安藤尚子' ? { ...r, end_time: '14:30' } : r));
assert.deepStrictEqual(friOverlap.notes, ['安藤尚子と中村文が 14:00〜14:30 重なっています']);
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
assert.ok(weekHtml.includes('10:00〜18:00') && weekHtml.includes('11:00〜14:00') && weekHtml.includes('配置はありません'));
assert.ok(!weekHtml.includes('14:30') && !weekHtml.includes('重なって'));
['齊藤', '中村友香', '安藤尚子', '中村文', '加藤幸弘'].forEach(n => assert.ok(weekHtml.includes(n), n));
assert.ok(!weekHtml.includes('時給') && !weekHtml.includes('1150') && !weekHtml.includes('80000') && !weekHtml.includes('11.5') && !weekHtml.includes('円'));
const dirty = L.dayShiftHtml('2026-11-02', [{ dow: '月', staff_name: '齊藤', employment: '常勤', start_time: '10:00', end_time: '18:00', hourly_wage: 'secret-pay' }]);
assert.ok(dirty.includes('齊藤') && dirty.includes('10:00〜18:00') && !dirty.includes('secret-pay'));
assert.ok(L.shiftIssues([{ dow: '火', staff_name: '加藤幸弘', employment: '非常勤', start_time: '11:00', end_time: '14:00' }]).some(s => s.includes('水曜')));
assert.ok(L.shiftIssues([{ dow: '月', staff_name: '中村文', employment: '非常勤', start_time: '14:30', end_time: '17:00' }]).some(s => s.includes('14:00〜17:00')));
assert.ok(L.shiftIssues([{ dow: '土', staff_name: '齊藤', employment: '常勤', start_time: '10:00', end_time: '18:00' }]).some(s => s.includes('土日')));
assert.ok(src.includes('CM_SHIFT_Q') && src.includes('chamu_shift?select=id,dow,staff_name,employment,start_time,end_time,sort'));
assert.ok(src.includes('ChamuLib.dayShiftHtml(date, shift.rows)') && src.includes('haichi: cmHaichi'));
assert.ok(src.includes('supabase/chamu_shift.sql') && !src.includes('leo_sheet') && !src.includes('時給') && !src.includes('1150') && !src.includes('80000'));

assert.strictEqual(L.userSymbol(0), 'A');
assert.strictEqual(L.userSymbol(1), 'B');
assert.strictEqual(L.userSymbol(25), 'Z');
assert.strictEqual(L.userSymbol(26), 'AA');
const eaten = L.prepareLine(baseUser({ meal: 'あり', intake: '80%', intake_note: '残した' }), defaults);
assert.strictEqual(eaten.intake, '80%');
assert.strictEqual(eaten.intake_note, null);
const other = L.prepareLine(baseUser({ intake: 'その他', intake_note: ' 半分残した ' }), defaults);
assert.strictEqual(other.intake, 'その他');
assert.strictEqual(other.intake_note, '半分残した');
const cleared = L.prepareLine(baseUser({ meal: 'なし', intake: '80%', intake_note: 'x' }), defaults);
assert.strictEqual(cleared.meal, 'なし');
assert.strictEqual(cleared.intake, null);
assert.strictEqual(cleared.intake_note, null);
const away = L.prepareLine(baseUser({ present: false, intake: '100%' }), defaults);
assert.strictEqual(away.meal, null);
assert.strictEqual(away.intake, null);
assert.deepStrictEqual(L.validateJournal(form([baseUser({ intake: '' })])), []);
assert.deepStrictEqual(L.validateJournal(form([baseUser({ intake: '50%' })])), []);
assert.deepStrictEqual(L.validateJournal(form([baseUser({ meal: 'なし', intake: '80%' })])), []);
assert.ok(L.validateJournal(form([baseUser({ intake: '73%' })])).some(e => e.includes('摂食')));
assert.ok(L.validateJournal({ ...form([baseUser()]), rice_portion: 'あ'.repeat(81) }).some(e => e.includes('ごはん')));
assert.deepStrictEqual(L.prepareHead({ menu: ' カレー ', rice_portion: '', egg_count: '1個', tofu_g: '  ', meat_note: '', fish_g: '', dairy_note: '' }), {
  menu: 'カレー', rice_portion: '200g', egg_count: '1個', tofu_g: null, meat_note: null, fish_g: null, dairy_note: null,
});
assert.strictEqual(L.prepareHead({ rice_portion: '半量75g' }).rice_portion, '半量75g');
assert.strictEqual(L.prepareHead({ rice_portion: '150g' }).rice_portion, '150g');
const mealPlan = L.syncPlan([baseUser({ meal: 'あり', intake: '80%' })], [], defaults);
assert.strictEqual(mealPlan.upsert[0].meal, 'あり');
assert.ok(!('intake' in mealPlan.upsert[0]) && !('intake_note' in mealPlan.upsert[0]));
const signedMeal = { id: 'r1', user_id: 'u1', start_time: '10:00', end_time: '16:00', transport: '往復', meal: 'あり', support_note: '落ち着いて過ごした', signed_at: 't' };
const intakeOnly = L.syncPlan([baseUser({ intake: '50%' })], [signedMeal], defaults);
assert.strictEqual(intakeOnly.upsert.length, 0);
assert.strictEqual(intakeOnly.del.length, 0);
assert.ok(src.includes("const mealOn = u.meal_addon !== false && r.meal === 'あり'"));
{
  const input = L.buildBillingInput(2026, 10, { settings: defaults, users: [user({ meal_addon: false })], records: [rec({ meal: 'あり' })] });
  assert.strictEqual(input.agg[0].食事回数, 0);
  assert.strictEqual(input.agg[0]['食事_01'], '0');
  assert.strictEqual(input.users[0].食事提供体制加算対象, '非対象');
  const files = buildBillingFiles(2026, 10, { office: input.office, users: input.users, agg: input.agg }, new Date(2026, 10, 15));
  assert.ok(!bytesLatin1(files.j111.bytes).includes('225070'));
}

const dietUsers = [
  { id: 'u1', sort: 1, active: true, name: '秘密太郎', recipient_no: '0000000001' },
  { id: 'u2', sort: 2, active: false, name: '非表示花子' },
  { id: 'u3', sort: 3, active: true, name: 'もう一人' },
];
const dietDays = [{
  journal_date: '2026-10-01', menu: 'カレー', rice_portion: '半量75g', egg_count: '1個', meat_note: '豚肉50g', fish_g: '',
  lines: [
    { user_id: 'u1', present: true, meal: 'あり', intake: '80%' },
    { user_id: 'u3', present: true, meal: 'なし', intake: '100%', intake_note: '無視' },
  ],
}, {
  journal_date: '2026-10-02', menu: '魚', fish_g: '80g',
  lines: [
    { user_id: 'u1', present: false, meal: null },
    { user_id: 'u2', present: true, meal: 'あり', intake: 'その他', intake_note: '半分残した' },
  ],
}];
const diet = L.menuReport('2026-10', dietDays, dietUsers);
assert.deepStrictEqual(diet.columns.map(c => c.symbol), ['A', 'B', 'C']);
assert.strictEqual(diet.rows[0].count, 1);
assert.strictEqual(diet.rows[0].cells[0].meal, 'あり');
assert.strictEqual(diet.rows[0].cells[0].intake, '80%');
assert.strictEqual(diet.rows[0].cells[1].meal, '');
assert.strictEqual(diet.rows[0].cells[2].meal, 'なし');
assert.strictEqual(diet.rows[0].cells[2].intake, '');
assert.ok(diet.rows[0].menu.includes('カレー／ごはん（炊いた後） 半量75g'));
assert.ok(diet.rows[0].menu.includes('卵 1個') && diet.rows[0].menu.includes('肉 豚肉50g'));
assert.ok(!diet.rows[0].menu.includes('豆腐') && !diet.rows[0].menu.includes('牛乳'));
assert.strictEqual(diet.rows[1].cells[0].meal, '');
assert.strictEqual(diet.rows[1].cells[1].intake, 'その他（半分残した）');
assert.strictEqual(diet.total, 2);
const mail = L.menuMail(diet);
assert.strictEqual(mail.to, 'makinakahigashi@gmail.com');
assert.strictEqual(mail.toName, '中東真紀');
assert.ok(mail.subject.includes('茶夢　献立報告　令和8年10月'));
assert.ok(mail.body.startsWith('中東真紀 様\n\nお世話になっております。生活介護事業所「茶夢」です。'));
assert.ok(mail.body.includes('氏名は書いていません'));
assert.ok(mail.body.includes('半量75g') && mail.body.includes('提供数'));
assert.ok(mail.gmail.startsWith('https://mail.google.com/mail/?') && mail.gmail.includes('view=cm') && !mail.gmail.includes('/send'));
assert.ok(mail.mailto.startsWith('mailto:makinakahigashi@gmail.com?subject='));
assert.ok(mail.csv.charCodeAt(0) === 0xfeff);
assert.ok(mail.csv.includes('日付,献立,A,A摂食,B,B摂食,C,C摂食,提供数'));
assert.ok(mail.csv.includes('あり,80%'));
const shown = mail.body + mail.csv + mail.gmail + mail.mailto + L.menuReportHtml(diet);
['秘密太郎', '非表示花子', 'もう一人', '0000000001', '受給者証', '時給'].forEach(s => assert.ok(!shown.includes(s), s));
assert.ok(src.includes('chamu_users?select=id,sort,active,use_days'));
assert.ok(src.includes('makinakahigashi@gmail.com') && src.includes("view: 'cm'") && src.includes('https://mail.google.com/mail/?'));
assert.ok(src.includes('ここから直接は送りません') && src.includes('Gmailで下書きを開く'));
assert.ok(!src.includes('https://mail.google.com/mail/send'));
assert.ok(sql.includes('chamu_line_intake') && sql.includes('rice_portion') && sql.includes('初期は200g') && !sql.includes('初期は150g') && sql.includes("intake in ('100%', '80%', '50%')"));
assert.ok(sql.includes('請求には使わない'));
assert.ok(sql.includes('chamu_record_name') && sql.includes('staff_profiles_chamu_record_name_len'));
assert.ok(sql.includes('利用者署名と国保連CSVには使わない'));
assert.ok(!sql.includes('dirceotsubo') && !sql.includes('nico705nico'));

const otsubo = { nikki_name: '大坪　シズカ', chamu_record_name: '安藤尚子' };
const ando = { nikki_name: '安藤　尚子' };
const saito = { nikki_name: '齊藤連' };
assert.strictEqual(L.journalStaffField(otsubo, ''), '大坪　シズカ');
assert.strictEqual(L.journalStaffField(otsubo, '安藤尚子'), '大坪　シズカ');
assert.strictEqual(L.journalStaffField(otsubo, '安藤　尚子'), '大坪　シズカ');
assert.strictEqual(L.journalStaffField(otsubo, '安藤'), '大坪　シズカ');
assert.strictEqual(L.journalStaffField(otsubo, '大坪 シズカ'), '大坪　シズカ');
assert.strictEqual(L.journalStaffField(otsubo, '齊藤連'), '齊藤連');
assert.strictEqual(L.journalStaffRecord(otsubo, '大坪　シズカ'), '安藤尚子');
assert.strictEqual(L.journalStaffRecord(otsubo, '大坪シズカ'), '安藤尚子');
assert.strictEqual(L.journalStaffRecord(otsubo, '安藤'), '安藤尚子');
assert.strictEqual(L.journalStaffRecord(otsubo, '安藤　尚子'), '安藤尚子');
assert.strictEqual(L.journalStaffRecord(otsubo, '齊藤連'), '齊藤連');
assert.strictEqual(L.journalStaffField(ando, ''), '安藤　尚子');
assert.strictEqual(L.journalStaffField(ando, '安藤尚子'), '安藤尚子');
assert.strictEqual(L.journalStaffRecord(ando, '安藤　尚子'), '安藤　尚子');
assert.strictEqual(L.journalStaffRecord(ando, '安藤尚子'), '安藤尚子');
assert.strictEqual(L.journalStaffField(saito, '齊藤連'), '齊藤連');
assert.strictEqual(L.journalStaffRecord(saito, '齊藤連'), '齊藤連');
assert.strictEqual(L.journalStaffField({}, '職員'), '職員');
assert.strictEqual(L.journalStaffRecord({}, ''), '');
assert.ok(src.includes('journalStaffRecord(CM.st.profile, form.staff_name)'));

const weekPeople = [
  { id: 'h', name: '日置広大', use_days: ['月', '火', '水', '木', '金'] },
  { id: 't', name: '柘山周磨', use_days: ['月', '火', '水', '木', '金'] },
  { id: 'm', name: '森井辰生', use_days: ['水', '金'] },
];
assert.deepStrictEqual(L.useDaysOf({ use_days: ['金', '水', '水', '土', '月'] }), ['月', '水', '金']);
assert.deepStrictEqual(L.useDaysOf({ use_days: '{水,金}' }), ['水', '金']);
assert.deepStrictEqual(L.useDaysOf({}), ['月', '火', '水', '木', '金']);
assert.deepStrictEqual(L.useDaysOf({ use_days: [] }), []);
assert.strictEqual(L.usesDay(weekPeople[2], '水'), true);
assert.strictEqual(L.usesDay(weekPeople[2], '月'), false);
assert.strictEqual(L.usesDay(weekPeople[2], '土'), false);
const monRoster = L.journalRoster(weekPeople, '2026-11-02', []);
assert.strictEqual(monRoster.dow, '月');
assert.deepStrictEqual(monRoster.shown.map(u => u.name), ['日置広大', '柘山周磨']);
assert.deepStrictEqual(monRoster.extra.map(u => u.name), ['森井辰生']);
const wedRoster = L.journalRoster(weekPeople, '2026-11-04', []);
assert.strictEqual(wedRoster.dow, '水');
assert.deepStrictEqual(wedRoster.shown.map(u => u.name), ['日置広大', '柘山周磨', '森井辰生']);
assert.deepStrictEqual(wedRoster.extra, []);
const friRoster = L.journalRoster(weekPeople, '2026-11-06', []);
assert.ok(friRoster.shown.some(u => u.name === '森井辰生'));
const tueRoster = L.journalRoster(weekPeople, '2026-11-03', []);
assert.ok(!tueRoster.shown.some(u => u.id === 'm') && tueRoster.extra.some(u => u.id === 'm'));
const keptRoster = L.journalRoster(weekPeople, '2026-11-02', [{ user_id: 'm', present: false }]);
assert.deepStrictEqual(keptRoster.shown.map(u => u.id), ['h', 't', 'm']);
assert.deepStrictEqual(keptRoster.extra, []);
const keptPresent = L.journalRoster(weekPeople, '2026-11-03', [{ user_id: 'm', present: true }]);
assert.ok(keptPresent.shown.some(u => u.id === 'm'));
const monLines = monRoster.shown.map(u => baseUser({ user_id: u.id, name: u.name }));
const monPlan = L.syncPlan(monLines, [], defaults);
assert.deepStrictEqual(monPlan.upsert.map(r => r.user_id), ['h', 't']);
assert.deepStrictEqual(monPlan.del, []);
assert.ok(!monPlan.upsert.some(r => r.user_id === 'm'), '予定外は欠席行も実績も作らない');
const satRoster = L.journalRoster(weekPeople, '2026-11-07', []);
assert.strictEqual(satRoster.shown.length, 0);
assert.strictEqual(satRoster.extra.length, 3);
assert.ok(html.includes('chamu.js?v=20261127logs'));

const logUsers = [
  { id: 'h', name: '日置広大', use_days: ['月', '火', '水', '木', '金'], active: true },
  { id: 't', name: '柘山周磨', use_days: ['月', '火', '水', '木', '金'], active: true },
  { id: 'm', name: '森井辰生', use_days: ['水', '金'], active: true, service_start: '2026-11-04' },
  { id: 'x', name: '停止', use_days: ['月', '火', '水', '木', '金'], active: false },
  { id: 'z', name: '曜日なし', use_days: [], active: true },
];
const logJ = [{
  journal_date: '2026-11-04',
  staff_name: '安藤',
  weather: '晴れ',
  menu: 'カレー',
  chamu_journal_line: [
    { user_id: 'h', present: true, start_time: '11:00', end_time: '14:00', meal: 'あり', support_note: '穏やか' },
  ],
}];
const logR = [{ user_id: 'h', service_date: '2026-11-04' }, { user_id: 'm', service_date: '2026-11-02' }];
const logToday = '2026-11-27';
const monthLog = L.journalMonthLog(logUsers, '2026-11', logJ, logR, logToday, '');
assert.ok(monthLog.days.length, '利用日が出ること');
assert.ok(monthLog.days[0].date >= monthLog.days[monthLog.days.length - 1].date, '新しい日が上');
const wedLog = monthLog.days.find(d => d.date === '2026-11-04');
assert.ok(wedLog && wedLog.hasJournal);
assert.strictEqual(wedLog.people.find(p => p.user_id === 'h').present, true);
assert.strictEqual(wedLog.people.find(p => p.user_id === 't').missing, true);
assert.strictEqual(wedLog.people.find(p => p.user_id === 'm').missing, true, '利用開始日は未記録');
assert.ok(!wedLog.people.some(p => p.user_id === 'x' && p.missing), '停止中は未記録にしない');
const monLog = monthLog.days.find(d => d.date === '2026-11-02');
assert.ok(monLog && !monLog.hasJournal);
assert.ok(monLog.people.find(p => p.user_id === 'h').missing);
assert.ok(monLog.people.find(p => p.user_id === 't').missing);
assert.ok(monLog.people.find(p => p.user_id === 'm').missing && monLog.people.find(p => p.user_id === 'm').hasRecord, '実績だけある予定外も未記録');
assert.ok(!monLog.people.some(p => p.user_id === 'm' && p.expected), '開始前は利用予定にしない');
assert.ok(!monthLog.days.some(d => d.date === '2026-11-07'), '土日で記録がなければ出さない');
assert.ok(!monthLog.days.some(d => d.date === '2026-11-30'), '未来の日は出さない');
assert.ok(!monthLog.days.some(d => d.people.some(p => p.user_id === 'z' && p.missing)), '利用曜日が空なら未記録にしない');
assert.ok(monthLog.missingCount > 0);
const onlyT = L.journalMonthLog(logUsers, '2026-11', logJ, logR, logToday, 't');
assert.ok(onlyT.days.every(d => d.people.every(p => p.user_id === 't')));
assert.ok(onlyT.missingCount > 0);
assert.ok(onlyT.days.some(d => d.date === '2026-11-04' && d.people[0].missing));
assert.deepStrictEqual(L.journalMonthLog(logUsers, '', [], [], logToday).days, []);
const ended = L.journalMonthLog([{ id: 'e', name: '終了', use_days: ['月'], active: true, contract_end: '2026-11-02' }], '2026-11', [], [], logToday, '');
assert.ok(ended.days.some(d => d.date === '2026-11-02' && d.people[0].missing));
assert.ok(!ended.days.some(d => d.date === '2026-11-09'));
assert.ok(src.includes("['logs', '日誌一覧']") && src.includes('function cmLogs') && src.includes('function cmOpenJournal') && src.includes('cmSaveJournal()'));
assert.ok(src.includes('journalMonthLog') && src.includes('cmBackLogs') && src.includes('この日を読む') && src.includes('記録漏れ'));
assert.ok(cfg.includes('#chamu/logs') && cfg.includes('日誌一覧') && cfg.includes('Lista de diários'));
const signPng = 'data:image/png;base64,aaaa';
const signRows = [
  { id: '11111111-1111-1111-1111-111111111111', service_date: '2026-11-18', start_time: '11:00', end_time: '14:00', transport: '往復', meal: 'あり', signed_at: null },
  { id: '22222222-2222-2222-2222-222222222222', service_date: '2026-11-16', start_time: '11:00', end_time: '14:00', transport: '片道', meal: 'なし', signed_at: null },
  { id: '33333333-3333-3333-3333-333333333333', service_date: '2026-11-13', start_time: '11:00', end_time: '14:00', transport: '往復', meal: 'あり', signed_at: '2026-11-13T00:00:00Z', signature_data: signPng },
];
assert.deepStrictEqual(L.unsignedRecords(signRows).map(r => r.service_date), ['2026-11-16', '2026-11-18']);
const signAll = L.batchSignPlan(signRows, signRows.map(r => r.id), signPng);
assert.deepStrictEqual(signAll.ids, ['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222']);
assert.strictEqual(signAll.signature, signPng);
assert.ok(!signAll.ids.includes('33333333-3333-3333-3333-333333333333'));
assert.deepStrictEqual(L.batchSignPlan(signRows, ['22222222-2222-2222-2222-222222222222'], signPng).ids, ['22222222-2222-2222-2222-222222222222']);
assert.strictEqual(L.batchSignPlan(signRows, [], signPng).error, '未署名の日がありません');
assert.strictEqual(L.batchSignPlan(signRows, ['33333333-3333-3333-3333-333333333333'], signPng).error, '署名済みの行は上書きしません');
assert.strictEqual(L.batchSignPlan(signRows, ['11111111-1111-1111-1111-111111111111'], 'nope').error, '署名を読み取れませんでした');
assert.strictEqual(L.batchSignPlan(signRows, ['11111111-1111-1111-1111-111111111111'], signPng + 'x'.repeat(300000)).error, '署名が大きすぎます。書き直してください');
assert.strictEqual(L.batchSignQuery(signAll.ids), 'chamu_service_records?id=in.(11111111-1111-1111-1111-111111111111,22222222-2222-2222-2222-222222222222)&signed_at=is.null');
assert.strictEqual(L.batchSignQuery(['drop table']), '');
assert.ok(src.includes('未署名をまとめて署名') && src.includes('cmBatchSave') && src.includes("onclick=\"cmSign('"));
assert.ok(src.includes('signed_at=is.null') && src.includes('class="pad cm-pad"'));
assert.ok(sql.includes("add column if not exists use_days text[] not null default '{月,火,水,木,金}'"));
assert.ok(src.includes('CM.st.users = roster.shown.slice()'));
assert.ok(src.includes('予定外の利用者を追加'));
assert.ok(src.includes('use_days: ChamuLib.USE_DAYS.filter'));
assert.ok(src.includes('id="u_day_') && src.includes('利用曜日'));
assert.ok(!src.includes('|| { present: false }'));
assert.ok(src.includes("const mealOn = u.meal_addon !== false && r.meal === 'あり'"));
assert.ok(src.includes('cm-staff-rec') && src.includes('nikki_name,chamu_record_name'));
assert.ok(src.includes('leoMyProfileQ'));

console.log('chamu_check ok');
