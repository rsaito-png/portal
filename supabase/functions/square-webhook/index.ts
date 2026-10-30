// Square の payment.created / payment.updated を検証し、pending の sct_payments（method=square）だけを paid にする。
// 署名: x-square-hmacsha256-signature。材料は SQUARE_WEBHOOK_NOTIFICATION_URL + 生ボディ。
// シークレット: SQUARE_WEBHOOK_SIGNATURE_KEY と SQUARE_WEBHOOK_NOTIFICATION_URL（ダッシュボードの購読URLと完全一致）。
// SQUARE_ENVIRONMENT は sandbox / production。ヘッダ square-environment と違う通知は入金にしない。
// verify_jwt は false（supabase/config.toml）。入金の正はここ。成功ページでは確定しない。
// 同じ Square アカウントの他の支払い（レオの実費など）は注文IDも payment_note も一致しないので無視する。
// 実費（jippi-checkout）の payment_note は「leo-jippi YYYY-MM」。UUID ではないので sct_payments には紐づかない。
import { env, json, safeEqual, serviceInsert, serviceSelect, serviceUpdate } from "../_shared/http.ts";
import { squareDecision, squareSignature } from "../_shared/square.ts";

const ORDER_ID = /^[A-Za-z0-9]+$/;

async function findPayment(orderId: string | null, paymentId: string | null) {
  const sel = "&select=id,status,amount_yen,method,square_order_id";
  if (orderId && ORDER_ID.test(orderId)) {
    const rows = await serviceSelect("sct_payments?square_order_id=eq." + encodeURIComponent(orderId) + sel);
    if (rows[0]) return rows[0];
  }
  if (paymentId) {
    const rows = await serviceSelect("sct_payments?id=eq." + paymentId + sel);
    if (rows[0]) return rows[0];
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method", { status: 405 });
  const secret = env("SQUARE_WEBHOOK_SIGNATURE_KEY");
  const notificationUrl = env("SQUARE_WEBHOOK_NOTIFICATION_URL");
  if (!secret || !notificationUrl) return new Response("webhook secret missing", { status: 500 });
  const raw = await req.text();
  if (raw.length > 1_000_000) return new Response("too large", { status: 413 });
  const header = req.headers.get("x-square-hmacsha256-signature") ?? "";
  const expected = await squareSignature(secret, notificationUrl + raw);
  if (!header || !safeEqual(header, expected)) return new Response("bad signature", { status: 403 });
  const gotEnv = (req.headers.get("square-environment") || "").toLowerCase();
  const wantEnv = env("SQUARE_ENVIRONMENT").toLowerCase();
  if (gotEnv && wantEnv && gotEnv !== wantEnv) return json({ ignored: "environment" });
  let event: { event_id?: string; type?: string; data?: { object?: Record<string, unknown> } };
  try { event = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }
  const eventId = String(event.event_id || "");
  if (!/^[A-Za-z0-9_-]{8,200}$/.test(eventId)) return new Response("bad event", { status: 400 });
  const seen = await serviceInsert("sct_square_events", { id: eventId, type: event.type || "" });
  if (!seen.ok && seen.status !== 409) return new Response("store failed", { status: 500 });
  const d = squareDecision(event);
  const mark = (note: string, paymentId?: string) => serviceUpdate(
    "sct_square_events?id=eq." + encodeURIComponent(eventId),
    paymentId ? { note, payment_id: paymentId } : { note },
  );
  if (d.action !== "pay") {
    await mark(d.reason || d.action);
    return json({ ignored: d.reason || d.action });
  }
  const pay = await findPayment(d.orderId, d.paymentId);
  if (!pay) {
    await mark("payment missing");
    return json({ missing: true });
  }
  if (pay.method !== "square") {
    await mark("not square", pay.id);
    return json({ ignored: "method" });
  }
  if (pay.square_order_id && d.orderId && pay.square_order_id !== d.orderId) {
    await mark("order mismatch", pay.id);
    return json({ mismatch: true });
  }
  if (pay.status !== "pending") {
    await mark(String(pay.status), pay.id);
    return json({ status: pay.status });
  }
  if (Number(pay.amount_yen) !== Number(d.amount)) {
    await serviceUpdate("sct_payments?id=eq." + pay.id, { note: "amount mismatch" });
    await mark("mismatch", pay.id);
    return json({ mismatch: true });
  }
  const row: Record<string, string> = { status: "paid" };
  if (d.squarePaymentId && ORDER_ID.test(d.squarePaymentId)) row.square_payment_id = d.squarePaymentId;
  if (d.orderId && ORDER_ID.test(d.orderId)) row.square_order_id = d.orderId;
  const upd = await serviceUpdate("sct_payments?id=eq." + pay.id + "&status=eq.pending", row);
  if (!upd.ok) return new Response("pay update failed", { status: 500 });
  await mark("paid", pay.id);
  return json({ paid: true });
});
