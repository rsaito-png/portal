// 会長ページの問い合わせ一覧。本番へは送らない。サーバーの本人判定と営業隔離を画面が壊さないことだけ見る。
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'contact_inbox.js'), 'utf8');
const chair = fs.readFileSync(path.join(root, 'chair.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const config = fs.readFileSync(path.join(root, 'config.js'), 'utf8');

assert.ok(!src.includes('rsaito'), '本人メールはサーバー照合のまま、画面に書かない');
assert.ok(!src.includes('user_metadata'));
assert.ok(src.includes('site_contact_is_owner'));
assert.ok(src.includes('site_contact_unread_count'));
assert.ok(src.includes("p_lane: 'normal'"));
assert.ok(src.includes("p_lane: 'sales'"));
assert.ok(src.includes('site_contact_restore'));
assert.ok(!/method:\s*'DELETE'|DELETE/.test(src));
assert.ok(!/resend|mailto:|uketsuke_submit/i.test(src));
assert.ok(chair.includes("href=\"#chair/inquiries\""));
assert.ok(chair.includes('contactBadge()'));
assert.ok(chair.includes('id="contact_inbox"'));
assert.ok(chair.includes('contactInboxMount()'));
assert.ok(chair.includes("/rest/v1/rpc/is_chair"));
assert.ok(chair.includes('このページは会長だけが見られます。'));
assert.ok(index.includes('contact_inbox.js?v=20261108inq'));
assert.ok(index.includes('chair.js?v=20261108inq'));
assert.ok(index.indexOf('chair.js?v=20261108inq') < index.indexOf('contact_inbox.js?v=20261108inq'));
assert.ok(index.indexOf('contact_inbox.js?v=20261108inq') < index.indexOf('mgr.js?'));
assert.ok(index.includes("if (id === 'chair') return renderChair();"));
assert.ok(/askButton:\s*false/.test(config), '受付の有効化はここでは変えない');

const route = decodeURIComponent('#chair/inquiries'.slice(1)).split('?')[0].split('/');
assert.deepStrictEqual(route.slice(0, 2), ['chair', 'inquiries']);

const registry = new Map();
function registerIds(owner) {
  for (const [id, node] of registry) {
    if (node.owner === owner && id !== owner.id) registry.delete(id);
  }
  const re = /id="([^"]+)"/g;
  let m;
  while ((m = re.exec(owner.innerHTML))) {
    const id = m[1];
    if (id === owner.id) continue;
    const child = {
      id, owner, scrolled: false,
      scrollIntoView() { this.scrolled = true; },
    };
    registry.set(id, child);
  }
}
function node(id, html) {
  const n = {
    id,
    owner: null,
    scrolled: false,
    _html: '',
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = String(v); registerIds(this); },
    querySelector(sel) {
      if (sel !== '.contact-badge') return null;
      const m = this._html.match(/class="badge contact-badge">([^<]*)</);
      if (!m) return null;
      return { text: m[1], remove: () => { this.innerHTML = this._html.replace(/<span class="badge contact-badge">[^<]*<\/span>/, ''); } };
    },
    insertAdjacentHTML(pos, html) {
      this.innerHTML = pos === 'afterbegin' ? html + this._html : this._html + html;
    },
    scrollIntoView() { this.scrolled = true; },
  };
  n.owner = n;
  n.innerHTML = html || '';
  registry.set(id, n);
  return n;
}

const calls = [];
const queue = [];
global.DEMO = false;
global.C = { supabaseUrl: 'https://example.test', supabaseKey: 'test-key' };
global.localStorage = { getItem: () => JSON.stringify({ token: 'owner-token' }) };
global.location = { hash: '#chair/inquiries' };
global.esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
global.document = { getElementById: id => registry.get(id) || null };
global.fetch = async (url, opt) => {
  assert.strictEqual(opt.method, 'POST');
  assert.ok(String(url).startsWith('https://example.test/rest/v1/rpc/site_contact_'));
  assert.strictEqual(opt.headers.Authorization, 'Bearer owner-token');
  assert.strictEqual(opt.headers.apikey, 'test-key');
  calls.push({ url: String(url), body: JSON.parse(opt.body) });
  const next = queue.shift();
  if (!next) throw new Error('unexpected rpc ' + url);
  return { ok: next.ok !== false, status: next.status || 200, text: async () => JSON.stringify(next.data) };
};

vm.runInThisContext(src);

const normalId = '11111111-1111-4111-8111-111111111111';
const referralId = '22222222-2222-4222-8222-222222222222';
const salesId = '33333333-3333-4333-8333-333333333333';
const normalRows = [
  { id: normalId, created_at: '2026-11-08T01:02:03Z', name: '<img onerror=alert(1)>', email: 'care@example.jp', service: '児童発達支援', body: '利用について相談したい', review: 'needs-review', read_at: null, sales_reason: '' },
  { id: referralId, created_at: '2026-11-07T03:04:05Z', name: '紹介元', email: 'ref@example.jp', service: '相談支援', body: '紹介連携の相談です', review: '', read_at: '2026-11-07T04:00:00Z', sales_reason: '' },
];
const salesRows = [
  { id: salesId, created_at: '2026-11-06T05:06:07Z', name: '営業担当', email: 'sales@example.jp', service: '広告', body: '未承諾の売り込み', review: '', read_at: null, sales_reason: '売り込みと判断' },
];

(async () => {
const tile = node('chair_tile', '<span>👑</span>会長ページ');
const box = node('contact_inbox', '読み込み中…');
queue.push({ data: true }, { data: 1 });
await contactBadge();
assert.ok(tile.innerHTML.includes('新着 1'));
assert.ok(!tile.innerHTML.includes('未承諾の売り込み'));
queue.push({ data: true }, { data: normalRows }, { data: salesRows });
await contactInboxMount();
const html = box.innerHTML;
assert.ok(html.includes('（未読 1）'), '通常未読だけを数える');
assert.ok(html.includes('利用について相談したい'));
assert.ok(html.includes('紹介連携の相談です'));
assert.ok(html.includes('要確認'));
assert.ok(html.includes('&lt;img onerror=alert(1)&gt;'));
assert.ok(!html.includes('<img'));
assert.ok(html.includes('未承諾の売り込み'));
assert.ok(html.includes('通常の受信に戻す'));
assert.ok(html.includes(`contactRestore('${salesId}')`));
assert.ok(!html.includes(`contactRestore('${normalId}')`));
assert.ok(html.includes(`contactMarkRead('${normalId}')`));
assert.ok(!html.includes(`contactMarkRead('${referralId}')`));
assert.ok(html.includes('営業の隔離 （1件）'));
assert.strictEqual(document.getElementById('contact_inbox_h').scrolled, true);
assert.ok(!calls.some(c => c.url.endsWith('site_contact_restore') || c.url.endsWith('site_contact_mark_read')));

location.hash = '#chair';
queue.length = 0;
queue.push({ data: true }, { data: normalRows }, { data: [] });
await contactInboxMount();
assert.strictEqual(document.getElementById('contact_inbox_h').scrolled, false);
assert.ok(box.innerHTML.includes('隔離中の営業はありません。'));

queue.length = 0;
queue.push({ data: true }, { data: normalRows }, { ok: false, status: 500, data: { message: 'no' } });
await contactInboxMount();
assert.ok(box.innerHTML.includes('営業の隔離を表示できません。'));
assert.ok(!box.innerHTML.includes('隔離中の営業はありません。'));
assert.ok(box.innerHTML.includes('利用について相談したい'));

queue.length = 0;
queue.push({ data: false });
await contactInboxMount();
assert.strictEqual(box.innerHTML, '');
queue.push({ data: false });
await contactBadge();
assert.ok(!tile.innerHTML.includes('contact-badge'));

const beforeAnon = calls.length;
localStorage.getItem = () => '{}';
await contactInboxMount();
await contactBadge();
await contactMarkRead(salesId);
await contactRestore(salesId);
assert.strictEqual(calls.length, beforeAnon, 'トークンが無いときは送らない');
assert.strictEqual(box.innerHTML, '');

DEMO = true;
localStorage.getItem = () => JSON.stringify({ token: 'owner-token' });
const beforeDemo = calls.length;
await contactRestore(salesId);
assert.strictEqual(calls.length, beforeDemo, '見本モードは送らない');

DEMO = false;
await contactMarkRead("');alert(1)");
await contactRestore('not-a-uuid');
assert.ok(!calls.some(c => c.url.endsWith('site_contact_mark_read') || c.url.endsWith('site_contact_restore')));

queue.length = 0;
queue.push({ data: true }, { data: true }, { data: normalRows }, { data: [] }, { data: true }, { data: 1 });
await contactRestore(salesId);
const restore = calls.filter(c => c.url.endsWith('site_contact_restore'));
assert.strictEqual(restore.length, 1);
assert.deepStrictEqual(restore[0].body, { p_id: salesId });

console.log('contact_inbox_check ok', calls.length, 'mocked rpc calls');
})().catch((e) => { console.error(e); process.exit(1); });
