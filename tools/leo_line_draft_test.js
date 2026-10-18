// LINE下書き→日誌転記まわりの純関数テスト（node tools/leo_line_draft_test.js）
const assert = (c, m) => { if (!c) throw new Error(m); };

const ldNN = s => String(s || '').replace(/\s/g, '');
function ldMergeDrafts(lineDrafts, diaryDrafts) {
  const D = {};
  (diaryDrafts || []).forEach(x => { D[ldNN(x.child)] = { child: x.child, body: x.body, author: x.author || '', lineId: null }; });
  (lineDrafts || []).forEach(x => {
    const k = ldNN(x.child), cur = D[k];
    if (!cur || !cur.lineId || (x.updated_at && (!cur.updated_at || x.updated_at >= cur.updated_at)))
      D[k] = { child: x.child, body: x.body, author: x.author_name || x.author || '', lineId: x.id, updated_at: x.updated_at, sent_line: !!x.sent_line };
  });
  return D;
}
// SQL leo_simple_activity と同じ意図（あいさつ・末尾の署名行を除く）
function leoSimpleActivity(b) {
  return String(b || '')
    .replace(/^\s*(本日も|今日も)?ありがとうございました[。！!]*\s*/, '')
    .replace(/\n\s*\S{1,12}\s*$/, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// 旧下書きだけある児童は lineId=null のまま残る（初回保存で転記元へ）
{
  const D = ldMergeDrafts([], [{ child: '山田 太郎', body: '本文A', author: '職員X' }]);
  assert(D[ldNN('山田 太郎')].body === '本文A', 'diary fallback body');
  assert(D[ldNN('山田 太郎')].lineId === null, 'diary-only has no lineId');
}
// line_drafts があればそちら優先（空白差のある名前も同一視）
{
  const D = ldMergeDrafts(
    [{ id: 9, child: '山田太郎', body: '新本文', author_name: '職員Y', updated_at: '2026-10-18' }],
    [{ child: '山田 太郎', body: '旧本文', author: '職員X' }]);
  assert(D[ldNN('山田 太郎')].body === '新本文', 'line draft wins');
  assert(D[ldNN('山田太郎')].lineId === 9, 'lineId set');
  assert(D[ldNN('山田 太郎')].author === '職員Y', 'author_name');
}
// 新しい line draft が勝つ
{
  const D = ldMergeDrafts([
    { id: 1, child: 'A', body: '古い', updated_at: '2026-10-01', author_name: 'X' },
    { id: 2, child: 'A', body: '新しい', updated_at: '2026-10-18', author_name: 'Y' }], []);
  assert(D.A.body === '新しい' && D.A.lineId === 2, 'latest line draft');
}
{
  const t = leoSimpleActivity('本日もありがとうございました。\n公園で鬼ごっこをしました。\n職員X');
  assert(t === '公園で鬼ごっこをしました。', 'strip greeting and signature: ' + JSON.stringify(t));
}
{
  const t = leoSimpleActivity('今日もありがとうございました！\nおやつ完食。\n中村');
  assert(t === 'おやつ完食。', 'variant greeting: ' + JSON.stringify(t));
}

console.log('leo_line_draft_test: ok');
