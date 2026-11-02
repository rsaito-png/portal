// 茶夢の日誌。「保存して記録票に転記」の成功・失敗で、画面中央に結果が出る。
// 架空データのみ。Supabase への通信はここで差し替える。
// 使い方: リポジトリ直下で python3 -m http.server 8099
//   OUT=/tmp/chamu-notice/ node tools/chamu_journal_notice_test.js
const puppeteer = require('puppeteer-core'), fs = require('fs'), path = require('path');
const OUT = process.env.OUT || '/tmp/chamu-notice/';
const BASE = process.env.BASE || 'http://127.0.0.1:8099/';
const SB = 'https://zvrardoyxocmqhvyddnf.supabase.co';
fs.mkdirSync(OUT, { recursive: true });
let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const br = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--font-render-hinting=none'] });
  const state = { journalPosts: 0, linePosts: 0, recordPosts: 0, journal: null, lines: [], records: [], fail: '' };
  const user = { id: 'u1', name: '見本 太郎', active: true, sort: 1, kana: 'ミホン', support_level: 4, recipient_no: '0000000001', city_no: '242012', meal_addon: true, transport_class: '2' };
  const profile = [{ nikki_name: '見本職員', duty: '現場支援員', office: '茶夢', nicchu: false, is_chair: false, user_id: '11111111-1111-1111-1111-111111111111' }];

  function journalRows() {
    if (!state.journal) return [];
    return [{ ...state.journal, chamu_journal_line: state.lines.map(l => ({ ...l })) }];
  }

  async function mkPage(w, h) {
    const p = await br.newPage();
    await p.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    p.on('pageerror', e => { console.log('PAGEERROR', e.message); fails++; });
    await p.setRequestInterception(true);
    p.on('request', req => {
      const u = req.url();
      if (!u.startsWith(SB)) return req.continue();
      const pathn = u.slice(SB.length);
      const json = (b, s = 200) => req.respond({ status: s, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(b) });
      if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
      if (pathn.startsWith('/rest/v1/rpc/chamu_can_bill')) return json(false);
      if (pathn.startsWith('/rest/v1/rpc/chamu_can')) return json(true);
      if (pathn.startsWith('/rest/v1/rpc/')) return json(false);
      if (pathn.startsWith('/rest/v1/staff_profiles')) return json(profile);
      if (pathn.startsWith('/rest/v1/chamu_users')) return json([user]);
      if (pathn.startsWith('/rest/v1/chamu_billing_settings')) return json([]);
      if (pathn.startsWith('/rest/v1/chamu_journal_line')) {
        if (req.method() === 'POST') {
          if (state.fail === 'line') return json({ message: 'permission denied' }, 403);
          state.linePosts++;
          state.lines = JSON.parse(req.postData() || '[]');
          return req.respond({ status: 201, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '' });
        }
        return json([]);
      }
      if (pathn.startsWith('/rest/v1/chamu_journal')) {
        if (req.method() === 'POST') {
          if (state.fail === 'net') return req.abort('failed');
          if (state.fail === 'deny') return json({ message: 'permission denied' }, 403);
          state.journalPosts++;
          const body = JSON.parse(req.postData() || '{}');
          state.journal = { id: 'j1', journal_date: body.journal_date, staff_name: body.staff_name, weather: body.weather, menu: body.menu, note: body.note };
          return json([state.journal]);
        }
        return json(journalRows());
      }
      if (pathn.startsWith('/rest/v1/chamu_service_records')) {
        if (req.method() === 'POST') {
          state.recordPosts++;
          state.records = JSON.parse(req.postData() || '[]');
          return req.respond({ status: 201, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '' });
        }
        if (req.method() === 'DELETE') { state.records = []; return req.respond({ status: 204, headers: { 'access-control-allow-origin': '*' }, body: '' }); }
        return json(state.records);
      }
      if (pathn.startsWith('/rest/v1/')) return json([]);
      return json({});
    });
    await p.evaluateOnNewDocument(() => {
      const exp = Date.now() + 3600 * 1000;
      const payload = btoa(JSON.stringify({ sub: '11111111-1111-1111-1111-111111111111' })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
      localStorage.setItem('sess', JSON.stringify({ token: 'h.' + payload + '.s', refresh: 'r', email: 'staff@example.test', role: '職員', exp }));
    });
    return p;
  }

  async function openJournal(p) {
    await p.goto(BASE + 'index.html#chamu/journal', { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('[data-cm-save]', { timeout: 15000 });
    await p.evaluate(() => document.fonts && document.fonts.ready);
  }
  async function fillPresent(p, times) {
    await p.select('#p_u1', '出席');
    await p.waitForSelector('#s_u1', { visible: true });
    await p.$eval('#j_staff', (el, v) => { el.value = v; }, '見本職員');
    await p.$eval('#s_u1', (el, v) => { el.value = v; }, times ? '11:00' : '');
    await p.$eval('#e_u1', (el, v) => { el.value = v; }, times ? '13:00' : '');
    await p.select('#t_u1', '往復');
    await p.select('#m_u1', 'あり');
    await p.$eval('#n_u1', el => { el.value = '落ち着いて過ごした'; });
  }
  async function dialogText(p) {
    await p.waitForSelector('#cm_dlg:not([hidden])', { timeout: 8000 });
    return p.$eval('#cm_dlg', el => ({
      cls: el.className,
      title: document.getElementById('cm_dlg_t').textContent,
      body: document.getElementById('cm_dlg_b').textContent,
      role: el.getAttribute('role'),
      modal: el.getAttribute('aria-modal'),
      box: (() => { const r = el.querySelector('.box').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, h: r.height, w: r.width }; })(),
      vh: window.innerHeight, vw: window.innerWidth,
    }));
  }

  const desk = await mkPage(1100, 820);
  await openJournal(desk);
  await fillPresent(desk, true);
  await desk.evaluate(() => document.querySelector('[data-cm-save]').scrollIntoView({ block: 'end' }));
  const postsBefore = state.journalPosts;
  await desk.evaluate(async () => { const a = cmSaveJournal(); const b = cmSaveJournal(); await a; await b; });
  await sleep(200);
  const saved = await dialogText(desk);
  ok(state.journalPosts === postsBefore + 1, 'double click saves once (' + state.journalPosts + ')');
  ok(state.linePosts >= 1 && state.recordPosts >= 1, 'journal line and service record posted');
  ok(saved.role === 'dialog' && saved.modal === 'true', 'dialog is modal');
  ok(saved.cls.includes('ok') && saved.title === '保存しました', 'success title: ' + saved.title);
  ok(saved.body === '記録票に転記しました。', 'success body: ' + JSON.stringify(saved.body));
  ok(!/給与|受給者証|0000000001/.test(saved.title + saved.body), 'notice has no extra personal fields');
  ok(saved.box.top >= -1 && saved.box.bottom <= saved.vh + 1 && saved.box.left >= -1 && saved.box.right <= saved.vw + 1, 'dialog inside viewport ' + JSON.stringify(saved.box));
  const banner = await desk.$eval('#cm_m', el => el.innerText);
  ok(banner.includes('保存しました') && banner.includes('実績記録票に転記しました'), 'top banner still updated');
  const btn = await desk.$eval('[data-cm-save]', el => ({ disabled: el.disabled, text: el.textContent }));
  ok(!btn.disabled && btn.text === '保存して記録票に転記', 'save button ready again');
  await desk.screenshot({ path: path.join(OUT, 'chamu-save-ok.png') });
  await desk.click('#cm_dlg_ok');
  await sleep(100);
  ok(await desk.$eval('#cm_dlg', el => el.hidden), 'close button hides dialog');

  await fillPresent(desk, false);
  await desk.click('[data-cm-save]');
  const filled = await dialogText(desk);
  ok(filled.title === '保存しました' && filled.body.includes('記録票に転記しました。') && filled.body.includes('時刻空欄→11:00-15:00補完'), 'blank times explained: ' + JSON.stringify(filled.body));
  await desk.keyboard.press('Escape');
  await sleep(100);
  ok(await desk.$eval('#cm_dlg', el => el.hidden), 'escape hides dialog');

  await desk.$eval('#j_staff', el => { el.value = ''; });
  await desk.click('[data-cm-save]');
  const bad = await dialogText(desk);
  ok(bad.cls.includes('bad') && bad.title === '保存できませんでした', 'error title: ' + bad.title);
  ok(bad.body.includes('記入者を入れてください'), 'validation shown: ' + JSON.stringify(bad.body));
  ok(await desk.$eval('#p_u1', el => el.value) === '出席', 'failed save keeps the form');
  await desk.screenshot({ path: path.join(OUT, 'chamu-save-ng.png') });
  await desk.click('#cm_dlg_ok');

  state.fail = 'deny';
  await desk.$eval('#j_staff', el => { el.value = '見本職員'; });
  const postsAtDeny = state.journalPosts;
  await desk.click('[data-cm-save]');
  const denied = await dialogText(desk);
  ok(denied.title === '保存できませんでした' && denied.body.includes('この操作の権限がありません'), 'permission error: ' + denied.body);
  ok(state.journalPosts === postsAtDeny, 'denied save is not stored');
  ok(await desk.$eval('#j_staff', el => el.value) === '見本職員', 'permission error keeps the form');
  await desk.click('#cm_dlg_ok');

  state.fail = 'net';
  await desk.click('[data-cm-save]');
  const net = await dialogText(desk);
  ok(net.title === '保存できませんでした' && net.body.includes('通信できませんでした'), 'network error: ' + net.body);
  await desk.click('#cm_dlg_ok');
  state.fail = '';

  const phone = await mkPage(390, 780);
  await openJournal(phone);
  await fillPresent(phone, true);
  await phone.evaluate(() => document.querySelector('[data-cm-save]').scrollIntoView({ block: 'center' }));
  const hit = await phone.evaluate(() => {
    const btn = document.querySelector('[data-cm-save]');
    const r = btn.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { text: btn.textContent, top: top && (top.id || top.textContent || '').slice(0, 40), covers: top === btn || btn.contains(top) };
  });
  ok(hit.covers, 'phone tap hits the save button (' + hit.top + ')');
  await phone.click('[data-cm-save]');
  const narrow = await dialogText(phone);
  ok(narrow.title === '保存しました' && narrow.body.includes('記録票に転記しました'), 'phone success');
  ok(narrow.box.top >= -1 && narrow.box.bottom <= narrow.vh + 1 && narrow.box.left >= -1 && narrow.box.right <= narrow.vw + 1 && narrow.box.w <= narrow.vw, 'phone dialog fits ' + JSON.stringify(narrow.box));
  await phone.screenshot({ path: path.join(OUT, 'chamu-save-ok-phone.png') });

  await br.close();
  if (fails) { console.log('FAILED ' + fails); process.exit(1); }
  console.log('chamu journal notice ok');
})().catch(e => { console.error(e); process.exit(1); });
