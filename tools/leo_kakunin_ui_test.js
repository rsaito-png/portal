// 保護者の確認画面（架空データ）。Supabase にはつながない。
// 実行: OUT=/opt/cursor/artifacts node tools/leo_kakunin_ui_test.js
const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');
const OUT = process.env.OUT || '/tmp/kakunin-ui';
fs.mkdirSync(OUT, { recursive: true });
const ROOT = path.join(__dirname, '..');
const PORT = 8091;
const TOK = 'ab'.repeat(24);
const SB = 'https://zvrardoyxocmqhvyddnf.supabase.co';
let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, u === '/' ? 'kakunin.html' : u);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('no'); return; }
  const ext = path.extname(file);
  const type = ext === '.html' ? 'text/html; charset=utf-8' : ext === '.js' ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8';
  res.writeHead(200, { 'content-type': type });
  res.end(fs.readFileSync(file));
});
function listen() { return new Promise(r => server.listen(PORT, '127.0.0.1', r)); }
(async () => {
  await listen();
  const br = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const calls = [];
  async function page(w) {
    const p = await br.newPage();
    await p.setViewport({ width: w, height: 900, deviceScaleFactor: 2 });
    p.on('pageerror', e => { console.log('PAGEERROR', e.message); fails++; });
    await p.setRequestInterception(true);
    p.on('request', req => {
      const u = req.url();
      if (!u.startsWith(SB)) return req.continue();
      calls.push(req.method() + ' ' + u.slice(SB.length).slice(0, 80));
      const body = req.postData() || '';
      const json = (b, s = 200) => req.respond({ status: s, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(b) });
      if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
      if (u.includes('/rpc/leo_confirm_get')) {
        return json({ child: '見本 太郎', month: '2026-11', last: null, rows: [{ day: '2026-11-02', status: '出席', start: '14:45', end: '17:00' }, { day: '2026-11-04', status: '利用', start: '14:45', end: '17:00' }, { day: '2026-11-06', status: '欠席', start: '', end: '' }],
          jippi: { found: true, lunch: 600, snack: 300, total: 900, pay_link: null } });
      }
      if (u.includes('/rpc/leo_confirm_submit')) {
        const sent = JSON.parse(body);
        if (sent.p_lunch != null || sent.p_snack != null || sent.p_token !== TOK) return json({ message: 'bad' }, 400);
        return json('ok');
      }
      return json({ message: 'blocked ' + u }, 500);
    });
    return p;
  }
  const demo = await page(390);
  const before = calls.length;
  await demo.goto(`http://127.0.0.1:${PORT}/kakunin.html?demo=1`, { waitUntil: 'networkidle0' });
  const text = () => demo.$eval('#m', e => e.innerText);
  ok((await text()).includes('児童A（見本）'), '見本：児童名');
  ok((await text()).includes('11/2（月）') && (await text()).includes('出席'), '見本：実績の日付と状況');
  ok((await text()).includes('利用 3回'), '見本：利用回数は出席を数える（欠席は数えない）');
  ok((await text()).includes('お昼代') && (await text()).includes('1,200円'), '見本：お昼代');
  ok((await text()).includes('おやつ代') && (await text()).includes('400円'), '見本：おやつ代');
  ok((await text()).includes('合計') && (await text()).includes('6,200円'), '見本：合計（利用料込み）');
  ok((await text()).includes('利用者負担額'), '見本：利用者負担額は含まれない旨');
  ok((await text()).includes('両方を確認したことになります'), '見本：一度の送信で両方');
  ok(await demo.$eval('a.pay', e => e.href.startsWith('https://')), '見本：支払いリンクはある');
  ok((await demo.$$('button')).length === 1, '見本：送信ボタンは一つ');
  ok(calls.length === before, '見本：通信しない');
  await demo.click('button');
  ok((await text()).includes('「確認」を選んでください'), '見本：未選択は送れない');
  await demo.click('input[value="内容に相違ありません"]');
  await demo.type('#pn', '見本 花子');
  await demo.click('button');
  ok((await text()).includes('見本なので送信しません'), '見本：送信しない');
  ok(await demo.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), '見本：横にはみ出さない');
  await demo.screenshot({ path: path.join(OUT, 'kakunin-demo.png'), fullPage: true });

  const live = await page(390);
  await live.goto(`http://127.0.0.1:${PORT}/kakunin.html?t=${TOK}`, { waitUntil: 'networkidle0' });
  const liveText = await live.$eval('#m', e => e.innerText);
  ok(liveText.includes('見本 太郎') && liveText.includes('600円') && liveText.includes('300円') && liveText.includes('900円'), 'トークン：返った児童の実績と実費');
  ok(liveText.includes('利用 2回'), 'トークン：利用回数は「出席」と昔の「利用」を数え、欠席は数えない');
  ok(!liveText.includes('児童A（見本）') && !liveText.includes('1,200円'), 'トークン：見本や他の金額は出ない');
  ok(liveText.includes('支払い用のリンクはまだありません'), 'トークン：リンクが無くても確認できる');
  ok(!(await live.$('a.pay')), 'トークン：支払いリンクは無い');
  await live.click('input[value="相違があります"]');
  await live.type('#pn', '見本 花子');
  await live.click('button');
  ok((await live.$eval('#m', e => e.innerText)).includes('相違点をお書きください'), '相違ありはコメントが必要');
  await live.type('#cm', '2日の終わりが違います');
  await live.click('button');
  await live.waitForFunction(() => document.getElementById('r').innerText.includes('送信しました'));
  ok((await live.$eval('#r', e => e.innerText)).includes('送信しました。ありがとうございました。'), '一度の送信で保存');
  ok(calls.some(c => c.startsWith('POST /rest/v1/rpc/leo_confirm_submit')), '送信は confirm_submit だけ');
  ok(!calls.some(c => c.includes('leo_jippi') || c.includes('leo_confirmations')), '表は直接読まない');
  await live.screenshot({ path: path.join(OUT, 'kakunin-token.png'), fullPage: true });

  const none = await page(390);
  none.removeAllListeners('request');
  none.on('request', req => {
    const u = req.url();
    if (!u.startsWith(SB)) return req.continue();
    if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    return req.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ child: '見本 次郎', month: '2026-11', last: null, rows: [], jippi: { found: false, lunch: 0, snack: 0, total: 0, pay_link: null } }) });
  });
  await none.goto(`http://127.0.0.1:${PORT}/kakunin.html?t=${'cd'.repeat(24)}`, { waitUntil: 'networkidle0' });
  const noneText = await none.$eval('#m', e => e.innerText);
  ok(noneText.includes('この月の記録はまだありません') && noneText.includes('この月の実費負担はありません'), '実費なしでも確認欄がある');
  ok(!!await none.$('button'), '実費なしでも送信できる');
  await none.screenshot({ path: path.join(OUT, 'kakunin-none.png'), fullPage: true });

  const staff = await page(1100);
  await staff.goto(`http://127.0.0.1:${PORT}/index.html?demo=1&role=事務#leo/kakunin`, { waitUntil: 'networkidle0' });
  await staff.waitForFunction(() => document.body.innerText.includes('保護者の実績・実費の確認'));
  const staffText = await staff.evaluate(() => document.body.innerText);
  ok(staffText.includes('確認した実費：利用料 4,600円・お昼 1,200円') && staffText.includes('確認した実費：実費なし'), '職員：確認した実費');
  ok(staffText.includes('リンクに出る実費：利用料 0円・お昼 800円'), '職員：未確認の案内額');
  ok(staffText.includes('この月のリンクを作成／更新') === false, '職員の確認一覧に請求の作成ボタンは出ない');
  await staff.screenshot({ path: path.join(OUT, 'kakunin-staff-demo.png'), fullPage: true });

  await br.close();
  server.close();
  console.log(fails ? 'failed ' + fails : 'kakunin ui ok');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
