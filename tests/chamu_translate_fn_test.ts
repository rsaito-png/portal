// 茶夢の翻訳関数。ネットワークには出さない。CHAMU_TRANSLATE_NO_SERVE を先に立ててから読む。
Deno.env.set("CHAMU_TRANSLATE_NO_SERVE", "1");
const { handleChamuTranslate, cleanTranslation } = await import("../supabase/functions/chamu-translate/index.ts");

type Call = { url: string; init: RequestInit };
const post = (body: unknown, auth = "Bearer user-jwt") => new Request("https://example.test/functions/v1/chamu-translate", {
  method: "POST",
  headers: auth ? { Authorization: auth, "Content-Type": "application/json" } : { "Content-Type": "application/json" },
  body: typeof body === "string" ? body : JSON.stringify(body),
});

function harness(opt: { can?: boolean | "throw" | number; xai?: (body: any) => Response; env?: Record<string, string> } = {}) {
  const calls: Call[] = [];
  const env: Record<string, string> = {
    SUPABASE_URL: "https://example.test",
    SUPABASE_ANON_KEY: "anon-test",
    XAI_API_KEY: "xai-testkey1234567890",
    ...opt.env,
  };
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init: init || {} });
    if (url.includes("/rpc/chamu_can")) {
      if (opt.can === "throw") throw new Error("rpc down");
      if (typeof opt.can === "number") return new Response('{"message":"permission denied"}', { status: opt.can });
      return new Response(opt.can === false ? "false" : "true", { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.includes("api.x.ai")) {
      const body = JSON.parse(String(init?.body || "{}"));
      return opt.xai ? opt.xai(body) : new Response(JSON.stringify({ choices: [{ message: { content: "こんにちは" } }] }), { status: 200 });
    }
    return new Response("unexpected", { status: 500 });
  };
  const deps = { env: (k: string) => env[k], fetch: fetchImpl };
  return { calls, deps, env };
}

Deno.test("空と前置きを落とす", () => {
  if (cleanTranslation("```json\nこんにちは\n```") !== "こんにちは") throw new Error("fence");
  if (cleanTranslation("翻訳：こんにちは") !== "こんにちは") throw new Error("prefix");
  if (cleanTranslation("João は落ち着いていた") !== "João は落ち着いていた") throw new Error("name");
});

Deno.test("権限がないと訳さない", async () => {
  const h = harness({ can: false });
  const res = await handleChamuTranslate(post({ text: "olá" }), h.deps);
  const body = await res.json();
  if (res.status !== 403 || body.error !== "この操作の権限がありません") throw new Error(JSON.stringify(body));
  if (h.calls.some((c) => c.url.includes("api.x.ai"))) throw new Error("xAI を呼んだ");
  if (!h.calls[0].url.endsWith("/rpc/chamu_can")) throw new Error("chamu_can を見ていない");
  const headers = h.calls[0].init.headers as Record<string, string>;
  if (headers.Authorization !== "Bearer user-jwt" || headers.apikey !== "anon-test") throw new Error("RPC の認可が違う");
});

Deno.test("ログインなしと anon 失敗は訳さない", async () => {
  const none = harness();
  const a = await handleChamuTranslate(post({ text: "olá" }, ""), none.deps);
  if (a.status !== 401) throw new Error("no auth " + a.status);
  if (none.calls.length) throw new Error("未ログインで通信した");
  const denied = harness({ can: 401 });
  const b = await handleChamuTranslate(post({ text: "olá" }), denied.deps);
  if (b.status !== 403) throw new Error("rpc 401 " + b.status);
  if (denied.calls.some((c) => c.url.includes("api.x.ai"))) throw new Error("拒否なのに xAI");
});

Deno.test("空・長すぎ・壊れたJSONは400", async () => {
  for (const [body, status] of [
    [{ text: "  " }, 400],
    [{ text: "あ".repeat(2001) }, 400],
    [{ text: 1 }, 400],
    ["{]", 400],
    ["x".repeat(20001), 400],
  ] as const) {
    const h = harness();
    const res = await handleChamuTranslate(post(body), h.deps);
    if (res.status !== status) throw new Error(res.status + " " + JSON.stringify(body).slice(0, 40));
    if (h.calls.some((c) => c.url.includes("api.x.ai"))) throw new Error("不正入力で xAI");
  }
});

Deno.test("ポルトガル語を日本語にして原文は送るだけ", async () => {
  let sent: any = null;
  const h = harness({
    xai: (body) => {
      sent = body;
      return new Response(JSON.stringify({ choices: [{ message: { content: "```\n翻訳：こんにちは\n```" } }] }), { status: 200 });
    },
  });
  const res = await handleChamuTranslate(post({ text: "  olá, João  " }), h.deps);
  const body = await res.json();
  if (res.status !== 200 || body.translated !== "こんにちは") throw new Error(JSON.stringify(body));
  if (sent.model !== "grok-4-fast-non-reasoning" || sent.temperature !== 0) throw new Error("model");
  if (!sent.messages[0].content.includes("固有名詞") || !sent.messages[0].content.includes("訳文だけ")) throw new Error("prompt");
  if (sent.messages[1].content !== "olá, João") throw new Error("text");
  const auth = (h.calls.find((c) => c.url.includes("api.x.ai"))!.init.headers as Record<string, string>).Authorization;
  if (auth !== "Bearer xai-testkey1234567890") throw new Error("xAI auth");
  if (JSON.stringify(body).includes("xai-testkey")) throw new Error("key leak");
});

Deno.test("AI_MODEL と失敗メッセージ", async () => {
  const h = harness({
    env: { AI_MODEL: "grok-test" },
    xai: (body) => {
      if (body.model !== "grok-test") throw new Error("model override");
      return new Response("xai-testkey1234567890 boom", { status: 500 });
    },
  });
  const res = await handleChamuTranslate(post({ text: "olá" }), h.deps);
  const body = await res.json();
  if (res.status !== 502) throw new Error(String(res.status));
  if (!String(body.error).includes("翻訳できませんでした")) throw new Error(body.error);
  if (JSON.stringify(body).includes("xai-testkey") || JSON.stringify(body).includes("boom")) throw new Error("detail leak");
});

Deno.test("キー未設定と権限確認の失敗", async () => {
  const nokey = harness({ env: { XAI_API_KEY: "" } });
  const a = await handleChamuTranslate(post({ text: "olá" }), nokey.deps);
  if (a.status !== 501) throw new Error("nokey " + a.status);
  if (nokey.calls.some((c) => c.url.includes("api.x.ai"))) throw new Error("key なしで xAI");
  const down = harness({ can: "throw" });
  const b = await handleChamuTranslate(post({ text: "olá" }), down.deps);
  if (b.status !== 503) throw new Error("down " + b.status);
});

Deno.test("訳文が配列でも空でも扱う", async () => {
  const parts = harness({ xai: () => new Response(JSON.stringify({ choices: [{ message: { content: [{ text: "やあ" }] } }] }), { status: 200 }) });
  const a = await (await handleChamuTranslate(post({ text: "oi" }), parts.deps)).json();
  if (a.translated !== "やあ") throw new Error(JSON.stringify(a));
  const empty = harness({ xai: () => new Response(JSON.stringify({ choices: [{ message: { content: "```" } }] }), { status: 200 }) });
  const b = await handleChamuTranslate(post({ text: "oi" }), empty.deps);
  if (b.status !== 502) throw new Error("empty " + b.status);
});
