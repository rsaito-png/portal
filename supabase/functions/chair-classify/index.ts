// 送った1行を、その場で振り分ける。会長のログインでだけ動く（RLSで本人確認）。
// AIキー(XAI_API_KEY)があれば小さなAI呼び出し1回、なければ／失敗したら名前の一致と過去の直しで決め、迷ったら「あとで」。
const U = Deno.env.get('SUPABASE_URL')!, K = Deno.env.get('SUPABASE_ANON_KEY')!, AI = Deno.env.get('XAI_API_KEY');
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Content-Type': 'application/json' };
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const auth = req.headers.get('Authorization') || '';
  const rest = (p: string, o: RequestInit = {}) => fetch(U + '/rest/v1/' + p, { ...o, headers: { apikey: K, Authorization: auth, 'Content-Type': 'application/json', ...(o.headers || {}) } });
  try {
    const { id } = await req.json();
    const chk = await rest('rpc/is_chair', { method: 'POST', body: '{}' });
    if (!chk.ok || (await chk.json()) !== true) return new Response('{"error":"forbidden"}', { status: 403, headers: cors });
    const [idea] = await (await rest(`chair_idea?id=eq.${Number(id)}&select=id,text`)).json();
    if (!idea) return new Response('{"error":"nf"}', { status: 404, headers: cors });
    const cfg: Record<string, any> = Object.fromEntries((await (await rest('chair_config')).json()).map((r: any) => [r.k, r.v]));
    const names: string[] = cfg.buckets || [], J = '会長が判断', L = 'あとで', all = [...names, J, L];
    const fb: any[] = await (await rest('chair_idea_feedback?order=created_at.desc&limit=15&select=text,fixed_bucket')).json();
    let bucket = L, note = '';
    if (AI) {
      try {
        const sys = `会長の思いつきメモ1行を次のどれか1つに分類。担当別:${names.join('/')}（その人宛・その人の仕事なら）、${J}（会長だけが決められること）、${L}（迷う・急ぎでない）。過去に会長が直した例:\n` +
          fb.map((f) => `「${f.text}」→${f.fixed_bucket}`).join('\n') + `\nJSONのみ出力: {"bucket":"…","note":"15字以内の理由"}`;
        const r = await fetch('https://api.x.ai/v1/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + AI, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: Deno.env.get('AI_MODEL') || 'grok-4-fast-non-reasoning', max_tokens: 80, temperature: 0, messages: [{ role: 'system', content: sys }, { role: 'user', content: idea.text }] }) });
        const j = JSON.parse((await r.json()).choices[0].message.content.replace(/```json|```/g, ''));
        if (all.includes(j.bucket)) { bucket = j.bucket; note = String(j.note || '').slice(0, 40); }
      } catch (_) { /* 失敗したら下の簡易判定 */ }
    }
    if (bucket === L && !note) {
      const hit = names.find((n) => idea.text.includes(n)); const same = fb.find((f) => f.text && (idea.text.includes(f.text.slice(0, 6)) || f.text.includes(idea.text.slice(0, 6))));
      if (same) { bucket = same.fixed_bucket; note = '前の直しから'; } else if (hit) { bucket = hit; note = '名前から'; }
    }
    await rest('chair_idea?id=eq.' + idea.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ bucket, ai_bucket: bucket, ai_note: note || null }) });
    return new Response(JSON.stringify({ bucket, note }), { headers: cors });
  } catch (e) { return new Response(JSON.stringify({ bucket: 'あとで', error: String(e) }), { headers: cors }); }
});
