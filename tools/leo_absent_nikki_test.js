// 日誌で欠席（加算対応）を書いて足す。node tools/leo_absent_nikki_test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const leo = read('leo.js');
const sql = read('supabase/leo_add_kesseki.sql');
const html = read('index.html');

function between(src, a, b) {
  const i = src.indexOf(a);
  const j = src.indexOf(b, i + a.length);
  assert.ok(i >= 0 && j > i, a + ' .. ' + b);
  return src.slice(i, j);
}

const nikkiFn = between(leo, 'async nikki()', 'async jisseki()');
const diaryFn = between(leo, 'LEO_VIEWS.diary = async function', 'async function saveDiary');
const saveFn = between(leo, 'async function saveNikki()', 'async function renderLeoView');
assert.ok(nikkiFn.includes("r.kind === '利用' || r.kind === '欠席'"));
assert.ok(nikkiFn.includes('leoAbsCardHtml'));
assert.ok(nikkiFn.includes('leoAbsAddHtml'));
assert.ok(!nikkiFn.includes('請求の印'));
assert.ok(!diaryFn.includes('請求の印'));
assert.ok(diaryFn.includes("r.kind === '欠席'"));
assert.ok(diaryFn.includes('leoAbsAddHtml'));
assert.ok(diaryFn.includes('leoMealBox(k, meals[leoMealNorm(k)], r, false)'));
assert.ok(saveFn.includes('leoAbsError'));
assert.ok(saveFn.includes('leoSaveAbsFlags'));
assert.ok(saveFn.includes("i.dataset.kind === 'abs'"));
assert.ok(leo.includes('rpc/leo_add_kesseki'));
assert.ok(sql.includes("title,"));
assert.ok(sql.includes('欠席（欠席時対応加算）'));
assert.ok(sql.includes('leo_record_day'));
assert.ok(sql.includes('leo_jisseki_from_nikki'));
assert.ok(sql.includes("kind = '欠席'"));
assert.ok(!sql.includes("'キャンセル'"), 'この関数はキャンセルを作らない');
assert.ok(sql.includes('leo_day_flags_absent_note_required'));
assert.ok(html.includes('leo.js?v=20261105cert'));
assert.ok(nikkiFn.includes('leoNikkiKidBar'));
assert.ok(nikkiFn.includes('leoNikkiChildWrap'));
assert.ok(leo.includes('function nikkiShowChild'));
assert.ok(saveFn.includes("document.querySelectorAll('#view .rec input, #view .rec textarea')"), '保存は表示中だけでなく欄の入力を全部見る');
assert.ok(!saveFn.includes(':visible'));
assert.ok(!saveFn.includes('.nk-child:not([hidden])'));

const sandbox = {
  DEMO: true,
  console,
  ROLE: '職員',
  DUTY: '現場支援員',
  C: { supabaseUrl: 'http://example.test', supabaseKey: 'x' },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  location: { origin: 'http://localhost', pathname: '/', hash: '#leo/nikki', search: '?demo=1' },
  navigator: { clipboard: { writeText: async () => {} } },
  document: {
    getElementById: () => null,
    addEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    body: { classList: { toggle() {} } },
  },
  fetch: async () => { throw new Error('no fetch'); },
  setInterval() { return 0; },
  setTimeout() { return 0; },
  clearTimeout() {},
  btoa,
  atob,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.$ = id => sandbox.document.getElementById(id);
vm.createContext(sandbox);
vm.runInContext(read('leo_left.js'), sandbox, { filename: 'leo_left.js' });
vm.runInContext(read('leo_driver.js'), sandbox, { filename: 'leo_driver.js' });
vm.runInContext(read('leo_meal.js'), sandbox, { filename: 'leo_meal.js' });
vm.runInContext(leo, sandbox, { filename: 'leo.js' });

async function main() {
const nikkiHtml = await vm.runInContext('LEO_VIEWS.nikki()', sandbox);
assert.ok(nikkiHtml.includes('児童D'), '見本の欠席児童が出る');
assert.ok(nikkiHtml.includes('加算対応をした'));
assert.ok(nikkiHtml.includes('checked'));
assert.ok(nikkiHtml.includes('（見本）母より発熱の連絡'));
assert.ok(nikkiHtml.includes('欠席（加算対応）を追加'));
assert.ok(nikkiHtml.includes('児童A'), '利用の子も出る');
assert.ok(!nikkiHtml.includes('請求の印'));
const selAt = nikkiHtml.indexOf('id="nk_abs_child"');
assert.ok(selAt > 0, '追加の児童欄がある');
const select = nikkiHtml.slice(selAt, nikkiHtml.indexOf('</select>', selAt) + 9);
assert.ok(select.includes('児童A') && select.includes('児童C'));
assert.ok(!select.includes('児童D'), 'すでに欠席の子は追加欄に出さない');
assert.ok(!select.includes('児童B'), '退所した子は追加欄に出さない');

const barAt = nikkiHtml.indexOf('class="nk-kids"');
const firstCard = nikkiHtml.indexOf('class="nk-child"');
assert.ok(barAt > 0 && firstCard > barAt, '児童ボタンがカードより前');
assert.ok(nikkiHtml.indexOf('id="nk_day"') < barAt, '総合日誌はボタンの上に残る');
assert.ok(nikkiHtml.includes('id="nk_note" hidden'), '説明は最初は閉じる');
assert.ok(nikkiHtml.includes('id="nk_note_mark" aria-hidden="true">▽'), '見出しの横に開く印');
assert.ok(nikkiHtml.includes('ポータルの日誌が正です'), '説明文は残す');
assert.ok(nikkiHtml.includes('id="nk_daynote" hidden'), '総合日誌の説明は最初は閉じる');
assert.ok(nikkiHtml.includes('id="nk_daynote_mark" aria-hidden="true">▽'));
assert.ok(nikkiHtml.includes('その日全体の記録です'));
const dayCard = nikkiHtml.slice(nikkiHtml.indexOf('id="nk_day"'), nikkiHtml.indexOf('class="nk-kids"'));
assert.ok(dayCard.includes('id="nk_menu"') && dayCard.includes('id="nk_notes"') && dayCard.includes('総合日誌を保存'), '総合日誌の入力と保存は残す');
assert.ok(dayCard.indexOf('</p>') < dayCard.indexOf('id="nk_menu"'), '説明のあとにも入力がある');
assert.ok(nikkiHtml.indexOf('id="nk_abs_add"') > firstCard, '欠席の追加は児童カードの後');
const bar = nikkiHtml.slice(barAt, firstCard);
for (const name of ['児童A', '児童B', '児童C', '児童D']) assert.ok(bar.includes(name), name + ' のボタン');
assert.ok(bar.includes('nk-kid abs') && bar.includes('欠席'), '欠席の子は赤い印');
assert.ok(bar.includes('data-nk-fill') && bar.includes('●'), '記入済みの印');
assert.ok(bar.includes('data-nk-dirty'), '未保存の印の場所');
const opens = [...nikkiHtml.matchAll(/<div class="nk-child"[^>]*>/g)].map(m => m[0]);
assert.strictEqual(opens.length, 4, '利用3人と欠席1人の欄が全部ある');
assert.ok(!/\shidden/.test(opens[0]), '最初の子だけ開く');
assert.ok(opens.slice(1).every(s => /\shidden/.test(s)), 'ほかの子の入力は隠すが消さない');
const hiddenB = nikkiHtml.slice(nikkiHtml.indexOf('data-child="児童B"'));
assert.ok(hiddenB.includes('data-f="activity"') && hiddenB.includes('data-f="pick_time"'), '隠した児童Bの入力がHTMLに残る');
assert.ok(hiddenB.includes('data-f="snack_yen"'), '隠した児童Bのおやつ金額欄も残る');
assert.strictEqual(sandbox.leoNikkiFilledAbs({ absent_support: false, absent_note: '' }), false);
assert.strictEqual(sandbox.leoNikkiFilledAbs({ absent_note: '連絡した' }), true);
assert.strictEqual(sandbox.leoNikkiFilledUse({ pick_time: '' }, '', null), false);
assert.strictEqual(sandbox.leoNikkiFilledUse({ pick_time: '14:30' }, '', null), true);

const diaryHtml = await vm.runInContext('LEO_VIEWS.diary()', sandbox);
assert.ok(diaryHtml.includes('児童D') && diaryHtml.includes('加算対応をした'));
assert.ok(diaryHtml.includes('saveAbsDiary(this)'));
assert.ok(diaryHtml.includes('id="dr_abs_child"'));
assert.ok(diaryHtml.includes('児童A') && diaryHtml.includes('下書き'));
assert.ok(!diaryHtml.includes('請求の印'));
assert.ok(!diaryHtml.includes('nk-kids'), '児童ごとの日誌は従来の並び');
assert.ok(diaryHtml.includes('その日全体の記録です') && !diaryHtml.includes('id="nk_daynote"'), '児童ごとの日誌の総合日誌説明は開いたまま');

assert.strictEqual(sandbox.leoAbsError([{ child: '児童A', absent_support: true, absent_note: '  ' }]),
  '児童Aさん：加算対応をしたときは、連絡した相手と話した内容を書いてください。');
assert.strictEqual(sandbox.leoAbsError([{ child: '児童A', absent_support: false, absent_note: '' }]), '');
assert.strictEqual(sandbox.leoAbsError([{ child: '児童A', absent_support: true, absent_note: '母へ連絡' }]), '');

const calls = [];
sandbox.DEMO = false;
sandbox.sb = async (p, opt = {}) => {
  calls.push({ path: p, method: opt.method || 'GET', body: opt.body || '' });
  return null;
};
sandbox.renderLeoView = async () => { calls.push({ path: 'render', method: 'VIEW' }); };
const els = {
  nk_abs_msg: { textContent: '' },
  nk_abs_child: { value: '児童A' },
  nk_abs_contact: { value: '2026-11-02' },
};
sandbox.document.getElementById = id => els[id] || null;
await sandbox.leoAddKesseki('nk', '2026-11-02');
const add = calls.find(c => c.path === 'rpc/leo_add_kesseki');
assert.ok(add && add.method === 'POST');
assert.deepStrictEqual(JSON.parse(add.body), { p_day: '2026-11-02', p_child: '児童A', p_contact: '2026-11-02' });
assert.ok(calls.some(c => c.path === 'render'));

calls.length = 0;
els.nk_abs_contact.value = '2026-11-03';
await sandbox.leoAddKesseki('nk', '2026-11-02');
assert.ok(!calls.some(c => c.path === 'rpc/leo_add_kesseki'));
assert.ok(els.nk_abs_msg.textContent.includes('後にはできません'));

const saved = { textContent: '' };
const note = { value: '   ', dataset: { kind: 'abs' } };
const box = { checked: true, dataset: { kind: 'abs' }, value: '' };
const card = {
  getAttribute: k => (k === 'data-child' ? '児童A' : ''),
  querySelector: sel => (sel.includes('absent_support') ? box : note),
  querySelectorAll: () => [],
};
const view = {
  querySelectorAll: sel => (sel === '[data-abs="1"]' ? [card] : []),
};
sandbox.document.getElementById = id => (id === 'view' || id === 'saved' ? (id === 'saved' ? saved : view) : null);
sandbox.document.querySelectorAll = () => [];
await sandbox.saveNikki();
assert.ok(saved.textContent.includes('話した内容'));
assert.ok(!calls.some(c => String(c.path).includes('leo_day_flags')));

note.value = '母より発熱。次は金曜。';
box.checked = true;
calls.length = 0;
await sandbox.saveNikki();
const flag = calls.find(c => c.path.includes('leo_day_flags'));
assert.ok(flag, '欠席時対応を leo_day_flags に保存する');
const body = JSON.parse(flag.body);
assert.strictEqual(body[0].child, '児童A');
assert.strictEqual(body[0].absent_support, true);
assert.strictEqual(body[0].absent_note, '母より発熱。次は金曜。');
assert.ok(saved.textContent.includes('欠席時対応を保存しました'));

const inputA = { dataset: { f: 'pick_time', old: '14:30', row: '9' }, value: '14:35' };
const inputB = { dataset: { f: 'end_time', old: '17:30', row: '10' }, value: '17:45' };
const hiddenView = {
  querySelectorAll(sel) {
    if (sel === '[data-abs="1"]' || sel === '[data-meal-child]') return [];
    return [];
  },
};
sandbox.document.getElementById = id => (id === 'view' ? hiddenView : id === 'saved' ? saved : null);
sandbox.document.querySelectorAll = sel => (sel === '#view .rec input, #view .rec textarea' ? [inputA, inputB] : []);
calls.length = 0;
await sandbox.saveNikki();
const applied = calls.filter(c => c.path === 'rpc/leo_nikki_apply').map(c => JSON.parse(c.body));
assert.strictEqual(applied.length, 2, '隠した児童の修正も保存する');
assert.deepStrictEqual(applied.map(b => b.p_row).sort((a, b) => a - b), [9, 10]);
assert.strictEqual(applied.find(b => b.p_row === 10).p_fields.end_time, '17:45');

function fakeKid(i, hidden) {
  const attrs = { 'data-nk-i': String(i), hidden: hidden ? '' : undefined };
  return {
    attrs,
    getAttribute: k => (k in attrs ? attrs[k] : null),
    setAttribute(k, v) { attrs[k] = v; },
    removeAttribute(k) { delete attrs[k]; },
    classList: { toggle(name, on) { this.on = !!on; } },
  };
}
const cards = [fakeKid(0, false), fakeKid(1, true)];
const btn0 = { ...fakeKid(0, false), querySelector: () => ({ hidden: true }) };
const btn1 = { ...fakeKid(1, false), querySelector: () => ({ hidden: true }) };
const switchView = {
  querySelectorAll(sel) {
    if (sel === '.nk-child') return cards;
    if (sel === '.nk-kids [data-nk-i]') return [btn0, btn1];
    return [];
  },
  querySelector(sel) { return sel.includes('"1"') ? btn1 : btn0; },
};
sandbox.document.getElementById = id => (id === 'view' ? switchView : null);
sandbox.nikkiShowChild(1);
assert.ok('hidden' in cards[0].attrs && !('hidden' in cards[1].attrs), '押した子だけ表示し、入力は残す');
assert.strictEqual(btn1.attrs['aria-selected'], 'true');
assert.strictEqual(btn0.attrs['aria-selected'], 'false');
sandbox.nikkiShowChild(0);
assert.ok(!('hidden' in cards[0].attrs) && 'hidden' in cards[1].attrs);

const dirtyMark = { hidden: true };
const dirtyBtn = { querySelector: sel => (sel === '[data-nk-dirty]' ? dirtyMark : null) };
const dirtyCard = {
  getAttribute: () => '1',
  querySelectorAll: () => [{ disabled: false, type: 'text', dataset: { f: 'pick_time', old: '14:30' }, value: '14:30' }],
};
const dirtyView = { querySelector: () => dirtyBtn };
sandbox.document.getElementById = id => (id === 'view' ? dirtyView : null);
sandbox.nikkiMarkDirty(dirtyCard);
assert.strictEqual(dirtyMark.hidden, true, '保存済みと同じ値は未保存にしない');
dirtyCard.querySelectorAll = () => [{ disabled: false, type: 'text', dataset: { f: 'pick_time', old: '14:30' }, value: '15:00' }];
sandbox.nikkiMarkDirty(dirtyCard);
assert.strictEqual(dirtyMark.hidden, false, '直した児童の名前に未保存の印');
dirtyCard.querySelectorAll = () => [{ disabled: true, type: 'number', dataset: { kind: 'meal', f: 'snack_yen' }, value: '100', defaultValue: '' }];
sandbox.nikkiMarkDirty(dirtyCard);
assert.strictEqual(dirtyMark.hidden, true, '無効なおやつ金額は未保存にしない');

const absMsg = { textContent: '' };
const selfCard = {
  matches: sel => sel === '[data-abs="1"]',
  getAttribute: () => '児童D',
  querySelector(sel) {
    if (String(sel).includes('absent_support')) return { checked: true };
    if (String(sel).includes('absent_note')) return { value: '母へ連絡した' };
    if (sel === '.abs_msg') return absMsg;
    return null;
  },
  querySelectorAll: () => [],
};
const one = sandbox.leoReadAbs(selfCard);
assert.strictEqual(one.length, 1);
assert.strictEqual(one[0].absent_note, '母へ連絡した');
sandbox.DEMO = true;
await sandbox.saveAbsDiary({ closest: () => selfCard });
assert.strictEqual(absMsg.textContent, '見本モードなので保存しません。');

const foldStore = {};
sandbox.localStorage.getItem = k => (Object.prototype.hasOwnProperty.call(foldStore, k) ? foldStore[k] : null);
sandbox.localStorage.setItem = (k, v) => { foldStore[k] = String(v); };
const foldNote = { hidden: true };
const foldMark = { textContent: '▽' };
const foldBtn = { setAttribute(name, value) { this[name] = value; } };
const dayNote = { hidden: true };
const dayMark = { textContent: '▽' };
const dayBtn = { setAttribute(name, value) { this[name] = value; } };
const foldEls = { nk_note: foldNote, nk_note_mark: foldMark, nk_note_btn: foldBtn, nk_daynote: dayNote, nk_daynote_mark: dayMark, nk_daynote_btn: dayBtn };
sandbox.document.getElementById = id => foldEls[id] || null;
sandbox.leoFoldToggle('leo_nikki_note_open', 'nk_note');
assert.strictEqual(foldNote.hidden, false);
assert.strictEqual(foldMark.textContent, '△');
assert.strictEqual(foldBtn['aria-expanded'], 'true');
assert.strictEqual(foldStore.leo_nikki_note_open, '1');
sandbox.leoFoldToggle('leo_nikki_note_open', 'nk_note');
assert.strictEqual(foldNote.hidden, true);
assert.strictEqual(foldMark.textContent, '▽');
assert.strictEqual(foldStore.leo_nikki_note_open, '0');
sandbox.leoFoldToggle('leo_nk_day_note_open', 'nk_daynote');
assert.strictEqual(dayNote.hidden, false);
assert.strictEqual(dayMark.textContent, '△');
assert.strictEqual(foldStore.leo_nk_day_note_open, '1');
assert.strictEqual(foldNote.hidden, true, '総合日誌の開閉は上の説明を変えない');

console.log('leo_absent_nikki_test: ok');
}

main().catch(err => { console.error(err); process.exit(1); });
