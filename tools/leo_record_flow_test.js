// 予定→日誌→活動記録→実績。node tools/leo_record_flow_test.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const sql = read('supabase/leo_record_flow.sql');
const leo = read('leo.js');

function between(src, a, b) {
  const i = src.indexOf(a);
  const j = src.indexOf(b, i + a.length);
  assert.ok(i >= 0 && j > i, a + ' .. ' + b);
  return src.slice(i, j);
}

const pairBlock = sql.slice(sql.indexOf('pairs text[][] := array['), sql.indexOf('];', sql.indexOf('pairs text[][] := array[')));
const pairs = [...pairBlock.matchAll(/array\['([^']+)','([^']+)'\]/g)].map(m => [m[1], m[2]]);
assert.ok(pairs.length >= 10, 'である調の置換表');
function leoDearu(b) {
  let s = String(b || '');
  for (const [a, c] of pairs) s = s.split(a).join(c);
  s = s.trim();
  return s || null;
}
function leoSimpleActivity(b) {
  return String(b || '')
    .replace(/^\s*(本日も|今日も)?ありがとうございました[。！!]*\s*/, '')
    .replace(/\n\s*\S{1,12}\s*$/, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

{
  const t = leoDearu(leoSimpleActivity('本日もありがとうございました。\n公園で鬼ごっこをして、たくさん走りました。おやつも完食です。\n齊藤連'));
  assert.strictEqual(t, '公園で鬼ごっこをして、たくさん走った。おやつも完食である。');
}
assert.strictEqual(leoDearu('できませんでした。'), 'できなかった。');
assert.strictEqual(leoDearu('静かにできました。'), '静かにできた。');
assert.strictEqual(leoDearu('公園で遊びました。'), '公園で遊んだ。');
assert.strictEqual(leoDearu('おやつを食べました。'), 'おやつを食べた。');
assert.strictEqual(leoDearu('楽しかったです。'), '楽しかったである。');
assert.strictEqual(leoDearu(''), null);

assert.ok(sql.includes('ませんでした'), 'である調の補完');
assert.ok(sql.includes("perform public.leo_nikki_from_events(p_day)"), '下書き転記の前に日誌行');
assert.ok(sql.includes("perform public.leo_jisseki_from_nikki(p_day)"), '活動のあと実績');
assert.ok(sql.includes("where leo_activity.source = '自動（簡易）'"), 'ボットと手入力は上書きしない');
assert.ok(sql.includes("coalesce(nk.activity_via, '') <> '手入力'"));
assert.ok(sql.includes("j.source is null or j.source = 'ポータル'"), 'Google由来の実績は上書きしない');
assert.ok(sql.includes("where leo_jisseki.source is distinct from 'ポータル'"));
assert.ok(sql.includes("coalesce(seed, '') <> 'events'"), 'ポータル日誌は同期で消さない');
assert.ok(sql.includes("when svc in ('児発', '放デイ') then svc"), '種別が分かれば日誌のサービス欄を上書きする');
assert.ok(sql.includes('欠席（欠席時対応加算）'));
assert.ok(sql.includes('キャンセル'));
assert.ok(/n := public\.leo_activity_from_drafts\(p_day\)/.test(sql), 'record_day は 1→2→3');

const lineFn = between(leo, 'LEO_VIEWS.line = async function', 'async function saveLine');
assert.ok(!lineFn.includes('leoRecordDay'), 'LINE画面を開いただけでは書き込まない');
assert.ok(!lineFn.includes('leo_record_day'));
assert.ok(between(leo, 'async function saveLine', 'async function copyLine').includes('rpc/leo_activity_from_drafts'));
assert.ok(!between(leo, 'async function saveLine', 'async function copyLine').includes('leo_edits'));
assert.ok(!between(leo, 'async function ldSave', 'async function ldCopy').includes('leo_edits'));
assert.ok(between(leo, 'LEO_VIEWS.diary = async function', 'async function saveDiary').includes('leoRecordDay(DIA_DAY)'));
assert.ok(between(leo, 'async nikki()', 'async jisseki()').includes('leoRecordDay(today())'));
assert.ok(between(leo, 'async jisseki()', '// 保護者の実績確認').includes('rpc/leo_record_span'));
assert.ok(between(leo, 'async function saveNikki()', 'async function renderLeoView').includes('rpc/leo_nikki_apply'));
assert.ok(between(leo, 'async function saveNikki()', 'async function renderLeoView').includes('nikkiEditValue'));
assert.ok(between(leo, 'async function saveDiary', 'let LD_DAY').includes('rpc/leo_activity_from_drafts'));

console.log('leo_record_flow_test: ok');
