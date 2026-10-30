// レオ実費（leo_jippi）の Square 支払いリンク（CreatePaymentLink の quick_pay）を作る。
// 呼べるのは can_manage（児発管・管理者・事務）だけ。金額は DB の lunch+snack。リクエストの金額は見ない。
// シークレットはストレスチェック研修と同じ SQUARE_ACCESS_TOKEN / SQUARE_LOCATION_ID / SQUARE_ENVIRONMENT。
// 値はこのファイルに書かない。画面にも出さない。
// 0円は作らない。pay_link があり、pay_link_amount が今の合計と同じなら作り直さない。
// 金額が変わったときは新しいリンクを作り pay_link を上書きする。
// 古いリンクは Square 上では無効化しない（リンク ID を保存していない。画面と文面は新しい URL だけを使う）。
// 入金の確認は LINE 運用のまま。payment_note は「leo-jippi YYYY-MM」なので、
// square-webhook は sct_payments に紐づけず無視する（webhook は変更しない）。
import { CORS, authUser, env, json, userRpc } from "../_shared/http.ts";
import { jippiIdempotencyKey, jippiNeedsLink, jippiPaymentNote } from "../_shared/jippi_link.ts";
import { hostedCheckoutUrl, squareApiBase, SQUARE_VERSION } from "../_shared/square.ts";

const YM = /^\d{4}-(0[1-9]|1[0-2])$/;

function userHeaders(req: Request, prefer?: string) {
  const headers: Record<string, string> = {
    apikey: env("SUPABASE_ANON_KEY"),
    Authorization: req.headers.get("Authorization") ?? "",
  };
  if (prefer) headers.Prefer = prefer;
  return headers;
}

async function userFetch(req: Request, path: string, opt: { method?: string; body?: unknown; prefer?: string } = {}) {
  const headers = userHeaders(req, opt.prefer);
  if (opt.body !== undefined) headers["Content-Type"] = "application/json";
  const r = await fetch(env("SUPABASE_URL") + "/rest/v1/" + path, {
    method: opt.method || "GET",
    headers,
    body: opt.body === undefined ? undefined : JSON.stringify(opt.body),
  });
  const text = await r.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  return { ok: r.ok, status: r.status, body };
}

async function squareFetch(path: string, opt: { method?: string; body?: unknown } = {}) {
  const token = env("SQUARE_ACCESS_TOKEN");
  const base = squareApiBase(env("SQUARE_ENVIRONMENT"));
  if (!token || !base) return { ok: false, status: 0, body: null as Record<string, unknown> | null };
  const r = await fetch(base + path, {
    method: opt.method || "GET",
    headers: {
      Authorization: "Bearer " + token,
      "Square-Version": SQUARE_VERSION,
      "Content-Type": "application/json",
    },
    body: opt.body === undefined ? undefined : JSON.stringify(opt.body),
    signal: AbortSignal.timeout(20000),
  });
  const text = await r.text();
  let body: Record<string, unknown> | null = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  return { ok: r.ok, status: r.status, body };
}

function linkUrl(body: Record<string, unknown> | null) {
  const link = body && body.payment_link as { url?: string } | undefined;
  return hostedCheckoutUrl(link && link.url);
}

function errMessage(body: unknown) {
  if (body && typeof body === "object" && "message" in body) return String((body as { message: unknown }).message || "");
  return "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const user = await authUser(req);
  if (!user?.id) return json({ error: "ログインしてください" }, 401);
  const gate = await userRpc(req, "can_manage", {});
  if (!gate.ok) return json({ error: "権限を確認できません" }, 403);
  if (gate.body !== true) return json({ error: "児発管・管理者・事務だけが使えます" }, 403);

  let raw: unknown = {};
  try { raw = await req.json(); } catch { raw = {}; }
  const body = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as { ym?: unknown; child?: unknown } : {};
  const ym = typeof body.ym === "string" ? body.ym : "";
  const child = typeof body.child === "string" ? body.child.trim() : "";
  if (!YM.test(ym)) return json({ error: "月は 2026-09 の形で指定してください" }, 400);
  if ("child" in body && body.child != null && typeof body.child !== "string") return json({ error: "児童名を確認してください" }, 400);
  if (typeof body.child === "string" && !child) return json({ error: "児童名が空です" }, 400);
  if (child && (child.length > 80 || /[\u0000-\u001f]/.test(child))) return json({ error: "児童名を確認してください" }, 400);

  let path = "leo_jippi?ym=eq." + ym + "&select=ym,child,lunch,snack,pay_link,pay_link_amount&order=child";
  if (child) path += "&child=eq." + encodeURIComponent(child);
  const list = await userFetch(req, path);
  if (!list.ok) {
    const msg = errMessage(list.body);
    if (msg.includes("pay_link_amount")) return json({ error: "pay_link_amount 列がありません。supabase/leo_jippi.sql を実行してください。" }, 500);
    return json({ error: "実費を読めませんでした" }, 500);
  }
  const rows = Array.isArray(list.body) ? list.body as Record<string, unknown>[] : [];
  if (child && !rows.length) return json({ created: 0, unchanged: 0, zero: 0, failed: 0, missing: 1, results: [] });

  const plans = rows.map((row) => ({ row, plan: jippiNeedsLink(row) }));
  const needsSquare = plans.some((p) => p.plan.action === "create");
  const location = env("SQUARE_LOCATION_ID").trim();
  if (needsSquare && (!env("SQUARE_ACCESS_TOKEN") || !squareApiBase(env("SQUARE_ENVIRONMENT")) || !location)) {
    return json({ error: "決済の接続が未設定です（SQUARE_ACCESS_TOKEN / SQUARE_LOCATION_ID / SQUARE_ENVIRONMENT）" }, 501);
  }

  let created = 0, unchanged = 0, zero = 0, failed = 0;
  const results: { child: string; action: string; amount?: number; error?: string }[] = [];
  for (const item of plans) {
    const name = String(item.row.child || "");
    const plan = item.plan;
    if (plan.action === "zero") { zero++; results.push({ child: name, action: "zero", amount: 0 }); continue; }
    if (plan.action === "unchanged") { unchanged++; results.push({ child: name, action: "unchanged", amount: plan.amount }); continue; }
    if (plan.action === "bad") { failed++; results.push({ child: name, action: "error", error: "金額を確認してください" }); continue; }

    const [y, mo] = ym.split("-");
    const label = ("レオ 実費 " + y + "年" + Number(mo) + "月 " + name).slice(0, 200);
    const payload = {
      idempotency_key: await jippiIdempotencyKey(ym, name, plan.amount),
      description: label,
      quick_pay: { name: label, price_money: { amount: plan.amount, currency: "JPY" }, location_id: location },
      payment_note: jippiPaymentNote(ym),
      checkout_options: {
        allow_tipping: false,
        ask_for_shipping_address: false,
        enable_coupon: false,
        enable_loyalty: false,
      },
    };
    let made: { ok: boolean; status: number; body: Record<string, unknown> | null };
    try { made = await squareFetch("/v2/online-checkout/payment-links", { method: "POST", body: payload }); }
    catch { failed++; results.push({ child: name, action: "error", error: "Squareに接続できませんでした" }); continue; }
    if (made.status === 429) {
      failed++;
      results.push({ child: name, action: "error", error: "Squareが混み合っています" });
      return json({ error: "Squareが混み合っています。少し待ってからもう一度押してください。", created, unchanged, zero, failed, missing: 0, stopped: true, results }, 429);
    }
    if (made.status === 401 || made.status === 403) {
      failed++;
      results.push({ child: name, action: "error", error: "Squareの接続が拒否されました" });
      return json({ error: "Squareの接続が拒否されました。トークンと環境を確認してください。", created, unchanged, zero, failed, missing: 0, stopped: true, results }, 502);
    }
    const url = linkUrl(made.body);
    if (!made.ok || !url) { failed++; results.push({ child: name, action: "error", error: "Squareでリンクを作れませんでした" }); continue; }

    // 金額が同じ行を同時に作っても、先に保存されたリンクは上書きしない。
    const patchPath = "leo_jippi?ym=eq." + ym + "&child=eq." + encodeURIComponent(name)
      + "&or=(pay_link.is.null,pay_link_amount.is.null,pay_link_amount.neq." + plan.amount + ")";
    const saved = await userFetch(req, patchPath, { method: "PATCH", prefer: "return=representation", body: { pay_link: url, pay_link_amount: plan.amount } });
    const savedRows = Array.isArray(saved.body) ? saved.body : [];
    if (saved.ok && savedRows.length) { created++; results.push({ child: name, action: "created", amount: plan.amount }); continue; }
    const again = await userFetch(req, "leo_jippi?ym=eq." + ym + "&child=eq." + encodeURIComponent(name) + "&select=pay_link,pay_link_amount");
    const now = Array.isArray(again.body) ? again.body[0] as { pay_link?: string; pay_link_amount?: number } | undefined : undefined;
    if (now && typeof now.pay_link === "string" && now.pay_link.startsWith("https://") && Number(now.pay_link_amount) === plan.amount) {
      unchanged++;
      results.push({ child: name, action: "unchanged", amount: plan.amount });
      continue;
    }
    failed++;
    results.push({ child: name, action: "error", error: "リンクを保存できませんでした" });
  }
  return json({ created, unchanged, zero, failed, missing: 0, results });
});
