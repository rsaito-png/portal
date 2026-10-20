// 第N期の申告書類一式をHTML/PDFに出力（検証用）。使い方: SUPABASE_SERVICE_KEY=… node tools/taxpack_sample.js 2025 /workspace/out
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
global.TX = require('../taxcalc.js'); const TXP = require('../taxpack.js');
const U = 'https://zvrardoyxocmqhvyddnf.supabase.co/rest/v1', K = process.env.SUPABASE_SERVICE_KEY, H = { apikey: K, Authorization: 'Bearer ' + K };
const get = async (p) => { const out = []; for (let o = 0; ; o += 1000) { const r = await (await fetch(`${U}/${p}${p.includes('?') ? '&' : '?'}limit=1000&offset=${o}`, { headers: H })).json(); out.push(...r); if (r.length < 1000) break; } return out; };
(async () => {
  const y = +(process.argv[2] || 2025), outDir = process.argv[3] || '/workspace', fy = TXP.fyOf(y);
  const src = fs.readFileSync(path.join(__dirname, '../tax.js'), 'utf8');
  const grab = n => eval('(' + src.match(new RegExp('const ' + n + ' = (\\{[\\s\\S]*?\\n?\\});\\n'))[1] + ')');
  const SEED5 = grab('SEED5'), ACT5 = grab('ACT5');
  const saved = await get(`acc_tax_inputs?select=data&fy_start=eq.${fy.from}`);
  const d = saved[0]?.data || (y === 2025 ? JSON.parse(JSON.stringify(SEED5)) : {}); if (!saved[0]) d.savedFlag = false;
  const accs = await get('acc_accounts?select=id,name,type,category,sort');
  const partners = await get('acc_partners?select=id,name,is_personal');
  const pm = new Map(partners.map(p => [p.id, p]));
  const lines = await get(`acc_lines?select=id,side,amount,account_id,tax_code,entry_id,acc_entries!inner(entry_date,kind,partner_id,memo)&acc_entries.entry_date=lte.${fy.to}`);
  const ctx = { fy, d, accs, cache: { lines }, partnerName: id => +id ? (pm.get(+id)?.name || '取引先') : '(取引先未設定)', isPersonal: id => !!pm.get(+id)?.is_personal, hasPersonal: true, today: new Date().toISOString().slice(0, 10) };
  const r = TXP.build(ctx);
  fs.mkdirSync(outDir, { recursive: true });
  const base = path.join(outDir, `申告書類一式_第${fy.no}期`);
  fs.writeFileSync(base + '.html', r.html);
  execSync(`google-chrome --headless=new --no-sandbox --disable-gpu --no-pdf-header-footer --print-to-pdf="${base}.pdf" "file://${base}.html"`, { stdio: 'ignore' });
  const hj = ctx.c.hj, fsx = ctx.c.fs;
  if (y === 2025) {
    const A = ACT5, cr = hj.adds.filter(x => /^法人税額から控除/.test(x.label)).reduce((s, x) => s + x.amount, 0), nz = hj.adds.find(x => x.auto && /納税充当金/.test(x.label)).amount;
    const so = fsx.bs.L.find(x => x.name === '未払法人税等');
    const ck = [['別表四 当期利益', hj.preTax, A.b4.net], ['別表四 納税充当金', nz, A.b4.nouzei], ['別表四 償却超過', hj.depExcess, A.b4.depEx], ['別表四 減算(事業税認容)', hj.sS, A.b4.jigyo], ['別表四 仮計', hj.sub1 - cr, A.b4.kari], ['別表四 所得税額控除', hj.credit, A.b4.shotoku], ['別表四 所得金額', hj.income0, A.b4.income],
      ['別表一 法人税額', hj.hz, A.b1.hz], ['別表一 差引法人税額', hj.hzNet, A.b1.diff], ['別表一 確定法人税額', hj.final, A.b1.final], ['別表一 地方法人税', hj.chihou, A.b1.chihou], ['別表一 地方法人税確定', TX.fH(hj.chihou), A.b1.chihouFinal],
      ['県民税', hj.kPref + hj.zHzPref, A.ken], ['市民税', hj.kCity + hj.zHzCity, A.shi], ['事業税+特別法人事業税', hj.biz + hj.spBiz, A.jigyoTotal], ['別表五 繰越損益金 期末', fsx.eq.re.close, A.b5.ret[3]], ['別表五 納税充当金 期末', so?.bal, A.b5.nouzeiJ[3]], ['売上高', fsx.pl.sales, 47379798], ['当期純利益', fsx.pl.net, 2222843]];
    let ng = 0; for (const [l, a, b] of ck) { const ok = a === b; if (!ok) ng++; console.log((ok ? 'OK ' : 'NG ') + l, a, b); } console.log('不一致', ng, '/', ck.length);
  }
  console.log('警告', r.warnings.length); r.warnings.forEach(w => console.log(' -', w.join(' ')));
  console.log('納付概算', JSON.stringify(r.summary.rows.map(x => (x.r || x).slice(1))));
})();
