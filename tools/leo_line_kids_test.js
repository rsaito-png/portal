// 日誌の写しが空の日は、予定（leo_events の利用）で LINE 下書き欄を出す。
// node tools/leo_line_kids_test.js
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
  location: { origin: 'http://localhost', pathname: '/', hash: '#leo/line', search: '' },
  navigator: { clipboard: { writeText: async () => {} } },
  document: { getElementById: () => null, addEventListener() {}, querySelector: () => null, body: { classList: { toggle() {} } } },
  fetch: async () => { throw new Error('no fetch'); },
  setInterval() { return 0; },
  setTimeout() { return 0; },
  clearTimeout() {},
  btoa,
  atob,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.$ = () => ({ textContent: '', style: {}, value: '' });
vm.createContext(sandbox);
vm.runInContext(read('leo_left.js'), sandbox, { filename: 'leo_left.js' });
vm.runInContext(read('leo.js'), sandbox, { filename: 'leo.js' });

const grab = name => vm.runInContext(name, sandbox);
const leoLineKids = grab('leoLineKids');
const LEO_LINE_PLAN_NOTE = grab('LEO_LINE_PLAN_NOTE');
const day = '2026-11-02';
const names = ['加藤 湊', '市川 碧音', '山根 一輝', '湯上 奏輔', '下宮 蒼偉', '日置 大智'];
const planEvents = names.map(child => ({ day, kind: '利用', child, source: 'kata' }));

const sameList = (got, want, msg) => assert.deepStrictEqual(JSON.parse(JSON.stringify(got)), want, msg);
{
  const picked = leoLineKids([], planEvents);
  sameList(picked.kids, names);
  assert.strictEqual(picked.source, 'plan');
}
{
  const picked = leoLineKids([{ child: '児童A' }, { child: '児童B', kind: '利用' }], planEvents);
  sameList(picked.kids, ['児童A', '児童B']);
  assert.strictEqual(picked.source, 'nikki', '日誌に1人でもいれば予定は足さない');
}
{
  const picked = leoLineKids([{ child: '児童A', kind: '欠席' }], planEvents);
  sameList(picked.kids, names);
  assert.strictEqual(picked.source, 'plan', '欠席だけでは日誌の利用児童にしない');
}
{
  const mixed = [
    { day, kind: '利用', child: '加藤　湊', source: 'kata' },
    { day, kind: '利用', child: '加藤 湊', source: 'portal' },
    { day, kind: '利用', child: '  ', source: 'kata' },
    { day, kind: '迎え', child: '迎えだけ', kids: ['迎えだけ'], source: 'kata' },
    { day, kind: '休み', child: '欠席の子', source: 'portal' },
    { day, kind: '利用', child: '消えた子', source: 'portal', title: 'カレンダーで削除', note: 'カレンダーで削除' },
    { day, kind: '利用', child: '市川 碧音', source: 'kata' },
  ];
  const picked = leoLineKids([], mixed);
  sameList(picked.kids, ['加藤　湊', '市川 碧音']);
  assert.strictEqual(picked.source, 'plan');
}
{
  const picked = leoLineKids([], []);
  sameList(picked.kids, []);
  assert.strictEqual(picked.source, 'none');
}
{
  const picked = leoLineKids(null, null);
  assert.strictEqual(picked.source, 'none');
}

const calls = [];
function installSb(handlers) {
  calls.length = 0;
  sandbox.sb = async (path, opt = {}) => {
    calls.push({ path, method: opt.method || 'GET', body: opt.body || '' });
    for (const [key, val] of Object.entries(handlers)) {
      if (!path.includes(key)) continue;
      if (val instanceof Error) throw val;
      return typeof val === 'function' ? val(path, opt) : val;
    }
    if (path.includes('staff_profiles')) return [{ nikki_name: '齊藤連' }];
    if (path.includes('leo_child_info')) return [];
    if (path.includes('leo_events')) return [];
    if (path.includes('leo_nikki')) return [];
    if (path.includes('leo_line_drafts')) return [];
    if (path.includes('leo_activity')) return [];
    if (path.includes('leo_diary_draft')) return [];
    return [];
  };
}
const lineHtml = () => vm.runInContext('LEO_VIEWS.line()', sandbox);
const draftHtml = () => vm.runInContext('LEO_VIEWS.linedraft()', sandbox);

(async () => {
  sandbox.DEMO = false;
  sandbox.LINE_DAY = day;
  sandbox.LD_DAY = day;
  installSb({
    leo_events: planEvents.concat([
      { day, kind: '利用', child: '退所 児', source: 'kata' },
      { day, kind: '利用', child: '消えた子', source: 'portal', title: 'カレンダーで削除', note: 'カレンダーで削除' },
    ]),
    leo_child_info: [{ name: '退所 児', left_on: '2026-10-01' }],
  });
  let html = await lineHtml();
  assert.ok(html.includes(LEO_LINE_PLAN_NOTE), '予定フォールバックの注記');
  assert.ok(!html.includes('この日の利用の子がいません'), '児童がいる日は空メッセージを出さない');
  assert.ok(!html.includes('この日の日誌に利用の子がいません'));
  names.forEach(n => assert.ok(html.includes('■' + n), n));
  assert.ok(!html.includes('退所 児'), '退所日の翌日以降は出さない');
  assert.ok(!html.includes('消えた子'), 'カレンダーで削除した利用は出さない');
  assert.strictEqual((html.match(/<textarea /g) || []).length, names.length);
  assert.strictEqual((html.match(/saveLine\('/g) || []).length, names.length);
  assert.strictEqual((html.match(/LINE用にコピー（送った印をつける）/g) || []).length, names.length);
  assert.ok(calls.some(c => c.path.includes('leo_events') && c.path.includes('kind=eq.利用') && c.path.includes('day=eq.' + day)));
  assert.ok(!calls.some(c => c.method !== 'GET'), '表示では書き込まない');

  html = await draftHtml();
  assert.ok(html.includes(LEO_LINE_PLAN_NOTE));
  names.forEach(n => assert.ok(html.includes('■' + n), 'linedraft ' + n));
  assert.ok(html.includes(`0 / ${names.length}人`));
  assert.strictEqual((html.match(/<textarea /g) || []).length, names.length);
  assert.strictEqual((html.match(/ldSave\('/g) || []).length, names.length);
  assert.ok(!html.includes('退所 児') && !html.includes('消えた子'));

  installSb({
    ['leo_nikki?day=eq.' + day]: [{ child: '児童A' }, { child: '児童A' }],
    leo_events: planEvents,
  });
  html = await lineHtml();
  assert.ok(html.includes('■児童A'));
  assert.ok(!html.includes(LEO_LINE_PLAN_NOTE));
  assert.ok(!html.includes('加藤 湊'), '日誌がある日は予定の児童を足さない');
  assert.strictEqual((html.match(/<textarea /g) || []).length, 1);
  html = await draftHtml();
  assert.ok(html.includes('■児童A') && !html.includes(LEO_LINE_PLAN_NOTE) && !html.includes('加藤 湊'));

  installSb({});
  sandbox.LINE_DAY = '2026-11-03';
  sandbox.LD_DAY = '2026-11-03';
  html = await lineHtml();
  assert.ok(html.includes('この日の利用の子がいません。'));
  assert.ok(!html.includes(LEO_LINE_PLAN_NOTE));
  assert.ok(!html.includes('<textarea'));
  assert.ok(!html.includes('この日の日誌に利用の子がいません'));
  html = await draftHtml();
  assert.ok(html.includes('この日の利用の子がいません。'));
  assert.ok(!html.includes(LEO_LINE_PLAN_NOTE));
  assert.ok(!html.includes('<textarea'));
  assert.ok(html.includes('0 / 0人'));

  sandbox.LINE_DAY = day;
  installSb({ ['leo_nikki?day=eq.' + day]: [{ child: '児童A' }], leo_events: new Error('events down') });
  html = await lineHtml();
  assert.ok(html.includes('■児童A') && !html.includes(LEO_LINE_PLAN_NOTE), '予定の取得に失敗しても日誌の児童は出す');

  const beforeDemo = calls.length;
  sandbox.DEMO = true;
  html = await lineHtml();
  assert.ok(html.includes('見本データです'));
  assert.ok(html.includes('■児童A') && html.includes('■児童B') && html.includes('■児童C'));
  assert.ok(!html.includes(LEO_LINE_PLAN_NOTE));
  assert.strictEqual(calls.length, beforeDemo, '見本モードは DB を読まない');
  html = await draftHtml();
  assert.ok(html.includes('見本データです') && html.includes('■児童A') && !html.includes(LEO_LINE_PLAN_NOTE));
  assert.strictEqual(calls.length, beforeDemo, '見本の下書き画面も DB を読まない');
  sandbox.DEMO = false;

  const els = {};
  sandbox.$ = id => els[id] || (els[id] = { value: '', textContent: '', style: {} });
  els.ln_x = { value: '本日もありがとうございました。\n公園で遊びました。\n齊藤連', textContent: '', style: {} };
  els.ln_x_m = { value: '', textContent: '', style: {} };
  installSb({
    leo_nikki: [],
    leo_activity: [{ text: '公園で遊んだ。' }],
  });
  sandbox.LINE_DAY = day;
  await sandbox.saveLine('加藤 湊', 'ln_x', null);
  const posts = calls.filter(c => c.method !== 'GET');
  assert.ok(posts.some(c => c.method === 'POST' && c.path === 'leo_line_drafts' && c.body.includes('加藤 湊') && c.body.includes(day)));
  assert.ok(posts.some(c => c.method === 'POST' && c.path === 'rpc/leo_activity_from_drafts' && c.body.includes(day)));
  assert.ok(!posts.some(c => c.path === 'leo_edits'), '活動記録はポータルのRPCへ。Googleの直し依頼には出さない');
  assert.strictEqual(els.ln_x_m.textContent, '保存し、日誌の活動記録へ転記しました。');

  installSb({
    leo_nikki: [{ row_no: 4, activity: '' }],
    leo_activity: [{ text: '公園で遊んだ。' }],
  });
  await sandbox.saveLine('児童A', 'ln_x', 9);
  assert.ok(calls.some(c => c.method === 'PATCH' && c.path.includes('leo_line_drafts?id=eq.9')));
  assert.ok(calls.some(c => c.method === 'POST' && c.path === 'rpc/leo_activity_from_drafts'));
  assert.ok(!calls.some(c => c.path === 'leo_edits'), '日誌の行があってもシートへ書き戻さない');

  sandbox.DEMO = true;
  const n = calls.length;
  await sandbox.saveLine('児童A', 'ln_x', null);
  assert.strictEqual(calls.length, n, '見本モードは保存しない');
  assert.strictEqual(els.ln_x_m.textContent, '見本モードなので保存しません。');
  sandbox.DEMO = false;

  const src = read('leo.js');
  assert.ok(src.includes('rpc/leo_activity_from_drafts'));
  assert.ok(src.includes('rpc/leo_record_day'));
  assert.ok(src.includes('rpc/leo_nikki_apply'));
  assert.ok(!src.includes("target: 'nikki'"), '活動の書き戻し依頼を出さない');
  const page = read('index.html');
  assert.ok(page.includes('leo.js?v=20261103extra'));
  assert.ok(page.indexOf('leo_meal.js') < page.indexOf('leo.js?v=20261103extra'), '食事の関数を日誌より先に読む');

  console.log('leo_line_kids_test: ok');
})().catch(e => { console.error(e); process.exit(1); });
