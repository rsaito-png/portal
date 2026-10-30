// サ責からの指示：有効な指示の選び方、指示ID、前回報告。画面の記入欄にはしない。
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'kin_visit.js'), 'utf8');
const pure = src.split('/* kv-pure */')[1].split('/* /kv-pure */')[0];
vm.runInThisContext(pure);

const all = { id: 'SJ-0002', target_user_id: null, start_date: '2026-10-01', end_date: null, content: '全員向け' };
const mine = { id: 'SJ-0001', target_user_id: 7, start_date: '2026-10-01', end_date: null, content: 'この人だけ' };
const other = { id: 'SJ-0003', target_user_id: 8, start_date: '2026-10-01', end_date: null, content: 'ほかの人' };
const ended = { id: 'SJ-0004', target_user_id: 7, start_date: '2026-09-01', end_date: '2026-09-30', content: '終了' };
const future = { id: 'SJ-0005', target_user_id: 7, start_date: '2026-11-01', end_date: null, content: '予定' };
const list = [future, other, ended, mine, all];

const active = kvActiveInstructions(list, 7, '2026-10-30');
assert.deepStrictEqual(active.map(i => i.id), ['SJ-0001', 'SJ-0002']);
assert.strictEqual(kvInstructionIdValue(active), 'SJ-0001,SJ-0002');
assert.strictEqual(kvInstructionIdValue([]), '指示なし');
assert.deepStrictEqual(kvActiveInstructions(list, 9, '2026-10-30').map(i => i.id), ['SJ-0002']);
assert.deepStrictEqual(kvActiveInstructions(list, 7, '2026-09-15').map(i => i.id), ['SJ-0004']);
assert.deepStrictEqual(kvActiveInstructions([{ id: 'SJ-0009', target_user_id: 7, start_date: '2026-10-30', end_date: '2026-10-30', content: '当日' }], 7, '2026-10-30').map(i => i.id), ['SJ-0009']);
assert.strictEqual(kvActiveInstructions([{ content: '' }], 7, '2026-10-30').length, 0);

assert.strictEqual(kvNextInstructionId([]), 'SJ-0001');
assert.strictEqual(kvNextInstructionId(list), 'SJ-0006');
assert.strictEqual(kvNextInstructionId([{ id: 'SJ-9999' }]), 'SJ-10000');

assert.strictEqual(kvInstructionStatus(ended, '2026-10-30'), '終了');
assert.strictEqual(kvInstructionStatus(future, '2026-10-30'), '予定');
assert.strictEqual(kvInstructionStatus(mine, '2026-10-30'), '有効');
assert.strictEqual(kvEndDate(mine, '2026-10-30'), '2026-10-29');
assert.strictEqual(kvEndDate(future, '2026-10-30'), '2026-10-31');
assert.strictEqual(kvAddDays('2026-03-01', -1), '2026-02-28');

const visits = [
  { id: 1, visit_date: '2026-10-28', start_time: '09:00', report1: '変化なし', report2: null },
  { id: 2, visit_date: '2026-10-30', start_time: '08:00', report1: null, report2: null, report3: null, report4: null, report5: null },
  { id: 3, visit_date: '2026-10-30', start_time: '09:00', report1: 'むせた' },
  { id: 4, visit_date: '2026-10-30', start_time: '11:00', report1: 'あとから' },
  { id: 5, visit_date: '2026-10-31', start_time: '09:00', report1: '未来' }
];
assert.strictEqual(kvPreviousVisit(visits, 'new', '2026-10-30', '10:00').id, 3);
assert.strictEqual(kvPreviousVisit(visits, 3, '2026-10-30', '09:00').id, 1);
assert.strictEqual(kvPreviousVisit(visits, 4, '2026-10-30', '').id, 3);
assert.strictEqual(kvPreviousVisit([], 1, '2026-10-30', ''), null);

assert.ok(src.includes('サ責からの指示'));
assert.ok(src.includes('Instruções da responsável'));
assert.ok(src.includes('今は指示がありません'));
assert.ok(!src.includes('id="kv_instruction_id"'));
assert.ok(!src.includes("kvLab('指示ID'"));
assert.ok(src.includes("if (id === 'new' && KV.ctx && KV.ctx.ready) b.instruction_id = KV.ctx.value"));
assert.ok(!src.includes("'instruction_id'"));
assert.ok(src.includes('毎回書く必要はありません'));

console.log('kin_visit instruction ok');
