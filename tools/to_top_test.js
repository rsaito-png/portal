// 上に戻るボタン。職員ポータルだけ。node tools/to_top_test.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const src = read('to-top.js');
const tag = 'to-top.js?v=20261105top';

assert.ok(src.includes("aria-label', '上に戻る'") || src.includes('aria-label", "上に戻る"') || src.includes("setAttribute('aria-label', '上に戻る')"), '読み上げ名');
assert.ok(src.includes('↑'), '矢印');
assert.ok(src.includes('border-radius:50% !important'), '丸');
assert.ok(src.includes("behavior: reduce ? 'auto' : 'smooth'"), '滑らかに戻る');
assert.ok(src.includes('var SHOW = 240'), '少しスクロールしてから出す');
assert.ok(src.includes('position:fixed'), '右下に固定');
assert.ok(src.includes('width:64px') && src.includes('width:80px'), '電話と大きな画面で押せる大きさ');
assert.ok(src.includes('--ym-gold') && src.includes('--main'), '既存の色を使う');
assert.ok(src.includes('#uk_fab:not([hidden])') && src.includes('.ui-tabbar'), '浮いている部品とかぶせない');
assert.ok(src.includes('dataset.pcs'), 'PC拡大で丸が崩れない');

['index.html', 'acc.html', 'esign-help.html', 'sct-ops.html'].forEach(f => {
  assert.ok(read(f).includes(tag), f + ' に読む');
});
['kakunin.html', 'jukyusha.html', 'yotei.html', 'assess.html', 'hogosha.html', 'sign.html', 'contract_sign.html', 'consent_sign.html', 'sui_sign.html', 'sui_contract_sign.html', 'sct.html'].forEach(f => {
  assert.ok(!read(f).includes('to-top.js'), f + ' には出さない');
});
assert.ok(!read('kyoshitsu/index.html').includes('to-top.js'), '教室の公開ページには出さない');

console.log('to_top_test ok');
