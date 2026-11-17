// 茶夢：chamu_plan_requests（status=待ち）から個別支援計画5書類の下書きを作り、下書きの行だけに書き戻す。
// 呼び出し元：DBトリガー chamu_plan_request_fire（pg_net, service_role）。入力 {id}。
// シークレット: XAI_API_KEY。鍵はログにも応答にも出さない。verify_jwt は true（sui-draft と同じ。Bearer は service_role）。
import { createClient } from "npm:@supabase/supabase-js@2";
import { checkPlanText, maskNames, namePieces, normName } from "./rules.js";

const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", SERVICE);
const XAI = Deno.env.get("XAI_API_KEY") ?? "";
const MODEL = Deno.env.get("CHAMU_PLAN_MODEL") ?? "grok-4.7";

const SPEC = `あなたは生活介護事業所「茶夢」（社会福祉法人星心会、四日市）のサービス管理責任者を補助し、個別支援計画の下書きを作る。
出力はJSONオブジェクトのみ（前置き・コードフェンス禁止）。値はすべて文字列。キーは assessment, monitoring, genan, kaigi, honan。
各文字列は簡易マークアップ。行頭の「#T 」は中央の見出し、「#R 」は右寄せ。表や箇条書き記号は使わない。

書類:
- assessment: アセスメントシート。基本情報、現在の生活、課題、本人の意向。
- monitoring: 前期の評価。前期の目標ごとに、期間中の様子と次への見通し。前期の計画が無いときは、その旨と【要確認】。
- genan: 個別支援計画書（原案）。総合的な援助の方針、長期目標、短期目標、支援内容、提供時間。
- kaigi: 担当者会議録。見出しと枠だけ。出席者・開催日・会議の内容は必ず【要確認】。記録から出席者や日付を埋めない。
- honan: 個別支援計画書（本案）。原案と同じ骨子。会議で決める箇所は【要確認】。

規則:
- 根拠にしてよいのは、渡された前期の計画、対象期間のその人の日誌、サービス等利用計画の本文、利用者基本情報だけ。
- 記録にない意向、会議の日付、出席者、家族構成・家族の状況は作らず【要確認】と書く。
- 提供時間は10:30〜16:30。昼休憩は12:30〜13:30。これは事業所の決めなので【要確認】にしない。
- 作成者・サービス管理責任者は「齊藤 連」。この名前は作成者の行に書いてよい。
- 利用者本人の名前は書いてよい。それ以外の利用者の名前、職員の名前は書かない。「他の利用者」「職員」とする。
- である調。日誌に無い出来事を作らない。推測で補わない。
- 予定日は「予定」と分かる書き方にし、開催した事実のようには書かない。`;

const DOCS = ["assessment", "monitoring", "genan", "kaigi", "honan"] as const;

function redact(s: string): string {
  let out = s.replace(/xai-[A-Za-z0-9._-]+/g, "***").replace(/Bearer\s+\S+/gi, "Bearer ***");
  if (XAI) out = out.split(XAI).join("***");
  if (SERVICE) out = out.split(SERVICE).join("***");
  return out;
}

async function fail(id: number, msg: string) {
  const error = redact(msg).slice(0, 1000);
  console.error("chamu-plan-draft failed", id, error.slice(0, 180));
  await db.from("chamu_plan_requests").update({ status: "エラー", error, updated_at: new Date().toISOString() }).eq("id", id);
  return Response.json({ ok: false }, { status: 200 });
}

function clip(s: string, n = 50000) {
  const t = String(s || "").trim();
  return t.length > n ? t.slice(0, n) : t;
}

function rawText(raw: unknown) {
  if (!raw || typeof raw !== "object") return "";
  return Object.values(raw as Record<string, unknown>).map((v) => typeof v === "string" ? v.trim() : "").filter(Boolean).join(" ").slice(0, 400);
}

function lineOf(row: Record<string, unknown>, day: string) {
  const present = row.present === false || row.attendance === "欠席" ? "欠席" : row.present === true || row.attendance === "出席" ? "出席" : String(row.attendance || "");
  const bits = [day, present, [row.start_time, row.end_time].filter(Boolean).join("〜"), row.meal ? `食事${row.meal}` : "", row.transport ? `送迎${row.transport}` : ""].filter(Boolean);
  const note = clip(String(row.support_note || row.note || ""), 400);
  return `${bits.join(" ")} ${note}`.trim();
}

async function ask(user: string) {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), 100000);
  try {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      signal: ctl.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${XAI}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: SPEC }, { role: "user", content: user }],
      }),
    });
    if (!res.ok) throw new Error(`xAI ${res.status}: ${redact(await res.text()).slice(0, 300)}`);
    const text = (await res.json()).choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(String(text).replace(/^```(?:json)?\s*|\s*```$/g, ""));
    const out: Record<string, string> = {};
    for (const k of DOCS) out[k] = typeof parsed[k] === "string" ? parsed[k].trim() : "";
    return out;
  } finally {
    clearTimeout(to);
  }
}

function ensureKaigi(text: string) {
  if (text.includes("【要確認】")) return text;
  return `${text}\n\n【出席者】【要確認】\n【開催日】【要確認】\n【会議の内容】【要確認】\n`.trim();
}

Deno.serve(async (req) => {
  if ((req.headers.get("authorization") || "") !== `Bearer ${SERVICE}`) return new Response("unauthorized", { status: 401 });
  const body = await req.json().catch(() => ({}));
  const id = Number(body.id);
  if (!id) return new Response("id required", { status: 400 });
  if (!XAI) return fail(id, "XAI_API_KEY 未設定");
  try {
    const { data: reqRow } = await db.from("chamu_plan_requests").select("id,plan_id,status").eq("id", id).single();
    if (!reqRow) return new Response("not found", { status: 404 });
    if (reqRow.status !== "待ち") return Response.json({ skipped: reqRow.status });
    const { data: plan } = await db.from("chamu_plans").select("*").eq("id", reqRow.plan_id).single();
    if (!plan) return fail(id, "計画がありません");
    if (plan.status !== "下書き") return fail(id, "下書きではないため書き戻しませんでした");

    const { data: user } = await db.from("chamu_users").select("id,name,kana,active,support_level,contract_start,contract_end,service_start,meal_addon,transport_class").eq("id", plan.user_id).single();
    if (!user) return fail(id, "利用者がありません");

    const { data: others } = await db.from("chamu_users").select("name,kana").neq("id", plan.user_id);
    const { data: staffRows } = await db.from("staff_profiles").select("full_name,nikki_name,chamu_record_name").eq("active", true);
    const { data: prevRows } = await db.from("chamu_plans").select("term_no,start_on,end_on,honan,genan").eq("user_id", plan.user_id).lt("term_no", plan.term_no).order("term_no", { ascending: false }).limit(1);
    const { data: svcRows } = await db.from("chamu_service_plans").select("kind,office_name,author_name,created_on,consent_on,period_from,period_to,body_text,updated_at").eq("user_id", plan.user_id).order("updated_at", { ascending: false }).limit(5);
    const { data: days } = await db.from("chamu_journal").select("id,journal_date,staff_name").gte("journal_date", plan.start_on).lte("journal_date", plan.end_on);
    const dayById = new Map((days || []).map((d) => [d.id, d]));
    let lines: Record<string, unknown>[] = [];
    const ids = (days || []).map((d) => d.id);
    if (ids.length) {
      const { data, error } = await db.from("chamu_journal_line").select("journal_id,present,start_time,end_time,transport,meal,intake,support_note").eq("user_id", plan.user_id).in("journal_id", ids);
      if (error) return fail(id, "日誌を読めませんでした");
      lines = data || [];
    }
    const { data: archOwn } = await db.from("chamu_journal_archive").select("journal_date,user_name,present,attendance,start_time,end_time,transport,meal,support_note,note,staff_name,raw").eq("user_id", plan.user_id).gte("journal_date", plan.start_on).lte("journal_date", plan.end_on);
    const { data: archLoose } = await db.from("chamu_journal_archive").select("journal_date,user_name,present,attendance,start_time,end_time,transport,meal,support_note,note,staff_name,raw").is("user_id", null).gte("journal_date", plan.start_on).lte("journal_date", plan.end_on);
    const wantName = normName(user.name);
    const wantKana = normName(user.kana);
    const loose = (archLoose || []).filter((r) => {
      const n = normName(r.user_name);
      return !!n && (n === wantName || (wantKana && n === wantKana));
    });

    const otherNames = (others || []).flatMap((u) => [u.name, u.kana].filter(Boolean));
    const staffNames = new Set<string>();
    for (const s of staffRows || []) for (const v of [s.full_name, s.nikki_name, s.chamu_record_name]) if (v) staffNames.add(v);
    for (const d of days || []) if (d.staff_name) staffNames.add(d.staff_name);
    for (const r of [...(archOwn || []), ...loose]) if (r.staff_name) staffNames.add(String(r.staff_name));
    const staffList = [...staffNames];
    const keep = new Set([...namePieces(user.name), ...namePieces(user.kana), ...namePieces("齊藤 連")]);
    const safe = (names: string[]) => {
      const out: string[] = [];
      for (const n of names) for (const p of namePieces(n)) {
        if (keep.has(p) || [...keep].some((s) => s.includes(p))) continue;
        out.push(p);
      }
      return out;
    };
    const mask = (t: string) => maskNames(maskNames(t, safe(otherNames), "他の利用者"), safe(staffList), "職員");

    const journalText = lines.map((ln) => {
      const day = dayById.get(ln.journal_id as string);
      return lineOf(ln, day ? String(day.journal_date) : "");
    }).concat([...(archOwn || []), ...loose].map((r) => lineOf({ ...r, support_note: r.support_note || rawText(r.raw) }, String(r.journal_date))))
      .filter(Boolean).slice(0, 180).join("\n");
    const prev = prevRows?.[0];
    const prevBody = prev ? (prev.honan || prev.genan || "") : "";
    const svc = (svcRows || []).slice().sort((a, b) => String(b.created_on || b.updated_at).localeCompare(String(a.created_on || a.updated_at)))[0];
    const uinfo = {
      氏名: user.name,
      カナ: user.kana || "",
      障害支援区分: user.support_level ?? "",
      契約開始: user.contract_start || "",
      契約終了: user.contract_end || "",
      サービス開始: user.service_start || "",
      食事提供: user.meal_addon ? "対象" : "非対象",
      送迎: user.transport_class || "",
    };
    const prompt = mask([
      `第${plan.term_no}期 ${plan.start_on}〜${plan.end_on}`,
      `予定の目安（開催した事実ではない）: アセスメント ${plan.assess_on || ""}、原案 ${plan.genan_on || ""}、会議 ${plan.kaigi_on || ""}、本案 ${plan.honan_on || ""}`,
      `作成者: 齊藤 連`,
      `【利用者】\n${JSON.stringify(uinfo)}`,
      `【前期の計画（本案を優先）】\n${prev ? `第${prev.term_no}期 ${prev.start_on}〜${prev.end_on}\n${clip(String(prevBody), 8000)}` : "ポータルに前期の計画はない"}`,
      `【サービス等利用計画】\n${svc ? `${svc.kind || ""} ${svc.office_name || ""} ${svc.author_name || ""} ${svc.period_from || ""}〜${svc.period_to || ""}\n${clip(String(svc.body_text || ""), 8000)}` : "登録なし"}`,
      `【対象期間の日誌（この人の行だけ）】\n${clip(journalText, 14000) || "記録なし"}`,
    ].join("\n\n"));

    const ctx = { userName: user.name, author: "齊藤 連", otherNames, staffNames: staffList };
    let draft = await ask(prompt);
    let problems = missing(draft).concat(checkPlanText(Object.values(draft).join("\n"), ctx));
    if (problems.length) {
      const hint = problems.includes("空")
        ? "5つのキーをすべて文字列で出してください。"
        : "利用者本人とサービス管理責任者「齊藤 連」以外の個人名を書かないでください。他の利用者は「他の利用者」、職員は「職員」にして、同じJSONを出し直してください。";
      draft = await ask(`${prompt}\n\n【作り直し】${hint}`);
      problems = missing(draft).concat(checkPlanText(Object.values(draft).join("\n"), ctx));
    }
    if (problems.length) {
      return fail(id, problems.includes("空") ? "5書類が揃いませんでした" : "他の利用者名または職員名が残ったため、下書きは保存しませんでした");
    }
    draft.kaigi = ensureKaigi(draft.kaigi);
    const patch = {
      assessment: clip(draft.assessment),
      monitoring: clip(draft.monitoring),
      genan: clip(draft.genan),
      kaigi: clip(draft.kaigi),
      honan: clip(draft.honan),
      source_meta: { request_id: id, model: MODEL, at: new Date().toISOString() },
    };
    const { data: updated, error } = await db.from("chamu_plans").update(patch).eq("id", plan.id).eq("status", "下書き").select("id");
    if (error) return fail(id, "書き戻し失敗: " + error.message);
    if (!updated || !updated.length) return fail(id, "下書きではないため書き戻しませんでした");
    await db.from("chamu_plan_requests").update({ status: "作成済み", error: null, updated_at: new Date().toISOString() }).eq("id", id).eq("status", "待ち");
    return Response.json({ ok: true, id });
  } catch (e) {
    return fail(id, String((e as Error).message ?? e));
  }
});

function missing(draft: Record<string, string>) {
  return DOCS.some((k) => !draft[k]) ? ["空"] : [];
}
