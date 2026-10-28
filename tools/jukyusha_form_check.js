// jukyusha_lib.js（日付の読みかえ・入力の検証）の確認。実行：node tools/jukyusha_form_check.js ※架空のデータだけ
const J = require('../jukyusha_lib.js');
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} → ${JSON.stringify(a)}${JSON.stringify(a) === JSON.stringify(b) ? '' : '（期待 ' + JSON.stringify(b) + '）'}`);
const T = '2026-10-28';
// --- 日付 ---
eq(J.toIso({ era: '令和', y: 8, m: 9, d: 1 }), { iso: '2026-09-01' }, '令和8年9月1日');
eq(J.toIso({ era: '令和', y: '１', m: '５', d: '１' }), { iso: '2019-05-01' }, '令和元年5月1日（全角）');
eq(J.toIso({ era: '平成', y: 31, m: 4, d: 30 }), { iso: '2019-04-30' }, '平成31年4月30日');
eq(J.toIso({ era: '平成', y: 1, m: 1, d: 8 }), { iso: '1989-01-08' }, '平成元年1月8日');
ok(J.toIso({ era: '平成', y: 31, m: 5, d: 1 }).err, '平成31年5月1日はない（令和元年）');
ok(J.toIso({ era: '令和', y: 1, m: 4, d: 30 }).err, '令和元年4月30日はない（平成31年）');
ok(J.toIso({ era: '平成', y: 1, m: 1, d: 7 }).err, '平成元年1月7日はない（昭和64年）');
ok(J.toIso({ era: '令和', y: 8, m: 2, d: 30 }).err, '2月30日はない');
ok(J.toIso({ era: '令和', y: 0, m: 4, d: 1 }).err, '令和0年はない');
ok(J.toIso({ era: '令和', y: 8, m: 13, d: 1 }).err, '13月はない');
ok(J.toIso({ era: '令和', y: 'あ', m: 1, d: 1 }).err, '数字でない');
eq(J.toIso({ era: '西暦', y: 2026, m: 3, d: 31 }), { iso: '2026-03-31' }, '西暦2026年3月31日');
eq(J.toIso({ era: '西暦', y: 2024, m: 2, d: 29 }), { iso: '2024-02-29' }, 'うるう日');
ok(J.toIso({ era: '西暦', y: 2025, m: 2, d: 29 }).err, '2025年2月29日はない');
eq([J.jaDate('2026-09-01'), J.jaDate('2019-05-01'), J.jaDate('2019-04-30'), J.jaDate('1989-01-08')], ['令和8年9月1日', '令和元年5月1日', '平成31年4月30日', '平成元年1月8日'], '表示（令和・平成）');
// --- 入力の検証 ---
const good = () => ({ jukyusha_no: '0123456789', city_name: '見本市', city_no: '', guardian_name: '見本　花子', child_name: '見本 太郎',
  child_birth: { era: '西暦', y: 2019, m: 4, d: 2 }, issue_date: { era: '令和', y: 8, m: 3, d: 20 }, kind: '放デイ', contract_days: '20.0日/月',
  period_from: { era: '令和', y: 8, m: 4, d: 1 }, period_to: { era: '令和', y: 9, m: 3, d: 31 }, cap_monthly: { sel: '4600', other: '' }, cap_mgmt: '非該当', mushouka: 'unknown', memo: '' });
const v0 = J.validate(good(), T);
eq(v0.errors, {}, '正しい入力はエラーなし');
eq(v0.vals, { jukyusha_no: '0123456789', city_name: '見本市', guardian_name: '見本 花子', child_name: '見本 太郎', child_birth: '2019-04-02', issue_date: '2026-03-20', kind: '放デイ', contract_days: '20', period_from: '2026-04-01', period_to: '2027-03-31', cap_monthly: '4600', cap_mgmt: '非該当', mushouka: 'unknown' }, '送る値（空は入れない・全角空白は半角・20.0日/月→20）');
const mod = f => { const g = good(); f(g); return J.validate(g, T); };
ok(mod(g => g.jukyusha_no = '12345').errors.jukyusha_no, '受給者証番号 5桁はエラー');
ok(mod(g => g.jukyusha_no = '').errors.jukyusha_no, '受給者証番号 空はエラー');
ok(mod(g => g.jukyusha_no = '01234567ab').errors.jukyusha_no, '受給者証番号 英字はエラー');
eq(mod(g => g.jukyusha_no = '０１２３４５６７８９').vals.jukyusha_no, '0123456789', '受給者証番号 全角は半角にする');
eq(mod(g => g.jukyusha_no = '0123 456 789').vals.jukyusha_no, '0123456789', '受給者証番号 空白は除く');
ok(mod(g => g.city_no = '24202').errors.city_no, '市町村番号 5桁はエラー'); eq(mod(g => g.city_no = '242021').vals.city_no, '242021', '市町村番号 6桁');
ok(mod(g => g.guardian_name = ' ').errors.guardian_name, '保護者名 空はエラー'); ok(mod(g => g.child_name = '').errors.child_name, '児童名 空はエラー');
ok(mod(g => g.kind = '').errors.kind, 'サービス種類 未選択はエラー'); ok(mod(g => g.kind = '就労').errors.kind, 'サービス種類 ほかの値はエラー');
['0', '32', '二十', '20.5'].forEach(x => ok(mod(g => g.contract_days = x).errors.contract_days, `支給量 ${x} はエラー`));
eq(mod(g => g.contract_days = '２３').vals.contract_days, '23', '支給量 全角23');
ok(mod(g => g.period_to = { era: '令和', y: 8, m: 3, d: 31 }).errors.period_to, '期間 終わりがはじめより前はエラー');
ok(mod(g => g.period_to = { era: '令和', y: 20, m: 3, d: 31 }).errors.period_to, '期間 5年超はエラー');
ok(mod(g => g.period_from = { era: '', y: '', m: '', d: '' }).errors.period_from, '期間 はじめ 空はエラー');
ok(mod(g => g.child_birth = { era: '令和', y: 30, m: 1, d: 1 }).errors.child_birth, '生年月日 令和30年は先すぎる');
ok(mod(g => g.child_birth = { era: '西暦', y: 2030, m: 1, d: 1 }).errors.child_birth, '生年月日 未来はエラー');
eq(mod(g => g.child_birth = { era: '', y: '', m: '', d: '' }).errors, {}, '生年月日 空はよい（わかれば）');
eq(mod(g => g.issue_date = { era: '平成', y: 32, m: 1, d: 1 }).errors.issue_date ? 1 : 0, 1, '交付年月日 平成32年はエラー');
eq(mod(g => g.cap_monthly = { sel: '0', other: '' }).vals.cap_monthly, '0', '負担上限 0円');
eq(mod(g => g.cap_monthly = { sel: '37200', other: '' }).vals.cap_monthly, '37200', '負担上限 37,200円');
const oth = mod(g => g.cap_monthly = { sel: 'other', other: '９，３００' }); eq([oth.vals.cap_other, oth.vals.cap_monthly, oth.errors.cap_monthly], ['9300', undefined, undefined], '負担上限 その他 9,300（cap_monthly には入れない）');
ok(mod(g => g.cap_monthly = { sel: 'other', other: '' }).errors.cap_monthly, '負担上限 その他で金額なしはエラー');
ok(mod(g => g.cap_monthly = { sel: '', other: '' }).errors.cap_monthly, '負担上限 未選択はエラー');
ok(mod(g => g.cap_monthly = { sel: '1234', other: '' }).errors.cap_monthly, '負担上限 一覧にない値はエラー');
ok(mod(g => g.cap_mgmt = '？').errors.cap_mgmt, '上限額管理 ほかの値はエラー'); ok(mod(g => g.mushouka = 'maybe').errors.mushouka, '無償化 ほかの値はエラー');
ok(mod(g => g.memo = 'あ'.repeat(201)).errors.memo, 'メモ 201文字はエラー');
eq(J.validate({}, T).errors && Object.keys(J.validate({}, T).errors).sort(), ['cap_monthly', 'child_name', 'contract_days', 'guardian_name', 'jukyusha_no', 'kind', 'period_from', 'period_to'], '空のとき「必ず」の項目だけがエラー');
// --- 利用者情報の列への対応 ---
eq(J.toDb(v0.vals), { jukyusha_no: '0123456789', guardian_name: '見本 花子', kind: '放デイ', contract_days: 20, contract_end: '2027-03-31', cap_monthly: 4600 }, '列への対応（無償化「分からない」は入れない・period_from は入れない）');
eq(J.toDb({ ...v0.vals, mushouka: 'yes' }).mushouka, true, '無償化 はい→true'); eq(J.toDb({ ...v0.vals, mushouka: 'no' }).mushouka, false, '無償化 いいえ→false');
eq(J.toDb({ cap_other: '9300' }), {}, 'cap_other は反映しない（参考）');
ok(!J.FIELDS.some(f => f.map && !['jukyusha_no', 'city_no', 'guardian_name', 'kind', 'contract_days', 'contract_end', 'cap_monthly', 'mushouka'].includes(f.map)), '対応する列は既存の列だけ');
ok(J.svg(2).includes('<svg') && J.svg(2, true).includes('#e8833a'), '見本の図が作れる');
console.log(bad ? `\n${bad} 件 NG` : '\nすべて ok'); process.exit(bad ? 1 : 0);
