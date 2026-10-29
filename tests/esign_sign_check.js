// 職員の電子サインが、氏名の打ち込みではなく手書きPNGになること
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'esign.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const help = fs.readFileSync(path.join(root, 'esign-help.html'), 'utf8');
const schema = fs.readFileSync(path.join(root, 'supabase/esign.sql'), 'utf8');
const mig = fs.readFileSync(path.join(root, 'supabase/esign_signature_png.sql'), 'utf8');

assert.ok(!src.includes('esName'));
assert.ok(!src.includes('氏名を入力'));
assert.ok(!src.includes('p_typed_name'));
assert.ok(src.includes('createSignPad'));
assert.ok(src.includes('z-index:120'));
assert.ok(src.includes('body.lock #uk_fab'));
assert.ok(src.includes('p_signature'));
assert.ok(src.includes('内容を確認しました'));
assert.ok(src.includes('signature_png'));
assert.ok(src.includes("doc_register_paper"));

const signAt = html.indexOf('signpad.js');
const esAt = html.indexOf('esign.js');
assert.ok(signAt > 0 && esAt > signAt);

assert.ok(help.includes('指で書いて'));
assert.ok(help.includes('これでよい'));
assert.ok(!help.includes('氏名の欄'));
assert.ok(!help.includes('氏名が一致しません'));
assert.ok(help.includes('手書きの署名'));
assert.ok(help.includes('紙で締結済みを登録'));

for (const sql of [schema, mig]) {
  assert.ok(sql.includes('signature_png text'));
  assert.ok(sql.includes('signature_png is null or'));
  assert.ok(sql.includes("p_signature not like 'data:image/png;base64,%'"));
  assert.ok(sql.includes('auth.uid(), nm,'));
  assert.ok(!sql.includes('入力した氏名が登録されている氏名と一致しません'));
  assert.ok(!sql.includes('p_typed_name'));
  assert.ok(sql.includes('char_length(p_signature) > 300000'));
}
assert.ok(schema.includes('trg_sig_immutable'));
assert.ok(schema.includes('before update or delete on public.doc_signatures'));
assert.ok(schema.includes('doc_register_paper'));
assert.ok(!/signature_png text not null/.test(schema));
assert.ok(!/signature_png text not null/.test(mig));
assert.ok(!/drop table/i.test(mig));
assert.ok(mig.includes('add column if not exists signature_png'));
const paper = schema.slice(schema.indexOf('function public.doc_register_paper'), schema.indexOf('function public.doc_renewal_notices'));
assert.ok(!paper.includes('signature_png'));

const view = { innerHTML: '' };
const els = {};
const sandbox = {
  window: { addEventListener() {}, scrollY: 0, scrollTo() {}, devicePixelRatio: 1 },
  document: {
    getElementById() { return null; },
    createElement() { return {}; },
    head: { appendChild() {} },
    body: { style: {}, classList: { contains() { return false; }, add() {}, remove() {} }, appendChild() {} },
    documentElement: { style: {} },
  },
  location: { hash: '#sign' },
  crypto: require('crypto').webcrypto,
  TextEncoder,
  DEMO: true,
  ROLE: '事務',
  C: { esign: { enabled: true, docTypes: { labor_contract: '労働条件通知書兼雇用契約書', confidentiality: '秘密保持誓約書' } } },
  esc: s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
  $: id => els[id] || (id === 'view' ? view : null),
};
vm.createContext(sandbox);
vm.runInContext(src, sandbox);

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
assert.strictEqual(sandbox.esPngOk(png), true);
assert.strictEqual(sandbox.esPngOk(''), false);
assert.strictEqual(sandbox.esPngOk(null), false);
assert.strictEqual(sandbox.esPngOk('javascript:alert(1)'), false);
assert.strictEqual(sandbox.esPngOk('data:image/png;base64,"><img>'), false);
assert.strictEqual(sandbox.esPngOk('data:image/jpeg;base64,aaaa'), false);
assert.ok(sandbox.esSigImg({ signature_png: png }).includes('class="essig"'));
assert.ok(sandbox.esSigImg({ signature_png: png }).includes('alt="手書き署名"'));
assert.strictEqual(sandbox.esSigImg({ signature_png: null }), '');
assert.strictEqual(sandbox.esSigImg({}), '');
assert.strictEqual(sandbox.esSigImg({ signature_png: 'data:image/png;base64," onerror="alert(1)' }), '');

(async () => {
const issued = await sandbox.esDocView({ id: 1, doc_type: 'labor_contract', status: 'issued', rendered_text: '本文 <script>' }, null);
assert.ok(issued.includes('id="esPrev"'));
assert.ok(issued.includes('onclick="esOpenPad()"'));
assert.ok(issued.includes('内容を確認しました'));
assert.ok(issued.includes('登録されている氏名'));
assert.ok(issued.includes('本文 &lt;script&gt;'));
assert.ok(!issued.includes('esName'));
assert.ok(!issued.includes('氏名を入力'));
assert.ok(!issued.includes('class="essig"'));

const signed = await sandbox.esDocView({
  id: 2, doc_type: 'confidentiality', status: 'signed', rendered_text: '誓約',
}, { typed_name: '見本 花子', text_sha256: 'ab'.repeat(32), template_version: 1, signed_at: '2026-10-02T03:00:00Z', signature_png: png });
assert.ok(signed.includes('class="essig"'));
assert.ok(signed.includes('署名者：見本 花子'));
assert.ok(!signed.includes('id="esPrev"'));
assert.ok(signed.includes('印刷／PDFにする'));

const old = await sandbox.esDocView({
  id: 3, doc_type: 'labor_contract', status: 'signed', rendered_text: '古い契約',
}, { typed_name: '見本 太郎', text_sha256: 'cd'.repeat(32), template_version: 1, signed_at: '2025-01-01T00:00:00Z', signature_png: null });
assert.ok(old.includes('署名者：見本 太郎'));
assert.ok(!old.includes('class="essig"'));

const msg = { textContent: '' };
els.esRead = { checked: false };
els.esMsg = msg;
els.esBtn = { disabled: false };
await sandbox.esSign(1);
assert.ok(msg.textContent.includes('内容を確認しました'));
els.esRead.checked = true;
await sandbox.esSign(1);
assert.ok(msg.textContent.includes('署名を書いてください'));
assert.strictEqual(els.esBtn.disabled, false);

await sandbox.renderSign();
assert.ok(view.innerHTML.includes('内容を確認して署名する'));
assert.ok(view.innerHTML.includes('内容を見る'));
assert.ok(!view.innerHTML.includes('氏名を入力'));

await sandbox.esAdminDetail({ user_id: 'u1', full_name: '見本 花子', office: 'レオ' }, '<button class="back">戻る</button>');
assert.ok(view.innerHTML.includes('class="essig"'));
assert.ok(view.innerHTML.includes('見本 花子'));
assert.ok(view.innerHTML.includes('印刷／PDFにする'));
assert.ok(view.innerHTML.includes('紙で締結済みを登録'));
assert.ok(!view.innerHTML.includes('氏名を入力'));
assert.ok(!view.innerHTML.includes('id="esPrev"'));

console.log('esign_sign_check ok');
})().catch(e => { console.error(e); process.exit(1); });
