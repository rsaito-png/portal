// Square のホスト決済（Checkout API の CreatePaymentLink / quick pay）と webhook 判定。
// 署名は HMAC-SHA256(signatureKey, notificationUrl + rawBody) を標準 Base64。
// Square の公開例: url=https://example.com/webhook key=asdf1234 body={"hello":"world"}
// → 2kRE5qRU2tR+tBGlDwMEw2avJ7QM4ikPYD/PJ3bd9Og=
// 入金にしてよいかの分け方は sct_logic.js の squareDecision と同じ。金額の一致は呼び出し側。
export const SQUARE_VERSION = "2026-09-16";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function squareApiBase(environment: string) {
  const e = environment.trim().toLowerCase();
  if (e === "production") return "https://connect.squareup.com";
  if (e === "sandbox") return "https://connect.squareupsandbox.com";
  return "";
}

export function hostedCheckoutUrl(url: unknown) {
  if (typeof url !== "string" || !url) return "";
  let u: URL;
  try { u = new URL(url); } catch { return ""; }
  if (u.protocol !== "https:") return "";
  const host = u.hostname.toLowerCase();
  const ok = host === "square.link" || host.endsWith(".square.link") || host === "square.site" || host.endsWith(".square.site");
  return ok ? u.href : "";
}

export async function squareSignature(secret: string, payload: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const bytes = new Uint8Array(sig);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

type PayDecision = {
  action: "pay" | "ignore";
  reason?: string;
  paymentId: string | null;
  orderId: string | null;
  squarePaymentId: string | null;
  amount?: number;
  total?: number;
  currency: string | null;
};

// payment.updated / payment.created の COMPLETED（JPY、チップや値引きで合計がずれていない）だけ入金候補。
// APPROVED や FAILED は入金にしない。決済リンクはカード拒否のあと再試行できるため、FAILED では行を失敗にしない。
export function squareDecision(event: { type?: string; data?: { object?: Record<string, unknown> } }): PayDecision {
  const type = event && event.type;
  const obj = (event && event.data && event.data.object) || {};
  const nested = obj.payment as Record<string, unknown> | undefined;
  const payment = nested || (obj.status || obj.amount_money ? obj : {});
  const money = (payment.amount_money || {}) as { amount?: number; currency?: string };
  const total = (payment.total_money || null) as { amount?: number } | null;
  const note = typeof payment.note === "string" ? payment.note.trim() : "";
  const base: PayDecision = {
    action: "ignore",
    paymentId: UUID.test(note) ? note : null,
    orderId: typeof payment.order_id === "string" ? payment.order_id : null,
    squarePaymentId: typeof payment.id === "string" ? payment.id : null,
    amount: money.amount,
    total: total ? total.amount : undefined,
    currency: money.currency || null,
  };
  if (type !== "payment.updated" && type !== "payment.created") return { ...base, reason: type || "unknown" };
  const status = typeof payment.status === "string" ? payment.status : "";
  if (status !== "COMPLETED") return { ...base, reason: status ? status.toLowerCase() : "unpaid" };
  if (typeof money.amount !== "number" || !Number.isFinite(money.amount)) return { ...base, reason: "amount" };
  if (String(money.currency || "").toUpperCase() !== "JPY") return { ...base, reason: "currency" };
  if (total && total.amount != null && Number(total.amount) !== Number(money.amount)) return { ...base, reason: "total" };
  return { ...base, action: "pay" };
}
