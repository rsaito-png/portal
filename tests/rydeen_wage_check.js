const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '..');
vm.runInThisContext(fs.readFileSync(path.join(root, 'rydeen-wage-lib.js'), 'utf8'));
const W = globalThis.RydWage;
const day = (over) => Object.assign({ worker_id: 'a', journal_date: '2026-10-01', status: '通所', start_time: '09:30', end_time: '15:00', break_min: 60 }, over);

assert.strictEqual(W.workMinutes(day()), 270);
assert.strictEqual(W.amount(270, 75), 337);
assert.strictEqual(W.amount(270, 60), 270);
assert.strictEqual(W.amount(270, 90), 405);
assert.strictEqual(W.amount(1, 60), 1);
assert.strictEqual(W.amount(0, 90), 0);
assert.strictEqual(W.amount(270, 45), null);
assert.strictEqual(W.hoursText(270), '4.50');
assert.strictEqual(W.hoursJa(270), '4時間30分');
assert.strictEqual(W.hoursNumber(61), 1.02);
assert.strictEqual(W.workMinutes(day({ status: '欠席', start_time: '09:30', end_time: '15:00' })), 0);
assert.strictEqual(W.workDetail(day({ status: '欠席' })).gap, false);
assert.strictEqual(W.workMinutes(day({ status: '休み' })), 0);
assert.strictEqual(W.workMinutes(day({ status: '' })), 0);
assert.strictEqual(W.workMinutes(day({ status: '施設外就労' })), 270);
assert.strictEqual(W.workMinutes(day({ status: '在宅', end_time: '12:00', break_min: 0 })), 150);
assert.strictEqual(W.workMinutes(day({ end_time: '09:30' })), 0);
assert.strictEqual(W.workDetail(day({ end_time: '' })).gap, true);
assert.strictEqual(W.workMinutes(day({ start_time: '09:30:00', end_time: '15:00:00' })), 270);
assert.strictEqual(W.payDate('2026-10'), '2026-11-15');
assert.strictEqual(W.payDate('2026-12'), '2027-01-15');
assert.strictEqual(W.monthEnd('2026-02'), '2026-02-28');
assert.strictEqual(W.monthEnd('2026-13'), null);

const workers = [{ id: 'a', display_name: '山田' }, { id: 'b', display_name: '佐藤' }, { id: 'c', display_name: '未設定さん' }];
const journals = [
  day(),
  day({ journal_date: '2026-10-02', status: '欠席' }),
  day({ worker_id: 'b', journal_date: '2026-10-03', status: '休み' }),
  day({ worker_id: 'b', journal_date: '2026-11-01' }),
  day({ worker_id: 'c', status: '通所', end_time: '' }),
];
const rates = { a: 75, b: 60 };
let plan = W.planUpserts({ workers, journals, rates, existing: [{ worker_id: 'a', status: 'confirmed', bonus: 1000, paid_at: '2026-11-14' }], yearMonth: '2026-10', force: false });
assert.deepStrictEqual(plan.skipped, ['a']);
assert.deepStrictEqual(plan.missing, ['c']);
assert.strictEqual(plan.rows.length, 1);
assert.strictEqual(plan.rows[0].worker_id, 'b');
assert.strictEqual(plan.rows[0].minutes, 0);
assert.strictEqual(plan.rows[0].amount, 0);
assert.strictEqual(plan.rows[0].status, 'draft');
assert.strictEqual(plan.gaps, 1);

plan = W.planUpserts({ workers, journals, rates, existing: [{ worker_id: 'a', status: 'confirmed', bonus: 1000, paid_at: '2026-11-14' }, { worker_id: 'b', status: 'draft', bonus: 500, paid_at: null }], yearMonth: '2026-10', force: true });
const a = plan.rows.find(r => r.worker_id === 'a');
assert.strictEqual(a.minutes, 270);
assert.strictEqual(a.amount, 337);
assert.strictEqual(a.hours, 4.5);
assert.strictEqual(a.bonus, 1000);
assert.strictEqual(a.paid_at, '2026-11-14');
assert.strictEqual(a.status, 'draft');
assert.strictEqual(a.confirmed_at, null);
assert.strictEqual(plan.rows.find(r => r.worker_id === 'b').bonus, 500);
assert.strictEqual(plan.gaps, 1);
assert.deepStrictEqual(W.planUpserts({ workers: [], journals, rates, existing: [], yearMonth: '2026-10' }).rows, []);

const view = W.monthView(workers, rates, [{ id: 'row-a', worker_id: 'a', minutes: 270, hourly_rate: 75, amount: 337, bonus: 0, status: 'draft', paid_at: null }]);
assert.strictEqual(view[0].saved, true);
assert.strictEqual(view[1].saved, false);
assert.strictEqual(view[1].hourly_rate, 60);
assert.strictEqual(view[2].hourly_rate, null);
assert.deepStrictEqual(W.forWorker([{ worker_id: 'a', status: 'draft', year_month: '2026-10' }, { worker_id: 'b', status: 'confirmed', year_month: '2026-09' }, { worker_id: 'a', status: 'confirmed', year_month: '2026-10' }, { worker_id: 'a', status: 'confirmed', year_month: '2026-08' }], 'a').map(r => r.year_month), ['2026-10', '2026-08']);

const csv = W.csv([{ name: '山"田', year_month: '2026-10', hours: '4.50', rate: 75, amount: 337, bonus: 1000 }]);
assert.ok(csv.startsWith('\uFEFF'));
assert.ok(csv.includes('"氏名","年月","時間","時給","金額","賞与"'));
assert.ok(csv.includes('"山""田","2026-10","4.50","75","337","1000"'));

const sql = fs.readFileSync(path.join(root, 'supabase/rydeen_wage.sql'), 'utf8');
const ry = fs.readFileSync(path.join(root, 'rydeen.js'), 'utf8');
const cfg = fs.readFileSync(path.join(root, 'config.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'rydeen-wage.js'), 'utf8');
assert.ok(sql.includes("status = 'confirmed' and worker_id = auth.uid() and office = public.bp_my_office()"));
assert.ok(sql.includes('revoke all on public.bp_wage_rates from public, anon'));
assert.ok(sql.includes('revoke all on public.bp_wage_months from public, anon'));
assert.ok(!sql.includes('user_metadata'));
assert.ok(!/create policy bp_wage_months_worker_[a-z]+ on[\s\S]*for (insert|update|delete|all)/i.test(sql));
assert.ok(sql.includes('bp_wage_months_amount_floor'));
assert.ok(ry.includes("['wage', '工賃']") && ry.includes('RY_FILES') && ry.includes("sub === 'wage'"));
assert.ok(cfg.includes('#rydeen/wage'));
assert.ok(html.includes('rydeen.js?v=20261102wage'));
assert.ok(ui.includes('日誌から再計算') && ui.includes('下書きを確定') && ui.includes('確定した工賃はまだありません'));
assert.ok(ui.includes('利用者がまだ登録されていません'));

(async () => {
global.window = global;
global.RV = {}; global.RW = {}; global.RYD = { me: { uid: 'me', name: '本人', office: 'RYDEEN', role: 'admin' }, st: {}, workers: [] };
global.ryScript = () => Promise.resolve();
global.ryToday = () => '2026-10-31';
global.ryEsc = s => String(s ?? '');
global.ryInp = (id, label, val) => `<input id="${id}" value="${val}">`;
global.ryV = id => (global.document && global.document.getElementById(id) ? global.document.getElementById(id).value : '');
global.ryC = () => false;
let shown = '';
global.ryAdminFrame = (cur, html) => { shown = html; assert.strictEqual(cur, 'wage'); };
global.ryWorkerFrame = (cur, html) => { shown = html; assert.strictEqual(cur, 'wage'); };
global.rb = async path => {
  if (String(path).startsWith('bp_wage_rates')) return [];
  if (String(path).startsWith('bp_wage_months')) return [];
  throw new Error('unexpected ' + path);
};
vm.runInThisContext(fs.readFileSync(path.join(root, 'rydeen-wage.js'), 'utf8'));
await global.RV.wage();
assert.ok(shown.includes('利用者がまだ登録されていません'));
assert.ok(shown.includes('日誌から再計算'));
assert.ok(shown.includes('下書きを確定'));

global.RYD.workers = [{ id: 'a', display_name: '山田' }];
global.rb = async path => {
  if (String(path).startsWith('bp_wage_rates')) return [{ worker_id: 'a', hourly_rate: 75 }];
  if (String(path).startsWith('bp_wage_months')) return [{ id: 'row-a', worker_id: 'a', minutes: 270, hours: 4.5, hourly_rate: 75, amount: 337, bonus: 0, status: 'draft', paid_at: null }];
  throw new Error('unexpected ' + path);
};
await global.RV.wage();
assert.ok(shown.includes('山田'));
assert.ok(shown.includes('4時間30分'));
assert.ok(shown.includes('337'));
assert.ok(shown.includes('下書き'));
assert.ok(!shown.includes('確定を取り消す'));
assert.strictEqual(global.RYD.st.wageCsv[0].amount, 337);

global.RYD.me = { uid: 'me', name: '本人', office: 'RYDEEN', role: 'worker' };
global.RYD.st = {};
global.rb = async () => ([
  { worker_id: 'me', year_month: '2026-10', minutes: 270, hourly_rate: 75, amount: 337, bonus: 1000, paid_at: null, status: 'confirmed' },
  { worker_id: 'other', year_month: '2026-10', minutes: 100, hourly_rate: 90, amount: 9999, bonus: 0, paid_at: null, status: 'confirmed' },
  { worker_id: 'me', year_month: '2026-09', minutes: 60, hourly_rate: 60, amount: 60, bonus: 0, paid_at: null, status: 'draft' },
]);
await global.RW.wage();
assert.ok(shown.includes('2026-10'));
assert.ok(shown.includes('1337') || shown.includes('1,337'));
assert.ok(!shown.includes('9999'));
assert.ok(!shown.includes('2026-09'));
global.RYD.st.wageYm = '2026-10';
await global.RW.wage();
assert.ok(shown.includes('font-size:42px'));
assert.ok(shown.includes('4時間30分'));
assert.ok(shown.includes('時給 75円'));
assert.ok(shown.includes('支払予定 2026-11-15'));
assert.ok(shown.includes('一覧へ戻る'));
assert.ok(!shown.includes('9999'));

global.RYD.st = {};
global.rb = async () => { throw new Error('Could not find the table public.bp_wage_months in the schema cache'); };
await global.RW.wage();
assert.ok(shown.includes('確定した工賃はまだありません'));
global.RYD.me.role = 'admin';
global.RYD.workers = [];
await global.RV.wage();
assert.ok(shown.includes('工賃のデータベースが未適用です'));
assert.ok(shown.includes('利用者がまだ登録されていません'));

console.log('rydeen wage checks ok');
})().catch(e => { console.error(e); process.exit(1); });
