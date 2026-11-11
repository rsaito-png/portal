// 日誌が無い朝は、送迎を予定表（leo_events）から出す。node tools/leo_sougei_plan_test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const sandbox = {
  DEMO: false,
  console,
  ROLE: '',
  C: { supabaseUrl: 'http://example.test', supabaseKey: 'x' },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  location: { origin: 'http://localhost', pathname: '/', hash: '#leo', search: '' },
  navigator: { clipboard: { writeText: async () => {} } },
  document: { getElementById: () => null, addEventListener() {}, querySelector: () => null },
  fetch: async () => { throw new Error('no fetch'); },
  setInterval() { return 0; },
  setTimeout() { return 0; },
  clearTimeout() {},
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.$ = () => ({ textContent: '', style: {}, value: '' });
vm.createContext(sandbox);
vm.runInContext(read('leo_left.js'), sandbox, { filename: 'leo_left.js' });
vm.runInContext(read('leo_driver.js'), sandbox, { filename: 'leo_driver.js' });
vm.runInContext(read('leo.js'), sandbox, { filename: 'leo.js' });
vm.runInContext(read('leo_yotei.js'), sandbox, { filename: 'leo_yotei.js' });

const grab = name => vm.runInContext(name, sandbox);
const leoPlanJobs = grab('leoPlanJobs');
const leoTileStatus = grab('leoTileStatus');
const leoKidTile = grab('leoKidTile');
const leoKidPlanHtml = grab('leoKidPlanHtml');
const leoKidWarnHtml = grab('leoKidWarnHtml');
const leoSougeiAllHtml = grab('leoSougeiAllHtml');
const LEO_PLAN_NOTE = grab('LEO_PLAN_NOTE');
const same = grab('same');
const filterEventsByLeft = grab('filterEventsByLeft');
const leftIndex = grab('leftIndex');

const day = '2026-10-26';
const next = '2026-10-27';
const events = [
  { day, kind: '利用', child: '児童A', start_time: '14:45', end_time: '17:00' },
  { day, kind: '利用', child: '児童B', start_time: '15:00', end_time: '17:30' },
  { day, kind: '迎え', kids: ['児童A', '児童B'], staff: '連先生', start_time: '14:30', place: '見本小学校', kid_times: { '児童A': '14:30', '児童B': '14:40' }, kid_places: { '児童A': '見本小学校', '児童B': 'にじ学園' } },
  { day, kind: '送り', kids: ['児童A'], staff: '友香先生', start_time: '17:10', place: '', car: '1号車', kid_times: { '児童A': '17:10' } },
  { day, kind: '送り', kids: ['児童B'], staff: '', start_time: '17:20', place: '' },
  { day: next, kind: '利用', child: '児童C', start_time: '10:00', end_time: '13:00' },
  { day: next, kind: '迎え', kids: ['児童C'], staff: '連 先生', start_time: '09:40', kid_places: { '児童 C': '見本園' }, kid_times: { '児童 C': '09:40' } },
];

const jobs = leoPlanJobs(events);
assert.strictEqual(jobs.length, 5, '迎え2 + 送り2 + 明日の迎え');
const got = jobs.map(j => [j.day, j.t, j.k, j.c, j.p, j.dr, j.car]);
const want = [
  [day, '14:30', '迎え', '児童A', '見本小学校', '連先生', ''],
  [day, '14:40', '迎え', '児童B', 'にじ学園', '連先生', ''],
  [day, '17:10', '送り', '児童A', '', '友香先生', '1号車'],
  [day, '17:20', '送り', '児童B', '', '', ''],
  [next, '09:40', '迎え', '児童C', '見本園', '連 先生', ''],
];
assert.deepStrictEqual(JSON.parse(JSON.stringify(got)), want);
const kidsCopy = events[2].kids.slice();
leoPlanJobs(events);
assert.deepStrictEqual(events[2].kids, kidsCopy, '予定の児童配列は変えない');

assert.strictEqual(leoTileStatus([], events, day), '予定表 2人');
assert.strictEqual(leoTileStatus([], events, next), '予定表 1人');
assert.strictEqual(leoTileStatus([], [], day), '日誌なし');
assert.strictEqual(leoKidTile([], events, day), '予定 2人');
assert.strictEqual(leoKidTile([], events, next), '予定 1人');
assert.strictEqual(leoKidTile([], [], day), '0人');

const planHtml = leoKidPlanHtml('児童 A', { term: '2期', period: '2026年5月〜2026年10月', body: '【利用者名】児童A\n【長期目標】\n見本の目標です。', source_url: 'https://docs.google.com/document/d/with-body' });
assert.ok(planHtml.includes('本計画（2期　2026年5月〜2026年10月）を読む'));
assert.ok(planHtml.startsWith('<details'));
assert.ok(planHtml.includes('見本の目標です。'));
assert.ok(!planHtml.includes('【利用者名】'));
assert.ok(!planHtml.includes('PDF未登録'));
assert.ok(!planHtml.includes('PDFを開く'));
assert.ok(!planHtml.includes('docs.google.com'));
assert.ok(!planHtml.includes('target="_blank"'));
assert.ok(!planHtml.includes('個別支援計画を開く'));
const bodyOnly = leoKidPlanHtml('児童 A', { body: '本文だけです。' });
assert.ok(bodyOnly.includes('📋 本計画を読む'));
assert.ok(bodyOnly.startsWith('<details'));
assert.ok(bodyOnly.includes('本文だけです。'));
const planBtn = leoKidPlanHtml('児童 B', { source_url: 'https://docs.google.com/document/d/link-only' });
assert.ok(planBtn.includes('本計画PDFはまだ登録されていません'));
assert.ok(!planBtn.includes('docs.google.com'));
assert.ok(!planBtn.includes('target="_blank"'));
assert.ok(!planBtn.includes("PLAN_OPEN="));
assert.ok(!planBtn.includes('<details'));
const emptyPlan = leoKidPlanHtml('児童 C', null);
assert.strictEqual(emptyPlan, planBtn);
assert.ok(emptyPlan.includes('本計画PDFはまだ登録されていません'));
const blankPlan = leoKidPlanHtml('児童 D', { body: ' \n\t', source_url: 'https://example.com/plan.pdf' });
assert.ok(blankPlan.includes('本計画PDFはまだ登録されていません'));
assert.ok(!blankPlan.includes('example.com'));
const pendingPlan = leoKidPlanHtml('山本 蒼悟', { term: '4期', period: '令和8年11月1日 〜 令和9年4月30日', body: '【長期目標】\n宿題に自分から取り組む。', pending: true });
assert.ok(pendingPlan.includes('📋 計画（同意待ち）（4期　令和8年11月1日 〜 令和9年4月30日）を読む'));
assert.ok(pendingPlan.includes('宿題に自分から取り組む。'));
assert.ok(!pendingPlan.includes('本計画（'));
const leoMergeKidPlans = grab('leoMergeKidPlans');
const leoKidPlanFromLeoPlan = grab('leoKidPlanFromLeoPlan');
const merged = leoMergeKidPlans(
  [{ name: '山本 蒼悟', term: '旧', period: '古い', body: '' }],
  [{ child: '山本 蒼悟', term_no: 4, start_on: '2026-11-01', end_on: '2027-04-30', honan: '#T 個別支援計画書（第4期）\n#R 【利用者名】山本　蒼悟\n【長期目標】\n本案の本文です。', honan_consent_at: '2026-11-04T00:00:00Z' }],
  '2026-11-06'
);
assert.strictEqual(merged.length, 1);
assert.strictEqual(merged[0].term, '4期');
assert.strictEqual(merged[0].pending, false);
assert.ok(merged[0].body.includes('本案の本文です。'));
assert.ok(!merged[0].body.includes('#T '));
const waitMerged = leoMergeKidPlans([], [{ child: '西山 琴', term_no: 3, start_on: '2026-07-01', end_on: '2026-12-31', honan: '同意前の本案', honan_consent_at: null }], '2026-11-06');
assert.strictEqual(waitMerged[0].pending, true);
assert.ok(leoKidPlanHtml('西山 琴', waitMerged[0]).includes('計画（同意待ち）'));
assert.strictEqual(leoKidWarnHtml([]), '');
assert.strictEqual(leoKidWarnHtml(null), '');
const leoKindOf = grab('leoKindOf');
const leoServiceLabel = grab('leoServiceLabel');
const leoCardService = grab('leoCardService');
const leoChildWrite = grab('leoChildWrite');
assert.strictEqual(leoServiceLabel('児発'), '児童発達支援');
assert.strictEqual(leoServiceLabel('放デイ'), '放課後等デイサービス');
assert.strictEqual(leoServiceLabel('放課後等デイサービス'), '');
assert.strictEqual(leoServiceLabel(''), '');
assert.strictEqual(leoKindOf('児童C', [{ name: '児童C', kind: '児発' }, { name: '児童A', kind: '放デイ' }]), '児発');
assert.strictEqual(leoKindOf('児童　C', [{ name: '児童 C', kind: '児発' }]), '児発');
assert.strictEqual(leoKindOf('知らない', [{ name: '児童C', kind: '児発' }]), '');
assert.strictEqual(leoKindOf('同名', [{ name: '同名', kind: '児発' }, { name: '同名', kind: '放デイ' }]), '');
assert.strictEqual(leoCardService('児童C', [{ name: '児童C', kind: '児発' }], '放課後等デイサービス'), '児童発達支援');
assert.strictEqual(leoCardService('児童A', [{ name: '児童A', kind: '放デイ' }], '放課後等デイサービス'), '放課後等デイサービス');
assert.strictEqual(leoCardService('日誌だけ', [], '児発'), '児童発達支援');
assert.strictEqual(leoCardService('日誌だけ', [], '放デイ'), '放課後等デイサービス');
assert.strictEqual(leoCardService('不明', [], '放課後等デイサービス'), '未設定');
assert.strictEqual(leoCardService('不明', [], ''), '未設定');
assert.strictEqual(JSON.stringify(leoChildWrite({ kind: '児発' }, '児童C')), JSON.stringify({ row: { name: '児童C', kind: '児発' } }));
assert.strictEqual(JSON.stringify(leoChildWrite({ kind: '放デイ' }, '児童A')), JSON.stringify({ row: { name: '児童A', kind: '放デイ' } }));
assert.strictEqual(JSON.stringify(leoChildWrite({ kind: '' }, '不明')), JSON.stringify({ skip: true }));
assert.strictEqual(leoChildWrite({ kind: '', jukyusha_no: '0123456789', city_no: '123456' }, '不明').error, 'サービス種別は、児発か放デイを選んでください。');
const full = leoChildWrite({ kind: '児発', jukyusha_no: '0123456789', city_no: '123456', cap_monthly: '4600', contract_days: '10', mushouka: false }, '児童C');
assert.strictEqual(full.row.kind, '児発');
assert.strictEqual(full.row.jukyusha_no, '0123456789');
assert.strictEqual(full.row.cap_monthly, 4600);
assert.strictEqual(full.row.contract_days, 10);
const warnHtml = leoKidWarnHtml(['送迎の配慮：<見本>', 'メモ：半分']);
assert.ok(warnHtml.includes('⚠ 送迎の配慮：&lt;見本&gt;'));
assert.ok(warnHtml.includes('⚠ メモ：半分'));

const nikki = [
  { day, kind: '利用', child: '児童A', pick_driver: '連先生', pick_car: '2号車', drop_driver: '友香先生', drop_car: '2号車', pick_time: '14:35', drop_time: '17:15', pick_place: '見本小学校', drop_place: '自宅' },
];
assert.strictEqual(leoTileStatus(nikki, events, day), '1人・確定', '日誌がある日は予定表で上書きしない');
assert.strictEqual(leoKidTile(nikki, events, day), '1人');
const absentOnly = [{ day, kind: '欠席', child: '児童D' }];
assert.strictEqual(leoTileStatus(absentOnly, events, day), '日誌なし', '欠席だけの日誌タブは予定に落とさない');
assert.strictEqual(leoKidTile(absentOnly, events, day), '0人');
const open = [{ day, kind: '利用', child: '児童A', pick_driver: '', pick_car: '', drop_driver: '友香先生', drop_car: '1号車' }];
assert.ok(leoTileStatus(open, events, day).includes('未確定'), '日誌の空欄は未確定のまま');

const emptyHtml = leoSougeiAllHtml([], events, { '児童A': '（見本）助手席の後ろ' });
assert.ok(emptyHtml.includes(LEO_PLAN_NOTE));
assert.ok(emptyHtml.includes('予定表から表示（日誌取り込み前）'));
assert.ok(emptyHtml.includes('連先生'));
assert.ok(emptyHtml.includes('友香先生'));
assert.ok(emptyHtml.includes('見本小学校'));
assert.ok(emptyHtml.includes('1号車'));
assert.ok(emptyHtml.includes('未定'));
assert.ok(!emptyHtml.includes('自宅'), '場所が空欄のときは自宅と補わない');
assert.ok(emptyHtml.includes('自分の担当だけ見る'));
assert.ok(emptyHtml.includes('（見本）助手席の後ろ'));
assert.ok(!emptyHtml.includes('この期間の日誌タブがまだありません'));

const todayEvents = events.filter(e => e.day === day);
const loggedHtml = leoSougeiAllHtml(nikki, todayEvents, {});
assert.ok(!loggedHtml.includes('予定表から表示'), 'その日の日誌があれば予定表の注記は出さない');
assert.ok(loggedHtml.includes('2号車'));
assert.ok(loggedHtml.includes('全て確定'));
assert.ok(!loggedHtml.includes('1号車'), '日誌がある日の車は予定表の車で置き換えない');
const childOnly = [{ day, kind: '迎え', child: '児童A', staff: '連先生', start_time: '08:00', place: '見本園' }];
assert.strictEqual(leoPlanJobs(childOnly)[0].c, '児童A');
assert.strictEqual(leoTileStatus([], childOnly, day), '予定表 1人');

const mixed = leoSougeiAllHtml(nikki, events, {});
assert.ok(mixed.includes('全て確定'));
assert.ok(mixed.includes('予定表から表示'), '別の日に日誌が無ければ、その日だけ予定表');
assert.ok(mixed.includes('児童C'));

const none = leoSougeiAllHtml([], [], {});
assert.ok(none.includes('この期間の日誌タブがまだありません'));

const mine = leoPlanJobs(events).filter(j => same(j.dr, '連先生'));
assert.deepStrictEqual(JSON.parse(JSON.stringify(mine.map(j => j.c))), ['児童A', '児童B', '児童C']);
assert.ok(same('連先生', '連 先生'));

const left = leftIndex([{ name: '児童B', left_on: '2026-10-25' }]);
const kept = filterEventsByLeft(events, left);
assert.strictEqual(leoTileStatus([], kept, day), '予定表 1人', '退所の翌日以降は数に入れない');
assert.ok(!leoPlanJobs(kept).some(j => j.c === '児童B' && j.day === day));

const leo = read('leo.js');
const yotei = read('leo_yotei.js');
const index = read('index.html');
function between(src, a, b) {
  const i = src.indexOf(a);
  const j = src.indexOf(b, i + a.length);
  assert.ok(i >= 0 && j > i, a + ' .. ' + b);
  return src.slice(i, j);
}
assert.ok(!between(leo, 'async sougeiall()', 'async kids()').includes('filingDriverName'));
assert.ok(!between(leo, 'async kids()', 'async kata()').includes('filingDriverName'));
assert.ok(index.includes('leoTileStatus'));
assert.ok(index.includes('leoKidTile'));
assert.ok(!index.includes('select=day,kind,child,kids,staff,start_time,place,kid_places,kid_times,car'));
assert.ok(yotei.includes('LEO_PLAN_NOTE'));
assert.ok(!yotei.includes('if (DEMO) return old.call(this)'));
assert.ok(yotei.includes('leoSougeiMineHtml'));
assert.ok(yotei.includes('same(e.staff, me)'));
assert.ok(leo.includes('120000') && leo.includes('visibilitychange') && leo.includes('SG_EDIT'));
const planFn = between(leo, 'function leoKidPlanHtml', 'function leoKindOf');
assert.ok(!planFn.includes('source_url') && !planFn.includes('target="_blank"') && !planFn.includes('PDF未登録'));
assert.ok(planFn.includes('本計画PDFはまだ登録されていません'));
assert.ok(leo.includes('元の計画書を開く'));
assert.ok(index.includes('leo.js?v=20261111moneval'));
const leoMergeNikki = grab('leoMergeNikki');
const leoDropClock = grab('leoDropClock');
assert.strictEqual(leoDropClock({ start_time: '17:00', end_time: '17:25', kid_times: { '下宮蒼偉': '17:00' } }, '下宮蒼偉', '17:00'), '17:25', '利用終了の写しより便の着');
assert.strictEqual(leoDropClock({ start_time: '17:00', end_time: '17:40', kid_times: { '児童A': '17:15', '児童B': '17:40' } }, '児童A', '17:00'), '17:15', '共有便はその子の着');
assert.strictEqual(leoDropClock({ start_time: '17:00', end_time: '17:25', kid_times: { '下宮 蒼偉': '17:25' } }, '下宮蒼偉', '17:00'), '17:25', '名前の空白は吸収');
assert.strictEqual(leoDropClock({ start_time: '17:10', kid_times: { '児童A': '17:10' } }, '児童A', ''), '17:10');
const dropEv = [{ day, kind: '送り', kids: ['下宮蒼偉'], staff: '職員X', source: 'portal', start_time: '17:00', end_time: '17:25', kid_times: { '下宮蒼偉': '17:00' }, updated_at: '2099-01-01T00:00:00.000Z' }];
const dropRow = { day, kind: '利用', child: '下宮蒼偉', start_time: '15:50', end_time: '17:00', drop_time: '' };
assert.strictEqual(leoMergeNikki([dropRow], dropEv)[0].drop_time, '17:25');
assert.strictEqual(dropRow.drop_time, '', '元の行は変えない');
const portalPick = [{ day, kind: '迎え', kids: ['児童A'], staff: '職員X', start_time: '14:50', place: '見本公園', source: 'portal', updated_at: '2099-01-01T00:00:00.000Z', kid_times: { '児童A': '14:50' }, kid_places: { '児童A': '見本公園' } }];
const picked = leoMergeNikki(nikki, portalPick);
assert.strictEqual(picked[0].pick_time, '14:50');
assert.strictEqual(picked[0].pick_place, '見本公園');
assert.strictEqual(picked[0].pick_driver, '職員X');
assert.strictEqual(picked[0].pick_car, '2号車', '日誌の車は残す');
assert.strictEqual(nikki[0].pick_time, '14:35', '日誌の行は変えない');
const overHtml = leoSougeiAllHtml(nikki, portalPick, {});
assert.ok(overHtml.includes('カレンダーで変更') && overHtml.includes('14:50') && overHtml.includes('2号車') && overHtml.includes('全て確定'));
const googlePick = [{ day, kind: '迎え', kids: ['児童A'], staff: '職員X', start_time: '09:00', place: '旧公園', source: 'google', updated_at: '2099-06-01T00:00:00.000Z' }];
assert.strictEqual(leoMergeNikki(nikki, googlePick)[0].pick_time, '14:35');
const kataPick = [{ day, kind: '迎え', kids: ['児童A'], staff: '職員Y', start_time: '14:00', place: '下野小学校', source: 'kata', updated_at: '2099-01-01T00:00:00.000Z', kid_times: { '児童A': '14:00' }, kid_places: { '児童A': '下野小学校' } }];
const kataMerged = leoMergeNikki([{ ...nikki[0], pick_place: '下野こども園' }], kataPick)[0];
assert.strictEqual(kataMerged.pick_place, '下野小学校', '型表の場所は日誌の旧値より優先');
assert.strictEqual(kataMerged.pick_time, '14:35', '型表では時刻を上書きしない');
const tomb = [{ day, kind: '迎え', kids: ['児童A'], staff: '連先生', source: 'portal', title: 'カレンダーで削除', note: 'カレンダーで削除', updated_at: '2099-01-01T00:00:00.000Z' }];
const dropped = leoMergeNikki(nikki, tomb)[0];
assert.strictEqual(dropped._calPick, 'del');
const dropHtml = leoSougeiAllHtml(nikki, tomb, {});
assert.ok(dropHtml.includes('カレンダーで変更') && dropHtml.includes('全て確定') && !dropHtml.includes('14:35') && dropHtml.includes('17:15'));
const absEv = [{ day, kind: '休み', child: '児童A', title: '欠席（欠席時対応加算）', note: '連絡日:2026-10-24\n区分:欠席（欠席時対応加算）', source: 'portal', updated_at: '2099-01-01T00:00:00.000Z' }];
const absRow = leoMergeNikki(nikki, absEv).find(r => r.child === '児童A');
assert.strictEqual(absRow._abs, '欠席（欠席時対応加算）');
assert.strictEqual(absRow._absContact, '2026-10-24');
assert.strictEqual(leoKidTile(nikki, absEv, day), '0人');
const cancelEv = [{ day, kind: '休み', child: '児童A', title: 'キャンセル', note: '連絡日:2026-10-01\n区分:キャンセル', source: 'portal', updated_at: '2099-01-01T00:00:00.000Z' }];
assert.strictEqual(leoMergeNikki(nikki, cancelEv).find(r => r.child === '児童A')._abs, 'キャンセル');

vm.runInContext(`
(async () => {
  const t = today(), n = addDays(t, 1);
  const ev = [
    { day: t, kind: '迎え', kids: ['児童A'], staff: '連先生', start_time: '14:30', car: '1号車', kid_times: { '児童A': '14:30' }, kid_places: { '児童A': '見本小学校' } },
    { day: t, kind: '送り', kids: ['児童B'], staff: '友香先生', start_time: '17:10', place: '自宅' },
    { day: t, kind: '利用', child: '児童A', start_time: '14:45', end_time: '17:00' },
  ];
  PERIOD = 'today';
  sb = async (path) => {
    const p = String(path);
    if (p.startsWith('staff_profiles')) return [{ nikki_name: '連先生' }];
    if (p.includes('leo_nikki')) return [];
    if (p.includes('leo_events') && p.includes('kind=eq.利用')) return ev.filter(e => e.kind === '利用');
    if (p.includes('leo_events')) return ev.filter(e => e.kind !== '利用' || p.includes('利用'));
    return [];
  };
  const all = await LEO_VIEWS.sougeiall();
  if (!all.includes('予定表から表示（日誌取り込み前）')) throw new Error('sougeiall note');
  if (!all.includes('連先生') || !all.includes('1号車') || !all.includes('見本小学校')) throw new Error('sougeiall fields');
  if (all.includes('この期間の日誌タブがまだありません')) throw new Error('sougeiall still empty');
  const mine = await LEO_VIEWS.sougei();
  if (!mine.includes('予定表から表示（日誌取り込み前）')) throw new Error('sougei note');
  if (!mine.includes('児童A') || !mine.includes('1号車')) throw new Error('sougei mine');
  if (mine.includes('児童B')) throw new Error('sougei leaked another driver');
  const kids = await LEO_VIEWS.kids();
  if (!kids.includes('予定表から表示（日誌取り込み前）') || !kids.includes('児童A')) throw new Error('kids fallback');
  if (!kids.includes('本計画PDFはまだ登録されていません')) throw new Error('kids fallback plan missing');
  if (kids.includes('を読む') || kids.includes('PDFを開く') || kids.includes('target="_blank"') || kids.includes("PLAN_OPEN=")) throw new Error('no plan row should stay a message');
  sb = async (path) => {
    const p = String(path);
    if (p.startsWith('staff_profiles')) return [{ nikki_name: '連先生' }];
    if (p.includes('leo_nikki')) return [];
    if (p.includes('kind=eq.利用')) return [
      { day: t, kind: '利用', child: '児童A', start_time: '14:45', end_time: '17:00' },
      { day: t, kind: '利用', child: '児童 B', start_time: '15:00', end_time: '17:30' },
    ];
    if (p.includes('leo_child_plan')) return [
      { name: '児童 A', term: '2期', period: '2026年5月〜2026年10月', body: '【利用者名】児童A\\n【長期目標】\\n見本の目標です。', source_url: 'https://docs.google.com/document/d/with-body' },
      { name: '児童 B', source_url: 'https://docs.google.com/document/d/link-only' },
    ];
    if (p.startsWith('leo_child_care')) return [{ child: '児童A', note: '（見本）助手席の後ろ' }];
    if (p.includes('select=name,note')) return [{ name: '児童 B', note: '（見本）おやつは半分' }];
    return [];
  };
  const rich = await LEO_VIEWS.kids();
  if (!rich.includes('予定表から表示（日誌取り込み前）')) throw new Error('rich fallback note');
  const cards = rich.split('class="card"').slice(1);
  if (cards.length !== 2) throw new Error('two fallback cards');
  if (!cards[0].includes('児童A') || !cards[0].includes('本計画（2期　2026年5月〜2026年10月）を読む') || !cards[0].includes('見本の目標です。')) throw new Error('fallback plan details');
  if (cards[0].includes('【利用者名】') || cards[0].includes('メモ：') || cards[0].includes('PDF未登録') || cards[0].includes('docs.google.com') || cards[0].includes('target="_blank"')) throw new Error('fallback plan card mixed');
  if (!cards[0].includes('送迎の配慮：（見本）助手席の後ろ')) throw new Error('fallback care');
  if (!cards[1].includes('本計画PDFはまだ登録されていません') || !cards[1].includes('メモ：（見本）おやつは半分')) throw new Error('fallback missing plan and memo');
  if (cards[1].includes('送迎の配慮') || cards[1].includes('を読む') || cards[1].includes('docs.google.com') || cards[1].includes('target="_blank"')) throw new Error('fallback button card mixed');
  sb = async (path) => {
    const p = String(path);
    if (p.startsWith('staff_profiles')) return [{ nikki_name: '連先生' }];
    if (p.includes('leo_nikki')) return [{ day: t, kind: '利用', child: '児童B', service: '放デイ', pick_driver: '連先生', pick_car: '2号車', drop_driver: '友香先生', drop_car: '2号車', pick_time: '14:40', drop_time: '17:20', pick_place: '見本小学校', drop_place: '自宅', start_time: '15:00', end_time: '17:30' }];
    if (p.includes('leo_events')) return ev.filter(e => e.kind !== '利用');
    return [];
  };
  const logged = await LEO_VIEWS.sougeiall();
  if (logged.includes('予定表から表示')) throw new Error('logged day should stay on nikki');
  if (!logged.includes('2号車') || !logged.includes('全て確定')) throw new Error('nikki table');
  const mineLogged = await LEO_VIEWS.sougei();
  if (mineLogged.includes('予定表から表示（日誌取り込み前）')) throw new Error('sougei note while nikki exists');
  if (!mineLogged.includes('児童B')) throw new Error('sougei keeps nikki when the schedule was not edited in the portal');
  if (mineLogged.includes('児童A')) throw new Error('non-portal schedule must not replace nikki');
  sb = async (path) => {
    const p = String(path);
    if (p.includes('leo_nikki')) return [{ day: t, kind: '利用', child: '児童B', service: '放デイ', pick_driver: '連先生', pick_car: '2号車', drop_driver: '友香先生', drop_car: '2号車', pick_time: '14:40', drop_time: '17:20', pick_place: '見本小学校', drop_place: '自宅', start_time: '15:00', end_time: '17:30' }];
    if (p.includes('leo_child_plan')) return [{ name: '児童B', term: '1期', period: '見本期間', body: '【長期目標】\\n日誌側の本文', source_url: 'https://docs.google.com/document/d/nikki' }];
    if (p.startsWith('leo_child_care')) return [{ child: '児童B', note: '（見本）チャイルドシート' }];
    if (p.includes('select=name,note')) return [{ name: '児童B', note: '（見本）メモです' }];
    return [];
  };
  const loggedKids = await LEO_VIEWS.kids();
  if (loggedKids.includes('予定表から表示')) throw new Error('nikki kids stays off the schedule');
  if (!loggedKids.includes('本計画（1期　見本期間）を読む') || !loggedKids.includes('日誌側の本文')) throw new Error('nikki plan helper');
  if (loggedKids.includes('docs.google.com') || loggedKids.includes('PDFを開く') || loggedKids.includes('PDF未登録')) throw new Error('nikki plan must expand text');
  if (!loggedKids.includes('送迎の配慮：（見本）チャイルドシート') || !loggedKids.includes('メモ：（見本）メモです')) throw new Error('nikki warn helper');
  sb = async (path) => {
    const p = String(path);
    if (p.includes('leo_nikki')) return [{ day: t, kind: '利用', child: '児童A', service: '放デイ', pick_driver: '職員X', pick_car: '1号車', drop_driver: '職員Y', drop_car: '2号車', pick_time: '14:30', drop_time: '17:15', pick_place: '〇〇小学校', drop_place: '自宅', start_time: '14:45', end_time: '17:00' }];
    if (p.includes('leo_events')) return [{ day: t, kind: '休み', child: '児童A', title: '欠席（欠席時対応加算）', note: '連絡日:' + t + '\\n区分:欠席（欠席時対応加算）', source: 'portal', updated_at: '2099-01-01T00:00:00.000Z' }];
    return [];
  };
  const absentKids = await LEO_VIEWS.kids();
  if (!absentKids.includes('欠席：') || !absentKids.includes('欠席（欠席時対応加算）') || !absentKids.includes('連絡 ' + t)) throw new Error('kids lists calendar absence');
  if (absentKids.includes('class="card"')) throw new Error('absent child is not listed as attending');
  sb = async (path) => {
    const p = String(path);
    if (p.includes('leo_nikki')) return [
      { day: t, kind: '利用', child: '児童C', service: '放課後等デイサービス', pick_driver: '職員X', pick_car: '1号車', drop_driver: '職員Y', drop_car: '1号車', pick_time: '15:00', drop_time: '17:00', pick_place: '見本園', drop_place: '自宅', start_time: '15:50', end_time: '17:00' },
      { day: t, kind: '利用', child: '児童D', service: '放課後等デイサービス', pick_driver: '職員Y', pick_car: '1号車', drop_driver: '職員Y', drop_car: '1号車', pick_time: '', drop_time: '17:00', pick_place: '', drop_place: '自宅', start_time: '15:00', end_time: '17:00' },
      { day: t, kind: '利用', child: '児童A', service: '放課後等デイサービス', pick_driver: '職員Y', pick_car: '1号車', drop_driver: '職員Y', drop_car: '1号車', pick_time: '14:00', drop_time: '17:00', pick_place: '見本小学校', drop_place: '自宅', start_time: '14:10', end_time: '17:00' },
      { day: t, kind: '利用', child: '名簿にいない', service: '放課後等デイサービス', pick_time: '10:00', drop_time: '12:00', start_time: '10:00', end_time: '12:00' },
    ];
    if (p.includes('select=name,kind') || p.includes('rpc/leo_child_kinds')) return [
      { name: '児童C', kind: '児発' },
      { name: '児童D', kind: '児発' },
      { name: '児童A', kind: '放デイ' },
    ];
    return [];
  };
  const svcKids = await LEO_VIEWS.kids();
  const svcCards = svcKids.split('class="card"').slice(1);
  if (svcCards.length !== 4) throw new Error('service cards ' + svcCards.length);
  if (!svcCards[0].includes('児童C') || !svcCards[0].includes('児童発達支援') || svcCards[0].includes('放課後等デイサービス')) throw new Error('児発は児童発達支援');
  if (!svcCards[1].includes('児童D') || !svcCards[1].includes('児童発達支援')) throw new Error('児童Dも児発');
  if (!svcCards[2].includes('児童A') || !svcCards[2].includes('放課後等デイサービス')) throw new Error('放デイは放課後等デイサービス');
  if (!svcCards[3].includes('名簿にいない') || !svcCards[3].includes('未設定') || svcCards[3].includes('放課後等デイサービス')) throw new Error('未知のサービス名は未設定');
})()
`, sandbox).then(() => console.log('leo_sougei_plan_test ok')).catch(err => { console.error(err); process.exit(1); });
