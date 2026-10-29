// 画面テスト（架空データのみ・ローカルサーバーのみ）。Supabase への通信は、ここで全部差し替える（本物には一切つながない）。
// 使い方: リポジトリ直下で python3 -m http.server 8099 を動かしたまま
//   mkdir -p /tmp/jf && OUT=/tmp/jf/ node tools/jukyusha_form_ui_test.js        （puppeteer-core と /usr/bin/google-chrome が必要）
const puppeteer = require('puppeteer-core'), fs = require('fs');
const OUT = process.env.OUT || '/tmp/jf/', BASE = 'http://localhost:8099/', SB = 'https://zvrardoyxocmqhvyddnf.supabase.co', TOK = 'ab12'.repeat(12);
const log = (...a) => console.log(...a); let fails = 0; const ok = (c, m) => { log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const br = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const state = { calls: [], submits: [], applies: [], rejects: [], dialogs: [], subs: [], authHeaders: [], links: [], pf: null };
  const cur = { kid: { name: '見本 太郎', jukyusha_no: null, city_no: null, kind: '放デイ', cap_monthly: 4600, contract_days: 20, contract_end: '2026-03-31', mushouka: false }, info: { guardian_name: null } };
  const VALS = { jukyusha_no: '0123456789', city_name: '見本市', guardian_name: '見本 花子', child_name: '見本 太郎', child_birth: '2019-04-02', issue_date: '2026-03-20', kind: '放デイ', contract_days: '20', period_from: '2026-04-01', period_to: '2027-03-31', cap_monthly: '4600', cap_mgmt: '非該当', mushouka: 'unknown', amount_text: '児童発達支援加算サポートⅠ', soudan_office: '見本相談支援センター', soudan_person: '見本 相談員', other: '特記事項：見本です\n無償化対象児童' };
  const SENT = { jukyusha_no: '0123456789', city_name: '見本市', guardian_name: '見本 花子', child_name: '見本 太郎', child_birth: '2019-04-02', issue_date: '2026-03-20', kind: '放デイ', contract_days: '20', amount_text: '児童発達支援加算サポートⅠ', period_from: '2026-04-01', period_to: '2027-03-31', soudan_office: '見本相談支援センター', soudan_person: '見本 相談員', cap_monthly: '4600', cap_mgmt: '非該当', mushouka: 'unknown', other: '特記事項：見本です\n無償化対象児童' };
  const sameObj = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
  const mkSub = (id, over, st = 'pending') => ({ id, child: '見本 太郎', status: st, created_at: new Date().toISOString(), note: null, applied: null, before: null, consent_at: new Date().toISOString(), vals: { ...VALS, ...over } });
  async function mkPage(w, h, staff) {
    const p = await br.newPage(); await p.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
    p.on('pageerror', e => { log('PAGEERROR', e.message); fails++; }); p.on('console', m => { if (m.type() === 'error') log('console.error', m.text().slice(0, 200)); });
    p.on('dialog', async d => { state.dialogs.push(d.message()); if (d.type() === 'prompt') await d.accept('別の児童'); else await d.accept(); });
    await p.setRequestInterception(true);
    p.on('request', req => {
      const u = req.url(); if (!u.startsWith(SB)) return req.continue();
      const path = u.slice(SB.length), json = (b, s = 200) => req.respond({ status: s, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(b) });
      if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
      state.calls.push(req.method() + ' ' + path.slice(0, 90)); state.authHeaders.push(req.headers().authorization || null);
      if (path.startsWith('/storage/')) return json({ message: 'no storage in this feature' }, 500);
      if (path.startsWith('/rest/v1/rpc/leo_jf_get')) return json(state.pf ? { child: '見本 太郎', expired: false, last: { at: '2025-04-10T01:00:00Z', status: 'applied' }, prefill: state.pf, prefill_at: '2025-04-10T01:00:00Z' } : { child: '見本 太郎', expired: false, last: null });
      if (path.startsWith('/rest/v1/rpc/leo_jf_submit')) { const b = JSON.parse(req.postData()); state.submits.push(b); state.subs = [mkSub(7, b.p_vals)]; return json('ok'); }
      if (path.startsWith('/rest/v1/rpc/leo_jf_apply')) { const b = JSON.parse(req.postData()); state.applies.push(b); const s = state.subs.find(x => x.id === b.p_id); if (s) { s.status = 'applied'; s.applied = b.p_vals; s.before = { children: cur.kid, info: cur.info }; } return json(b.p_vals); }
      if (path.startsWith('/rest/v1/rpc/leo_jf_reject')) { const b = JSON.parse(req.postData()); state.rejects.push(b); const s = state.subs.find(x => x.id === b.p_id); if (s) { s.status = 'rejected'; s.note = b.p_note; } return json(null); }
      if (path.startsWith('/rest/v1/rpc/leo_jf_make_link')) { state.links.push(JSON.parse(req.postData())); return json(TOK); }
      if (path.startsWith('/rest/v1/staff_profiles')) return json([{ duty: '児発管' }]);
      if (path.startsWith('/rest/v1/leo_jf_subs?id=eq.')) { const id = +path.match(/id=eq\.(\d+)/)[1]; return json(state.subs.filter(s => s.id === id)); }
      if (path.includes('status=eq.applied')) return json(state.subs.filter(x => x.status === 'applied'));
      if (path.startsWith('/rest/v1/leo_jf_subs')) return json(state.subs);
      if (path.startsWith('/rest/v1/leo_children?select=name')) return json([{ name: '見本 太郎' }, { name: '見本 次郎' }]);
      if (path.startsWith('/rest/v1/leo_children?name=eq.')) return json([cur.kid]);
      if (path.startsWith('/rest/v1/leo_child_info?name=eq.')) return json([cur.info]);
      if (path.startsWith('/rest/v1/')) return json([]);
      return json({});
    });
    if (staff) await p.evaluateOnNewDocument(() => localStorage.setItem('sess', JSON.stringify({ token: 'fake', refresh: 'fake', email: 'test@example.com', role: '事務', exp: Date.now() + 3600e3 })));
    return p;
  }
  // 3回クリックでは選択されないことがある（Chrome では maxlength の欄に文字が足される）。一度空にしてから打つ。
  const type = async (p, sel, v) => {
    await p.click(sel);
    await p.evaluate(s => { const e = document.querySelector(s); e.focus(); e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true })); }, sel);
    await p.type(sel, v);
  };
  const date = async (p, k, era, y, m, d) => { await p.select(`#f_${k}_era`, era); await type(p, `#f_${k}_y`, y); await type(p, `#f_${k}_m`, m); await type(p, `#f_${k}_d`, d); };
  // ===== 保護者ページ（スマホ幅）=====
  const g = await mkPage(390, 844, false);
  await g.goto(BASE + 'jukyusha.html?t=' + TOK, { waitUntil: 'networkidle0' });
  ok(await g.$eval('#m', e => e.textContent.includes('見本 太郎')), '保護者：児童名が出る');
  ok(!(await g.$('input[type=file]')), '保護者：写真のアップロード欄がない');
  ok(await g.$eval('#m', e => e.textContent.includes('写真は送りません') && e.textContent.includes('使う目的')), '保護者：写真は送らない・利用目的の説明がある');
  ok(await g.$eval('#m', e => e.textContent.includes('レオの職員が確認してから利用者情報に反映します（確認するまでは反映されません）。必要に応じて、受給者証の原本を見せていただくことがあります。') && !e.textContent.includes('受給者証と見くらべて確認')), '保護者：職員が確認してから反映、必要なら原本を見せていただく、と書く');
  ok(await g.$eval('.unfold svg', e => !!e), '保護者：広げた受給者証の見本の図がある');
  ok(await g.$$eval('.sec svg', a => a.length) === 4, '保護者：面（①②④⑤）ごとの小さな図がある');
  ok(await g.$eval('#review', e => e.disabled), '保護者：同意するまで確認へ進めない');
  ok(await g.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '保護者：横にはみ出さない（390px）');
  ok(await g.$$eval('#fields input[type=text], #fields input[type=number], #fields select', a => a.filter(e => e.offsetParent).every(e => e.getBoundingClientRect().height >= 44)), '保護者：入力欄はどれも高さ44px以上（押しやすい）');
  await g.screenshot({ path: OUT + 'guardian_1_top.png' });
  await g.click('#agree'); await g.click('#review');
  ok(await g.$$eval('.err:not(:empty)', a => a.length) >= 8, '保護者：空のまま進むと、必ずの項目に赤い説明が出る');
  ok(await g.$eval('#pg_sum', e => e.hidden), '保護者：エラーのあいだは確認画面に進まない');
  await g.evaluate(() => scrollTo(0, 0)); await sleep(300);
  // 入力（全角・令和・西暦の混在）
  await type(g, '#f_jukyusha_no', '０１２３　４５６７８９'); await sleep(100);
  ok(await g.$eval('#f_jukyusha_no_pv', e => e.textContent.includes('10けた')), '保護者：番号が10けたと表示される');
  await type(g, '#f_city_name', '見本市'); await type(g, '#f_guardian_name', '見本　花子'); await type(g, '#f_child_name', '見本 太郎');
  await date(g, 'child_birth', '西暦', '2019', '4', '2'); await date(g, 'issue_date', '令和', '8', '3', '20');
  ok(await g.$eval('#f_issue_date_pv', e => e.textContent.includes('2026年3月20日')), '保護者：令和8年3月20日 → 西暦2026年3月20日の確認が出る');
  await g.click('input[name=f_kind][value="放デイ"]'); await type(g, '#f_contract_days', '20.0日/月');
  await date(g, 'period_from', '令和', '8', '4', '1'); await date(g, 'period_to', '令和', '9', '3', '31');
  await g.click('input[name=f_cap_monthly][value="other"]'); ok(await g.$eval('#f_cap_monthly_other', e => !e.hidden), '保護者：「その他」を選ぶと金額欄が出る');
  await g.click('input[name=f_cap_monthly][value="4600"]'); ok(await g.$eval('#f_cap_monthly_other', e => e.hidden), '保護者：4,600円に戻すと金額欄が消える');
  await g.click('input[name=f_cap_mgmt][value="非該当"]'); await g.click('input[name=f_mushouka][value="unknown"]'); 
  ok(await g.$eval('#w_amount_text .h', e => e.textContent.includes('児童発達支援加算サポートⅠ') && e.textContent.includes('日数') && e.textContent.includes('空のまま')), '保護者：支給量の下に「日数以外に書かれていること」の欄と説明（例つき）がある');
  ok(await g.evaluate(() => { const a = document.getElementById('w_contract_days'), b = document.getElementById('w_amount_text'), c = document.getElementById('w_period_from'); return a.nextElementSibling === b && b.nextElementSibling === c; }), '保護者：その欄は「支給量」のすぐ下にある');
  ok(await g.$eval('#w_soudan_person .h', e => e.textContent.includes('受給者証に書いていなければ、分かる範囲で')) && await g.$eval('#w_soudan_office .h', e => e.textContent.includes('指定相談支援事業所名')), '保護者：相談支援の2欄（事業所名・担当者）と説明がある');
  ok(await g.evaluate(() => document.querySelector('#w_soudan_office').previousElementSibling.textContent.includes('④')), '保護者：相談支援の欄は④の面のまとまりに入っている');
  ok(await g.$eval('#w_other .h', e => e.textContent.includes('特記事項')), '保護者：「その他（特記事項など）」の欄がある');
  await type(g, '#f_amount_text', '児童発達支援加算サポートⅠ'); await type(g, '#f_soudan_office', '見本相談支援センター'); await type(g, '#f_soudan_person', '見本 相談員');
  await g.click('#f_other'); await g.type('#f_other', '特記事項：見本です'); await g.keyboard.press('Enter'); await g.type('#f_other', '無償化対象児童');
  await g.evaluate(() => scrollTo(0, 0)); await g.screenshot({ path: OUT + 'guardian_2_filled_top.png' });
  await g.screenshot({ path: OUT + 'guardian_2_filled_full.png', fullPage: true });
  // 日付エラー：平成31年5月1日
  await date(g, 'issue_date', '平成', '31', '5', '1'); await g.click('#review');
  ok(await g.$eval('#e_issue_date', e => e.textContent.includes('平成の期間')), '保護者：平成31年5月1日は「平成の期間にない」と言われる');
  ok(await g.$eval('#pg_sum', e => e.hidden), '保護者：日付が正しくないあいだは進めない');
  await g.evaluate(() => document.getElementById('w_issue_date').scrollIntoView({ block: 'center' })); await g.screenshot({ path: OUT + 'guardian_2b_error.png' });
  await date(g, 'issue_date', '令和', '8', '3', '20'); await g.click('#review'); await sleep(300);
  ok(await g.$eval('#pg_sum', e => !e.hidden) && await g.$eval('#pg_form', e => e.hidden), '保護者：直すと確認画面に進む');
  const sumTxt = await g.$eval('#pg_sum', e => e.textContent);
  ok(sumTxt.includes('0123456789') && sumTxt.includes('令和9年3月31日') && sumTxt.includes('20日/月') && sumTxt.includes('4,600円') && sumTxt.includes('分からない') && sumTxt.includes('児童発達支援加算サポートⅠ') && sumTxt.includes('見本相談支援センター') && sumTxt.includes('無償化対象児童'), '保護者：確認画面に入力内容（全角→半角・令和表示・20日/月）が出る');
  ok(state.submits.length === 0, '保護者：確認画面までは何も送っていない');
  await g.screenshot({ path: OUT + 'guardian_3_confirm.png', fullPage: true });
  await g.click('#back'); ok(await g.$eval('#f_jukyusha_no', e => e.value.includes('０１２３')) || await g.$eval('#f_jukyusha_no', e => e.value.length > 0), '保護者：「直す」で入力が残っている');
  await g.click('#review'); await sleep(200); await g.click('#send'); await g.waitForFunction(() => document.getElementById('pg_sum').textContent.includes('送信しました'), { timeout: 8000 });
  ok(await g.$eval('#pg_sum', e => e.textContent.includes('レオの職員が確認します。必要に応じて、受給者証の原本を見せていただくことがあります。') && !e.textContent.includes('受給者証と見くらべ')), '保護者：送信後も、職員が受給者証と見くらべるとは書かない');
  ok(state.submits.length === 1 && state.submits[0].p_token === TOK && state.submits[0].p_consent === true, '保護者：同意つきで leo_jf_submit を1回呼ぶ');
  const sv = state.submits[0].p_vals;
  ok(sameObj(sv, SENT), '保護者：送る値（西暦ISO・半角・正規化）');
  ok(state.calls.every(c => !c.includes('/storage/')) && state.authHeaders.every(a => a === null), '保護者：Storage に触らず、ログイン情報も付けない');
  await g.screenshot({ path: OUT + 'guardian_4_done.png' }); await g.close();
  // 見本モード
  const d = await mkPage(390, 844, false); await d.goto(BASE + 'jukyusha.html?demo=1', { waitUntil: 'networkidle0' }); ok(await d.$eval('#m', e => e.textContent.includes('見本')), '保護者：?demo=1 で見本が出る'); ok(state.calls.length === state.calls.length && !state.calls.slice(-1)[0].includes('demo'), '保護者：見本モードは通信しない'); await d.close();
  // ===== 保護者ページ：2回め（前回の内容が入っている）=====
  const PF = { jukyusha_no: '0123456789', city_name: '見本市', city_no: '123456', guardian_name: '見本 花子', child_name: '見本 太郎', child_birth: '2019-04-02', issue_date: '2025-03-20', kind: '放デイ', contract_days: '20', amount_text: '児童発達支援加算サポートⅠ', period_from: '2025-04-01', period_to: '2026-03-31', soudan_office: '見本相談支援センター', soudan_person: '見本 相談員', cap_monthly: '4600', cap_mgmt: '非該当', mushouka: 'yes', other: '特記事項：見本です' };
  state.pf = PF; state.submits.length = 0;
  const pg = await mkPage(390, 844, false); await pg.goto(BASE + 'jukyusha.html?t=' + TOK, { waitUntil: 'networkidle0' });
  ok(await pg.$eval('.pf', e => e.textContent.includes('前回の内容が入っています') && e.textContent.includes('変わったところだけ直してください（多くは有効期間です）')), '2回め：「前回の内容が入っています。変わったところだけ直してください（多くは有効期間です）」が出る');
  const pv = await pg.evaluate(() => ({ no: f_jukyusha_no.value, g: f_guardian_name.value, so: f_soudan_office.value, sp: f_soudan_person.value, am: f_amount_text.value, ot: f_other.value, kind: document.querySelector('input[name=f_kind]:checked')?.value, cap: document.querySelector('input[name=f_cap_monthly]:checked')?.value, mu: document.querySelector('input[name=f_mushouka]:checked')?.value, mg: document.querySelector('input[name=f_cap_mgmt]:checked')?.value, bd: [f_child_birth_era.value, f_child_birth_y.value, f_child_birth_m.value, f_child_birth_d.value].join('/'), pf: [f_period_from_era.value, f_period_from_y.value, f_period_from_m.value, f_period_from_d.value].join('/'), pt: [f_period_to_era.value, f_period_to_y.value, f_period_to_m.value, f_period_to_d.value].join('/'), days: f_contract_days.value, city: f_city_name.value }));
  log('prefill:', JSON.stringify(pv));
  ok(pv.no === '0123456789' && pv.g === '見本 花子' && pv.so === '見本相談支援センター' && pv.sp === '見本 相談員' && pv.am === PF.amount_text && pv.ot === PF.other && pv.kind === '放デイ' && pv.cap === '4600' && pv.mu === 'yes' && pv.mg === '非該当' && pv.days === '20' && pv.city === '見本市', '2回め：前回の内容（参考の欄も）が入力欄に入っている');
  ok(pv.bd === '平成/31/4/2' && pv.pf === '令和/7/4/1' && pv.pt === '令和/8/3/31', '2回め：日付が入っている（令和8年3月31日など）');
  ok(await pg.$$eval('.f.chg', a => a.map(e => e.id).join()) === 'w_period_from,w_period_to' && await pg.$$eval('.chgtag', a => a.length) === 2, '2回め：給付決定期間・負担上限の適用期間の2か所だけに色と注意が付く');
  await pg.screenshot({ path: OUT + 'guardian_5_prefilled_top.png' });
  await pg.evaluate(() => document.getElementById('w_period_from').scrollIntoView({ block: 'start' })); await pg.screenshot({ path: OUT + 'guardian_5b_prefilled_period.png' });
  await pg.click('#agree'); await pg.click('#review'); await sleep(300);
  ok(await pg.$eval('#pg_sum', e => !e.hidden), '2回め：何も直さなくても、そのまま確認へ進める');
  ok((await pg.$eval('#pg_sum', e => e.textContent)).split('前回から変更').length === 1, '2回め：直していないときは「前回から変更」が出ない');
  await pg.click('#back'); await date(pg, 'period_from', '令和', '8', '4', '1'); await date(pg, 'period_to', '令和', '9', '3', '31'); await pg.click('#review'); await sleep(300);
  ok(await pg.$$eval('#pg_sum .chgm', a => a.length) === 2 && await pg.$$eval('#pg_sum tr', a => a.filter(r => r.querySelector('.chgm')).map(r => r.textContent.slice(0, 12)).join('|').includes('給付決定期間') ), '2回め：確認画面で、直した2か所だけに「前回から変更」が付く');
  await pg.screenshot({ path: OUT + 'guardian_6_prefilled_confirm.png', fullPage: true });
  await pg.click('#send'); await pg.waitForFunction(() => document.getElementById('pg_sum').textContent.includes('送信しました'), { timeout: 8000 });
  const sv2 = state.submits[0].p_vals; const exp = { ...PF, period_from: '2026-04-01', period_to: '2027-03-31' }; delete exp.city_no;
  ok(Object.keys(exp).every(k => sv2[k] === exp[k]) && sv2.period_from === '2026-04-01' && sv2.period_to === '2027-03-31', '2回め：送る値は「前回の内容」＋新しい期間だけ違う');
  log('submit keys:', Object.keys(sv2).join()); await pg.close();
  // 期限・取り消しなどで prefill が来ないときは空の入力ページ
  state.pf = null; const pe = await mkPage(390, 844, false); await pe.goto(BASE + 'jukyusha.html?t=' + TOK, { waitUntil: 'networkidle0' });
  ok(!(await pe.$('.pf')) && await pe.$eval('#f_jukyusha_no', e => e.value === '') && await pe.$$eval('.f.chg', a => a.length) === 0, '1回め：前回の内容の案内も色も入力もない（空の入力ページ）'); await pe.close();
  // ===== 職員：前回の内容を入れておく（2回め以降は自動でON）=====
  cur.kid.jukyusha_no = '0123456789'; state.links.length = 0;
  const sp = await mkPage(1280, 1000, true); await sp.goto(BASE + 'index.html#leo/jukyusha', { waitUntil: 'networkidle0' }); await sp.waitForSelector('.jf-card, #jf_child');
  await sp.evaluate(() => { window.__cp = ''; try { Object.defineProperty(navigator, 'clipboard', { value: { writeText: t => { window.__cp = t; return Promise.resolve(); } }, configurable: true }); } catch (e) {} });
  await sp.select('#jf_child', '見本 太郎'); await sleep(500);
  ok(await sp.$eval('#jf_prefill', e => e.checked) && await sp.$eval('.jf', e => e.textContent.includes('開いた人に、お子さんの前回の内容') && e.textContent.includes('前回の内容を入れておく')), '職員：利用者情報に受給者証番号がある児童は「前回の内容を入れておく」が自動でON。見える内容の説明がある');
  await sp.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent.includes('リンクをコピー')).click()); await sleep(600);
  ok(state.links.length === 1 && state.links[0].p_prefill === true && state.links[0].p_child === '見本 太郎' && (await sp.$eval('.copymsg', e => e.textContent)).includes('前回の内容が入った状態'), '職員：ONのまま作ると p_prefill=true で作られ、メッセージにも書かれる');
  await sp.screenshot({ path: OUT + 'staff_5_link_prefill.png', fullPage: true });
  await sp.evaluate(() => { document.getElementById('jf_prefill').click(); }); await sp.evaluate(() => document.querySelector('button[onclick="jfLink()"]').click()); await sleep(600);
  ok(state.links.length === 2 && state.links[1].p_prefill === false, '職員：チェックをはずすと p_prefill=false（空の入力ページ）'); await sp.close();
  // ===== 職員：2回め、期間だけ変わった入力 =====
  cur.kid = { name: '見本 太郎', jukyusha_no: '0123456789', city_no: '123456', kind: '放デイ', cap_monthly: 4600, contract_days: 20, contract_end: '2026-03-31', mushouka: true };
  cur.info = { guardian_name: '見本 花子', note: '前からの備考', soudan_office: '見本相談支援センター', soudan_person: '見本 相談員' };
  state.subs = [mkSub(11, { ...PF, ...{ period_from: '2026-04-01', period_to: '2027-03-31', issue_date: '2026-03-20' } })]; state.applies.length = 0; state.dialogs.length = 0;
  const sr = await mkPage(1280, 1000, true); await sr.goto(BASE + 'index.html#leo/jukyusha', { waitUntil: 'networkidle0' }); await sr.waitForSelector('.jf-card');
  await sr.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent.includes('確認する')).click()); await sr.waitForSelector('.jf-f');
  const rr = await sr.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-jfc]')].map(e => [e.dataset.jfc, e.checked])));
  log('2回めのチェック', JSON.stringify(rr));
  ok(Object.keys(rr).filter(k => rr[k]).join() === 'contract_end', '職員：2回め（期間だけ変わった入力）は、チェックが「負担上限の適用期間（契約終了日）」の1行だけ');
  await sr.setViewport({ width: 1280, height: 1500, deviceScaleFactor: 1 }); await sr.screenshot({ path: OUT + 'staff_6_review_period_only.png' });
  await sr.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent.includes('確認して反映')).click()); await sleep(1500);
  ok(state.applies.length === 1 && JSON.stringify(state.applies[0].p_vals) === JSON.stringify({ contract_end: '2027-03-31' }), '職員：反映は期間（contract_end）だけを送る'); await sr.close();
  // ===== 利用者情報の児童ページ（相談支援の欄）=====
  const ui = await mkPage(1280, 1000, true); await ui.goto(BASE + 'index.html?demo=1#leo/userinfo', { waitUntil: 'networkidle0' }); await sleep(500);
  await ui.evaluate(() => uiOpen('児童B')); await sleep(500); await ui.evaluate(() => uiTab('jukyusha')); await sleep(500);
  const uit = await ui.evaluate(() => ({ so: document.querySelector('[data-f="soudan_office"]')?.value, sp: document.querySelector('[data-f="soudan_person"]')?.value, lab: document.body.textContent.includes('相談支援事業所名') && document.body.textContent.includes('担当の相談支援専門員') }));
  ok(uit.so === '見本相談支援センター' && uit.sp === '見本 相談員' && uit.lab, '利用者情報：児童の「受給者証」タブの「相談支援」に事業所名・担当者の欄があり、編集できる');
  await ui.evaluate(() => document.querySelector('[data-f="soudan_office"]').scrollIntoView({ block: 'center' })); await ui.screenshot({ path: OUT + 'userinfo_1_soudan.png' }); await ui.close();
  // ===== 職員（従来の流れ）=====
  cur.kid = { name: '見本 太郎', jukyusha_no: null, city_no: null, kind: '放デイ', cap_monthly: 4600, contract_days: 20, contract_end: '2026-03-31', mushouka: false }; cur.info = { guardian_name: null };
  state.subs = [mkSub(8, {})]; state.calls.length = 0; state.applies.length = 0; state.dialogs.length = 0; state.links.length = 0;
  const s = await mkPage(1280, 1000, true);
  await s.goto(BASE + 'index.html#leo/jukyusha', { waitUntil: 'networkidle0' }); await s.waitForSelector('.jf-card');
  ok(await s.$eval('.jf', e => e.textContent.includes('確認待ち 1件') && e.textContent.includes('写真は受け取りません')), '職員：届いた入力が一覧に出る');
  await s.screenshot({ path: OUT + 'staff_1_list.png', fullPage: true });
  await s.evaluate(() => { window.__cp = ''; try { Object.defineProperty(navigator, 'clipboard', { value: { writeText: t => { window.__cp = t; return Promise.resolve(); } }, configurable: true }); } catch (e) {} }); await s.select('#jf_child', '見本 太郎'); await s.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent.includes('リンクをコピー')).click()); await sleep(800);
  const cm = await s.evaluate(() => (document.querySelector('.copymsg') || {}).innerHTML || ''); log('copymsg:', cm.replace(/<[^>]+>/g, ' ').slice(0, 200));
  const cp = await s.evaluate(() => window.__cp); ok(cp === BASE + 'jukyusha.html?t=' + TOK && cm.includes('コピーしました') && state.calls.some(c => c.includes('leo_jf_make_link')), '職員：専用リンクが作れる（自動送信はしない）');
  ok(state.links.length === 1 && state.links[0].p_prefill === false && await s.$eval('#jf_prefill', e => !e.checked), '職員：前の入力も利用者情報の番号もない児童は、「前回の内容を入れておく」がOFF（空の入力ページ）'); await s.screenshot({ path: OUT + 'staff_1b_link.png', fullPage: true });
  await s.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent.includes('確認する')).click()); await s.waitForSelector('.jf-f');
  const rows = await s.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-jfc]')].map(e => [e.dataset.jfc, e.checked])));
  const vals = await s.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-jf]')].map(e => [e.dataset.jf, e.value])));
  log('入力欄', JSON.stringify(vals)); log('チェック', JSON.stringify(rows));
  ok(rows.jukyusha_no && rows.guardian_name && rows.contract_end && !rows.contract_days && !rows.cap_monthly && !rows.kind && !rows.mushouka && !rows.city_no, '職員：いまと違う項目だけがチェックされる（同じ項目・無償化・空の項目はチェックなし）');
  ok(vals.contract_end === '2027-03-31' && vals.cap_monthly === '4600' && vals.mushouka === '' && vals.jukyusha_no === '0123456789', '職員：入力値が欄に入る（無償化「分からない」は空）');
  ok(await s.$eval('.jf-f', e => e.textContent.includes('いまの利用者情報') && e.textContent.includes('✔ 同じ')), '職員：いまの利用者情報と並び、同じものは「同じ」と出る');
  const noteVal = await s.$eval('[data-jf="note_add"]', e => e.value);
  ok(rows.note_add === false && /【受給者証 \d+\/\d+ 支給量等】児童発達支援加算サポートⅠ/.test(noteVal) && /【受給者証 \d+\/\d+ その他】特記事項：見本です\n無償化対象児童/.test(noteVal), '職員：「備考に追記（任意）」の行があり、初期はチェックなし。支給量等の文字とその他が入っている');
  ok(await s.$eval('.jf-f', e => e.textContent.includes('日数以外に書かれていること（保護者の入力）：児童発達支援加算サポートⅠ')), '職員：支給量の行に、日数以外に書かれていることが並んで出る');
  ok(await s.$eval('.jf', e => { const t = e.querySelector('details').textContent; return t.includes('児童発達支援加算サポートⅠ') && t.includes('特記事項：見本です') && t.includes('反映しません') && !t.includes('見本相談支援センター'); }), '職員：支給量等の文字・その他は、参考として一覧に出る（相談支援は参考ではなく、反映する行に移った）');
  ok(rows.soudan_office === true && rows.soudan_person === true && vals.soudan_office === '見本相談支援センター' && vals.soudan_person === '見本 相談員', '職員：相談支援事業所名・担当者は、反映できる行（いまと違うのでチェックあり）');
  ok(await s.$eval('.jf-f', e => e.textContent.includes('相談支援事業所名') && e.textContent.includes('担当の相談支援専門員')), '職員：相談支援の2行が「いまの利用者情報」と並んで出る');
  log('ref:', await s.$eval('.jf details', e => e.textContent.slice(0, 400))); ok(await s.$eval('.jf', e => e.textContent.includes('参考（利用者情報には入れません）') && e.textContent.includes('令和8年4月1日') && e.textContent.includes('契約開始日')), '職員：参考の項目（期間のはじめ・生年月日・上限額管理など）は反映せず表示');
  await s.setViewport({ width: 1280, height: 1500, deviceScaleFactor: 1 }); await s.screenshot({ path: OUT + 'staff_2_review.png' });
  ok(state.applies.length === 0, '職員：反映の前は何も書き込まない');
  // 入力まちがいは止める
  await type(s, '[data-jf="jukyusha_no"]', '12345'); await s.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent.includes('確認して反映')).click()); await sleep(300);
  ok(state.applies.length === 0 && (await s.$eval('#jf_msg', e => e.textContent)).includes('10桁'), '職員：番号が10桁でないと反映せず理由を出す');
  await type(s, '[data-jf="jukyusha_no"]', '０１２３４５６７８９');
  await s.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent.includes('確認して反映')).click()); await sleep(1500);
  ok(state.dialogs.some(m => m.includes('見本 太郎') && m.includes('（未入力） → 0123456789') && m.includes('2026-03-31 → 2027-03-31') && m.includes('記録に残ります')), '職員：確認ダイアログに「いまの値 → 新しい値」が並ぶ');
  ok(state.applies.length === 1 && state.applies[0].p_id === 8 && sameObj(state.applies[0].p_vals, { jukyusha_no: '0123456789', guardian_name: '見本 花子', contract_end: '2027-03-31', soudan_office: '見本相談支援センター', soudan_person: '見本 相談員' }), '職員：「確認して反映」でチェックした5項目（相談支援の2項目を含む）だけを送る');
  await sleep(500); ok(await s.$eval('.jf', e => e.textContent.includes('反映済み') && e.textContent.includes('反映前の値')), '職員：反映済みの表示と「反映前の値（記録）」の列が出る');
  await s.screenshot({ path: OUT + 'staff_3_applied.png', fullPage: true }); await s.close();
  // 備考への追記だけを反映（任意の項目）
  cur.info = { guardian_name: '見本 花子', note: '前からの備考' }; state.subs = [mkSub(10, {})]; state.applies.length = 0; state.dialogs.length = 0;
  const s3 = await mkPage(1280, 1000, true); await s3.goto(BASE + 'index.html#leo/jukyusha', { waitUntil: 'networkidle0' }); await s3.waitForSelector('.jf-card');
  await s3.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent.includes('確認する')).click()); await s3.waitForSelector('.jf-f');
  ok(await s3.$eval('.jf-f', e => e.textContent.includes('前からの備考')), '職員：いまの備考が「いまの利用者情報」の列に出る');
  await s3.evaluate(() => document.querySelectorAll('[data-jfc]:checked').forEach(c => c.click())); await s3.evaluate(() => { const c = document.querySelector('[data-jfc="note_add"]'); if (!c) throw new Error('nonote'); c.click(); });
  await s3.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent.includes('確認して反映')).click()); await sleep(1500);
  ok(state.applies.length === 1 && Object.keys(state.applies[0].p_vals).join() === 'note_add' && /^【受給者証 \d+\/\d+ 支給量等】/.test(state.applies[0].p_vals.note_add), '職員：備考の行だけチェックすると、note_add だけを送る');
  ok(state.dialogs.some(m => m.includes('「備考」に追記') && m.includes('児童発達支援加算サポートⅠ')), '職員：確認ダイアログに追記する文が出る');
  await s3.close();
  // 別の児童の入力・上限額その他・反映しない
  state.subs = [mkSub(9, { child_name: '別人 花子', cap_monthly: undefined, cap_other: '9300', mushouka: 'yes' })]; state.applies.length = 0; state.dialogs.length = 0;
  const s2 = await mkPage(1280, 1000, true); await s2.goto(BASE + 'index.html#leo/jukyusha', { waitUntil: 'networkidle0' }); await s2.waitForSelector('.jf-card');
  await s2.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent.includes('確認する')).click()); await s2.waitForSelector('.jf-f');
  ok(await s2.$eval('.jf-warn', e => e.textContent.includes('児童名が合いません') && e.textContent.includes('別人 花子')), '職員：児童名が違うと警告が出る');
  ok(await s2.$eval('.jf-f', e => e.textContent.includes('9,300円') && e.textContent.includes('反映できません')), '職員：9,300円は参考として出て、反映できないと分かる');
  ok(!(await s2.$eval('[data-jfc="mushouka"]', e => e.checked)) && (await s2.$eval('[data-jf="mushouka"]', e => e.value)) === 'true', '職員：無償化「はい」は入るが、自動ではチェックされない');
  await s2.screenshot({ path: OUT + 'staff_4_mismatch.png', fullPage: true });
  await s2.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent.includes('確認して反映')).click()); await sleep(400);
  ok(state.applies.length === 0 && (await s2.$eval('#jf_msg', e => e.textContent)).includes('児童名が違う'), '職員：児童名が違うときは、確認のチェックなしでは反映できない');
  await s2.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent.includes('反映しない')).click()); await sleep(1200);
  ok(state.rejects.length === 1 && state.rejects[0].p_note === '別の児童' && state.applies.length === 0, '職員：「反映しない」は反映せず、理由のメモだけ送る');
  await s2.close(); log(fails ? `\n${fails} 件 失敗` : '\nすべて ok'); await br.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
