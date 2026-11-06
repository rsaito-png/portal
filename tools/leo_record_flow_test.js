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
assert.ok(between(leo, 'async jisseki()', 'LEO_VIEWS.kakunin').includes('rpc/leo_record_span'));
assert.ok(between(leo, 'async function saveNikki()', 'async function renderLeoView').includes('rpc/leo_nikki_apply'));
assert.ok(between(leo, 'async function saveNikki()', 'async function renderLeoView').includes('nikkiEditValue'));
assert.ok(sql.includes('kata_drop'), '空の送り時刻は型表で埋める');
assert.ok(sql.includes("k->>'迎え場所'"), '日誌の迎え場所は型表を正にする');
assert.ok(sql.includes('leo_nikki_places_from_master') || read('supabase/leo_nikki_places_master.sql').includes('leo_nikki_places_from_master'), '場所一括直し');
assert.ok(sql.includes('perform public.leo_nikki_places_from_master'), 'Google同期のあと場所を型表に戻す');

assert.ok(sql.includes("k->>'送り終了'"), '型表の送り終了を読む');
assert.ok(sql.includes("d_src is distinct from 'kata'"), 'カレンダーで直した時刻を型表で上書きしない');
assert.ok(sql.includes('d_end is distinct from nullif(btrim(r.end_time)'), '便の着を利用終了の写しより先に使う');
assert.ok(sql.includes("public.leo_norm(k->>'児童名')"), '型表の名前は空白を除いて比べる');
assert.ok(sql.includes("left(btrim(k->>'曜日'), 1)"), '曜日は先頭1文字（水曜も水）');
assert.ok(sql.includes('staff_saved_at'), '職員が保存した行は印が付く');
assert.ok(sql.includes('leo_auto_field'), '空でない自動値は、未保存の今日以降だけ入れ直す');
assert.ok(sql.includes("btrim(n.drop_time) is not distinct from btrim(n.end_time)"), '送り時刻が終了と同じときは古い自動値');
assert.ok(sql.includes('coalesce(staff_saved_at, now())'), '保存したら、そのあと自動では上書きしない');
assert.ok(sql.includes('p_day >= public.leo_sync_start()'), '開始日より前の保存では印を付けない');
const arrival = read('supabase/leo_drop_time_arrival.sql');
const sync = read('supabase/leo_kata_nikki_sync.sql');
function fnBody(s) {
  const a = s.indexOf('create or replace function public.leo_nikki_from_events');
  const b = s.indexOf('end $$;', a);
  assert.ok(a >= 0 && b > a);
  return s.slice(a, b);
}
assert.strictEqual(fnBody(arrival), fnBody(sql), '実行用SQLと record_flow の関数は同じ');
assert.strictEqual(fnBody(sync), fnBody(sql), '追従SQLと record_flow の関数は同じ');
assert.ok(sync.includes("select date '2026-11-01'"), '追従の開始日');
assert.ok(sync.includes('function public.leo_sync_start()'), '開始日は一つの関数');
assert.ok(/when p_day < public\.leo_sync_start\(\) then/.test(sync), '開始日より前は空欄だけ');
{
  const auto = sync.slice(sync.indexOf('function public.leo_auto_field'), sync.indexOf('create or replace function public.leo_kata_prev'));
  const cut = auto.indexOf('when p_day < public.leo_sync_start()');
  const stale = auto.indexOf('or p_stale');
  assert.ok(cut >= 0 && stale > cut, '送り時刻=終了の入れ直しは開始日より前に走らない');
}
assert.ok(sync.includes('NEW.day is null or NEW.day < public.leo_sync_start()'), '開始日より前の便は児童ごとの時刻を揃えない');
assert.ok(sync.includes('p_day < greatest((timezone(\'Asia/Tokyo\', now()))::date, public.leo_sync_start())'), '作り直しの下限は今日と開始日の遅い方');
assert.ok(sync.includes('greatest(coalesce(p_from, (timezone(\'Asia/Tokyo\', now()))::date), (timezone(\'Asia/Tokyo\', now()))::date, public.leo_sync_start())'), '再作成の開始も同じ下限');
assert.ok(!sync.includes("date '2026-11-05'"), '11/05 を個別に直す案内は置かない');
assert.ok(fnBody(sql).includes('greatest((timezone(\'Asia/Tokyo\', now()))::date, public.leo_sync_start())'), '日誌を開いても開始日より前は予定を作り直さない');
assert.ok(!/create policy|enable row level security|\bgrant\b/i.test(arrival), '送り時刻のSQLは権限を変えない');
assert.ok(arrival.includes('/*') && arrival.includes('-- update leo_nikki'), '11月の直しはコメントのまま');
assert.ok(between(leo, 'async function saveDiary', 'let LD_DAY').includes('rpc/leo_activity_from_drafts'));

console.log('leo_record_flow_test: ok');
