// 償却資産申告（固定資産税・償却資産）の計算と印刷用HTML。画面(dep.js)と node（検証）の両方から使う。
// 根拠: 四日市市「令和8年度 固定資産税（償却資産）申告の手引き」・総務省「固定資産税の概要」。令和9年度の手引きは未公表のため令和8年度版に準拠。
// 様式は第26号様式・同別表1/別表2「に準じた自作レイアウト」（公式用紙への重ね書きではない）。
(function (root) {
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const yen = v => (typeof v === 'number' ? Math.round(v).toLocaleString('ja-JP') : esc(v ?? ''));
  const ENT = { name: '一般社団法人 心理社会的リハビリテーション・星心会', addr: '三重県四日市市山城町59-4' };
  const TARGET_CLASSES = ['構築物', '機械装置', '船舶', '航空機', '車両運搬具', '工具器具備品']; // 第1〜6種（建物は家屋として別課税）
  const CLASS_NO = { 構築物: 1, 機械装置: 2, 船舶: 3, 航空機: 4, 車両運搬具: 5, 工具器具備品: 6 };
  // 減価率（固定資産評価基準 別表15。手引きp.10の抜粋）。表にない耐用年数は 1-0.1^(1/n) を小数第3位に四捨五入（表の値とほぼ一致。24年のみ表は0.092）
  const RT = { 2: .684, 3: .536, 4: .438, 5: .369, 6: .319, 7: .280, 8: .250, 9: .226, 10: .206, 11: .189, 12: .175, 13: .162, 14: .152, 15: .142, 16: .134, 17: .127, 18: .120, 19: .114, 20: .109, 21: .104, 22: .099, 23: .095, 24: .092, 25: .088, 30: .074, 35: .064, 40: .056, 45: .050, 50: .045 };
  const rateOf = n => RT[n] ?? Math.round((1 - Math.pow(0.1, 1 / n)) * 1000) / 1000;
  const trunc3 = x => Math.floor(Math.round(x * 1e6) / 1e3) / 1e3;
  const D = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const iso = dt => dt.toISOString().slice(0, 10);
  const addDays = (s, n) => iso(new Date(D(s).getTime() + n * 864e5));
  const era = Y => `令和${Y - 2018}年`;
  const eraDate = s => { const [y, m, d] = s.split('-').map(Number); return `令和${y - 2018}年${m}月${d}日`; };
  // 初年度（前年中取得として初めて評価される賦課年）: 1/2〜翌1/1に取得 → その翌1/1の賦課
  const firstYear = acq => +addDays(acq, -1).slice(0, 4) + 1;
  const menzeiten = Y => (Y >= 2027 ? 1800000 : 1500000); // 令和9年度(2027)以後は180万円（総務省）
  const dueDate = Y => { let d = `${Y}-01-31`; const w = D(d).getUTCDay(); if (w === 6) d = addDays(d, 2); else if (w === 0) d = addDays(d, 1); return d; };

  function classify(a, Y) {
    const jan1 = `${Y}-01-01`;
    if (a.acquired_on > jan1) return { target: false, why: '賦課期日(1/1)より後の取得' };
    if (a.disposed_on && a.disposed_on <= jan1) return { target: false, why: '賦課期日までに除却・売却等', gone: true };
    if (!TARGET_CLASSES.includes(a.asset_class)) return { target: false, why: ({ 建物: '建物は家屋として別に課税（償却資産ではない）', 無形固定資産: '無形固定資産（ソフトウェア等）は対象外', 繰延資産: '繰延資産は対象外', 土地: '土地は対象外', その他: '償却資産の種類に当たらない' })[a.asset_class] || '対象外' };
    if (a.exclude_reason === '自動車税・軽自動車税の対象') return { target: false, why: '自動車税・軽自動車税の課税対象は償却資産から除く' };
    if (a.exclude_reason) return { target: false, why: '対象外（' + a.exclude_reason + '）' };
    if (a.dep_method === '一括償却(3年均等)') return { target: false, why: '20万円未満の3年一括償却資産は申告不要' };
    if (a.dep_method === '少額一時損金(10万円未満)') return { target: false, why: '10万円未満で一時に損金算入した資産は申告不要' };
    if (!a.life_years) return { target: true, noLife: true, why: '耐用年数が未入力（評価できません）' };
    return { target: true };
  }
  // 評価額（賦課年Yの1/1）。初年度=取得価額×(1−減価率×1/2)、以後=前年度評価額×(1−減価率)。下限=取得価額の5%
  function evalAsset(a, Y) {
    const n = a.life_years, cost = a.cost, r = rateOf(n), y0 = firstYear(a.acquired_on), steps = [];
    if (!n || Y < y0) return { v: 0, steps, r, y0 };
    const floor5 = Math.floor(cost * 0.05); let v = Math.floor(cost * trunc3(1 - r / 2));
    steps.push({ y: y0, v: Math.max(v, floor5), raw: v });
    for (let y = y0 + 1; y <= Y; y++) { v = Math.floor(v * (1 - r)); steps.push({ y, v: Math.max(v, floor5), raw: v }); }
    return { v: Math.max(v, floor5), steps, r, y0, rem0: trunc3(1 - r / 2), floor5 };
  }
  function assess(assets, Y) {
    const rows = [], excluded = [], prevJan1 = `${Y - 1}-01-01`, jan1 = `${Y}-01-01`;
    for (const a of assets) {
      const c = classify(a, Y);
      if (!c.target) { excluded.push({ a, why: c.why, gone: c.gone }); continue; }
      const e = evalAsset(a, Y);
      const acqCls = a.acquired_on <= prevJan1 ? 'prev' : 'new'; // 前年前取得 / 前年中取得
      rows.push({ a, e, no: CLASS_NO[a.asset_class], cls: acqCls, noLife: c.noLife });
    }
    // 申告書の種類別集計 (イ)前年前取得 (ロ)減少 (ハ)前年中取得 (ニ)計 (ホ)評価額
    const byCls = {}; for (const k of Object.keys(CLASS_NO)) byCls[k] = { i: 0, ro: 0, ha: 0, ni: 0, ho: 0 };
    for (const r of rows) { const b = byCls[r.a.asset_class]; if (r.cls === 'prev') b.i += r.a.cost; else b.ha += r.a.cost; b.ho += r.e.v; }
    // (ロ) 前年中に減少: 前年1/1に所有していて、(前年1/1,当年1/1]に除却等
    const dec = [];
    for (const a of assets) {
      if (!a.disposed_on || a.disposed_on <= prevJan1 || a.disposed_on > jan1) continue;
      if (a.acquired_on > prevJan1) continue; // 同年中の取得・除却は申告に現れない
      const c = classify({ ...a, disposed_on: null }, Y - 1); if (!c.target) continue;
      dec.push(a); byCls[a.asset_class].ro += a.cost; // (イ)は前年前取得で現存していたもの。下で補正
    }
    for (const a of dec) { const b = byCls[a.asset_class]; if (!rows.some(r => r.a === a)) b.i += a.cost; }
    for (const k in byCls) { const b = byCls[k]; b.ni = b.i - b.ro + b.ha; }
    const total = rows.reduce((s, r) => s + r.e.v, 0), taxBase = Math.floor(total / 1000) * 1000, thr = menzeiten(Y);
    const exempt = taxBase < thr, tax = exempt ? 0 : Math.floor(taxBase * 0.014 / 100) * 100;
    const tot = Object.values(byCls).reduce((s, b) => ({ i: s.i + b.i, ro: s.ro + b.ro, ha: s.ha + b.ha, ni: s.ni + b.ni, ho: s.ho + b.ho }), { i: 0, ro: 0, ha: 0, ni: 0, ho: 0 });
    return { Y, rows, excluded, byCls, tot, dec, total, taxBase, thr, exempt, tax, due: dueDate(Y), noChange: rows.every(r => r.cls === 'prev') && !dec.length };
  }

  // ---- 法人税（別表十六）の償却限度額 ----
  const DB200 = { 3: [.667, 1, .11089], 4: [.5, 1, .12499], 5: [.4, .5, .108], 6: [.333, .334, .09911], 7: [.286, .334, .0868], 8: [.25, .334, .07909], 9: [.222, .25, .07126], 10: [.2, .25, .06552], 11: [.182, .2, .05992], 12: [.167, .2, .05566], 13: [.154, .167, .0518], 14: [.143, .167, .04854], 15: [.133, .143, .04565], 16: [.125, .143, .04294], 17: [.118, .125, .04038], 18: [.111, .112, .03884], 19: [.105, .112, .03693], 20: [.1, .112, .03486] };
  const slRate = n => Math.ceil(1000 / n - 1e-9) / 1000;
  const fyOfDate = s => { const y = +s.slice(0, 4), m = +s.slice(5, 7); return m >= 6 ? y : y - 1; }; // 6月〜5月期
  // 期(開始年 fy)ごとの償却限度額を取得年の期から順に計算。月割（取得月から期末まで）。assumes: 各期とも限度額まで償却
  function taxDep(a, fyTo) {
    const out = {}, cost = a.cost, f0 = fyOfDate(a.acquired_on), n = a.life_years;
    let bv = cost, kaitei = null; // kaitei: 改定取得価額（定率法で保証額を下回った後）
    const end = a.disposed_on ? fyOfDate(a.disposed_on) : fyTo;
    for (let f = f0; f <= Math.min(fyTo, end); f++) {
      let months = 12; if (f === f0) { const m = +a.acquired_on.slice(5, 7); months = m >= 6 ? 12 - (m - 6) : 6 - m; }
      if (a.disposed_on && f === end) { const m = +a.disposed_on.slice(5, 7), em = m >= 6 ? m - 5 : m + 7; months = Math.min(months, em); }
      let d = 0;
      if (a.dep_method === '償却しない') d = 0;
      else if (a.dep_method === '一括償却(3年均等)') d = f - f0 < 3 ? Math.floor(cost / 3) : 0;
      else if (a.dep_method === '少額一時損金(10万円未満)' || a.dep_method === '少額特例(30万円未満)') d = f === f0 ? cost : 0;
      else if (!n) d = 0;
      else if (a.dep_method === '定額法') d = Math.min(Math.floor(cost * slRate(n) * months / 12), Math.max(0, bv - 1));
      else { // 定率法(200%)
        const t = DB200[n] || [Math.round(2000 / n) / 1000, slRate(n), .05], [rate, krate, hosyo] = t;
        if (kaitei == null) { const before = bv * rate; if (before < cost * hosyo) kaitei = bv; }
        const base = kaitei != null ? kaitei * krate : bv * rate;
        d = Math.min(Math.floor(base * months / 12), Math.max(0, bv - 1));
      }
      out[f] = d; bv -= d;
      if (a.dep_method === '定率法' && n && kaitei == null) { const t = DB200[n] || [Math.round(2000 / n) / 1000, slRate(n), .05]; if (bv * t[0] < cost * t[2]) kaitei = bv; }
    }
    return { byFy: out, bv };
  }
  function b16(assets, fy, bookDepByAcc, accName) { // fy: 期首年(2025=第5期)。bookDepByAcc: {account_id: 当期の帳簿償却費}
    const fyFrom = `${fy}-06-01`, fyTo = `${fy + 1}-05-31`, groups = new Map(), detail = [];
    for (const a of assets) {
      if (a.acquired_on > fyTo || (a.disposed_on && a.disposed_on < fyFrom) || a.dep_method === '償却しない' || ['一括償却(3年均等)', '少額一時損金(10万円未満)', '少額特例(30万円未満)'].includes(a.dep_method) || ['土地', '無形固定資産', '繰延資産'].includes(a.asset_class) && !a.life_years) continue;
      const t = taxDep(a, fy), lim = t.byFy[fy] || 0, key = a.book_account_id ?? 0;
      detail.push({ a, limit: lim });
      const g = groups.get(key) || { key, name: key ? accName(key) : '（帳簿の科目が未設定）', cost: 0, limit: 0, n: 0 }; g.cost += a.cost; g.limit += lim; g.n++; groups.set(key, g);
    }
    const rows = [...groups.values()].map(g => { const book = g.key ? (bookDepByAcc[g.key] || 0) : g.limit; return { ...g, dep: book, excess: Math.max(0, book - g.limit) }; });
    return { rows, detail, totalLimit: rows.reduce((s, r) => s + r.limit, 0), totalDep: rows.reduce((s, r) => s + r.dep, 0), totalExcess: rows.reduce((s, r) => s + r.excess, 0) };
  }

  // ---- 印刷用HTML ----
  const SOURCES = [
    ['令和8年度 固定資産税（償却資産）申告の手引き（四日市市）— 対象/対象外・評価額計算・減価率表・免税点・税率・記入要領・提出先', 'https://www.city.yokkaichi.lg.jp/www/contents/1001000000761/simple/R8shinkokusyotebiki.pdf', '四日市市'],
    ['令和8年度 事業用償却資産の申告について（提出書類・提出先・期限・eLTAX）', 'https://www.city.yokkaichi.lg.jp/www/contents/1001000003604/index.html', '四日市市'],
    ['固定資産税の概要（免税点: 償却資産150万円、令和9年度以後180万円／税率1.4%／評価額の最低限度=取得価額の5%）', 'https://www.soumu.go.jp/main_sosiki/jichi_zeisei/czaisei/czaisei_seido/149767_08.html', '総務省'],
    ['市税（一部）の電子申告 eLTAX（固定資産税（償却資産）の電子申告）', 'https://www5.city.yokkaichi.mie.jp/www/contents/1001000000712/index.html', '四日市市'],
    ['法人税 別表十六（減価償却）の様式（令和8年4月1日以後終了事業年度分）', 'https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/hojin/shinkoku/itiran2026/01.htm', '国税庁'],
  ];
  const CSS = `*{box-sizing:border-box}body{font-family:"Noto Sans CJK JP","Hiragino Sans","IPAGothic",sans-serif;color:#000;margin:0;font-size:10pt;line-height:1.35}
.pg{page-break-after:always}table.f td{word-break:break-all}table.small td,table.small th{font-size:7.5pt;padding:.8mm 1mm}.pg:last-child{page-break-after:auto}h1{font-size:19pt;margin:22mm 0 5mm;text-align:center}h2{font-size:13pt;margin:0 0 3mm;border-bottom:2px solid #000;padding-bottom:1mm}h3{font-size:11pt;margin:4mm 0 1.5mm}
table.f{border-collapse:collapse;width:100%;margin:1mm 0 3mm}table.f td,table.f th{border:1px solid #000;padding:1.2mm 1.6mm;vertical-align:middle}table.f th{background:#eee;text-align:center;font-weight:bold}
td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}td.c{text-align:center}tr.t td{font-weight:bold;background:#f3f3f3}
.hand{display:inline-block;border:1px dashed #c00;color:#c00;min-width:28mm;min-height:5mm;padding:0 1mm;font-size:8.5pt}.note{font-size:8.5pt;color:#333}.warn{border:1.5px solid #c60;background:#fff4e0;padding:2mm 3mm;margin:2mm 0}
.chk li{margin:1.3mm 0;list-style:none}.chk li:before{content:"□ ";font-size:12pt}.no{border:2px solid #000;padding:1mm 4mm;font-weight:bold;float:right}.ok{color:#080}.ng{color:#b00;font-weight:bold}
@media print{@page{size:A4;margin:12mm}}`;
  const page = b => `<section class="pg">${b}</section>`;
  const tbl = (head, rows, cls = '') => `<table class="f ${cls}"><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr>${rows.map(r => `<tr${r.t ? ' class="t"' : ''}>${(r.c || r).map((v, i) => typeof v === 'number' ? `<td class="n">${yen(v)}</td>` : `<td>${v == null ? '' : v}</td>`).join('')}</tr>`).join('')}</table>`;
  const ym = s => { const [y, m] = s.split('-').map(Number); return `令和${y - 2018}年${m}月`; };

  function build(ctx) { // ctx: {Y, assets, accName, info:{houjinNo,phone,bizType}, today}
    const Y = ctx.Y, R = assess(ctx.assets, Y), info = ctx.info || {}, today = ctx.today || new Date().toISOString().slice(0, 10);
    const review = ctx.assets.filter(a => a.needs_review), reviewTarget = R.rows.filter(r => r.a.needs_review), noLife = R.rows.filter(r => r.noLife);
    const sortedRows = [...R.rows].sort((x, y) => x.no - y.no || x.a.acquired_on.localeCompare(y.a.acquired_on));
    const offices = [...new Set(R.rows.map(r => r.a.location || r.a.office).filter(Boolean))];
    const hd = (t, no) => `<div><span class="no">${no}</span><h2>${t}</h2></div><p class="note">${esc(ENT.name)}／賦課期日 ${eraDate(`${Y}-01-01`)}（${era(Y).replace('年', '年度')}分）</p>`;
    // 1 表紙
    const cover = page(`<h1>償却資産申告書 一式<br><small style="font-size:12pt">${era(Y).replace('年', '年度')}（${Y}年1月1日現在）</small></h1>
      ${tbl(['項目', '内容'], [['申告する方', esc(ENT.name)], ['所在地', esc(ENT.addr)], ['提出先', '四日市市役所 財政経営部 資産税課 管理償却資産係<br>〒510-8601 三重県四日市市諏訪町1番5号（本庁舎2階） TEL 059-354-8139'], ['提出期限', `<b>${eraDate(R.due)}</b>（法定は1月31日。土日の場合は翌開庁日。${era(Y - 1)}度は1月31日が土曜のため2月2日(月)でした）`], ['提出方法', '窓口／郵送（控えに受付印が必要なら控えと返信用封筒を同封）／eLTAX'], ['課税標準額（概算）', `${yen(R.taxBase)} 円`], ['免税点', `${yen(R.thr)} 円 ${Y >= 2027 ? '（令和9年度以後は180万円）' : '（令和8年度以前は150万円）'}`], ['固定資産税（償却資産）の概算', R.exempt ? '<b>課税されません（免税点未満）。ただし申告は必要です。</b>' : `<b>${yen(R.tax)} 円</b>（税率1.4%）`], ['対象資産', `${R.rows.length}件／評価額合計 ${yen(R.total)} 円`], ['要確認の資産', `${review.length}件（うち申告対象 ${reviewTarget.length}件）`]])}
      <div class="warn"><b>概算です。</b>四日市市は申告内容から評価額・課税標準額・税額を決定します。この書類は「申告する内容」を整理したもので、評価額・税額は参考です。数字は税理士または市の資産税課で確認してください。この画面から市へ送信はしません。</div>
      <p class="note">綴り順: ①提出前チェックリスト ②償却資産申告書（第26号様式に準ずる） ③種類別明細書（増加資産・全資産用） ${R.dec.length ? '④種類別明細書（減少資産用） ' : ''}⑤評価額の計算（償却資産課税台帳の項目） ⑥対象外とした資産 ⑦根拠。市には②③${R.dec.length ? '④' : ''}を提出します（⑤⑥⑦は社内控え）。</p>`);
    // 2 チェックリスト
    const warn = [];
    if (reviewTarget.length) warn.push(['要確認', `申告対象のうち${reviewTarget.length}件が「要確認」です（耐用年数・取得日・摘要・設置場所など）。`]);
    if (noLife.length) warn.push(['エラー', `耐用年数が未入力の資産が${noLife.length}件あり、評価額が0円になっています。`]);
    if (!info.houjinNo) warn.push(['手書き', '法人番号が未入力です（申告タブの「基本情報」に入れるか、手書き）。']);
    warn.push(['確認', '市に過去の申告があるか（初めての申告か）を確認してください。市は「全資産」を記入する用紙で、市内の全資産を毎年書く運用も認めています。この書類は全資産申告として作成しています。']);
    if (R.dec.length) warn.push(['確認', `前年中に減少した資産が${R.dec.length}件あります。抹消コードは、市から届く「償却資産種類別明細書（資料用）」から転記してください。`]);
    const check = page(`${hd('提出前チェックリスト', '①')}<ul class="chk"><li>1月1日現在に所有している資産か（取得日・除却日）。前年中（${eraDate(`${Y - 1}-01-02`)}〜${eraDate(`${Y}-01-01`)}）の取得・除却は明細に書いたか</li>
      <li>所有していても対象外のもの（自動車税・軽自動車税の車、ソフトウェア等の無形固定資産、繰延資産、10万円未満の一時損金、20万円未満の3年一括償却）を入れていないか（⑥参照）</li>
      <li>テナントとして自分で付けた内装・設備（構築物）、エアコン・パソコン・什器・医療福祉機器等の備品を入れたか。償却済み・簿外でも使っていれば申告対象</li>
      <li>耐用年数は税務の耐用年数省令の年数か（中古は見積耐用年数）。圧縮記帳した資産は圧縮前の取得価額か</li>
      <li>償却資産申告書（②）の住所・名称・代表者名・法人番号・資本金等・事業開始年月・応答者・税理士名を記入した（赤の枠は手書き）</li>
      <li>8〜14の有・無（短縮耐用年数、増加償却、非課税、課税標準の特例、特別償却・圧縮記帳、青色申告）と13 償却方法に○をした</li>
      <li>15 事業所等の所在地、16 借用資産（リース）、17 事業所用家屋の所有区分（自己所有・借家）に○／記入した。<b>リース資産で貸主が申告するもの</b>・所有権留保の割賦資産の扱いを確認した</li>
      <li>期限（<b>${eraDate(R.due)}</b>）までに、市役所 資産税課 管理償却資産係へ提出（郵送は消印日。控えに受付印が必要なら控え＋返信用封筒）</li>
      <li>税理士に数字を確認してもらった（概算）</li></ul>
      <h2>入力不足・要確認（${warn.length}件）</h2>${tbl(['区分', '内容'], warn)}
      <h2>要確認の資産（${review.length}件）</h2>${review.length ? tbl(['資産', '取得日', '取得価額', '申告', '確認すること'], review.map(a => [esc(a.name), a.acquired_on, a.cost, classify(a, Y).target ? '対象' : '対象外', esc(a.review_note || '')])) : '<p class="ok">なし</p>'}`);
    // 3 第26号様式
    const cls6 = Object.keys(CLASS_NO), nm = { 構築物: '構築物', 機械装置: '機械及び装置', 船舶: '船舶', 航空機: '航空機', 車両運搬具: '車両及び運搬具', 工具器具備品: '工具、器具及び備品' };
    const hand = t => `<span class="hand">${t || ''}</span>`;
    const form26 = page(`${hd(`${era(Y).replace('年', '年度')} 償却資産申告書（償却資産課税台帳）`, '②')}
      <p style="text-align:right">${hand('提出日 令和　年　月　日')}　四日市市長 宛</p>
      <table class="f"><tr><th>1 所有者 住所</th><td>${esc(ENT.addr)}（〒${hand('郵便番号')} 電話 ${esc(info.phone || '')}${info.phone ? '' : hand('')}）</td><th>3 法人番号</th><td>${esc(info.houjinNo || '') || hand('13桁')}</td></tr>
      <tr><th>2 氏名（名称・代表者）</th><td>${esc(ENT.name)}<br>代表理事 ${hand('氏名（手書き）')}</td><th>4 事業種目（資本金の額）</th><td>${esc(info.bizType || '') || hand('事業種目')}（${hand('資本金・基金の額')}）</td></tr>
      <tr><th>5 事業開始年月（設立）</th><td>${hand('年　月')}</td><th>6 この申告に応答する者</th><td>${hand('係・氏名・電話')}</td></tr>
      <tr><th>7 税理士等の氏名</th><td>${hand('氏名・電話')}</td><th>8〜14</th><td class="note">8 短縮耐用年数の承認 有・無／9 増加償却の届出 有・無／10 非課税該当資産 有・無／11 課税標準の特例 有・無／12 特別償却又は圧縮記帳 有・無／13 税務会計上の償却方法 定率法・定額法／14 青色申告 有・無（<b>手書きで○</b>）</td></tr></table>
      <h3>資産の種類別 取得価額（円）</h3>${tbl(['資産の種類', '前年前に取得したもの (イ)', '前年中に減少したもの (ロ)', '前年中に取得したもの (ハ)', '計 (ニ)=(イ)−(ロ)+(ハ)', '評価額 (ホ)'], [...cls6.map((k, i) => [`${i + 1} ${nm[k]}`, R.byCls[k].i, R.byCls[k].ro, R.byCls[k].ha, R.byCls[k].ni, R.byCls[k].ho]), { t: 1, c: ['7 合計', R.tot.i, R.tot.ro, R.tot.ha, R.tot.ni, R.tot.ho] }])}
      <table class="f"><tr><th>決定価格 (ヘ)</th><th>課税標準額 (ト)（千円未満切捨て）</th><th>免税点</th><th>税額の概算（1.4%・百円未満切捨て）</th></tr><tr><td class="n">${yen(R.total)}</td><td class="n">${yen(R.taxBase)}</td><td class="n">${yen(R.thr)}</td><td class="n">${R.exempt ? '0（免税点未満）' : yen(R.tax)}</td></tr></table>
      <p class="note">(ホ)(ヘ)(ト)は市が決定するため、手引きでは記入不要（全資産を電算で申告する場合は(ホ)評価額のみ記入）。上の数字は本システムの概算です。</p>
      <table class="f"><tr><th>15 四日市市内における事業所等・資産の所在地</th><td>${offices.length ? offices.map(esc).join('<br>') : ''}${hand('①所在地（手書き）')} ${hand('②')}</td></tr>
      <tr><th>16 借用資産</th><td>有・無（有の場合は貸主の住所・名称）${hand('貸主')}</td></tr><tr><th>17 事業所用家屋の所有区分</th><td>自己所有・借家（<b>手書きで○</b>）</td></tr>
      <tr><th>18 備考</th><td>${R.noChange ? '本システムの判定: 前年中の増減なし → 備考欄「1 資産の増減なし」に○（全資産申告の場合は不要）' : '前年中に資産の増減あり（種類別明細書を添付）'}／${R.rows.length ? '' : '2 該当資産なし に○'} ／ 1 資産の増減なし ・ 2 該当資産なし ・ 3 廃業・解散・転出等（<b>該当を○</b>）</td></tr></table>`);
    // 4 種類別明細書（増加資産・全資産用）
    const perPage = 20, rowFor = (r, i) => { const a = r.a, [yy, mm] = a.acquired_on.split('-').map(Number);
      return [i, r.no, '', esc(a.name).slice(0, 40), a.quantity, `5・${yy - 2018}・${mm}`, a.cost, a.life_years ? String(a.life_years).padStart(2, '0') : '<span class="ng">未</span>', r.e.v, '', r.cls === 'new' ? hand('1新品 2中古') : '', esc((a.needs_review ? '【要確認】' : '') + (a.location ? a.location : ''))]; };
    const pages = Math.max(1, Math.ceil(sortedRows.length / perPage)); let ns = '';
    for (let p = 0; p < pages; p++) { const part = sortedRows.slice(p * perPage, (p + 1) * perPage);
      ns += page(`${hd('種類別明細書（増加資産・全資産用）', '③')}<p class="note">第26号様式別表1に準ずる。${pages}枚のうち第${p + 1}枚。年号は令和=5。耐用年数の2〜9年は前に0。資産コードは市が付番（新規は空欄）。価額欄は全資産を電算で申告する場合の評価額（概算）。</p>
      ${tbl(['行', '種類', '資産コード', '資産の名称等', '数量', '取得年月<br>(年号・年・月)', '取得価額', '耐用年数', '価額（評価額・概算）', '課税標準の特例', '増加事由', '摘要'], [...part.map((r, i) => rowFor(r, p * perPage + i + 1)), ...(p === pages - 1 ? [{ t: 1, c: ['', '', '', '合計', '', '', R.rows.reduce((s, r) => s + r.a.cost, 0), '', R.total, '', '', ''] }] : [])], 'small')}
      <p class="note">種類: 1構築物 2機械及び装置 3船舶 4航空機 5車両及び運搬具 6工具、器具及び備品。増加事由: 1新品取得 2中古取得 3移動による受入 4その他（前年中に取得した資産のみ）。</p>`); }
    // 5 減少資産用
    const decPage = R.dec.length ? page(`${hd('種類別明細書（減少資産用）', '④')}<p class="note">第26号様式別表2に準ずる。前年中（${eraDate(`${Y - 1}-01-02`)}〜${eraDate(`${Y}-01-01`)}）に減少した資産。抹消コードは市から届く「償却資産種類別明細書（資料用）」の資産コードを転記。</p>
      ${tbl(['行', '種類', '抹消コード', '資産の名称等', '数量', '取得年月', '取得価額', '耐用年数', '減少の事由(1売却 2滅失 3移動 4その他)', '区分(1全部 2一部)', '摘要'], R.dec.map((a, i) => [i + 1, CLASS_NO[a.asset_class], hand('手書き'), esc(a.name), a.quantity, `5・${+a.acquired_on.slice(0, 4) - 2018}・${+a.acquired_on.slice(5, 7)}`, a.cost, a.life_years || '', ({ 売却: 1, 滅失: 2, 移動: 3, その他: 4 })[a.disposal_kind] || hand(''), 1, esc(eraDate(a.disposed_on))]), 'small')}`) : '';
    // 6 評価計算（課税台帳）
    const calc = page(`${hd('評価額の計算（償却資産課税台帳の項目に準ずる・社内控え）', '⑤')}<p class="note">評価額: 前年中取得＝取得価額×(1−減価率×1/2)（減価残存率は小数第4位切捨て）、前年前取得＝前年度評価額×(1−減価率)。最低は取得価額の5%。耐用年数に応じた減価率は手引きp.10（別表15）。</p>
      ${tbl(['No', '種類', '資産', '所在', '取得日', '取得価額', '耐用年数', '減価率', '初年度', '経過', `${Y}年1/1 評価額`, '5%下限'], [...sortedRows.map((r, i) => [i + 1, nm[r.a.asset_class], esc(r.a.name), esc(r.a.location || r.a.office || ''), r.a.acquired_on, r.a.cost, r.a.life_years || '未', r.e.r || '', era(r.e.y0 || 0).replace('令和-', ''), r.e.steps.map(s => `${s.y}:${yen(s.v)}`).join('<br>'), r.e.v, r.e.floor5 || '']), { t: 1, c: ['', '', '合計', '', '', R.rows.reduce((s, r) => s + r.a.cost, 0), '', '', '', '', R.total, ''] }], 'small')}
      <h3>課税標準額・税額の概算</h3>${tbl(['項目', '計算', '金額（円）'], [['決定価格（評価額の合計）', '各資産の評価額の合計', R.total], ['課税標準額', '千円未満切り捨て', R.taxBase], ['免税点', `${era(Y).replace('年', '年度')}: ${Y >= 2027 ? '180万円（令和9年度以後）' : '150万円'}`, R.thr], ['判定', R.exempt ? '課税標準額が免税点未満 → 課税されません（申告は必要）' : '免税点以上 → 課税', ''], ['税額', '課税標準額×1.4%（百円未満切り捨て）', R.exempt ? 0 : R.tax], ['納期', '4月・7月・12月・翌年2月（年4回）', '']])}
      ${R.exempt ? '' : ''}<p class="note">※ 市の実際の決定額は、市が保有する前年度評価額から計算するため、過去の申告内容によって数百円〜数千円ずれることがあります。課税標準の特例（先端設備等導入計画など）は未適用です。</p>`);
    // 7 対象外
    const ex = page(`${hd('対象外とした資産（社内控え・申告しない）', '⑥')}${tbl(['資産', '区分', '取得日', '取得価額', '償却方法', '対象外の理由', '要確認'], R.excluded.filter(x => !x.gone).map(x => [esc(x.a.name), esc(x.a.asset_class), x.a.acquired_on, x.a.cost, esc(x.a.dep_method), esc(x.why), x.a.needs_review ? esc(x.a.review_note || '要確認') : '']), 'small')}
      ${R.excluded.some(x => x.gone) ? `<h3>賦課期日までに除却・売却した資産</h3>${tbl(['資産', '取得日', '除却等の日', '取得価額'], R.excluded.filter(x => x.gone).map(x => [esc(x.a.name), x.a.acquired_on, x.a.disposed_on, x.a.cost]), 'small')}` : ''}
      <h3>対象・対象外の考え方（手引きより）</h3><ul class="note"><li>対象: 構築物、機械及び装置、船舶、航空機、車両及び運搬具（大型特殊自動車のみ・自動車税/軽自動車税の対象は除く）、工具・器具及び備品。事業用で、法人税上の減価償却の対象になるもの。</li><li>対象外: 自動車税・軽自動車税の対象、無形固定資産（ソフトウェア等）、繰延資産、土地・建物（別に課税）。</li><li>少額資産: 10万円未満で一時に損金算入／20万円未満で3年一括償却／20万円未満のリース資産 → 申告不要。取得価額にかかわらず個別に償却しているもの、中小企業者等の少額減価償却資産の特例（30万円未満）で損金算入したもの → 申告対象（耐用年数省令の年数で評価）。</li><li>テナントが自ら取り付けた内装・建築設備は、賃借人の償却資産として申告（第1種 構築物）。</li><li>償却済み・簿外・遊休資産も、使える状態なら申告対象。</li></ul>`);
    const src = page(`${hd('根拠・様式の入手先', '⑦')}${tbl(['提供元', '内容', 'URL'], SOURCES.map(s => [esc(s[2]), esc(s[0]), esc(s[1])]))}
      <p class="note">確認日: ${esc(today)}。${era(Y).replace('年', '年度')}分の手引き・用紙は例年12月中旬に市から送付され、市のサイトからもダウンロードできます（令和9年度版は未公表のため令和8年度版に準拠。様式や期限は市の案内で再確認してください）。<br>公式の用紙（第26号様式・別表1・別表2）への転記が必要な場合は、②③④の数字を写してください。</p>
      <h3>この書類でできていない・手書きが必要なこと</h3><ul class="note"><li>公式用紙への重ね書き（自作レイアウトです）／eLTAX送信</li><li>代表者名・資本金（基金）・事業開始年月・応答者・税理士名・8〜14の○・15〜17の記入</li><li>資産コード（市付番）・増加事由（新品／中古）・課税標準の特例</li><li>耐用年数・償却方法・取得日・取得価額の「要確認」資産の確定（税理士・固定資産台帳で確認）</li></ul>`);
    return { html: `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>償却資産申告書 ${era(Y).replace('年', '年度')}</title><style>${CSS}</style></head><body>${cover + check + form26 + ns + decPage + calc + ex + src}</body></html>`, R, warnings: warn };
  }
  const api = { classify, evalAsset, assess, rateOf, firstYear, menzeiten, dueDate, taxDep, b16, build, SOURCES, TARGET_CLASSES, ENT, trunc3, era, eraDate, RT };
  if (typeof module !== 'undefined') module.exports = api; else root.DEP = api;
})(typeof window !== 'undefined' ? window : globalThis);
