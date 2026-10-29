// 原本確認の画面テスト（架空データのみ・ローカルサーバーのみ）。Supabase への通信は、ここで全部差し替える。
// 使い方: リポジトリ直下で python3 -m http.server 8099 を動かしたまま
//   OUT=/tmp/jc/ node tools/jukyusha_check_ui_test.js    （puppeteer-core と /usr/bin/google-chrome が必要）
const puppeteer = require('puppeteer-core'), fs = require('fs');
const OUT = process.env.OUT || '/tmp/jc/', BASE = 'http://localhost:8099/', SB = 'https://zvrardoyxocmqhvyddnf.supabase.co';
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(...a); let fails = 0; const ok = (c, m) => { log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const br = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const st = { checks: [], posts: [], applies: [], dialogs: [], noTable: false, writes: [], failCheck: false, subs: [] };
  const KID = { name: 'テスト 太郎', jukyusha_no: '0123456780', city_no: '123456', kind: '放デイ', cap_monthly: 4600, contract_days: 20, contract_start: '2025-04-01', contract_end: '2026-03-31', mushouka: false };
  const INFO = { name: 'テスト 太郎', guardian_name: 'テスト 花子', transport_mode: '送迎あり', transport_days: [], soudan_office: 'テスト相談支援センター', soudan_person: 'テスト 相談員' };
  const VALS = { jukyusha_no: '0123456789', city_name: 'テスト市', guardian_name: 'テスト 花子', child_name: 'テスト 太郎', child_birth: '2019-04-02', issue_date: '2026-03-20', kind: '放デイ', contract_days: '20', period_from: '2026-04-01', period_to: '2027-03-31', cap_monthly: '4600', cap_mgmt: '非該当', mushouka: 'unknown', soudan_office: 'テスト相談支援センター', soudan_person: 'テスト 相談員' };
  const subOf = id => ({ id, child: 'テスト 太郎', status: 'pending', created_at: new Date().toISOString(), note: null, applied: null, before: null, consent_at: new Date().toISOString(), vals: VALS });
  const todayJ = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
  async function mkPage(w, h) {
    const p = await br.newPage(); await p.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    p.on('pageerror', e => { log('PAGEERROR', e.message); fails++; });
    p.on('dialog', async d => { st.dialogs.push(d.message()); await d.accept(); });
    await p.setRequestInterception(true);
    p.on('request', req => {
      const u = req.url(); if (!u.startsWith(SB)) return req.continue();
      const path = decodeURIComponent(u.slice(SB.length)), json = (b, s = 200) => req.respond({ status: s, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(b) });
      if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
      if (path.startsWith('/rest/v1/leo_jukyusha_checks')) {
        if (st.noTable) return json({ message: 'relation "public.leo_jukyusha_checks" does not exist' }, 404);
        if (req.method() === 'POST') { if (st.failCheck) return json({ message: 'new row violates row-level security policy' }, 403); const b = JSON.parse(req.postData()); st.posts.push(b[0]); st.checks.unshift({ id: 100 + st.posts.length, ...b[0], created_at: new Date().toISOString() }); return req.respond({ status: 201, headers: { 'access-control-allow-origin': '*' }, body: '' }); }
        st.lastGet = path; return json(st.checks);
      }
      if (req.method() === 'POST' && /^\/rest\/v1\/(leo_children|leo_child_info|leo_child_care)\?/.test(path)) { st.writes.push({ t: path.split('?')[0].split('/').pop(), b: JSON.parse(req.postData())[0] }); return req.respond({ status: 201, headers: { 'access-control-allow-origin': '*' }, body: '' }); }
      if (path.startsWith('/rest/v1/rpc/leo_jf_apply')) { const b = JSON.parse(req.postData()); st.applies.push(b); st.subs[0].status = 'applied'; st.subs[0].applied = b.p_vals; st.subs[0].before = { children: KID, info: INFO }; return json(b.p_vals); }
      if (path.startsWith('/rest/v1/staff_profiles?select=nikki_name')) return json([{ nikki_name: '山田 職員' }]);
      if (path.startsWith('/rest/v1/staff_profiles')) return json([{ duty: '児発管' }]);
      if (path.startsWith('/rest/v1/leo_jf_subs?id=eq.')) return json(st.subs.filter(s => s.id === +path.match(/id=eq\.(\d+)/)[1]));
      if (path.startsWith('/rest/v1/leo_jf_subs')) return json(st.subs);
      if (path.startsWith('/rest/v1/leo_children?select=name')) return json([{ name: KID.name }]);
      if (path.startsWith('/rest/v1/leo_children?name=eq.')) return json([KID]);
      if (path.startsWith('/rest/v1/leo_children')) return json([KID]);
      if (path.startsWith('/rest/v1/leo_child_info?name=eq.')) return json([INFO]);
      if (path.startsWith('/rest/v1/leo_child_info')) return json([INFO]);
      if (path.startsWith('/rest/v1/')) return json([]);
      return json({});
    });
    await p.evaluateOnNewDocument(() => localStorage.setItem('sess', JSON.stringify({ token: 'fake', refresh: 'fake', email: 'test@example.com', role: '事務', exp: Date.now() + 3600e3 })));
    return p;
  }
  const openKid = async p => { await p.goto(BASE + 'index.html#leo/userinfo', { waitUntil: 'networkidle0' }); await sleep(400); await p.evaluate(() => uiOpen('テスト 太郎')); await sleep(600); };
  const openJk = async p => { await openKid(p); await p.evaluate(() => uiTab('jukyusha')); await sleep(700); };
  const shot = (p, name, sel) => p.evaluate(s => document.querySelector(s).scrollIntoView({ block: 'start' }), sel).then(() => sleep(150)).then(() => p.screenshot({ path: OUT + name }));
  // ===== 利用者情報：記録がまだない =====
  let p = await mkPage(1100, 900); await openJk(p);
  ok(await p.$eval('#jc_box', e => e.textContent.includes('原本を確認した記録は、まだありません')), '利用者情報：記録がないときは「まだありません」と出る');
  ok(await p.$eval('#jc_by', e => e.value === '山田 職員') && await p.$eval('#jc_on', (e, t) => e.value === t, todayJ), '利用者情報：確認日は今日、確認した職員はログイン中の職員名が入っている');
  ok(await p.evaluate(() => document.querySelector('#jc_box').previousElementSibling.textContent.includes('受給者証（請求に使います）')), '利用者情報：受給者証の欄のすぐ下にある');
  await shot(p, 'userinfo_1_empty.png', '#jc_box');
  // 入力チェック
  await p.evaluate(() => { jc_by.value = ''; }); await p.evaluate(() => jcAdd()); ok((await p.$eval('#jc_msg', e => e.textContent)).includes('名前') && st.posts.length === 0, '利用者情報：職員名が空だと保存しない');
  await p.evaluate(() => { jc_by.value = '山田 職員'; jc_on.value = '2099-01-01'; }); await p.evaluate(() => jcAdd()); ok((await p.$eval('#jc_msg', e => e.textContent)).includes('今日まで') && st.posts.length === 0, '利用者情報：未来の日付は保存しない');
  // 追加
  await p.evaluate(() => { jc_on.value = '2026-10-20'; }); await p.type('#jc_note', '更新後の受給者証を保護者が持参');
  await shot(p, 'userinfo_2_form.png', '#jc_box'); st.dialogs.length = 0;
  await p.evaluate(() => jcAdd()); await sleep(900);
  ok(st.dialogs.length === 1 && st.dialogs[0].includes('テスト 太郎') && st.dialogs[0].includes('2026/10/20') && st.dialogs[0].includes('山田 職員') && st.dialogs[0].includes('直したり消したりできません'), '利用者情報：追加の前に、確認ダイアログ（日付・職員・直せない旨）が出る');
  ok(st.posts.length === 1 && JSON.stringify(st.posts[0]) === JSON.stringify({ child: 'テスト 太郎', checked_on: '2026-10-20', checked_by: '山田 職員', note: '更新後の受給者証を保護者が持参' }), '利用者情報：leo_jukyusha_checks に child/checked_on/checked_by/note を1件追加する');
  ok(await p.$eval('#jc_box', e => e.textContent.includes('最後に原本を確認したのは 2026/10/20（山田 職員）') && e.querySelectorAll('.jc-t tr').length === 2), '利用者情報：追加後に一覧へ出る');
  // 2件め（新しい順は並び替えの指定どおり：サーバーから order で来る。ここは画面が順番を変えないこと）
  st.checks.push({ id: 1, child: 'テスト 太郎', checked_on: '2025-04-12', checked_by: '職員Y', note: null, created_at: '2025-04-12T05:00:00Z' });
  await p.evaluate(() => renderLeoView('userinfo')); await sleep(600);
  ok(decodeURIComponent(st.lastGet).includes('order=checked_on.desc,id.desc') && decodeURIComponent(st.lastGet).includes('child=in.("テスト 太郎")'), '利用者情報：確認日の新しい順（order=checked_on.desc,id.desc）で、この児童の分だけ読む');
  await shot(p, 'userinfo_3_history.png', '#jc_box'); await p.screenshot({ path: OUT + 'userinfo_4_page_top.png', fullPage: false });
  await p.evaluate(() => scrollTo(0, 0)); await p.setViewport({ width: 1100, height: 1500, deviceScaleFactor: 1 }); await p.screenshot({ path: OUT + 'userinfo_5_full.png' });
  await p.close();
  // スマホ幅
  p = await mkPage(390, 844); await openJk(p); await shot(p, 'userinfo_6_phone.png', '#jc_box');
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), '利用者情報：スマホ幅（390px）で横にはみ出さない'); await p.close();
  // SQL 未実行
  st.noTable = true; p = await mkPage(1100, 900); await openJk(p);
  ok(await p.$eval('body', e => e.textContent.includes('supabase/leo_jukyusha_check.sql を実行すると出ます')) && !(await p.$('#jc_by')), '利用者情報：表がまだないときは案内だけ出て、他の欄は壊れない（受給者証の欄は出る）');
  ok(!!(await p.$('[data-f="jukyusha_no"]')), '利用者情報：「受給者証」タブに、受給者証の欄が出る'); await shot(p, 'userinfo_7_no_table.png', '#jc_box'); await p.close(); st.noTable = false;
  // ===== 「受給者証」タブ：基本とアセスメントの間／移した欄／保存 =====
  st.writes.length = 0; p = await mkPage(1100, 900); await openKid(p);
  const tabsTxt = await p.evaluate(() => [...document.querySelectorAll('#view p')].map(e => e.textContent).find(t => t.includes('基本') && t.includes('アセスメント')) || '');
  ok(/基本\s*受給者証\s*アセスメント.*個別支援計画/.test(tabsTxt), '受給者証タブ：「基本」と「アセスメント」の間にある（' + tabsTxt.trim() + '）');
  ok(!(await p.$('[data-f="jukyusha_no"]')) && !(await p.$('[data-f="soudan_office"]')) && !(await p.$('#jc_box')) && !!(await p.$('[data-f="transport_mode"]')), '基本タブ：受給者証・相談支援・原本確認は移った。送迎などは残っている');
  ok(await p.evaluate(() => /① 送迎/.test(document.body.textContent) && /② 保護者・連絡先/.test(document.body.textContent) && /③ Googleフォト・メモ/.test(document.body.textContent) && !/④/.test(document.body.textContent.slice(0, 4000))), '基本タブ：見出しの番号が ①送迎 ②保護者・連絡先 ③Googleフォト・メモ になっている');
  await p.type('[data-f="guardian_phone"]', '000-0000-0000'); await p.evaluate(() => uiSave()); await sleep(900);
  const bw = st.writes.find(w => w.t === 'leo_child_info');
  ok(st.writes.every(w => w.t !== 'leo_children') && bw && !('soudan_office' in bw.b) && !('soudan_person' in bw.b), '基本タブの保存：受給者証と相談支援は送らない（空で上書きしない）');
  await p.screenshot({ path: OUT + 'tab_1_basic.png' }); await p.close();
  st.writes.length = 0; p = await mkPage(1100, 900); await openJk(p);
  ok(await p.evaluate(() => ['jukyusha_no', 'city_no', 'contract_end', 'contract_days', 'kana', 'guardian_kana', 'kinyu_no', 'gensan', 'soudan_office', 'soudan_person'].every(f => document.querySelector(`[data-f="${f}"]`)) && !document.querySelector('[data-f="transport_mode"]')), '受給者証タブ：受給者証の全項目と相談支援の欄があり、送迎の欄はない');
  ok(await p.evaluate(() => { const h = [...document.querySelectorAll('.uic h4')].map(e => e.textContent); return h[0].startsWith('受給者証（請求') && h[1].startsWith('受給者証の原本の確認') && h[2] === '相談支援'; }), '受給者証タブ：受給者証 → 原本の確認 → 相談支援 の順');
  await p.evaluate(() => { const e = document.querySelector('[data-f="soudan_person"]'); e.value = 'テスト 新担当'; const c = document.querySelector('[data-f="contract_end"]'); c.value = '2027-03-31'; });
  await p.evaluate(() => uiSaveJk()); await sleep(900);
  const kw = st.writes.find(w => w.t === 'leo_children'), iw = st.writes.find(w => w.t === 'leo_child_info');
  ok(kw && kw.b.name === 'テスト 太郎' && kw.b.contract_end === '2027-03-31' && kw.b.jukyusha_no === '0123456780', '受給者証タブの保存：leo_children に受給者証の内容を送る');
  ok(iw && JSON.stringify(Object.keys(iw.b).sort()) === JSON.stringify(['name', 'soudan_office', 'soudan_person']) && iw.b.soudan_person === 'テスト 新担当' && !st.writes.some(w => w.t === 'leo_child_care'), '受給者証タブの保存：leo_child_info には相談支援の2列だけ（送迎・連絡先・メモ・送迎の配慮は触らない）');
  await p.screenshot({ path: OUT + 'tab_2_jukyusha_top.png' }); await p.setViewport({ width: 1100, height: 1700, deviceScaleFactor: 1 }); await p.evaluate(() => scrollTo(0, 0)); await sleep(200); await p.screenshot({ path: OUT + 'tab_3_jukyusha_full.png' }); await p.close();
  st.writes.length = 0; p = await mkPage(390, 844); await openJk(p); await p.screenshot({ path: OUT + 'tab_4_phone_top.png' });
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), '受給者証タブ：スマホ幅（390px）で横にはみ出さない'); await p.close();
  // 新しい児童の追加では、受給者証と相談支援の欄を今までどおり出す
  p = await mkPage(1100, 900); await p.goto(BASE + 'index.html#leo/userinfo', { waitUntil: 'networkidle0' }); await sleep(300); await p.evaluate(() => uiAdd()); await sleep(500);
  ok(!!(await p.$('[data-f="jukyusha_no"]')) && !!(await p.$('[data-f="soudan_office"]')) && !(await p.$('#jc_box')), '児童を追加する画面：受給者証と相談支援の欄は今までどおり出る'); await p.close();
  // ===== 職員の確認画面：原本も確認した =====
  st.subs = [subOf(21)]; st.posts.length = 0; st.checks.length = 0; st.dialogs.length = 0;
  p = await mkPage(1280, 1000); await p.goto(BASE + 'index.html#leo/jukyusha', { waitUntil: 'networkidle0' }); await p.waitForSelector('.jf-card');
  await p.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent.includes('確認する')).click()); await p.waitForSelector('.jf-f');
  ok(await p.$eval('#jf_orig', e => !e.checked) && await p.$eval('#jf_orig_w', e => e.hidden), '職員：「原本も確認した」は最初チェックなし・職員名の欄は隠れている');
  await p.click('#jf_orig'); await sleep(100);
  ok(await p.$eval('#jf_orig_w', e => !e.hidden) && await p.$eval('#jf_orig_by', e => e.value === '山田 職員'), '職員：チェックすると、確認した職員の欄が出て、ログイン中の職員名が入る');
  await p.setViewport({ width: 1280, height: 1400, deviceScaleFactor: 1 }); await p.evaluate(() => scrollTo(0, document.body.scrollHeight)); await sleep(200); await p.screenshot({ path: OUT + 'review_1_checkbox.png' });
  await p.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent.includes('確認して反映')).click()); await sleep(1200);
  ok(st.dialogs.some(m => m.includes('受給者証の原本の確認も記録します') && m.includes(todayJ.replace(/-/g, '/')) && m.includes('山田 職員')), '職員：確認ダイアログに「原本の確認も記録します（日付・職員）」が出る');
  ok(st.applies.length === 1 && !('checked_by' in st.applies[0].p_vals) && !JSON.stringify(st.applies[0]).includes('原本'), '職員：leo_jf_apply に送る内容は今までと同じ（原本の確認は含めない）');
  ok(st.posts.length === 1 && st.posts[0].child === 'テスト 太郎' && st.posts[0].checked_on === todayJ && st.posts[0].checked_by === '山田 職員' && st.posts[0].note.includes('保護者'), '職員：反映のあとに、原本確認の記録を1件追加する（今日・職員名・メモ）');
  ok(await p.$eval('#jf_msg', e => e.textContent.includes('反映しました。受給者証の原本の確認も記録しました。')), '職員：「反映しました。受給者証の原本の確認も記録しました。」と出る');
  await p.evaluate(() => scrollTo(0, document.body.scrollHeight)); await p.screenshot({ path: OUT + 'review_2_done.png' }); await p.close();
  // チェックなし → 記録しない
  st.subs = [subOf(22)]; st.posts.length = 0; st.applies.length = 0; st.dialogs.length = 0;
  p = await mkPage(1280, 1000); await p.goto(BASE + 'index.html#leo/jukyusha', { waitUntil: 'networkidle0' }); await p.waitForSelector('.jf-card');
  await p.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent.includes('確認する')).click()); await p.waitForSelector('.jf-f');
  await p.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent.includes('確認して反映')).click()); await sleep(1200);
  ok(st.applies.length === 1 && st.posts.length === 0 && !st.dialogs.some(m => m.includes('原本の確認も記録')), '職員：チェックなしなら、今までどおり（記録は足さない）'); await p.close();
  // 職員名が空 → 反映しない
  st.subs = [subOf(23)]; st.applies.length = 0; st.dialogs.length = 0;
  p = await mkPage(1280, 1000); await p.goto(BASE + 'index.html#leo/jukyusha', { waitUntil: 'networkidle0' }); await p.waitForSelector('.jf-card');
  await p.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent.includes('確認する')).click()); await p.waitForSelector('.jf-f');
  await p.click('#jf_orig'); await p.evaluate(() => { jf_orig_by.value = ''; });
  await p.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent.includes('確認して反映')).click()); await sleep(500);
  ok(st.applies.length === 0 && (await p.$eval('#jf_msg', e => e.textContent)).includes('確認した職員の名前'), '職員：「原本も確認した」で職員名が空なら、反映せず理由を出す'); await p.close();
  // 記録の追加だけ失敗（表がない・権限など）→ 反映は残り、案内が出る
  st.subs = [subOf(24)]; st.applies.length = 0; st.failCheck = true;
  p = await mkPage(1280, 1000); await p.goto(BASE + 'index.html#leo/jukyusha', { waitUntil: 'networkidle0' }); await p.waitForSelector('.jf-card');
  await p.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent.includes('確認する')).click()); await p.waitForSelector('.jf-f');
  await p.click('#jf_orig'); await p.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent.includes('確認して反映')).click()); await sleep(1300);
  const em = await p.$eval('#jf_msg', e => e.textContent); log('msg:', em);
  ok(st.applies.length === 1 && em.includes('反映しました。') && em.includes('原本の確認は記録できませんでした') && em.includes('利用者情報の児童ページ'), '職員：記録だけ失敗しても、反映は取り消さず、利用者情報から記録するよう案内する'); await p.close(); st.failCheck = false;
  await br.close(); log(fails ? 'FAILED ' + fails : 'ALL OK'); process.exit(fails ? 1 : 0);
})();
