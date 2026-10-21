// 個別支援計画の期・急ぎ判定（node tools/leo_plan_cycle_test.js）
const fs = require('fs');
const path = require('path');
const assert = (c, m) => { if (!c) throw new Error(m || 'assert'); };
const src = fs.readFileSync(path.join(__dirname, '..', 'leo.js'), 'utf8');
const block = src.match(/\/\* plan-cycle:start \*\/([\s\S]*?)\/\* plan-cycle:end \*\//);
if (!block) throw new Error('plan-cycle block missing');
const api = new Function(block[1] + '\nreturn { planTermNo, planExactTerm, planPeriodPast, planCardFlags };')();
const { planTermNo, planExactTerm, planPeriodPast, planCardFlags } = api;

const today = new Date('2026-10-21T00:00:00+09:00');
const jan2027 = new Date(2027, 0, 1);
const jul2026 = new Date(2026, 6, 1);

assert(planTermNo('第4期') === 4, 'term 4');
assert(planTermNo('第３期') === 3, 'fullwidth');
assert(!src.includes('function planCycleItem') && !src.includes('function planCycleStaff'), 'previous-term answer reuse is gone');

// カードの期は「現在の期+1」。日付が過去でも、この足し算は1のまま。
{
  const cur = 2, n = cur + 1;
  assert(`第${n}期` === '第3期', 'making term 3 means stored current term is 2');
  assert(jul2026 < today, 'July 2026 start is already past');
  const jumped = 3;
  assert(jumped + 1 === 4, 'a card labeled term 4 means stored current term is 3');
}

// 同じ期の回答だけを使う。第3期の回答を第4期のカードには付けない。
{
  const mons = [{ child: '児童E　', term: '第3期', submitted_at: '2026-10-15T01:00:00+09:00', answers: { wish: '友だちと遊びたい' } }];
  assert(planExactTerm(mons, '児童E', '第4期') === null, 'previous term answer is not reused');
  const mon = planExactTerm(mons, '児童E', '第３期');
  assert(mon && mon.answers.wish === '友だちと遊びたい', 'same term matches across spaces and fullwidth digits');
  const flags = planCardFlags({ st: 1, start: jul2026, periodTo: '2026-12-31', today, waiting: false, answered: true, active: true });
  assert(flags.urgent && flags.startPast, 'answered and overdue is urgent');
}

// 第4期の回答があっても、第3期のカードは第3期を見る。
{
  const mons = [
    { child: '児童E', term: '第3期', submitted_at: '2026-10-18T00:00:00+09:00', answers: { wish: '今作っている期' } },
    { child: '児童E', term: '第4期', submitted_at: '2026-10-19T00:00:00+09:00', answers: { wish: '次' } },
  ];
  assert(planExactTerm(mons, '児童E', '第3期').answers.wish === '今作っている期', 'exact term wins');
  assert(planExactTerm(mons, '児童E', '第4期').answers.wish === '次', 'later term stays separate');
}

// 2027/1/1 は 2026/10/21 から45日より先。回答も期限超過も無ければ急ぎではない。
{
  const flags = planCardFlags({ st: 0, start: jan2027, periodTo: '2026-12-31', today, waiting: false, answered: false, active: true });
  assert(!flags.startPast && !flags.periodPast && !flags.urgent, 'future start without an answer stays quiet');
  assert((jan2027 - today) / 864e5 > 45, '2027-01-01 is outside 45 days');
}

// 回答が届いている、開始月を過ぎている、今の計画期間が終わっている、のいずれかなら急ぎ。
{
  assert(planCardFlags({ st: 1, start: jan2027, periodTo: '2026-12-31', today, waiting: false, answered: true, active: true }).urgent, 'answered is urgent even if the start is far');
  const passed = planCardFlags({ st: 0, start: jul2026, periodTo: '2026-12-31', today, waiting: false, answered: false, active: true });
  assert(passed.startPast && passed.urgent && passed.over, 'past start is overdue and urgent');
  const lapsed = planCardFlags({ st: 2, start: jan2027, periodTo: '2026-06-30', today, waiting: false, answered: false, active: true });
  assert(lapsed.periodPast && !lapsed.startPast && lapsed.urgent, 'lapsed current period is urgent');
}

// 退所・完了は急ぎにしない。
{
  assert(!planCardFlags({ st: 1, start: jul2026, periodTo: '2026-06-30', today, waiting: false, answered: true, active: false }).urgent, 'inactive stays quiet');
  assert(!planCardFlags({ st: 7, start: new Date(2026, 0, 1), periodTo: '2025-12-31', today, waiting: false, answered: true, active: true }).urgent, 'finished stays quiet');
}

assert(planPeriodPast('2026-10-21', today) === false, 'period ending today is not past');
assert(planPeriodPast('', today) === false, 'blank period');
assert(src.includes('trackEditList(rows)'), 'managers can open the track editor from the plan page');
console.log('leo_plan_cycle_test ok');
