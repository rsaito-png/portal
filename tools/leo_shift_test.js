// 実態のシフト（leo_shift.js）の計算テスト：型＋その日だけの変更のマージ、休みの除外、11/27 安藤休み
const assert = require('assert');
const S = require('../leo_shift.js');
const A = 'ando', K = 'kato', Y = 'yokota', F = 'fumi';
const data = {
  staff: [{ user_id: A, name: '安藤　尚子' }, { user_id: K, name: '加藤　幸弘' }, { user_id: Y, name: '横田　祥' }, { user_id: F, name: '中村　文' }],
  base: [
    { user_id: A, dow: 1, start: '10:30', end: '14:30' }, { user_id: A, dow: 5, start: '10:30', end: '14:30' },
    { user_id: K, dow: 5, start: '15:00', end: '17:00' },
    { user_id: Y, dow: 1, start: '10:00', end: '12:00' },
    { user_id: F, dow: 1, start: '14:00', end: '17:00' }, { user_id: F, dow: 2, start: '15:30', end: '17:00' },
    { user_id: F, dow: 4, start: '14:30', end: '17:00' }, { user_id: F, dow: 5, start: '14:00', end: '17:00' }],
  days: [
    { id: 1, day: '2026-11-27', user_id: A, kind: '休み', note: '安藤先生休み' },
    { id: 2, day: '2026-11-24', user_id: F, kind: '時間変更', start: '16:00', end: '17:30' },
    { id: 3, day: '2026-11-25', user_id: K, kind: '追加', start: '11:00', end: '13:00', note: '代わり' }],
};
// 曜日・週
assert.strictEqual(S.shiftDow('2026-11-27'), 5);
assert.strictEqual(S.shiftMonday('2026-11-27'), '2026-11-23');
assert.strictEqual(S.shiftMonday('2026-11-23'), '2026-11-23');
assert.strictEqual(S.shiftMonday('2026-11-29'), '2026-11-23');
// 型
let c = S.shiftCell(data, '2026-11-20', A);
assert.strictEqual(c.state, 'base'); assert.deepStrictEqual(c.slots, [{ start: '10:30', end: '14:30' }]);
// 27日 安藤は休み（型はあるが消える）
c = S.shiftCell(data, '2026-11-27', A);
assert.strictEqual(c.state, 'off'); assert.strictEqual(c.slots.length, 0); assert.strictEqual(c.note, '安藤先生休み'); assert.strictEqual(c.base.length, 1);
// 時間変更
c = S.shiftCell(data, '2026-11-24', F);
assert.strictEqual(c.state, 'change'); assert.deepStrictEqual(c.slots, [{ start: '16:00', end: '17:30' }]);
// 型のない日の追加
c = S.shiftCell(data, '2026-11-25', K);
assert.strictEqual(c.state, 'add'); assert.strictEqual(c.slots[0].start, '11:00');
// 入らない日
assert.strictEqual(S.shiftCell(data, '2026-11-25', A).state, 'none');
// 27日に入る人：安藤は外れ、加藤・文が入る
assert.deepStrictEqual(S.shiftOnDuty(data, '2026-11-27').sort(), ['中村　文', '加藤　幸弘'].sort());
assert.deepStrictEqual(S.shiftOnDuty(data, '2026-11-20').sort(), ['中村　文', '加藤　幸弘', '安藤　尚子'].sort());
// 時刻つき（前後30分まで）
assert.deepStrictEqual(S.shiftOnDuty(data, '2026-11-23', '10:15').sort(), ['安藤　尚子', '横田　祥'].sort());
assert.deepStrictEqual(S.shiftOnDuty(data, '2026-11-23', '17:20'), ['中村　文']);
assert.deepStrictEqual(S.shiftOnDuty(data, '2026-11-23', '18:00'), []);
// 候補：常勤（表にいない）は残る、休みは外れる、シフト外は別枠
const names = ['齊藤連', '中村　友香', '安藤　尚子', '加藤　幸弘', '横田　祥', '中村　文', '保護者'];
let k = S.shiftCandidates(names, data, '2026-11-27', '16:00');
assert.ok(k.main.includes('齊藤連') && k.main.includes('中村　友香') && k.main.includes('保護者'));
assert.ok(k.main.includes('加藤　幸弘') && k.main.includes('中村　文'));
assert.deepStrictEqual(k.off, ['安藤　尚子']);
assert.deepStrictEqual(k.other, ['横田　祥']);
// 選択肢：休みの安藤は出ない。ただし保存済みなら残して選んだまま（書き換えない）
let h = S.shiftOptionsHtml(names, data, '2026-11-27', '16:00', '');
assert.ok(!h.includes('安藤'));
assert.ok(h.includes('<optgroup label="シフト外"><option value="横田　祥">'));
h = S.shiftOptionsHtml(names, data, '2026-11-27', '16:00', '安藤 尚子');
assert.ok(h.includes('<option value="安藤 尚子" selected>'));
h = S.shiftOptionsHtml(names, data, '2026-11-27', '16:00', '知らない人');
assert.ok(h.includes('<option value="知らない人" selected>'));
// シフトが読めないときは従来どおり全員
assert.deepStrictEqual(S.shiftCandidates(names, null, '2026-11-27').main, names);
// カレンダー用：27日は 安藤＝不在（休み）、文・加藤＝勤務。古い Google の勤務行（同じ人）はシフトを優先して隠す
const ev = S.shiftEvents(data, '2026-11-27', '2026-11-27');
assert.ok(ev.some(e => e.kind === '不在' && e.staff === '安藤　尚子' && /休み（安藤先生休み）/.test(e.title)));
assert.ok(ev.some(e => e.kind === '勤務' && e.staff === '中村　文' && e.title === '14:00〜17:00'));
assert.ok(ev.every(e => !e.id));
const old = [{ id: 9, day: '2026-11-27', kind: '勤務', staff: '中村 文', title: 'あや先生 14:00' }, { id: 10, day: '2026-11-27', kind: '勤務', staff: '齊藤　連', title: '' }, { id: 11, day: '2026-11-27', kind: '利用', child: 'x' }];
const merged = S.shiftMergeEvents(old, data, '2026-11-27', '2026-11-27');
assert.ok(!merged.some(e => e.id === 9));
assert.ok(merged.some(e => e.id === 10) && merged.some(e => e.id === 11));
assert.strictEqual(S.shiftMergeEvents(old, null, '2026-11-27', '2026-11-27'), old);
// 打刻との照らし合わせ（管理者用）
const d2 = { ...data, punches: [{ user_id: A, day: '2026-11-20', in: '10:27', out: '14:30' }, { user_id: F, day: '2026-11-20', in: '14:25', out: '17:00' }, { user_id: A, day: '2026-11-24', in: '10:27', out: '15:33' }] };
const gaps = S.shiftPunchGaps(d2, ['2026-11-20', '2026-11-24', '2026-11-27'], '2026-11-26');
assert.ok(gaps.some(g => /11\/20.*中村 文.*14:25/.test(g)));
assert.ok(!gaps.some(g => /11\/20.*安藤/.test(g)));
assert.ok(gaps.some(g => /11\/24.*安藤.*予定はありません/.test(g)));
assert.ok(gaps.some(g => /11\/20.*加藤.*出勤の打刻がありません/.test(g)));
assert.ok(!gaps.some(g => /11\/27/.test(g)));
assert.deepStrictEqual(S.shiftPunchGaps(data, ['2026-11-20'], '2026-11-26'), []);
console.log('leo_shift_test: ok');
