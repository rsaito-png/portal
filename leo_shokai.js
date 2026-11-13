// レオ 初回利用（#leo/shokai）：新しい児童の手続きを、いまの登録・署名の実データで確認する
// ①利用者情報 ②型表と予定 ③契約書・重要事項 ④公式LINE友だち追加
// ⑤上限額管理先（leo_jogan_master の有無） ⑥アセスメント（リンク発行と回答済）
// ⑦個別支援計画の保護者アンケート（既存の hogosha.html?k=mon / leo_mon_links）
// ⑧個別支援計画（原案・本案・同意）
// ③の署名済みは leo_doc_log（保護者署名・紙で署名済み）。公式LINEの友だち追加は判定データが無いので手でチェック。
const SK_LINE_QR = 'img/leo-line-qr.png';
// 友だち追加URLは齊藤さんから届いたQR（img/leo-line-qr.png）を読み取ったもの。
const SK_LINE_ADD_URL = 'https://lin.ee/so8IzX4';
const SK_LINE_KEY = 'leo_shokai_line';

function skCompact(n) { return String(n || '').replace(/\s+/g, ''); }
function skLineMap() {
  try { return JSON.parse(localStorage.getItem(SK_LINE_KEY) || '{}') || {}; } catch (e) { return {}; }
}
function skLineOn(name) { return !!skLineMap()[skCompact(name)]; }
function skSigned(logs) {
  const l = typeof lcLast === 'function' ? lcLast(logs) : (logs || []).filter(x => x.method !== 'あとで署名').sort((a, b) => String(b.signed_at || '').localeCompare(String(a.signed_at || '')))[0];
  return !!(l && l.method !== 'あとで署名');
}
function skSt(ok, yes, no) {
  return ok
    ? `<span style="color:#2e6b4f;font-weight:bold">✅ ${esc(yes)}</span>`
    : `<span style="color:#b33">☐ ${esc(no)}</span>`;
}
function skPeriod(r) {
  if (r.start || r.end) return `${esc(r.start || '')} 〜 ${esc(r.end || '')}`;
  return '未入力';
}
function skPubUrl(file) {
  const base = (typeof location !== 'undefined' && location.origin)
    ? location.origin + String(location.pathname || '/').replace(/[^/]*$/, '')
    : 'https://rsaito-png.github.io/portal/';
  return base + file;
}
function skWhen(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }); } catch (e) { return String(iso); }
}
function skArg(s) { return esc(s).replace(/'/g, ''); }
function skTermOf(sel, plans, monLinks) {
  const c = skCompact(sel);
  const existing = (monLinks || []).filter(l => skCompact(l.child) === c);
  const first = existing.find(l => l.term === '第1期') || existing[0];
  if (first && first.term) return first.term;
  const childPlans = (plans || []).filter(p => skCompact(p.child) === c).slice().sort((a, b) => (a.term_no || 0) - (b.term_no || 0));
  if (childPlans.length) {
    const open = childPlans.find(p => !p.honan_consent_at) || childPlans[childPlans.length - 1];
    return `第${open.term_no}期`;
  }
  return '第1期';
}
function skUrlBox(url, note) {
  if (!url) return '';
  return `<p class="note">${esc(note || '発行済みのリンク（ポータルからは送りません）。ほかの家庭には送らないでください。')}</p>
    <input readonly value="${esc(url)}" onfocus="this.select()" onclick="this.select()" style="width:100%;font-size:14px;margin:6px 0">`;
}

window.skToggleLine = function (name) {
  const m = skLineMap();
  const k = skCompact(name);
  if (!k) return;
  if (m[k]) delete m[k]; else m[k] = new Date().toISOString();
  localStorage.setItem(SK_LINE_KEY, JSON.stringify(m));
  if (typeof renderLeoView === 'function') renderLeoView('shokai');
};
window.skOpen = function (name) {
  try { sessionStorage.setItem('leo_shokai_child', name || ''); } catch (e) {}
  if (typeof renderLeoView === 'function') renderLeoView('shokai');
};
window.skAssessLink = async function (child) {
  const B = typeof copyBtnEl === 'function' ? copyBtnEl() : null;
  if (!child) return;
  if (DEMO) {
    const url = skPubUrl('assess.html') + '?demo=1';
    if (typeof copyNote === 'function') copyNote(B, `<p class="note">見本：${esc(url)}</p>`, child);
    return;
  }
  if (B) B.disabled = true;
  try {
    const tok = await sb('rpc/leo_af_make_link', { method: 'POST', body: JSON.stringify({ p_child: child, p_prefill: false }) });
    const url = `${skPubUrl('assess.html')}?t=${tok}`;
    const ok = typeof copyUrl === 'function' ? await copyUrl(url) : false;
    if (typeof copyResult === 'function') copyResult(B, url, ok, child, 'アセスメントの専用リンクです。ポータルからは送りません。ほかの家庭には送らないでください。30日で期限が切れます。');
    if (typeof renderLeoView === 'function') renderLeoView('shokai');
  } catch (e) {
    if (typeof copyError === 'function') copyError(B, e.message, child);
    else alert(e.message);
  } finally { if (B) B.disabled = false; }
};
window.skMonLink = async function (child, term) {
  const B = typeof copyBtnEl === 'function' ? copyBtnEl() : null;
  if (!child) return;
  term = term || '第1期';
  if (DEMO) {
    const url = skPubUrl('hogosha.html') + '?k=mon&demo=1';
    if (typeof copyNote === 'function') copyNote(B, `<p class="note">見本：${esc(url)}</p>`, child);
    return;
  }
  if (B) B.disabled = true;
  try {
    const tok = await sb('rpc/leo_make_token_link', { method: 'POST', body: JSON.stringify({ p_kind: 'mon', p_child: child, p_term: term, p_plan: null, p_doc: '' }) });
    const url = `${skPubUrl('hogosha.html')}?k=mon&t=${tok}`;
    const ok = typeof copyUrl === 'function' ? await copyUrl(url) : false;
    if (typeof copyResult === 'function') copyResult(B, url, ok, child, `個別支援計画（${term}）の保護者アンケートです。ポータルからは送りません。ほかの家庭には送らないでください。`);
    if (typeof renderLeoView === 'function') renderLeoView('shokai');
  } catch (e) {
    if (typeof copyError === 'function') copyError(B, e.message, child);
    else alert(e.message);
  } finally { if (B) B.disabled = false; }
};

LEO_VIEWS.shokai = async function () {
  const back = `<button class="back" onclick="location.hash='leo'">← レオへ</button>`;
  if (typeof canManage === 'function' && !canManage()) {
    return back + '<p>この画面は児発管・事務・管理者だけが使えます。</p>';
  }
  const todayJ = typeof today === 'function' ? today() : new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
  let kids = [], infos = [], parties = [], logs = [], types = [], kataRows = [], evs = [];
  let jogan = [], afLinks = [], afSubs = [], assessRows = [], monLinks = [], monAns = [], plans = [];
  if (DEMO) {
    kids = [{ name: '児童A', jukyusha_no: '0123456789', contract_start: '2026-11-12', contract_end: '2027-04-30' }];
    infos = [{ name: '児童A', guardian_name: '見本 花子' }];
    parties = [{ id: 1, child_name: '児童A', guardian_name: '見本 花子', contract_start: '2026-11-12', contract_end: '2027-04-30' }];
    logs = [{ party_id: 1, doc_code: 'keiyaku', method: '保護者', signed_on: '2026-11-12', signed_at: '2026-11-12T07:41:00+00:00' }];
    types = [{ code: 'keiyaku', label: '利用契約書' }, { code: 'juyo', label: '重要事項説明書' }];
    kataRows = [{ '児童名': '児童A', '曜日': '月' }];
    evs = [{ day: '2026-11-16', kind: '利用', child: '児童A', source: 'kata' }];
    jogan = [{ child: '児童A', side: '他所が管理', partner_name: '見本事業所' }];
    afLinks = [{ child: '児童A', token: '0'.repeat(48) }];
    afSubs = [];
    assessRows = [];
    monLinks = [{ child: '児童A', term: '第1期', token: '1'.repeat(48) }];
    monAns = [];
    plans = [{ child: '児童A', term_no: 1, genan: '', honan: '', assessment: '', plan_made: false, genan_consent_at: null, honan_consent_at: null }];
  } else {
    try {
      [kids, infos, parties, logs, types, kataRows, evs, jogan, afLinks, afSubs, assessRows, monLinks, monAns, plans] = await Promise.all([
        sb('leo_children?select=name,jukyusha_no,contract_start,contract_end,first_date&order=name').catch(() => []),
        sb('leo_child_info?select=name,guardian_name').catch(() => []),
        sb('leo_doc_party?select=id,child_name,guardian_name,guardian_relation,guardian_address,contract_start,contract_end&order=child_name').catch(() => []),
        sb('leo_doc_log?select=id,party_id,doc_code,method,signed_on,signed_at,agent_name,agent_relation,reason&order=signed_at').catch(() => []),
        sb('leo_doc_type?select=code,label,version&order=sort').catch(() => []),
        (typeof sheetRows === 'function' ? sheetRows('kata') : sb('leo_master?kind=eq.kata&select=data&order=row_no').then(rs => (rs || []).map(r => r.data))).catch(() => []),
        sb(`leo_events?day=gte.${todayJ}&kind=eq.利用&select=day,kind,child,kids,source`).catch(() => []),
        sb('leo_jogan_master?select=child,side,partner_name,active&order=sort_no').catch(() => []),
        sb('leo_af_links?select=token,child,created_at,expires_at').catch(() => []),
        sb('leo_af_subs?select=id,token,child,status,created_at,applied&order=id.desc').catch(() => []),
        sb('leo_child_assess?select=name').catch(() => []),
        sb('leo_mon_links?select=token,child,term,created_at').catch(() => []),
        sb('leo_mon_answers?select=token,submitted_at&order=submitted_at.desc').catch(() => []),
        sb('leo_plans?select=id,child,term_no,assessment,genan,honan,kaigi,plan_made,genan_consent_at,honan_consent_at&order=term_no').catch(() => [])
      ]);
    } catch (e) {
      return back + `<p>${esc(e.message)}</p>`;
    }
  }

  const compact = skCompact;
  const infoOf = Object.fromEntries((infos || []).map(i => [compact(i.name), i]));
  const partyOf = Object.fromEntries((parties || []).map(p => [compact(p.child_name), p]));
  const names = [];
  const seen = new Set();
  const addName = n => { const c = compact(n); if (!c || seen.has(c)) return; seen.add(c); names.push(n); };
  (kids || []).forEach(k => addName(k.name));
  (parties || []).forEach(p => addName(p.child_name));
  (kataRows || []).forEach(r => addName(r['児童名']));

  let sel = '';
  try { sel = sessionStorage.getItem('leo_shokai_child') || ''; } catch (e) {}
  if (!names.some(n => compact(n) === compact(sel))) sel = names[0] || '';

  const kid = (kids || []).find(k => compact(k.name) === compact(sel));
  const party = partyOf[compact(sel)];
  const info = infoOf[compact(sel)];
  const start = (party && party.contract_start) || (kid && kid.contract_start) || '';
  const end = (party && party.contract_end) || (kid && kid.contract_end) || '';
  const guardian = (info && info.guardian_name) || (party && party.guardian_name) || '';
  const hasInfo = !!kid;
  const hasJukyusha = !!(kid && kid.jukyusha_no);
  const kataDays = [...new Set((kataRows || []).filter(r => compact(r['児童名']) === compact(sel) && r['曜日'] && (r['利用週'] || '毎週') !== '退所').map(r => String(r['曜日']).slice(0, 1)))];
  const inKata = kataDays.length > 0;
  const evDays = [...new Set((evs || []).filter(e => e.kind === '利用' && compact(e.child) === compact(sel)).map(e => e.day))].sort();
  const hasYotei = evDays.length > 0;
  const partyLogs = (logs || []).filter(l => party && l.party_id === party.id);
  const docTypes = (types && types.length) ? types : [{ code: 'keiyaku', label: '利用契約書' }, { code: 'juyo', label: '重要事項説明書' }];
  const docOk = {};
  docTypes.forEach(t => { docOk[t.code] = skSigned(partyLogs.filter(l => l.doc_code === t.code)); });
  const allSigned = docTypes.length > 0 && docTypes.every(t => docOk[t.code]);
  const lineOk = skLineOn(sel);
  const lineUrl = SK_LINE_ADD_URL;

  const joganRow = (jogan || []).find(j => compact(j.child) === compact(sel) && j.active !== false);
  const hasJogan = !!joganRow;
  const afLink = (afLinks || []).filter(l => compact(l.child) === compact(sel)).pop();
  const afSub = (afSubs || []).find(s => compact(s.child) === compact(sel) && s.status !== 'superseded');
  const hasAssessData = (assessRows || []).some(r => compact(r.name) === compact(sel));
  const assessIssued = !!afLink;
  const assessAnswered = !!(afSub || hasAssessData);
  const monTerm = skTermOf(sel, plans, monLinks);
  const monLink = (monLinks || []).find(l => compact(l.child) === compact(sel) && l.term === monTerm)
    || (monLinks || []).find(l => compact(l.child) === compact(sel));
  const monAnswered = !!(monLink && (monAns || []).some(a => a.token === monLink.token));
  const plan = (plans || []).filter(p => compact(p.child) === compact(sel)).slice().sort((a, b) => (a.term_no || 0) - (b.term_no || 0)).pop();
  const hasGenan = !!(plan && String(plan.genan || '').trim());
  const hasHonan = !!(plan && String(plan.honan || '').trim());
  const genanOk = !!(plan && plan.genan_consent_at);
  const honanOk = !!(plan && plan.honan_consent_at);
  const planMade = !!(plan && plan.plan_made);

  const pick = names.length
    ? `<p><label>児童 <select onchange="skOpen(this.value)">${names.map(n => `<option value="${esc(n)}" ${compact(n) === compact(sel) ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label></p>`
    : '<p>まだ児童がいません。<a href="#leo/userinfo">利用者情報</a>か、<a href="#leo/contract">利用契約書・重要事項説明書</a>から名前を入れてください。</p>';

  const step1 = `<div class="card"><h4>① 利用者情報</h4>
    <p>${skSt(hasInfo, '利用者情報に登録あり', 'まだ利用者情報に登録がありません')}</p>
    <p>${skSt(hasJukyusha, '受給者証番号あり（' + (kid && kid.jukyusha_no || '') + '）', '受給者証番号はまだ空です')}</p>
    <p>保護者：${esc(guardian || '（未入力）')}</p>
    <p><a href="#leo/userinfo">利用者情報を開く</a>　<a href="#leo/jukyusha">受給者証の入力（保護者から）</a></p></div>`;

  const step2 = `<div class="card"><h4>② 型表と予定</h4>
    <p>${skSt(inKata, '型表に入っています（' + kataDays.join('・') + '）', '型表にまだ入っていません')}</p>
    <p>${skSt(hasYotei, '今日以降の利用予定が ' + evDays.length + ' 日あります（次は ' + evDays[0] + '）', '今日以降の利用予定はまだありません')}</p>
    <p class="note">型表を保存すると、今日以降の予定に反映します。</p>
    <p><a href="#leo/kata">送迎 型表を開く</a>　<a href="#leo/cal">利用・送迎予定を開く</a></p></div>`;

  const docRows = docTypes.map(t => {
    const logsT = partyLogs.filter(l => l.doc_code === t.code);
    const st = typeof lcSt === 'function' && party ? lcSt(logsT) : (docOk[t.code] ? '署名済み' : '未');
    const btns = party ? ` <button class="back" type="button" onclick="location.hash='leo/contract'">閲覧・印刷・リンク発行へ</button>` : '';
    return `<tr><td>${esc((t.label || t.code).replace(/（.*/, ''))}</td><td>${st}${btns}</td></tr>`;
  }).join('');
  const step3ok = allSigned;
  const step3 = `<div class="card"><h4>③ 契約書・重要事項説明書</h4>
    <p>${skSt(step3ok, '契約書と重要事項は署名済みです', 'まだ署名が揃っていません')}</p>
    <p>契約期間：${skPeriod({ start, end })}</p>
    ${party ? `<table class="tbl"><tr><th>書類</th><th>署名の状況</th></tr>${docRows}</table>` : '<p>この児童の契約相手はまだありません。下の画面で名前を入れて署名リンクを発行できます。</p>'}
    <p class="note">署名リンクの発行、署名の状況、署名済み書類の閲覧・印刷、契約期間の入力は、既存の契約画面で行います。</p>
    <p><a href="#leo/contract">利用契約書・重要事項説明書を開く</a>　<a href="#leo/userinfo">契約期間を利用者情報で直す</a></p></div>`;

  const qr = `<div style="margin:10px 0"><img src="${esc(SK_LINE_QR)}" alt="レオ公式LINEの友だち追加QRコード" width="180" height="180" style="background:#fff;border:1px solid #ddd;padding:8px;border-radius:8px;max-width:180px;height:auto" onerror="this.style.display='none';var n=this.nextElementSibling;if(n)n.hidden=false"><p class="note" hidden>QR画像（${esc(SK_LINE_QR)}）がまだ置けていません。</p></div>`;
  const addLink = lineUrl
    ? `<p><a href="${esc(lineUrl)}" target="_blank" rel="noopener">友だち追加のリンクを開く</a></p>`
    : '<p class="note">友だち追加のURLは、届いたQRから読み取れたときだけここに出します。まだ未設定です（推測では入れていません）。</p>';
  const step4 = `<div class="card"><h4>④ 公式LINE友だち追加</h4>
    <p>保護者の端末で、下のQRを読み取るか、リンクから公式LINEを友だち追加します。ポータルからは追加の有無を判定できないので、確認できたら手でチェックしてください。</p>
    ${qr}${addLink}
    ${sel ? `<p><label><input type="checkbox" ${lineOk ? 'checked' : ''} onchange="skToggleLine('${skArg(sel)}')"> 友だち追加を確認した（手チェック）</label></p>
    <p>${skSt(lineOk, '確認済み（手チェック）', 'まだ確認していません')}</p>` : ''}
    </div>`;

  const joganDetail = hasJogan
    ? `${joganRow.side || ''}／相手先：${joganRow.partner_name || '（未入力）'}`
    : 'leo_jogan_master に行がありません';
  const step5 = `<div class="card"><h4>⑤ 上限額管理先</h4>
    <p>${skSt(hasJogan, '上限額管理先の登録あり（' + joganDetail + '）', '上限額管理先はまだ登録がありません')}</p>
    <p class="note">判定は leo_jogan_master に、この児童の行があるかどうかです。</p>
    <p><a href="#leo/jogan">上限額管理を開く</a></p></div>`;

  const assessUrl = afLink ? `${skPubUrl('assess.html')}?t=${afLink.token}` : '';
  const assessAnsTxt = assessAnswered
    ? (afSub ? '回答済み（' + skWhen(afSub.created_at) + (afSub.status === 'applied' || hasAssessData ? '・利用者情報に反映済み' : '・まだ反映前') + '）' : 'アセスメントのデータあり')
    : 'まだ回答がありません';
  const step6 = `<div class="card"><h4>⑥ アセスメント</h4>
    <p>${skSt(assessIssued, 'リンクを発行済み', 'リンクはまだ発行していません')}</p>
    <p>${skSt(assessAnswered, assessAnsTxt, 'まだ回答がありません')}</p>
    ${skUrlBox(assessUrl, '発行済みのアセスメントリンク（ポータルからは送りません）。')}
    ${sel ? `<p><button type="button" onclick="skAssessLink('${skArg(sel)}')">${assessIssued ? 'リンクを再表示（コピー）' : 'アセスメントのリンクを発行'}</button></p>` : ''}
    <p class="note">発行と回答の判定は、アセスメント画面と同じ token 方式（leo_af_links / leo_af_subs、反映後は leo_child_assess）です。</p>
    <p><a href="#leo/assess">アセスメント画面を開く</a></p></div>`;

  const monUrl = monLink ? `${skPubUrl('hogosha.html')}?k=mon&t=${monLink.token}` : '';
  const monAnsTxt = monAnswered
    ? '回答済み（' + skWhen((monAns.find(a => a.token === monLink.token) || {}).submitted_at) + '）'
    : 'まだ回答がありません';
  const step7 = `<div class="card"><h4>⑦ 個別支援計画の保護者アンケート</h4>
    <p>${skSt(!!monLink, 'リンクを発行済み（' + (monLink && monLink.term ? monLink.term : monTerm) + '）', 'リンクはまだ発行していません（' + monTerm + '）')}</p>
    <p>${skSt(monAnswered, monAnsTxt, 'まだ回答がありません')}</p>
    ${skUrlBox(monUrl, '発行済みの保護者アンケートリンク（ポータルからは送りません）。')}
    ${sel ? `<p><button type="button" onclick="skMonLink('${skArg(sel)}','${skArg(monTerm)}')">${monLink ? 'リンクを再表示（コピー）' : '保護者アンケートのリンクを発行'}</button></p>` : ''}
    <p class="note">既存の仕組み（個別支援計画の画面と同じ。leo_mon_links / leo_mon_answers、保護者ページ hogosha.html）。Googleフォームは使いません。</p>
    <p><a href="#leo/plan">個別支援計画（管理）を開く</a></p></div>`;

  const planHead = plan ? `第${plan.term_no}期` : 'まだ計画行がありません';
  const step8 = `<div class="card"><h4>⑧ 個別支援計画（原案・本案・同意）</h4>
    <p>対象：${esc(planHead)}</p>
    <p>${skSt(hasGenan, '原案の本文あり', '原案はまだありません')}</p>
    <p>${skSt(hasHonan, '本案の本文あり', '本案はまだありません')}</p>
    <p>${skSt(planMade, '計画書作成＝済', '計画書作成はまだ未')}</p>
    <p>${skSt(genanOk, '原案の同意済み（' + skWhen(plan && plan.genan_consent_at) + '）', '原案の同意はまだです')}</p>
    <p>${skSt(honanOk, '本案の同意済み（' + skWhen(plan && plan.honan_consent_at) + '）', '本案の同意はまだです')}</p>
    <p class="note">判定は leo_plans の本文（genan / honan）、plan_made、genan_consent_at / honan_consent_at です。同意リンクの発行は計画画面から行います。</p>
    <p><a href="#leo/plan">個別支援計画（管理）を開く</a></p></div>`;

  return `${back}<h3>🚪 初回利用</h3>${typeof demoNote === 'function' ? demoNote() : ''}
    <p class="note">新しい児童の手続きを、この画面で順に確認します。各項目はいまの登録内容で判定します（③の署名は契約書の署名記録、⑤は上限額管理先マスタ、⑥⑦はリンクと回答、⑧は計画の本文と同意）。公式LINEの友だち追加だけ、手でチェックします。</p>
    ${pick}${sel ? step1 + step2 + step3 + step4 + step5 + step6 + step7 + step8 : ''}`;
};
