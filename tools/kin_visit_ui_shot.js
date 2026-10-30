// 金斗雲・訪問記録の「サ責からの指示」を、架空データだけで描いてスクリーンショットする。
// Supabase にはつながない。事前にリポジトリ直下で python3 -m http.server 8099
//   OUT=/opt/cursor/artifacts node tools/kin_visit_ui_shot.js
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const OUT = process.env.OUT || '/tmp/kin-visit-shot';
const BASE = process.env.BASE || 'http://127.0.0.1:8099/';
fs.mkdirSync(OUT, { recursive: true });

const USERS = [{ id: 1, name: '見本 太郎' }, { id: 2, name: '見本 花子' }];
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
:root{--main:#2e6b4f}
body{margin:0}
header{padding:14px 16px;font-size:18px;display:flex;justify-content:space-between}
main{max-width:640px;margin:auto;padding:16px}
button{font-size:17px;padding:12px;margin:6px 0;background:var(--main);color:#fff}
table{width:100%;border-collapse:collapse;background:#fff}td,th{border-bottom:1px solid #eee;padding:6px 4px;text-align:left}
h3{font-size:25px;margin:20px 0 8px}
@media (min-width:900px){
  body{font-size:28px;line-height:1.55}
  header{padding:22px 28px;font-size:32px}
  main{max-width:1200px;padding:32px 36px}
  button{font-size:28px;padding:18px;margin:10px 0}
  h3{font-size:40px}
  table{font-size:26px}
}
</style></head>
<body class="portal"><header><span id="ttl">金斗雲　訪問記録</span></header><main><div id="view"></div></main>
<script>
const DEMO = false;
const KL_SVC = ['身体介護','家事援助','通院等介助'];
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const USERS = ${JSON.stringify(USERS)};
const INSTR = ${JSON.stringify(INSTR)};
const EXISTING = ${JSON.stringify(EXISTING)};
const PREVS = ${JSON.stringify(PREVS)};
window.__calls = []; window.__saved = null;
async function sb(path, opt) {
  window.__calls.push({ path, method: opt && opt.method, body: opt && opt.body });
  if (opt && (opt.method === 'POST' || opt.method === 'PATCH')) { window.__saved = JSON.parse(opt.body); return []; }
  if (path.startsWith('kin_user')) return USERS;
  if (path.startsWith('kin_instruction')) return INSTR;
  if (path.startsWith('kin_visit?id=eq.')) return [EXISTING];
  if (path.includes('user_id=eq.2')) return [];
  if (path.includes('user_id=eq.')) return PREVS;
  if (path.startsWith('kin_visit?visit_date')) return [EXISTING];
  return [];
}
</script>
<script src="${BASE}kin_visit.js"></script>
</body></html>`;

(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--font-render-hinting=none'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  page.on('pageerror', e => { console.error('PAGEERROR', e.message); process.exitCode = 1; });
  await page.setContent(html, { waitUntil: 'networkidle0' });

  async function shot(name) {
    const file = path.join(OUT, name);
    await page.evaluate(() => document.querySelector('#kv_sv').scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: file });
    const panel = path.join(OUT, name.replace('.png', '-panel.png'));
    await (await page.$('#kv_sv')).screenshot({ path: panel });
    console.log('shot', file);
  }

  await page.evaluate(() => { KV.id = 'new'; return renderKinVisit(); });
  await page.waitForFunction(() => document.body.innerText.includes('水分をこまめにすすめる'));
  const inputs = await page.$$eval('#kv_sv input, #kv_sv textarea, #kv_instruction_id', els => els.length);
  if (inputs !== 0) throw new Error('サ責パネルに入力欄がある: ' + inputs);
  await shot('kin-saseki-new.png');

  await page.select('#kv_user_id', '2');
  await page.waitForFunction(() => document.body.innerText.includes('今は指示がありません'));
  await shot('kin-saseki-empty.png');

  await page.evaluate(() => { KV.id = 42; return renderKinVisit(); });
  await page.waitForFunction(() => document.body.innerText.includes('確認した指示ID：SJ-0001') && document.getElementById('kv_report2').value === '喉が渇くとの訴え' && document.getElementById('kv_content').value === '整容と食事の見守り');
  await shot('kin-saseki-existing.png');
  await page.evaluate(() => { document.getElementById('kv_start_time').value = '09:00'; document.getElementById('kv_end_time').value = '10:30'; kvSave('42'); });
  await page.waitForFunction(() => window.__saved);
  const edited = await page.evaluate(() => window.__saved);
  if ('instruction_id' in edited) throw new Error('既存の保存が指示IDを書き換えている');
  if (edited.content !== '整容と食事の見守り') throw new Error('既存の内容が落ちた');

  await page.evaluate(() => { window.__saved = null; KV.id = 'new'; return renderKinVisit(); });
  await page.waitForFunction(() => document.body.innerText.includes('毎回書く必要はありません'));
  await page.evaluate(() => { document.getElementById('kv_start_time').value = '09:00'; document.getElementById('kv_end_time').value = '10:00'; kvSave('new'); });
  await page.waitForFunction(() => window.__saved && window.__saved.instruction_id);
  const created = await page.evaluate(() => window.__saved);
  if (created.instruction_id !== 'SJ-0001') throw new Error('新規の指示IDが自動で入っていない: ' + created.instruction_id);
  if (created.report1 !== null) throw new Error('報告が必須になっている');

  await page.evaluate(() => { KV.id = null; return renderKinVisit(); });
  await page.waitForFunction(() => document.querySelector('details.kv-admin'));
  await page.evaluate(() => { document.querySelector('details.kv-admin').open = true; });
  await page.screenshot({ path: path.join(OUT, 'kin-saseki-list.png'), fullPage: true });
  await (await page.$('details.kv-admin')).screenshot({ path: path.join(OUT, 'kin-saseki-admin.png') });
  console.log('shot', path.join(OUT, 'kin-saseki-list.png'));
  await browser.close();
  console.log('ui shot ok');
})().catch(e => { console.error(e); process.exit(1); });
