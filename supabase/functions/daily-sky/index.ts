// 毎日占い（全体の空の動き）を1日1回作って portal_daily_sky に入れる。
// cron（JST 5:10）から x-daily-sky-secret 付きで POST される。verify_jwt=false、秘密ヘッダで守る。
// シークレット: DAILY_SKY_SECRET, XAI_API_KEY（既存）, AI_MODEL（任意）。{"force":true} で作り直し。
const SIGNS = ["牡羊座", "牡牛座", "双子座", "蟹座", "獅子座", "乙女座", "天秤座", "蠍座", "射手座", "山羊座", "水瓶座", "魚座"];
const MODEL_DEFAULT = "grok-4-fast-non-reasoning";
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const rad = Math.PI / 180, norm = (x: number) => ((x % 360) + 360) % 360;

function jd(ms: number) { return ms / 86400000 + 2440587.5; }
export function sunLon(ms: number) {
  const d = jd(ms) - 2451545.0, g = norm(357.529 + 0.98560028 * d), q = norm(280.459 + 0.98564736 * d);
  return norm(q + 1.915 * Math.sin(g * rad) + 0.020 * Math.sin(2 * g * rad));
}
export function moonLon(ms: number) {
  const d = jd(ms) - 2451545.0;
  const L = norm(218.316 + 13.176396 * d), M = norm(134.963 + 13.064993 * d), F = norm(93.272 + 13.229350 * d);
  const D = norm(297.850 + 12.190749 * d), Ms = norm(357.529 + 0.98560028 * d);
  return norm(L + 6.289 * Math.sin(M * rad) + 1.274 * Math.sin((2 * D - M) * rad) + 0.658 * Math.sin(2 * D * rad)
    - 0.186 * Math.sin(Ms * rad) - 0.114 * Math.sin(2 * F * rad));
}
const sign = (lon: number) => SIGNS[Math.floor(lon / 30)];

export function jstToday(now = Date.now()) { return new Date(now + 9 * 3600000).toISOString().slice(0, 10); }

export function skyFacts(day: string) {
  const start = Date.parse(day + "T00:00:00+09:00");
  const m0 = moonLon(start), s = sign(sunLon(start + 12 * 3600000));
  let ingress: { hour: number; to: string } | null = null;
  for (let h = 1; h <= 24; h++) {
    const mh = moonLon(start + h * 3600000);
    if (Math.floor(mh / 30) !== Math.floor(m0 / 30)) { ingress = { hour: h - 1, to: sign(mh) }; break; }
  }
  const phase = norm(moonLon(start + 12 * 3600000) - sunLon(start + 12 * 3600000));
  const ph = phase < 22 || phase >= 338 ? "新月前後" : phase < 158 ? "満ちていく月" : phase < 202 ? "満月前後" : "欠けていく月";
  return { sun: s, moon: sign(m0), ingress, phase: ph };
}
const when = (h: number) => h < 6 ? "未明" : h < 10 ? "朝" : h < 14 ? "昼" : h < 18 ? "夕方" : "夜";
export function factLine(f: ReturnType<typeof skyFacts>) {
  return `太陽は${f.sun}。月は${f.moon}${f.ingress ? `、${when(f.ingress.hour)}（${f.ingress.hour}時台）に${f.ingress.to}へ移る` : "に留まる"}。${f.phase}。`;
}
export function fallback(f: ReturnType<typeof skyFacts>) {
  const m = f.ingress ? `月は${when(f.ingress.hour)}に${f.ingress.to}へ。` : `月は${f.moon}で落ち着く。`;
  return { body: `${m}太陽は${f.sun}。急がず、手元の一つを片づける日。`, tip: "目の前の一つを丁寧に。" };
}
export function parse(t: string) {
  const b = t.match(/BODY\s*[:：]\s*(.+?)(?:\n|$)/s), p = t.match(/TIP\s*[:：]\s*(.+?)(?:\n|$)/);
  if (!b || !p) return null;
  const body = b[1].replace(/\s*TIP\s*[:：].*$/s, "").trim(), tip = p[1].trim();
  if (!body || !tip || body.length > 120 || tip.length > 50) return null;
  return { body, tip };
}
function redact(s: string, key: string) {
  let o = s.replace(/xai-[A-Za-z0-9._-]+/g, "***").replace(/Bearer\s+\S+/gi, "Bearer ***");
  return key ? o.split(key).join("***") : o;
}
const SYSTEM = `あなたは職場ポータルの「毎日占い」係。個人の出生図ではなく、今日の空全体の動き（太陽・月の星座、月の移動、月相）だけを短く述べる。
規則: BODYは2〜3文、合計80字以内。TIPは1文、30字以内。命令形・言い切りで静かなトーン。専門用語の解説や長文は禁止。個人占い・星座別運勢は禁止。
例:
BODY: 月は昼に乙女座へ。話は進むが、現場は動かない日。急がず、一つだけ片づける。
TIP: 散らかっても慌てず、目の前の一つを拾え。
出力はこの2行だけ:
BODY: ...
TIP: ...`;

export async function handle(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const base = Deno.env.get("SUPABASE_URL")!, srk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const h = { apikey: srk, Authorization: "Bearer " + srk, "Content-Type": "application/json" };
  // 秘密は env DAILY_SKY_SECRET、無ければ private_config 'daily_sky_secret'（cron と同じ値）。どちらも無ければ拒否。
  let secret = Deno.env.get("DAILY_SKY_SECRET") || "";
  if (!secret) {
    const r = await fetch(`${base}/rest/v1/private_config?k=eq.daily_sky_secret&select=v`, { headers: h });
    secret = r.ok ? ((await r.json())?.[0]?.v || "") : "";
  }
  if (!secret || req.headers.get("x-daily-sky-secret") !== secret) return json({ error: "unauthorized" }, 401);
  let force = false; try { force = !!(await req.json())?.force; } catch { /* 空でよい */ }
  const day = jstToday();
  if (!force) {
    const r = await fetch(`${base}/rest/v1/portal_daily_sky?day=eq.${day}&select=body,tip`, { headers: h });
    const rows = r.ok ? await r.json() : [];
    if (rows.length) return json({ day, skipped: true, ...rows[0] });
  }
  const f = skyFacts(day);
  let out = fallback(f), src = "fallback";
  const key = Deno.env.get("XAI_API_KEY") || "";
  if (key) {
    try {
      const r = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST", headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
        body: JSON.stringify({ model: Deno.env.get("AI_MODEL") || MODEL_DEFAULT, temperature: 0.8, max_tokens: 200,
          messages: [{ role: "system", content: SYSTEM }, { role: "user", content: `${day}（東京）の空: ${factLine(f)}` }] }),
      });
      if (r.ok) { const p = parse(String((await r.json())?.choices?.[0]?.message?.content ?? "")); if (p) { out = p; src = "xai"; } }
      else console.error("daily-sky xAI", r.status, redact(await r.text(), key).slice(0, 300));
    } catch (e) { console.error("daily-sky", redact(String((e as Error)?.message ?? e), key).slice(0, 300)); }
  }
  const w = await fetch(`${base}/rest/v1/portal_daily_sky?on_conflict=day`, {
    method: "POST", headers: { ...h, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ day, ...out, updated_at: new Date().toISOString() }),
  });
  if (!w.ok) return json({ error: "save failed", status: w.status }, 500);
  return json({ day, src, facts: factLine(f), ...out });
}
if (Deno.env.get("SUPABASE_URL")) Deno.serve(handle);
