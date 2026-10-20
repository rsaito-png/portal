// ポータルの出来事を Google Chat スペースの受信ウェブフックで知らせる（pg_cron が5分ごとに呼ぶ）。鍵は不要。
//  mgr（保護者の同意・アンケート回答など）→ 管理職用スペース  CHAT_WEBHOOK_MGR
//  all（ヒヤリハット）                      → 職員全員用スペース CHAT_WEBHOOK_ALL
// 夜間 22:00〜6:00（日本時間）は送らず、6時以降にまとめて送る。URL未設定の宛先は送らず待ち行列に残す。
// URL は関数のシークレット（Supabase secrets）にだけ置く。ログ・応答・リポジトリには出さない。
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const SECRET = Deno.env.get("NOTIFY_SECRET") ?? "";
const HOOK: Record<string, string> = { mgr: Deno.env.get("CHAT_WEBHOOK_MGR") ?? "", all: Deno.env.get("CHAT_WEBHOOK_ALL") ?? "" };
const jstHour = () => Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Tokyo" }).format(new Date()));

async function post(aud: string, text: string) {
  try {
    const r = await fetch(HOOK[aud], { method: "POST", headers: { "content-type": "application/json; charset=UTF-8" }, body: JSON.stringify({ text }) });
    return r.ok ? "ok" : `NG ${r.status}`;          // 応答本文はURLを含み得るので出さない
  } catch { return "NG network"; }
}

Deno.serve(async (req) => {
  if (!SECRET || req.headers.get("x-notify-secret") !== SECRET) return new Response("unauthorized", { status: 401 });
  const body = await req.json().catch(() => ({}));
  // 接続テスト：{"test":"mgr"} → 管理職用スペース（管理職のみ）に1件だけ送る。待ち行列は使わない。
  if (body.test) {
    const aud = body.test === "all" ? "all" : "mgr";
    if (!HOOK[aud]) return Response.json({ skipped: `CHAT_WEBHOOK_${aud.toUpperCase()} 未設定` });
    return Response.json({ test: aud, result: await post(aud, "【テスト】ポータルからの通知の接続確認です。このメッセージは無視してください。") });
  }
  const h = jstHour();
  if (!body.force && (h >= 22 || h < 6)) return Response.json({ skipped: "夜間" });

  const { data: q } = await db.from("notify_queue").select("*").is("sent_at", null).is("test_only", null).order("created_at").limit(200);
  if (!q?.length) return Response.json({ sent: 0 });
  const result: Record<string, unknown> = {}, waiting: string[] = [];
  for (const aud of ["mgr", "all"]) {
    const items = q.filter((n) => n.audience === aud);
    if (!items.length) continue;
    if (!HOOK[aud]) { waiting.push(aud); continue; }                 // 未設定：送らず待つ
    const text = (items.length > 1 ? `ポータルのお知らせ（${items.length}件）\n\n` : "") +
      items.map((n) => `${n.text}\n${n.link ?? ""}`.trim()).join("\n\n");
    const r = await post(aud, text);
    result[aud] = r;
    if (r === "ok") await db.from("notify_queue").update({ sent_at: new Date().toISOString(), result: { via: "webhook", aud } }).in("id", items.map((n) => n.id));
  }
  return Response.json({ ...result, waiting });
});
