// レオ実費の支払いリンクを作り直すかどうか。金額は lunch+snack（円）。
// 0円は作らない。https の pay_link があり、作ったときの金額（pay_link_amount）と同じなら作り直さない。
// 金額が違う、または金額を記録していないリンクは、新しいリンクで上書きする。
export const JIPPI_MAX_YEN = 100000;

export function jippiPaymentNote(ym: string) {
  return "leo-jippi " + ym;
}

export function jippiNeedsLink(row: {
  lunch?: unknown;
  snack?: unknown;
  pay_link?: unknown;
  pay_link_amount?: unknown;
}): { action: "zero" | "unchanged" | "create" | "bad"; amount: number } {
  const lunch = Number(row.lunch);
  const snack = Number(row.snack);
  if (!Number.isInteger(lunch) || !Number.isInteger(snack) || lunch < 0 || snack < 0) return { action: "bad", amount: 0 };
  const amount = lunch + snack;
  if (amount === 0) return { action: "zero", amount: 0 };
  if (amount > JIPPI_MAX_YEN) return { action: "bad", amount };
  const link = typeof row.pay_link === "string" ? row.pay_link.trim() : "";
  const raw = row.pay_link_amount;
  const saved = raw == null || raw === "" ? null : Number(raw);
  if (link.startsWith("https://") && saved === amount) return { action: "unchanged", amount };
  return { action: "create", amount };
}

// 同じ児童・同じ金額の再実行は Square の同じキーになり、同じリンクが返る。金額が変わると別キー。
export async function jippiIdempotencyKey(ym: string, child: string, amount: number) {
  // 本文（表示名など）を変えたら jippi1 を上げる。同じキーで違う本文を送ると Square が拒否するため。
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("jippi1\n" + ym + "\n" + child + "\n" + amount));
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  return ("jippi1-" + hex).slice(0, 45);
}
