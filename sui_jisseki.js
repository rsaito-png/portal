// 水晶玉 月間実績 (#suishodama/jisseki)。利用者×月で 新規/継続 と各加算を記載。データは Supabase sui_jisseki。
const SJ = { month: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 7), uid: null };
// 利用者ごとに付ける加算（体制加算＝行動障害支援体制等は事業所全体なのでここには出さない）
const SJ_ADD = [
  '初回加算', '特別地域加算', '遠隔地訪問加算', '利用者負担上限額管理加算',
  '入院時情報連携加算Ⅰ', '入院時情報連携加算Ⅱ', '退院・退所加算',
  '居宅介護支援事業所等連携加算', '医療・保育・教育機関等連携加算', '集中支援加算',
  'サービス担当者会議実施加算', 'サービス提供時モニタリング加算',
];
const SJ_COUNT = { '退院・退所加算': 3, '集中支援加算': 3, '医療・保育・教育機関等連携加算': 3, '居宅介護支援事業所等連携加算': 3 };
const sjBack = `<button class="back noprint" onclick="location.hash='suishodama'">← 水晶玉へ</button>`;
const sjLabel = (u, kind) => {
  if (!kind) return '—';
  if (u && u.kind === '障害児') return kind === '新規' ? '障害児相談支援（新規）' : '障害児継続相談支援（継続）';
  return kind === '新規' ? 'サービス利用支援（新規）' : '継続サービス利用支援（継続）';
};
const sjNormAdd = arr => (arr || []).map(a => typeof a === 'string' ? { name: a, count: 1 } : { name: a.name, count: Math.max(1, +a.count || 1) }).filter(a => a.name);
const sjAddText = adds => { const a = sjNormAdd(adds); return a.length ? a.map(x => x.count > 1 ? `${x.name}×${x.count}` : x.name).join('、') : '—'; };
const sjHas = (adds, name) => sjNormAdd(adds).some(a => a.name === name);
const sjCnt = (adds, name) => (sjNormAdd(adds).find(a => a.name === name) || {}).count || 1;

const SJ_DEMO = {
  users: [
    { id: 1, name: '見本 太郎', kind: '障害福祉サービス' },
    { id: 2, name: '見本 花子', kind: '障害児' },
    { id: 3, name: '見本 次郎', kind: '障害福祉サービス' },
  ],
  rows: {
    1: { service_kind: '新規', service_date: '2026-10-05', additions: ['初回加算', 'サービス担当者会議実施加算'], memo: '' },
    2: { service_kind: '継続', service_date: '2026-10-12', additions: ['サービス提供時モニタリング加算'], memo: '' },
    3: { service_kind: null, service_date: '2026-10-20', additions: [{ name: '集中支援加算', count: 1 }], memo: '基本報酬なし・集中支援のみ' },
  },
};

async function renderSuiJisseki() {
  if (DEMO) return $('view').innerHTML = sjBack + sjBody(SJ_DEMO.users, SJ_DEMO.rows, true);
  $('view').innerHTML = '<p>読み込み中…</p>';
  try {
    const [us, js] = await Promise.all([
      sb('sui_user?select=id,name,kind&order=name'),
      sb(`sui_jisseki?month=eq.${SJ.month}&select=*`),
    ]);
    $('view').innerHTML = sjBack + sjBody(us, Object.fromEntries(js.map(j => [j.user_id, j])), false);
  } catch (e) { $('view').innerHTML = sjBack + `<p>${esc(e.message)}</p>`; }
}

function sjBody(us, rows, demo) {
  if (SJ.uid != null) {
    const u = us.find(x => x.id === SJ.uid);
    if (!u) { SJ.uid = null; return sjBody(us, rows, demo); }
    return sjForm(u, rows[u.id] || {}, demo);
  }
  const m = SJ.month, sum = { 新規: 0, 継続: 0, 加算のみ: 0 }, addCnt = {};
  SJ_ADD.forEach(n => addCnt[n] = 0);
  us.forEach(u => {
    const r = rows[u.id]; if (!r) return;
    if (r.service_kind === '新規') sum.新規++;
    else if (r.service_kind === '継続') sum.継続++;
    else if (sjNormAdd(r.additions).length) sum.加算のみ++;
    sjNormAdd(r.additions).forEach(a => { if (addCnt[a.name] != null) addCnt[a.name] += a.count; });
  });
  const filled = us.filter(u => rows[u.id] && (rows[u.id].service_kind || sjNormAdd(rows[u.id].additions).length)).length;
  const addSum = SJ_ADD.filter(n => addCnt[n]).map(n => `${n} ${addCnt[n]}`).join('　') || '（加算なし）';
  const list = us.length
    ? `<table class="tbl"><tr><th>利用者</th><th>計画種類</th><th>新規／継続</th><th>加算</th><th></th></tr>${us.map(u => {
      const r = rows[u.id] || {};
      const sk = r.service_kind ? `<b>${esc(r.service_kind)}</b>` : (sjNormAdd(r.additions).length ? '<span style="color:#888">加算のみ</span>' : '<span style="color:#bbb">未記入</span>');
      return `<tr><td>${esc(u.name)}</td><td>${esc(u.kind || '')}</td><td>${sk}${r.service_date ? `<br><span class="note">${esc(r.service_date)}</span>` : ''}</td><td style="font-size:14px">${esc(sjAddText(r.additions))}</td><td><button type="button" style="width:auto;padding:8px 16px" onclick="SJ.uid=${u.id};renderSuiJisseki()">開く</button></td></tr>`;
    }).join('')}</table>`
    : '<p>先に「利用者台帳」で利用者を追加してください。</p>';
  return `<div class="sui-big"><h3>月間実績（計画相談）</h3>
  <p class="noprint">月 <input type="month" value="${esc(m)}" onchange="SJ.month=this.value||SJ.month;SJ.uid=null;renderSuiJisseki()"> ${demo ? '<span class="note">（見本データ）</span>' : ''}</p>
  <div class="card"><h4>${m.slice(0, 4)}年${+m.slice(5)}月の集計</h4>
  <p><b>新規 ${sum.新規}</b>　<b>継続 ${sum.継続}</b>　加算のみ ${sum.加算のみ}　／ 対象 ${filled}名</p>
  <p class="note">${esc(addSum)}</p>
  <p class="note">新規＝サービス利用支援／障害児相談支援、継続＝継続サービス利用支援／障害児継続相談支援。体制加算（行動障害支援体制など）は事業所全体のためここでは扱いません。</p></div>
  ${list}
  <p class="noprint note">請求の入力メモです。国保連CSVの自動生成はまだありません。</p></div>`;
}

function sjForm(u, r, demo) {
  const adds = sjNormAdd(r.additions), kind = r.service_kind || '';
  const boxes = SJ_ADD.map((n, i) => {
    const on = sjHas(adds, n), max = SJ_COUNT[n];
    const cnt = max ? ` <input type="number" id="sj_c_${i}" min="1" max="${max}" value="${sjCnt(adds, n)}" style="width:56px;display:inline;padding:4px;${on ? '' : 'visibility:hidden'}" ${demo ? 'disabled' : ''}>` : '';
    return `<label style="display:block;margin:4px 0"><input type="checkbox" id="sj_a_${i}" style="width:auto" ${on ? 'checked' : ''} ${demo ? 'disabled' : ''} onchange="const c=$('sj_c_${i}');if(c)c.style.visibility=this.checked?'visible':'hidden'"> ${esc(n)}${cnt}</label>`;
  }).join('');
  const note = kind ? sjLabel(u, kind) : '基本報酬なし。集中支援加算のみの月などに使います。';
  const uk = JSON.stringify(u.kind || '');
  return `<div class="sui-big"><h3>実績　${esc(u.name)}　${SJ.month.slice(0, 4)}年${+SJ.month.slice(5)}月</h3>
  <div class="card sui-form">
  <p><b>基本報酬（新規／継続）</b><br>
  <label style="margin-right:12px"><input type="radio" name="sj_kind" value="" style="width:auto" ${!kind ? 'checked' : ''} ${demo ? 'disabled' : ''} onchange="sjKindNote(${uk})"> なし</label>
  <label style="margin-right:12px"><input type="radio" name="sj_kind" value="新規" style="width:auto" ${kind === '新規' ? 'checked' : ''} ${demo ? 'disabled' : ''} onchange="sjKindNote(${uk})"> 新規</label>
  <label><input type="radio" name="sj_kind" value="継続" style="width:auto" ${kind === '継続' ? 'checked' : ''} ${demo ? 'disabled' : ''} onchange="sjKindNote(${uk})"> 継続</label></p>
  <p id="sj_kind_note" class="note">${esc(note)}</p>
  <label>主な実施日<br><input id="sj_date" type="date" value="${esc(r.service_date || '')}" ${demo ? 'disabled' : ''}></label>
  <h4>加算</h4><div class="g" style="grid-template-columns:1fr 1fr">${boxes}</div>
  <label>メモ<br><textarea id="sj_memo" rows="2" style="width:100%" ${demo ? 'disabled' : ''}>${esc(r.memo || '')}</textarea></label>
  <p class="noprint">${demo ? '<span class="note">見本モードでは保存できません。</span>' : `<button onclick="sjSave(${u.id})">保存</button> <button class="back" onclick="sjClear(${u.id})">この月の実績を削除</button>`}
  <button class="back" onclick="SJ.uid=null;renderSuiJisseki()">一覧へ</button> <span id="sj_m"></span></p>
  </div></div>`;
}

function sjKindNote(ukind) {
  const v = (document.querySelector('input[name=sj_kind]:checked') || {}).value || '';
  const el = $('sj_kind_note'); if (!el) return;
  el.textContent = v ? sjLabel({ kind: ukind }, v) : '基本報酬なし。集中支援加算のみの月などに使います。';
}

function sjCollectAdd() {
  const out = [];
  SJ_ADD.forEach((n, i) => {
    if (!$('sj_a_' + i) || !$('sj_a_' + i).checked) return;
    const c = $('sj_c_' + i);
    const count = c ? Math.max(1, Math.min(SJ_COUNT[n] || 99, +c.value || 1)) : 1;
    out.push(count > 1 || SJ_COUNT[n] ? { name: n, count } : n);
  });
  return out;
}

async function sjSave(uid) {
  if (DEMO) return;
  const kind = (document.querySelector('input[name=sj_kind]:checked') || {}).value || null;
  const additions = sjCollectAdd();
  const service_date = ($('sj_date').value || '').trim() || null;
  const memo = ($('sj_memo').value || '').trim() || null;
  if (!kind && !additions.length) return $('sj_m').textContent = '新規／継続か、加算を1つ以上選んでください';
  const b = { month: SJ.month, user_id: uid, service_kind: kind || null, service_date, additions, memo, updated_at: new Date().toISOString() };
  try {
    await sb('sui_jisseki', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(b) });
    SJ.uid = null; renderSuiJisseki();
  } catch (e) { $('sj_m').textContent = e.message; }
}

async function sjClear(uid) {
  if (DEMO) return;
  if (!confirm('この利用者のこの月の実績を削除しますか？')) return;
  try {
    await sb(`sui_jisseki?month=eq.${SJ.month}&user_id=eq.${uid}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    SJ.uid = null; renderSuiJisseki();
  } catch (e) { alert(e.message); }
}
