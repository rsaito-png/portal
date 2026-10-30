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
basic（基本情報シート。常に出力）: {consult_route(相談に至った経緯), life_history(生育歴・生活歴), disability(障害・疾病の状況), medical(医療機関・服薬), health(健康状態), adl(日常生活の状況：食事・入浴・排せつ・移動・家事など), communication(意思疎通), social(社会参加・就労・就学), family(家族構成・家族の状況), housing(住まいの状況), income(収入・経済状況), current_services(現在利用しているサービス・関係機関), client_wish(本人の希望), family_wish(家族の希望), issues(課題・支援の必要性), note(特記事項)}
規則:
- 文字起こしに根拠のない事項（事業者名・電話・時期・サービス量・日付など）は作り込まず空文字にする。推測で補わない。
- 「えー」「あのー」などのフィラーは除き、「本人」「母」「父」等を用いた書き言葉の福祉計画の文体（である調・体言止め可）にする。
- 継続の場合は、前回の確定済み計画の目標とサービスを引き継ぎ、今回の文字起こしの内容で達成状況や変更を反映する。
- 新規は basic・plan1・plan2、継続は basic・plan1・plan2・monitoring の全て。header は出力しない。`;

// ---- 仮名化：xAIへ送る前に個人を特定できる値を置き換え、返ってきた文章で元に戻す ----
type Pair = [string, string]; // [本物, 仮の値]
function buildPairs(u: Record<string, unknown>): Pair[] {
  const pairs: Pair[] = [];
  const add = (v: unknown, tag: string) => {
    const s = String(v ?? "").trim(); if (s.length < 2) return;
    pairs.push([s, tag]);
    const parts = s.split(/[\s　]+/).filter((x) => x.length >= 2); // 姓・名だけで呼ばれる場合
    if (parts.length > 1) parts.forEach((x, i) => pairs.push([x, `${tag}${i === 0 ? "（姓）" : "（名）"}`]));
  };
  add(u.name, "利用者A"); add(u.name_kana, "リヨウシャA"); add(u.guardian_name, "保護者A");
  add(u.address, "［住所］"); add(u.phone, "［電話］");
  for (const k of ["jukyusha_fukushi", "jukyusha_chiiki", "jukyusha_jido"]) add(u[k], "［受給者証番号］");
  if (u.birth) { const b = String(u.birth); add(b, "［生年月日］"); const [y, m, d] = b.split("-").map(Number); if (y) add(`${y}年${m}月${d}日`, "［生年月日］"); }
  return pairs.sort((a, b) => b[0].length - a[0].length); // 長いものから置換
}
const mask = (t: string, pairs: Pair[]) => pairs.reduce((s, [real, fake]) => s.split(real).join(fake), t)
  .replace(/0\d{1,4}-?\d{1,4}-?\d{3,4}/g, "［電話］");
function unmask(v: unknown, pairs: Pair[]): unknown {
  // 姓・名の置換は戻さず、フルネームの仮名だけ戻す（「利用者A（姓）」等は本人表記に戻す）
  const back = pairs.filter(([, f]) => !f.startsWith("［")).map(([r, f]) => [f, r] as Pair).sort((a, b) => b[0].length - a[0].length);
  if (typeof v === "string") return back.reduce((s, [f, r]) => s.split(f).join(r), v);
  if (Array.isArray(v)) return v.map((x) => unmask(x, pairs));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, unmask(x, pairs)]));
  return v;
}
function ageBand(birth: unknown): string {
  if (!birth) return ""; const b = new Date(String(birth)); if (isNaN(+b)) return "";
  const a = Math.floor((Date.now() - +b) / 31557600000); return a < 18 ? `${a}歳` : `${Math.floor(a / 10) * 10}代`;
}

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
    const uu = (u ?? {}) as Record<string, unknown>;
    const pairs = buildPairs(uu);
    // 下書きに必要な項目だけ送る（氏名・住所・電話・生年月日・受給者証番号・保護者名は送らない）
    const uinfo = { 呼び方: "利用者A", 年齢: ageBand(uu.birth), 計画の種類: uu.kind, 障害支援区分: uu.shien_kubun, 保護者の続柄: uu.guardian_relation, モニタリング期間: uu.monitoring_period };
    const msg = mask(`kind: ${r.kind}\n\n【利用者情報】\n${JSON.stringify(uinfo)}\n\n` +
      (r.kind === "継続" ? `【前回の確定済み計画】\n${JSON.stringify(prev)}\n\n` : "") + `【今回の文字起こし】\n${r.transcript ?? ""}`, pairs);
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
    const draft = unmask(JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, "")), pairs) as Record<string, any>;
    if (!draft.plan1 || !draft.plan2) return fail(id, "draftにplan1/plan2がありません");
    if (r.kind !== "継続") delete draft.monitoring;
    else if (!draft.monitoring) return fail(id, "継続なのにmonitoringがありません");
    const out = { plan1: draft.plan1, plan2: draft.plan2, basic: draft.basic ?? {}, ...(draft.monitoring ? { monitoring: draft.monitoring } : {}) };
    // 録音後の自動作成：基本情報シート・計画案（計画1/計画2）・モニタリングを「下書き」で作る
    const made: Record<string, number> = {};
    const hdr = { user_name: uu.name, guardian_name: uu.guardian_name, guardian_relation: uu.guardian_relation, shien_kubun: uu.shien_kubun, jukyusha_fukushi: uu.jukyusha_fukushi, jukyusha_chiiki: uu.jukyusha_chiiki, jukyusha_jido: uu.jukyusha_jido, cap_amount: uu.cap_amount, monitoring_period: uu.monitoring_period };
    const { data: lb } = await db.from("sui_basic").select("version").eq("user_id", r.user_id).order("version", { ascending: false }).limit(1);
    const { data: b, error: be } = await db.from("sui_basic").insert({ user_id: r.user_id, version: (lb?.[0]?.version ?? 0) + 1, body: out.basic, request_id: id }).select("id").single();
    if (be) return fail(id, "基本情報シート作成失敗: " + be.message); made.basic = b.id;
    for (const [t, k] of [["計画1", "plan1"], ["計画2", "plan2"], ["モニタリング", "monitoring"]] as const) {
      const body = (out as Record<string, any>)[k]; if (!body) continue;
      const { data: lv } = await db.from("sui_plan").select("version").eq("user_id", r.user_id).eq("plan_type", t).order("version", { ascending: false }).limit(1);
      const { data: p, error: pe } = await db.from("sui_plan").insert({ user_id: r.user_id, plan_type: t, version: (lv?.[0]?.version ?? 0) + 1, kind: r.kind, doc_class: t === "モニタリング" ? null : "計画案", status: "下書き", body: { ...body, header: hdr } }).select("id").single();
      if (pe) return fail(id, `${t}作成失敗: ` + pe.message); made[k] = p.id;
    }
    const { error } = await db.from("sui_request").update({ draft: out, made, status: "作成済み", error: null, updated_at: new Date().toISOString() }).eq("id", id).eq("status", "待ち");
    if (error) return fail(id, "書き戻し失敗: " + error.message);
    return Response.json({ ok: true, id });
  } catch (e) { return fail(id, String((e as Error).message ?? e)); }
});
