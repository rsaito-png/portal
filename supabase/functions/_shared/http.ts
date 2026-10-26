export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

export function env(name: string) {
  return Deno.env.get(name) ?? "";
}

export async function authUser(req: Request) {
  const r = await fetch(env("SUPABASE_URL") + "/auth/v1/user", {
    headers: { apikey: env("SUPABASE_ANON_KEY"), Authorization: req.headers.get("Authorization") ?? "" },
  });
  if (!r.ok) return null;
  return await r.json();
}

export async function userRpc(req: Request, fn: string, args: Record<string, unknown>) {
  const r = await fetch(env("SUPABASE_URL") + "/rest/v1/rpc/" + fn, {
    method: "POST",
    headers: {
      apikey: env("SUPABASE_ANON_KEY"),
      Authorization: req.headers.get("Authorization") ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  const text = await r.text();
  return { ok: r.ok, status: r.status, body: text ? JSON.parse(text) : null };
}

async function serviceFetch(path: string, opt: RequestInit = {}) {
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const headers = new Headers(opt.headers);
  headers.set("apikey", key);
  headers.set("Authorization", "Bearer " + key);
  if (!headers.has("Content-Type") && opt.body) headers.set("Content-Type", "application/json");
  return fetch(env("SUPABASE_URL") + "/rest/v1/" + path, { ...opt, headers });
}

export async function serviceSelect(path: string) {
  const r = await serviceFetch(path);
  if (!r.ok) throw new Error("db " + r.status);
  return await r.json();
}

export async function serviceInsert(table: string, row: unknown, prefer = "return=representation") {
  return serviceFetch(table, { method: "POST", headers: { Prefer: prefer }, body: JSON.stringify(row) });
}

export async function serviceUpdate(path: string, row: unknown) {
  return serviceFetch(path, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(row) });
}

export function safeEqual(a: string, b: string) {
  const ae = new TextEncoder().encode(a);
  const be = new TextEncoder().encode(b);
  if (ae.length !== be.length) return false;
  let x = 0;
  for (let i = 0; i < ae.length; i++) x |= ae[i] ^ be[i];
  return x === 0;
}

export async function hmacHex(secret: string, payload: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
