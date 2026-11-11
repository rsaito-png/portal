// レオ 利用契約書・重要事項説明書（#leo/contract）。水晶玉 sui_contract.js と同じ流れ：署名リンク（1回限り・1週間）→ leo_contract_sign.html、紙で署名済み、印刷。本文はテキスト（leo_doc_type.body）。
const LC = { link: null };
const LC_URL = t => location.origin + location.pathname.replace(/[^/]*$/, '') + 'leo_contract_sign.html?t=' + t;
const lcLast = logs => (logs || []).filter(x => x.method !== 'あとで署名').sort((a, b) => b.signed_at.localeCompare(a.signed_at))[0];
const lcSt = logs => { const l = lcLast(logs); if (l) return `<span style="color:#2e6b4f">✅ ${esc(l.method)}${l.agent_name ? '（' + esc(l.agent_name) + '・' + esc(l.agent_relation || '') + '）' : ''} ${esc(l.signed_on || new Date(l.signed_at).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' }))}${l.reason ? '（理由：' + esc(l.reason) + '）' : ''}</span>`; return (logs || []).length ? '⏳ あとで署名' : '未'; };
const lcWareki = iso => { if (!iso) return '　　年　　月　　日'; const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number); if (!y || !m || !d) return '　　年　　月　　日'; return `令和${y - 2018}年${m}月${d}日`; };
const lcFill = (body, p) => String(body || '').split('{保護者}').join(p.guardian || '＿＿＿＿＿＿').split('{児童}').join(p.child || '＿＿＿＿＿＿').split('{契約開始}').join(lcWareki(p.contract_start)).split('{契約終了}').join(lcWareki(p.contract_end)).split('{契約締結日}').join(lcWareki(p.signed_on || p.contract_start)).split('{説明日}').join(lcWareki(p.explained_on || p.signed_on)).split('{説明職員}').join(p.explainer || '＿＿＿＿＿＿').split('{保護者住所}').join(p.address || '＿＿＿＿＿＿＿＿＿＿').split('{続柄}').join(p.relation || '＿＿＿＿');
const lcInline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
function lcRender(src) {
  const lines = String(src || '').replace(/\r\n/g, '\n').split('\n');
  const out = []; let i = 0;
  const isTable = line => /^\s*\|.*\|\s*$/.test(line);
  const isSep = line => /^\s*\|[\s:|-]+\|\s*$/.test(line);
  const isH = line => /^#{1,3}\s+/.test(line.trim());
  while (i < lines.length) {
    if (isTable(lines[i])) {
      const rows = [];
      while (i < lines.length && (isTable(lines[i]) || isSep(lines[i]))) { if (!isSep(lines[i])) rows.push(lines[i]); i++; }
      if (rows.length) {
        const cells = rows.map(r => r.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim()));
        const head = cells[0], w = head.length;
        let html = '<table class="lc-doc"><thead><tr>' + head.map(c => `<th>${lcInline(c)}</th>`).join('') + '</tr></thead><tbody>';
        cells.slice(1).forEach(r => { const padded = r.concat(Array(Math.max(0, w - r.length)).fill('')); html += '<tr>' + padded.slice(0, w).map(c => `<td>${lcInline(c)}</td>`).join('') + '</tr>'; });
        out.push(html + '</tbody></table>');
      }
      continue;
    }
    const hm = lines[i].trim().match(/^(#{1,3})\s+(.*)$/);
    if (hm) { out.push(`<h${hm[1].length}>${lcInline(hm[2])}</h${hm[1].length}>`); i++; continue; }
    if (lines[i].trim() === '') { out.push(''); i++; continue; }
    const para = [];
    while (i < lines.length && lines[i].trim() !== '' && !isTable(lines[i]) && !isH(lines[i])) { para.push(lines[i]); i++; }
    out.push(`<p>${para.map(lcInline).join('<br>')}</p>`);
  }
  return `<div class="lc-doc-body">${out.join('\n')}</div>`;
}

async function renderLeoContract() {
  const back = `<button class="back" onclick="location.hash='leo'">← レオへ</button>`;
  if (DEMO) { $('view').innerHTML = back + '<p>見本モードでは表示しません（ログイン後に開きます）。</p>'; return; }
  if (typeof canManage === 'function' && !canManage()) { $('view').innerHTML = back + '<p>この画面は児発管・事務・管理者だけが使えます。</p>'; return; }
  $('view').innerHTML = '<p>読み込み中…</p>';
  try {
    const [types, parties, logs, children, infos, left] = await Promise.all([
      sb('leo_doc_type?select=code,label,version,body&order=sort'),
      sb('leo_doc_party?select=id,child_name,guardian_name,guardian_relation,guardian_address,contract_start,contract_end&order=child_name'),
      sb('leo_doc_log?select=id,party_id,doc_code,method,agent_name,agent_relation,reason,signed_on,signed_at,signature,explainer_name,version&order=signed_at'),
      sb('leo_children?select=name,contract_start,contract_end&order=name').catch(() => []),
      sb('leo_child_info?select=name,guardian_name').catch(() => []),
      (typeof loadLeftIndex === 'function' ? loadLeftIndex().catch(() => ({})) : {})
    ]);
    LC.types = types; LC.parties = parties; LC.logs = logs;
    const infoOf = Object.fromEntries((infos || []).map(i => [i.name, i]));
    const partyOf = Object.fromEntries(parties.map(p => [p.child_name, p]));
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
    const isLeft = name => typeof leftDone === 'function' && left && leftDone(left, name, today);
    const rows = [];
    (children || []).forEach(c => {
      if (isLeft(c.name) && !partyOf[c.name]) return;
      const p = partyOf[c.name];
      const g = (p && p.guardian_name) || (infoOf[c.name] && infoOf[c.name].guardian_name) || '';
      rows.push({ party: p, child: c.name, guardian: g, start: (p && p.contract_start) || c.contract_start, end: (p && p.contract_end) || c.contract_end, registered: true });
    });
    parties.forEach(p => {
      if (rows.some(r => r.child === p.child_name)) return;
      rows.push({ party: p, child: p.child_name, guardian: p.guardian_name, start: p.contract_start, end: p.contract_end, registered: false });
    });
    const nm = n => esc(n).replace(/'/g, '');
    const li = LC.link ? `<div class="card" style="border:2px solid #e8833a"><b>${esc(LC.link.child)} さん（保護者：${esc(LC.link.guardian)}）の署名リンク</b>（1回限り・1週間）<br><input id="lc_url" readonly value="${esc(LC.link.url)}" style="width:100%" onclick="this.select()"><p><button onclick="const i=$('lc_url');i.select();navigator.clipboard&&navigator.clipboard.writeText(i.value);$('lc_m').textContent='コピーしました'">コピー</button> <span id="lc_m"></span> <a href="${esc(LC.link.url)}" target="_blank" rel="noopener"><button>この端末で署名画面を開く（タブレットを渡す）</button></a> <button class="back" onclick="LC.link=null;renderLeoContract()">閉じる</button></p><p class="note">その場で署名するときは「この端末で署名画面を開く」を押してタブレットを渡します。URLをコピーして保護者の端末で開くこともできます。新しく発行すると、この人の古い未使用リンクは使えなくなります。</p></div>` : '';
    const period = r => (r.start || r.end) ? `${esc(r.start || '')} 〜 ${esc(r.end || '')}` : '';
    $('view').innerHTML = back + `<h3>📄 利用契約書・重要事項説明書</h3>${li}
    <style>
      .lc-doc-body{font-size:13px;line-height:1.7}
      .lc-doc-body h1,.lc-doc-body h2,.lc-doc-body h3{text-align:center;margin:1em 0 .5em}
      .lc-doc{width:100%;border-collapse:collapse;margin:8px 0;font-size:12px}
      .lc-doc th,.lc-doc td{border:1px solid #888;padding:4px 6px;vertical-align:top;text-align:left}
      .lc-form label{display:block;margin:6px 0 2px;font-size:14px}
      .lc-form input[type=text],.lc-form input[type=date]{font-size:16px;padding:6px 8px;max-width:100%;box-sizing:border-box}
      @media print{.noprint{display:none!important}.lc-doc-body{font-size:11px}}
    </style>
    <div class="card lc-form"><h4>見学者・まだ登録していない児童</h4>
      <label>児童の名前 <input type="text" id="lc_v_child" maxlength="80"></label>
      <label>保護者の名前 <input type="text" id="lc_v_guard" maxlength="100"></label>
      <label>続柄（任意） <input type="text" id="lc_v_rel" maxlength="50" placeholder="例：母"></label>
      <label>保護者の住所（任意） <input type="text" id="lc_v_addr" maxlength="200"></label>
      <label>契約の開始日 <input type="date" id="lc_v_start"></label>
      <label>契約の終了日（任意） <input type="date" id="lc_v_end"></label>
      <p><button onclick="lcIssueVisit()">署名リンクを発行</button></p>
    </div>
    <div class="card">${rows.length ? `<table class="tbl"><tr><th>児童</th><th>保護者</th>${types.map(t => `<th>${esc(t.label.replace(/（.*/, ''))}</th>`).join('')}<th>契約期間</th><th></th></tr>
    ${rows.map(r => `<tr><td>${esc(r.child)}${r.registered ? '' : ' <span class="note">未登録</span>'}</td><td>${esc(r.guardian)}</td>${types.map(t => `<td>${r.party ? lcSt(logs.filter(l => l.party_id === r.party.id && l.doc_code === t.code)) : '未'}${r.party ? `<br><button class="back" onclick="lcPaper(${r.party.id},'${t.code}','${nm(r.child)}','${nm(t.label)}')">紙で署名済み</button> <button class="back" onclick="lcPrint(${r.party.id},'${t.code}')">印刷</button>` : ''}</td>`).join('')}<td>${period(r)}</td>
      <td><button onclick="lcIssueChild('${nm(r.child)}')">署名リンク発行</button></td></tr>`).join('')}</table>` : '<p>利用者がまだいません。上の欄で見学者の名前を入れて発行できます。</p>'}</div>
    <div class="card"><h4>文面</h4><p>${types.map(t => `<button class="back" onclick="lcEdit('${t.code}')">${esc(t.label)} を見る・編集</button>`).join(' ')}</p><div id="lc_body"></div></div>`;
  } catch (e) { $('view').innerHTML = back + `<p>${esc(e.message)}</p>`; }
}
function lcEdit(code) {
  const t = LC.types.find(x => x.code === code);
  $('lc_body').innerHTML = `<div style="max-height:50vh;overflow:auto;border:1px solid #ddd;padding:10px;margin:8px 0">${lcRender(t.body)}</div>
    <p class="note">{保護者}{児童}{契約開始}{契約終了}{契約締結日}{説明日}{説明職員}{保護者住所}{続柄} は発行時の名前と日付に置き換わります。署名済みの書類には、署名時点の版（${esc(t.version)}）が記録されます。</p>
    <label>版 <input id="lc_ver" value="${esc(t.version)}" style="width:8em"></label><textarea id="lc_txt" rows="18" style="width:100%;box-sizing:border-box">${esc(t.body)}</textarea><p><button onclick="lcSave('${code}')">文面を保存</button> <span id="lc_em"></span></p>`;
}
async function lcSave(code) { try { await sb(`leo_doc_type?code=eq.${code}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ body: $('lc_txt').value, version: $('lc_ver').value.trim() || 'R8.11', updated_at: new Date().toISOString() }) }); $('lc_em').textContent = '保存しました'; const t = LC.types.find(x => x.code === code); t.body = $('lc_txt').value; t.version = $('lc_ver').value.trim(); } catch (e) { $('lc_em').textContent = e.message; } }
async function lcAskMeta(pre) {
  const types = LC.types;
  const pick = prompt(`署名する書類の番号を入れてください（複数はカンマ区切り）\n${types.map((t, i) => (i + 1) + ': ' + t.label).join('\n')}`, types.map((_, i) => i + 1).join(',')); if (!pick) return null;
  const docs = pick.split(/[,、\s]+/).map(x => types[+x - 1] && types[+x - 1].code).filter(Boolean); if (!docs.length) { alert('番号が正しくありません'); return null; }
  const guardian = prompt('保護者の名前', (pre && pre.guardian) || ''); if (!guardian || !guardian.trim()) { alert('保護者の名前を入れてください'); return null; }
  const relation = prompt('続柄（任意）', (pre && pre.relation) || '') || '';
  const address = prompt('保護者の住所（任意）', (pre && pre.address) || '') || '';
  const start = prompt('契約の開始日（YYYY-MM-DD、任意）', (pre && pre.start) || '') || '';
  if (start && !/^\d{4}-\d{2}-\d{2}$/.test(start)) { alert('日付は 2026-11-12 の形で入れてください'); return null; }
  const end = prompt('契約の終了日（YYYY-MM-DD、任意）', (pre && pre.end) || '') || '';
  if (end && !/^\d{4}-\d{2}-\d{2}$/.test(end)) { alert('日付は 2026-11-12 の形で入れてください'); return null; }
  let me = ''; try { me = typeof myName === 'function' ? await myName() : ''; } catch (_) {}
  const ex = prompt('説明した職員の氏名', me || ''); if (!ex) return null;
  return { docs, guardian: guardian.trim(), relation: relation.trim(), address: address.trim(), start: start || null, end: end || null, explainer: ex.trim() };
}
async function lcDoIssue(child, meta) {
  try {
    const t = await sb('rpc/leo_doc_issue', { method: 'POST', body: JSON.stringify({ p_child_name: child, p_guardian_name: meta.guardian, p_docs: meta.docs, p_explainer: meta.explainer, p_guardian_relation: meta.relation || null, p_guardian_address: meta.address || null, p_contract_start: meta.start, p_contract_end: meta.end }) });
    LC.link = { child, guardian: meta.guardian, url: LC_URL(t) };
    await renderLeoContract();
  } catch (e) { alert(e.message); }
}
async function lcIssueChild(child) {
  const p = (LC.parties || []).find(x => x.child_name === child) || {};
  const meta = await lcAskMeta({ guardian: p.guardian_name || '', relation: p.guardian_relation || '', address: p.guardian_address || '', start: p.contract_start || '', end: p.contract_end || '' });
  if (!meta) return;
  await lcDoIssue(child, meta);
}
async function lcIssueVisit() {
  const child = ($('lc_v_child').value || '').trim(), guardian = ($('lc_v_guard').value || '').trim();
  if (!child || !guardian) return alert('児童の名前と保護者の名前を入れてください');
  const start = $('lc_v_start').value || '', end = $('lc_v_end').value || '';
  const types = LC.types;
  const pick = prompt(`署名する書類の番号を入れてください（複数はカンマ区切り）\n${types.map((t, i) => (i + 1) + ': ' + t.label).join('\n')}`, types.map((_, i) => i + 1).join(',')); if (!pick) return;
  const docs = pick.split(/[,、\s]+/).map(x => types[+x - 1] && types[+x - 1].code).filter(Boolean); if (!docs.length) return alert('番号が正しくありません');
  let me = ''; try { me = typeof myName === 'function' ? await myName() : ''; } catch (_) {}
  const ex = prompt('説明した職員の氏名', me || ''); if (!ex) return;
  await lcDoIssue(child, { docs, guardian, relation: ($('lc_v_rel').value || '').trim(), address: ($('lc_v_addr').value || '').trim(), start: start || null, end: end || null, explainer: ex.trim() });
}
async function lcPaper(pid, code, name, label) {
  const d = prompt(`${name} さんの「${label}」は、紙で署名済みであることを確認しましたか？\n確認済みなら署名日（YYYY-MM-DD）を入れてください。`); if (!d) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return alert('日付は 2026-11-12 の形で入れてください');
  const memo = prompt('メモ（保管場所など、任意）', '') || '';
  try { await sb('rpc/leo_doc_mark_paper', { method: 'POST', body: JSON.stringify({ p_party_id: pid, p_doc: code, p_signed_on: d, p_memo: memo }) }); renderLeoContract(); } catch (e) { alert(e.message); }
}
async function lcPrint(pid, code) {
  try {
    const p = LC.parties.find(x => x.id === pid), t = LC.types.find(x => x.code === code);
    const ls = await sb(`leo_doc_log?party_id=eq.${pid}&doc_code=eq.${code}&select=*&order=signed_at`), l = lcLast(ls);
    const day = l ? (l.signed_on || new Date(l.signed_at).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' })) : '';
    const sig = l && l.signature ? `<img src="${l.signature}" style="max-height:70px;vertical-align:middle">` : l && l.method === '紙で署名済み' ? '（紙の原本に署名）' : l && l.method === '署名困難' ? `（署名困難：${esc(l.reason || '')}）` : '';
    const filled = lcFill(t.body, { child: p.child_name, guardian: p.guardian_name, relation: (l && l.agent_relation) || p.guardian_relation, address: p.guardian_address, contract_start: p.contract_start, contract_end: p.contract_end, explainer: (l && l.explainer_name) || '', signed_on: l && l.signed_on, explained_on: l && l.signed_on });
    $('view').innerHTML = `<p class="noprint"><button class="back" onclick="renderLeoContract()">← 戻る</button> <button onclick="print()">印刷</button></p>
    ${lcRender(filled)}
    <table style="width:100%;margin-top:24px;border-collapse:collapse"><tr><td style="width:50%;vertical-align:top">署名日：${esc(day || lcWareki(null))}<br>児童：${esc(p.child_name)}<br>保護者：${esc(p.guardian_name)}<br>署名：${sig}${l && l.agent_name ? `<br>代理人：${esc(l.agent_name)}（続柄：${esc(l.agent_relation || '')}）` : (p.guardian_relation ? `<br>続柄：${esc(p.guardian_relation)}` : '')}</td><td style="vertical-align:top">事業者：一般社団法人 心理社会的リハビリテーション・星心会<br>事業所：レオ<br>説明職員：${esc((l && l.explainer_name) || '')}</td></tr></table><p style="font-size:10px;color:#666">版：${esc((l && l.version) || t.version)}</p>`;
  } catch (e) { alert(e.message); }
}
if (typeof window !== 'undefined') { window.lcRender = lcRender; window.lcFill = lcFill; window.lcWareki = lcWareki; }
