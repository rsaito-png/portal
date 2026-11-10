// node tools/ht_self_quiz_ui_test.js
// ログインも実提出もしない。Supabase はローカルで模して、閲覧者の確認テストだけを開く。
const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const PORT = 8097;
const OUT = process.env.OUT || '/tmp/ht-self-quiz';
fs.mkdirSync(OUT, { recursive: true });
let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const office = [{ id: 'demo', name: '見本事業所', types: ['児発'], sort: 1, note: '', start_date: null }];
const staff = [{ id: 'S9001', name: '見本 花子', kana: 'ミホン ハナコ', email: 'flower@example.invalid', main_office: 'demo', sub_offices: [], employment: '常勤', job: '支援員', hired: null, status: '在籍', retired: null, note: null }];
const training = [{ id: 'T90', name: '見本の確認テスト', category: '見本', target_types: ['児発'], frequency: '年1回', months: [11], times_per_year: 1, active: true, pass_score: 75 }];
const questions = [
  { training_id: 'T90', no: 1, question: '見本の問いです。正しいものを選んでください。', opt_a: '見本の答えA', opt_b: '見本の答えB', opt_c: null, opt_d: null, points: 50 },
  { training_id: 'T90', no: 2, question: 'もう一つの見本の問いです。', opt_a: 'ひとつめ', opt_b: 'ふたつめ', opt_c: null, opt_d: null, points: 50 }
];
const keys = [{ training_id: 'T90', no: 1, answer: 'A' }, { training_id: 'T90', no: 2, answer: 'B' }];
function rowsFor(url, who) {
  const u = decodeURIComponent(url);
  if (u.includes('/rpc/ht_my_staff')) return who.staff;
  if (u.includes('/rpc/ht_submit_own_quiz')) return { id: 'mock', score: 50, max_score: 100, rate: 50, passed: '不合格' };
  if (u.includes('/rpc/')) return false;
  if (u.includes('ht_offices_t')) return office;
  if (u.includes('ht_staff')) return staff;
  if (u.includes('ht_trainings')) return training;
  if (u.includes('ht_materials')) return [{ id: 'M90', training_id: 'T90', kind: '動画', title: '見本教材', url: 'https://example.invalid/m', active: true, sort: 1 }];
  if (u.includes('ht_question_keys')) return who.editor ? keys : [];
  if (u.includes('ht_questions')) return questions.map(q => who.editor ? { ...q, answer: (keys.find(k => k.no === q.no) || {}).answer } : q);
  if (u.includes('ht_settings')) return [{ key: 'テストモード', value: 'TRUE' }, { key: '法人名', value: '見本法人' }];
  if (u.includes('ht_access')) return [{ email: who.email, office_id: 'demo', can_edit: !!who.editor, note: '' }];
  if (u.includes('ht_')) return [];
  if (u.includes('staff_profiles')) return [];
  return [];
}
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, rel === '/' ? 'index.html' : rel.replace(/^\//, ''));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('no'); return; }
  const ext = path.extname(file);
  const type = ext === '.html' ? 'text/html; charset=utf-8' : ext === '.js' ? 'text/javascript; charset=utf-8' : ext === '.css' ? 'text/css; charset=utf-8' : 'application/octet-stream';
  res.writeHead(200, { 'content-type': type });
  res.end(fs.readFileSync(file));
});
function listen() { return new Promise(r => server.listen(PORT, '127.0.0.1', r)); }
async function openAs(br, who) {
  const page = await br.newPage();
  await page.setViewport({ width: 1100, height: 1800, deviceScaleFactor: 1 });
  const posts = [];
  page.on('pageerror', e => { console.log('PAGEERROR', e.message); fails++; });
  page.on('dialog', async d => { posts.push({ alert: d.message() }); await d.accept(); });
  await page.setRequestInterception(true);
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS' };
  page.on('request', req => {
    const url = req.url();
    if (!url.includes('supabase.co')) { req.continue(); return; }
    if (req.method() === 'OPTIONS') { req.respond({ status: 204, headers: cors }); return; }
    const body = req.postData();
    if (req.method() === 'POST') posts.push({ url, body });
    const data = rowsFor(url, who);
    req.respond({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(data) });
  });
  await page.evaluateOnNewDocument(email => {
    localStorage.setItem('sess', JSON.stringify({ token: 'e30.e30.e30', refresh: '', email, role: '職員', exp: Date.now() + 3600e3 }));
  }, who.email);
  await page.goto('http://127.0.0.1:' + PORT + '/index.html#ht', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.innerText.includes('法定研修'), { timeout: 8000 });
  return { page, posts };
}
(async () => {
  await listen();
  const br = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const viewer = await openAs(br, { email: 'viewer@example.invalid', editor: false, staff: [staff[0]] });
  const home = await viewer.page.evaluate(() => document.body.innerText);
  ok(home.includes('テストモード'), 'テストモードの表示が残る');
  ok(home.includes('見るだけ'), '閲覧だけと出る');
  await viewer.page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent === '研修').click());
  const text = await viewer.page.evaluate(() => document.body.innerText);
  ok(text.includes('テストを受ける') && !text.includes('記録を入力'), '閲覧者はテストだけ');
  await viewer.page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent === 'テストを受ける').click());
  await viewer.page.waitForSelector('#qz_ok');
  const quiz = await viewer.page.evaluate(() => {
    const p = document.querySelector('.htm p');
    const s = p ? getComputedStyle(p) : null;
    const btn = document.querySelector('#qz_ok');
    return {
      text: document.querySelector('.htm').innerText,
      hasSelect: !!document.querySelector('#qz_s'),
      font: s ? parseFloat(s.fontSize) : 0,
      btn: btn ? parseFloat(getComputedStyle(btn).fontSize) : 0,
      leaked: /正解|answer/.test(document.querySelector('.htm').innerHTML)
    };
  });
  ok(quiz.text.includes('見本 花子') && quiz.text.includes('本人の分だけ'), '本人の名前で、代理選択の説明がない');
  ok(!quiz.hasSelect, '職員の選び直しができない');
  ok(quiz.font >= 24 && quiz.btn >= 24, '文字が大きい ' + quiz.font + '/' + quiz.btn);
  ok(!quiz.leaked, '画面に正解を出していない');
  await viewer.page.screenshot({ path: path.join(OUT, 'ht-self-quiz.png') });
  await viewer.page.click('input[name="qz1"][value="A"]');
  await viewer.page.click('input[name="qz2"][value="B"]');
  await viewer.page.type('#qz_i', '見本の所感');
  await viewer.page.type('#qz_p', '見本の計画');
  await viewer.page.click('#qz_ok');
  for (let i = 0; i < 30 && !viewer.posts.some(p => p.alert); i++) await new Promise(r => setTimeout(r, 100));
  const rpc = viewer.posts.find(p => p.url && p.url.includes('ht_submit_own_quiz'));
  const payload = rpc ? JSON.parse(rpc.body) : null;
  ok(!!payload, 'サーバの提出を呼んだ');
  ok(payload && payload.p_training_id === 'T90' && payload.p_answers['1'] === 'A' && payload.p_answers['2'] === 'B', '回答だけ送る ' + JSON.stringify(payload));
  ok(payload && !('score' in payload) && !('staff_id' in payload) && !('source' in payload) && !('offices' in payload), '得点・職員・証跡は送らない');
  ok(viewer.posts.some(p => (p.alert || '').includes('50%') && (p.alert || '').includes('不合格')), '画面の点数はサーバの結果');
  ok(!viewer.posts.some(p => p.url && p.url.includes('/ht_records')), '受講記録へ直接は書かない');

  const editor = await openAs(br, { email: 'editor@example.invalid', editor: true, staff: [] });
  await editor.page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent === '研修').click());
  const ed = await editor.page.evaluate(() => document.body.innerText);
  ok(ed.includes('記録を入力') && ed.includes('テストを受ける'), '編集者の記録入力は残る');
  await editor.page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent === 'テストを受ける').click());
  await editor.page.waitForSelector('#qz_s');
  ok(await editor.page.$('#qz_s') !== null, '編集者は受講する職員を選べる');
  await editor.page.click('input[name="qz1"][value="A"]');
  await editor.page.click('input[name="qz2"][value="B"]');
  await editor.page.type('#qz_i', '編集者の所感');
  await editor.page.type('#qz_p', '編集者の計画');
  await editor.page.click('#qz_ok');
  await new Promise(r => setTimeout(r, 300));
  const saved = editor.posts.find(p => p.url && p.url.includes('/ht_records'));
  const body = saved ? JSON.parse(saved.body) : null;
  ok(body && body.source === 'ポータル' && body.score === 100 && body.staff_id === 'S9001', '編集者の従来の提出は残る ' + JSON.stringify(body && { source: body.source, score: body.score, staff_id: body.staff_id }));
  await br.close();
  server.close();
  if (fails) { console.log('FAILS ' + fails); process.exit(1); }
  console.log('PASS: 閲覧者の本人テストと編集者の提出を画面で確認');
})().catch(e => { console.error(e); process.exit(1); });
