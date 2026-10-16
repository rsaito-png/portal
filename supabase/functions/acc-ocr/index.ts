// レシート画像 → {date, amount, store, tax_rate}。下書きにするだけで、登録は人が確認して行う。
// secrets: ACC_OCR_API_KEY（必須。未設定なら 501 を返し、画面は手入力に切り替わる）/ ACC_OCR_BASE_URL（既定 https://api.x.ai/v1）/ ACC_OCR_MODEL
// 呼べるのは法人管理者（acc_is_admin）だけ
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const J = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const url = Deno.env.get('SUPABASE_URL')!, anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const chk = await fetch(url + '/rest/v1/rpc/acc_is_admin', { method: 'POST', headers: { apikey: anon, Authorization: req.headers.get('Authorization') ?? '', 'Content-Type': 'application/json' }, body: '{}' });
  if (!chk.ok || (await chk.json()) !== true) return J({ error: '権限がありません' }, 403);
  const key = Deno.env.get('ACC_OCR_API_KEY');
  if (!key) return J({ error: 'OCR未設定(ACC_OCR_API_KEY)' }, 501);
  const { image } = await req.json().catch(() => ({}));
  if (!image || typeof image !== 'string' || image.length > 11e6) return J({ error: '画像がないか大きすぎます' }, 400);
  const r = await fetch((Deno.env.get('ACC_OCR_BASE_URL') || 'https://api.x.ai/v1') + '/chat/completions', {
    method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: Deno.env.get('ACC_OCR_MODEL') || 'grok-4', temperature: 0, messages: [{ role: 'user', content: [
      { type: 'text', text: 'これは日本のレシート/領収書です。次のJSONだけを返してください(説明やコードブロック不要): {"date":"YYYY-MM-DD","amount":税込合計の整数,"store":"店名","tax_rate":8か10(軽減税率の食品中心なら8)}。読めない項目はnull。' },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + image } }] }] }) });
  if (!r.ok) return J({ error: 'OCRサービスのエラー ' + r.status }, 502);
  const txt: string = (await r.json()).choices?.[0]?.message?.content ?? '';
  try {
    const j = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));
    return J({ date: /^\d{4}-\d{2}-\d{2}$/.test(j.date) ? j.date : null, amount: Number.isFinite(+j.amount) && +j.amount > 0 ? Math.round(+j.amount) : null, store: j.store ? String(j.store).slice(0, 60) : null, tax_rate: j.tax_rate === 8 || j.tax_rate === 10 ? j.tax_rate : null });
  } catch { return J({ error: '読み取り結果を解釈できませんでした' }, 502); }
});
