// 茶夢の日誌。利用曜日に入っている人だけ出す。架空の通信。実在の3人の曜日だけ合わせる。
// 実行: node tools/chamu_days_ui_test.js
const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');
const OUT = process.env.OUT || '/opt/cursor/artifacts';
fs.mkdirSync(OUT, { recursive: true });
const ROOT = path.join(__dirname, '..');
const PORT = 8097;
const SB = 'https://zvrardoyxocmqhvyddnf.supabase.co';
let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const users = [
  { id: 'h', name: '日置広大', active: true, sort: 1, use_days: ['月', '火', '水', '木', '金'], kana: '', support_level: 4, meal_addon: true, transport_class: '2' },
  { id: 't', name: '柘山周磨', active: true, sort: 2, use_days: ['月', '火', '水', '木', '金'], kana: '', support_level: 3, meal_addon: true, transport_class: '2' },
  { id: 'm', name: '森井辰生', active: true, sort: 3, use_days: ['水', '金'], kana: '', support_level: 3, meal_addon: true, transport_class: '2' },
];
const profile = [{ nikki_name: '見本職員', duty: '現場支援員', office: '茶夢', nicchu: false, is_chair: false, user_id: '11111111-1111-1111-1111-111111111111' }];
const lines = { '2026-11-16': [{ user_id: 'm', present: false, journal_id: 'old' }] };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, u === '/' ? 'index.html' : u);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('no'); return; }
  const ext = path.extname(file);
  const type = ext === '.html' ? 'text/html; charset=utf-8' : ext === '.js' ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8';
  res.writeHead(200, { 'content-type': type });
  res.end(fs.readFileSync(file));
});
function listen() { return new Promise(r => server.listen(PORT, '127.0.0.1', r)); }
(async () => {
  await listen();
  const br = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--font-render-hinting=none'] });
  const p = await br.newPage();
  await p.setViewport({ width: 1100, height: 900, deviceScaleFactor: 1 });
  p.on('pageerror', e => { console.log('PAGEERROR', e.message); fails++; });
  await p.setRequestInterception(true);
  p.on('request', req => {
    const u = req.url();
    if (!u.startsWith(SB)) return req.continue();
    const pathn = u.slice(SB.length);
    const json = b => req.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(b) });
    if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (pathn.startsWith('/rest/v1/rpc/chamu_can_bill')) return json(false);
    if (pathn.startsWith('/rest/v1/rpc/chamu_can')) return json(true);
    if (pathn.startsWith('/rest/v1/rpc/')) return json(false);
    if (pathn.startsWith('/rest/v1/staff_profiles')) return json(profile);
    if (pathn.startsWith('/rest/v1/chamu_users')) {
      const id = /id=eq\.([^&]+)/.exec(pathn);
      return json(id ? users.filter(u => u.id === decodeURIComponent(id[1])) : users);
    }
    if (pathn.startsWith('/rest/v1/chamu_billing_settings')) return json([]);
    if (pathn.startsWith('/rest/v1/chamu_journal')) {
      const m = /journal_date=eq\.(\d{4}-\d{2}-\d{2})/.exec(pathn);
      const day = m && m[1];
      const have = day && lines[day];
      return json(have ? [{ id: 'j-' + day, journal_date: day, staff_name: '見本職員', chamu_journal_line: have }] : []);
    }
    if (pathn.startsWith('/rest/v1/')) return json([]);
    return json({});
  });
  await p.evaluateOnNewDocument(() => {
    const exp = Date.now() + 3600 * 1000;
    const payload = btoa(JSON.stringify({ sub: '11111111-1111-1111-1111-111111111111' })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    localStorage.setItem('sess', JSON.stringify({ token: 'h.' + payload + '.s', refresh: 'r', email: 'staff@example.test', role: '職員', exp }));
  });
  const names = () => p.$$eval('#cm_cards .cm-who b', els => els.map(e => e.textContent));
  async function openDay(ymd) {
    await p.goto('http://127.0.0.1:' + PORT + '/index.html?r=' + Date.now() + '#chamu/journal', { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('[data-cm-save]', { timeout: 15000 });
    await p.$eval('#j_date', (el, v) => { el.value = v; el.dispatchEvent(new Event('change')); }, ymd);
    await p.waitForFunction(d => document.getElementById('j_date') && document.getElementById('j_date').value === d && document.body.innerText.includes(d), { timeout: 15000 }, ymd);
    await p.waitForSelector('#cm_cards', { timeout: 15000 });
  }
  await openDay('2026-11-18');
  const wed = await names();
  ok(wed.join(',') === '日置広大,柘山周磨,森井辰生', '水曜: ' + wed.join(','));
  ok((await p.$('#cm_add_m')) === null, '水曜の森井さんは予定外ボタンにいない');
  await p.screenshot({ path: path.join(OUT, 'chamu-wed.png'), fullPage: true });
  await openDay('2026-11-16');
  const monKept = await names();
  ok(monKept.join(',') === '日置広大,柘山周磨,森井辰生', '月曜でも既存の行がある森井さんは残る: ' + monKept.join(','));
  ok((await p.evaluate(() => document.body.innerText)).includes('予定外'), '既存行は予定外と分かる');
  await openDay('2026-11-09');
  const mon = await names();
  ok(mon.join(',') === '日置広大,柘山周磨', '月曜（行なし）: ' + mon.join(','));
  ok(!(await p.$('#jr_m')), '月曜のカードに森井さんはいない');
  const extra = await p.$eval('#cm_extra_sum', el => el.textContent);
  ok(extra.includes('森井') === false && extra.includes('1人'), '予定外は1人: ' + extra);
  const addName = await p.$eval('#cm_add_m', el => el.textContent);
  ok(addName.includes('森井辰生'), '追加ボタンは森井辰生');
  await p.click('#cm_extra summary');
  await p.screenshot({ path: path.join(OUT, 'chamu-mon.png'), fullPage: true });
  await p.click('#cm_add_m');
  const added = await names();
  ok(added.join(',') === '日置広大,柘山周磨,森井辰生', '臨時追加: ' + added.join(','));
  ok(await p.$eval('#p_m', el => el.value) === '', '追加した人は出欠未選択（欠席にしない）');
  await p.screenshot({ path: path.join(OUT, 'chamu-mon-added.png'), fullPage: true });
  await p.evaluate(() => { CM.st.edit = 'm'; });
  await p.evaluate(() => renderChamu('users'));
  await p.waitForSelector('#u_day_水', { timeout: 15000 });
  const days = await p.evaluate(() => ChamuLib.USE_DAYS.map(d => ({ d, on: document.getElementById('u_day_' + d).checked })));
  ok(JSON.stringify(days) === JSON.stringify([{ d: '月', on: false }, { d: '火', on: false }, { d: '水', on: true }, { d: '木', on: false }, { d: '金', on: true }]), '利用曜日: ' + JSON.stringify(days));
  await p.screenshot({ path: path.join(OUT, 'chamu-user-days.png'), fullPage: true });
  await br.close();
  server.close();
  if (fails) { console.log('FAILS ' + fails); process.exit(1); }
  console.log('chamu_days_ui ok');
})().catch(e => { console.error(e); process.exit(1); });
