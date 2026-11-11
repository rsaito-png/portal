// モニタリング下書きの規則。プロンプトは相談員へ渡していた指示をそのまま使う。
// 検査はモデルの出力（推移・課題）だけを見る。目標文は計画書の原文なので対象外。

export function normName(s) {
  return String(s || "").replace(/[\s\u3000]/g, "");
}

export function systemPrompt() {
  return `あなたは児童発達支援事業所「レオ」の児発管の補助として、モニタリング記録の下書きを作ります。
以下の【目標】それぞれについて、【日誌抜粋】だけを根拠に次の4項目を書き、JSONで出力してください。

- goal: 目標文（そのまま）
- trend:「期間中の主な行動の推移」。具体的なエピソードを2〜3文。各エピソードの文末に（N月）を付ける。
  例：「…できました（6月）。」日誌の硬い表現（「〜が認められた」「随意的」等）は使わず、
  保護者が読んでも温かく伝わる口語的な文体（モデル記録「惺太朗くん（４月７日更新）」の調子）で書く。
- rating:「総合評価」1〜5の整数（5＝達成、4＝ほぼ達成、3＝進歩あり・継続、2＝わずかな変化/根拠が少ない、1＝変化なし）。
  根拠が少ない目標は控えめに付けてよいが、その理由（記録が少ない等）は本文に一切書かない。
- issues:「進捗と現在の課題」1〜2文。保護者さんにそのまま渡す文章なので、温かく前向きな「今後の関わり」で結ぶ。

厳守事項：
- 他の児童の名前・愛称（〇〇くん、〇〇ちゃん等）は一切書かない。必要なら「お友達」とする。
- 職員名（〇〇先生、苗字）は書かない。必要なら「職員」とする。
- 日誌に無い出来事を作らない。推測で補わない。
- 保護者向けの文章。「日誌」「記録がない／少ない」「根拠」「不足」「判断できない」「暫定」「控えめな評価」「次期は〜を記録する」など、
  記録やデータの事情・評価の内部事情・職員向けメモは一切書かない。エピソードが少ない目標は、ある事実だけを書き、
  「今後は〜にも一緒に取り組んでいきます」「引き続き、活動の中で様子を見守っていきます。」のように前向きに結ぶ。
- 子どもを否定的・冷たく描写しない（課題は「〜できるよう支えていきます」の形で書く）。
- 出力形式：{"child_display": "...", "update_label": "...", "rows": [{"goal":..., "trend":..., "rating":..., "issues":...}, ...]}
- 注釈・脚注・職員向けの但し書きは書かない。`;
}

const FORBIDDEN = [
  /日誌/,
  /記録が(?:ない|少ない|ありません)/,
  /記録はない/,
  /根拠/,
  /不足/,
  /判断できない/,
  /暫定/,
  /控えめ/,
  /次期は/,
];

function fwDigits(s) {
  return String(s || "").replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
}

function monthMarks(text) {
  return fwDigits(text).match(/[(（](?:1[0-2]|[1-9])月[)）]/g) || [];
}

export function childOnlyDiary(rows, child) {
  const want = normName(child);
  const out = [];
  for (const r of rows || []) {
    if (!r || normName(r.child) !== want) continue;
    const text = String(r.text || r.activity_text || "").trim();
    if (!text) continue;
    out.push({ day: String(r.day || "").slice(0, 10), text: text.slice(0, 800) });
    if (out.length >= 200) break;
  }
  return out;
}

export function normalizeRows(parsed, goals) {
  const src = parsed && Array.isArray(parsed.rows) ? parsed.rows : [];
  const want = Array.isArray(goals) ? goals.map((g) => String(g || "").trim()).filter(Boolean) : [];
  const n = Math.max(src.length, want.length);
  const out = [];
  for (let i = 0; i < n && i < 12; i++) {
    const r = src[i] || {};
    const ratingRaw = fwDigits(r.rating ?? "").trim();
    const rating = Number(ratingRaw);
    out.push({
      goal: String(want[i] || r.goal || "").trim(),
      trend: String(r.trend || "").trim(),
      rating: [1, 2, 3, 4, 5].includes(rating) ? rating : ratingRaw,
      issues: String(r.issues || "").trim(),
    });
  }
  return out.filter((r) => r.goal || r.trend || r.issues);
}

export function checkDraft(rows, ctx) {
  const problems = [];
  const child = normName(ctx && ctx.child);
  const other = (ctx && ctx.other_names || []).map(normName).filter((n) => n && n.length >= 2 && n !== child);
  const staff = (ctx && ctx.staff_names || []).map((s) => String(s || "").trim()).filter((s) => s.length >= 2);
  if (!Array.isArray(rows) || !rows.length) return ["行がありません"];
  rows.forEach((row, i) => {
    const where = `${i + 1}行目`;
    const trend = String(row.trend || "");
    const issues = String(row.issues || "");
    const text = `${trend}\n${issues}`;
    const rating = Number(row.rating);
    if (!String(row.goal || "").trim()) problems.push(`${where}の目標が空です`);
    if (![1, 2, 3, 4, 5].includes(rating)) problems.push(`${where}の評価が1〜5ではありません`);
    const months = monthMarks(trend);
    const sentences = trend.split("。").map((s) => s.trim()).filter((s) => s.length >= 8);
    if (!months.length || (sentences.length && months.length < sentences.length)) problems.push(`${where}のエピソードに（N月）が足りません`);
    for (const re of FORBIDDEN) {
      if (re.test(text)) problems.push(`${where}に、保護者へ出さない言葉があります`);
    }
    if (/先生/.test(text) || /[^\s、。「」（）()]{1,16}(?:くん|ちゃん)/.test(text)) problems.push(`${where}に人名の呼び方があります`);
    for (const n of other) {
      if (text.includes(n)) problems.push(`${where}に他の児童の名前があります`);
    }
    for (const n of staff) {
      if (text.includes(n)) problems.push(`${where}に職員名があります`);
    }
  });
  return [...new Set(problems)];
}
