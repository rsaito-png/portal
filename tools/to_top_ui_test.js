// 上に戻る：職員ページで出て、押すと先頭へ。保護者ページには無い。
// node tools/to_top_ui_test.js
const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const PORT = 8096;
const OUT = process.env.OUT || '/tmp/to-top-ui';
fs.mkdirSync(OUT, { recursive: true });
let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const rel = u === '/' ? 'index.html' : u.replace(/^\//, '');
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('no'); return; }
  const ext = path.extname(file);
  const type = ext === '.html' ? 'text/html; charset=utf-8' : ext === '.js' ? 'text/javascript; charset=utf-8' : ext === '.css' ? 'text/css; charset=utf-8' : 'application/octet-stream';
  res.writeHead(200, { 'content-type': type });
  res.end(fs.readFileSync(file));
});
function listen() { return new Promise(r => server.listen(PORT, '127.0.0.1', r)); }
async function metrics(p) {
  return p.evaluate(() => {
    const b = document.getElementById('to-top');
    if (!b) return null;
    const s = getComputedStyle(b);
    const r = b.getBoundingClientRect();
    return {
      hidden: b.hidden, label: b.getAttribute('aria-label'), text: b.textContent,
      w: r.width, h: r.height, radius: s.borderRadius, bg: s.backgroundColor, img: s.backgroundImage,
      border: s.borderTopColor, bottom: s.bottom, right: s.right, position: s.position, y: window.scrollY
    };
  });
}
(async () => {
  await listen();
  const br = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const phone = await br.newPage();
  await phone.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  phone.on('pageerror', e => { console.log('PAGEERROR', e.message); fails++; });
  await phone.goto('http://127.0.0.1:' + PORT + '/esign-help.html', { waitUntil: 'domcontentloaded' });
  await phone.waitForSelector('#to-top');
  let m = await metrics(phone);
  ok(m && m.hidden && m.y < 240, '先頭では隠す ' + JSON.stringify(m && { hidden: m.hidden, y: m.y }));
  await phone.evaluate(() => window.scrollTo(0, 500));
  await new Promise(r => setTimeout(r, 80));
  m = await metrics(phone);
  ok(m && !m.hidden && m.label === '上に戻る' && m.text.includes('↑'), 'スクロール後に ↑ と読み上げ名');
  ok(m && m.w >= 64 && m.h >= 64 && Math.abs(m.w - m.h) < 1, '電話で丸く押せる ' + (m && m.w));
  ok(m && parseFloat(m.radius) >= m.w / 2 - 1, '円 ' + (m && m.radius));
  ok(m && m.position === 'fixed', '固定');
  await phone.screenshot({ path: path.join(OUT, 'phone-shown.png') });
  await phone.click('#to-top');
  await phone.waitForFunction(() => window.scrollY < 40, { timeout: 3000 });
  m = await metrics(phone);
  ok(m && m.hidden && m.y < 40, '押すと先頭へ戻り、ボタンは隠れる');

  const desk = await br.newPage();
  await desk.setViewport({ width: 1280, height: 800 });
  await desk.goto('http://127.0.0.1:' + PORT + '/esign-help.html', { waitUntil: 'domcontentloaded' });
  await desk.waitForSelector('#to-top');
  await desk.evaluate(() => window.scrollTo(0, 600));
  await new Promise(r => setTimeout(r, 80));
  m = await metrics(desk);
  ok(m && !m.hidden && m.w >= 80 && m.h >= 80, '大きな画面でも押せる ' + (m && m.w));
  await desk.screenshot({ path: path.join(OUT, 'desk-shown.png') });

  const portal = await br.newPage();
  await portal.setViewport({ width: 1280, height: 900 });
  portal.on('pageerror', e => { console.log('PAGEERROR portal', e.message); fails++; });
  await portal.goto('http://127.0.0.1:' + PORT + '/index.html?demo=1', { waitUntil: 'domcontentloaded' });
  await portal.waitForSelector('#to-top');
  await portal.waitForFunction(() => document.getElementById('home') && !document.getElementById('home').hidden, { timeout: 8000 });
  await portal.evaluate(() => window.scrollTo(0, 700));
  await new Promise(r => setTimeout(r, 80));
  m = await metrics(portal);
  ok(m && !m.hidden, 'ポータルの見本でも出す');
  ok(m && (m.img.includes('gradient') || m.border === 'rgb(212, 169, 69)'), '官吏の金と朱 ' + (m && m.border + ' ' + m.img.slice(0, 80)));
  await portal.screenshot({ path: path.join(OUT, 'portal-yamen.png') });
  const lifted = await portal.evaluate(() => {
    const fab = document.createElement('button');
    fab.id = 'uk_fab';
    fab.textContent = '分からないことを送る';
    fab.style.cssText = 'position:fixed;right:12px;bottom:12px;height:56px';
    document.body.appendChild(fab);
    const before = getComputedStyle(document.getElementById('to-top')).bottom;
    fab.hidden = true;
    const after = getComputedStyle(document.getElementById('to-top')).bottom;
    fab.remove();
    return { before, after };
  });
  ok(parseFloat(lifted.before) > parseFloat(lifted.after), '受付ボタンがあるときはその上 ' + lifted.before + ' / ' + lifted.after);
  await portal.click('#to-top');
  await portal.waitForFunction(() => window.scrollY < 40, { timeout: 3000 });
  ok((await metrics(portal)).y < 40, 'ポータルでも先頭へ戻る');

  await portal.evaluate(() => { location.hash = '#leo'; });
  await new Promise(r => setTimeout(r, 500));
  await portal.evaluate(() => window.scrollTo(0, 800));
  await new Promise(r => setTimeout(r, 80));
  m = await metrics(portal);
  ok(m && !m.hidden && m.label === '上に戻る', '別の画面でも同じボタン');

  const guard = await br.newPage();
  await guard.setViewport({ width: 390, height: 844 });
  for (const f of ['kakunin.html', 'jukyusha.html', 'yotei.html', 'assess.html', 'hogosha.html']) {
    await guard.goto('http://127.0.0.1:' + PORT + '/' + f, { waitUntil: 'domcontentloaded' });
    const has = await guard.evaluate(() => !!document.getElementById('to-top'));
    ok(!has, f + ' には出さない');
  }

  await br.close();
  server.close();
  console.log(fails ? 'FAILED ' + fails : 'to_top_ui_test ok');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
