// node tools/ht_comm_joint_test.js
// 委員会タブ：やり方3ステップ・見本の議事録・見本から合同の議事録（委員会ごとに保存）。Supabase はローカルで模す。
const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const PORT = 8098;
const OUT = process.env.OUT || '/tmp/ht-comm-joint';
fs.mkdirSync(OUT, { recursive: true });
let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const office = [{ id: 'leo', name: 'レオ', types: ['児童発達支援・放課後等デイサービス'], sort: 1 }, { id: 'kintoun', name: '金斗雲', types: ['居宅介護'], sort: 2 }];
const com = ['虐待防止委員会', '身体拘束等適正化検討委員会', '感染症対策委員会', '業務継続計画（BCP）見直し会議'].map((n, i) => ({ id: 'C0' + (i + 1), name: n, target_types: ['全事業'], interval_months: 12, grp: null, last_held: null, next_due: '2026-12-15' }));
const sample = { id: 'SAMPLE-2026-GODO', committee_id: 'C01', held_at: '2026-11-26T04:30:00+00:00', place: '見本の場所', office_ids: ['leo', 'kintoun'], attendees: '委員長', absent: '', agenda: '1. 見本の議題', discussion: '話すこと＿＿', decisions: '見本の決定', next_plan: '次回', notice_method: 'ポータル', note: '【見本】', status: '下書き', joint_id: 'SAMPLE-2026-GODO' };
function rowsFor(url) {
  const u = decodeURIComponent(url);
  if (u.includes('/rpc/ht_my_staff')) return [];
  if (u.includes('/rpc/')) return false;
  if (u.includes('ht_offices_t')) return office;
  if (u.includes('ht_committees')) return com;
  if (u.includes('ht_committee_logs')) return [sample];
  if (u.includes('ht_settings')) return [{ key: '法人名', value: '見本法人' }];
  if (u.includes('ht_access')) return [{ email: 'editor@example.invalid', office_id: null, can_edit: true, note: '' }];
  return [];
}
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, rel === '/' ? 'index.html' : rel.replace(/^\//, ''));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('no'); return; }
  const ext = path.extname(file);
  res.writeHead(200, { 'content-type': ext === '.html' ? 'text/html; charset=utf-8' : ext === '.js' ? 'text/javascript; charset=utf-8' : 'application/octet-stream' });
  res.end(fs.readFileSync(file));
});
(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const br = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const page = await br.newPage();
  await page.setViewport({ width: 1100, height: 1800 });
  const posts = [];
  page.on('pageerror', e => { console.log('PAGEERROR', e.message); fails++; });
  page.on('dialog', async d => { posts.push({ alert: d.message() }); await d.accept(); });
  await page.setRequestInterception(true);
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS' };
  page.on('request', req => {
    const url = req.url();
    if (!url.includes('supabase.co')) { req.continue(); return; }
    if (req.method() === 'OPTIONS') { req.respond({ status: 204, headers: cors }); return; }
    if (req.method() !== 'GET') posts.push({ method: req.method(), url, body: req.postData() });
    req.respond({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(req.method() === 'GET' ? rowsFor(url) : []) });
  });
  await page.evaluateOnNewDocument(() => localStorage.setItem('sess', JSON.stringify({ token: 'e30.e30.e30', refresh: '', email: 'editor@example.invalid', role: '職員', exp: Date.now() + 3600e3 })));
  await page.goto('http://127.0.0.1:' + PORT + '/index.html#ht/comm', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.innerText.includes('委員会のやり方'), { timeout: 8000 });
  const t = await page.evaluate(() => ({ text: document.body.innerText, font: parseFloat(getComputedStyle(document.querySelector('#htcommhow ol')).fontSize) }));
  ok(t.text.includes('日を決める') && t.text.includes('見本を読み上げる') && t.text.includes('「確定する」を押す'), '3ステップが出る');
  ok(t.font >= 24, '文字が大きい ' + t.font);
  ok(!t.text.includes('見本の決定'), '見本は開催記録の一覧に出ない');
  ok(t.text.includes('未開催'), '見本は前回開催に数えない');
  await page.screenshot({ path: path.join(OUT, 'comm.png') });
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('見本の議事録を見る')).click());
  const sv = await page.evaluate(() => document.querySelector('.htm').innerText);
  ok(sv.includes('これは見本です') && sv.includes('見本の議題') && sv.includes('〇月〇日'), '見本を開ける');
  await page.screenshot({ path: path.join(OUT, 'sample.png') });
  await page.click('#htsmk');
  await page.waitForSelector('#htf_held');
  ok(await page.evaluate(() => document.querySelector('#htf_discussion').value.includes('話すこと＿＿') && document.querySelector('#htf_note').value === ''), '見本の中身が写る（メモは写さない）');
  ok(await page.evaluate(() => [...document.querySelectorAll('[data-k="committee_ids"]')].filter(e => e.checked).length === 4), '4つの委員会に最初からチェック');
  await page.evaluate(() => { const e = document.querySelector('#htf_held'); e.value = '2026-11-26T13:30'; });
  await page.click('#htok');
  for (let i = 0; i < 30 && posts.filter(p => p.method === 'POST').length < 4; i++) await new Promise(r => setTimeout(r, 100));
  const ps = posts.filter(p => p.method === 'POST' && p.url.includes('ht_committee_logs')).map(p => JSON.parse(p.body));
  ok(ps.length === 4 && ps.map(p => p.committee_id).sort().join() === 'C01,C02,C03,C04', '委員会ごとに4件保存 ' + ps.map(p => p.committee_id));
  ok(ps.every(p => p.status === '確定' && p.joint_id && p.joint_id === ps[0].joint_id && !/^SAMPLE/.test(p.joint_id)), '同じ joint_id・確定・見本ではない');
  ok(!posts.some(p => p.url && p.method !== 'POST' && p.url.includes('SAMPLE')), '見本は書き換えない');
  await br.close(); server.close();
  console.log(fails ? `FAILED ${fails}` : 'ALL OK');
  process.exit(fails ? 1 : 0);
})();
