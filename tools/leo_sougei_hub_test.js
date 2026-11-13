// 送迎の統合画面。node tools/leo_sougei_hub_test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

const sandbox = {
  window: {},
  localStorage: {
    _s: {},
    getItem(k) { return this._s[k] == null ? null : this._s[k]; },
    setItem(k, v) { this._s[k] = String(v); },
  },
  location: { hash: '#leo/sougei' },
  document: { body: { classList: { toggle() {} } }, getElementById() { return null; } },
  today: () => '2026-11-13',
  console,
};
sandbox.window = sandbox;
sandbox.localStorage = sandbox.localStorage;
vm.createContext(sandbox);
vm.runInContext(read('leo_sougei_hub.js'), sandbox, { filename: 'leo_sougei_hub.js' });

const { sgHubFromHash, sgHubDest, sgHubRead, sgHubWrite, SG_HUB, sgHubChrome } = sandbox;

assert.strictEqual(sgHubDest('2026-11-13'), '#leo/sougei');
assert.strictEqual(sgHubDest('2026-11-16'), '#leo/sougei/2026-11-16');

const all = sgHubFromHash('#leo/sougeiall');
assert.ok(all.redirect && all.view === 'list' && all.who === 'all' && all.dest === '#leo/sougei', 'sougeiall');

const cal = sgHubFromHash('#leo/cal');
assert.ok(cal.redirect && cal.view === 'child' && cal.dest === '#leo/sougei', 'cal');

const day = sgHubFromHash('#leo/day/2026-11-16');
assert.ok(day.redirect && day.view === 'time' && day.day === '2026-11-16' && day.dest === '#leo/sougei/2026-11-16', 'day');

const hub = sgHubFromHash('#leo/sougei');
assert.ok(!hub.redirect && hub.dest === '#leo/sougei' && hub.tab === 'plan', 'sougei canonical');

const dated = sgHubFromHash('#leo/sougei/2026-11-16');
assert.ok(!dated.redirect && dated.day === '2026-11-16', 'sougei date');

const kata = sgHubFromHash('#leo/kata');
assert.ok(!kata.redirect && kata.tab === 'kata' && kata.dest === '#leo/kata', 'kata stays');

assert.strictEqual(sgHubFromHash('#leo/kids'), null);
assert.strictEqual(sgHubFromHash('#leo'), null);

SG_HUB.view = 'list';
SG_HUB.who = 'mine';
sgHubWrite();
SG_HUB.view = 'time';
SG_HUB.who = 'all';
sgHubRead();
assert.strictEqual(SG_HUB.view, 'list');
assert.strictEqual(SG_HUB.who, 'mine');

SG_HUB.tab = 'plan';
SG_HUB.view = 'time';
SG_HUB.who = 'all';
SG_HUB.day = '2026-11-13';
const chrome = sgHubChrome();
assert.ok(chrome.includes('>送迎<') && chrome.includes("sgHubTab('kata')") && chrome.includes("sgHubSetView('time')"), 'chrome');
assert.ok(chrome.includes('時間順') && chrome.includes('子どもごと') && chrome.includes('一覧'), '見せ方');
assert.ok(chrome.includes('全員') && chrome.includes('自分だけ'), '絞り込み');
assert.ok(chrome.includes('type="date"') && chrome.includes("sgHubGoToday()"), '日付');
assert.ok(!chrome.includes('setInterval') && !chrome.includes('leoViewsLive'), '自動読み込みはしない');

const src = read('leo_sougei_hub.js') + read('index.html') + read('leo.js');
assert.ok(src.includes('sgHubOpen') && read('index.html').includes('leo_sougei_hub.js'), '入口');
assert.ok(read('leo.js').includes("hash.match(/^#leo\\/kids$/)"), 'kidsの自動読み込みは残す');
assert.ok(read('index.html').includes("sougeiNames = ['送迎']"), 'ホームは送迎1つ');

// 既存の一覧関数は残す
const leo = read('leo.js');
assert.ok(leo.includes('async sougei()') && leo.includes('async sougeiall()') && leo.includes('function leoSougeiMineHtml') && leo.includes('function leoSougeiAllHtml'));
const yotei = read('leo_yotei.js');
assert.ok(yotei.includes('const old = LEO_VIEWS.sougei') && yotei.includes('LEO_VIEWS.sougei = async function'), '予定作成側の自分の送迎は残す');

console.log('leo_sougei_hub_test ok');
