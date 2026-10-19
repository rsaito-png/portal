// 水晶玉：sui_request（status='待ち'）の文字起こしから、xAI API で計画案の下書き(draft)を作って書き戻す。
// 呼び出し元：DBトリガー sui_request_fire（pg_net, service_role）。入力 {id}。
// シークレット: XAI_API_KEY（Supabase secrets）。ログ・応答・リポジトリに値を出さない。
import { createClient } from "npm:@supabase/supabase-js@2";

const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(Deno.env.get("SUPABASE_URL")!, SERVICE);
const XAI = Deno.env.get("XAI_API_KEY") ?? "";
const MODEL = Deno.env.get("SUI_MODEL") ?? "grok-4.7";

const SPEC = `あなたは日本の障害福祉の相談支援専門員を補助し、聞き取りの文字起こしからサービス等利用計画案の下書きを作る。
出力はJSONオブジェクトのみ（前置き・コードフェンス禁止）。値はすべて文字列。キーは次のとおり。
plan1: {intent(生活に対する意向), policy(総合的な援助の方針), long_goal(長期目標), short_goal(短期目標),
  goals: 最大4行の配列。各 {priority(優先順位 "1"〜), issue(解決すべき課題), goal(支援目標), target(達成時期), service(サービスの種類・内容・量), provider(提供事業者名・担当者・電話), role(本人の役割), eval(評価時期), note(留意事項)}}
plan2: {cells: 12行×8列の二次元配列（行は 6:00,8:00,10:00,12:00,14:00,16:00,18:00,20:00,22:00,0:00,2:00,4:00 の順。列は 月,火,水,木,金,土,日,祝 の順。各セルは週単位のサービス名や活動、なければ空文字）,
  activities: 12個の文字列（各行の「主な日常生活上の活動」）, other(週単位以外のサービス), overview(生活の全体像)}
monitoring（kind=継続のときのみ出力）: {interview_date, place, interviewer, period, client_intent, family_intent, long_status, short_status, service_eval, overall, new_needs, change_needed("要"か"不要"), change_reason, coordination, next_monitoring}
規則:
- 文字起こしに根拠のない事項（事業者名・電話・時期・サービス量・日付など）は作り込まず空文字にする。推測で補わない。
- 「えー」「あのー」などのフィラーは除き、「本人」「母」「父」等を用いた書き言葉の福祉計画の文体（である調・体言止め可）にする。
- 継続の場合は、前回の確定済み計画の目標とサービスを引き継ぎ、今回の文字起こしの内容で達成状況や変更を反映する。
- 新規は plan1 と plan2 のみ、継続は plan1・plan2・monitoring の3つ全て。header は出力しない。`;

async function fail(id: number, msg: string) {
  console.error("sui-draft failed", id, msg.slice(0, 300));
  await db.from("sui_request").update({ error: msg.slice(0, 1000) }).eq("id", id);
  return Response.json({ ok: false, error: msg.slice(0, 300) }, { status: 200 });
}

Deno.serve(async (req) => {
  if (req.headers.get("authorization") !== `Bearer ${SERVICE}`) return new Response("unauthorized", { status: 401 });
  const { id } = await req.json().catch(() => ({}));
  if (!id) return new Response("id required", { status: 400 });
  if (!XAI) return fail(id, "XAI_API_KEY 未設定");
  try {
    const { data: r } = await db.from("sui_request").select("*").eq("id", id).single();
    if (!r) return new Response("not found", { status: 404 });
    if (r.status !== "待ち") return Response.json({ skipped: r.status });
    const { data: u } = await db.from("sui_user").select("*").eq("id", r.user_id).single();
    let prev: unknown = [];
    if (r.kind === "継続") {
      const { data: p } = await db.from("sui_plan").select("plan_type, body, created_at").eq("user_id", r.user_id).eq("status", "確定").order("created_at", { ascending: false }).limit(6);
      prev = p ?? [];
    }
    const { header: _h, ...uinfo } = (u ?? {}) as Record<string, unknown>;
    const msg = `kind: ${r.kind}\n\n【利用者台帳】\n${JSON.stringify(uinfo)}\n\n` +
      (r.kind === "継続" ? `【前回の確定済み計画】\n${JSON.stringify(prev)}\n\n` : "") + `【今回の文字起こし】\n${r.transcript ?? ""}`;
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 150000);
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST", signal: ctl.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${XAI}` },
      body: JSON.stringify({ model: MODEL, response_format: { type: "json_object" }, temperature: 0.2,
        messages: [{ role: "system", content: SPEC }, { role: "user", content: msg }] }),
    });
    clearTimeout(to);
    if (!res.ok) return fail(id, `xAI ${res.status}: ${(await res.text()).replace(/xai-[A-Za-z0-9]+/g, "***").slice(0, 300)}`);
    const text = (await res.json()).choices?.[0]?.message?.content ?? "";
    const draft = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ""));
    if (!draft.plan1 || !draft.plan2) return fail(id, "draftにplan1/plan2がありません");
    if (r.kind !== "継続") delete draft.monitoring;
    else if (!draft.monitoring) return fail(id, "継続なのにmonitoringがありません");
    const { error } = await db.from("sui_request").update({ draft: { plan1: draft.plan1, plan2: draft.plan2, ...(draft.monitoring ? { monitoring: draft.monitoring } : {}) }, status: "作成済み", error: null, updated_at: new Date().toISOString() }).eq("id", id).eq("status", "待ち");
    if (error) return fail(id, "書き戻し失敗: " + error.message);
    return Response.json({ ok: true, id });
  } catch (e) { return fail(id, String((e as Error).message ?? e)); }
});
