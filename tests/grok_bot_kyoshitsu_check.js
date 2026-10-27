// AIエージェントを教える教室は、1枚のLPだけ。福祉ポータルのログインには繋がない。
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { kyoshitsuInquiry } = require('../kyoshitsu/inquiry.js');

const root = path.join(__dirname, '..');
const dir = path.join(root, 'kyoshitsu');
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(dir, 'styles.css'), 'utf8');
const portal = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const pages = fs.readdirSync(dir).filter(name => name.endsWith('.html'));

assert.deepStrictEqual(pages, ['index.html'], 'one landing page only');
assert.ok(!fs.existsSync(path.join(root, 'grok-bot-kyoshitsu')), 'old path removed');
assert.ok(html.includes('lang="ja"'), 'lang');
assert.ok(html.includes('<title>AIエージェントを教える教室｜四日市</title>'), 'title');
assert.ok(html.includes('name="description"'), 'description');
assert.ok(html.includes('https://rsaito-png.github.io/portal/kyoshitsu/'), 'public path');
assert.ok(html.includes('<h1 id="hero-title">AIエージェントを教える教室</h1>'), 'h1');
assert.ok(html.includes('四日市市あさけが丘。個人経営・会社経営者向け。'), 'audience');
assert.ok(html.includes('短く言えば、伝わる。'), 'short words');
assert.ok(html.includes('一つ頼めば、十まで進む。'), 'one to ten');
assert.ok(html.includes('二日で、動いた。'), 'two days');
assert.ok(html.includes('改修が、三十本。'), 'revision count');
assert.ok(html.includes('教室の準備も、同時。'), 'class prep');
assert.ok(html.includes('四十五件。'), 'total count');
assert.ok(!html.includes('自慢'), 'no boast');
const record = html.slice(html.indexOf('id="record"'), html.indexOf('id="format"'));
for (const name of ['レオ', '金斗雲', '送迎', 'ストレスチェック', 'GBP', 'LP', 'ポータル', '授業', '茶夢', '約三十', '約四十五', 'これだけ']) {
  assert.ok(!record.includes(name), 'record stays abstract: ' + name);
}
assert.ok(html.includes('茶夢の教室。'), 'venue');
assert.ok(!html.includes('パン'), 'no bakery');
assert.ok(!html.includes('<span>1</span>'), 'no doubled week number');
assert.ok(html.includes('SNS、ホームページ、事務。'), 'work');
assert.ok(html.includes('手で回していた仕事を渡す。'), 'hand over');
assert.ok(html.includes('月3万円'), 'price');
assert.ok(html.includes('対面週1回、あいだはチャットと通話。'), 'format');
assert.ok(html.includes('講師 齊藤 連'), 'name');
for (const banned of ['普通の人は', 'ハイレベル', 'マジで', 'はっきり言っとく', '優秀すぎて', 'やってね', '一緒に', '丁寧', '安心', '教授', 'すごい', '圧倒', '最速', 'かわいい', 'オタク']) {
  assert.ok(!html.includes(banned), 'banned: ' + banned);
}
assert.ok(html.includes('手で回していた仕事を渡す。'), 'automation claim');
assert.ok(!html.includes('会員'), 'no member area');
assert.ok(!html.includes('ダッシュボード'), 'no dashboard');
assert.ok(html.includes('1か月で卒業'), 'term');
assert.ok(html.includes('三重県四日市市あさけが丘2-1-42（〒512-8055）'), 'address');
assert.ok(html.includes('090-6708-2837'), 'phone');
assert.ok(html.includes('tel:09067082837'), 'tel link');
assert.ok(/src="img\/scene-classroom\.jpg(?:\?v=[^"]*)?"/.test(html), 'hero path');
assert.ok(/src="img\/scene-manager-solo\.jpg(?:\?v=[^"]*)?"/.test(html), 'speed path');
assert.ok(/src="img\/scene-chat-solo\.jpg(?:\?v=[^"]*)?"/.test(html), 'weekly path');
assert.ok(!html.includes('img/scene-manager-pc.jpg'), 'alien manager path gone');
assert.ok(!html.includes('img/scene-chat-outside.jpg'), 'alien chat path gone');
assert.ok(html.includes('alt="教室の机で、宇宙人が男性と二人の女性にパソコンを見せている"'), 'hero alt');
assert.ok(html.includes('alt="エプロンの店長がパソコンを自分で動かし、驚いて笑っている"'), 'speed alt');
assert.ok(html.includes('alt="夜の店先で、女性がスマホを見て笑っている"'), 'weekly alt');
assert.ok(!html.includes('宇宙人が画面を指さしている'), 'speed has no alien');
assert.ok(!html.includes('宇宙人が親指を立てている'), 'chat has no alien');
['基礎', '仕事接続', '仕組み化', '卒業制作'].forEach(word => assert.ok(html.includes(word), word));
assert.ok(!html.includes('教授'), 'no 教授');
assert.ok(!html.includes('伝授'), 'no 伝授');
assert.ok(!html.includes('Grok'), 'product name stays off the page');
assert.ok(!/supabase|password|パスワード|カード番号/i.test(html), 'no portal auth or payment fields');
assert.ok(!html.includes('https://cdn.'), 'no image cdn');
assert.ok(!portal.includes('kyoshitsu'), 'staff portal home does not link the classroom');
assert.ok(!css.includes('#12110e'), 'dark page background is gone');
assert.ok(css.includes('#efe4d2'), 'warm paper');
assert.ok(!css.includes('padding-top: 104px'), 'huge section padding is gone');
assert.ok(css.includes('.hero-copy'), 'hero copy sits on the picture');
assert.ok(css.includes('.plate'), 'picture and lines share a plate');

const images = {
  'scene-classroom.jpg': '0059856f58daaa7d690ba5c35a7ceaae786625a59258e70c55d50deca7150dcd',
  'scene-manager-solo.jpg': 'e78070a8772b4f3fce8fedd922441f7d4ad2358ae5c3536f39021967268faa5a',
  'scene-chat-solo.jpg': 'd1ed7cfe41b403c6ad3aafbb83a1d8b8b1acd106652cf4f8aca9f186bf996834',
};
for (const [name, hash] of Object.entries(images)) {
  const buf = fs.readFileSync(path.join(dir, 'img', name));
  assert.ok(buf.length > 50000, name + ' is a real image');
  assert.strictEqual(buf[0], 0xff);
  assert.strictEqual(buf[1], 0xd8);
  assert.strictEqual(crypto.createHash('sha256').update(buf).digest('hex'), hash, name);
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
