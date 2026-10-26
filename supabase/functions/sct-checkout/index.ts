// 受講者の Square ホスト決済（CreatePaymentLink の quick pay）を作る。
// 金額は sct_begin_payment（DB の sct_price）が決め、リクエストの金額は見ない。JPY は円単位。
// シークレット: SQUARE_ACCESS_TOKEN, SQUARE_LOCATION_ID, SQUARE_ENVIRONMENT（sandbox または production）。
// SCT_PUBLIC_URL（https、sct.html のディレクトリかそのファイル）と SCT_ALLOWED_ORIGINS。
// 成功ページでは入金にしない。確定は square-webhook。
import { CORS, authUser, env, json, serviceUpdate, userRpc } from "../_shared/http.ts";
import { hostedCheckoutUrl, squareApiBase, SQUARE_VERSION } from "../_shared/square.ts";

function successUrl(req: Request, body: { return_to?: string }) {
  const allow = (env("SCT_ALLOWED_ORIGINS")).split(",").map((s) => s.trim()).filter(Boolean);
  const pub = env("SCT_PUBLIC_URL").replace(/\/$/, "");
  const asPage = (base: string) => {
    const page = base.endsWith("/sct.html") ? base : base + "/sct.html";
    return page.startsWith("https://") ? page.split("?")[0] : null;
  };
  if (pub) return asPage(pub);
  if (body.return_to) {
    let u: URL;
    try { u = new URL(body.return_to); } catch { return null; }
    if (u.protocol !== "https:" || !allow.includes(u.origin) || !u.pathname.endsWith("/sct.html")) return null;
    return u.origin + u.pathname;
  }
  const origin = req.headers.get("origin") ?? "";
  if (origin.startsWith("https://") && allow.includes(origin)) return origin + "/sct.html";
  return null;
}

async function squareFetch(path: string, opt: { method?: string; body?: unknown } = {}) {
  const token = env("SQUARE_ACCESS_TOKEN");
  const base = squareApiBase(env("SQUARE_ENVIRONMENT"));
  if (!token || !base) return { ok: false, status: 0, body: null as Record<string, unknown> | null };
  const r = await fetch(base + path, {
    method: opt.method || "GET",
    headers: {
      Authorization: "Bearer " + token,
      "Square-Version": SQUARE_VERSION,
      "Content-Type": "application/json",
    },
    body: opt.body === undefined ? undefined : JSON.stringify(opt.body),
  });
  const text = await r.text();
  let body: Record<string, unknown> | null = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  return { ok: r.ok, status: r.status, body };
}

function linkUrl(body: Record<string, unknown> | null) {
  const link = body && body.payment_link as { url?: string } | undefined;
  return hostedCheckoutUrl(link && link.url);
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
  const amount = Number(pay.amount_yen);
  if (pay.status !== "pending" || !Number.isInteger(amount) || amount <= 0) return json({ status: pay.status, payment_id: pay.payment_id });
  const location = env("SQUARE_LOCATION_ID").trim();
  const page = successUrl(req, body);
  if (!env("SQUARE_ACCESS_TOKEN") || !squareApiBase(env("SQUARE_ENVIRONMENT")) || !location || !page) {
    return json({ error: "決済の接続が未設定です（SQUARE_ACCESS_TOKEN / SQUARE_LOCATION_ID / SQUARE_ENVIRONMENT / SCT_PUBLIC_URL）", payment_id: pay.payment_id, status: "pending" }, 501);
  }
  const linkId = typeof pay.square_payment_link_id === "string" ? pay.square_payment_link_id : "";
  if (/^[A-Za-z0-9]+$/.test(linkId)) {
    const existing = await squareFetch("/v2/online-checkout/payment-links/" + linkId);
    const url = linkUrl(existing.body);
    if (existing.ok && url) return json({ url, payment_id: pay.payment_id, amount_yen: amount });
  }
  const name = pay.plan === "exempt_s1" ? "ストレスチェック実施者養成研修（科目1免除）" : "ストレスチェック実施者養成研修（3科目）";
  const payload: Record<string, unknown> = {
    idempotency_key: "sct-" + pay.payment_id,
    description: name,
    quick_pay: { name, price_money: { amount, currency: "JPY" }, location_id: location },
    payment_note: pay.payment_id,
    checkout_options: {
      allow_tipping: false,
      ask_for_shipping_address: false,
      enable_coupon: false,
      enable_loyalty: false,
      redirect_url: page + "?paid=1",
    },
  };
  if (typeof user.email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email)) {
    payload.pre_populated_data = { buyer_email: user.email };
  }
  const created = await squareFetch("/v2/online-checkout/payment-links", { method: "POST", body: payload });
  const link = created.body && created.body.payment_link as { id?: string; order_id?: string; url?: string } | undefined;
  const url = hostedCheckoutUrl(link && link.url);
  if (!created.ok || !link || !url) {
    const errors = created.body && created.body.errors as { code?: string }[] | undefined;
    const code = errors && errors[0] && errors[0].code || "";
    return json({ error: "Squareで決済画面を作れませんでした", code, payment_id: pay.payment_id }, 502);
  }
  const patch: Record<string, string> = { method: "square" };
  if (link.id && /^[A-Za-z0-9]+$/.test(link.id)) patch.square_payment_link_id = link.id;
  if (link.order_id && /^[A-Za-z0-9]+$/.test(link.order_id)) patch.square_order_id = link.order_id;
  const saved = await serviceUpdate("sct_payments?id=eq." + pay.payment_id + "&status=eq.pending", patch);
  if (!saved.ok) return json({ error: "決済の控えを保存できませんでした", payment_id: pay.payment_id }, 502);
  const savedRows = await saved.json().catch(() => []);
  if (!Array.isArray(savedRows) || !savedRows.length) return json({ error: "決済の控えを保存できませんでした", payment_id: pay.payment_id }, 502);
  return json({ url, payment_id: pay.payment_id, amount_yen: amount });
});
