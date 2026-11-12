// node tools/ht_record_keep_test.js
// 2026-11-12 齊藤さん「記録の途中で消えた」の再発防止。ログインも実提出もしない（Supabase はローカルで模す）。
// 画面幅が960pxをまたいでも再読み込みせず、書きかけのテストが消えないこと。依頼リンクから動画→テストの手順が出ること。
const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const PORT = 8098;
const OUT = process.env.OUT || '/tmp/ht-record-keep';
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
  await page.goto('http://127.0.0.1:' + PORT + '/index.html' + (who.hash || '#ht'), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.innerText.includes('法定研修'), { timeout: 8000 });
  return { page, posts };
}
(async () => {
  await listen();
  const br = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const v = await openAs(br, { email: 'viewer@example.invalid', editor: false, staff: [staff[0]], hash: '#ht/train/T90' });
  const p = v.page;
  await p.waitForSelector('#htguide');
  const g = await p.evaluate(() => document.querySelector('#htguide').innerText);
  ok(g.includes('① 動画を見る') && g.includes('② テストを受ける') && g.includes('自動で記録'), '依頼リンクから来ると 動画→テスト の手順が出る');
  await p.evaluate(() => [...document.querySelectorAll('#htguide button')].find(b => b.textContent.includes('テストを受ける')).click());
  await p.waitForSelector('#qz_ok');
  await p.evaluate(() => { window.__alive = 1; });
  await p.click('input[name="qz1"][value="A"]');
  await p.type('#qz_i', '書きかけの気づき');
  await p.setViewport({ width: 900, height: 1800 }); await new Promise(r => setTimeout(r, 600));
  await p.setViewport({ width: 1100, height: 1800 }); await new Promise(r => setTimeout(r, 600));
  const st = await p.evaluate(() => ({ alive: window.__alive, open: !!document.querySelector('#qz_ok'), i: (document.querySelector('#qz_i') || {}).value, a: !!document.querySelector('input[name="qz1"][value="A"]:checked') }));
  ok(st.alive === 1, '画面幅が変わっても再読み込みしない');
  ok(st.open && st.i === '書きかけの気づき' && st.a, '書きかけのテストが残る ' + JSON.stringify(st));
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#htguide');
  await p.evaluate(() => [...document.querySelectorAll('#htguide button')].find(b => b.textContent.includes('テストを受ける')).click());
  await p.waitForSelector('#qz_ok');
  const re = await p.evaluate(() => ({ i: document.querySelector('#qz_i').value, a: !!document.querySelector('input[name="qz1"][value="A"]:checked') }));
  ok(re.i === '書きかけの気づき' && re.a, '再読み込みしても書きかけが戻る ' + JSON.stringify(re));
  await p.click('input[name="qz2"][value="B"]');
  await p.type('#qz_p', '計画');
  await p.click('#qz_ok');
  for (let i = 0; i < 30 && !v.posts.some(x => x.alert); i++) await new Promise(r => setTimeout(r, 100));
  const rpc = v.posts.find(x => x.url && x.url.includes('ht_submit_own_quiz'));
  const pl = rpc ? JSON.parse(rpc.body) : {};
  ok(pl.p_impression === '書きかけの気づき' && pl.p_plan === '計画', '気づき・計画はテストと一緒に送る');
  const left = await p.evaluate(() => Object.keys(sessionStorage).filter(k => k.startsWith('htdraft:')).length);
  ok(left === 0, '提出したら書きかけは消す');
  await p.screenshot({ path: path.join(OUT, 'ht-guide.png') });

  const e = await openAs(br, { email: 'editor@example.invalid', editor: true, staff: [] });
  await e.page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent === '研修').click());
  const et = await e.page.evaluate(() => document.body.innerText);
  ok(et.includes('紙で受けた分の記録を入力') && et.includes('点数・気づき・計画は自動で記録'), '手入力は紙の分だけと分かる');
  ok(!et.includes('のやり方'), '依頼リンク以外では手順の枠を出さない');
  await br.close();
  server.close();
  if (fails) { console.log('FAILS ' + fails); process.exit(1); }
  console.log('PASS: 書きかけが消えない・依頼リンクから動画→テスト');
})().catch(e => { console.error(e); process.exit(1); });
