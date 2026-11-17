// 茶夢の計画本文に、本人とサービス管理責任者以外の名前が残っていないかを見る。
// モデルへ渡す前の置換にも使う。目標文の採点規則（monitoring-eval）とは別。

export function normName(s) {
  return String(s || "").replace(/[\s\u3000]/g, "");
}

export function namePieces(name) {
  const raw = String(name || "").trim();
  if (!raw) return [];
  const bits = raw.split(/[\s\u3000]+/).filter((x) => x.length >= 2);
  return [...new Set([raw, normName(raw), ...bits].filter((x) => x && x.length >= 2))];
}

export function maskNames(text, names, label) {
  const list = [];
  for (const n of names || []) list.push(...namePieces(n));
  list.sort((a, b) => b.length - a.length);
  let out = String(text ?? "");
  const seen = new Set();
  for (const n of list) {
    if (seen.has(n)) continue;
    seen.add(n);
    out = out.split(n).join(label);
  }
  return out;
}

function allowedPieces(ctx) {
  const allow = new Set();
  for (const n of [ctx && ctx.author, ctx && ctx.userName, "齊藤 連", "齊藤連"]) {
    for (const p of namePieces(n)) allow.add(p);
  }
  return allow;
}

function blocked(piece, allow) {
  if (allow.has(piece)) return false;
  for (const a of allow) {
    if (a.includes(piece) || piece.includes(a)) return false;
  }
  return true;
}

export function checkPlanText(text, ctx) {
  const problems = [];
  const allow = allowedPieces(ctx || {});
  const body = String(text || "");
  const compact = normName(body);
  const scan = (names, label) => {
    const seen = new Set();
    for (const n of names || []) {
      for (const p of namePieces(n)) {
        if (seen.has(p) || !blocked(p, allow)) continue;
        seen.add(p);
        if (body.includes(p) || compact.includes(normName(p))) problems.push(label);
      }
    }
  };
  scan(ctx && ctx.otherNames, "他の利用者名");
  scan(ctx && ctx.staffNames, "職員名");
  return [...new Set(problems)];
}
