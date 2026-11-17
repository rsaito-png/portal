// 茶夢の個別支援計画。期の計算、確定後の本文ロック、見本画面、名前の検査。
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const src = read('chamu.js');
const pure = src.split('/* cm-plan-pure */')[1].split('/* /cm-plan-pure */')[0];
const box = {};
vm.runInNewContext(pure + '\nthis.ChamuPlan = ChamuPlan;', box);
const P = box.ChamuPlan;

assert.strictEqual(P.periodEnd('2026-05-01'), '2026-10-31');
assert.strictEqual(P.nextStart('2026-10-31'), '2026-11-01');
assert.strictEqual(P.periodEnd('2026-11-01'), '2027-04-30');
assert.strictEqual(P.periodEnd('2026-10-16'), '2027-04-15');
assert.strictEqual(P.periodEnd('2026-08-31'), '2027-02-27');
const g = P.guides('2026-11-01');
assert.strictEqual(g.assess_on, '2026-10-28');
assert.strictEqual(g.genan_on, '2026-10-29');
assert.strictEqual(g.kaigi_on, '2026-10-30');
assert.strictEqual(g.honan_on, '2026-10-31');

const draft = { status: '下書き', user_id: 'u', term_no: 1, genan: '原案', honan: '本案', assessment: 'a', monitoring: 'm', kaigi: 'k', start_on: '2026-11-01', end_on: '2027-04-30' };
assert.strictEqual(P.statusLabel(draft), '下書き');
assert.strictEqual(P.statusLabel({ ...draft, status: '原案確定', genan_signed_at: 't' }), '原案署名済');
assert.strictEqual(P.statusLabel({ ...draft, status: '本案確定', genan_signed_at: 't', honan_signed_at: 't' }), '本案署名済');
assert.strictEqual(P.urgency({ end_on: '2026-10-31', honan_signed_at: 't' }, '2026-11-17'), 'next');
assert.strictEqual(P.urgency({ end_on: '2026-10-31', honan_signed_at: null }, '2026-11-17'), 'over');
assert.strictEqual(P.urgency({ end_on: '2026-12-01', honan_signed_at: null, status: '下書き' }, '2026-11-17'), 'soon');
assert.strictEqual(P.urgency(null, '2026-11-17'), 'none');

const confirmed = P.applyPlanPatch(draft, { status: '原案確定', genan: '原案を確定' });
assert.strictEqual(confirmed.status, '原案確定');
assert.throws(() => P.applyPlanPatch(confirmed, { genan: '書き換え' }), /原案/);
assert.strictEqual(P.applyPlanPatch(confirmed, { kaigi: '【出席者】【要確認】', honan: '本案の文章' }).honan, '本案の文章');
const finalPlan = P.applyPlanPatch({ ...confirmed, honan: '本案の文章' }, { status: '本案確定' });
assert.throws(() => P.applyPlanPatch(finalPlan, { honan: '改ざん', assessment: '改ざん' }), /本文は変えられません/);
assert.throws(() => P.applyPlanPatch(draft, { genan_signed_at: '2020-01-01' }), /署名日時/);
assert.throws(() => P.applyPlanPatch(draft, { status: '本案確定' }), /順/);
const signed = P.applySign(confirmed, '原案');
assert.ok(signed.genan_signed_at);
assert.throws(() => P.applySign(signed, '原案'), /署名済み/);
assert.throws(() => P.applySign(signed, '本案'), /本案を確定/);
assert.ok(P.applySign({ ...signed, status: '本案確定' }, '本案').honan_signed_at);
assert.throws(() => P.applySign(draft, '原案'), /確定してから/);

const hits = P.needs({ assessment: '意向は【要確認】', monitoring: '', genan: 'x', kaigi: '【開催日】【要確認】', honan: '' });
assert.strictEqual(hits.length, 2);
assert.strictEqual(hits[0].doc, 'アセスメント');
assert.ok(P.fieldLocked(confirmed, 'genan') && !P.fieldLocked(confirmed, 'honan'));
assert.ok(P.fieldLocked(finalPlan, 'assessment') && P.fieldLocked(finalPlan, 'kaigi'));

const rulesSrc = read('supabase/functions/chamu-plan-draft/rules.js').replace(/^export /gm, '');
const rules = {};
vm.runInNewContext(rulesSrc + '\nthis.api = { checkPlanText, maskNames, normName };', rules);
const ctx = { userName: '利用者A', author: '齊藤 連', otherNames: ['利用者B', '辻 吉樹'], staffNames: ['職員X', '安藤 尚子'] };
assert.strictEqual(rules.api.checkPlanText('利用者Aさんは10:30から過ごした。作成者は齊藤 連。', ctx).length, 0);
assert.ok(rules.api.checkPlanText('利用者Bさんと過ごした。', ctx).includes('他の利用者名'));
assert.ok(rules.api.checkPlanText('辻吉樹さんと散歩した。', ctx).includes('他の利用者名'));
assert.ok(rules.api.checkPlanText('安藤さんが手伝った。', ctx).includes('職員名'));
const masked = rules.api.maskNames('利用者Bと職員Xがいた。利用者Aは残った。', ['利用者B', '職員X'], '他の利用者');
assert.ok(!masked.includes('利用者B') && !masked.includes('職員X'));
assert.ok(masked.includes('利用者A'));

const draftFn = read('supabase/functions/chamu-plan-draft/index.ts');
assert.ok(draftFn.includes('checkPlanText'));
assert.ok(draftFn.includes('下書きではないため書き戻しませんでした'));
assert.ok((draftFn.match(/await ask\(/g) || []).length === 2);
assert.ok(!draftFn.includes('hogosha'));
const readFn = read('supabase/functions/chamu-svcplan-read/index.ts');
assert.ok(readFn.includes('chamu_can_plan') && readFn.includes('input_file') && !readFn.includes('chamu_service_plans'));
const browser = src + read('config.js');
['XAI_API_KEY', 'service_role', 'sui_service_key', 'hogosha.html'].forEach(s => assert.ok(!browser.includes(s), s));
assert.ok(src.includes("['plan', '個別支援計画']"));
assert.ok(read('config.js').includes('#chamu/plan'));
assert.ok(read('supabase/chamu_plan.sql').includes('署名記録は書き換え・削除できません'));
assert.ok(read('supabase/chamu_plan.sql').includes("(now() at time zone 'Asia/Tokyo')::date"));
assert.ok(!read('supabase/chamu_plan.sql').includes('cron'));

(async () => {
  const view = { innerHTML: '' };
  const els = { view };
  const sandbox = {
    DEMO: true, console,
    Date, Math, JSON, Promise, Number, String, Object, Array, RegExp, Error, parseInt, isNaN, encodeURIComponent,
    document: {
      createElement() { return { textContent: '', className: '', innerHTML: '', style: {}, hidden: false, appendChild() {}, setAttribute() {}, addEventListener() {} }; },
      head: { appendChild() {} },
      body: { style: {}, appendChild() {}, removeChild() {} },
      getElementById(id) { return els[id] || null; },
      addEventListener() {},
    },
    localStorage: { getItem: () => '{}', setItem() {} },
    location: { hash: '#chamu/plan', search: '?demo=1' },
    navigator: {},
    setTimeout() { return 0; },
    clearTimeout() {},
    alert() {},
    confirm: () => false,
    fetch: async () => { throw new Error('見本から通信しました'); },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src + '\nthis.renderChamu = renderChamu; this.CM = CM;', sandbox);
  await sandbox.renderChamu('plan');
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
  assert.ok(view.innerHTML.includes('利用者A') && view.innerHTML.includes('利用者B'));
  assert.ok(view.innerHTML.includes('見本モード'));
  if (today > '2026-10-31') assert.ok(view.innerHTML.includes('次の期がまだありません'));
  assert.ok(!view.innerHTML.includes('辻') && !view.innerHTML.includes('hogosha'));
  sandbox.CM.st.planUser = 'demo-b';
  await sandbox.renderChamu('plan');
  assert.ok(view.innerHTML.includes('サービス等利用計画'));
  sandbox.CM.st.planId = 'db1';
  await sandbox.renderChamu('plan');
  const edit = view.innerHTML;
  assert.ok(edit.includes('【要確認】') && edit.includes('AIで下書きを作る'));
  assert.ok(!edit.includes('タブレットで'));
  assert.ok(edit.includes('原案確定'));
  assert.ok(!edit.includes('利用者A'));
  console.log('chamu_plan_test ok');
})().catch(e => { console.error(e); process.exit(1); });
