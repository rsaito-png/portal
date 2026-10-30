// 金斗雲・記録記入（GAS風）と今月の記録を、架空データだけで描く。
// Supabase にはつながない。事前にリポジトリ直下で python3 -m http.server 8099
//   OUT=/opt/cursor/artifacts node tools/kin_visit_ui_shot.js
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const OUT = process.env.OUT || '/tmp/kin-visit-shot';
const BASE = process.env.BASE || 'http://127.0.0.1:8099/';
fs.mkdirSync(OUT, { recursive: true });

const USERS = [
  { id: 1, name: '見本太郎', name_kana: 'みほん たろう' },
  { id: 2, name: '見本花子', name_kana: 'みほん はなこ' },
  { id: 3, name: '見本次郎', name_kana: 'みほん じろう' }
];
const SUPPLIES = [
  { id: 11, user_id: 1, service: '身体介護', weekday: null, start_time: '06:30:00', end_time: '07:10:00', content: '整容・食事支援', building: '見本棟A', plan_from: null, plan_to: null },
  { id: 12, user_id: 2, service: '身体介護', weekday: null, start_time: '07:15:00', end_time: '07:35:00', content: '着替えと見守り', building: '見本棟A', plan_from: null, plan_to: null },
  { id: 13, user_id: 3, service: '身体介護', weekday: null, start_time: '18:00:00', end_time: '18:40:00', content: '夕食準備', building: '見本棟B', plan_from: null, plan_to: null },
  { id: 14, user_id: 1, service: '身体介護', weekday: null, start_time: '18:55:00', end_time: '19:35:00', content: '夕食と入浴', building: '見本棟A', plan_from: null, plan_to: null }
];
const INSTR = [
  { id: 'SJ-0001', target_user_id: 1, start_date: '2026-10-01', end_date: null, content: '水分をこまめにすすめる。食事は見守りで、むせたら中止。', instructed_by: '山川美恵子', ended_at: null },
  { id: 'SJ-0002', target_user_id: null, start_date: '2026-09-01', end_date: '2026-09-30', content: '終了済みの全員向け指示（この日には出ない）', instructed_by: '山川美恵子', ended_at: '2026-09-30T00:00:00Z' }
];
const EXISTING = {
  id: 42, visit_date: '2026-10-28', user_id: 1, staff_name: '見本ヘルパー', service: '身体介護',
  start_time: '09:00:00', end_time: '10:00:00', actual_minutes: 60, content: '整容と食事の見守り', note: '',
  report1: '変化なし', report2: '喉が渇くとの訴え', report3: '変化なし', report4: '変化なし', report5: '変化なし',
  addition: '', sign_reason: '', late_signed: '', instruction_id: 'SJ-0001', sign_status: '未署名',
  staff_confirmed: false, sab_confirmed: false, recorded_at: null, staff_confirmed_at: null,
  sv_confirm_1: '', sv_confirm_2: null, sv_confirm_3: '次回も水分を確認'
};
const PREVS = [
  { id: 41, visit_date: '2026-10-27', start_time: '09:00:00', end_time: '10:00:00', staff_name: '見本ヘルパー', report1: '変化なし', report2: '変化なし', report3: '変化なし', report4: '変化なし', report5: '変化なし', sv_confirm_3: '' },
  EXISTING
];

const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="${BASE}theme-retro.css">
<style>
:root{--main:#c9a227}
body{margin:0}
header{padding:14px 16px;font-size:18px}
main{max-width:640px;margin:auto;padding:16px}
button{font-size:17px;padding:12px;margin:6px 0}
h3{font-size:25px;margin:20px 0 8px}
</style></head>
<body class="portal"><header><span id="ttl">金斗雲</span></header><main><div id="view"></div></main>
<script>
const DEMO = false;
const KL_SVC = ['身体介護','家事援助','通院等介助'];
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function leoMyProfileQ(cols) { return 'staff_profiles?select=' + cols + '&user_id=eq.11111111-1111-1111-1111-111111111111'; }
const USERS = ${JSON.stringify(USERS)};
const SUPPLIES = ${JSON.stringify(SUPPLIES)};
const INSTR = ${JSON.stringify(INSTR)};
const EXISTING = ${JSON.stringify(EXISTING)};
const PREVS = ${JSON.stringify(PREVS)};
window.__calls = []; window.__saved = null; window.__posts = [];
async function sb(path, opt) {
  window.__calls.push({ path, method: opt && opt.method, body: opt && opt.body });
  if (opt && (opt.method === 'POST' || opt.method === 'PATCH')) {
    window.__saved = JSON.parse(opt.body);
    window.__posts.push(window.__saved);
    return opt.method === 'PATCH' ? [window.__saved] : [];
  }
  if (path.startsWith('staff_profiles')) return [{ full_name: '齊藤連', nikki_name: '連' }];
  if (path.startsWith('kin_user')) return USERS;
  if (path.startsWith('kin_supply')) return SUPPLIES;
  if (path.startsWith('kin_instruction')) return INSTR;
  if (path.startsWith('kin_visit?id=eq.')) return [EXISTING];
  if (path.includes('sign_status')) return [];
  if (path.includes('user_id=eq.2')) return [];
  if (path.includes('user_id=eq.')) return PREVS;
  if (path.startsWith('kin_visit?visit_date')) return [EXISTING];
  return [];
}
</script>
<script src="${BASE}signpad.js"></script>
<script src="${BASE}kin_visit.js"></script>
</body></html>`;

(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--font-render-hinting=none'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 480, height: 1000, deviceScaleFactor: 1 });
  page.on('pageerror', e => { console.error('PAGEERROR', e.message); process.exitCode = 1; });
  page.on('dialog', async d => { await d.accept(); });
  await page.setContent(html, { waitUntil: 'networkidle0' });

  async function shot(name, full, keepScroll) {
    const file = path.join(OUT, name);
    if (!keepScroll) await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: file, fullPage: !!full });
    console.log('shot', file);
  }

  await page.evaluate(() => renderKinWrite());
  await page.waitForFunction(() => {
    const h = document.getElementById('helperName');
    return h && h.value === '齊藤連' && document.body.innerText.includes('同じ建物で連続') && document.body.innerText.includes('Nome do cuidador');
  });
  await shot('kin-write-normal-top.png', false);

  await page.select('#userName', '1');
  await page.waitForFunction(() => document.body.innerText.includes('水分をこまめにすすめる') && document.getElementById('n-content').value === '整容・食事支援');
  const instrInputs = await page.$$eval('#n-sv textarea, #n-sv input[type="text"]', els => els.length);
  if (instrInputs !== 0) throw new Error('サ責パネルに記入欄がある: ' + instrInputs);
  await shot('kin-write-normal.png', true);

  await page.click('label[for="modeTrio"]');
  await page.waitForFunction(() => {
    const sec = document.getElementById('trioSection');
    return sec && !sec.hidden && document.body.innerText.includes('見本棟A');
  });
  const asa = await page.$('#band-asa');
  if (asa) await page.click('label[for="band-asa"]');
  await page.waitForFunction(() => document.getElementById('trioSubmitLabel').textContent === '2人分をまとめて送信' && document.body.innerText.includes('見本太郎') && document.body.innerText.includes('見本花子'));
  await page.evaluate(() => document.getElementById('t-cards').scrollIntoView({ block: 'start' }));
  await shot('kin-write-trio-cards.png', false, true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot('kin-write-trio-top.png', false);
  await shot('kin-write-trio.png', true);

  await page.click('label[for="modeLater"]');
  await page.waitForFunction(() => document.body.innerText.includes('まとめて署名') && document.getElementById('laterSection') && !document.getElementById('laterSection').hidden);
  await shot('kin-write-later.png', false);

  await page.click('label[for="modeNormal"]');
  await page.waitForFunction(() => document.getElementById('helperName').value === '齊藤連' && document.getElementById('n-startTime').value === '06:30');
  await page.evaluate(() => { window.__posts = []; return kvGasSubmitNormal(); });
  await page.waitForFunction(() => window.__posts.length);
  const created = await page.evaluate(() => window.__posts[0]);
  if (created.staff_name !== '齊藤連') throw new Error('新規の担当者が自分ではない: ' + created.staff_name);
  if (created.instruction_id !== 'SJ-0001') throw new Error('新規の指示IDが自動で入っていない: ' + created.instruction_id);
  if (created.late_signed !== 'はい') throw new Error('初期の署名があとで署名ではない');
  if (created.report1 !== '変化なし') throw new Error('報告の初期値が変化なしではない');

  await page.evaluate(() => {
    document.getElementById('userName').value = '1';
    document.getElementById('helperName').value = '';
    document.getElementById('n-startTime').value = '08:00';
    document.getElementById('n-endTime').value = '08:30';
    document.getElementById('n-content').value = '';
    window.__posts = [];
    return kvGasSubmitNormal();
  });
  await page.waitForFunction(() => window.__posts.length);
  const emptyStaff = await page.evaluate(() => window.__posts[0]);
  if (emptyStaff.staff_name !== null) throw new Error('空欄の担当者を保存できていない');
  if (emptyStaff.content !== null) throw new Error('空の提供内容を保存できていない');

  await page.evaluate(() => { KV.id = 42; return renderKinVisit(); });
  await page.waitForFunction(() => document.getElementById('kv_staff_name') && document.getElementById('kv_staff_name').value === '見本ヘルパー' && document.getElementById('kv_content').value === '整容と食事の見守り');
  await shot('kin-visit-existing.png', false);
  await page.evaluate(() => { window.__saved = null; document.getElementById('kv_start_time').value = '09:00'; document.getElementById('kv_end_time').value = '10:30'; kvSave('42'); });
  await page.waitForFunction(() => window.__saved);
  const edited = await page.evaluate(() => window.__saved);
  if ('instruction_id' in edited) throw new Error('既存の保存が指示IDを書き換えている');
  if (edited.staff_name !== '見本ヘルパー') throw new Error('既存の担当者が変わった: ' + edited.staff_name);

  await page.evaluate(() => { KV.id = null; return renderKinVisit(); });
  await page.waitForFunction(() => document.body.innerText.includes('今月の記録') && document.querySelector('a[href="#kintoun/write"]'));
  await shot('kin-visit-list.png', false);

  const home = await browser.newPage();
  await home.setViewport({ width: 480, height: 1200, deviceScaleFactor: 1 });
  home.on('pageerror', e => { console.error('HOME', e.message); process.exitCode = 1; });
  await home.goto(BASE + 'index.html?demo=1#kintoun', { waitUntil: 'domcontentloaded' });
  await home.waitForFunction(() => document.body.innerText.includes('記録記入') && document.body.innerText.includes('スケジュール表'));
  const order = await home.evaluate(() => [...document.querySelectorAll('#view a.tile')].map(a => a.innerText.replace(/\s+/g, ' ').trim()));
  console.log('home tiles', order.slice(0, 6).join(' | '));
  if (!order[0] || order[0].indexOf('打刻') < 0) throw new Error('先頭が打刻ではない: ' + order[0]);
  if (order[1].indexOf('記録記入') < 0) throw new Error('2番目が記録記入ではない: ' + order[1]);
  if (order[2].indexOf('スケジュール表') < 0) throw new Error('3番目がスケジュール表ではない: ' + order[2]);
  if (order.some(t => t.indexOf('毎日の記録') >= 0)) throw new Error('毎日の記録が残っている');
  await home.screenshot({ path: path.join(OUT, 'kin-home.png') });
  console.log('shot', path.join(OUT, 'kin-home.png'));

  await browser.close();
  console.log('ui shot ok');
})().catch(e => { console.error(e); process.exit(1); });
