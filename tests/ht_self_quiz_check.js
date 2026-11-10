// node tests/ht_self_quiz_check.js — 閲覧者は本人のテストだけ、編集者のボタンと保存は従来どおり
const vm = require('node:vm'), fs = require('node:fs'), assert = require('node:assert/strict');
const calls = [];
const ctx = vm.createContext({
  console, Date, localStorage: { getItem: () => '{"email":"viewer@example.invalid","token":"t","exp":' + (Date.now() + 9e6) + '}' },
  fetch: async () => { throw new Error('fetch unused'); },
  C: { supabaseUrl: 'http://example.invalid', supabaseKey: 'k' },
  esc: x => String(x ?? ''),
  alert: () => {}, confirm: () => true,
  sb: async (path, opt) => { calls.push({ path, opt }); return [{ id: 'saved' }]; }
});
vm.runInContext(fs.readFileSync('ht.js', 'utf8') + '\nglobalThis.HT=HT;globalThis.htTrain=htTrain;globalThis.htMergeAnswers=htMergeAnswers;', ctx);
const off = [{ id: 'o1', name: '見本事業所', types: ['児発'] }, { id: 'o2', name: '他事業所', types: ['訪問'] }];
const tr = [
  { id: 't1', name: '見本研修', months: [11], active: true, target_types: ['児発'], category: '', frequency: '', pass_score: 75 },
  { id: 't2', name: '対象外', months: [11], active: true, target_types: ['訪問'], category: '', frequency: '', pass_score: 75 }
];
const base = {
  off, allOff: off, tr, mat: [], qs: [], ev: [], evl: [], isAll: false, me: 'viewer@example.invalid',
  rec: [], staff: [], set: {}, acc: [], myOffs: ['o1'], editOffs: [], fy: 2026,
  myStaff: { id: 's1', name: '見本 花子', email: 'flower@example.invalid', main_office: 'o1', sub_offices: [], status: '在籍' }
};
ctx.HT.D = base;
ctx.HT.office = 'o1';
ctx.HT.fy = 2026;
let html = ctx.htTrain();
assert.match(html, /テストを受ける/);
assert.doesNotMatch(html, /記録を入力/);
assert.doesNotMatch(html, /対象外/);
ctx.HT.D = { ...base, myStaff: null };
assert.doesNotMatch(ctx.htTrain(), /テストを受ける/);
ctx.HT.D = { ...base, myStaff: { ...base.myStaff, status: '退職' } };
assert.doesNotMatch(ctx.htTrain(), /テストを受ける/);
ctx.HT.D = { ...base, myOffs: ['o2'], off: [off[1]], myStaff: { ...base.myStaff, main_office: 'o1' } };
assert.doesNotMatch(ctx.htTrain(), /テストを受ける/);
ctx.HT.D = { ...base, editOffs: ['o1'], isAll: false, myStaff: null };
html = ctx.htTrain();
assert.match(html, /テストを受ける/);
assert.match(html, /記録を入力/);
ctx.HT.D = { ...base, isAll: true, editOffs: ['o1', 'o2'], myOffs: ['o1', 'o2'], off };
html = ctx.htTrain();
assert.match(html, /記録を入力/);
assert.match(html, /統括責任者確認/);
const merged = ctx.htMergeAnswers(
  [{ training_id: 't1', no: 1, question: 'q', opt_a: 'あ' }],
  [{ training_id: 't1', no: 1, answer: 'B' }]
);
assert.equal(merged[0].answer, 'B');
assert.equal(ctx.htMergeAnswers([{ training_id: 't1', no: 1, question: 'q' }], [])[0].answer, undefined);
console.log('PASS: 閲覧者は対象の本人テストだけ、編集者と統括のボタンは残る');
