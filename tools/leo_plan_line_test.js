// 個別支援計画の保護者向けLINE文面（node tools/leo_plan_line_test.js）
const fs = require('fs');
const path = require('path');
const assert = (c, m) => { if (!c) throw new Error(m || 'assert'); };
const src = fs.readFileSync(path.join(__dirname, '..', 'leo.js'), 'utf8');
const block = src.match(/\/\* plan-line:start \*\/([\s\S]*?)\/\* plan-line:end \*\//);
if (!block) throw new Error('plan-line block missing');
const today = () => '2026-11-28';
const api = new Function('today', block[1] + '\nreturn { PLAN_LINE_SIGN, planLineDue, planLineMsg };')(today);
const { PLAN_LINE_SIGN, planLineDue, planLineMsg } = api;

assert(PLAN_LINE_SIGN === '中村　友香', 'signature uses a full-width space');
assert(PLAN_LINE_SIGN !== '中村 友香', 'signature is not a half-width space');
assert(planLineDue('2026-11-28') === '12月5日（土）', 'Nov 28 + 7 days is Sat Dec 5');
assert(planLineDue('2026-11-13') === '11月20日（金）', 'Nov 13 + 7 days is Fri Nov 20');
assert(planLineDue() === '12月5日（土）', 'default uses today()');

const mon = planLineMsg('mon', 'https://example.test/hogosha.html?k=mon&t=abc');
assert(mon === `こんにちは。
いつもレオをご利用いただき、ありがとうございます。
個別支援計画の更新時期となりました。
つきましては以下のアンケートへのご回答をお願いいたします。
お手数ですが、12月5日（土）までにご回答いただけますと幸いです。
https://example.test/hogosha.html?k=mon&t=abc
引き続き、お子様の成長のために取り組んでまいります。
よろしくお願いいたします。
中村　友香`, 'survey text');

const genan = planLineMsg('doui', 'https://example.test/hogosha.html?k=doui&t=gen', '原案');
assert(genan.includes('ご確認いただき、この内容でよろしければ以下のフォームより確認連絡をお願いいたします。\nhttps://example.test/hogosha.html?k=doui&t=gen\nご意見があればこのLINEでお知らせください。'), 'draft URL sits between form sentence and LINE comment');
assert(genan.includes('（それぞれ１〜２行増えるようなイメージです。）'), 'closes the parenthetical');
assert(genan.endsWith('中村　友香'), 'draft signs off');
assert(!genan.includes('確認連絡をお願いいたします。\nご意見'), 'draft does not drop the link');

const honan = planLineMsg('doui', 'https://example.test/hogosha.html?k=doui&t=hon', '本案');
assert(honan === `こんにちは。
個別支援計画の本案をお送りさせていただきます。
ご確認よろしくお願いいたします。
https://example.test/hogosha.html?k=doui&t=hon
中村　友香`, 'final plan text');

assert(planLineMsg('other', 'https://x').startsWith('https://x'), 'unknown kind falls back to URL');
assert(src.includes("planLineMsg(kind, url, doc)"), 'planLink/planResend use the LINE text');
assert(src.includes('案内文（リンクつき）をコピーして'), 'plan screen note mentions text+link');
const idx = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert(idx.includes('leo.js?v=20261128planline'), 'leo.js cache bust');
console.log('leo_plan_line_test ok');
