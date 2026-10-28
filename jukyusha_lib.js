// 受給者証の入力フォーム：項目の定義・日付（令和/平成/西暦→西暦ISO）・入力の検証・見本の図。
// 保護者ページ（jukyusha.html）・職員画面（leo_jukyusha.js）・テスト（tools/jukyusha_form_check.js）が同じものを使う。
// サーバー側の検証は supabase/leo_jukyusha_form.sql の leo_jf_submit（同じ規則）。
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.JukyushaForm = factory(); })(typeof self !== 'undefined' ? self : this, function () {
  // 元号の初日（この日より前の日付は、その元号では存在しない）と、最後の日
  const ERAS = { '令和': { from: [2019, 5, 1], to: null, base: 2018 }, '平成': { from: [1989, 1, 8], to: [2019, 4, 30], base: 1988 }, '西暦': null };
  const DB_CAPS = [0, 4600, 37200];   // いまの請求の設定（leo_children.cap_monthly の check）
  const num = s => { const t = String(s == null ? '' : s).normalize('NFKC').replace(/[\s,，]/g, ''); return /^\d+$/.test(t) ? +t : NaN; };
  const iso = (y, m, d) => `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const cmp = (a, b) => (a[0] - b[0]) || (a[1] - b[1]) || (a[2] - b[2]);
  // {era:'令和'|'平成'|'西暦', y, m, d} → {iso} か {err}
  function toIso(x) {
    const era = x && x.era, y = num(x && x.y), m = num(x && x.m), d = num(x && x.d);
    if (!(era in ERAS)) return { err: '元号（令和・平成・西暦）を選んでください。' };
    if (isNaN(y) || isNaN(m) || isNaN(d)) return { err: '年・月・日を数字で入れてください。' };
    if (y < 1) return { err: '年は1以上です。（令和元年は「1」）' };
    const e = ERAS[era], Y = e ? e.base + y : y;
    if (Y < 1900 || Y > 2100) return { err: '年が正しくありません。' };
    const t = new Date(Date.UTC(Y, m - 1, d));
    if (m < 1 || m > 12 || d < 1 || t.getUTCFullYear() !== Y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return { err: `${era}${y}年${m}月${d}日 という日はありません。` };
    if (e && (cmp([Y, m, d], e.from) < 0 || (e.to && cmp([Y, m, d], e.to) > 0))) return { err: `${era}${y}年${m}月${d}日 は、${era}の期間に入っていません。元号か年を見なおしてください。` };
    return { iso: iso(Y, m, d) };
  }
  // 西暦ISO → 令和8年9月1日 のような表示（令和・平成。それ以前は西暦）
  function jaDate(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); if (!m) return '';
    const t = [+m[1], +m[2], +m[3]];
    if (cmp(t, ERAS['令和'].from) >= 0) return `令和${t[0] - 2018 === 1 ? '元' : t[0] - 2018}年${t[1]}月${t[2]}日`;
    if (cmp(t, ERAS['平成'].from) >= 0) return `平成${t[0] - 1988 === 1 ? '元' : t[0] - 1988}年${t[1]}月${t[2]}日`;
    return `${t[0]}年${t[1]}月${t[2]}日`;
  }
  // 西暦ISO → 入力欄に入れる {era, y, m, d}（令和・平成の期間に入る日付はその元号で、それ以外は西暦）。不正な値は null
  function fromIso(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); if (!m) return null;
    const t = [+m[1], +m[2], +m[3]]; const u = new Date(Date.UTC(t[0], t[1] - 1, t[2])); if (u.getUTCFullYear() !== t[0] || u.getUTCMonth() !== t[1] - 1 || u.getUTCDate() !== t[2]) return null;
    if (cmp(t, ERAS['令和'].from) >= 0) return { era: '令和', y: String(t[0] - 2018), m: String(t[1]), d: String(t[2]) };
    if (cmp(t, ERAS['平成'].from) >= 0) return { era: '平成', y: String(t[0] - 1988), m: String(t[1]), d: String(t[2]) };
    return { era: '西暦', y: String(t[0]), m: String(t[1]), d: String(t[2]) };
  }
  const seiDate = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? `${+m[1]}年${+m[2]}月${+m[3]}日` : ''; };
  // 項目の定義。panel＝広げた受給者証の面（①〜⑥）。map＝利用者情報（既存の列）。map のない項目は「参考」で、反映しない。
  //   map の行き先：leo_children（jukyusha_no, city_no, kind, cap_monthly, contract_days, contract_end, mushouka）／leo_child_info（guardian_name）
  const PANELS = { 1: '① 通所受給者証', 2: '② 給付決定内容', 4: '④ 相談支援', 5: '⑤ 利用者負担' };
  const FIELDS = [
    { k: 'jukyusha_no', label: '受給者証番号', panel: 1, type: 'digits', len: 10, req: 1, map: 'jukyusha_no', ex: '0123456789', help: '①の面の上のほうにある、10けたの数字です。' },
    { k: 'city_name', label: '支給市町村（市町村名）', panel: 1, type: 'text', max: 30, ex: '四日市市', help: '①の面の「支給市町村名」です。' },
    { k: 'city_no', label: '市町村番号', panel: 1, type: 'digits', len: 6, map: 'city_no', ex: '242021', help: '①の面の「市町村番号」（6けた）。見つかるときだけ入れてください。' },
    { k: 'guardian_name', label: '保護者のお名前', panel: 1, type: 'text', max: 50, req: 1, map: 'guardian_name', ex: '見本 花子', help: '①の面の「保護者」の氏名です。' },
    { k: 'child_name', label: 'お子さんのお名前', panel: 1, type: 'text', max: 50, req: 1, ex: '見本 太郎', help: '①の面の「児童」の氏名です。' },
    { k: 'child_birth', label: 'お子さんの生年月日', panel: 1, type: 'date', help: '①の面の、児童の生年月日です。' },
    { k: 'issue_date', label: '交付年月日', panel: 1, type: 'date', help: '①の面の、受給者証が出された日です。' },
    { k: 'kind', label: 'サービスの種類', panel: 2, type: 'radio', req: 1, map: 'kind', opts: [['児発', '児童発達支援（児発）'], ['放デイ', '放課後等デイサービス（放デイ）']], help: '②の面の「支援の種類」です。' },
    { k: 'contract_days', label: '支給量（1か月に使える日数）', panel: 2, type: 'days', req: 1, map: 'contract_days', ex: '23', help: '②の面の「支給量等」です。「20.0日/月」なら 20 と入れます。' },
    { k: 'amount_text', label: '支給量等（日数以外に書かれていること）', panel: 2, type: 'area', rows: 2, max: 200, help: '②の面の「支給量等」に、日数（「20.0日/月」など）のほかに文字が書いてあれば、そのまま写してください。（例：児童発達支援加算サポートⅠ、児童発達支援基本決定）。なければ空のままで大丈夫です。' },
    { k: 'period_from', label: '給付決定期間（はじめ）', panel: 2, type: 'date', req: 1, help: '②の面の「給付決定期間」の、はじめの日です。②が2つあるときは、いま使っている新しいほうです。' },
    { k: 'period_to', label: '給付決定期間（終わり）', panel: 2, type: 'date', req: 1, map: 'contract_end', help: '②の面の「給付決定期間」の、終わりの日です（「〜まで」の日）。' },
    { k: 'soudan_office', label: '相談支援事業所（事業所名）', panel: 4, type: 'area', rows: 2, max: 100, help: '④の面（児童相談支援給付費）の「指定相談支援事業所名」です。書いていなければ、空のままで大丈夫です。' },
    { k: 'soudan_person', label: '担当の相談支援専門員のお名前', panel: 4, type: 'area', rows: 1, max: 60, help: '受給者証に書いていなければ、分かる範囲で（わからなければ空のままで大丈夫です）。' },
    { k: 'cap_monthly', label: '負担上限月額', panel: 5, type: 'cap', req: 1, map: 'cap_monthly', help: '⑤の面の「負担上限月額」です。' },
    { k: 'cap_mgmt', label: '上限額管理', panel: 5, type: 'radio', opts: [['該当', '該当'], ['非該当', '非該当'], ['分からない', '分からない']], help: '⑤の面の「上限額管理」の欄です。' },
    { k: 'mushouka', label: '無償化の対象', panel: 5, type: 'radio', map: 'mushouka', opts: [['yes', 'はい'], ['no', 'いいえ'], ['unknown', '分からない']], help: '⑤の面の「特記事項」に「無償化対象児童」と書いてありますか。' },
    { k: 'other', label: 'その他（特記事項など）', panel: 0, type: 'area', rows: 4, max: 500, help: '⑤の面の「特記事項」欄や、そのほか受給者証に書いてあること、職員に伝えたいことがあれば自由に書いてください。なければ空のままで大丈夫です。' },
  ];
  const byKey = Object.fromEntries(FIELDS.map(f => [f.k, f]));
  const DATE_KEYS = FIELDS.filter(f => f.type === 'date').map(f => f.k);
  const nameClean = s => String(s || '').normalize('NFKC').replace(/[\s\u3000]+/g, ' ').trim();
  // raw：画面の入力。日付は {era,y,m,d}、cap は {sel:'0'|'4600'|'37200'|'other', other:'9300'}、ほかは文字列。
  // today（省略可）：テストで日付を固定するため。戻り値 { vals, errors:{項目:メッセージ} }。vals は送信する値（空の項目は入れない）。
  function validate(raw, today) {
    const T = today ? new Date(today) : new Date(), tIso = iso(T.getFullYear(), T.getMonth() + 1, T.getDate());
    const vals = {}, errors = {}, put = (k, v) => { if (v !== '' && v != null) vals[k] = v; };
    raw = raw || {};
    FIELDS.forEach(f => {
      const r = raw[f.k], need = msg => { errors[f.k] = msg; };
      if (f.type === 'digits') {
        const t = String(r || '').normalize('NFKC').replace(/[\s-]/g, '');
        if (!t) { if (f.req) need(`${f.label}を入れてください。`); }
        else if (!new RegExp(`^\\d{${f.len}}$`).test(t)) need(`${f.label}は${f.len}けたの数字です。（いま${t.length}文字）`); else put(f.k, t);
      } else if (f.type === 'text') {
        const t = f.k === 'city_name' ? String(r || '').normalize('NFKC').trim() : nameClean(r);
        if (!t) { if (f.req) need(`${f.label}を入れてください。`); }
        else if (t.length > f.max) need(`${f.label}は${f.max}文字までです。`); else put(f.k, t);
      } else if (f.type === 'area') {   // 自由記入（改行はそのまま。NFKC にはしない＝「Ⅰ」などもそのまま）
        const t = String(r || '').replace(/\r\n?/g, '\n').replace(/[ \t\u3000]+$/gm, '').trim();
        if (t.length > f.max) need(`${f.label}は${f.max}文字までです。（いま${t.length}文字）`); else if (t) put(f.k, t);
      } else if (f.type === 'days') {
        const t = String(r || '').normalize('NFKC').replace(/\s/g, '').replace(/日(\/月)?$/, '');
        if (!t) need('支給量（日数）を入れてください。');
        else if (!/^\d{1,2}(\.0+)?$/.test(t) || !(parseInt(t, 10) >= 1 && parseInt(t, 10) <= 31)) need('支給量は 1〜31 の日数です。（例：20.0日/月 → 20）'); else put(f.k, String(parseInt(t, 10)));
      } else if (f.type === 'radio') {
        if (!r) { if (f.req) need(`${f.label}を選んでください。`); } else if (!f.opts.some(o => o[0] === r)) need('選びなおしてください。'); else put(f.k, r);
      } else if (f.type === 'cap') {
        const sel = r && r.sel;
        if (!sel) need('負担上限月額を選んでください。');
        else if (sel === 'other') { const n = num(r.other); if (isNaN(n) || n < 1 || n > 9999999) need('その他の金額を、数字で入れてください。（例：9300）'); else put('cap_other', String(n)); }
        else if (DB_CAPS.includes(+sel)) put('cap_monthly', String(+sel)); else need('選びなおしてください。');
      } else if (f.type === 'date') {
        const blank = !r || !String(r.y || '').trim() && !String(r.m || '').trim() && !String(r.d || '').trim();
        if (blank) { if (f.req) need(`${f.label}を入れてください。`); return; }
        const x = toIso(r); if (x.err) need(x.err); else put(f.k, x.iso);
      }
    });
    const lim = (k, lo, hi, msg) => { if (vals[k] && !errors[k] && (vals[k] < lo || vals[k] > hi)) errors[k] = msg; };
    const plus = (s, n) => iso(+s.slice(0, 4) + n, +s.slice(5, 7), Math.min(+s.slice(8, 10), 28));
    lim('child_birth', '2000-01-01', tIso, 'お子さんの生年月日が、2000年より前か、今日より先になっています。年を見なおしてください。');
    lim('issue_date', '2015-01-01', plus(tIso, 1), '交付年月日が、古すぎるか、先すぎます。年を見なおしてください。');
    lim('period_from', '2015-01-01', plus(tIso, 5), '給付決定期間（はじめ）が、古すぎるか、先すぎます。年を見なおしてください。');
    lim('period_to', '2015-01-01', plus(tIso, 8), '給付決定期間（終わり）が、古すぎるか、先すぎます。年を見なおしてください。');
    if (vals.period_from && vals.period_to && !errors.period_from && !errors.period_to) {
      if (vals.period_from > vals.period_to) errors.period_to = '終わりの日が、はじめの日より前になっています。入れなおしてください。';
      else if (vals.period_to > plus(vals.period_from, 5)) errors.period_to = '期間が5年より長くなっています。年を見なおしてください。';
    }
    return { vals, errors };
  }
  // 入力の値 → 利用者情報（既存の列）。vals＝保存された値。反映の初期値に使う。mushouka は yes/no だけ（分からない は対象外）。
  const MAP = Object.fromEntries(FIELDS.filter(f => f.map).map(f => [f.k, f.map]));
  function toDb(vals) {
    const o = {};
    Object.entries(MAP).forEach(([k, col]) => { const v = vals[k]; if (v == null || v === '') return; o[col] = k === 'mushouka' ? (v === 'yes' ? true : v === 'no' ? false : undefined) : (k === 'cap_monthly' || k === 'contract_days' ? +v : v); if (o[col] === undefined) delete o[col]; });
    return o;
  }
  // 広げた受給者証の見本の図（架空・文字は項目名だけ）。hl＝強調する面の番号（1〜6）。小さい版は small:true
  const PANEL_NAMES = ['通所受給者証', '給付決定内容', '給付決定（2つめ）', '相談支援', '利用者負担', '（空欄）'];
  function svg(hl, small) {
    const W = 300, H = 168, pw = 100, ph = 84, cell = i => [(i % 3) * pw, Math.floor(i / 3) * ph];
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="広げた受給者証の図。3列×2段の6つの面。${hl ? PANEL_NAMES[hl - 1] + 'の面を色で示しています' : ''}" style="width:100%;max-width:${small ? 150 : 340}px;display:block;margin:6px auto"><rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="4" fill="#fffdf5" stroke="#555" stroke-width="2"/>`;
    for (let i = 0; i < 6; i++) { const [x, y] = cell(i), on = hl === i + 1;
      s += `<rect x="${x + 2}" y="${y + 2}" width="${pw - 4}" height="${ph - 4}" fill="${on ? '#ffd9a8' : 'none'}" stroke="${on ? '#e8833a' : '#999'}" stroke-width="${on ? 3 : 1}"/>`;
      s += `<text x="${x + pw / 2}" y="${y + 16}" font-size="${small ? 11 : 10}" text-anchor="middle" font-weight="bold" fill="#333">${'①②③④⑤⑥'[i]}${small ? '' : ' ' + PANEL_NAMES[i]}</text>`;
      if (i !== 5) s += `<g stroke="#bbb" stroke-width="3" stroke-linecap="round"><path d="M${x + 10} ${y + 32}h${pw - 24}M${x + 10} ${y + 44}h${pw - 40}M${x + 10} ${y + 56}h${pw - 24}M${x + 10} ${y + 68}h${pw - 52}"/></g>`; }
    return s + '</svg>';
  }
  return { ERAS, DB_CAPS, FIELDS, PANELS, PANEL_NAMES, byKey, DATE_KEYS, MAP, toIso, fromIso, jaDate, seiDate, validate, toDb, svg, nameClean };
});
