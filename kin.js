// 金斗雲（居宅介護）計画同意。Googleフォームの代わり。データは Supabase（kin_plan / kin_consent）
const KIN_DEMO = { plans: [{ user_name: '利用者A', version: 1, term: '1期', period: '2026年11月〜2027年4月', body: '（見本）【長期目標】自宅で安心して暮らす。\n【援助内容】週2回、調理と掃除の支援を行う。' }], cons: [] };
let KIN = { name: null };
async function kinData() {
  if (DEMO) return KIN_DEMO;
  const [plans, cons] = await Promise.all([sb('kin_plan?order=user_name,version'), sb('kin_consent?select=id,user_name,version,consented_at,writer,proxy_name,proxy_relation,explained_by_name&order=consented_at.desc')]);
  return { plans, cons };
}
function kinCurrent(plans) { const m = {}; plans.forEach(p => { if (!m[p.user_name] || m[p.user_name].version < p.version) m[p.user_name] = p; }); return m; }
async function renderKin() {
  $('view').innerHTML = '<p>読み込み中…</p>';
  const back = `<button class="back" onclick="location.hash='kintoun'">← 金斗雲へ</button>`;
  try {
    const { plans, cons } = await kinData(), cur = kinCurrent(plans), names = Object.keys(cur);
    if (KIN.name && cur[KIN.name]) return $('view').innerHTML = back + kinForm(cur[KIN.name], cons);
    const done = n => cons.find(c => c.user_name === n && c.version === cur[n].version);
    const rows = names.map(n => { const c = done(n);
      return `<tr><td>${esc(n)}</td><td>${c ? '✅ 同意済み' : '⬜ 未同意'}</td><td>${c ? esc(new Date(c.consented_at).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' })) + '／' + esc(c.writer) + (c.proxy_name ? '（' + esc(c.proxy_name) + '・' + esc(c.proxy_relation) + '）' : '') + '／説明：' + esc(c.explained_by_name || '') : ''}</td>
      <td><button onclick="KIN.name='${esc(n).replace(/'/g, '')}';renderKin()">${c ? '見る' : '同意をとる'}</button></td></tr>`; }).join('');
    $('view').innerHTML = back + `<h3>居宅介護計画の同意</h3>${demoNote()}<p class="note">利用者を選び、計画を見せて、iPadで同意をいただきます。</p>
      ${names.length ? `<table class="tbl"><tr><th>利用者</th><th>状態</th><th>記録</th><th></th></tr>${rows}</table><p>同意済み ${names.filter(done).length} ／ ${names.length}</p>` : '<p>計画がまだ登録されていません（準備中です）。</p>'}`;
  } catch (e) { $('view').innerHTML = back + `<p>${esc(e.message)}</p>`; }
}
function kinForm(p, cons) {
  const c = cons.find(x => x.user_name === p.user_name && x.version === p.version);
  return `<h3>${esc(p.user_name)} さんの居宅介護計画</h3><p class="note">${esc(p.term || '')} ${esc(p.period || '')}（版 ${p.version}）</p>
    <div class="card" style="white-space:pre-wrap;font-size:18px;line-height:1.7">${esc(p.body || '（本文なし）')}</div>
    ${c ? `<p>✅ ${esc(new Date(c.consented_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }))} に同意済み（${esc(c.writer)}${c.proxy_name ? '：' + esc(c.proxy_name) + '・' + esc(c.proxy_relation) : ''}／説明：${esc(c.explained_by_name || '')}）</p><button onclick="KIN.name=null;renderKin()">一覧へ</button>`
    : `<div class="card"><p>ここからは、ご本人またはご家族にタブレットをお渡しください。</p>
      <label style="font-size:18px"><input type="checkbox" id="kc_ok" style="width:auto;transform:scale(1.5);margin-right:10px"> 説明を受け、理解し、同意します</label>
      <p>記入者：<label><input type="radio" name="kc_w" value="本人" checked onchange="kinW()" style="width:auto"> 本人</label> <label><input type="radio" name="kc_w" value="代理人" onchange="kinW()" style="width:auto"> 代理人</label></p>
      <div id="kc_px" hidden><p>代理人氏名 <input id="kc_pn" maxlength="100"></p><p>続柄 <input id="kc_pr" maxlength="50" placeholder="例：母"></p></div>
      <p>手書きサイン（任意）</p><canvas id="kc_cv" width="600" height="200" style="border:1px solid #888;background:#fff;width:100%;max-width:600px;touch-action:none"></canvas>
      <p><button class="back" onclick="kinClear()">書き直す</button></p>
      <button onclick="kinSave('${esc(p.user_name).replace(/'/g, '')}',${p.version})" style="font-size:18px;padding:12px 28px">同意する</button> <button class="back" onclick="KIN.name=null;renderKin()">やめる</button> <div id="kc_m"></div></div>`}` + kinInit();
}
function kinInit() { setTimeout(() => { const cv = $('kc_cv'); if (!cv) return; const g = cv.getContext('2d'); g.lineWidth = 3; g.lineCap = 'round'; let dn = false;
  const pt = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; };
  cv.onpointerdown = e => { dn = true; cv.dirty = true; const [x, y] = pt(e); g.beginPath(); g.moveTo(x, y); cv.setPointerCapture(e.pointerId); };
  cv.onpointermove = e => { if (!dn) return; const [x, y] = pt(e); g.lineTo(x, y); g.stroke(); };
  cv.onpointerup = () => { dn = false; }; }, 0); return ''; }
function kinW() { $('kc_px').hidden = document.querySelector('input[name=kc_w]:checked').value !== '代理人'; }
function kinClear() { const cv = $('kc_cv'); cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); cv.dirty = false; }
async function kinSave(user_name, version) {
  const m = $('kc_m'), w = document.querySelector('input[name=kc_w]:checked').value, pn = $('kc_pn').value.trim(), pr = $('kc_pr').value.trim();
  if (!$('kc_ok').checked) { m.textContent = '同意のチェックを入れてください。'; return; }
  if (w === '代理人' && (!pn || !pr)) { m.textContent = '代理人の氏名と続柄を入れてください。'; return; }
  if (DEMO) { m.textContent = '見本モードなので保存しません。'; return; }
  try { const cv = $('kc_cv'), signature = cv.dirty ? cv.toDataURL('image/png') : null, explained_by_name = await myName();
    await sb('kin_consent', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ user_name, version, writer: w, proxy_name: w === '代理人' ? pn : null, proxy_relation: w === '代理人' ? pr : null, explained_by_name, signature }) });
    KIN.name = null; $('view').innerHTML = `<p style="font-size:20px">✅ 同意を記録しました。ありがとうございました。タブレットを職員にお返しください。</p><button onclick="renderKin()">一覧へ</button>`;
  } catch (e) { m.textContent = e.message + '（すでに同意済みか、権限がありません）'; }
}
