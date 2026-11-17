// 茶夢：アップロードされたサービス等利用計画（PDF または画像）の文字を xAI で読む。保存はしない。
// ログイン中で chamu_can_plan() が true の人だけ。鍵（XAI_API_KEY）はサーバだけ。verify_jwt は true。
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const MAX = 12_000_000;
const KINDS = ["サービス等利用計画", "障がい児支援利用計画", "居宅サービス計画書", "その他"];
const PROMPT = `これは日本の障害福祉のサービス等利用計画、または介護保険の居宅サービス計画書です。書かれている文字を読み、次のJSONだけを返してください。説明やコードフェンスは不要です。
{"kind":"サービス等利用計画|障がい児支援利用計画|居宅サービス計画書|その他","office_name":"計画を作った事業所","author_name":"作成者","created_on":"YYYY-MM-DDまたは空","consent_on":"YYYY-MM-DDまたは空","period_from":"YYYY-MM-DDまたは空","period_to":"YYYY-MM-DDまたは空","body_text":"読み取れた全文"}
規則: 書いていないことは空文字。推測で補わない。読めない箇所は body_text に【要確認】と書く。要約しない。`;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

function redact(s: string, key: string) {
  let out = s.replace(/xai-[A-Za-z0-9._-]+/g, "***").replace(/Bearer\s+\S+/gi, "Bearer ***");
  if (key) out = out.split(key).join("***");
  return out.slice(0, 180);
}

function parseJson(text: string) {
  const s = String(text || "").trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  const i = s.indexOf("{");
  const j = s.lastIndexOf("}");
  if (i < 0 || j < i) throw new Error("読み取り結果を解釈できませんでした");
  return JSON.parse(s.slice(i, j + 1));
}

function ymd(v: unknown) {
  const s = String(v || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

function kindOf(v: unknown) {
  const t = String(v || "").trim();
  if (KINDS.includes(t)) return t;
  if (t.includes("居宅")) return "居宅サービス計画書";
  if (t.includes("障がい児") || t.includes("障害児")) return "障がい児支援利用計画";
  return "サービス等利用計画";
}

function outputText(data: { output?: Array<{ content?: unknown; text?: string }>; output_text?: string }) {
  const chunks: string[] = [];
  if (typeof data?.output_text === "string") chunks.push(data.output_text);
  for (const item of data?.output || []) {
    if (typeof item?.text === "string") chunks.push(item.text);
    const content = item?.content;
    if (typeof content === "string") chunks.push(content);
    if (Array.isArray(content)) {
      for (const c of content) {
        if (typeof c === "string") chunks.push(c);
        else if (c && typeof c === "object" && "text" in c) chunks.push(String((c as { text?: unknown }).text ?? ""));
      }
    }
  }
  return chunks.join("\n");
}

function decodeB64(b64: string) {
  const bin = atob(b64.replace(/\s/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function xaiText(key: string, url: string, method: string, headers: Record<string, string>, body: BodyInit) {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), 90000);
  try {
    const res = await fetch(url, { method, body, signal: ctl.signal, headers: { Authorization: "Bearer " + key, ...headers } });
    const raw = await res.text();
    if (!res.ok) throw new Error(redact(raw, key));
    return raw;
  } finally {
    clearTimeout(to);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POSTで送ってください" }, 405);
  const auth = req.headers.get("Authorization") || "";
  if (!/^Bearer\s+\S+/.test(auth)) return json({ error: "ログインが必要です" }, 401);
  const base = Deno.env.get("SUPABASE_URL") || "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const key = Deno.env.get("XAI_API_KEY") || "";
  if (!base || !anon || !key) return json({ error: "読み取りの準備ができていません" }, 501);
  let allowed = false;
  try {
    const chk = await fetch(base + "/rest/v1/rpc/chamu_can_plan", {
      method: "POST",
      headers: { apikey: anon, Authorization: auth, "Content-Type": "application/json" },
      body: "{}",
    });
    if (chk.ok) allowed = (await chk.json()) === true;
  } catch (_) {
    return json({ error: "権限を確認できませんでした" }, 503);
  }
  if (!allowed) return json({ error: "個別支援計画を作る職員だけが使えます" }, 403);

  const raw = await req.text();
  if (raw.length > MAX) return json({ error: "ファイルが大きすぎます。8MB以内にしてください" }, 400);
  let body: { data_url?: string };
  try { body = JSON.parse(raw); } catch (_) { return json({ error: "形式が正しくありません" }, 400); }
  const dataUrl = String(body.data_url || "");
  const m = /^data:(image\/(?:jpeg|jpg|png)|application\/pdf);base64,([A-Za-z0-9+/=\s]+)$/i.exec(dataUrl);
  if (!m) return json({ error: "PDF、JPEG、PNGを選んでください" }, 400);
  const mime = m[1].toLowerCase() === "image/jpg" ? "image/jpeg" : m[1].toLowerCase();
  const model = Deno.env.get("CHAMU_READ_MODEL") || "grok-4.7";
  let fileId = "";
  try {
    let text = "";
    if (mime === "application/pdf") {
      const bytes = decodeB64(m[2]);
      if (!bytes.length) return json({ error: "PDFを読めませんでした" }, 400);
      const form = new FormData();
      form.append("purpose", "assistants");
      form.append("file", new Blob([bytes], { type: "application/pdf" }), "plan.pdf");
      const upRaw = await xaiText(key, "https://api.x.ai/v1/files", "POST", {}, form);
      fileId = String(JSON.parse(upRaw).id || "");
      if (!fileId) return json({ error: "PDFを送れませんでした" }, 502);
      const chatRaw = await xaiText(key, "https://api.x.ai/v1/responses", "POST", { "Content-Type": "application/json" }, JSON.stringify({
        model,
        temperature: 0,
        input: [{ role: "user", content: [{ type: "input_text", text: PROMPT }, { type: "input_file", file_id: fileId }] }],
      }));
      text = outputText(JSON.parse(chatRaw));
    } else {
      const chatRaw = await xaiText(key, "https://api.x.ai/v1/chat/completions", "POST", { "Content-Type": "application/json" }, JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: [{ type: "text", text: PROMPT }, { type: "image_url", image_url: { url: `data:${mime};base64,${m[2].replace(/\s/g, "")}`, detail: "high" } }] }],
      }));
      text = JSON.parse(chatRaw)?.choices?.[0]?.message?.content || "";
    }
    const got = parseJson(text);
    const bodyText = String(got.body_text || "").trim().slice(0, 100000);
    if (!bodyText) return json({ error: "文字を読み取れませんでした。画像が鮮明か確認してください" }, 422);
    return json({
      kind: kindOf(got.kind),
      office_name: String(got.office_name || "").trim().slice(0, 120),
      author_name: String(got.author_name || "").trim().slice(0, 80),
      created_on: ymd(got.created_on),
      consent_on: ymd(got.consent_on),
      period_from: ymd(got.period_from),
      period_to: ymd(got.period_to),
      body_text: bodyText,
    });
  } catch (e) {
    const msg = String((e as Error).message || "");
    if (/abort/i.test(msg)) return json({ error: "読み取りが時間内に終わりませんでした" }, 504);
    return json({ error: "読み取れませんでした" }, 502);
  } finally {
    if (fileId) {
      fetch("https://api.x.ai/v1/files/" + fileId, { method: "DELETE", headers: { Authorization: "Bearer " + key } }).catch(() => {});
    }
  }
});
