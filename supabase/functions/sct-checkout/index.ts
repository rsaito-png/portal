// 受講者の Stripe Checkout を作る。金額は sct_begin_payment（DB）が決め、リクエストの金額は見ない。
// シークレット: STRIPE_SECRET_KEY（制限付きキー rk_ を推奨）。SCT_ALLOWED_ORIGINS と SCT_PUBLIC_URL。
// 成功ページでは入金にしない。確定は stripe-webhook。
import { CORS, authUser, env, json, serviceUpdate, userRpc } from "../_shared/http.ts";

async function integrationId(paymentId: string) {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("sct-" + paymentId));
  const bytes = new Uint8Array(digest);
  let s = "";
  for (let i = 0; i < 8; i++) s += letters[bytes[i] % 26];
  return "sctcheckout" + s;
}

function successUrl(req: Request, body: { return_to?: string }) {
  const allow = (env("SCT_ALLOWED_ORIGINS")).split(",").map((s) => s.trim()).filter(Boolean);
  const pub = env("SCT_PUBLIC_URL").replace(/\/$/, "");
  if (body.return_to) {
    let u: URL;
    try { u = new URL(body.return_to); } catch { return null; }
    if (!allow.includes(u.origin) || !u.pathname.endsWith("/sct.html")) return null;
    return u.origin + u.pathname;
  }
  if (pub) return pub.replace(/\/sct\.html$/, "") + "/sct.html";
  const origin = req.headers.get("origin") ?? "";
  if (origin && allow.includes(origin)) return origin + "/sct.html";
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const user = await authUser(req);
  if (!user?.id) return json({ error: "ログインしてください" }, 401);
  const body = await req.json().catch(() => ({}));
  const begun = await userRpc(req, "sct_begin_payment", {});
  if (!begun.ok) return json({ error: begun.body?.message || begun.body || "決済を開始できません" }, 400);
  const pay = begun.body;
  if (pay.status === "waived" || pay.already) return json({ status: pay.status, payment_id: pay.payment_id, amount_yen: pay.amount_yen });
  if (pay.status !== "pending" || !pay.amount_yen) return json({ status: pay.status, payment_id: pay.payment_id });
  const key = env("STRIPE_SECRET_KEY");
  const page = successUrl(req, body);
  if (!key || !page) return json({ error: "決済の接続が未設定です（STRIPE_SECRET_KEY / SCT_PUBLIC_URL）", payment_id: pay.payment_id, status: "pending" }, 501);
  const params = new URLSearchParams();
  params.set("mode", "payment");
  if (user.email) params.set("customer_email", user.email);
  params.set("client_reference_id", pay.payment_id);
  params.set("success_url", page + "?paid=1");
  params.set("cancel_url", page + "?paid=0");
  params.set("metadata[payment_id]", pay.payment_id);
  params.set("metadata[user_id]", user.id);
  params.set("metadata[plan]", pay.plan);
  params.set("line_items[0][quantity]", "1");
  params.set("line_items[0][price_data][currency]", "jpy");
  params.set("line_items[0][price_data][unit_amount]", String(pay.amount_yen));
  params.set("line_items[0][price_data][product_data][name]", pay.plan === "exempt_s1" ? "ストレスチェック実施者養成研修（科目1免除）" : "ストレスチェック実施者養成研修（3科目）");
  params.set("integration_identifier", await integrationId(pay.payment_id));
  const stripe = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + key,
      "Content-Type": "application/x-www-form-urlencoded",
      "Stripe-Version": "2026-09-30.endive",
      "Idempotency-Key": "sct-" + pay.payment_id,
    },
    body: params,
  });
  const session = await stripe.json();
  if (!stripe.ok || !session.url) return json({ error: "Stripeで決済画面を作れませんでした", payment_id: pay.payment_id }, 502);
  await serviceUpdate("sct_payments?id=eq." + pay.payment_id + "&status=eq.pending", { stripe_session_id: session.id });
  return json({ url: session.url, payment_id: pay.payment_id, amount_yen: pay.amount_yen });
});
