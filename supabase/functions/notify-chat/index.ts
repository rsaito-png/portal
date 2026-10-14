// ポータルの出来事を受付窓口アプリから職員へ DM で知らせる（pg_cron が5分ごとに呼ぶ）
// 夜間 22:00〜6:00（日本時間）は送らず、6時以降にまとめて送る。
import { importPKCS8, SignJWT } from "npm:jose@5";
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const SECRET = Deno.env.get("NOTIFY_SECRET") ?? "";
const SA = Deno.env.get("CHAT_SA_KEY") ?? "";          // 受付窓口アプリ（GCP psr-gchat）のサービスアカウント鍵 JSON

async function token() {
  const k = JSON.parse(SA), now = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT({ scope: "https://www.googleapis.com/auth/chat.bot" })
    .setProtectedHeader({ alg: "RS256", kid: k.private_key_id }).setIssuer(k.client_email).setSubject(k.client_email)
    .setAudience("https://oauth2.googleapis.com/token").setIssuedAt(now).setExpirationTime(now + 3000)
    .sign(await importPKCS8(k.private_key, "RS256"));
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST",
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }) });
  const j = await r.json(); if (!j.access_token) throw new Error("token: " + JSON.stringify(j).slice(0, 200));
  return j.access_token as string;
}
const jstHour = () => Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Tokyo" }).format(new Date()));

Deno.serve(async (req) => {
  if (!SECRET || req.headers.get("x-notify-secret") !== SECRET) return new Response("unauthorized", { status: 401 });
  const body = await req.json().catch(() => ({}));
  const h = jstHour();
  if (!body.force && (h >= 22 || h < 6)) return Response.json({ skipped: "夜間" });
  if (!SA) return Response.json({ skipped: "CHAT_SA_KEY 未設定" });

  const { data: q } = await db.from("notify_queue").select("*").is("sent_at", null).order("created_at").limit(200);
  if (!q?.length) return Response.json({ sent: 0 });
  const { data: staff } = await db.from("staff_profiles").select("nikki_name,office,duty,chat_user,chat_dm_space");
  const tok = await token();
  // 宛先ごとにまとめる（朝はまとめて1通）
  const per = new Map<string, { s: any; items: any[] }>(), miss = new Set<string>();
  for (const n of q) {
    const to = (staff ?? []).filter((s) => s.office === n.office && (n.audience === "all" || ["管理者", "児発管"].includes(s.duty))
      && (!n.test_only || s.chat_user === n.test_only));
    for (const s of to) {
      if (!s.chat_dm_space) { miss.add(String(s.nikki_name)); continue; }
      const k = s.chat_dm_space; if (!per.has(k)) per.set(k, { s, items: [] }); per.get(k)!.items.push(n);
    }
  }
  const out: Record<string, string> = {};
  for (const [space, { s, items }] of per) {
    const lines = items.map((n) => `${n.text}\n${n.link ?? ""}`.trim());
    const text = (items.length > 1 ? `ポータルのお知らせ（${items.length}件）\n\n` : "") + lines.join("\n\n");
    const r = await fetch(`https://chat.googleapis.com/v1/${space}/messages`, { method: "POST",
      headers: { authorization: "Bearer " + tok, "content-type": "application/json" }, body: JSON.stringify({ text }) });
    out[String(s.nikki_name)] = r.ok ? "ok" : `NG ${r.status} ${(await r.text()).slice(0, 120)}`;
  }
  const result = { sent: out, unregistered: [...miss] };
  await db.from("notify_queue").update({ sent_at: new Date().toISOString(), result }).in("id", q.map((n) => n.id));
  return Response.json(result);
});
