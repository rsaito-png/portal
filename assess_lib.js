// レオ 初回アセスメント：項目の定義と入力の検証。
// 見出しは Google フォーム「アセスメントシート（児童）」と同じ（tools/assess_tab_spec.json）。
// キーは利用者情報のアセスメントタブ（leo_child_assess.data）と共通。足りない項目だけ足してある。
// 保護者ページ（assess.html）・職員画面（leo_assess.js / leo.js）・テストが同じものを使う。
// サーバー側の検証は supabase/leo_assess_form.sql の leo_af_clean（同じ規則）。
// 保険証・受給者証の写真は受け取らない（受給者証フォームと同じ）。リンク欄は任意。
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.AssessForm = factory(); })(typeof self !== 'undefined' ? self : this, function () {
  const YN = ['はい', 'いいえ'];
  const ARI = ['有り', '無し'];
  const PHOTO_SEC = '■他事業所・書類・同意';
  const PHOTO_NOTE = '保険証・受給者証の写真は、ここでは受け取りません（アップロードはありません）。原本は来所のときにお持ちください。受給者証の番号や負担額などは、受給者証の入力で別に伺います。写真のリンク（https）があるときだけ、任意で貼れます。空でも送れます。';
  // [セクション, [[キー, 表示名, フォーム見出し, 型], ...]]
  // 型: text / area / date / tel / yn（はい・いいえ） / ari（有り・無し） / url（任意の https。空でよい）
  const SPEC = [
    ['■基本情報', [
      ['name_kana', '児童名（ふりがな）', '児童名（ふりがな）', 'text'],
      ['birth', '生年月日', '生年月日', 'date'],
      ['school', '学校・園／学年', '学校・園の名前と学年', 'text'],
      ['guardian', '窓口となる保護者（ふりがな）', '窓口となる保護者氏名（ふりがな）', 'text'],
      ['address', '住所', '住所', 'text'],
      ['phone', '電話番号', '電話番号', 'tel'],
      ['guardian_phone', '保護者電話番号', '保護者電話番号', 'tel'],
      ['emergency', '緊急連絡先', '緊急連絡先（氏名・関係・電話番号。冒頭に書いた方以外で、できるだけたくさん）', 'area']
    ]],
    ['■家族', [
      ['family', '家族構成', '家族構成を箇条書きで記載してください（職業・学年）', 'area'],
      ['rel', '親子・兄弟関係の特徴', '親子関係・兄弟関係の特徴', 'area']
    ]],
    ['■診断・医療', [
      ['diagnosis', '診断名・障がい名', '診断名・障がい名など', 'area'],
      ['techo', '手帳（種別・判定）', '手帳をお持ちであれば種別・判定内容を記載ください', 'area'],
      ['agencies', 'これまでに関わった機関・病院', 'これまでに関わった機関、病院名など', 'area'],
      ['visit_status', '通院の状況', '通院の状況', 'area'],
      ['meds_status', '服薬の状況', '服薬の状況', 'area'],
      ['meds_regular', '常用している薬', '常用している薬', 'area'],
      ['hp_pediatric', '小児科（病院・担当医）', '小児科の病院名、担当医師名', 'text'],
      ['hp_ortho', '整形外科（病院・担当医）', '整形外科の病院名、担当医師名', 'text'],
      ['hp_ent', '耳鼻咽喉科（病院・担当医）', '耳鼻咽喉科の病院名、担当医師名', 'text'],
      ['hp_derm', '皮膚科（病院・担当医）', '皮膚科の病院名、担当医師名', 'text'],
      ['hp_other', 'その他の科（病院・担当医）', 'その他の科の病院名、担当医師名', 'text']
    ]],
    ['■食事', [
      ['allergy', 'アレルギーの有無', 'アレルギーの有無', 'ari'],
      ['allergy_detail', 'アレルギーの詳細', '有りの方はこちらにご自由にお書きください', 'area'],
      ['utensil', '食具', '食具', 'text'],
      ['likes', '好きな食べ物', '好きな食べ物', 'area'],
      ['dislikes', '嫌いな食べ物', '嫌いな食べ物', 'area'],
      ['amount', '食べる量', '食べる量', 'text']
    ]],
    ['■排泄', [
      ['urine', '小便（回数/日）', '小便\u3000回数/1日', 'text'],
      ['stool', '大便（回数/日）', '大便\u3000回数/1日', 'text'],
      ['wipe', '自分で拭けるか', '自分で拭けるか', 'text']
    ]],
    ['■身辺自立', [
      ['handwash', '手洗い', '手洗い', 'text'],
      ['gargle', 'うがい', 'うがい', 'text'],
      ['dress', '着衣', '着衣', 'text'],
      ['undress', '脱衣', '脱衣', 'text'],
      ['button', 'ボタンの付け外し', 'ボタンの付け外し', 'text']
    ]],
    ['■遊び・性格・行動', [
      ['play_home', '遊び方（自宅）', '自宅', 'area'],
      ['play_out', '遊び方（自宅以外）', '自宅以外', 'area'],
      ['interest', '興味関心', '興味関心', 'area'],
      ['personality', '性格', '性格', 'area'],
      ['panic', 'パニック時の様子・切り替え方', 'パニックになった時の様子・気持ちの切り替え方など', 'area'],
      ['other_msg', 'その他伝えておきたいこと', 'その他、上記のこと以外で伝えておきたいこと', 'area']
    ]],
    ['■健康状態', [
      ['temp', '平熱', '平熱', 'text'],
      ['convulsion', 'ひきつけ・痙攣の経験', 'ひきつけ・痙攣をおこしたことがあるか', 'yn'],
      ['convulsion_detail', 'ひきつけ・痙攣の詳細', 'はいの方はこちらにご自由にお書きください', 'area'],
      ['h_bleed', '出血が止まりにくい', '出血が止まりにくいか', 'yn'],
      ['h_fall', '転びやすい', '転びやすいか', 'yn'],
      ['h_skin', '皮膚が弱い', '皮膚が弱いか', 'yn'],
      ['h_earnose', '耳・鼻の病気がある', '耳・鼻の病気があるか', 'yn'],
      ['h_hernia', '脱腸がある', '脱腸があるか', 'yn'],
      ['h_joint', '関節がはずれやすい', '関節がはずれやすいか', 'yn'],
      ['h_cold', '風邪をひきやすい', '風邪をひきやすいか', 'yn'],
      ['h_tonsil', '扁桃腺で熱が出やすい', '扁桃腺で熱が出やすいか', 'yn'],
      ['h_asthma', '喘息が出やすい', '喘息が出やすいか', 'yn'],
      ['h_allergic', 'アレルギー体質がある', 'アレルギー体質があるか', 'yn'],
      ['h_vaccine', '予防接種で高熱が出たことがある', '予防接種で高熱が出たことがあるか', 'yn'],
      ['h_rash', '湿疹が出やすい', '湿疹が出やすいか', 'yn'],
      ['h_drugrash', '薬で湿疹が出たことがある', '薬で湿疹が出たことがあるか', 'yn'],
      ['h_vomit', '吐きやすい', '吐きやすいか', 'yn'],
      ['h_diarrhea', '下痢をしやすい', '下痢をしやすいか', 'yn'],
      ['h_constipation', '便秘をしやすい', '便秘をしやすいか', 'yn'],
      ['under_doctor', '現在、医者にかかっている', '現在、医者にかかっているか', 'yn'],
      ['health_other', 'その他、身体に関して心配なこと', 'その他、身体に関して心配なこと', 'area']
    ]],
    ['■保護者の願い（6領域）', [
      ['wish_life', '生活に対する願い', '生活に対する願い', 'area'],
      ['wish_habit', '基本的生活習慣に対する願い', '基本的生活習慣に対する願い', 'area'],
      ['wish_motor', '運動や感覚に対する願い', '運動や感覚に対する願い', 'area'],
      ['wish_cog', '認知や行動に対する願い', '認知や行動に対する願い', 'area'],
      ['wish_lang', '言語とコミュニケーションに対する願い', '言語とコミュニケーションに対する願い', 'area'],
      ['wish_human', '人間関係に対する願い', '人間関係に対する願い', 'area']
    ]],
    [PHOTO_SEC, [
      ['other_service', '他に通っている事業所', '他に通っている事業所（放デイまたは児発）', 'area'],
      ['photo_consent', 'HP・SNSへの写真・動画掲載', 'ホームページやインスタグラム等に写真・動画の掲載', 'text'],
      ['photo_detail', '掲載に同意する場合（顔出し）', '同意する場合', 'area'],
      ['doc_insurance', '保険証の写真', '保険証の写真をアップロードしてください', 'url'],
      ['doc_jukyusha', '受給者証の写真', '受給者証の写真をアップしてください（文字が映るように）', 'url']
    ]]
  ];
  const FIELDS = SPEC.flatMap(([sec, rows]) => rows.map(([k, short, label, type]) => ({ k, short, label, type, sec })));
  const KEYS = FIELDS.map(f => f.k);
  const byKey = Object.fromEntries(FIELDS.map(f => [f.k, f]));
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const maxOf = f => f.k === 'name_kana' ? 120 : f.type === 'url' ? 500 : f.type === 'area' ? 2000 : 300;
  function labelHtml(f) {
    const head = esc(f.label);
    return f.short === f.label ? head : `${head}<small style="display:block;font-weight:normal;color:#667">${esc(f.short)}</small>`;
  }
  // 職員の利用者情報タブ用。disabled は見るだけのとき。既存の値が選択肢にないときは、その値も残す（保存で消さない）
  function control(f, value, disabled) {
    const v = value == null ? '' : String(value), dis = disabled ? 'disabled' : '';
    if (f.type === 'yn' || f.type === 'ari') {
      const opts = f.type === 'yn' ? YN : ARI;
      const extra = v && !opts.includes(v) ? [v] : [];
      return `<select data-t="as" data-f="${esc(f.k)}" ${dis}><option value=""></option>${opts.concat(extra).map(o => `<option value="${esc(o)}"${o === v ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    }
    if (f.type === 'area') return `<textarea data-t="as" data-f="${esc(f.k)}" rows="3" maxlength="2000" ${dis}>${esc(v)}</textarea>`;
    const mode = f.type === 'tel' ? ' inputmode="tel"' : '';
    const ph = f.type === 'url' ? ' placeholder="https://（任意）またはメモ"' : f.type === 'date' ? ' placeholder="例：2019-04-02"' : '';
    const typ = f.type === 'tel' ? ' type="tel"' : ' type="text"';
    return `<input data-t="as" data-f="${esc(f.k)}" value="${esc(v)}"${typ}${mode}${ph} maxlength="${maxOf(f)}" ${dis}>`;
  }
  function validDate(v) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    const [y, m, d] = v.split('-').map(Number), t = new Date(Date.UTC(y, m - 1, d));
    return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d && y >= 1990 && y <= 2100;
  }
  // 保護者の送信・職員の反映で使う厳密な検証。opt.requireName=false は反映時（児童名を外してもよい）。
  // opt.strictUrl=false は職員の反映時（「原本は持参」のようなメモも残せる）。保護者の送信は https だけ。
  function validate(raw, opt) {
    const requireName = !opt || opt.requireName !== false, strictUrl = !opt || opt.strictUrl !== false;
    const errors = {}, vals = {}, src = raw || {};
    Object.keys(src).forEach(k => { if (!byKey[k]) errors[k] = '受け付けられない項目です。'; });
    if (Object.keys(errors).length) return { vals, errors };
    FIELDS.forEach(f => {
      let v = src[f.k];
      if (v && typeof v === 'object') { if (v.error) errors[f.k] = v.error; return; }
      v = v == null ? '' : String(v).trim();
      if (!v) { if (f.k === 'name_kana' && requireName) errors[f.k] = '児童名（ふりがな）を入れてください。'; return; }
      if (v.length > maxOf(f)) { errors[f.k] = `${maxOf(f)}字までです。`; return; }
      if (f.type === 'date' && !validDate(v)) { errors[f.k] = '生年月日が正しくありません。'; return; }
      if (f.type === 'ari' && !ARI.includes(v)) { errors[f.k] = '有り か 無し を選んでください。'; return; }
      if (f.type === 'yn' && !YN.includes(v)) { errors[f.k] = 'はい か いいえ を選んでください。'; return; }
      if (f.type === 'url' && strictUrl && !/^https:\/\//.test(v)) { errors[f.k] = 'https:// で始まるリンクを貼るか、空欄にしてください。写真の添付は不要です。'; return; }
      vals[f.k] = v;
    });
    if (!errors._ && JSON.stringify(vals).length > 48000) errors._ = '入力が長すぎます。';
    return { vals, errors };
  }
  // 職員が利用者情報へ直接保存するとき。取り込み済みの自由記述を消さないよう、選択肢・日付の形式までは強制しない。
  function staffCheck(data) {
    for (const [k, v] of Object.entries(data || {})) {
      if (v == null || v === '') continue;
      if (String(v).length > 2000) return '1つの項目は2000字までです。';
      if ((k === 'doc_insurance' || k === 'doc_jukyusha') && /^http:\/\//i.test(String(v))) return '写真のリンクは https:// で始まるものを入れてください（メモを書くか、空欄でも保存できます）。';
    }
    if (JSON.stringify(data || {}).length > 50000) return '全体が長すぎます。短くしてください。';
    return '';
  }
  return { SPEC, FIELDS, KEYS, YN, ARI, PHOTO_SEC, PHOTO_NOTE, esc, labelHtml, control, validate, staffCheck, maxOf, validDate };
});
