// モニタリング下書き。ログインしたレオの職員か、児発管・管理者・事務だけ。
// 日誌は指定した児童の行だけを見る。キー（XAI_API_KEY）はサーバだけ。verify_jwt はオン。
import { checkDraft, childOnlyDiary, normalizeRows, systemPrompt } from "./rules.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const MODEL_DEFAULT = "grok-4-fast-non-reasoning";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

function redact(s: string, key: string) {
  let out = s.replace(/xai-[A-Za-z0-9._-]+/g, "***").replace(/Bearer\s+\S+/gi, "Bearer ***");
  if (key) out = out.split(key).join("***");
  return out;
}

async function rpc(base: string, anon: string, auth: string, name: string) {
  const r = await fetch(base + "/rest/v1/rpc/" + name, {
    method: "POST",
    headers: { apikey: anon, Authorization: auth, "Content-Type": "application/json" },
    body: "{}",
  });
  if (!r.ok) return null;
  return await r.json();
}

async function ask(fetchImpl: typeof fetch, key: string, model: string, user: string) {
  const r = await fetchImpl("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 2800,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt() },
        { role: "user", content: user },
      ],
    }),
  });
  const raw = await r.text();
  if (!r.ok) throw new Error(redact(raw, key).slice(0, 180));
  const content = JSON.parse(raw)?.choices?.[0]?.message?.content || "";
  return JSON.parse(String(content).replace(/```json|```/g, ""));
}

function userPrompt(child: string, label: string, goals: string[], diary: { day: string; text: string }[]) {
  const gs = goals.map((g, i) => `${i + 1}. ${g}`).join("\n");
  const logs = diary.map((d) => `${d.day}　${d.text}`).join("\n");
  return `【児童】${child}\n【更新日】${label}\n【目標】\n${gs}\n【日誌抜粋】\n${logs}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POSTで送ってください" }, 405);
  const auth = req.headers.get("Authorization") || "";
  if (!/^Bearer\s+\S+/.test(auth)) return json({ error: "ログインが必要です" }, 401);
  const base = Deno.env.get("SUPABASE_URL") || "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const key = Deno.env.get("XAI_API_KEY") || "";
  if (!base || !anon) return json({ error: "準備ができていません" }, 501);
  let office = "";
  let manage = false;
  try {
    office = String(await rpc(base, anon, auth, "my_office") ?? "");
    manage = (await rpc(base, anon, auth, "can_manage")) === true;
  } catch (_) {
    return json({ error: "権限を確認できませんでした" }, 503);
  }
  if (office !== "レオ" && !manage) return json({ error: "レオの職員だけが使えます" }, 403);
  if (!key) return json({ error: "準備ができていません" }, 501);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch (_) { return json({ error: "形式が正しくありません" }, 400); }
  const child = String(body.child || "").trim();
  const goals = Array.isArray(body.goals) ? body.goals.map((g) => String(g || "").trim()).filter(Boolean).slice(0, 12) : [];
  const label = String(body.update_label || "").trim().slice(0, 40);
  const diary = childOnlyDiary(Array.isArray(body.diary) ? body.diary : [], child);
  const ctx = {
    child,
    other_names: Array.isArray(body.other_names) ? body.other_names.map((n) => String(n || "")).slice(0, 80) : [],
    staff_names: Array.isArray(body.staff_names) ? body.staff_names.map((n) => String(n || "")).slice(0, 80) : [],
  };
  if (!child) return json({ error: "児童を指定してください" }, 400);
  if (!goals.length) return json({ error: "目標を入れてから押してください" }, 400);
  if (!diary.length) return json({ error: "この期間の活動記録がありません" }, 400);

  const model = Deno.env.get("AI_MODEL") || MODEL_DEFAULT;
  const baseUser = userPrompt(child, label, goals, diary);
  try {
    let parsed = await ask(fetch, key, model, baseUser);
    if (!parsed || typeof parsed !== "object") throw new Error("形式");
    let rows = normalizeRows(parsed, goals);
    let problems = checkDraft(rows, ctx);
    if (problems.length) {
      const again = baseUser + "\n\n【直し】前回は規則に合いませんでした。本文には書かず、次だけ直して同じJSONでもう一度出してください。\n" + problems.join("\n");
      parsed = await ask(fetch, key, model, again);
      rows = normalizeRows(parsed, goals);
      problems = checkDraft(rows, ctx);
    }
    return json({
      rows,
      update_label: String(parsed.update_label || label || "").slice(0, 40),
      warning: problems.length ? "規則に合わない箇所が残っています。直してから印刷してください。\n" + problems.join("\n") : "",
    });
  } catch (e) {
    return json({ error: "評価を作れませんでした。" + redact(String(e), key).slice(0, 120) }, 502);
  }
});
