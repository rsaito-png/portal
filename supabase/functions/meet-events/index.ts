// Google Workspace Events（Meet）の Pub/Sub push を受け、sct_meet_events に残す。
// 出席の確定はしない。運営が受信一覧を見て手動で入退室を記録する。participantSessions のリソース名は resource_name に残す。
// シークレット: MEET_WEBHOOK_SECRET。URL は ?token= かヘッダ x-sct-meet-secret。verify_jwt は false。
import { env, json, safeEqual, serviceInsert } from "../_shared/http.ts";

function parse(body: Record<string, unknown>) {
  const msg = (body.message || {}) as { messageId?: string; data?: string; attributes?: Record<string, string> };
  let payload: Record<string, unknown> = body;
  if (msg.data) {
    try { payload = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(msg.data), (c) => c.charCodeAt(0)))); }
    catch { payload = { unparsed: true }; }
  }
  const data = (payload.data || payload.resource || {}) as Record<string, unknown>;
  const ps = (data.participantSession || data.participant_session || {}) as Record<string, unknown>;
  const participant = (ps.participant || data.participant || {}) as Record<string, unknown>;
  const signed = (participant.signedinUser || participant.signedInUser || {}) as Record<string, string>;
  return {
    message_id: msg.messageId || (body.messageId as string) || null,
    event_type: (payload.type as string) || (payload.eventType as string) || msg.attributes?.["ce-type"] || "",
    space_name: (payload.space as string) || (data.space as string) || msg.attributes?.["ce-source"] || "",
    resource_name: (ps.name as string) || (data.name as string) || "",
    display_name: signed.displayName || (participant.displayName as string) || "",
    start_time: (ps.startTime as string) || (ps.start_time as string) || null,
    end_time: (ps.endTime as string) || (ps.end_time as string) || null,
    payload,
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method", { status: 405 });
  const secret = env("MEET_WEBHOOK_SECRET");
  if (!secret) return new Response("meet secret missing", { status: 503 });
  const url = new URL(req.url);
  const got = url.searchParams.get("token") || req.headers.get("x-sct-meet-secret") || "";
  if (!safeEqual(got, secret)) return new Response("unauthorized", { status: 401 });
  const raw = await req.text();
  if (raw.length > 1_000_000) return new Response("too large", { status: 413 });
  const body = raw ? JSON.parse(raw) : {};
  const row = parse(body);
  const ins = await serviceInsert("sct_meet_events", {
    message_id: row.message_id, event_type: row.event_type, space_name: row.space_name,
    resource_name: row.resource_name, display_name: row.display_name,
    start_time: row.start_time, end_time: row.end_time, payload: row.payload, note: "受信のみ。出席は運営が記録する",
  });
  if (ins.status === 409) return json({ duplicate: true });
  if (!ins.ok) return new Response("store failed", { status: 500 });
  return json({ ok: true });
});
