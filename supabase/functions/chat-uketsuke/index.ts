// Google Chat 受付窓口（Chat アプリの HTTP エンドポイント）
// 認証: Chat が付ける Bearer ID トークン（発行者 Google, email=chat@system.gserviceaccount.com, aud=このURL）を検証
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5";
import { createClient } from "npm:@supabase/supabase-js@2";

const AUD = Deno.env.get("CHAT_AUDIENCE")!; // Chat API 設定に入れた HTTP エンドポイント URL と完全一致
const PORTAL = "https://rsaito-png.github.io/portal/#uketsuke";
const JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

// 振り分け（まずはキーワード。外部AIには送らない＝データは国内のまま）
const RULES: [string, RegExp][] = [
  ["請求", /請求|国保連|加算|CSV/i],
  ["送迎", /送迎|迎え|送り|ドライバー|運転/],
  ["日誌", /日誌|活動記録|様子|おやつ|食事/],
  ["計画", /個別支援計画|計画|モニタリング|アセスメント/],
  ["記録", /記録|実績|金斗雲|茶夢/],
];
const classify = (t: string) => RULES.find(([, r]) => r.test(t))?.[0] ?? "その他";

let lastErr = "";
async function verified(req: Request) {
  const h = req.headers.get("authorization") ?? "";
  if (!h.startsWith("Bearer ")) return false;
  try {
    const { payload } = await jwtVerify(h.slice(7), JWKS, {
      issuer: ["https://accounts.google.com", "accounts.google.com"], audience: AUD });
    const e = String(payload.email ?? "");
    // 旧形式: chat@system / アドオン形式: service-<プロジェクト番号>@gcp-sa-gsuiteaddons
    const ok = e === "chat@system.gserviceaccount.com" || e === "service-108598915763@gcp-sa-gsuiteaddons.iam.gserviceaccount.com";
    if (!ok) lastErr = "email " + e + " aud " + payload.aud;
    return ok;
  } catch (err) { lastErr = String(err); return false; }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");
  if (!(await verified(req))) { console.error("401", lastErr); return new Response("unauthorized", { status: 401 }); }
  const ev = await req.json();
  // 旧形式(Chat API)と Workspace アドオン形式の両方に対応
  const chat = ev.chat ?? null;
  const type = ev.type ?? (chat?.messagePayload ? "MESSAGE" : chat?.addedToSpacePayload ? "ADDED_TO_SPACE" : "");
  const msg = ev.message ?? chat?.messagePayload?.message ?? chat?.addedToSpacePayload?.message;
  const space = ev.space ?? chat?.messagePayload?.space ?? chat?.addedToSpacePayload?.space;
  const user = ev.user ?? chat?.user;
  const reply = (text: string) => Response.json(chat
    ? { hostAppDataAction: { chatDataAction: { createMessageAction: { message: { text } } } } }
    : { text });

  // 受付窓口とのDMなら、その人のDMを職員表に登録（ポータルからのお知らせの送り先になる）
  if (space?.name && (space.type === "DM" || space.spaceType === "DIRECT_MESSAGE" || space.singleUserBotDm) && user?.name) {
    const em = (user.email ?? "").toLowerCase();
    let { data: hit } = await db.from("staff_profiles").update({ chat_dm_space: space.name }).eq("chat_user", user.name).select("user_id");
    if (!hit?.length && em) ({ data: hit } = await db.from("staff_profiles").update({ chat_dm_space: space.name, chat_user: user.name }).eq("chat_email", em).select("user_id"));
    if (!hit?.length) await db.from("chat_dm_unknown").upsert({ chat_user: user.name, email: em || null, display_name: user.displayName, space: space.name, seen_at: new Date().toISOString() });
  }
  // 最初のメッセージで追加された時は ADDED_TO_SPACE にメッセージが付いてくるので、それも受付する
  if (type === "ADDED_TO_SPACE" && !msg)
    return reply("受付窓口です。日誌の直し・送迎の変更・請求・計画などの依頼や報告を、ここに書いてください。\n一覧はポータル: " + PORTAL);
  if (!["MESSAGE", "ADDED_TO_SPACE"].includes(type) || !msg) return Response.json({});

  const body = (msg.argumentText ?? msg.text ?? "").trim();
  if (!body) return reply("内容を書いて送ってください。");
  const email = (user?.email ?? "").toLowerCase();
  // まず Chat のユーザーID、無ければメールで職員を引く
  let { data: sp } = await db.from("staff_profiles").select("office").eq("chat_user", user?.name ?? "-").maybeSingle();
  if (!sp && email) ({ data: sp } = await db.from("staff_profiles").select("office").eq("chat_email", email).maybeSingle());
  const category = classify(body);
  const { data, error } = await db.from("uketsuke").upsert({
    sender_name: user?.displayName, sender_email: email || null, chat_user: user?.name,
    space: space?.name, thread: msg.thread?.name, message_name: msg.name,
    office: sp?.office ?? null, category, body,
  }, { onConflict: "message_name" }).select("id").single();
  if (error) { console.error(error.message); return reply("受付できませんでした。少しあとでもう一度送ってください。"); }
  return reply(`受付しました（No.${data.id}／${category}）。\n確認: ${PORTAL}`);
});
