// レオ 初回アセスメント（#leo/assess）：保護者が専用リンク（assess.html）で入力した内容を、職員が確認して leo_child_assess に反映する。
//  ① 児童名を入れてリンクをコピー（まだ利用者情報にいない児童でもよい。ポータルからは送らない。公式LINEの1対1トークに貼る）
//  ② 届いた入力の一覧 → 開く → いまのアセスメントと見くらべ → 職員が直す → 「確認して反映」
// 反映の前は leo_child_assess を変えない（leo_af_apply だけが書く）。書いたキー以外は消さない。写真のアップロードはない。
// 直接入力・修正は、いままでどおり利用者情報の「アセスメント」タブ（項目は assess_lib.js と共通）。
const AF = { sel: null, msg: '', err: '' };
const AF_BASE = () => location.origin + location.pathname.replace(/[^/]*$/, '');
const afSt = { pending: ['確認待ち', '#e8833a'], applied: ['反映済み', '#2e6b4f'], rejected: ['反映せず', '#888'], superseded: ['新しい入力に置き換え', '#888'] };
const afFmt = s => new Date(s).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const afKey = s => String(s || '').replace(/[\s\u3000]/g, '').replace(/[（(][^）)]*[）)]?/g, '');
const afManage = () => (typeof DEMO !== 'undefined' && DEMO) || canManage();
const AF_DEMO = {
  subs: [{ id: 1, child: '見本 太郎', status: 'pending', created_at: new Date().toISOString(), note: null, applied: null, before: null,
    vals: { name_kana: '見本 太郎（みほん たろう）', birth: '2019-04-02', school: '見本保育園 年長', guardian: '見本 花子（みほん はなこ）', allergy: '有り', allergy_detail: '卵（見本）', convulsion: 'いいえ', temp: '36.5', wish_life: '自分のことは自分でやってほしい（見本）' } }],
  names: ['見本 太郎', '児童A', '児童B'],
  cur: { allergy: '無し', temp: '36.6', school: '見本保育園 年中' }
};
const AF_CSS = `.af button{width:auto;padding:8px 14px;margin:4px 6px 4px 0;font-size:15px}.af input[type=checkbox]{width:auto;margin:0 6px 0 0}.af input[type=text],.af select,.af textarea{width:100%;box-sizing:border-box;font-size:14px;padding:6px}
.af-card{border:1px solid #ccd;border-radius:8px;background:#fff;padding:10px 14px;margin:12px 0}.af-card h4{margin:14px 0 6px}.af-tbl{width:100%;border-collapse:collapse}.af-tbl th,.af-tbl td{border-top:1px solid #e5e5ee;padding:6px 4px;text-align:left;vertical-align:top;font-size:14px}
.af-cur{color:#555;white-space:pre-wrap}.af-diff td:nth-child(3){background:#fff4e8}.af-diff td:first-child{border-left:4px solid #e8833a}.af-same{color:#2e6b4f;font-size:12px}
.af-warn{background:#fde8e8;color:#b00;padding:8px 10px;border-radius:6px;margin:8px 0;font-weight:bold}.af-bar{position:sticky;bottom:0;background:#fff;border-top:2px solid #e8833a;padding:8px 0;margin-top:10px}.af small{color:#666}`;
async function afNames() {
  if (DEMO) return AF_DEMO.names;
  const [a, b, c] = await Promise.all([sb('leo_children?select=name&order=name').catch(() => []), sb('leo_child_info?select=name&order=name').catch(() => []), sb('leo_child_assess?select=name&order=name').catch(() => [])]);
  const seen = new Map();
  [...a, ...b, ...c].forEach(r => { if (r.name && !String(r.name).startsWith('※') && !seen.has(afKey(r.name))) seen.set(afKey(r.name), r.name); });
  return [...seen.values()];
}
LEO_VIEWS.assess = async function () {
  if (!afManage()) return `<h3>アセスメント</h3><p class="note">保護者向けのリンク発行と、届いた入力の確認は、児発管・事務・管理者です。</p><p>各児童の内容は <a href="#leo/userinfo">利用者情報</a> の「アセスメント」タブで見られます。</p>`;
  if (AF.sel !== null) return afReview();
  document.body.classList.remove('wide-sheet');
  AF.err = '';
  const [names, subs] = await Promise.all([afNames(), DEMO ? AF_DEMO.subs : sb('leo_af_subs?select=id,child,status,created_at,note&order=id.desc&limit=60').catch(e => { AF.err = e.message; return []; })]);
  const pend = subs.filter(s => s.status === 'pending').length;
  return `<div class="af"><h3>アセスメント</h3>${demoNote()}<style>${AF_CSS}</style>
    <p class="note">初めての児童も、保護者に専用リンクから入力してもらえます。職員が確認して「確認して反映」を押すまで、アセスメントには入りません。写真のアップロードはありません。直接入力・修正は <a href="#leo/userinfo">利用者情報</a> の「アセスメント」タブです。</p>
    <div class="af-card"><h4 style="margin-top:2px">1. 保護者にリンクを送る</h4>
      <p class="note">児童名を入れてリンクをコピーし、公式LINEの1対1トークに貼って送ってください（ポータルからは送りません）。<b>まだ利用者情報にいない児童でも、名前を入れればリンクを作れます。</b>リンクは30日有効です。反映すると、その名前で利用者情報の一覧に出ます。</p>
      <label>児童名<input id="af_child" list="af_names" maxlength="100" placeholder="例：見本 太郎" style="display:block;width:100%;max-width:24em;font-size:16px;padding:8px;margin:4px 0"></label>
      <datalist id="af_names">${names.map(n => `<option value="${esc(n)}"></option>`).join('')}</datalist>
      <div style="margin:2px 0 4px"><label><input type="checkbox" id="af_prefill"> いまのアセスメントを入れておく</label> <small id="af_prefill_note">（2回め以降。名前を入れると、すでにアセスメントがあれば自動でチェックが入ります）</small></div>
      <p class="note" style="margin:4px 0 0">チェックを入れたリンクは、<b>開いた人に、そのお子さんのアセスメント（診断名・家族・健康など）がそのまま見えます</b>。その家庭の保護者の1対1のLINEにだけ送ってください。</p>
      <button type="button" onclick="afPrior()">名前を確認</button> <button type="button" onclick="afLink()">リンクをコピー</button></div>
    <div class="af-card"><h4>2. 届いた入力（${pend ? `<span style="color:#e8833a">確認待ち ${pend}件</span>` : '確認待ちはありません'}）</h4>
      ${AF.err ? `<p class="note" style="color:#c00">一覧を読み込めませんでした。管理者が supabase/leo_assess_form.sql を実行したか確認してください。</p>` : ''}
      ${subs.length ? `<table class="af-tbl"><tr><th>児童</th><th>届いた日時</th><th>状態</th><th></th></tr>${subs.map(s => { const [l, c] = afSt[s.status] || ['', '#888'];
        return `<tr><td>${esc(s.child)}</td><td>${afFmt(s.created_at)}</td><td><b style="color:${c}">${l}</b>${s.note ? `<div><small>${esc(s.note)}</small></div>` : ''}</td><td><button type="button" onclick="afOpen(${+s.id})">${s.status === 'pending' ? '確認する' : '見る'}</button></td></tr>`; }).join('')}</table>` : '<p class="note">まだ届いていません。</p>'}</div></div>`;
};
window.afOpen = id => { AF.sel = id; AF.msg = ''; renderLeoView('assess'); window.scrollTo(0, 0); };
window.afBack = () => { AF.sel = null; renderLeoView('assess'); };
window.afPrior = async () => {
  const child = ($('af_child').value || '').trim(), cb = $('af_prefill'), nt = $('af_prefill_note'); if (!cb) return;
  if (!child) { cb.checked = false; if (nt) nt.textContent = '（児童名を入れてください）'; return; }
  let has = false;
  if (DEMO) has = child === '見本 太郎';
  else { try { const rows = await sb(`leo_child_assess?name=eq.${encodeURIComponent(child)}&select=name`); has = rows.length > 0; } catch (e) { has = false; } }
  cb.checked = has;
  if (nt) nt.textContent = has ? '（アセスメントがあるので、チェックを入れました。はずすと、空の入力ページになります）' : '（まだアセスメントがないので、空の入力ページです）';
};
window.afLink = async () => {
  const child = ($('af_child').value || '').trim(), B = copyBtnEl();
  if (!child) { copyNote(B, '<p class="note">児童名を入れてください。まだ登録がなくても、名前だけでリンクを作れます。</p>', ''); return; }
  if (child.length > 100) { copyNote(B, '<p class="note">児童名は100字までです。</p>', child); return; }
  const pre = !!($('af_prefill') && $('af_prefill').checked);
  if (DEMO) { copyNote(B, `<p class="note">見本：${AF_BASE()}assess.html?demo=1${pre ? '&prefill=1' : ''}</p>`, child); return; }
  try {
    const tok = await sb('rpc/leo_af_make_link', { method: 'POST', body: JSON.stringify({ p_child: child, p_prefill: pre }) });
    const url = `${AF_BASE()}assess.html?t=${tok}`, ok = await copyUrl(url);
    copyResult(B, url, ok, child, `${esc(child)} さんの専用リンクです。${pre ? 'いまのアセスメントが入った状態で開きます（開いた人に内容が見えます）。' : ''}ほかの家庭には送らないでください。30日で期限が切れます。`);
  } catch (e) { copyError(B, e.message, child); }
};
async function afCurrent(child) {
  if (DEMO) return child === AF_DEMO.subs[0].child ? AF_DEMO.cur : {};
  const rows = await sb(`leo_child_assess?name=eq.${encodeURIComponent(child)}&select=data`).catch(() => []);
  return (rows[0] && rows[0].data) || {};
}
function afEditor(f, value, dis) {
  const v = value == null ? '' : String(value);
  if (f.type === 'area') return `<textarea data-af="${f.k}" rows="3" maxlength="2000" ${dis}>${esc(v)}</textarea>`;
  if (f.type === 'yn' || f.type === 'ari') {
    const opts = f.type === 'yn' ? AssessForm.YN : AssessForm.ARI, extra = v && !opts.includes(v) ? [v] : [];
    return `<select data-af="${f.k}" ${dis}><option value=""></option>${opts.concat(extra).map(o => `<option value="${esc(o)}"${o === v ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  }
  return `<input type="text" data-af="${f.k}" value="${esc(v)}" maxlength="${AssessForm.maxOf(f)}" ${dis}>`;
}
async function afReview() {
  const subs = DEMO ? AF_DEMO.subs.filter(s => s.id === AF.sel) : await sb(`leo_af_subs?id=eq.${+AF.sel}&select=id,child,status,created_at,note,vals,applied,before`), s = subs[0];
  if (!s) { AF.sel = null; return '<p>見つかりません。</p>'; }
  const cur = await afCurrent(s.child), v = s.vals || {}, done = s.status !== 'pending';
  AF.s = s; AF.cur = cur;
  const name = v.name_kana || '', bare = afKey(name), mine = afKey(s.child);
  const mism = !!(bare && mine && bare !== mine && !bare.includes(mine) && !mine.includes(bare));
  const blocks = AssessForm.SPEC.map(([title, rows]) => {
    const body = rows.map(([k, short, label, type]) => {
      const f = { k, short, label, type }, inVal = v[k] == null ? '' : String(v[k]), c = cur[k] == null ? '' : String(cur[k]), dis = done ? 'disabled' : '';
      const diff = inVal !== '' && inVal !== c, on = !done && diff;
      return `<tr class="${diff && !done ? 'af-diff' : ''}"><td>${done ? '' : `<input type="checkbox" data-afc="${k}" ${on ? 'checked' : ''}>`}</td><th>${AssessForm.labelHtml(f)}</th><td>${afEditor(f, inVal, dis)}</td><td class="af-cur">${c ? esc(c) : '（なし）'}${inVal !== '' && !diff ? ' <span class="af-same">✔ 同じ</span>' : ''}</td></tr>`;
    }).join('');
    const note = title === AssessForm.PHOTO_SEC ? `<p class="note">${esc(AssessForm.PHOTO_NOTE)}</p>` : '';
    return `<h4>${esc(title)}</h4>${note}<table class="af-tbl"><tr><th></th><th>項目</th><th>${done ? '保護者が入力した値' : '保護者が入力した値（直せます）'}</th><th>いまのアセスメント</th></tr>${body}</table>`;
  }).join('');
  document.body.classList.add('wide-sheet');
  const appliedNote = s.status === 'applied' && s.applied ? `<p class="note">反映した項目：${esc(Object.keys(s.applied).join('、'))}</p>` : '';
  return `<div class="af"><style>${AF_CSS}</style><button type="button" onclick="afBack()">← 一覧へ</button><h3>${esc(s.child)} さんのアセスメント${demoNote()}</h3>
    <p class="note">${afFmt(s.created_at)} に保護者が入力しました。<b style="color:${(afSt[s.status] || ['', '#888'])[1]}">${(afSt[s.status] || [''])[0]}</b>。${done ? '' : 'いまのアセスメントと違うところに色がつき、チェックが入っています。反映するのはチェックした項目だけです。空にした項目は反映されません（消すときは利用者情報のアセスメントタブ）。'}</p>
    ${mism ? `<div class="af-warn">児童名が合いません。入力された児童名は「${esc(name)}」、リンクの児童は「${esc(s.child)}」です。ほかの児童の回答ではないか確認してください。</div>` : ''}
    ${blocks}
    ${appliedNote}
    ${done ? (s.note ? `<p class="note">メモ：${esc(s.note)}</p>` : '') : `<div class="af-bar">
      ${mism ? '<label style="color:#b00"><input type="checkbox" id="af_mism"> 児童名が違いますが、この回答でよいことを確認しました</label><br>' : ''}
      <button type="button" onclick="afApply(${mism ? 'true' : 'false'})" style="background:#2e6b4f;color:#fff;font-size:16px;padding:10px 18px">確認して反映</button>
      <button type="button" onclick="afReject()">反映しない</button>
      <span class="note">押すまでアセスメントは変わりません。反映前の内容は記録に残ります。連絡先・受給者証の台帳には書きません。</span></div>`}
    <p id="af_msg" class="note">${esc(AF.msg)}</p></div>`;
}
function afCollect() {
  const o = {};
  document.querySelectorAll('[data-afc]:checked').forEach(c => {
    const k = c.dataset.afc, e = document.querySelector(`[data-af="${k}"]`);
    const x = e ? e.value.trim() : ''; if (x === '') return;
    o[k] = x;
  });
  return o;
}
window.afApply = async mism => {
  const m = $('af_msg'), v = afCollect();
  if (mism && !($('af_mism') && $('af_mism').checked)) { m.textContent = '児童名が違うようです。確認して、「この回答でよい」にチェックを入れてください。'; return; }
  if (!Object.keys(v).length) { m.textContent = '反映する項目にチェックを入れてください。'; return; }
  const { errors } = AssessForm.validate(v, { requireName: false, strictUrl: false });
  const bad = errors._ || Object.values(errors)[0];
  if (bad) { m.textContent = bad; return; }
  const cur = AF.cur || {};
  const lines = Object.entries(v).map(([k, x]) => { const f = AssessForm.FIELDS.find(i => i.k === k); const was = cur[k] ? String(cur[k]).replace(/\s+/g, ' ') : '（なし）'; const now = x.replace(/\s+/g, ' '); return `・${f ? f.short : k}：${was.slice(0, 40)} → ${now.slice(0, 40)}`; });
  if (!confirm(`「${AF.s.child}」のアセスメントに、次の内容を反映します。\n\n${lines.join('\n')}\n\n（チェックしていない項目は、今のままです）\n内容を確認しましたか？`)) return;
  if (DEMO) { m.textContent = '見本モードなので反映しません（本番では、ここでアセスメントに書き込まれます）。'; window.AF_LAST = v; return; }
  try { await sb('rpc/leo_af_apply', { method: 'POST', body: JSON.stringify({ p_id: AF.s.id, p_vals: v }) }); AF.msg = '反映しました。利用者情報の一覧から、この児童のアセスメントを開けます。'; }
  catch (e) { m.textContent = '反映できませんでした：' + e.message; return; }
  await renderLeoView('assess');
};
window.afReject = async () => {
  const m = $('af_msg'), note = prompt('反映しない理由をメモしてください（例：別の児童・入力まちがい）。空のままでもかまいません。');
  if (note === null) return;
  if (DEMO) { m.textContent = '見本モードなので保存しません。'; return; }
  try { await sb('rpc/leo_af_reject', { method: 'POST', body: JSON.stringify({ p_id: AF.s.id, p_note: note }) }); AF.msg = '「反映しない」にしました。アセスメントは変わっていません。'; await renderLeoView('assess'); }
  catch (e) { m.textContent = e.message; }
};
