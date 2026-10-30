// 画面テスト（架空データのみ）。Supabase への通信はここで差し替える。
// 使い方: リポジトリ直下で python3 -m http.server 8099
//   OUT=/tmp/af/ node tools/assess_form_ui_test.js
const puppeteer = require('puppeteer-core'), fs = require('fs');
const OUT = process.env.OUT || '/tmp/af/';
const BASE = process.env.BASE || 'http://127.0.0.1:8099/';
const SB = 'https://zvrardoyxocmqhvyddnf.supabase.co';
const TOK = 'ab'.repeat(24);
fs.mkdirSync(OUT, { recursive: true });
let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const br = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const state = { submits: [], applies: [], links: [], subs: [] };
  const VALS = { name_kana: '新規 花子（しんき はなこ）', birth: '2019-04-02', school: '見本保育園 年長', allergy: '有り', allergy_detail: '卵', convulsion: 'いいえ', wish_life: '自分でやってほしい' };
  async function mkPage(w, h, staff) {
    const p = await br.newPage();
    await p.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    p.on('pageerror', e => { console.log('PAGEERROR', e.message); fails++; });
    p.on('dialog', async d => { if (d.type() === 'prompt') await d.accept('別の児童'); else await d.accept(); });
    await p.setRequestInterception(true);
    p.on('request', req => {
      const u = req.url();
      if (!u.startsWith(SB)) return req.continue();
      const path = u.slice(SB.length);
      const json = (b, s = 200) => req.respond({ status: s, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(b) });
      if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
      if (path.startsWith('/rest/v1/rpc/leo_af_get')) return json({ child: '見本 太郎', expired: false, last: null });
      if (path.startsWith('/rest/v1/rpc/leo_af_submit')) { state.submits.push(JSON.parse(req.postData())); return json('ok'); }
      if (path.startsWith('/rest/v1/rpc/leo_af_make_link')) { state.links.push(JSON.parse(req.postData())); return json(TOK); }
      if (path.startsWith('/rest/v1/rpc/leo_af_apply')) { state.applies.push(JSON.parse(req.postData())); return json(JSON.parse(req.postData()).p_vals); }
      if (path.startsWith('/rest/v1/rpc/leo_af_reject')) return json(null);
      if (path.startsWith('/rest/v1/staff_profiles')) return json([{ duty: '児発管', office: 'レオ' }]);
      if (path.startsWith('/rest/v1/leo_af_subs?id=eq.')) return json(state.subs.filter(s => s.id === +path.match(/id=eq\.(\d+)/)[1]));
      if (path.startsWith('/rest/v1/leo_af_subs')) return json(state.subs);
      if (path.startsWith('/rest/v1/leo_child_assess')) return json([]);
      if (path.startsWith('/rest/v1/leo_children')) return json([{ name: '見本 太郎' }]);
      if (path.startsWith('/rest/v1/leo_child_info')) return json([{ name: '見本 太郎' }]);
      if (path.startsWith('/rest/v1/')) return json([]);
      return json({});
    });
    if (staff) await p.evaluateOnNewDocument(() => localStorage.setItem('sess', JSON.stringify({ token: 'fake', refresh: 'fake', email: 'test@example.com', role: '事務', exp: Date.now() + 3600e3 })));
    return p;
  }
  const type = async (p, sel, v) => {
    await p.click(sel);
    await p.evaluate(s => { const e = document.querySelector(s); e.focus(); e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true })); }, sel);
    await p.type(sel, v);
  };

  const g = await mkPage(390, 844, false);
  await g.goto(BASE + 'assess.html?t=' + TOK, { waitUntil: 'networkidle0' });
  ok(await g.$eval('#m', e => e.textContent.includes('見本 太郎') && e.textContent.includes('初めての聞き取り')), '保護者：児童名と初回の説明');
  ok(!(await g.$('input[type=file]')), '保護者：写真のアップロード欄がない');
  ok(await g.$eval('#m', e => e.textContent.includes('保険証・受給者証の写真は、ここでは受け取りません') && e.textContent.includes('受け取りません・保管しません')), '保護者：写真は受け取らない・保管しない');
  const heads = ['■基本情報', '■家族', '■診断・医療', '■食事', '■排泄', '■身辺自立', '■遊び・性格・行動', '■健康状態', '■保護者の願い（6領域）', '■他事業所・書類・同意'];
  ok(await g.$eval('#m', (e, hs) => hs.every(h => e.textContent.includes(h)), heads), '保護者：フォームの10セクション');
  ok(await g.$eval('#m', e => e.textContent.includes('小便') && e.textContent.includes('回数/1日') && e.textContent.includes('窓口となる保護者氏名（ふりがな）') && e.textContent.includes('ホームページやインスタグラム等に写真・動画の掲載')), '保護者：フォーム見出し（小便・保護者・掲載）');
  ok(await g.$eval('#review', e => e.disabled), '保護者：同意するまで確認へ進めない');
  ok(await g.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), '保護者：横にはみ出さない（390px）');
  await g.screenshot({ path: OUT + 'guardian_1_top.png' });
  await g.click('#agree'); await g.click('#review');
  ok(await g.$eval('#e_name_kana', e => e.textContent.includes('児童名')), '保護者：児童名が空だとエラー');
  ok(await g.$eval('#pg_sum', e => e.hidden), '保護者：エラーのあいだは確認画面に進まない');
  await type(g, '#f_name_kana', '見本 太郎（みほん たろう）');
  await g.select('#f_birth_era', '西暦'); await type(g, '#f_birth_y', '2019'); await type(g, '#f_birth_m', '4'); await type(g, '#f_birth_d', '2');
  ok(await g.$eval('#f_birth_pv', e => e.textContent.includes('2019年4月2日')), '保護者：生年月日が西暦で確認できる');
  await g.click('input[name=f_allergy][value="有り"]');
  await type(g, '#f_allergy_detail', '卵');
  await g.click('input[name=f_convulsion][value="いいえ"]');
  await g.evaluate(() => document.getElementById('f_doc_insurance').scrollIntoView());
  ok(await g.$eval('#f_doc_insurance', e => e.type === 'text'), '保護者：保険証は文字のリンク欄');
  await g.click('#review'); await sleep(200);
  ok(await g.$eval('#pg_sum', e => !e.hidden && e.textContent.includes('見本 太郎') && e.textContent.includes('有り') && e.textContent.includes('卵')), '保護者：確認画面に入れた内容が出る');
  ok(await g.$eval('#pg_sum', e => e.textContent.includes('空欄')), '保護者：空欄の件数が分かる');
  await g.screenshot({ path: OUT + 'guardian_2_review.png' });
  await g.click('#send'); await sleep(300);
  ok(state.submits.length === 1 && state.submits[0].p_consent === true && state.submits[0].p_vals.name_kana.includes('見本') && state.submits[0].p_vals.birth === '2019-04-02' && state.submits[0].p_vals.allergy === '有り' && !state.submits[0].p_vals.doc_insurance, '保護者：送信は同意つき・写真は空なら送らない');
  ok(await g.$eval('#pg_sum', e => e.textContent.includes('送信しました')), '保護者：送信できた');
  await g.close();

  const demo = await mkPage(390, 844, false);
  await demo.goto(BASE + 'assess.html?demo=1&prefill=1', { waitUntil: 'networkidle0' });
  ok(await demo.$eval('#f_name_kana', e => e.value.includes('見本 太郎')), '見本：前回の児童名が入る');
  ok(await demo.$eval('#m', e => e.textContent.includes('送信しても、何も送られません')), '見本：送信しないと書いてある');
  await demo.screenshot({ path: OUT + 'guardian_3_demo.png' });
  await demo.close();

  state.subs = [{ id: 3, child: '新規 花子', status: 'pending', created_at: new Date().toISOString(), note: null, vals: VALS, applied: null, before: null }];
  const s = await mkPage(1280, 900, true);
  await s.goto(BASE + 'index.html#leo/assess', { waitUntil: 'networkidle0' });
  await s.waitForSelector('#af_child');
  ok(await s.$eval('h3', e => e.textContent.includes('アセスメント')), '職員：アセスメントの画面');
  ok(await s.$eval('.af', e => e.textContent.includes('まだ利用者情報にいない児童でも')), '職員：新規の児童でもリンクを作れる');
  ok(await s.$eval('.af', e => e.textContent.includes('新規 花子') && e.textContent.includes('確認待ち')), '職員：届いた入力が出る');
  await s.screenshot({ path: OUT + 'staff_1_list.png' });
  await type(s, '#af_child', '新規 花子');
  await s.click('button[onclick="afLink()"]');
  await sleep(300);
  ok(state.links.length === 1 && state.links[0].p_child === '新規 花子' && state.links[0].p_prefill === false, '職員：新規の名前でリンクを作る');
  await s.click('button[onclick="afOpen(3)"]');
  await sleep(400);
  ok(await s.$eval('h3', e => e.textContent.includes('新規 花子')), '職員：確認画面');
  ok(await s.$eval('.af', e => e.textContent.includes('アレルギーの有無') && e.textContent.includes('生活に対する願い') && e.textContent.includes('写真は、ここでは受け取りません')), '職員：フォームの項目と写真の注記');
  const checked = await s.$$eval('[data-afc]:checked', a => a.map(e => e.dataset.afc));
  ok(checked.includes('allergy') && checked.includes('name_kana') && checked.includes('wish_life'), '職員：入っている項目にチェック');
  await s.screenshot({ path: OUT + 'staff_2_review.png' });
  await s.click('button[onclick="afApply(false)"]');
  await sleep(400);
  ok(state.applies.length === 1 && state.applies[0].p_id === 3 && state.applies[0].p_vals.allergy === '有り' && state.applies[0].p_vals.birth === '2019-04-02' && !state.applies[0].p_vals.doc_insurance, '職員：チェックした項目だけ反映する');
  await s.close();

  const u = await mkPage(1100, 900, false);
  await u.goto(BASE + 'index.html?demo=1&role=事務#leo/userinfo', { waitUntil: 'networkidle0' });
  await sleep(400);
  await u.evaluate(() => uiOpen('児童A'));
  await sleep(300);
  await u.evaluate(() => uiTab('assess'));
  await sleep(400);
  ok(await u.$eval('#view', e => e.textContent.includes('■基本情報') && e.textContent.includes('児童名（ふりがな）') && e.textContent.includes('ひきつけ・痙攣をおこしたことがあるか') && e.textContent.includes('同意する場合')), '利用者情報：フォームの見出しで編集できる');
  ok(await u.$eval('[data-f="allergy"]', e => e.value === '有り'), '利用者情報：見本のアレルギーは有り');
  ok(await u.$eval('[data-f="name_kana"]', e => e.value.includes('児童A')), '利用者情報：児童名（ふりがな）がある');
  ok(!(await u.$('#view input[type=file]')), '利用者情報：写真アップロードはない');
  ok(await u.$eval('#view', e => !!e.querySelector('a[href="#leo/assess"]')), '利用者情報：保護者リンクへの案内');
  await u.screenshot({ path: OUT + 'userinfo_assess.png' });
  await u.click('button[onclick="uiSaveAssess()"]');
  await sleep(200);
  ok(await u.$eval('#ui_msg', e => e.textContent.includes('見本モードなので保存しません')), '利用者情報：見本では保存しない');
  await u.close();

  const tile = await mkPage(1100, 800, false);
  await tile.goto(BASE + 'index.html?demo=1#leo/g0', { waitUntil: 'networkidle0' });
  await sleep(300);
  ok(!!(await tile.$('a[href="#leo/assess"]')), 'タイル：アセスメントはポータル内');
  ok(!(await tile.$('a[href="gl:g5"]')), 'タイル：Google フォームへの直リンクはない');
  await tile.screenshot({ path: OUT + 'tile_assess.png' });
  await tile.close();

  await br.close();
  console.log(fails ? fails + ' failed' : 'all ok');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
