// 日本の祝日を内閣府の CSV から public.jp_holidays に取り込む（税カレンダーの「土日祝は翌営業日」用）。
// cron「jp-holidays」（毎月2日 8:30 JST）から x-jp-holidays-secret 付きで POST。verify_jwt=false、秘密ヘッダで守る。
// 秘密は private_config 'jp_holidays_secret'（cron と同じ値）。推測の祝日は入れない。取り込んだ年のぶんだけ毎月分が先へ伸びる。
const CSV_URL = "https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv";
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

export function parseHolidays(text: string, fromYear = 2020) {
  const out: { d: string; name: string }[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2}),(.+)$/);
    if (!m || +m[1] < fromYear) continue;
    out.push({ d: `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`, name: m[4].trim() });
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const base = Deno.env.get("SUPABASE_URL")!, srk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const h = { apikey: srk, Authorization: "Bearer " + srk, "Content-Type": "application/json" };
  const r0 = await fetch(`${base}/rest/v1/private_config?k=eq.jp_holidays_secret&select=v`, { headers: h });
  const secret = r0.ok ? ((await r0.json())?.[0]?.v || "") : "";
  if (!secret || req.headers.get("x-jp-holidays-secret") !== secret) return json({ error: "unauthorized" }, 401);
  const log = (kind: string, msg: string) =>
    fetch(`${base}/rest/v1/tax_calendar_log`, { method: "POST", headers: { ...h, Prefer: "return=minimal" }, body: JSON.stringify({ kind, msg }) });
  try {
    const res = await fetch(CSV_URL);
    if (!res.ok) throw new Error("内閣府CSVを取得できません（" + res.status + "）");
    const text = new TextDecoder("shift_jis").decode(new Uint8Array(await res.arrayBuffer()));
    const rows = parseHolidays(text);
    if (rows.length < 50) throw new Error("祝日の行が少なすぎます（" + rows.length + "行）");
    const up = await fetch(`${base}/rest/v1/jp_holidays?on_conflict=d`, {
      method: "POST", headers: { ...h, Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows.map((x) => ({ ...x, fetched_at: new Date().toISOString() }))),
    });
    if (!up.ok) throw new Error("保存できません（" + up.status + "）");
    const last = rows.map((x) => x.d).sort().pop();
    return json({ ok: true, rows: rows.length, last });
  } catch (e) {
    await log("error", "祝日の取り込みに失敗：" + (e as Error).message);
    return json({ error: (e as Error).message }, 500);
  }
});
