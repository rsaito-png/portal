// Stripe Checkout の確定。署名検証のあと、pending の sct_payments だけを paid / failed にする。
// シークレット: STRIPE_WEBHOOK_SECRET（whsec_。リポジトリに置かない）。SUPABASE_SERVICE_ROLE_KEY は関数の環境に入っている。
// verify_jwt は false（supabase/config.toml）。入金の正はここ。成功ページでは確定しない。
import { env, hmacHex, json, safeEqual, serviceInsert, serviceSelect, serviceUpdate } from "../_shared/http.ts";

type Decision = { action: "pay" | "fail" | "ignore"; sessionId: string | null; paymentId: string | null; amount?: number; currency?: string | null; plan?: string; paymentIntent: string | null; reason?: string };

function decide(event: { type?: string; data?: { object?: Record<string, unknown> } }): Decision {
  const type = event?.type;
  const obj = event?.data?.object || {};
  const meta = (obj.metadata || {}) as Record<string, string>;
  const pi = obj.payment_intent;
  const base = {
    sessionId: (obj.id as string) || null,
    paymentId: meta.payment_id || (obj.client_reference_id as string) || null,
    amount: obj.amount_total as number | undefined,
    currency: (obj.currency as string) || null,
    plan: meta.plan,
    paymentIntent: typeof pi === "string" ? pi : (pi as { id?: string } | null)?.id || null,
  };
  if (type === "checkout.session.expired" || type === "checkout.session.async_payment_failed") return { action: "fail", ...base };
  if (type === "checkout.session.completed" || type === "checkout.session.async_payment_succeeded") {
    if (obj.payment_status !== "paid") return { action: "ignore", reason: "unpaid", ...base };
    if (obj.currency && obj.currency !== "jpy") return { action: "ignore", reason: "currency", ...base };
    return { action: "pay", ...base };
  }
  return { action: "ignore", reason: type || "unknown", ...base };
}

async function verify(raw: string, header: string, secret: string) {
  const parts = Object.fromEntries(header.split(",").map((p) => { const i = p.indexOf("="); return [p.slice(0, i).trim(), p.slice(i + 1).trim()]; }));
  const t = parts.t;
  if (!t || !parts.v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const expected = await hmacHex(secret, `${t}.${raw}`);
  const sigs = header.split(",").map((p) => p.trim()).filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  return sigs.some((s) => safeEqual(s, expected));
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method", { status: 405 });
  const secret = env("STRIPE_WEBHOOK_SECRET");
  if (!secret) return new Response("webhook secret missing", { status: 500 });
  const raw = await req.text();
  const header = req.headers.get("stripe-signature") ?? "";
  if (!await verify(raw, header, secret)) return new Response("bad signature", { status: 400 });
  const event = JSON.parse(raw);
  const seen = await serviceInsert("sct_stripe_events", { id: event.id, type: event.type || "" });
  if (seen.status === 409) return json({ duplicate: true });
  if (!seen.ok) return new Response("store failed", { status: 500 });
  const d = decide(event);
  if (d.action === "ignore" || !d.paymentId) {
    await serviceUpdate("sct_stripe_events?id=eq." + encodeURIComponent(event.id), { note: d.reason || d.action });
    return json({ ignored: d.reason || d.action });
  }
  const rows = await serviceSelect("sct_payments?id=eq." + d.paymentId + "&select=id,status,amount_yen,plan");
  const pay = rows[0];
  if (!pay) {
    await serviceUpdate("sct_stripe_events?id=eq." + encodeURIComponent(event.id), { note: "payment missing" });
    return json({ missing: true });
  }
  if (pay.status !== "pending") return json({ status: pay.status });
  if (d.action === "fail") {
    await serviceUpdate("sct_payments?id=eq." + pay.id + "&status=eq.pending", { status: "failed", note: event.type, stripe_session_id: d.sessionId });
    return json({ failed: true });
  }
  if (pay.amount_yen !== d.amount || (d.plan && pay.plan !== d.plan)) {
    await serviceUpdate("sct_payments?id=eq." + pay.id, { note: "amount or plan mismatch" });
    await serviceUpdate("sct_stripe_events?id=eq." + encodeURIComponent(event.id), { payment_id: pay.id, note: "mismatch" });
    return json({ mismatch: true });
  }
  const upd = await serviceUpdate("sct_payments?id=eq." + pay.id + "&status=eq.pending", {
    status: "paid", stripe_session_id: d.sessionId, stripe_payment_intent: d.paymentIntent,
  });
  if (!upd.ok) return new Response("pay update failed", { status: 500 });
  await serviceUpdate("sct_stripe_events?id=eq." + encodeURIComponent(event.id), { payment_id: pay.id, note: "paid" });
  return json({ paid: true });
});
