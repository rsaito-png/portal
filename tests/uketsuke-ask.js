// 受付の「このページから送る」：送信文の組み立て（行き先は既存の uketsuke_submit の本文）
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const window = {};
vm.runInNewContext(fs.readFileSync(require('path').join(__dirname, '../config.js'), 'utf8'), { window });
const { UK_CATS, ukRouteFrom, ukComposeBody, ukSubjectOf } = require('../uketsuke.js');
const C = window.PORTAL_CONFIG;

function root(opts) {
  const ids = opts.ids || {};
  const all = opts.all || {};
  return {
    getElementById: id => ids[id] || null,
    querySelectorAll: sel => all[sel] || [],
  };
}
function h3(text) { return { textContent: text }; }
function cardWith(name) {
  const b = { textContent: name };
  const card = { querySelector: () => b };
  return { closest: () => card };
}

const cases = [
  ['top', ukRouteFrom('/portal/index.html', '', C), 'トップ', 'index.html'],
  ['uketsuke', ukRouteFrom('/index.html', '#uketsuke', C), '受付', 'index.html#uketsuke'],
  ['leo home', ukRouteFrom('/index.html', '#leo', C), 'レオ', 'index.html#leo'],
  ['userinfo', ukRouteFrom('/index.html', '#leo/userinfo', C), 'レオ / 利用者情報（児童ごと）', 'index.html#leo/userinfo'],
  ['group', ukRouteFrom('/index.html', '#leo/g0', C), 'レオ / 現場', 'index.html#leo/g0'],
  ['plan group', ukRouteFrom('/index.html', '#leo/g1', C), 'レオ / 事務・計画', 'index.html#leo/g1'],
  ['sign', ukRouteFrom('/index.html', '#sign', C), '書類の確認と署名', 'index.html#sign'],
  ['dakoku', ukRouteFrom('/index.html', '#dakoku', C), '出退勤打刻', 'index.html#dakoku'],
  ['esign help', ukRouteFrom('/esign-help.html', '', C), '電子サインの使い方', 'esign-help.html'],
  ['acc tax', ukRouteFrom('/acc.html', '#tax', C), '会計（簡易） / 申告', 'acc.html#tax'],
];
for (const [name, got, label, route] of cases) {
  assert.strictEqual(got.label, label, name + ' label');
  assert.strictEqual(got.route, route, name + ' route');
}

const withChild = ukComposeBody('おやつはどこに書く？', { label: 'レオ / 利用者情報（児童ごと）', route: 'index.html#leo/userinfo', subject: { kind: '児童', name: '児童A' } });
assert.strictEqual(withChild.empty, false);
assert.strictEqual(withChild.tooLong, false);
assert.ok(withChild.body.startsWith('【送信元】レオ / 利用者情報（児童ごと）（index.html#leo/userinfo）\n【児童】児童A\n\nおやつはどこに書く？'), withChild.body);
assert.ok(!withChild.body.includes('p_category'));

const noChild = ukComposeBody('コピー機が止まります', { label: 'トップ', route: 'index.html', subject: null });
assert.strictEqual(noChild.body, '【送信元】トップ（index.html）\n\nコピー機が止まります');
assert.ok(!noChild.body.includes('【児童】') && !noChild.body.includes('【利用者】'));

assert.strictEqual(ukComposeBody('   ', { label: 'トップ', route: 'index.html' }).empty, true);
const long = ukComposeBody('あ'.repeat(4000), { label: 'トップ', route: 'index.html' });
assert.strictEqual(long.tooLong, true);
assert.ok(long.body.length > 4000);

assert.deepStrictEqual(UK_CATS, ['その他', '日誌', '送迎', '請求', '計画', '記録']);

assert.deepStrictEqual(ukSubjectOf('#leo/userinfo', { UI: { sel: '児童A' } }, root({})), { kind: '児童', name: '児童A' });
assert.strictEqual(ukSubjectOf('#leo/userinfo', { UI: { sel: null } }, root({})), null);
assert.deepStrictEqual(ukSubjectOf('#leo/cal', {}, root({ ids: { cf_child: { value: '児童C' } } })), { kind: '児童', name: '児童C' });
assert.strictEqual(ukSubjectOf('#leo/cal', {}, root({})), null);

const editor = { querySelector: sel => sel === 'h3' ? h3('児童A　第2期') : null };
assert.deepStrictEqual(ukSubjectOf('#leo/plan', {}, root({ ids: { plan_editor: editor } })), { kind: '児童', name: '児童A' });
assert.deepStrictEqual(
  ukSubjectOf('#leo/plan', {}, root({ all: { '#view .card details[open]': [cardWith('児童B')] } })),
  { kind: '児童', name: '児童B' });
assert.strictEqual(
  ukSubjectOf('#leo/plan', {}, root({ all: { '#view .card details[open]': [cardWith('児童B'), cardWith('児童C')] } })),
  null);

assert.deepStrictEqual(
  ukSubjectOf('#leo/diary', {}, root({ all: { '#view details[open] summary b': [{ textContent: '■児童A' }] } })),
  { kind: '児童', name: '児童A' });
assert.strictEqual(
  ukSubjectOf('#leo/line', {}, root({ all: { '#view details[open] summary b': [{ textContent: '■児童A' }, { textContent: '■児童B' }] } })),
  null);

assert.deepStrictEqual(ukSubjectOf('#kintoun/consent', { KIN: { name: '利用者A' } }, root({})), { kind: '利用者', name: '利用者A' });
assert.strictEqual(ukSubjectOf('#kintoun/consent', { KIN: { name: null } }, root({})), null);
assert.deepStrictEqual(
  ukSubjectOf('#kintoun/ledger', { KL: { id: 4 } }, root({ all: { '#view h3': [h3('山田')] } })),
  { kind: '利用者', name: '山田' });
assert.strictEqual(ukSubjectOf('#kintoun/ledger', { KL: { id: null } }, root({ all: { '#view h3': [h3('山田')] } })), null);

const opt = { selectedIndex: 0, options: [{ textContent: '利用者B' }] };
assert.deepStrictEqual(ukSubjectOf('#kintoun/visit', { KV: { id: 9 } }, root({ ids: { kv_user_id: opt } })), { kind: '利用者', name: '利用者B' });
assert.deepStrictEqual(
  ukSubjectOf('#kintoun/print', { KPR: { uid: 2 } }, root({ all: { '#view select': [opt] } })),
  { kind: '利用者', name: '利用者B' });
assert.deepStrictEqual(
  ukSubjectOf('#suishodama/plan', { SUI: { uid: 1 } }, root({ all: { '#view select': [opt] } })),
  { kind: '利用者', name: '利用者B' });
assert.deepStrictEqual(
  ukSubjectOf('#suishodama/plan', { SUI: { uid: 1 } }, root({ all: { '#view h3': [h3('計画案：サービス等利用計画　佐藤　v2（継続）')] } })),
  { kind: '利用者', name: '佐藤' });
assert.deepStrictEqual(
  ukSubjectOf('#rydeen/users', { RYD: { st: { user: 'abc' } } }, root({ ids: { u_name: { value: '鈴木' } } })),
  { kind: '利用者', name: '鈴木' });
assert.strictEqual(ukSubjectOf('#rydeen/users', { RYD: { st: { user: null } } }, root({ ids: { u_name: { value: '鈴木' } } })), null);
assert.strictEqual(ukSubjectOf('#leo/kids', { UI: { sel: '児童A' } }, root({})), null, '一覧画面には児童を付けない');

const ctx = { label: 'レオ / 日誌（児童ごと）', route: 'index.html#leo/diary', subject: { kind: '児童', name: '児童A' } };
const payload = { p_category: '日誌', p_body: ukComposeBody('活動記録はどこ？', ctx).body };
assert.deepStrictEqual(Object.keys(payload).sort(), ['p_body', 'p_category']);
assert.strictEqual(payload.p_category, '日誌');
assert.ok(payload.p_body.includes('【送信元】レオ / 日誌（児童ごと）（index.html#leo/diary）'));
assert.ok(payload.p_body.includes('【児童】児童A'));
assert.ok(payload.p_body.endsWith('活動記録はどこ？'));

console.log('uketsuke-ask: ok');
