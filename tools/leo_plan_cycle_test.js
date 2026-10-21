// 個別支援計画の期・回答の紐づけ（node tools/leo_plan_cycle_test.js）
const fs = require('fs');
const path = require('path');
const assert = (c, m) => { if (!c) throw new Error(m || 'assert'); };
const src = fs.readFileSync(path.join(__dirname, '..', 'leo.js'), 'utf8');
const block = src.match(/\/\* plan-cycle:start \*\/([\s\S]*?)\/\* plan-cycle:end \*\//);
if (!block) throw new Error('plan-cycle block missing');
const api = new Function(block[1] + '\nreturn { planTermNo, planSameTerm, planCycleItem, planCycleStaff, planPeriodPast, planCardFlags };')();
const { planTermNo, planSameTerm, planCycleItem, planCycleStaff, planPeriodPast, planCardFlags } = api;

const today = new Date('2026-10-21T00:00:00+09:00');
const jan2027 = new Date(2027, 0, 1);

assert(planTermNo('第4期') === 4, 'term 4');
assert(planTermNo('第３期') === 3, 'fullwidth');
assert(planSameTerm('第3期', '第３期'), 'same term');

// 湯上さん: カードは第4期（2027/1/1）。回答は第3期のリンクに届いている。今の計画の同意は回答より前。
{
  const plans = [{ child: '湯上 奏輔', term_no: 3, honan_consent_at: '2026-06-01T00:00:00+09:00' }];
  const mons = [{ child: '湯上　奏輔', term: '第3期', submitted_at: '2026-10-15T01:00:00+09:00', answers: { wish: '友だちと遊びたい' } }];
  const mon = planCycleItem(mons, '湯上 奏輔', '第4期', 3, plans, 'submitted_at');
  assert(mon && mon.term === '第3期', 'previous term answer is used');
  assert(mon.answers.wish === '友だちと遊びたい', 'answer text kept');
  const st = 1; // アンケート済み・職員モニタリング未
  const flags = planCardFlags({ st, start: jan2027, periodTo: '2026-12-31', today, waiting: false, answered: true, active: true });
  assert(flags.urgent, 'answered child is urgent');
  assert(!flags.startPast, '2027/1/1 is not overdue');
  assert(!flags.periodPast, 'current period still open');
}

// 第4期の回答があれば、そちらを優先する
{
  const mons = [
    { child: '湯上 奏輔', term: '第3期', submitted_at: '2026-10-18T00:00:00+09:00' },
    { child: '湯上 奏輔', term: '第4期', submitted_at: '2026-10-10T00:00:00+09:00', answers: { wish: '今期' } },
  ];
  const mon = planCycleItem(mons, '湯上奏輔', '第4期', 3, [], 'submitted_at');
  assert(mon.term === '第4期', 'exact term wins');
}

// 前の期の本案同意より前の回答は、その期で使い終わったもの。第4期には付けない。
{
  const plans = [{ child: '湯上 奏輔', term_no: 3, honan_consent_at: '2026-10-20T00:00:00+09:00' }];
  const mons = [{ child: '湯上 奏輔', term: '第3期', submitted_at: '2026-10-01T00:00:00+09:00' }];
  assert(planCycleItem(mons, '湯上 奏輔', '第4期', 3, plans, 'submitted_at') === null, 'consumed answer stays with the old term');
  const flags = planCardFlags({ st: 0, start: jan2027, periodTo: '2026-12-31', today, waiting: false, answered: false, active: true });
  assert(!flags.urgent, 'no answer and not due stays quiet');
}

// 期の数字は「現在の期+1」だけ。日付が過去でも、ここでは期を足さない。
{
  const cur = 3, n = cur + 1;
  assert(n === 4 && `第${n}期` === '第4期', 'card term is current+1');
  assert(jan2027 > today, 'displayed start is still in the future');
  const passed = new Date(2026, 6, 1);
  const flags = planCardFlags({ st: 0, start: passed, periodTo: '2026-12-31', today, waiting: false, answered: false, active: true });
  assert(flags.startPast && flags.urgent && flags.over, 'past start is overdue and urgent');
}

// 今の計画期間が終わっているのに次の開始月だけ先だと、期限切れとして急ぎに出す
{
  const flags = planCardFlags({ st: 2, start: jan2027, periodTo: '2026-06-30', today, waiting: false, answered: false, active: true });
  assert(flags.periodPast && !flags.startPast && flags.urgent, 'lapsed current period is urgent');
}

// 退所・完了は急ぎにしない
{
  assert(!planCardFlags({ st: 1, start: jan2027, periodTo: '2026-06-30', today, waiting: false, answered: true, active: false }).urgent, 'inactive stays quiet');
  assert(!planCardFlags({ st: 7, start: new Date(2026, 0, 1), periodTo: '2025-12-31', today, waiting: false, answered: true, active: true }).urgent, 'finished stays quiet');
}

// 職員モニタリングも、回答と同じ前の期ならこの周期に使う。第4期のものが別にあればそちら。
{
  const mon = { child: '湯上 奏輔', term: '第3期' };
  const staff = [{ child: '湯上 奏輔', term: '第3期', text: '記録' }, { child: '別の子', term: '第4期', text: '他人' }];
  assert(planCycleStaff(staff, '湯上　奏輔', '第4期', mon).text === '記録', 'staff follows the answer term');
  const both = staff.concat([{ child: '湯上 奏輔', term: '第4期', text: '今期' }]);
  assert(planCycleStaff(both, '湯上 奏輔', '第4期', mon).text === '今期', 'exact staff wins');
  assert(planCycleStaff(staff, '湯上 奏輔', '第4期', { term: '第4期' }) === null, 'do not reuse old staff for a new questionnaire');
}

assert(planPeriodPast('2026-10-21', today) === false, 'period ending today is not past');
assert(planPeriodPast('', today) === false, 'blank period');
console.log('leo_plan_cycle_test ok');
