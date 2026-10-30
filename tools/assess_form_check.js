// assess_lib.js（項目・検証）が、フォーム仕様と既存キーを満たすことの確認。実行：node tools/assess_form_check.js ※架空のデータだけ
const fs = require('fs'), path = require('path');
const A = require('../assess_lib.js');
const spec = JSON.parse(fs.readFileSync(path.join(__dirname, 'assess_tab_spec.json'), 'utf8'));
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
let bad = 0;
const ok = (c, m) => { console.log((c ? 'ok  ' : 'NG  ') + m); if (!c) bad++; };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + (JSON.stringify(a) === JSON.stringify(b) ? '' : ' ← ' + JSON.stringify(a)));

const OLD = ['birth', 'school', 'diagnosis', 'techo', 'agencies', 'visit_status', 'meds_status', 'meds_regular', 'other_service', 'family', 'rel', 'hp_pediatric', 'hp_ortho', 'hp_ent', 'hp_derm', 'hp_other', 'allergy', 'allergy_detail', 'utensil', 'likes', 'dislikes', 'amount', 'urine', 'wipe', 'stool', 'handwash', 'gargle', 'dress', 'undress', 'button', 'play_home', 'play_out', 'interest', 'personality', 'panic', 'other_msg', 'temp', 'convulsion', 'convulsion_detail', 'h_bleed', 'h_fall', 'h_skin', 'h_earnose', 'h_hernia', 'h_joint', 'h_cold', 'h_tonsil', 'h_asthma', 'h_allergic', 'h_vaccine', 'h_rash', 'h_drugrash', 'h_vomit', 'h_diarrhea', 'h_constipation', 'under_doctor', 'health_other', 'wish_life', 'wish_habit', 'wish_motor', 'wish_cog', 'wish_lang', 'wish_human', 'photo_consent', 'photo_detail', 'doc_insurance', 'doc_jukyusha'];
const ADDED = ['name_kana', 'guardian', 'address', 'phone', 'guardian_phone', 'emergency'];

ok(A.SPEC.length === spec.length, 'セクション数はフォームと同じ（' + spec.length + '）');
spec.forEach((sec, i) => {
  ok(A.SPEC[i] && A.SPEC[i][0] === sec[0], 'セクション ' + sec[0]);
  ok(A.SPEC[i] && A.SPEC[i][1].length === sec[1].length, sec[0] + ' の項目数 ' + sec[1].length);
  sec[1].forEach((pair, j) => {
    const row = A.SPEC[i] && A.SPEC[i][1][j];
    ok(!!row && row[1] === pair[0] && row[2] === pair[1], (row ? row[0] : '?') + ' の表示名とフォーム見出し');
  });
});
ok(new Set(A.KEYS).size === A.KEYS.length, 'キーは重複しない');
OLD.forEach(k => ok(A.KEYS.includes(k), '既存キーを残す ' + k));
ADDED.forEach(k => ok(A.KEYS.includes(k), '足したキー ' + k));
ok(A.KEYS.length === OLD.length + ADDED.length, 'キー数は既存＋追加だけ（' + A.KEYS.length + '）');
ok(A.FIELDS.find(f => f.k === 'urine').label === '小便\u3000回数/1日', '小便の見出しは全角スペース');
ok(A.FIELDS.find(f => f.k === 'other_service').sec === '■他事業所・書類・同意', '他事業所は書類のセクション（キーは other_service のまま）');
ok(A.FIELDS.filter(f => f.type === 'url').map(f => f.k).join() === 'doc_insurance,doc_jukyusha', '写真はリンク欄が2つだけ');
ok(!A.FIELDS.some(f => f.req), '写真を含む全項目に必須フラグはない（児童名だけ検証で必須）');
ok(A.PHOTO_NOTE.includes('受け取りません') && A.PHOTO_NOTE.includes('空でも'), '写真は受け取らない・空でもよい');

const good = () => ({ name_kana: '見本 太郎（みほん たろう）', birth: '2019-04-02', allergy: '有り', convulsion: 'いいえ', phone: '090-0000-0000' });
const sortObj = o => Object.fromEntries(Object.entries(o).sort());
eq(sortObj(A.validate(good()).vals), sortObj(good()), '正しい入力はそのまま通る');
ok(A.validate(good()).errors && Object.keys(A.validate(good()).errors).length === 0, '正しい入力にエラーはない');
ok(A.validate({}).errors.name_kana, '児童名が空だとエラー');
ok(!A.validate({}, { requireName: false }).errors.name_kana, '反映時は児童名なしでもよい');
ok(A.validate({ name_kana: '見本', allergy: 'あり' }).errors.allergy, 'アレルギーは 有り/無し');
ok(A.validate({ name_kana: '見本', convulsion: '有り' }).errors.convulsion, '健康状態は はい/いいえ');
ok(A.validate({ name_kana: '見本', birth: '2019-02-30' }).errors.birth, '2月30日はエラー');
ok(A.validate({ name_kana: '見本', birth: '1980-01-01' }).errors.birth, '1990年より前はエラー');
ok(A.validate({ name_kana: '見本', birth: { error: '年が正しくありません。' } }).errors.birth === '年が正しくありません。', '日付の変換エラーをそのまま出す');
ok(A.validate({ name_kana: '見本', doc_insurance: 'http://example.com/a' }).errors.doc_insurance, 'http の写真リンクは保護者送信では不可');
ok(!A.validate({ name_kana: '見本', doc_insurance: 'https://example.com/a' }).errors.doc_insurance, 'https の写真リンクは可');
ok(!A.validate({ doc_jukyusha: '原本は持参' }, { requireName: false, strictUrl: false }).errors.doc_jukyusha, '職員の反映では写真欄にメモを残せる');
ok(A.validate({ name_kana: '見本', secret: 'x' }).errors.secret, '決まった項目以外は不可');
ok(!A.validate({ name_kana: '見本' }).vals.doc_insurance, '空の写真欄は送らない');
ok(A.staffCheck({ birth: '平成30年4月2日', doc_insurance: '原本持参' }) === '', '職員の直接保存は、取り込み済みの自由記述を拒まない');
ok(A.staffCheck({ doc_insurance: 'http://example.com/a' }).includes('https'), '職員の直接保存でも http リンクは不可');
ok(A.control({ k: 'allergy', type: 'ari', label: 'アレルギーの有無', short: 'アレルギーの有無' }, '有り', false).includes('value="有り" selected'), '有りが選択される');
ok(A.control({ k: 'allergy', type: 'ari', label: 'x', short: 'x' }, 'あり', false).includes('value="あり"'), '選択肢にない既存値も残す');
ok(!A.control({ k: 'doc_insurance', type: 'url', label: 'x', short: 'x' }, '', false).includes('type="file"'), '写真の入力欄はファイルではない');

const sql = read('supabase/leo_assess_form.sql');
const keys = sql.match(/leo_af_keys\(\) returns text\[][\s\S]*?select array\[([^\]]+)\]/)[1].split(',').map(s => s.trim().replace(/'/g, ''));
eq(keys, A.KEYS, 'SQL のキー一覧は assess_lib と同じ');
const areas = sql.match(/areas text\[] := array\[([^\]]+)\]/)[1].split(',').map(s => s.trim().replace(/'/g, ''));
eq(areas, A.FIELDS.filter(f => f.type === 'area').map(f => f.k), 'SQL の長文キー');
const yn = sql.match(/yn text\[] := array\[([^\]]+)\]/)[1].split(',').map(s => s.trim().replace(/'/g, ''));
eq(yn, A.FIELDS.filter(f => f.type === 'yn').map(f => f.k), 'SQL のはい/いいえキー');
ok(!/storage\./i.test(sql.replace(/--.*$/gm, '')), 'SQL はファイル置き場を使わない');
ok(sql.includes('leo_child_assess') && !/alter table public\.leo_child_assess/i.test(sql), '既存のアセスメント表は作り替えない');
ok(sql.includes('p_require_name') && sql.includes('leo_af_clean(p_vals, true, true)') && sql.includes('leo_af_clean(p_vals, false, false)'), '保護者送信は厳密、反映はメモ可');

const cfg = read('config.js'), idx = read('index.html'), html = read('assess.html');
ok(cfg.includes("['🔍', 'アセスメント', '#leo/assess'"), 'タイルはポータルのアセスメント');
ok(!cfg.includes('gl:g5') && !cfg.includes('アセスメント（フォーム）'), 'Google フォームのタイルはない');
ok(idx.includes('assess_lib.js?v=20261030assess') && idx.includes('leo_assess.js?v=20261030assess') && idx.includes('leo.js?v=20261030assess'), 'キャッシュバスト');
ok(!html.includes('type="file"') && html.includes('写真は、受け取りません'), '保護者ページに写真アップロードはない');
ok(read('leo.js').includes('AssessForm.SPEC') && read('leo.js').includes('data-as-extra'), '利用者情報タブは同じ項目で、知らないキーは残す');

console.log(bad ? bad + ' failed' : 'all ok');
process.exit(bad ? 1 : 0);
