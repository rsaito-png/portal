// 修了証を発行し、印刷用HTMLを返す。判定は sct_issue_certificate（本人確認と必要分数。テストの合否は見ない）。
// 呼び出しは受講者本人、または運営（事務 / sct_admin）が user_id を指定。PDFはブラウザの印刷。
import { CORS, authUser, env, json, serviceSelect, userRpc } from "../_shared/http.ts";
import { certHtml } from "../_shared/cert.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const user = await authUser(req);
  if (!user?.id) return json({ error: "ログインしてください" }, 401);
  const body = await req.json().catch(() => ({}));
  let target = user.id as string;
  if (body.user_id && body.user_id !== user.id) {
    const adm = await userRpc(req, "sct_is_admin", {});
    if (!adm.ok || adm.body !== true) return json({ error: "権限がありません" }, 403);
    target = body.user_id;
  }
  const issued = await userRpc(req, "sct_issue_certificate", { p_user: target });
  if (!issued.ok) return json({ error: issued.body?.message || issued.body || "発行できません" }, 400);
  const key = env("SUPABASE_ANON_KEY");
  const r = await fetch(env("SUPABASE_URL") + "/rest/v1/sct_certificates?id=eq." + issued.body + "&select=id,snapshot,issued_on,full_name", {
    headers: { apikey: key, Authorization: req.headers.get("Authorization") ?? "" },
  });
  const rows = r.ok ? await r.json() : await serviceSelect("sct_certificates?id=eq." + issued.body + "&select=id,snapshot,issued_on,full_name");
  const row = rows[0];
  if (!row) return json({ error: "修了証を読めません" }, 500);
  const snap = row.snapshot || {};
  return json({ id: row.id, snapshot: snap, html: certHtml(snap) });
});
