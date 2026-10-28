// 児童名の表記ゆれ。予定作成（SQL の leo_name_canon / leo_name_resolve）と同じ規則。
// 空白は半角スペース（U+0020）1つに揃える。前後は除き、連続する空白も1つにまとめる。全角スペース（U+3000）は混ぜない。
// 名前だけと姓つき（碧音 と 市川 碧音）は、短い方が長い方の最後の名前と一致し、その組み合わせが一人に定まるときだけ同一とみなす。
(function (g) {
  function canonChildName(s) {
    return String(s ?? '').replace(/\s+/g, ' ').trim();
  }
  function childTokens(s) {
    const c = canonChildName(s);
    return c ? c.split(' ') : [];
  }
  function sameChildName(a, b) {
    const ca = canonChildName(a), cb = canonChildName(b);
    if (!ca || !cb) return false;
    if (ca === cb) return true;
    const ta = childTokens(a), tb = childTokens(b);
    if (ta.length === 1 && tb.length >= 2 && ta[0] === tb[tb.length - 1]) return true;
    if (tb.length === 1 && ta.length >= 2 && tb[0] === ta[ta.length - 1]) return true;
    return false;
  }
  // 型表側の名前と、回答側の名前を結ぶ。kata は空白を揃えた表記で返す。回答の文字列はそのまま（保存済みのキー）。
  function resolveChildNames(kataNames, answerNames) {
    const katas = [...new Set((kataNames || []).map(canonChildName).filter(Boolean))];
    const answers = [];
    const seen = new Set();
    for (const a of answerNames || []) {
      if (a == null) continue;
      const s = String(a);
      if (!canonChildName(s) || seen.has(s)) continue;
      seen.add(s);
      answers.push(s);
    }
    const out = [];
    for (const answer of answers) {
      const ac = canonChildName(answer);
      const exact = katas.filter(k => k === ac);
      if (exact.length) {
        for (const kata of exact) out.push({ kata, answer, kind: 'link' });
        continue;
      }
      const ta = childTokens(answer);
      let hits = [];
      if (ta.length === 1) hits = katas.filter(k => { const tk = childTokens(k); return tk.length >= 2 && tk[tk.length - 1] === ta[0]; });
      else if (ta.length >= 2) hits = katas.filter(k => childTokens(k).length === 1 && k === ta[ta.length - 1]);
      if (hits.length === 1) out.push({ kata: hits[0], answer, kind: 'link' });
      else if (hits.length > 1) for (const kata of hits) out.push({ kata, answer, kind: 'ambiguous' });
      else out.push({ kata: null, answer, kind: 'orphan' });
    }
    return out;
  }
  // 児童の情報フォルダ用。空白差と、一意な「名前だけ／姓つき」を1人にまとめる。表示名は半角スペースに揃えた姓つきを優先する。
  function clusterChildNames(names) {
    const raws = [];
    const seen = new Set();
    for (const n of names || []) {
      if (n == null) continue;
      const s = String(n);
      if (!s || s.startsWith('※') || seen.has(s) || !canonChildName(s)) continue;
      seen.add(s);
      raws.push(s);
    }
    const canons = [...new Set(raws.map(canonChildName))];
    const parent = new Map(canons.map(c => [c, c]));
    const find = x => {
      let p = x;
      while (parent.get(p) !== p) { parent.set(p, parent.get(parent.get(p))); p = parent.get(p); }
      return p;
    };
    const unite = (a, b) => { const pa = find(a), pb = find(b); if (pa !== pb) parent.set(pa, pb); };
    const longs = canons.filter(c => childTokens(c).length >= 2);
    for (const s of canons.filter(c => childTokens(c).length === 1)) {
      const hits = longs.filter(l => childTokens(l).at(-1) === s);
      if (hits.length === 1) unite(s, hits[0]);
    }
    const groups = new Map();
    for (const c of canons) {
      const root = find(c);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root).push(c);
    }
    const clusters = [];
    for (const members of groups.values()) {
      const label = members.slice().sort((a, b) => childTokens(b).length - childTokens(a).length || a.localeCompare(b, 'ja'))[0];
      const set = new Set(members);
      clusters.push({ label, raws: raws.filter(r => set.has(canonChildName(r))) });
    }
    clusters.sort((a, b) => a.label.localeCompare(b.label, 'ja'));
    return clusters;
  }
  // 並び順。orderOf(cluster) が数（sort_order）を返す児童を、小さい順に先頭へ。数が無い児童（これから増える児童など）は、その後ろに今の順のまま。
  // 同じ数どうしも今の順のまま。clusters は書き換えず、並べ替えた新しい配列を返す。
  function sortChildClusters(clusters, orderOf) {
    const num = c => {
      const v = orderOf ? orderOf(c) : null;
      if (v == null || v === '') return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    return (clusters || []).map((c, i) => ({ c, i, n: num(c) }))
      .sort((a, b) => (a.n == null) - (b.n == null) || (a.n != null && a.n - b.n) || a.i - b.i)
      .map(x => x.c);
  }
  const api = { canonChildName, childTokens, sameChildName, resolveChildNames, clusterChildNames, sortChildClusters };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  Object.assign(g, api);
})(typeof window !== 'undefined' ? window : globalThis);
