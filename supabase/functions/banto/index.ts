// 番頭さんAI：banto_msg に書き込まれた報連相を、DBトリガー（pg_net）から即時に受けて xAI で回答する。
// 自力で答えられるものは回答して完了、会長の判断が要るものは「取り次ぎ」にして要約・番頭の意見をつける。
// 呼び出しは x-banto-secret（private_config と関数secret BANTO_SECRET）で確認。キー類はリポジトリに書かない。
import { createClient } from "npm:@supabase/supabase-js@2";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const AI = Deno.env.get("XAI_API_KEY"), SECRET = Deno.env.get("BANTO_SECRET") ?? "";
const ESC = "会長の判断が要りそうなので、会長に取り次ぎました。お返事はこの画面に出ますので、少しお待ちくださいませ。";
const SYS = `あなたは福祉事業所グループ（放課後等デイサービス「レオ」、RYDEEN、水晶玉、きんとうん など）の「番頭さん」です。会長（齊藤）の右腕として、職員からの報連相（報告・連絡・相談）を受けます。
口調：やわらかい敬語。少しだけ江戸の番頭風（「〜でございます」「承知いたしました」など）でもよいが、読みやすさを最優先。短く具体的に。
役職（江戸職階）：大老＝加藤、レオ奉行＝中村友香、RYDEEN・水晶玉奉行＝河合尚美、総務奉行＝宮本幸子、監査奉行＝安藤。「リーダー」という語は絶対に使わない。
ポータル（https://rsaito-png.github.io/portal/）の主な場所：注進・評定所（毎日の注進とToDo）、人事労務の相談所（総務奉行だけが読む）、法定研修、各事業所のページ（ヒヤリハットはトップの「事業所」→「レオ」のページ内のヒヤリハット＝ #leo/hiyari）、番頭さん（#banto）。ここに書いていない画面の場所は推測で答えず「わかる方に確認を」と添える。
判断：
- 自力で答える(answer)：手順・規程の一般論・ポータルの使い方・一般的な業務の進め方・単なる報告や連絡の受け止め。報告・連絡は内容を受け止め、必要なら次の一手を添えて完了してよい。
- 会長へ取り次ぐ(escalate)：お金（支出・請求・給与以外の会社のお金）、人事（採用・配置・評価）、契約、事故・苦情・ヒヤリハットの重大案件（けが・通院・保護者からの強い苦情・行政がからむもの）、方針、例外対応、判断に自信がないもの。
- 相談所へ案内(soudan)：本人の休み・給料・勤務時間・社会保険・人間関係・体調や家庭の事情など、人事労務の個人的な相談。この場合は内容に踏み込まず「人事労務の相談所（総務奉行の宮本さんだけが読みます）」へ案内する。
わからないことを推測で断定しない。わからなければ escalate。
JSONのみ出力：{"action":"answer|escalate|soudan","category":"10字以内","reply":"職員への返事（answerなら回答本文、soudanなら案内文、escalateなら空でよい）","summary":"会長向け要約（escalateのみ、60字以内）","opinion":"番頭の意見・おすすめ（escalateのみ、80字以内）"}`;
Deno.serve(async (req) => {
  if (!SECRET || req.headers.get("x-banto-secret") !== SECRET) return new Response("unauthorized", { status: 401 });
  const { id } = await req.json().catch(() => ({}));
  const { data: m } = await db.from("banto_msg").select("*").eq("id", Number(id)).maybeSingle();
  if (!m || m.status !== "pending") return Response.json({ skip: true });
  const { data: hist } = await db.from("banto_msg").select("kind,body,ai_answer,chair_reply").eq("user_id", m.user_id).neq("id", m.id).order("created_at", { ascending: false }).limit(4);
  const { data: prof } = await db.from("staff_profiles").select("full_name,rank").eq("user_id", m.user_id).maybeSingle();
  const mask = (t: string) => String(t ?? "").replace(/0\d{1,4}-?\d{1,4}-?\d{3,4}/g, "［電話］");
  let out: any = null;
  if (AI) {
    try {
      const ctx = (hist ?? []).reverse().map((h) => `【過去の${h.kind}】${mask(h.body).slice(0, 200)}\n→番頭:${(h.ai_answer ?? "").slice(0, 150)}${h.chair_reply ? "\n→会長:" + h.chair_reply.slice(0, 150) : ""}`).join("\n");
      const r = await fetch("https://api.x.ai/v1/chat/completions", { method: "POST", headers: { Authorization: "Bearer " + AI, "Content-Type": "application/json" },
        body: JSON.stringify({ model: Deno.env.get("BANTO_MODEL") || "grok-4-fast-non-reasoning", temperature: 0.2, max_tokens: 700, response_format: { type: "json_object" },
          messages: [{ role: "system", content: SYS }, { role: "user", content: `${ctx ? ctx + "\n\n" : ""}差出人：${prof?.full_name || m.name || "職員"}${prof?.rank ? "（" + prof.rank + "）" : ""}\n種別：${m.kind}\n本文：\n${mask(m.body)}` }] }) });
      out = JSON.parse((await r.json()).choices[0].message.content.replace(/```json|```/g, ""));
    } catch (_) { out = null; }
  }
  if (!out || !["answer", "escalate", "soudan"].includes(out.action)) out = { action: "escalate", category: "未判定", summary: String(m.body).slice(0, 60), opinion: "番頭が自動で判断できませんでした。" };
  const esc = out.action === "escalate";
  const reply = esc ? ESC : String(out.reply || "承知いたしました。").slice(0, 3000);
  await db.from("banto_msg").update({ status: esc ? "escalated" : "answered", ai_answer: reply, ai_category: String(out.category ?? "").slice(0, 30) || null,
    ai_summary: esc ? String(out.summary ?? "").slice(0, 200) : null, ai_opinion: esc ? String(out.opinion ?? "").slice(0, 300) : null, answered_at: new Date().toISOString() }).eq("id", m.id);
  return Response.json({ id: m.id, action: out.action });
});
