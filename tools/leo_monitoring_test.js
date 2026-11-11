// モニタリングシート（#leo/monitoring）：児童選択・手入力・印刷・計画画面からのリンク
// node tools/leo_monitoring_test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const els = {};
const sandbox = {
  DEMO: true,
  console,
  ROLE: '職員',
  DUTY: '現場支援員',
  C: { offices: [{ id: 'leo', name: 'レオ' }] },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  location: { origin: 'http://localhost', pathname: '/', hash: '#leo/monitoring', search: '?demo=1' },
  navigator: { clipboard: { writeText: async () => {} } },
  document: {
    getElementById: id => els[id] || null,
    addEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    body: { classList: { toggle() {} }, appendChild() {}, removeChild() {} },
  },
  fetch: async () => { throw new Error('no fetch'); },
  setInterval() { return 0; },
  setTimeout(fn) { if (typeof fn === 'function') fn(); return 0; },
  clearTimeout() {},
  confirm: () => false,
  alert() {},
  btoa,
  atob,
  URLSearchParams,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.$ = id => els[id] || null;
vm.createContext(sandbox);
vm.runInContext(read('leo_left.js'), sandbox, { filename: 'leo_left.js' });
vm.runInContext(read('gl.js'), sandbox, { filename: 'gl.js' });
vm.runInContext(read('leo.js') + '\nthis.__m = { LEO_VIEWS, monPrintHtml, monLatestRow, monOffice, monDateLabel, monSave, monRebuild, monPrint, monOpen };', sandbox, { filename: 'leo.js' });
const { LEO_VIEWS, monPrintHtml, monLatestRow, monOffice, monSave, monRebuild, monPrint } = sandbox.__m;

(async () => {
  sandbox.location.hash = '#leo/monitoring';
  const blank = await LEO_VIEWS.monitoring();
  assert.ok(blank.includes('モニタリングシート'));
  assert.ok(blank.includes('>児童A<'), '在籍の児童A');
  assert.ok(blank.includes('>児童C<'), '在籍の児童C');
  assert.ok(!blank.includes('value="児童B"'), '退所の児童Bは一覧に出さない');
  assert.ok(!blank.includes('value="児童D"'), '退所の児童Dは一覧に出さない');
  assert.ok(!blank.includes('<textarea'), '児童を選ぶまでは本文欄を出さない');

  sandbox.location.hash = '#leo/monitoring?child=' + encodeURIComponent('児童A');
  const a = await LEO_VIEWS.monitoring();
  assert.ok(a.includes('<textarea'), '選んだ児童の本文');
  assert.ok(a.includes('公園で鬼ごっこ'), '最新の期の本文');
  assert.ok(a.includes('value="第3期"'), '児童Aの最新は第3期');
  assert.ok(a.includes('value="2026-05-01"') && a.includes('value="2026-10-31"'));
  assert.ok(a.includes('onblur="monSave()"'), '欄を離れると保存');
  assert.ok(a.includes('>保存<') && a.includes('活動記録から作り直す') && a.includes('>印刷する<'));
  assert.ok(a.includes('手入力'));
  assert.ok(!a.includes('value="児童B"'));

  sandbox.location.hash = '#leo/monitoring?child=' + encodeURIComponent('児童 C');
  const c = await LEO_VIEWS.monitoring();
  assert.ok(c.includes('まだモニタリングがありません'), '行が無い児童は空欄から作る');
  assert.ok(c.includes('value="第4期"'), '計画の次の期を初期値にする');
  assert.ok(c.includes('value="2026-04-01"') && c.includes('value="2026-09-30"'));

  sandbox.location.hash = '#leo/monitoring?child=' + encodeURIComponent('児童B');
  const left = await LEO_VIEWS.monitoring();
  assert.ok(left.includes('value="児童B"'), '計画画面からのリンクでは退所児童も開ける');
  assert.ok(left.includes('児童B（退所）'));

  const latest = monLatestRow([
    { child: '児童A', term: '第2期', text: 'old', made_at: '2026-01-01' },
    { child: '児童A　', term: '第１０期', text: 'new', made_at: '2026-02-01' },
    { child: '児童A', term: '第3期', text: 'mid', made_at: '2026-06-01' },
  ], '児童 A');
  assert.strictEqual(latest.text, 'new');

  const off = monOffice();
  assert.strictEqual(off.name, 'レオ');
  assert.strictEqual(off.no, '2450201047');
  const doc = monPrintHtml({ child: '児童A', term: '第3期', from: '2026-05-01', to: '2026-10-31', text: '1行目\n2行目 <b>', made: '2026-11-11' });
  assert.ok(doc.includes('<h1>モニタリングシート</h1>'));
  assert.ok(doc.includes('事業所名：レオ'));
  assert.ok(doc.includes('事業所番号：2450201047'));
  assert.ok(doc.includes('児童名：児童A'));
  assert.ok(doc.includes('期間：第3期　令和8年5月1日 〜 令和8年10月31日'));
  assert.ok(doc.includes('作成日：令和8年11月11日'));
  assert.ok(doc.includes('1行目\n2行目 &lt;b&gt;'), '改行を残し、本文の記号はエスケープ');
  assert.ok(doc.includes('font-size: 12pt'));
  assert.ok(doc.includes('white-space: pre-wrap') || doc.includes('white-space:pre-wrap'));
  assert.ok(doc.includes('size: A4 portrait'));
  assert.ok(doc.includes('margin: 20mm'));
  assert.ok(doc.includes('相談支援専門員　御中'));
  assert.ok(doc.includes('作成者（児発管）'));
  assert.ok(!doc.includes('<button'), '印刷ページに操作ボタンを出さない');
  assert.ok(!doc.includes('<b>'), '本文のタグは出さない');

  const bad = monPrintHtml({ child: '<script>', term: '第1期', from: '', to: '', text: '', made: '' });
  assert.ok(bad.includes('&lt;script&gt;'));
  assert.ok(!bad.includes('<script><'), '児童名をスクリプトにしない');

  els.mon_child = { value: '児童A' };
  els.mon_term = { value: '第3期' };
  els.mon_from = { value: '2026-05-01' };
  els.mon_to = { value: '2026-10-31' };
  els.mon_text = { value: '手で直した本文' };
  els.mon_id = { value: '11' };
  els.mon_msg = { textContent: '', innerHTML: '' };
  await monSave(true);
  assert.strictEqual(els.mon_msg.textContent, '見本モードなので保存しません。');

  sandbox.confirm = () => false;
  els.mon_msg.innerHTML = '';
  els.mon_msg.textContent = 'before';
  await monRebuild();
  assert.strictEqual(els.mon_msg.textContent, 'before', '確認を断ると上書きしない');

  sandbox.confirm = () => true;
  await monRebuild();
  assert.ok(els.mon_msg.innerHTML.includes('見本モードなので作りません'), '見本では活動記録から作らない');

  let written = '';
  sandbox.open = () => ({ document: { write(h) { written += h; }, close() {} } });
  els.mon_text.value = '印刷する本文\n2行';
  monPrint();
  assert.ok(written.includes('印刷する本文\n2行'));
  assert.ok(written.includes('モニタリングシート'));
  assert.ok(!written.includes('<button'));

  sandbox.location.hash = '#leo/plan';
  sandbox.DUTY = '児発管';
  const plan = await LEO_VIEWS.plan();
  assert.ok(plan.includes('モニタリングシートを開く'));
  assert.ok(plan.includes('#leo/monitoring?child=' + encodeURIComponent('児童A')));
  assert.ok(plan.includes('#leo/monitoring?child=' + encodeURIComponent('児童C')));

  const cfg = read('config.js');
  const idx = read('index.html');
  const sql = read('supabase/leo_staff_mon_staff.sql');
  assert.ok(cfg.includes("['📄', 'モニタリングシート', '#leo/monitoring'"));
  assert.ok(idx.includes('config.js?v=20261111mon'));
  assert.ok(idx.includes('leo.js?v=20261111monstaff'));
  assert.ok(idx.includes("big('#leo/monitoring', '📄', 'モニタリングシート'"));
  assert.ok(sql.includes("public.my_office() = 'レオ' or public.can_manage()"));
  assert.ok(sql.includes('for insert') && sql.includes('for update'));
  assert.ok(sql.includes('drop policy if exists lsm_write'));
  assert.ok(sql.includes('for delete') && sql.includes('public.can_manage()'));
  console.log('leo_monitoring_test ok');
})().catch(e => { console.error(e); process.exit(1); });
