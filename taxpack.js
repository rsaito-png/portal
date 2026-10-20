// 申告書類一式（紙提出用）の生成。画面(tax.js)と node（検証・サンプルPDF）の両方から使う。
// 様式は国税庁・三重県・四日市市の様式「に準じた自作レイアウト」（公式PDFへの重ね書きではない）。数字は txCalc 相当の計算結果。
// 公式様式PDFの入手先は TXP.SOURCES。個人名（取引先・役員）は出力しない（is_personal の取引先は伏せ字）。
(function (root) {
  const TX = root.TX || (typeof require !== 'undefined' ? require('./taxcalc.js') : null);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const yen = v => (typeof v === 'number' ? Math.round(v).toLocaleString('ja-JP') : esc(v ?? ''));
  const ENT = { name: '一般社団法人 心理社会的リハビリテーション・星心会', addr: '三重県四日市市山城町59-4', rep: '代表理事 齊藤 連' };
  const era = iso => { const [y, m, d] = iso.split('-').map(Number); return `令和${y - 2018}年${m}月${d}日`; };
  const eraS = iso => { const [y, m, d] = iso.split('-').map(Number); return `R${y - 2018}.${m}.${d}`; };
  const fyOf = y => ({ y, from: `${y}-06-01`, to: `${y + 1}-05-31`, no: y - 2020 });
  const dueOf = to => { const [y, m] = to.split('-').map(Number); const dt = new Date(Date.UTC(y, m + 2, 0)); return dt.toISOString().slice(0, 10); }; // 事業年度終了日の2か月後の月末
  const SOURCES = [
    ['法人税 別表一・四・五(一)(二) 等 様式PDF（令和8年4月1日以後終了事業年度分）', 'https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/hojin/shinkoku/itiran2026/01.htm', '国税庁'],
    ['法人税申告書（令和8年4月1日以後終了）OCR帳票一覧（別表一 等）', 'https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/hojin/shinkoku/ocr/ichiran2026/index.htm', '国税庁'],
    ['e-Tax 法人税確定申告 帳票一覧（令和8年4月1日以後終了事業年度分）', 'https://www.e-tax.nta.go.jp/tetsuzuki/shinkoku/hojinchihou_R8zeikai_list.pdf', 'e-Tax'],
    ['法人税率（中小法人15%/23.2%）・地方法人税10.3%', 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/hojin/5759.htm', '国税庁'],
    ['防衛特別法人税（令和8年4月1日以後開始事業年度）', 'https://www.nta.go.jp/publication/pamph/pdf/0025004-109_1.pdf', '国税庁'],
    ['三重県 申告書・納付書等様式（第6号様式 ほか）', 'https://www.pref.mie.lg.jp/ZEIMU/HP/p0006900026.htm', '三重県'],
    ['三重県 法人県民税（均等割・法人税割・提出先）', 'https://www.pref.mie.lg.jp/ZEIMU/HP/16338017882.htm', '三重県'],
    ['三重県 法人事業税', 'https://www.pref.mie.lg.jp/ZEIMU/HP/16336017880.htm', '三重県'],
    ['四日市県税事務所（提出先・〒510-8511 四日市市新正4-21-5）', 'https://www.pref.mie.lg.jp/HKENZEI/index.htm', '三重県'],
    ['申告書の郵送は郵便又は信書便（通信日付印が提出日）', 'https://www.pref.mie.lg.jp/ZEIMU/HP/16317017863.htm', '三重県'],
    ['四日市市 法人市民税（申告納付期限・提出方法・納付書）', 'https://www.city.yokkaichi.lg.jp/www/contents/1001000000675/index.html', '四日市市'],
    ['市民税課（〒510-8601 四日市市諏訪町1-5 本庁舎2F）', 'https://www5.city.yokkaichi.mie.jp/www/contents/1001000000678/index.html', '四日市市'],
    ['総務省 法人市町村民税の様式（第20号様式）', 'https://www.soumu.go.jp/kojinbango_card/mynumber_tax_zeimokubetu.html', '総務省'],
    ['特別法人事業税', 'https://www.soumu.go.jp/main_sosiki/jichi_zeisei/czaisei/czaisei_seido/150790_01.html', '総務省'],
  ];
  const CSS = `*{box-sizing:border-box}body{font-family:"Noto Sans CJK JP","Hiragino Sans","IPAGothic",sans-serif;color:#000;margin:0;font-size:10.5pt;line-height:1.35}
.pg{page-break-after:always;padding:0;position:relative;min-height:262mm}.pg:last-child{page-break-after:auto}
h1{font-size:20pt;margin:30mm 0 6mm;text-align:center}h2{font-size:13pt;margin:0 0 3mm;border-bottom:2px solid #000;padding-bottom:1mm}h3{font-size:11pt;margin:4mm 0 1.5mm}
table.f{border-collapse:collapse;width:100%;margin:1mm 0 3mm}table.f td,table.f th{border:1px solid #000;padding:1.2mm 1.8mm;vertical-align:middle}table.f th{background:#eee;font-weight:bold;text-align:center}
td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}td.ln{width:9mm;text-align:center;font-size:8.5pt;color:#444}tr.t td{font-weight:bold;background:#f6f6f6}tr.s td{background:#e8e8e8;font-weight:bold}
.hd{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:2mm}.hd .no{border:2px solid #000;padding:1mm 4mm;font-weight:bold;font-size:13pt}
.who{font-size:9.5pt;margin-bottom:2mm}.hand{border:1px dashed #c00;color:#c00;padding:0 1mm;font-size:9pt;display:inline-block;min-width:30mm;min-height:5mm}
.note{font-size:8.5pt;color:#333}.warn{border:1.5px solid #c60;background:#fff4e0;padding:2mm 3mm;margin:2mm 0;font-size:9.5pt}.stamp{float:right;border:1.5px solid #000;width:22mm;height:22mm;text-align:center;font-size:8pt;padding-top:1mm}
.chk li{margin:1.2mm 0;list-style:none}.chk li:before{content:"□ ";font-size:12pt}.ng{color:#b00;font-weight:bold}.ok{color:#080}
.cover td{font-size:11pt}.small td,.small th{font-size:9pt}
@media print{@page{size:A4;margin:12mm}}`;

  // ---- 計算（tax.js の txCalc と同じ） ----
  function compute(lines, accs, fy, d) {
    const lg = TX.ledger(lines, accs, fy.from, fy.to), fs = TX.statements(lg);
    const cap = fs.bs.E.filter(r => /資本金|資本準備金|その他資本剰余金|新株式申込証拠金/.test(r.category)).reduce((s, r) => s + r.bal, 0);
    const hjIn = { months: 12, capital: d.capital === '' || d.capital == null ? cap : d.capital, emp50: (d.emp50 ?? '1') !== '0', loss: d.loss, credit: d.credit, interim: d.interim, kintoCityOv: d.kintoCityOv, kintoPrefOv: d.kintoPrefOv, entertainTotal: d.entertainTotal, entSmall: d.entSmall, entMeal: d.entMeal, adds: d.adds, subs: d.subs, dep: d.dep };
    return { lg, fs, hj: TX.hojin(hjIn, fs, fy.from), cap };
  }

  // ---- 部品 ----
  const row = (ln, label, v, cls) => `<tr class="${cls || ''}"><td class="ln">${ln ?? ''}</td><td>${esc(label)}</td><td class="n">${yen(v)}</td></tr>`;
  const head = (no, title, ctx, who) => `<div class="hd"><div><b style="font-size:13pt">${esc(title)}</b><div class="who">${esc(ENT.name)}　${esc(era(ctx.fy.from))}〜${esc(era(ctx.fy.to))}（第${ctx.fy.no}期）</div></div><div class="no">${esc(no)}</div></div>${who ? `<div class="who">提出先: ${esc(who)}</div>` : ''}`;
  const tbl = (rows, cols = ['', '項目', '金額（円）']) => `<table class="f"><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr>${rows.join('')}</table>`;
  const tbl2 = (cols, rows) => `<table class="f"><tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr>${rows.map(r => `<tr class="${r.c || ''}">${(r.r || r).map(v => typeof v === 'number' ? `<td class="n">${yen(v)}</td>` : `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</table>`;
  const page = (inner) => `<section class="pg">${inner}</section>`;
  const TAXOFFICE = '四日市税務署（法人課税部門）', PREF = '四日市県税事務所 法人課税課（〒510-8511 四日市市新正4-21-5 TEL 059-352-0578）', CITY = '四日市市役所 財政経営部 市民税課（〒510-8601 四日市市諏訪町1-5 本庁舎2F TEL 059-354-8133）';

  function warnings(ctx) {
    const { fy, d, c } = ctx, w = [], hj = c.hj, fs = c.fs;
    const need = (cond, msg, lvl = '要入力') => cond && w.push([lvl, msg]);
    need(!d.houjinNo, '法人番号（13桁）が未入力です。各申告書の法人番号欄は手書き、または「基本情報」に入力してください。');
    need(!d.phone, '電話番号が未入力です。');
    need(!d.bizType, '事業種目（法人事業概況説明書・別表一）が未入力です。');
    need(!d.repAddr, '代表者の住所が未入力です（税務署提出の別表一・第6号様式・第20号様式の代表者欄）。');
    need(true, '預貯金の支店名・口座番号は帳簿にないため、内訳書（預貯金等）に手書きしてください。', '手書き');
    need(true, '法人事業概況説明書（税務署）は未対応です。公式様式に手書きしてください（様式は国税庁サイト）。', '未対応');
    need(true, '適用額明細書（中小企業軽減税率15%を適用する場合に添付）は未対応です。公式様式に手書きしてください。', '未対応');
    need(true, '納付書（法人税・地方法人税・県税・市税）は公式の納付書に手書き、または窓口・金融機関で入手してください（この一式は納付書を印刷しません）。', '未対応');
    need(!d.dz || !d.dz.length, '別表二（同族会社の判定）の社員・議決権が未入力です。同族会社に該当しない場合は不要なこともあります。税理士に確認してください。', '確認');
    need(!(d.dep && d.dep.length), '別表十六（減価償却）の入力がありません。固定資産があるなら入力が必要です。');
    need((d.dep || []).some(r => !(+r.cost)), '別表十六に取得価額が未入力の行があります。');
    need(!(d.subs && d.subs.length), '別表四の減算（前期の事業税の認容など）が未入力です。前期に事業税を納付している場合は減算が必要です。');
    need(!(d.b5 && d.b5.length), '別表五(一)の未納租税（前期の未納法人税・県民税・市民税）が未入力です。');
    need(d.emp50 == null, '市内の従業者数（50人以下／超）の選択が未保存です。市民税均等割に影響します。');
    need(d.kintoCityOv === '' || d.kintoCityOv == null, '市民税の均等割の実額が未確認です（従業者数・資本金等からの自動値で計算しています）。');
    need(d.interim == null || d.interim === '', '中間納付額が未入力です（0円なら0を保存してください）。');
    need(fs.bs.diff !== 0, `貸借が一致していません（差額 ${yen(fs.bs.diff)}円）。`, 'エラー');
    need(fy.from < '2025-06-01', 'この期の取引は移行されていません。数字は不完全です。', 'エラー');
    const cash = fs.bs.A.find(r => r.name === '現金')?.bal ?? 0; need(cash < 0, `現金がマイナス（${yen(cash)}円）です。実際の現金残高と合わせてください。`, '確認');
    need(ctx.d.savedFlag === false, '申告タブの入力がDBに未保存です（既定値で計算しています）。「入力を保存して再計算」を押してください。', '確認');
    need(hj.income === 0, '所得が0円です。均等割のみの申告になります。内容を確認してください。', '確認');
    if (ctx.hasPersonal) w.push(['確認', '内訳書では個人の取引先名・役員名を伏せ字にしています。税務署様式の記載上、氏名が必要な箇所（役員給与等の内訳書など）は手書きしてください。']);
    return w;
  }

  // ---- 各様式 ----
  function b1(ctx) {
    const { c, d, fy } = ctx, hj = c.hj, K = TX.fK, H = TX.fH;
    const prev = ctx.A5;
    return page(head('別表一', '各事業年度の所得に係る申告書－内国法人の分（青色申告）', ctx, TAXOFFICE) +
      `<table class="f small"><tr><th>納税地</th><td>${esc(ENT.addr)}</td><th>法人番号</th><td>${esc(d.houjinNo || '')}<span class="hand">手書き</span></td></tr><tr><th>法人名</th><td>${esc(ENT.name)}</td><th>事業種目</th><td>${esc(d.bizType || '')}</td></tr><tr><th>代表者</th><td>${esc(ENT.rep)}</td><th>期末現在の資本金又は出資金の額</th><td class="n">${yen(+ctx.c.cap || 0)}</td></tr><tr><th>事業年度</th><td colspan="3">${esc(era(fy.from))} 〜 ${esc(era(fy.to))}（${hj.months}か月）　法人区分: 普通法人（その他・中小）／非営利型法人に該当しない一般社団法人</td></tr></table>` +
      tbl([row(1, '所得金額又は欠損金額（別表四「52の①」）', hj.income0), row(2, '法人税額（15%／23.2%・千円未満の所得に対し）', hj.hz), row(6, '（小計）', hj.hz), row(9, '所得税額の控除額（別表六(一)）', hj.credit),
        row(13, '差引所得に対する法人税額（千円未満切捨て）', hj.hzNet, 't'), row(14, '中間申告分の法人税額', hj.interim), row(15, '差引確定法人税額（納付すべき法人税額）', hj.final, 't'),
        row(28, '課税標準法人税額（千円未満切捨て）', K(hj.hz)), row(31, '地方法人税額（課税標準法人税額×10.3%）', hj.chihou), row(40, '差引確定地方法人税額（100円未満切捨て）', H(hj.chihou), 't'),
        row('', '防衛特別法人税（基準法人税額−500万円×4%・別表一(次葉)）', hj.boei, hj.boeiOn ? '' : ''), row('', '合計 納付すべき国税（法人税＋地方法人税＋防衛特別法人税）', hj.final + H(hj.chihou) + hj.boei, 't')]) +
      `<p class="note">行番号は国税庁様式の記載欄に概ね対応。公式様式の別表一（次葉）の欄（特定同族会社の留保金課税・地方法人税・防衛特別法人税の詳細）は、このレイアウトでは集約しています。提出時に公式様式へ転記が必要な場合は、上の数字を使ってください。申告期限: ${esc(era(dueOf(fy.to)))}（休日の場合は翌平日）。<br>
      <b>押印</b>: 代表者印は不要（令和3年以降、法人税の申告書は押印不要）／<b>税理士署名</b>: 税理士が関与しない場合は空欄。</p>`);
  }
  function b4(ctx) {
    const hj = ctx.c.hj, cr = hj.adds.filter(r => /^法人税額から控除/.test(r.label)).reduce((s, r) => s + (+r.amount || 0), 0);
    const rows = [row(1, '当期利益又は当期欠損の額（税引後）', hj.preTax, 't'), `<tr class="s"><td></td><td>加算</td><td></td></tr>`, ...hj.adds.map(r => row('', `${r.label}［${r.kind || ''}］`, +r.amount || 0)), row('', '加算 小計', hj.sA, 't'),
      `<tr class="s"><td></td><td>減算</td><td></td></tr>`, ...hj.subs.map(r => row('', `${r.label}［${r.kind || ''}］`, +r.amount || 0)), row('', '減算 小計', hj.sS, 't'), row(26, '仮計（所得税額控除分を除く）', hj.sub1 - cr), row(29, '法人税額から控除される所得税額', cr), row('', '（繰越欠損金の控除・別表七(一)）', -hj.loss), row('52', '所得金額又は欠損金額', hj.income0, 't')];
    return page(head('別表四', '所得の金額の計算に関する明細書', ctx, TAXOFFICE) + tbl(rows, ['番号', '区分', '総額（円）']) + `<p class="note">処分欄（留保／社外流出）は各行の［ ］に表記。公式様式の「留保」「社外流出」列に分けて転記してください。</p>`);
  }
  function b5(ctx) {
    const { c, d } = ctx, hj = c.hj, fs = c.fs, so = fs.bs.L.find(r => r.name === '未払法人税等'), taxOpen = so?.open ?? 0, taxClose = so?.bal ?? 0, retO = fs.bs.retainedOpen, retC = fs.eq.re.close, o5 = d.b5 || [];
    const r5 = [['繰越損益金（損は赤）', retO, retO, retC, retC], ['納税充当金', taxOpen, taxOpen, taxClose, taxClose], ['減価償却超過額', hj.depOpen, hj.depNin, hj.depExcess, hj.depOpen - hj.depNin + hj.depExcess], ...o5.map(r => [r.label, +r.open || 0, +r.dec || 0, +r.inc || 0, (+r.open || 0) - (+r.dec || 0) + (+r.inc || 0)])];
    const tot = [1, 2, 3, 4].map(i => r5.reduce((s, r) => s + r[i], 0));
    const capRows = fs.bs.E.filter(r => /資本金|資本準備金|その他資本剰余金|新株式申込証拠金/.test(r.category) && (r.bal || r.open)).map(r => [r.name, r.open, 0, r.bal - r.open, r.bal]);
    const ct = [1, 2, 3, 4].map(i => capRows.reduce((s, r) => s + r[i], 0));
    return page(head('別表五(一)', '利益積立金額及び資本金等の額の計算に関する明細書', ctx, TAXOFFICE) + `<h3>Ⅰ 利益積立金額の計算に関する明細書</h3>` + tbl2(['区分', '期首現在利益積立金額', '当期の減', '当期の増', '差引翌期首現在利益積立金額'], [...r5, { r: ['差引合計額', ...tot], c: 't' }]) +
      `<h3>Ⅱ 資本金等の額の計算に関する明細書</h3>` + tbl2(['区分', '期首現在資本金等の額', '当期の減', '当期の増', '差引翌期首現在資本金等の額'], capRows.length ? [...capRows, { r: ['差引合計額', ...ct], c: 't' }] : [{ r: ['資本金・基金等なし', 0, 0, 0, 0], c: 't' }]));
  }
  function b52(ctx) {
    const { c, d } = ctx, hj = c.hj, o5 = d.b5 || [], H = TX.fH, subsOpen = (d.subs || []).reduce((s, r) => s + (+r.amount || 0), 0);
    const find = re => o5.find(r => re.test(r.label)) || {}, ab = v => Math.abs(+v || 0);
    const hz = find(/法人税/), ken = find(/道府県|県民/), shi = find(/市町村|市民/);
    const fin = hj.final + H(hj.chihou) + hj.boei, kenN = hj.kPref + hj.zHzPref, shiN = hj.kCity + hj.zHzCity, jig = hj.biz + hj.spBiz;
    const mk = (n, o, gen) => [n, ab(o.open), gen, ab(o.dec), ab(o.open) - ab(o.dec) + gen];
    const rows = [mk('法人税（地方法人税・防衛特別法人税を含む）', hz, fin), mk('道府県民税（均等割を含む）', ken, kenN), mk('市町村民税（均等割を含む）', shi, shiN), ['事業税・特別法人事業税', subsOpen, jig, subsOpen, jig]];
    return page(head('別表五(二)', '租税公課の納付状況等に関する明細書（簡易）', ctx, TAXOFFICE) + tbl2(['税目', '期首現在未納税額', '当期発生税額', '当期中の納付税額', '期末現在未納税額'], [...rows, { r: ['合計', ...[1, 2, 3, 4].map(i => rows.reduce((s, r) => s + r[i], 0))], c: 't' }]) +
      `<p class="note">期首未納税額は別表五(一)の入力（前期の未納税額）と別表四の減算（前期事業税の認容額）から作成。当期中の納付の内訳（充当金取崩し・仮払・損金経理）は公式様式の列に分けて確認してください。<b>簡易版・要確認</b>。</p>`);
  }
  function b15_16(ctx) {
    const { c, d } = ctx, e = c.hj.ent, dep = d.dep || [];
    let h = page(head('別表十五', '交際費等の損金算入に関する明細書', ctx, TAXOFFICE) + (e.total || e.small || e.meal ? tbl([row('', '支出交際費等の額', e.total), row('', '1人5,000円以下の飲食費', e.small), row('', '交際費等の額（対象）', e.target), row('', '定額控除限度額（800万円×月数/12）', e.lim1), row('', '損金不算入額', e.disallow, 't')]) : `<p>交際費の支出はありません。<b>別表十五は不要</b>（損金不算入額0円）です。</p>`));
    h += page(head('別表十六', '減価償却資産の償却額の計算に関する明細書（集計）', ctx, TAXOFFICE) + (dep.length ? tbl2(['資産', '取得価額', '償却費計上額', '償却限度額', '償却超過額', '認容額'], dep.map(r => [r.name || '', +r.cost || 0, +r.dep || 0, +r.limit || 0, r.add != null ? +r.add || 0 : Math.max(0, (+r.dep || 0) - (+r.limit || 0)), +r.nin || 0])) : '<p>入力なし（減価償却資産の入力が必要な場合は申告タブで入力してください）。</p>') +
      `<p class="note">公式様式（別表十六(一)定額法・(二)定率法 等）は資産ごとの耐用年数・償却率が必要です。この集計は別表四・五(一)へ繋ぐ数字だけです。<b>未対応: 償却限度額の計算過程</b>。</p>`);
    return h;
  }
  const maskName = (ctx, o, nameF) => o.key && ctx.isPersonal && ctx.isPersonal(o.key) ? '（個人・氏名は出力しません）' : nameF(o);
  function fsPages(ctx) {
    const { c } = ctx, fs = c.fs, p = fs.pl, b = fs.bs, eq = fs.eq, d = ctx.d;
    const bsGroup = (title, arr) => { const cats = [...new Set(arr.map(r => r.category))].filter(k => arr.some(r => r.category === k && r.bal)); return [`<tr class="s"><td>${title}</td><td></td></tr>`, ...cats.flatMap(k => [`<tr><td>　${esc(k)}</td><td class="n">${yen(arr.filter(r => r.category === k).reduce((s, r) => s + r.bal, 0))}</td></tr>`, ...arr.filter(r => r.category === k && r.bal).map(r => `<tr><td>　　${esc(r.name)}</td><td class="n">${yen(r.bal)}</td></tr>`)]), `<tr class="t"><td>${title}合計</td><td class="n">${yen(arr.reduce((s, r) => s + r.bal, 0))}</td></tr>`]; };
    const bsH = [...bsGroup('資産の部', b.A), ...bsGroup('負債の部', b.L), `<tr class="s"><td>純資産の部</td><td></td></tr>`, ...b.E.filter(r => r.bal).map(r => `<tr><td>　${esc(r.name)}</td><td class="n">${yen(r.bal)}</td></tr>`), `<tr><td>　繰越損益（前期までの累計）</td><td class="n">${yen(b.plBefore)}</td></tr>`, `<tr><td>　当期純利益</td><td class="n">${yen(b.net)}</td></tr>`, `<tr class="t"><td>純資産の部合計</td><td class="n">${yen(b.totE + b.cumPL)}</td></tr>`, `<tr class="t"><td>負債・純資産合計</td><td class="n">${yen(b.totalLE)}</td></tr>`];
    const li = arr => arr.filter(r => r.bal).map(r => `<tr><td>　${esc(r.name)}</td><td class="n">${yen(r.bal)}</td></tr>`).join('');
    const t2 = (l, v) => `<tr class="t"><td>${l}</td><td class="n">${yen(v)}</td></tr>`;
    const plH = t2('売上高', p.sales) + li(p.revSales) + t2('売上原価', p.cogs) + t2('売上総利益', p.gross) + t2('販売費及び一般管理費', p.sga) + t2('営業利益', p.opInc) + t2('営業外収益', p.nIn) + li(p.nonOpIn) + t2('営業外費用', p.nOut) + li(p.nonOpOut) + t2('経常利益', p.ordinary) + t2('特別利益', p.spI) + t2('特別損失', p.spO) + t2('税引前当期純利益', p.pretax) + t2('法人税、住民税及び事業税', p.tax) + t2('当期純利益', p.net);
    const sgaH = [...p.sgaRows.filter(r => r.bal).sort((x, y) => y.bal - x.bal).map(r => `<tr><td>${esc(r.name)}</td><td class="n">${yen(r.bal)}</td><td class="n">${p.sga ? (r.bal / p.sga * 100).toFixed(1) + '%' : ''}</td></tr>`), `<tr class="t"><td>販売費及び一般管理費 合計</td><td class="n">${yen(p.sga)}</td><td></td></tr>`].join('');
    const col = k => [eq.cap[k], eq.cs[k], eq.re[k], eq.oth[k]], sm = a => a.reduce((s, v) => s + v, 0);
    const eqRows = [['当期首残高', ...col('open'), sm(col('open'))], ['当期変動額（当期純利益）', 0, 0, eq.re.ni, 0, eq.re.ni], ['当期変動額（その他）', eq.cap.other, eq.cs.other, eq.re.other, eq.oth.other, eq.cap.other + eq.cs.other + eq.re.other + eq.oth.other], { r: ['当期末残高', ...col('close'), sm(col('close'))], c: 't' }];
    const sub = '<div class="who">表記は千円ではなく円。</div>';
    return page(head('決算書(1)', '貸借対照表', ctx) + `<div class="who">${esc(era(ctx.fy.to))}現在</div><table class="f small"><tr><th>科目</th><th>金額（円）</th></tr>${bsH.join('')}</table>`) +
      page(head('決算書(2)', '損益計算書', ctx) + `<table class="f small"><tr><th>科目</th><th>金額（円）</th></tr>${plH}</table>`) +
      page(head('決算書(3)', '販売費及び一般管理費の内訳', ctx) + `<table class="f small"><tr><th>科目</th><th>金額（円）</th><th>構成比</th></tr>${sgaH}</table>` + head('決算書(4)', '社員資本等変動計算書', ctx) + tbl2(['', '資本金', '資本剰余金', '利益剰余金', '評価・換算等', '純資産合計'], eqRows) + `<p class="note">一般社団法人は株主がいないため「社員資本等変動計算書」とした。</p>`) +
      page(head('決算書(5)', '個別注記表', ctx) + ['重要な会計方針', '会計方針の変更', '貸借対照表に関する注記', '損益計算書に関する注記', '社員資本等変動計算書に関する注記', '継続企業の前提', '重要な後発事象', 'その他'].map((n, i) => `<h3>${i + 1}. ${n}</h3><div style="min-height:${i ? 10 : 16}mm;border-bottom:1px dotted #888">${esc(d['note' + i] ?? (i === 0 ? '固定資産の減価償却は定率法／定額法（要確認）。消費税等の会計処理は税込方式。免税事業者。' : ''))}</div>`).join('') + `<p class="note">中小法人は注記を一部省略できます。</p>`);
  }
  function nsPages(ctx) {
    const { cache, accs, fy, c } = ctx, B = (names, mode, key) => TX.breakdown(cache.lines, accs, names, fy.from, fy.to, mode, key), fs = c.fs;
    const pn = o => ctx.partnerName(o.key);
    const show = (arr, nameF) => { const rows = arr.slice(0, 25).map(o => [maskName(ctx, o, nameF || pn), o.accts, o.amount]), rest = arr.slice(25).reduce((s, o) => s + o.amount, 0); if (rest) rows.push([`その他（${arr.length - 25}件）`, '', rest]); rows.push({ r: ['合計', '', arr.reduce((s, o) => s + o.amount, 0)], c: 't' }); return rows; };
    const sec = (title, arr, cols, note) => `<h3>${esc(title)}</h3>${tbl2(cols, arr)}${note ? `<p class="note">${note}</p>` : ''}`;
    const banks = fs.bs.A.filter(r => r.category === '現金・預金' && r.bal && r.name !== '現金').map(r => [r.name.replace(/（API）/, ''), '預金', r.bal]);
    const H = ['相手先・内容', '科目', '期末残高'], HF = ['相手先・内容', '科目', '当期発生額'];
    const yakuin = B(['役員報酬'], 'flow', 'partner'), yakuinTot = yakuin.reduce((s, o) => s + o.amount, 0);
    const nm = o => o.key;
    return page(head('内訳明細書(1)', '勘定科目内訳明細書（預貯金・売掛金・仮払金・買掛金・未払金）', ctx, TAXOFFICE) +
      sec('① 預貯金等の内訳書', [...banks, { r: ['合計', '', banks.reduce((s, r) => s + r[2], 0)], c: 't' }], ['金融機関名・口座', '種類', '期末現在高'], `支店名・口座番号は<span class="hand">手書き</span>。現金（帳簿 ${yen(fs.bs.A.find(r => r.name === '現金')?.bal ?? 0)}円）は対象外。`) +
      sec('④ 売掛金（未収入金）の内訳書', show(B(['売掛金', '未収入金'], 'bal', 'partner')), H) + sec('⑤ 仮払金（前渡金・貸付金）の内訳書', show(B(['仮払金', '前渡金', '立替金', '貸付金', '短期貸付金', '長期貸付金'], 'bal', 'partner')), H) +
      sec('⑪ 買掛金の内訳書', show(B(['買掛金'], 'bal', 'partner')), H) + sec('⑫ 未払金・未払費用の内訳書', show(B(['未払金', '長期未払金', '未払費用'], 'bal', 'partner')), H)) +
      page(head('内訳明細書(2)', '勘定科目内訳明細書（借入金・役員給与・地代家賃・雑益損失）', ctx, TAXOFFICE) +
      sec('カード・預り金等（参考）', show(B([/カード|JCB|MasterCard/, '預り金'], 'bal', 'acct'), nm), H) + sec('⑮ 借入金の内訳書', show(B(['短期借入金', '長期借入金', '役員借入金'], 'bal', 'partner')), H) +
      sec('⑯ 役員給与等の内訳書（役員報酬・氏名は出力しません）', [['役員報酬（合計）', '役員報酬', yakuinTot], { r: ['合計', '', yakuinTot], c: 't' }], HF, '役員の氏名・役職・支給額の内訳は<span class="hand">手書き</span>（定期同額給与か要確認）。') +
      sec('⑯ 地代家賃等の内訳書', show(B(['地代家賃'], 'flow', 'partner')), HF, '所在地・賃借期間・契約内容は<span class="hand">手書き</span>。') + sec('⑯ 雑益・雑損失の内訳書', show(B(['雑収入', '受取利息'], 'flow', 'partner')), HF) +
      sec('人件費（給料手当・法定福利費・福利厚生費）', show(B(['給料手当', '法定福利費', '福利厚生費'], 'flow', 'acct'), nm), HF));
  }
  function ken6(ctx) {
    const hj = ctx.c.hj, d = ctx.d, fy = ctx.fy, K = TX.fK;
    return page(head('第6号様式', '法人県民税・法人事業税・特別法人事業税 中間・確定申告書（準拠）', ctx, PREF) +
      `<table class="f small"><tr><th>所在地</th><td>${esc(ENT.addr)}</td><th>法人番号</th><td>${esc(d.houjinNo || '')}<span class="hand">手書き</span></td></tr><tr><th>法人名・代表者</th><td colspan="3">${esc(ENT.name)}　${esc(ENT.rep)}</td></tr><tr><th>事業年度</th><td colspan="3">${esc(era(fy.from))}〜${esc(era(fy.to))}　確定申告　資本金等の額 ${yen(+ctx.c.cap || 0)}円</td></tr></table>` +
      tbl([row('', '法人税額（課税標準となる法人税額・千円未満切捨て）', K(hj.hz)), row('', '法人税割額（税率1.0%・100円未満切捨て）', hj.zHzPref), row('', '均等割額（年額22,000円×月数/12）', hj.kPref), row('', '法人県民税 計（納付額）', hj.zHzPref + hj.kPref, 't'),
        row('', '所得金額（法人事業税の課税標準・千円未満切捨て後 '+yen(hj.income)+'円）', hj.income0), row('', '所得割額（3.5%／5.3%／7.0%・100円未満切捨て）', hj.biz), row('', '法人事業税 計（納付額）', hj.biz, 't'), row('', '特別法人事業税（所得割額×37%・100円未満切捨て）', hj.spBiz, 't'),
        row('', '納付すべき道府県税・特別法人事業税 合計', hj.zHzPref + hj.kPref + hj.biz + hj.spBiz, 't')]) +
      `<p class="note">提出期限: ${esc(era(dueOf(fy.to)))}。郵送は郵便又は信書便（通信日付印が提出日）。法人事業税は<b>非営利型でない普通法人</b>として全所得に課税。添付: 法人税の別表一・四（写し）、決算書。公式の第6号様式の欄番号に合わせた転記は上記の数字を使用してください（自作レイアウト）。<br>押印: 代表者印の押印は不要（県の様式は押印欄を廃止している場合あり・様式で確認）。</p>`);
  }
  function shi20(ctx) {
    const hj = ctx.c.hj, d = ctx.d, fy = ctx.fy, K = TX.fK;
    return page(head('第20号様式', '法人市民税 確定申告書（準拠）', ctx, CITY) +
      `<table class="f small"><tr><th>所在地</th><td>${esc(ENT.addr)}</td><th>法人番号</th><td>${esc(d.houjinNo || '')}<span class="hand">手書き</span></td></tr><tr><th>法人名・代表者</th><td colspan="3">${esc(ENT.name)}　${esc(ENT.rep)}</td></tr><tr><th>事業年度</th><td colspan="3">${esc(era(fy.from))}〜${esc(era(fy.to))}　確定申告　市内従業者数 ${(d.emp50 ?? '1') !== '0' ? '50人以下' : '50人超'}</td></tr></table>` +
      tbl([row('', '法人税額（課税標準となる法人税額・千円未満切捨て）', K(hj.hz)), row('', '法人税割額（税率7.2%・100円未満切捨て）', hj.zHzCity), row('', `均等割額（${yen(hj.kintoCity)}円基準×月数/12${d.kintoCityOv ? '・実額入力' : ''}）`, hj.kCity), row('', '納付すべき法人市民税額', hj.zHzCity + hj.kCity, 't')]) +
      `<p class="note">提出期限: ${esc(era(dueOf(fy.to)))}（納付期限も同じ）。窓口・郵送。納付書は四日市市の法人市民税納付書（PDF/Excel）を使用。添付: 法人税の別表一・四（写し）、決算書。</p>`);
  }
  function summary(ctx) {
    const hj = ctx.c.hj, H = TX.fH, fy = ctx.fy;
    const kens = hj.zHzPref + hj.kPref + hj.biz + hj.spBiz, shi = hj.zHzCity + hj.kCity, fin = hj.final + H(hj.chihou) + hj.boei;
    return { fin, kens, shi, total: fin + kens + shi, rows: [['四日市税務署（国税）', '法人税', hj.final], ['', '地方法人税', H(hj.chihou)], ['', '防衛特別法人税', hj.boei], ['四日市県税事務所', '法人県民税（均等割＋法人税割）', hj.kPref + hj.zHzPref], ['', '法人事業税', hj.biz], ['', '特別法人事業税', hj.spBiz], ['四日市市', '法人市民税（均等割＋法人税割）', shi], { r: ['', '納付額 合計', fin + kens + shi], c: 't' }] };
  }
  function cover(ctx, S) {
    const fy = ctx.fy, due = dueOf(fy.to);
    return page(`<h1>法人税等 確定申告書類一式</h1><table class="f cover"><tr><th>法人名</th><td>${esc(ENT.name)}</td></tr><tr><th>所在地</th><td>${esc(ENT.addr)}</td></tr><tr><th>代表者</th><td>${esc(ENT.rep)}</td></tr><tr><th>事業年度</th><td>第${fy.no}期　${esc(era(fy.from))} 〜 ${esc(era(fy.to))}</td></tr><tr><th>区分</th><td>普通法人（非営利型でない一般社団法人）／青色申告／免税事業者（消費税の申告なし）</td></tr><tr><th>申告期限</th><td><b>${esc(era(due))}</b>（${due}）※土日祝の場合は翌平日　（納付期限も同日）</td></tr><tr><th>作成日</th><td>${esc(era(ctx.today))}　<span class="note">自作会計から出力。</span></td></tr></table>
      <div class="warn"><b>概算です。提出前に必ず税理士が確認してください。</b>この一式は電子申告ではなく紙提出用です。様式は公式様式に<b>準じた自作レイアウト</b>で、公式様式PDFへの重ね書きではありません（根拠URLは最終ページ）。</div>
      <h3>提出先と綴り</h3>${tbl2(['提出先', '内容（綴りの順）', '部数'], [['① 四日市税務署', 'A-1 別表一 / A-2 別表四 / A-3 別表五(一) / A-4 別表五(二) / A-5 別表十五・十六 / A-6 決算書 / A-7 勘定科目内訳明細書（法人事業概況説明書・適用額明細書は手書き）', '正本1＋控え1'], ['② 四日市県税事務所', 'B-1 第6号様式（準拠）＋別表一・四の写し・決算書の写し', '正本1＋控え1'], ['③ 四日市市役所 市民税課', 'C-1 第20号様式（準拠）＋別表一・四の写し・決算書の写し', '正本1＋控え1']])}
      <h3>納付額（概算）</h3>${tbl2(['納付先', '税目', '金額（円）'], S.rows)}<p class="note">中間納付がある場合は差し引いてください（県・市の中間納付額は未入力のため考慮していません）。</p>`);
  }
  function checklist(ctx, W) {
    const fy = ctx.fy, due = dueOf(fy.to);
    return page(`<h2>提出前チェックリスト</h2><ul class="chk"><li>税理士に数字を確認してもらった（<b>概算</b>）</li><li>申告期限 <b>${esc(era(due))}</b> までに、税務署・県税事務所・市役所の3か所へ提出する（郵送は郵便又は信書便。通信日付印が提出日）</li><li>納付期限も同日。納付書（国税・県税・市税）を用意した（この一式には納付書は含まれません）</li><li>各書類の法人番号・代表者住所・電話番号・事業種目を記入した（手書き欄は赤点線）</li><li>代表者印: 法人税の申告書は押印不要。県・市の様式でも押印欄の有無を確認した</li><li>税務署用に別表一・別表四・決算書・内訳書の控え（受付印用）を用意し、返信用封筒（郵送の場合）を入れた</li><li>法人事業概況説明書（手書き）を添付した</li><li>適用額明細書（中小企業軽減税率を適用）を添付した</li><li>県・市には別表一・四（写し）と決算書（写し）を添付した</li><li>電子申告（e-Tax／eLTAX）にするか紙にするか決めた（紙の場合は上記一式。資本金1億円以下の法人は電子申告の義務なし）</li><li>消費税: 免税事業者のため申告なし（基準期間の課税売上高1,000万円以下・インボイス登録なし）を確認した</li></ul>
    <h2>入力不足・要確認の一覧（${W.length}件）</h2>${W.length ? tbl2(['区分', '内容'], W) : '<p class="ok">警告はありません。</p>'}`);
  }
  function sources(ctx) { return page(`<h2>根拠・様式の入手先</h2>${tbl2(['内容', 'URL', '提供元'], SOURCES)}<p class="note">確認日: ${esc(ctx.today)}。公式様式PDF（別表一・四・五(一)・五(二) 等）は国税庁の上記ページから入手できます。このシステムの出力は公式様式の欄に合わせた<b>自作レイアウト</b>です。提出先の窓口によっては公式様式への転記を求められる場合があります。</p>
    <h3>未対応の書類</h3><ul><li>法人事業概況説明書（手書き）</li><li>適用額明細書（手書き）</li><li>別表六(一)（所得税額控除の明細・金額が小さいため別表一に集約）</li><li>別表七(一)（欠損金・入力のみ反映）</li><li>別表二（同族会社判定・入力があれば画面で計算）</li><li>別表十六の償却限度額計算の過程</li><li>納付書・電子申告用データ</li></ul>`); }

  function build(ctx) {
    ctx.today = ctx.today || new Date().toISOString().slice(0, 10);
    ctx.c = ctx.c || compute(ctx.cache.lines, ctx.accs, ctx.fy, ctx.d);
    const W = warnings(ctx), S = summary(ctx), only = ctx.only || 'all';
    const A = [b1(ctx), b4(ctx), b5(ctx), b52(ctx), b15_16(ctx), fsPages(ctx), nsPages(ctx)].join('');
    const sect = (t, body) => body;
    const out = (only === 'all' ? cover(ctx, S) + checklist(ctx, W) : '') + (only === 'all' || only === 'nta' ? A : '') + (only === 'all' || only === 'pref' ? ken6(ctx) : '') + (only === 'all' || only === 'city' ? shi20(ctx) : '') + (only === 'all' ? sources(ctx) : '');
    return { html: `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>申告書類一式 第${ctx.fy.no}期</title><style>${CSS}</style></head><body>${out}</body></html>`, warnings: W, summary: S };
  }
  const api = { build, compute, warnings, SOURCES, dueOf, fyOf, era, ENT };
  if (typeof module !== 'undefined') module.exports = api; else root.TXP = api;
})(typeof window !== 'undefined' ? window : globalThis);
