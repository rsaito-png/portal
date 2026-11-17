// 茶夢の実績。未署名をまとめて署名する。架空の通信。署名済みは上書きしない。
// 実行: node tools/chamu_batch_sign_ui_test.js
const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');
const OUT = process.env.OUT || '/opt/cursor/artifacts';
fs.mkdirSync(OUT, { recursive: true });
const ROOT = path.join(__dirname, '..');
const PORT = 8098;
const SB = 'https://zvrardoyxocmqhvyddnf.supabase.co';
let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const uid = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const id16 = '11111111-1111-1111-1111-111111111111';
const id18 = '22222222-2222-2222-2222-222222222222';
const id13 = '33333333-3333-3333-3333-333333333333';
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const records = [
  { id: id13, user_id: uid, service_date: '2026-11-13', start_time: '11:00', end_time: '14:00', transport: '往復', meal: 'あり', support_note: '署名済みの日', signed_at: '2026-11-13T01:00:00Z', signature_data: png },
  { id: id16, user_id: uid, service_date: '2026-11-16', start_time: '11:00', end_time: '14:00', transport: '往復', meal: 'あり', support_note: '落ち着いて過ごした', signed_at: null, signature_data: null },
  { id: id18, user_id: uid, service_date: '2026-11-18', start_time: '11:00', end_time: '14:30', transport: '片道', meal: 'なし', support_note: '', signed_at: null, signature_data: null },
];
const users = [{ id: uid, name: '日置広大', active: true, sort: 1, use_days: ['月', '火', '水', '木', '金'] }];
const profile = [{ nikki_name: '見本職員', duty: '現場支援員', office: '茶夢', nicchu: false, is_chair: false, user_id: '11111111-1111-1111-1111-111111111111' }];
const state = { patch: null, signedKept: records[0].signed_at };
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
  await p.setViewport({ width: 1024, height: 900, deviceScaleFactor: 1 });
  p.on('pageerror', e => { console.log('PAGEERROR', e.message); fails++; });
  await p.setRequestInterception(true);
  p.on('request', req => {
    const u = req.url();
    if (!u.startsWith(SB)) return req.continue();
    const pathn = u.slice(SB.length);
    const json = b => req.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(b) });
    if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (pathn.startsWith('/rest/v1/rpc/chamu_now')) return json('2026-11-17T03:00:00.000Z');
    if (pathn.startsWith('/rest/v1/rpc/chamu_can_bill')) return json(false);
    if (pathn.startsWith('/rest/v1/rpc/chamu_can')) return json(true);
    if (pathn.startsWith('/rest/v1/rpc/')) return json(false);
    if (pathn.startsWith('/rest/v1/staff_profiles')) return json(profile);
    if (pathn.startsWith('/rest/v1/chamu_users')) return json(users);
    if (pathn.startsWith('/rest/v1/chamu_service_records')) {
      if (req.method() === 'PATCH') {
        state.patch = { url: pathn, body: JSON.parse(req.postData() || '{}') };
        const ids = (/id=in\.\(([^)]+)\)/.exec(pathn) || [])[1] || '';
        const want = ids.split(',').filter(Boolean);
        const updated = records.filter(r => want.includes(r.id) && !r.signed_at).map(r => ({ ...r, signature_data: state.patch.body.signature_data, signed_at: state.patch.body.signed_at }));
        updated.forEach(u => { const row = records.find(r => r.id === u.id); if (row) { row.signed_at = u.signed_at; row.signature_data = u.signature_data; } });
        return json(updated);
      }
      if (pathn.includes('signed_at=is.null') && pathn.includes('select=id&') || pathn.includes('select=id')) {
        if (pathn.includes('select=id,user_id') || pathn.includes('service_date')) return json(records.filter(r => !r.signed_at));
        if (pathn.includes('signed_at=is.null')) return json(records.filter(r => !r.signed_at).map(r => ({ id: r.id })));
      }
      const one = /[?&]id=eq\.([^&]+)/.exec(pathn);
      if (one) return json(records.filter(r => r.id === decodeURIComponent(one[1])));
      return json(records.slice().sort((a, b) => a.service_date.localeCompare(b.service_date)));
    }
    if (pathn.startsWith('/rest/v1/')) return json([]);
    return json({});
  });
  await p.evaluateOnNewDocument(() => {
    const exp = Date.now() + 3600 * 1000;
    const payload = btoa(JSON.stringify({ sub: '11111111-1111-1111-1111-111111111111' })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    localStorage.setItem('sess', JSON.stringify({ token: 'h.' + payload + '.s', refresh: 'r', email: 'staff@example.test', role: '職員', exp }));
  });
  await p.goto('http://127.0.0.1:' + PORT + '/index.html?r=' + Date.now() + '#chamu/records', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => document.body.innerText.includes('未署名をまとめて署名'), { timeout: 15000 });
  const listText = await p.evaluate(() => document.body.innerText);
  ok(listText.includes('未署名をまとめて署名（2件）'), '一覧の件数: ' + (listText.match(/未署名をまとめて署名（.+）/) || [])[0]);
  ok(listText.includes('記録票・署名'), '1件ずつの署名は残る');
  ok(listText.includes('2026-11-13') && listText.includes('✔ 署名済'), '署名済みの行も一覧にある');
  await p.screenshot({ path: path.join(OUT, 'chamu-records.png'), fullPage: true });
  await p.evaluate(() => [...document.querySelectorAll('button')].find(el => el.textContent.includes('未署名をまとめて署名')).click());
  await p.waitForFunction(() => document.body.innerText.includes('署名欄'), { timeout: 15000 });
  const days = await p.$$eval('.cm-day', els => els.map(e => ({ text: e.innerText.replace(/\s+/g, ' '), on: e.querySelector('input').checked })));
  ok(days.length === 2 && days.every(d => d.on), '未署名2件がチェック済み: ' + JSON.stringify(days));
  ok(days.some(d => d.text.includes('2026-11-16') && d.text.includes('往復') && d.text.includes('あり')), '16日の開始終了送迎食事');
  ok(days.some(d => d.text.includes('2026-11-18') && d.text.includes('片道') && d.text.includes('なし')), '18日');
  ok(!days.some(d => d.text.includes('2026-11-13')), '署名済みは一括の一覧に出ない');
  await p.evaluate(id => { document.getElementById('bs_' + id).checked = false; }, id18);
  await p.waitForSelector('#cm_cv', { timeout: 15000 });
  await p.waitForFunction(() => typeof CM !== 'undefined' && CM.pad, { timeout: 15000 });
  await p.evaluate(() => document.getElementById('cm_cv').scrollIntoView({ block: 'center' }));
  const box = await p.$('#cm_cv');
  const r = await box.boundingBox();
  await p.mouse.move(r.x + 80, r.y + r.height * 0.62);
  await p.mouse.down();
  await p.mouse.move(r.x + r.width * 0.42, r.y + r.height * 0.28, { steps: 18 });
  await p.mouse.move(r.x + r.width * 0.78, r.y + r.height * 0.7, { steps: 18 });
  await p.mouse.up();
  ok(await p.evaluate(() => CM.pad && CM.pad.isDrawn()), '署名欄に書けた');
  const padH = await p.$eval('.cm-pad', el => el.getBoundingClientRect().height);
  ok(padH >= 500, '署名欄の高さ ' + padH);
  await p.screenshot({ path: path.join(OUT, 'chamu-batch.png'), fullPage: true });
  await p.evaluate(() => cmBatchSave());
  await p.waitForFunction(() => document.body.innerText.includes('件に署名を保存しました'), { timeout: 15000 });
  ok(state.patch && state.patch.url.includes('signed_at=is.null'), '保存は未署名だけ: ' + (state.patch && state.patch.url));
  ok(state.patch.url.includes(id16) && !state.patch.url.includes(id18) && !state.patch.url.includes(id13), '外した日と署名済みは送らない');
  ok(state.patch.body.signature_data && state.patch.body.signature_data.indexOf('data:image/png;base64,') === 0 && state.patch.body.signed_at, '同じ署名と時刻');
  ok(records.find(r => r.id === id13).signed_at === state.signedKept, '署名済みの時刻はそのまま');
  ok(records.find(r => r.id === id18).signed_at == null, '外した日は未署名のまま');
  const after = await p.evaluate(() => document.body.innerText);
  ok(after.includes('未署名をまとめて署名（1件）'), '残件を表示: ' + (after.match(/未署名をまとめて署名（.+）/) || [])[0]);
  await br.close();
  server.close();
  if (fails) { console.log('FAILS ' + fails); process.exit(1); }
  console.log('chamu_batch_sign_ui ok');
})().catch(e => { console.error(e); process.exit(1); });
