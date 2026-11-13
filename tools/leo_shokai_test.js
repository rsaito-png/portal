// 初回利用画面：手順①〜④、契約は実データ判定、公式LINEは手チェック。URLは推測で入れない。
// node tools/leo_shokai_test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const sandbox = {
  DEMO: true,
  console,
  ROLE: '管理者',
  DUTY: '児発管',
  C: { supabaseUrl: 'http://example.test', supabaseKey: 'x' },
  localStorage: { getItem: () => '{}', setItem() {}, removeItem() {} },
  sessionStorage: { getItem: () => '児童A', setItem() {}, removeItem() {} },
  location: { origin: 'http://localhost', pathname: '/', hash: '#leo/shokai', search: '?demo=1' },
  document: { getElementById: () => null, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], body: { classList: { toggle() {}, add() {}, remove() {} } } },
  fetch: async () => { throw new Error('no fetch'); },
  setInterval() { return 0; },
  setTimeout() { return 0; },
  clearTimeout() {},
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.$ = () => ({ textContent: '', value: '', style: {}, innerHTML: '' });
sandbox.canManage = () => true;
sandbox.esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
sandbox.today = () => '2026-11-13';
sandbox.demoNote = () => '';
sandbox.LEO_VIEWS = {};
vm.createContext(sandbox);
vm.runInContext(read('leo_contract.js'), sandbox, { filename: 'leo_contract.js' });
vm.runInContext(read('leo_shokai.js'), sandbox, { filename: 'leo_shokai.js' });

(async () => {
  const html = await sandbox.LEO_VIEWS.shokai();
  assert.ok(html.includes('<h3>🚪 初回利用</h3>'), '見出し');
  assert.ok(html.includes('① 利用者情報'), '手順①');
  assert.ok(html.includes('② 型表と予定'), '手順②');
  assert.ok(html.includes('③ 契約書・重要事項説明書'), '手順③');
  assert.ok(html.includes('④ 公式LINE友だち追加'), '手順④');
  assert.ok(html.includes('href="#leo/contract"'), '契約画面へ飛ぶ');
  assert.ok(html.includes('href="#leo/userinfo"'), '利用者情報へ飛ぶ');
  assert.ok(html.includes('href="#leo/kata"'), '型表へ飛ぶ');
  assert.ok(html.includes('署名済み') || html.includes('✅'), '③は見本の署名記録で判定');
  assert.ok(html.includes('img/leo-line-qr.png'), 'QRの置き場所');
  assert.ok(html.includes('友だち追加を確認した（手チェック）'), '手チェック');
  assert.ok(html.includes('https://lin.ee/so8IzX4'), 'QRから読んだ友だち追加URL');
  assert.ok(html.includes('⑤ 上限額管理先'), '手順⑤');
  assert.ok(html.includes('⑥ アセスメント'), '手順⑥');
  assert.ok(html.includes('⑦ 個別支援計画の保護者アンケート'), '手順⑦');
  assert.ok(html.includes('⑧ 個別支援計画（原案・本案・同意）'), '手順⑧');
  assert.ok(html.includes('href="#leo/jogan"'), '上限額管理へ飛ぶ');
  assert.ok(html.includes('href="#leo/assess"'), 'アセスメントへ飛ぶ');
  assert.ok(html.includes('href="#leo/plan"'), '個別支援計画へ飛ぶ');
  assert.ok(html.includes('hogosha.html?k=mon'), '既存の保護者アンケート（token）');
  assert.ok(!/docs.google.com|forms.gle|Googleフォームのリンク/.test(html), 'Googleフォームは使わない');
  assert.ok(html.includes('leo_jogan_master'), '上限額はマスタ行で判定');
  assert.ok(html.includes('原案の同意'), '原案の同意状況');
  assert.ok(html.includes('本案の同意'), '本案の同意状況');
  assert.ok(html.includes('>コピー</button>'), '案内のコピーボタン');
  assert.ok(html.includes('>LINEで送った</button>'), 'LINEで送ったボタン');
  assert.ok(html.includes('公式LINEで送った日時'), '送った日時の表示');
  assert.ok(html.includes('（Asia/Tokyo）') || html.includes('まだありません'), '日時はAsia/Tokyo');
  const monUrl = 'http://localhost/hogosha.html?k=mon&t=' + '1'.repeat(48);
  const monMsg = 'レオです。\n\n個別支援計画のための保護者アンケートです。下のリンクを開いて、ご回答をお願いいたします。\n\n' + monUrl;
  assert.ok(html.includes(monMsg.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')) || html.includes(sandbox.esc(monMsg)), '⑦の案内文とURL');
  assert.ok(html.includes('レオです。'), '案内はレオですで始める');
  assert.ok(html.includes('ご利用前のアセスメントのご案内です。'), '⑥の案内文');
  assert.ok(html.includes('leo_contract_sign.html?t='), '③の署名リンク');
  assert.ok(html.includes('利用契約書と重要事項説明書の署名用リンクです。'), '③の案内文');
  assert.ok(!html.includes('>アセスメントのリンクを発行<'), '発行済みなら⑥の発行ボタンは出さない');
  assert.ok(!html.includes('>保護者アンケートのリンクを発行<'), '発行済みなら⑦の発行ボタンは出さない');
  assert.ok(sandbox.skLineMsg('mon', monUrl) === monMsg, 'skLineMsg の⑦文面');
  const cfg = read('config.js');
  assert.ok(cfg.includes("'#leo/shokai'"), 'タイルがある');
  assert.ok(cfg.includes("'初回利用'"), '事務・計画に初回利用');
  const idx = read('index.html');
  assert.ok(idx.includes('leo_shokai.js'), 'スクリプトを読み込む');
  const src = read('leo_shokai.js');
  assert.ok(src.includes("const SK_LINE_ADD_URL = 'https://lin.ee/so8IzX4';"), 'QRから読んだURL');
  assert.ok(src.includes('アセスメントのリンクを発行'), '未発行時の⑥発行ボタン');
  assert.ok(src.includes('保護者アンケートのリンクを発行'), '未発行時の⑦発行ボタン');
  assert.ok(src.includes('署名リンクを発行'), '未発行時の③発行ボタン');
  assert.ok(src.includes("'公式LINE'"), 'leo_link_sends の via');
  console.log('leo_shokai_test ok');
})().catch(e => { console.error(e); process.exit(1); });
