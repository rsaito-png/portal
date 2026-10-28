// レオ 受給者証の入力（#leo/jukyusha）：保護者が専用リンクのページ（jukyusha.html）で入力した受給者証の内容を、職員が「いまの利用者情報」と並べて確認し、「確認して反映」で利用者情報に入れる。
//  ① 児童ごとの専用リンクを作ってコピー（保護者へはこのポータルからは送らない。公式LINEの1対1トークに貼って送る）
//  ② 届いた入力の一覧 → 開く → 入力された値といまの値を見くらべ → 職員が直す → 「確認して反映」
// 写真・読み取り（OCR）・画像の保管はない。何も自動では書き込まない：反映の前は leo_children / leo_child_info に触らない（leo_jf_apply だけが書く）。反映前の値は記録に残る。
// 項目の定義・日付の読みかえは jukyusha_lib.js（保護者のページと共通）。
const JF = { sel: null, msg: '', err: '' };
const JF_BASE = () => location.origin + location.pathname.replace(/[^/]*$/, '');
const jfSt = { pending: ['確認待ち', '#e8833a'], applied: ['反映済み', '#2e6b4f'], rejected: ['反映せず', '#888'], superseded: ['新しい入力に置き換え', '#888'] };
const jfFmt = s => new Date(s).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const jfKey = s => String(s || '').replace(/[\s\u3000]/g, '');
const jfRpc = (fn, body) => sb('rpc/' + fn, { method: 'POST', body: JSON.stringify(body) });
const JF_DEMO = { subs: [{ id: 1, child: '見本 太郎', status: 'pending', created_at: new Date().toISOString(), note: null, applied: null, before: null,
  vals: { jukyusha_no: '0123456789', city_name: '見本市', city_no: '000000', guardian_name: '見本 花子', child_name: '見本 太郎', child_birth: '2019-04-02', issue_date: '2026-03-20', kind: '放デイ', contract_days: '20', period_from: '2026-04-01', period_to: '2027-03-31', cap_monthly: '4600', cap_mgmt: '非該当', mushouka: 'unknown', soudan_office: '見本相談支援センター', soudan_person: '見本 相談員', amount_text: '児童発達支援加算サポートⅠ', other: '特記事項：見本です' } }],
  names: ['見本 太郎', '児童A', '児童B'], cur: { kid: { jukyusha_no: '0123456780', city_no: null, kind: '放デイ', cap_monthly: 0, contract_days: 20, contract_end: '2026-03-31', mushouka: false }, info: { guardian_name: '見本 花子' } } };
async function jfNames() {
  if (DEMO) return JF_DEMO.names;
  const [a, b] = await Promise.all([sb('leo_children?select=name&order=name').catch(() => []), sb('leo_child_info?select=name&order=name').catch(() => [])]);
  const seen = new Map(); [...a, ...b].forEach(r => { if (r.name && !String(r.name).startsWith('※') && !seen.has(jfKey(r.name))) seen.set(jfKey(r.name), r.name); });
  return [...seen.values()];
}
const JF_CSS = `.jf button{width:auto;padding:8px 14px;margin:4px 6px 4px 0;font-size:15px}.jf input[type=checkbox]{width:auto;margin:0 6px 0 0}.jf select{width:auto;min-width:12em}
.jf-card{border:1px solid #ccd;border-radius:8px;background:#fff;padding:10px 14px;margin:12px 0}.jf-card h4{margin:2px 0 8px}.jf-tbl{width:100%;border-collapse:collapse}.jf-tbl th,.jf-tbl td{border-top:1px solid #e5e5ee;padding:6px 4px;text-align:left;vertical-align:top;font-size:14px}
.jf-f input[type=text],.jf-f input[type=date],.jf-f select{width:100%;box-sizing:border-box;font-size:15px;padding:6px}.jf-cur{color:#555;white-space:pre-wrap}.jf-diff td:nth-child(3){background:#fff4e8}.jf-diff td:first-child{border-left:4px solid #e8833a}.jf-same{color:#2e6b4f;font-size:12px}
.jf-warn{background:#fde8e8;color:#b00;padding:8px 10px;border-radius:6px;margin:8px 0;font-weight:bold}.jf-bar{position:sticky;bottom:0;background:#fff;border-top:2px solid #e8833a;padding:8px 0;margin-top:10px}.jf small{color:#666}`;
LEO_VIEWS.jukyusha = async function () {
  if (!canManage()) return '<p>この画面は事務・管理者・児発管だけです。</p>';
  if (JF.sel !== null) return jfReview();
  JF.err = '';
  const [names, subs] = await Promise.all([jfNames(), DEMO ? JF_DEMO.subs : sb('leo_jf_subs?select=id,child,status,created_at,note&order=id.desc&limit=60').catch(e => { JF.err = e.message; return []; })]);
  const pend = subs.filter(s => s.status === 'pending').length;
  return `<div class="jf"><h3>受給者証の入力（保護者から）</h3>${demoNote()}<style>${JF_CSS}</style>
    <p class="note">保護者が、広げた受給者証を見ながら入力した内容を、いまの利用者情報と見くらべて確認し、利用者情報（受給者証番号・負担上限月額など）に入れる画面です。<b>職員が確認して「確認して反映」を押すまで、利用者情報は変わりません。</b>写真は受け取りません。入力した内容は、事務・管理者・児発管だけが見られます。</p>
    <div class="jf-card"><h4>1. 保護者にリンクを送る</h4>
      <p class="note">児童を選んでリンクをコピーし、公式LINEの1対1トークに貼って送ってください（ポータルからは送りません）。リンクは30日有効です。児童が一覧にいないときは、先に<a href="#leo/userinfo">利用者情報</a>で追加してください。</p>
      <select id="jf_child" onchange="jfPrior()"><option value="">児童を選ぶ</option>${names.map(n => `<option>${esc(n)}</option>`).join('')}</select>
      <div style="margin:2px 0 4px"><label><input type="checkbox" id="jf_prefill"> 前回の内容を入れておく</label> <small id="jf_prefill_note">（2回め以降のとき。児童を選ぶと、前の入力や利用者情報があれば自動でチェックが入ります）</small></div>
      <p class="note" style="margin:4px 0 0">チェックを入れたリンクは、<b>開いた人に、お子さんの前回の内容（お名前・受給者証番号・保護者名・相談支援事業所名など）がそのまま見えます</b>。リンクは、その家庭の保護者の1対1のLINEにだけ送ってください。ほかの児童の情報や、住所・電話・備考は出ません。</p>
      <button onclick="jfLink()">リンクをコピー</button></div>
    <div class="jf-card"><h4>2. 届いた入力（${pend ? `<span style="color:#e8833a">確認待ち ${pend}件</span>` : '確認待ちはありません'}）</h4>
      ${JF.err ? `<p class="note" style="color:#c00">一覧を読み込めませんでした。管理者が supabase/leo_jukyusha_form.sql を実行したか確認してください。</p>` : ''}
      ${subs.length ? `<table class="jf-tbl"><tr><th>児童</th><th>届いた日時</th><th>状態</th><th></th></tr>${subs.map(s => { const [l, c] = jfSt[s.status] || ['', '#888'];
        return `<tr><td>${esc(s.child)}</td><td>${jfFmt(s.created_at)}</td><td><b style="color:${c}">${l}</b></td><td><button onclick="jfOpen(${+s.id})">${s.status === 'pending' ? '確認する' : '見る'}</button></td></tr>`; }).join('')}</table>` : '<p class="note">まだ届いていません。</p>'}</div></div>`;
};
window.jfOpen = id => { JF.sel = id; JF.msg = ''; renderLeoView('jukyusha'); window.scrollTo(0, 0); };
window.jfBack = () => { JF.sel = null; renderLeoView('jukyusha'); };
window.jfPrior = async () => {   // 前の入力（反映ずみ）か、受給者証番号の入った利用者情報があれば「前回の内容を入れておく」を自動でON
  const child = $('jf_child').value, cb = $('jf_prefill'), nt = $('jf_prefill_note'); if (!cb) return;
  if (!child) { cb.checked = false; return; }
  let has = false;
  if (DEMO) has = child === '見本 太郎';
  else { const q = encodeURIComponent(child); try { const [a, b] = await Promise.all([sb(`leo_jf_subs?child=eq.${q}&status=eq.applied&select=id&limit=1`).catch(() => []), sb(`leo_children?name=eq.${q}&select=jukyusha_no`).catch(() => [])]); has = a.length > 0 || b.some(r => r.jukyusha_no); } catch (e) { has = false; } }
  cb.checked = has; if (nt) nt.textContent = has ? '（前の入力・利用者情報があるので、チェックを入れました。はずすと、空の入力ページになります）' : '（前の入力・利用者情報がないので、空の入力ページです）';
};
window.jfLink = async () => {
  const child = $('jf_child').value, B = copyBtnEl();
  if (!child) { copyNote(B, '<p class="note">児童を選んでください。</p>', ''); return; }
  if (DEMO) { copyNote(B, `<p class="note">見本：${JF_BASE()}jukyusha.html?demo=1</p>`, child); return; }
  try { const tok = await jfRpc('leo_jf_make_link', { p_child: child, p_prefill: !!($('jf_prefill') && $('jf_prefill').checked) }), url = `${JF_BASE()}jukyusha.html?t=${tok}`, ok = await copyUrl(url);
    copyResult(B, url, ok, child, `${esc(child)} さんの専用リンクです。${$('jf_prefill') && $('jf_prefill').checked ? '前回の内容が入った状態で開きます（開いた人に内容が見えます）。' : ''}ほかの家庭には送らないでください。30日で期限が切れます。`); }
  catch (e) { copyError(B, e.message, child); }
};
// ----- 確認画面 -----
async function jfCurrent(child) {   // いまの利用者情報（比べるため）
  if (DEMO) return JF_DEMO.cur;
  const q = encodeURIComponent(child), [k, i] = await Promise.all([sb(`leo_children?name=eq.${q}`).catch(() => []), sb(`leo_child_info?name=eq.${q}&select=guardian_name,note,soudan_office,soudan_person`).catch(() => sb(`leo_child_info?name=eq.${q}&select=guardian_name,note`).catch(() => []))]);
  return { kid: k[0] || null, info: i[0] || null };
}
const jfCurOf = c => { const k = (c && c.kid) || {}, i = (c && c.info) || {}; return { jukyusha_no: k.jukyusha_no, city_no: k.city_no, kind: k.kind, cap_monthly: k.cap_monthly, contract_days: k.contract_days, contract_end: k.contract_end, guardian_name: i.guardian_name, soudan_office: i.soudan_office, soudan_person: i.soudan_person, note_add: i.note, mushouka: k.mushouka == null ? null : String(!!k.mushouka) }; };
// 反映できる項目（入力の項目 → 利用者情報の列）と、画面での名前
const JF_ROWS = [['jukyusha_no', 'jukyusha_no', '受給者証番号'], ['city_no', 'city_no', '市町村番号'], ['guardian_name', 'guardian_name', '保護者名'], ['kind', 'kind', 'サービスの種類'], ['contract_days', 'contract_days', '支給量（日/月）'],
  ['period_to', 'contract_end', '受給者証の有効期限（給付決定期間の終わり）'], ['cap_monthly', 'cap_monthly', '負担上限月額'], ['mushouka', 'mushouka', '無償化対象児童'],
  ['soudan_office', 'soudan_office', '相談支援事業所名'], ['soudan_person', 'soudan_person', '担当の相談支援専門員']];
const JF_INFO_COLS = ['guardian_name', 'soudan_office', 'soudan_person'];   // leo_child_info の列（そのほかは leo_children）
const JF_NOTE = ['note_add', 'note_add', '利用者情報「備考」に追記（任意）'];   // 備考欄のある場合だけ。初期はチェックなし
const jfNoteText = (v, at) => { const d = new Date(at || Date.now()), t = `${d.getMonth() + 1}/${d.getDate()}`, o = []; if (v.amount_text) o.push(`【受給者証 ${t} 支給量等】${v.amount_text}`); if (v.other) o.push(`【受給者証 ${t} その他】${v.other}`); return o.join('\n'); };
const jfShow = (col, v) => v == null || v === '' ? '（未入力）' : col === 'mushouka' ? (String(v) === 'true' ? 'はい' : 'いいえ') : col === 'cap_monthly' ? (+v).toLocaleString() + '円' : col === 'note_add' ? String(v) : col === 'contract_days' ? v + '日' : col === 'contract_end' ? v : String(v);
async function jfReview() {
  const subs = DEMO ? JF_DEMO.subs : await sb(`leo_jf_subs?id=eq.${JF.sel}`), s = subs[0];
  if (!s) { JF.sel = null; return '<p>見つかりません。</p>'; }
  const cur = jfCurOf(await jfCurrent(s.child)), v = s.vals || {}, done = s.status !== 'pending', ap = s.applied || {}, bf = s.before || {}, bfKid = bf.children || {}, bfInfo = bf.info || {};
  JF.s = s; JF.cur = cur;
  const name = v.child_name, mism = name && jfKey(name) !== jfKey(s.child) && !jfKey(name).includes(jfKey(s.child)) && !jfKey(s.child).includes(jfKey(name));
  const db = JukyushaForm.toDb(v);
  const noteTxt = jfNoteText(v, s.created_at);
  const rows = JF_ROWS.concat(noteTxt ? [JF_NOTE] : []).map(([k, col, label]) => {
    const inVal = k === 'note_add' ? noteTxt : k === 'cap_monthly' ? (v.cap_monthly ?? '') : k === 'mushouka' ? (db.mushouka == null ? '' : String(db.mushouka)) : (v[k] ?? ''), c = cur[col], dis = done ? 'disabled' : '';
    const diff = k !== 'note_add' && inVal !== '' && String(c ?? '') !== String(inVal), on = !done && diff && k !== 'mushouka';
    const inp = k === 'note_add' ? `<textarea data-jf="${col}" rows="4" ${dis} style="width:100%;box-sizing:border-box;font-size:14px">${esc(inVal)}</textarea><small>保護者が書いた「支給量等」「その他」から作った文です。直せます。チェックを入れると、いまの備考の下に付け足します（いまの備考は消えません）。</small>`
      : k === 'contract_days' ? `<input type="text" data-jf="${col}" value="${esc(inVal)}" ${dis} inputmode="numeric">${v.amount_text ? `<div class="jf-cur"><small>日数以外に書かれていること（保護者の入力）：${esc(v.amount_text)}</small></div>` : ''}`
      : k === 'mushouka' ? `<select data-jf="${col}" ${dis}><option value=""></option><option value="true" ${inVal === 'true' ? 'selected' : ''}>はい（無償化の対象）</option><option value="false" ${inVal === 'false' ? 'selected' : ''}>いいえ</option></select>${v.mushouka === 'unknown' ? '<div class="jf-cur"><small>保護者の答え：分からない</small></div>' : ''}`
      : k === 'kind' ? `<select data-jf="${col}" ${dis}><option value=""></option>${['放デイ', '児発'].map(o => `<option ${o === inVal ? 'selected' : ''}>${o}</option>`).join('')}</select>`
      : k === 'cap_monthly' ? `<select data-jf="${col}" ${dis}><option value=""></option>${JukyushaForm.DB_CAPS.map(o => `<option value="${o}" ${String(o) === String(inVal) ? 'selected' : ''}>${o.toLocaleString()}円</option>`).join('')}</select>${v.cap_other ? `<div class="jf-cur"><small>保護者の入力：${(+v.cap_other).toLocaleString()}円（いまの請求の設定にない金額のため、反映できません）</small></div>` : ''}`
      : k === 'period_to' ? `<input type="date" data-jf="${col}" value="${esc(inVal)}" ${dis}><small>${inVal ? esc(JukyushaForm.jaDate(inVal)) : ''}</small>`
      : `<input type="text" data-jf="${col}" value="${esc(inVal)}" ${dis} ${k === 'jukyusha_no' || k === 'city_no' || k === 'contract_days' ? 'inputmode="numeric"' : ''}>`;
    const lastCol = !done ? '' : s.status === 'applied' ? `<td>${col in ap ? `<b>${esc(jfShow(col, ap[col]))}</b>` : '<small>反映せず</small>'}</td><td>${col in ap ? esc(jfShow(col, col === 'note_add' ? bfInfo.note : JF_INFO_COLS.includes(col) ? bfInfo[col] : bfKid[col])) : ''}</td>` : '<td></td><td></td>';
    return `<tr class="${diff && !done ? 'jf-diff' : ''}"><td>${done ? '' : `<input type="checkbox" data-jfc="${col}" ${on ? 'checked' : ''} title="チェックした項目だけ反映します">`}</td><th>${label}</th>
      <td>${inp}</td><td class="jf-cur">${esc(jfShow(col, c))}${k !== 'note_add' && inVal !== '' && !diff ? ' <span class="jf-same">✔ 同じ</span>' : ''}</td>${lastCol}</tr>`;
  }).join('');
  const J = JukyushaForm, ref = [['amount_text', '支給量等（日数以外に書かれていること）', v.amount_text], ['other', 'その他（特記事項など）', v.other], ['child_name', 'お子さんの名前（入力）', v.child_name], ['city_name', '支給市町村', v.city_name], ['child_birth', 'お子さんの生年月日', v.child_birth && J.jaDate(v.child_birth) + `（${J.seiDate(v.child_birth)}）`], ['issue_date', '交付年月日', v.issue_date && J.jaDate(v.issue_date)],
    ['period_from', '給付決定期間（はじめ）', v.period_from && J.jaDate(v.period_from) + '　※請求の「契約開始日」とは別なので、反映しません'], ['cap_mgmt', '上限額管理', v.cap_mgmt], ['cap_other', '負担上限月額（その他の金額）', v.cap_other && (+v.cap_other).toLocaleString() + '円'], ].filter(r => r[2]);
  document.body.classList.add('wide-sheet');
  return `<div class="jf"><style>${JF_CSS}</style><button onclick="jfBack()">← 一覧へ</button><h3>${esc(s.child)} さんの受給者証の入力${demoNote()}</h3>
    <p class="note">${jfFmt(s.created_at)} に保護者が入力しました。<b style="color:${(jfSt[s.status] || ['', '#888'])[1]}">${(jfSt[s.status] || [''])[0]}</b>。${done ? '' : '「いまの利用者情報」と見くらべて、必要なら右の欄を直してください。反映するのは、チェックを入れた項目だけです（ちがうところには色がついて、チェックが入っています）。'}</p>
    ${mism ? `<div class="jf-warn">児童名が合いません。入力された児童名は「${esc(name)}」、リンクの児童は「${esc(s.child)}」です。ほかの児童の受給者証ではないか確認してください。</div>` : ''}
    <table class="jf-tbl jf-f"><tr><th></th><th>項目</th><th>${done ? '保護者が入力した値' : '保護者が入力した値（直せます）'}</th><th>いまの利用者情報</th>${s.status === 'applied' ? '<th>反映した値</th><th>反映前の値（記録）</th>' : done ? '<th></th><th></th>' : ''}</tr>${rows}</table>
    <details style="margin-top:10px" ${done ? '' : 'open'}><summary class="note">参考（利用者情報には入れません）</summary><table class="jf-tbl">${ref.map(r => `<tr><th>${r[1]}</th><td style="white-space:pre-wrap">${esc(r[2])}</td></tr>`).join('')}</table></details>
    ${done ? (s.note ? `<p class="note">メモ：${esc(s.note)}</p>` : '') : `<div class="jf-bar">
      ${mism ? '<label style="color:#b00"><input type="checkbox" id="jf_mism"> 児童名が違いますが、この受給者証でよいことを確認しました</label><br>' : ''}
      <button onclick="jfApply(${mism})" style="background:#2e6b4f;color:#fff;font-size:16px;padding:10px 18px">確認して反映</button>
      <button onclick="jfReject()">反映しない</button> <span class="note">「確認して反映」を押すまで、利用者情報は変わりません。反映前の値は記録に残ります。</span></div>`}
    <p id="jf_msg" class="note">${esc(JF.msg)}</p></div>`;
}
function jfCollect() {   // チェックが入っている項目だけ（数字は全角→半角・空白とハイフンを除く）
  const o = {};
  document.querySelectorAll('[data-jfc]:checked').forEach(c => {
    const col = c.dataset.jfc, e = document.querySelector(`[data-jf="${col}"]`), x = e ? (col === 'note_add' || col === 'soudan_office' || col === 'soudan_person' ? e.value.trim() : e.value.normalize('NFKC').trim()) : ''; if (x === '') return;
    o[col] = col === 'jukyusha_no' || col === 'city_no' ? x.replace(/[\s-]/g, '') : col === 'guardian_name' ? JukyushaForm.nameClean(x) : x;
  });
  return o;
}
function jfValidate(v) {
  if ('jukyusha_no' in v && !/^\d{10}$/.test(v.jukyusha_no)) return '受給者証番号は10桁の数字で入れてください。';
  if ('city_no' in v && !/^\d{6}$/.test(v.city_no)) return '市町村番号は6桁の数字で入れてください。';
  if ('contract_days' in v && !(/^\d+$/.test(v.contract_days) && +v.contract_days >= 1 && +v.contract_days <= 31)) return '支給量は1〜31日で入れてください。';
  if ('contract_end' in v && !/^\d{4}-\d{2}-\d{2}$/.test(v.contract_end)) return '有効期限（終わりの日）を日付で入れてください。';
  if ('note_add' in v && ((JF.cur && JF.cur.note_add ? JF.cur.note_add + '\n' : '') + v.note_add).length > 1000) return '備考が1000文字を超えます。追記する文を短くしてください。';
  if (('soudan_office' in v && v.soudan_office.length > 100) || ('soudan_person' in v && v.soudan_person.length > 60)) return '相談支援事業所名は100字、担当者は60字までです。';
  if ('kind' in v && !['児発', '放デイ'].includes(v.kind)) return 'サービスの種類は 児発 か 放デイ です。';
  if ('cap_monthly' in v && !JukyushaForm.DB_CAPS.includes(+v.cap_monthly)) return '負担上限月額は 0・4,600・37,200円 のどれかです。';
  return '';
}
window.jfApply = async mism => {
  const m = $('jf_msg'), v = jfCollect(), bad = jfValidate(v);
  if (mism && !($('jf_mism') && $('jf_mism').checked)) { m.textContent = '児童名が違うようです。確認して、「この受給者証でよい」にチェックを入れてください。'; return; }
  if (!Object.keys(v).length) { m.textContent = '反映する項目にチェックを入れてください（チェックが入っている項目だけが反映されます）。'; return; }
  if (bad) { m.textContent = bad; return; }
  const cur = JF.cur || {};
  const lab = Object.fromEntries(JF_ROWS.concat([JF_NOTE]).map(r => [r[1], r[2]]));
  if (!confirm(`「${JF.s.child}」の利用者情報に、次の内容を反映します。\n\n` + Object.entries(v).map(([col, x]) => col === 'note_add' ? `・${lab[col]}：\n${x}` : `・${lab[col]}：${jfShow(col, cur[col])} → ${jfShow(col, x)}`).join('\n') + '\n\n（反映前の値は記録に残ります）\n受給者証を見て、間違いがないことを確認しましたか？')) return;
  if (DEMO) { m.textContent = '見本モードなので反映しません（本番では、ここで利用者情報に書き込まれます）。'; window.JF_LAST = v; return; }
  try { await jfRpc('leo_jf_apply', { p_id: JF.s.id, p_vals: v }); JF.msg = '反映しました。'; await renderLeoView('jukyusha'); }
  catch (e) { m.textContent = '反映できませんでした：' + e.message; }
};
window.jfReject = async () => {
  const m = $('jf_msg'), note = prompt('反映しない理由をメモしてください（例：別の児童・入力まちがい）。空のままでもかまいません。');
  if (note === null) return;
  if (DEMO) { m.textContent = '見本モードなので保存しません。'; return; }
  try { await jfRpc('leo_jf_reject', { p_id: JF.s.id, p_note: note }); JF.msg = '「反映しない」にしました。利用者情報は変わっていません。'; await renderLeoView('jukyusha'); }
  catch (e) { m.textContent = e.message; }
};
