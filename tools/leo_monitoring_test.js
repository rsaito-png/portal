// モニタリングシート（表・計画の目標・印刷）。node tools/leo_monitoring_test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const sandbox = {
  DEMO: true,
  console,
  ROLE: '職員',
  DUTY: '児発管',
  C: { offices: [{ id: 'leo', name: 'レオ' }], supabaseUrl: 'http://example.test', supabaseKey: 'x' },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  location: { origin: 'http://localhost', pathname: '/', hash: '#leo/monitoring', search: '?demo=1&duty=児発管' },
  navigator: {},
  document: {
    getElementById: () => null,
    addEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    body: { classList: { toggle() {} }, appendChild() {}, removeChild() {} },
  },
  fetch: async () => { throw new Error('no fetch'); },
  setInterval() { return 0; },
  setTimeout(fn) { return 0; },
  clearTimeout() {},
  confirm: () => false,
  alert() {},
  btoa, atob, URLSearchParams,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.$ = () => null;
vm.createContext(sandbox);
vm.runInContext(read('leo_left.js'), sandbox, { filename: 'leo_left.js' });
vm.runInContext(read('gl.js'), sandbox, { filename: 'gl.js' });
vm.runInContext(read('leo.js') + '\nthis.__m = { LEO_VIEWS, monGoalsFromHonan, monGoalList, monPrintHtml, monDiaryLines, monOffice };', sandbox, { filename: 'leo.js' });
const { LEO_VIEWS, monGoalsFromHonan, monGoalList, monPrintHtml, monDiaryLines, monOffice } = sandbox.__m;

(async () => {
  const honan = `#T 個別支援計画書（第2期）
【長期目標】
生活の中で、自分からやってみようとする。
【短期目標と支援内容】
1.健康・生活
目標：衣服を自分で整える。
支援：一緒に確かめる。

2.運動・感覚
目標：
支援：声をかける。

3.認知・行動
目標：もう一度やってみる。
支援：できたことを伝える。
`;
  const parsed = monGoalsFromHonan(honan);
  assert.strictEqual(parsed.long_term, '生活の中で、自分からやってみようとする。');
  assert.strictEqual(parsed.short_term.join('|'), '衣服を自分で整える。|もう一度やってみる。');
  assert.strictEqual(monGoalList(parsed)[0], parsed.long_term);

  const lines = monDiaryLines([
    { day: '2026-05-01', child: '児童A', activity_text: '鬼ごっこをした。' },
    { day: '2026-05-01', child: '児童B', text: '別の子の記録' },
    { day: '2026-05-02', child: '児童 A', text: '順番をゆずった。' },
  ], '児童A');
  assert.strictEqual(lines.map(x => x.text).join('|'), '鬼ごっこをした。|順番をゆずった。');

  sandbox.location.hash = '#leo/monitoring';
  const blank = await LEO_VIEWS.monitoring();
  assert.ok(blank.includes('モニタリングシート（相談員へ渡す印刷）'));
  assert.ok(blank.includes('>児童A<') && blank.includes('>児童C<'));
  assert.ok(!blank.includes('value="児童B"') && !blank.includes('value="児童D"'));
  assert.ok(!blank.includes('mon-goal'), '児童を選ぶまでは表を出さない');
  assert.ok(blank.includes('確認して直してから印刷') === false);

  sandbox.location.hash = '#leo/monitoring?child=' + encodeURIComponent('児童A');
  const a = await LEO_VIEWS.monitoring();
  assert.ok(a.includes('class="mon-goal"'), '目標の欄');
  assert.ok(a.includes('衣服を自分で整える') || a.includes('排泄のあと、衣服を自分で整える'));
  assert.ok(a.includes('順番を守って遊ぶ'));
  assert.ok(a.includes('value="第2期"'), '今の期');
  assert.ok(a.includes('AIで評価を作る') && a.includes('>印刷する<') && a.includes('>保存<'));
  assert.ok(a.includes('id="mon_draftnote"'));
  assert.ok(a.includes('確認して直してから印刷してください'));
  assert.ok(!a.includes('value="児童B"'));

  sandbox.location.hash = '#leo/monitoring?child=' + encodeURIComponent('児童C');
  const c = await LEO_VIEWS.monitoring();
  assert.ok(c.includes('計画書から目標を取り出せませんでした') || c.includes('行を足して'));
  assert.ok(c.includes('value="第3期"'));

  const doc = monPrintHtml({
    child: '児童A',
    update_label: '１１月１１日更新',
    rows: [{ goal: '衣服を自分で整える。', trend: '自分で上着を整えました（5月）。', rating: '3', issues: 'これからも一緒に取り組んでいきます。' }],
  });
  assert.strictEqual(monOffice().no, '2450201047');
  assert.ok(doc.includes('<h1>モニタリング</h1>'));
  assert.ok(doc.includes('事業所名：レオ') && doc.includes('事業所番号：2450201047'));
  assert.ok(doc.includes('児童名：児童A') && doc.includes('更新日：１１月１１日更新'));
  assert.ok(doc.includes('期間中の主な行動の推移') && doc.includes('総合評価') && doc.includes('進捗と現在の課題'));
  assert.ok(doc.includes('自分で上着を整えました（5月）。'));
  assert.ok(doc.includes('size: A4 landscape'));
  assert.ok(doc.includes('相談支援専門員　御中') && doc.includes('作成者（児発管）'));
  assert.ok(!doc.includes('確認して直してから印刷'), '確認の注記は印刷しない');
  assert.ok(!doc.includes('<button'));
  assert.ok(!doc.includes('日誌'));

  const bad = monPrintHtml({ child: '<script>', update_label: '', rows: [{ goal: '<b>', trend: '', rating: '', issues: '' }] });
  assert.ok(bad.includes('&lt;script&gt;') && bad.includes('&lt;b&gt;'));

  sandbox.DUTY = '現場支援員';
  sandbox.DEMO = false;
  const denied = await LEO_VIEWS.monitoring();
  assert.ok(denied.includes('児発管'));
  sandbox.DEMO = true;
  sandbox.DUTY = '児発管';

  sandbox.location.hash = '#leo/plan';
  const plan = await LEO_VIEWS.plan();
  assert.ok(plan.includes('モニタリングシートを開く'));
  assert.ok(plan.includes('#leo/monitoring?child=' + encodeURIComponent('児童A')));

  const rules = await import('file://' + path.join(root, 'supabase/functions/monitoring-eval/rules.js'));
  const okRow = [{ goal: '衣服を整える。', trend: '自分で上着を整えました（5月）。公園で順番をゆずりました（6月）。', rating: 3, issues: 'これからも活動の中で様子を見守っていきます。' }];
  assert.deepStrictEqual(rules.checkDraft(okRow, { child: '児童A', other_names: ['児童B'], staff_names: ['職員X'] }), []);
  const ng = rules.checkDraft([{ goal: '衣服を整える。', trend: '児童Bくんが一緒でした（5月）。日誌には少ない。', rating: 9, issues: '次期は記録する。' }], { child: '児童A', other_names: ['児童B'], staff_names: ['職員X'] });
  assert.ok(ng.some(x => x.includes('評価')));
  assert.ok(ng.some(x => x.includes('保護者へ出さない') || x.includes('人名') || x.includes('他の児童')));
  const only = rules.childOnlyDiary([
    { day: '2026-05-01', child: '児童A', text: '鬼ごっこ' },
    { day: '2026-05-01', child: '児童B', text: '別' },
  ], '児童A');
  assert.strictEqual(only.length, 1);
  assert.strictEqual(only[0].text, '鬼ごっこ');
  const norm = rules.normalizeRows({ rows: [{ goal: '別', trend: '遊んだ（5月）。', rating: '３', issues: '見守ります。' }] }, ['衣服を整える。']);
  assert.strictEqual(norm[0].goal, '衣服を整える。');
  assert.strictEqual(norm[0].rating, 3);

  const cfg = read('config.js');
  const idx = read('index.html');
  const sql = read('supabase/leo_monitoring.sql');
  const fn = read('supabase/functions/monitoring-eval/index.ts');
  assert.ok(cfg.includes("['📄', 'モニタリングシート（相談員へ渡す印刷）', '#leo/monitoring'"));
  assert.ok(cfg.includes("'児発管']") && cfg.includes('#leo/monitoring'));
  assert.ok(!cfg.includes("毎日やる＝今日の利用児童・ヒヤリハット・LINE報告を書く・モニタリングシート"));
  assert.ok(idx.includes('leo.js?v=20261111car2'));
  assert.ok(!idx.includes("big('#leo/monitoring'"));
  assert.ok(fn.includes('ログインが必要です'));
  assert.ok(fn.includes('https://api.x.ai/v1/chat/completions'));
  assert.ok(fn.includes('XAI_API_KEY'));
  assert.ok(fn.includes('childOnlyDiary'));
  assert.ok(sql.includes('leo_monitoring') && sql.includes("my_office() = 'レオ' or public.can_manage()"));
  console.log('leo_monitoring_test ok');
})().catch(e => { console.error(e); process.exit(1); });
