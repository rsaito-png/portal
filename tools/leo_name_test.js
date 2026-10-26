// 児童名の空白統一と、名前だけ／姓つきの結び付け（node tools/leo_name_test.js）
// SQL の同じ規則は tools/leo_sched_name_test.sql（本番には貼らない）
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const N = require('../leo_name.js');

assert.strictEqual(N.canonChildName('  山根\u3000\u3000一輝 \n'), '山根 一輝');
assert.strictEqual(N.canonChildName('山根  一輝'), '山根 一輝');
assert.strictEqual(N.canonChildName('山根\u00a0一輝'), '山根 一輝');
assert.strictEqual(N.canonChildName('山根一輝'), '山根一輝');
assert.notStrictEqual(N.canonChildName('山根一輝'), '山根 一輝');
assert.strictEqual(N.canonChildName('山根\u3000一輝').charCodeAt(2), 0x20);

function one(kata, answer) {
  const rows = N.resolveChildNames(kata, [answer]);
  assert.strictEqual(rows.length, 1, JSON.stringify(rows));
  return rows[0];
}

let r = one(['市川 碧音'], '碧音');
assert.strictEqual(r.kind, 'link');
assert.strictEqual(r.kata, '市川 碧音');
assert.strictEqual(r.answer, '碧音');

r = one(['山根 一輝'], '一輝');
assert.strictEqual(r.kind, 'link');
assert.strictEqual(r.kata, '山根 一輝');

r = one(['山根 一輝'], '山根\u3000一輝');
assert.strictEqual(r.kind, 'link');
assert.strictEqual(r.kata, '山根 一輝');
assert.strictEqual(r.answer, '山根\u3000一輝');

r = one(['市川 碧音'], '市川');
assert.strictEqual(r.kind, 'orphan');
assert.strictEqual(r.kata, null);

r = one(['山田 一輝'], '田一輝');
assert.strictEqual(r.kind, 'orphan');

r = one(['山根 一輝'], '山根一輝');
assert.strictEqual(r.kind, 'orphan');

const amb = N.resolveChildNames(['市川 碧音', '佐藤 碧音'], ['碧音']);
assert.strictEqual(amb.length, 2);
assert.ok(amb.every(x => x.kind === 'ambiguous'));
assert.deepStrictEqual(amb.map(x => x.kata).sort(), ['佐藤 碧音', '市川 碧音']);

const exactWins = N.resolveChildNames(['碧音', '市川 碧音'], ['碧音']);
assert.strictEqual(exactWins.length, 1);
assert.strictEqual(exactWins[0].kind, 'link');
assert.strictEqual(exactWins[0].kata, '碧音');

function labels(names) {
  return N.clusterChildNames(names).map(c => ({ label: c.label, raws: c.raws.slice().sort() }));
}
assert.deepStrictEqual(labels(['山根\u3000一輝', '山根 一輝', '一輝']), [
  { label: '山根 一輝', raws: ['一輝', '山根 一輝', '山根\u3000一輝'].sort() },
]);
assert.strictEqual(N.clusterChildNames(['市川 碧音', '佐藤 碧音', '碧音']).length, 3);
assert.deepStrictEqual(labels(['市川\u3000碧音', '碧音']), [
  { label: '市川 碧音', raws: ['市川\u3000碧音', '碧音'].sort() },
]);
assert.strictEqual(N.clusterChildNames(['市川', '市川 碧音']).length, 2);

function block(text, a, b) {
  const i = text.indexOf(a), j = text.indexOf(b);
  assert.ok(i >= 0 && j > i, a);
  return text.slice(i, j + b.length);
}
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const name = read('supabase/leo_sched_name.sql');
const left = read('supabase/leo_left.sql');
const sched = read('supabase/leo_schedule.sql');
const build = read('supabase/leo_schedule_build.sql');
const helpers = block(name, '-- BEGIN leo_name_helpers', '-- END leo_name_helpers');
const core = block(name, '-- BEGIN leo_sched_plan_core', '-- END leo_sched_plan_core');
for (const text of [left, sched, build]) assert.strictEqual(block(text, '-- BEGIN leo_name_helpers', '-- END leo_name_helpers'), helpers);
for (const text of [left, build]) assert.strictEqual(block(text, '-- BEGIN leo_sched_plan_core', '-- END leo_sched_plan_core'), core);
assert.ok(!/insert\s+into\s+leo_events/i.test(core));
const planStart = build.indexOf('create or replace function public.leo_sched_plan(');
const commitStart = build.indexOf('create or replace function public.leo_sched_commit(');
assert.ok(planStart >= 0 && commitStart > planStart);
assert.ok(!/insert\s+into\s+leo_events/i.test(build.slice(planStart, commitStart)));
assert.ok(sched.includes('cname := public.leo_name_canon'));
assert.ok(read('leo.js').includes('uiCanon(raw) !== name'));

console.log('leo_name_test ok');
