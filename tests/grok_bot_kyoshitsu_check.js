// AIエージェントを教える教室は、1枚のLPだけ。福祉ポータルのログインには繋がない。
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { kyoshitsuInquiry } = require('../kyoshitsu/inquiry.js');

const root = path.join(__dirname, '..');
const dir = path.join(root, 'kyoshitsu');
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const portal = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const pages = fs.readdirSync(dir).filter(name => name.endsWith('.html'));

assert.deepStrictEqual(pages, ['index.html'], 'one landing page only');
assert.ok(!fs.existsSync(path.join(root, 'grok-bot-kyoshitsu')), 'old path removed');
assert.ok(html.includes('lang="ja"'), 'lang');
assert.ok(html.includes('<title>AIエージェントを教える教室｜四日市</title>'), 'title');
assert.ok(html.includes('name="description"'), 'description');
assert.ok(html.includes('https://rsaito-png.github.io/portal/kyoshitsu/'), 'public path');
assert.ok(html.includes('<h1 id="hero-title">AIエージェントを教える教室</h1>'), 'h1');
assert.ok(html.includes('個人経営。会社の経営者。'), 'audience');
assert.ok(html.includes('短い言葉で伝わる'), 'short words');
assert.ok(html.includes('汲み取る。'), 'reads you');
assert.ok(html.includes('1を聞いて、10までやる。'), 'one to ten');
assert.ok(html.includes('忙しい人ほど、向く。'), 'busy people');
assert.ok(html.includes('齊藤 連'), 'name');
for (const banned of ['普通の人は使わなくてもいい', 'ハイレベルの人だけ使え', 'マジで人生変わる', 'はっきり言っとく', '優秀すぎて', '教授', '中高年']) {
  assert.ok(!html.includes(banned), 'banned: ' + banned);
}
assert.ok(html.includes('ホームページのまとめ'), 'homepage');
assert.ok(html.includes('手作業だったことが全部自動化できる'), 'automation claim');
assert.ok(html.includes('ポータルも作れる'), 'portal claim');
assert.ok(html.includes('できたサイトのサンプル'), 'portal mock is a sample, not this site');
assert.ok(!html.includes('会員'), 'no member area');
assert.ok(!html.includes('ダッシュボード'), 'no dashboard');
assert.ok(html.includes('来週の午後、空いてるとこで'), 'calendar');
assert.ok(html.includes('月額3万円'), 'price');
assert.ok(html.includes('1か月で卒業'), 'term');
assert.ok(html.includes('対面は週1回、あとはチャット・通話'), 'format');
assert.ok(html.includes('三重県四日市市あさけが丘2-1-42（〒512-8055）'), 'address');
assert.ok(html.includes('090-6708-2837'), 'phone');
assert.ok(html.includes('tel:09067082837'), 'tel link');
assert.ok(html.includes('src="img/hero.jpg"'), 'hero path');
assert.ok(html.includes('src="img/speed.jpg"'), 'speed path');
assert.ok(html.includes('src="img/weekly.jpg"'), 'weekly path');
assert.ok(html.includes('alt="紫がかった髪の女性の宇宙人"'), 'hero alt');
assert.ok(html.includes('alt="画面を指さす女性の宇宙人"'), 'speed alt');
assert.ok(html.includes('alt="机でパソコンに向かう女性の宇宙人"'), 'weekly alt');
['基礎', '仕事接続', '仕組み化', '卒業制作'].forEach(word => assert.ok(html.includes(word), word));
assert.ok(!html.includes('教授'), 'no 教授');
assert.ok(!html.includes('伝授'), 'no 伝授');
assert.ok(!html.includes('Grok'), 'product name stays off the page');
assert.ok(!/supabase|password|パスワード|カード番号/i.test(html), 'no portal auth or payment fields');
assert.ok(!html.includes('https://cdn.'), 'no image cdn');
assert.ok(!portal.includes('kyoshitsu'), 'staff portal home does not link the classroom');

for (const name of ['hero.jpg', 'speed.jpg', 'weekly.jpg']) {
  const buf = fs.readFileSync(path.join(dir, 'img', name));
  assert.ok(buf.length > 50000, name + ' is a real image');
  assert.strictEqual(buf[0], 0xff);
  assert.strictEqual(buf[1], 0xd8);
}

const ok = kyoshitsuInquiry({ name: '山田', purpose: '申し込み', note: '小売です' });
assert.strictEqual(ok.ok, true);
assert.ok(ok.text.includes('AIエージェントを教える教室への申し込み'));
assert.ok(ok.text.includes('山田'));
assert.strictEqual(ok.phone, '090-6708-2837');
assert.ok(!ok.text.includes('Grok'), 'inquiry text does not lead with the product name');

const bad = kyoshitsuInquiry({ name: '  ', purpose: '', note: '' });
assert.strictEqual(bad.ok, false);
assert.ok(bad.errors.length >= 2);

console.log('kyoshitsu lp ok');
