// 金斗雲の訪問署名（sign.html）は、表示中の未署名をすべて署名対象にする。
// チェック欄・週の全選は出さない。契約・同意の署名画面は対象外。
process.env.TZ = 'Asia/Tokyo';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'sign.html'), 'utf8');
const contract = fs.readFileSync(path.join(root, 'contract_sign.html'), 'utf8');
const consent = fs.readFileSync(path.join(root, 'consent_sign.html'), 'utf8');
const sql = fs.readFileSync(path.join(root, 'supabase/kin_sign.sql'), 'utf8');

assert.ok(!html.includes('type="checkbox"'));
assert.ok(!html.includes('wsel'));
assert.ok(!html.includes('vc:checked'));
assert.ok(!html.includes('この週をすべて選ぶ'));
assert.ok(!html.includes('はずす'));
assert.ok(!html.includes('チェックを入れて'));
assert.ok(!html.includes('選ばなかった訪問'));
assert.ok(!html.includes('訪問を選んでください'));
assert.ok(html.includes('表示されている訪問はすべて署名されます。'));
assert.ok(html.includes('function shownIds()'));
assert.ok(html.includes("querySelectorAll('.v[data-id]')"));
assert.ok(html.includes('p_visit_ids: ids'));
assert.ok(html.includes('kin_sign_get'));
assert.ok(html.includes('kin_sign_submit'));
assert.ok(html.includes('あとでもう一度使えます'));

assert.ok(contract.includes('type="checkbox" class="vc"'));
assert.ok(contract.includes('同意する書類にチェックを入れてください。'));
assert.ok(consent.includes('type="checkbox" id="okc"'));
assert.ok(consent.includes('「同意します」にチェックを入れてください。'));

const submit = sql.slice(sql.lastIndexOf('create or replace function public.kin_sign_submit'));
assert.ok(submit.includes('id = any(p_visit_ids) and user_id = l.user_id and sign_status <> \'署名済み\''));
assert.ok(submit.includes('l.used_at is not null or l.expires_at <= now()'));
assert.ok(submit.includes("p_method <> 'あとで署名' then update kin_sign_links set used_at = now()"));
assert.ok(submit.includes('length(p_token) = 48'));
assert.ok(sql.includes("token ~ '^[0-9a-f]{48}$'"));
assert.ok(sql.includes("interval '7 days'"));
assert.ok(sql.includes('v.sign_status <> \'署名済み\''));

function boot(search, answers) {
  const calls = [];
  const store = new Map();
  const ensure = id => {
    if (!store.has(id)) store.set(id, { id, hidden: false, innerHTML: '', textContent: '', value: '', disabled: false, style: {} });
    return store.get(id);
  };
  for (const id of ['m', 'dlg', 'dlgt', 'dlgm']) ensure(id);
  let method = '本人';
  const sandbox = {
    window: {
      PORTAL_CONFIG: { supabaseUrl: 'https://example.test', supabaseKey: 'anon' },
      addEventListener() {},
      scrollY: 0,
      scrollTo() {},
    },
    document: {
      getElementById(id) {
        if (store.has(id)) return store.get(id);
        if (store.get('m').innerHTML.includes(`id="${id}"`)) return ensure(id);
        return null;
      },
      querySelector(sel) {
        if (sel === 'input[name=mt]:checked') return { value: method };
        return null;
      },
      querySelectorAll(sel) {
        if (sel !== '.v[data-id]') return [];
        const out = [];
        const re = /class="v" data-id="(\d+)"/g;
        let m;
        while ((m = re.exec(store.get('m').innerHTML))) {
          const id = m[1];
          out.push({ getAttribute: () => id });
        }
        return out;
      },
      createElement() { return {}; },
      body: { style: {}, classList: { contains() { return false; }, add() {}, remove() {} } },
    },
    location: { search },
    URLSearchParams,
    fetch: async (url, opt) => {
      const body = JSON.parse(opt.body);
      calls.push({ url: String(url), body });
      if (String(url).endsWith('/kin_sign_get')) return { ok: true, json: async () => answers.get };
      if (String(url).endsWith('/kin_sign_submit')) return { ok: answers.submitOk !== false, json: async () => (body.p_visit_ids || []).length };
      return { ok: false, json: async () => null };
    },
    console,
  };
  const src = html.match(/<script>\n\/\/ 本人向け[\s\S]*?<\/script>/)[0]
    .replace(/^<script>\n/, '').replace(/<\/script>$/, '').replace(/\nload\(\);\s*$/, '\n');
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return {
    sandbox,
    calls,
    main: () => store.get('m').innerHTML,
    setMethod: v => { method = v; },
    setValue: (id, value) => { ensure(id).value = value; },
  };
}

const TOKEN = 'ab'.repeat(24);
const visits = [
  { id: 10, date: '2026-10-01', start: '09:25', end: '10:25', minutes: 60, service: '身体介護', staff: '職員A', content: '<b>食事</b>', note: null },
  { id: 11, date: '2026-10-03', start: '09:25', end: '10:25', minutes: 60, service: '身体介護', staff: '職員A', content: null, note: '特記&' },
  { id: 12, date: '2026-10-08', start: '14:00', end: '15:00', minutes: 60, service: '生活援助', staff: '職員B', content: '掃除', note: null },
];

(async () => {
  const page = boot('?t=' + TOKEN, {
    get: { name: '利用者A', expires_at: '2026-11-08T00:00:00Z', visits },
  });
  await page.sandbox.load();
  const view = page.main();
  assert.ok(view.includes('利用者A'));
  assert.ok(view.includes('内容をご確認のうえ、下の署名欄に署名してください。表示されている訪問はすべて署名されます。'));
  assert.ok(view.includes('9/28〜10/4の週'));
  assert.ok(view.includes('10/5〜10/11の週'));
  assert.ok(view.includes('10/1（木）'));
  assert.ok(view.includes('10/3（土）'));
  assert.ok(view.includes('&lt;b&gt;食事&lt;/b&gt;'));
  assert.ok(view.includes('特記：特記&amp;'));
  assert.ok(!view.includes('checkbox'));
  assert.ok(!view.includes('この週をすべて選ぶ'));
  assert.ok(!view.includes('はずす'));
  assert.ok(!view.includes('チェック'));
  assert.deepStrictEqual(Array.from(page.sandbox.shownIds()), [10, 11, 12]);
  assert.strictEqual(page.calls.length, 1);
  assert.strictEqual(page.calls[0].body.p_token, TOKEN);

  const err = () => page.sandbox.document.getElementById('r').innerHTML;
  await page.sandbox.send();
  assert.ok(err().includes('署名を書いてください。'));
  assert.strictEqual(page.calls.length, 1);

  page.setMethod('ご家族');
  await page.sandbox.send();
  assert.ok(err().includes('署名を書いてください。'));
  assert.strictEqual(page.calls.length, 1);

  page.setMethod('署名困難');
  await page.sandbox.send();
  assert.ok(err().includes('理由を入れてください。'));
  page.setValue('rsnv', '手が動きにくい');
  await page.sandbox.send();
  assert.strictEqual(page.calls.length, 2);
  const sent = page.calls[1].body;
  assert.deepStrictEqual(sent.p_visit_ids, [10, 11, 12]);
  assert.strictEqual(sent.p_token, TOKEN);
  assert.strictEqual(sent.p_method, '署名困難');
  assert.strictEqual(sent.p_signature, null);
  assert.strictEqual(sent.p_relation, null);
  assert.strictEqual(sent.p_reason, '手が動きにくい');
  assert.ok(page.main().includes('署名を記録しました（3件）'));
  assert.ok(!page.main().includes('checkbox'));

  const later = boot('?t=' + TOKEN, {
    get: { name: '利用者B', expires_at: '2026-11-08T00:00:00Z', visits: visits.slice(0, 2) },
  });
  await later.sandbox.load();
  later.setMethod('あとで署名');
  await later.sandbox.send();
  assert.deepStrictEqual(later.calls[1].body.p_visit_ids, [10, 11]);
  assert.strictEqual(later.calls[1].body.p_method, 'あとで署名');
  assert.strictEqual(later.calls[1].body.p_signature, null);
  assert.ok(later.main().includes('あとで署名として記録しました（2件）'));
  assert.ok(later.main().includes('このリンクは、期限までもう一度使えます。'));

  const empty = boot('?t=' + TOKEN, { get: { name: '利用者C', expires_at: '2026-11-08T00:00:00Z', visits: [] } });
  await empty.sandbox.load();
  assert.ok(empty.main().includes('署名待ちの訪問はありません。'));
  assert.strictEqual(empty.calls.filter(c => c.url.endsWith('/kin_sign_submit')).length, 0);

  const bad = boot('?t=nope', { get: null });
  await bad.sandbox.load();
  assert.ok(bad.main().includes('リンクが正しくないか、期限が切れている・すでに使われています。'));
  assert.strictEqual(bad.calls.length, 0);

  const denied = boot('?t=' + TOKEN, { get: null });
  denied.sandbox.fetch = async (url, opt) => {
    denied.calls.push({ url: String(url), body: JSON.parse(opt.body) });
    return { ok: false, json: async () => null };
  };
  await denied.sandbox.load();
  assert.ok(denied.main().includes('リンクが正しくないか、期限が切れている・すでに使われています。'));
  assert.strictEqual(denied.calls.length, 1);
  assert.ok(denied.calls[0].url.endsWith('/kin_sign_get'));

  const failed = boot('?t=' + TOKEN, { get: { name: '利用者D', expires_at: '2026-11-08T00:00:00Z', visits }, submitOk: false });
  await failed.sandbox.load();
  failed.setMethod('あとで署名');
  await failed.sandbox.send();
  assert.ok(failed.sandbox.document.getElementById('r').innerHTML.includes('送信できませんでした。'));
  assert.strictEqual(failed.sandbox.document.getElementById('go').disabled, false);
  assert.deepStrictEqual(failed.calls[1].body.p_visit_ids, [10, 11, 12]);

  const demo = boot('?demo=1', { get: null });
  await demo.sandbox.load();
  const demoView = demo.main();
  assert.ok(demoView.includes('利用者A（見本）'));
  assert.ok(demoView.includes('表示されている訪問はすべて署名されます。'));
  assert.ok(!demoView.includes('checkbox'));
  assert.ok(!demoView.includes('この週をすべて選ぶ'));
  assert.deepStrictEqual(Array.from(demo.sandbox.shownIds()), [1, 2]);
  demo.setMethod('あとで署名');
  await demo.sandbox.send();
  assert.ok(demo.sandbox.document.getElementById('r').innerHTML.includes('見本なので送信しません。'));
  assert.strictEqual(demo.calls.length, 0);
  assert.deepStrictEqual(Array.from(demo.sandbox.shownIds()), [1, 2]);

  console.log('sign_all_visits ok');
})().catch(e => { console.error(e); process.exit(1); });
