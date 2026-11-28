// レオ 初回利用（#leo/shokai）：新しい児童の手続きを、いまの登録・署名の実データで確認する
// ①利用者情報 ②型表と予定 ③契約書・重要事項 ④公式LINE友だち追加
// ⑤上限額管理先（leo_jogan_master の有無） ⑥アセスメント（リンク発行と回答済）
// （保護者アンケートは見直し用なので初回利用には出さない。2026-11-13 齊藤さん指定）
// ⑦個別支援計画（原案・本案・同意）
// ③の署名済みは leo_doc_log。⑥⑦③の発行済みリンクは、案内文とURLを最初から出し、コピーして公式LINEで送る（ポータルは送信しない）。
const SK_LINE_QR = 'img/leo-line-qr.png';
// 友だち追加URLは齊藤さんから届いたQR（img/leo-line-qr.png）を読み取ったもの。
const SK_LINE_ADD_URL = 'https://lin.ee/so8IzX4';
const SK_LINE_KEY = 'leo_shokai_line';
const SK_DEMO = { issued: {}, sends: [] };

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
function skLineMsg(kind, url, doc) {
  const u = String(url || '').trim();
  if ((kind === 'mon' || kind === 'doui') && typeof planLineMsg === 'function') return planLineMsg(kind, u, doc);
  if (kind === 'assess') return `レオです。\n\nご利用前のアセスメントのご案内です。下のリンクを開いて、ご入力をお願いいたします。\n\n${u}`;
  if (kind === 'doc') return `レオです。\n\n利用契約書と重要事項説明書の署名用リンクです。下のリンクを開いて、ご確認とご署名をお願いいたします。\n\n${u}`;
  if (kind === 'mon' || kind === 'doui') return u;
  return `レオです。\n\n下のリンクを開いてください。\n\n${u}`;
}
function skLastLineSend(sends, kind, child, pred) {
  const c = skCompact(child);
  return (sends || []).filter(s => s.kind === kind && skCompact(s.child) === c && s.via === '公式LINE' && (!pred || pred(s))).pop();
}
function skLineBox(id, kind, child, term, token, url, lastSend, doc) {
  if (!url) return '';
  const when = lastSend && lastSend.sent_at ? `${skWhen(lastSend.sent_at)}（Asia/Tokyo）` : 'まだありません';
  const docArg = doc || '';
  return `<div class="sk-linebox" style="margin:10px 0;padding:10px;border:1px solid #cde;border-radius:8px;background:#f7fbf8">
    <p class="note">保護者への案内です。コピーして、公式LINEの1対1トークに貼って送ってください。ポータルからは送りません。</p>
    <textarea id="${esc(id)}" data-kind="${esc(kind)}" data-doc="${esc(docArg)}" data-url="${esc(url)}" readonly rows="12" style="width:100%;box-sizing:border-box;font-size:14px;line-height:1.6">${esc(skLineMsg(kind, url, doc))}</textarea>
    <p style="margin:8px 0">
      <button type="button" onclick="skCopyMsg('${esc(id)}')">コピー</button>
      <button type="button" onclick="skMarkSent('${esc(id)}','${esc(kind)}','${skArg(child)}','${skArg(term || '')}','${skArg(token || '')}','${skArg(url)}','${skArg(docArg)}')">LINEで送った</button>
      <span id="${esc(id)}_msg" class="note"></span>
    </p>
    <p>公式LINEで送った日時：${esc(when)}</p>
  </div>`;
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
window.skCopyMsg = async function (id) {
  const el = typeof document !== 'undefined' && document.getElementById(id);
  let text = el ? el.value : '';
  if (el && typeof planLineMsg === 'function' && (el.dataset.kind === 'mon' || el.dataset.kind === 'doui')) {
    text = planLineMsg(el.dataset.kind, el.dataset.url || '', el.dataset.doc || '');
    el.value = text;
  }
  const note = typeof document !== 'undefined' && document.getElementById(id + '_msg');
  const ok = typeof copyUrl === 'function' ? await copyUrl(text) : false;
  if (!ok && el) { try { el.focus(); el.select(); } catch (e) {} }
  if (note) note.textContent = ok ? 'コピーしました。公式LINEの1対1トークに貼って送ってください。' : '自動でコピーできませんでした。案内の欄を長押し（または選択）してコピーしてください。';
};
window.skMarkSent = async function (id, kind, child, term, token, url, doc) {
  const note = typeof document !== 'undefined' && document.getElementById(id + '_msg');
  if (DEMO) {
    SK_DEMO.sends.push({ kind, child, term, token, url, doc: doc || null, via: '公式LINE', sent_at: new Date().toISOString() });
    if (typeof renderLeoView === 'function') renderLeoView('shokai');
    return;
  }
  try {
    await sb('leo_link_sends', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ kind, child, term: term || null, token: token || null, url: url || null, doc: doc || null, via: '公式LINE' }) });
    if (typeof renderLeoView === 'function') renderLeoView('shokai');
  } catch (e) {
    if (note) note.textContent = '記録できませんでした：' + (e && e.message ? e.message : e);
    else alert(e.message);
  }
};
window.skAssessLink = async function (child) {
  if (!child) return;
  if (DEMO) {
    SK_DEMO.issued.assess = { child, token: 'a'.repeat(48) };
    if (typeof renderLeoView === 'function') renderLeoView('shokai');
    return;
  }
  try {
    const tok = await sb('rpc/leo_af_make_link', { method: 'POST', body: JSON.stringify({ p_child: child, p_prefill: false }) });
    if (typeof renderLeoView === 'function') renderLeoView('shokai');
    return tok;
  } catch (e) { alert(e.message); }
};
window.skMonLink = async function (child, term) {
  if (!child) return;
  term = term || '第1期';
  if (DEMO) {
    SK_DEMO.issued.mon = { child, term, token: 'b'.repeat(48) };
    if (typeof renderLeoView === 'function') renderLeoView('shokai');
    return;
  }
  try {
    const tok = await sb('rpc/leo_make_token_link', { method: 'POST', body: JSON.stringify({ p_kind: 'mon', p_child: child, p_term: term, p_plan: null, p_doc: '' }) });
    if (typeof renderLeoView === 'function') renderLeoView('shokai');
    return tok;
  } catch (e) { alert(e.message); }
};
window.skDocLink = async function (child) {
  if (!child) return;
  if (DEMO) {
    SK_DEMO.issued.doc = { child, token: 'c'.repeat(48), party_id: 1 };
    if (typeof renderLeoView === 'function') renderLeoView('shokai');
    return;
  }
  try {
    const [parties, infos, types] = await Promise.all([
      sb('leo_doc_party?select=id,child_name,guardian_name,guardian_relation,guardian_address,contract_start,contract_end').catch(() => []),
      sb('leo_child_info?select=name,guardian_name').catch(() => []),
      sb('leo_doc_type?select=code&order=sort').catch(() => [])
    ]);
    const p = (parties || []).find(x => skCompact(x.child_name) === skCompact(child)) || {};
    const info = (infos || []).find(x => skCompact(x.name) === skCompact(child)) || {};
    const guardian = String(p.guardian_name || info.guardian_name || '').trim();
    if (!guardian) { alert('保護者の名前がまだないので、契約画面から発行してください。'); location.hash = 'leo/contract'; return; }
    let me = '';
    try { me = typeof myName === 'function' ? (await myName()) || '' : ''; } catch (e) {}
    if (!me) me = (prompt('説明した職員の氏名', '') || '').trim();
    if (!me) return;
    const docs = (types || []).map(t => t.code).filter(c => c === 'keiyaku' || c === 'juyo');
    const use = docs.length ? docs : ['keiyaku', 'juyo'];
    await sb('rpc/leo_doc_issue', { method: 'POST', body: JSON.stringify({ p_child_name: child, p_guardian_name: guardian, p_docs: use, p_explainer: me, p_guardian_relation: p.guardian_relation || null, p_guardian_address: p.guardian_address || null, p_contract_start: p.contract_start || null, p_contract_end: p.contract_end || null }) });
    if (typeof renderLeoView === 'function') renderLeoView('shokai');
  } catch (e) { alert(e.message); }
};

window.skPlanNew = async function (child, y, m) {
  if (!child) return;
  if (typeof planNew !== 'function') { location.hash = 'leo/plan'; return; }
  await planNew(child, 1, y, m, { view: 'shokai' });
};
window.skPlanFill = async function (planId) {
  if (!planId) return;
  if (typeof planFillFromAssess !== 'function') { location.hash = 'leo/plan'; return; }
  await planFillFromAssess(planId, { view: 'shokai' });
};
window.skPlanMade = async function (planId) {
  if (!planId) return;
  if (DEMO) { if (typeof renderLeoView === 'function') renderLeoView('shokai'); return; }
  try {
    await sb(`leo_plans?id=eq.${planId}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ plan_made: true }) });
    if (typeof renderLeoView === 'function') renderLeoView('shokai');
  } catch (e) { alert(e.message); }
};
window.skDouiLink = async function (planId, doc, child) {
  if (!planId || !doc) return;
  if (DEMO) {
    SK_DEMO.issued.doui = SK_DEMO.issued.doui || [];
    SK_DEMO.issued.doui.push({ plan_id: planId, doc, child: child || '', token: (doc === '原案' ? 'd' : 'e').repeat(48) });
    if (typeof renderLeoView === 'function') renderLeoView('shokai');
    return;
  }
  try {
    await sb('rpc/leo_make_token_link', { method: 'POST', body: JSON.stringify({ p_kind: 'doui', p_child: child || '', p_term: '', p_plan: planId, p_doc: doc }) });
    if (typeof renderLeoView === 'function') renderLeoView('shokai');
  } catch (e) { alert(e.message); }
};

LEO_VIEWS.shokai = async function () {
  const back = `<button class="back" onclick="location.hash='leo'">← レオへ</button>`;
  if (typeof canManage === 'function' && !canManage()) {
    return back + '<p>この画面は児発管・事務・管理者だけが使えます。</p>';
  }
  const todayJ = typeof today === 'function' ? today() : new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
  const now = Date.now();
  let kids = [], infos = [], parties = [], logs = [], types = [], kataRows = [], evs = [];
  let jogan = [], afLinks = [], afSubs = [], assessRows = [], monLinks = [], monAns = [], plans = [], docLinks = [], sends = [], clinks = [];
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
    plans = [{ id: 101, child: '児童A', term_no: 1, start_on: '2026-11-12', end_on: '2027-04-30', genan: '', honan: '', assessment: '', kaigi: '', plan_made: false, genan_consent_at: null, honan_consent_at: null }];
    clinks = (SK_DEMO.issued.doui || []).map(x => ({ token: x.token, plan_id: x.plan_id, doc: x.doc, used_at: null, expires_at: '2099-01-01T00:00:00+09:00' }));
    docLinks = [{ token: '2'.repeat(48), party_id: 1, used_at: null, expires_at: '2099-01-01T00:00:00+09:00' }];
    sends = SK_DEMO.sends.slice();
    if (SK_DEMO.issued.assess) afLinks = afLinks.concat([{ child: SK_DEMO.issued.assess.child, token: SK_DEMO.issued.assess.token }]);
    if (SK_DEMO.issued.mon) monLinks = monLinks.concat([{ child: SK_DEMO.issued.mon.child, term: SK_DEMO.issued.mon.term, token: SK_DEMO.issued.mon.token }]);
    if (SK_DEMO.issued.doc) docLinks = docLinks.concat([{ token: SK_DEMO.issued.doc.token, party_id: SK_DEMO.issued.doc.party_id || 1, used_at: null, expires_at: '2099-01-01T00:00:00+09:00' }]);
  } else {
    try {
      [kids, infos, parties, logs, types, kataRows, evs, jogan, afLinks, afSubs, assessRows, monLinks, monAns, plans, docLinks, sends, clinks] = await Promise.all([
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
        sb('leo_plans?select=id,child,term_no,assessment,genan,honan,kaigi,plan_made,genan_consent_at,honan_consent_at&order=term_no').catch(() => []),
        sb('leo_doc_links?select=token,party_id,docs,created_at,expires_at,used_at').catch(() => []),
        sb('leo_link_sends?select=id,kind,child,term,token,url,via,sent_at,doc,plan_id&order=sent_at').catch(() => []),
        sb('leo_plan_consent_links?select=token,plan_id,doc,used_at,expires_at,created_at&order=link_id').catch(() => [])
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
  const hasAssessDoc = !!(plan && String(plan.assessment || '').trim());
  const hasKaigi = !!(plan && String(plan.kaigi || '').trim());
  const planEmpty = !!(plan && !hasGenan && !hasHonan && !hasAssessDoc && !hasKaigi);
  const liveC = (kindDoc) => (clinks || []).filter(l => plan && l.plan_id === plan.id && l.doc === kindDoc && !l.used_at && (!l.expires_at || new Date(l.expires_at).getTime() > now)).pop();
  const genanLink = liveC('原案'), honanLink = liveC('本案');
  const genanUrl = genanLink ? `${skPubUrl('hogosha.html')}?k=doui&t=${genanLink.token}` : '';
  const honanUrl = honanLink ? `${skPubUrl('hogosha.html')}?k=doui&t=${honanLink.token}` : '';
  const startIso = (kid && kid.first_date) || start || (plan && plan.start_on) || '';
  const startY = startIso ? +String(startIso).slice(0, 4) : 0, startM = startIso ? +String(startIso).slice(5, 7) : 0;
  const liveDoc = (docLinks || []).filter(l => party && l.party_id === party.id && !l.used_at && l.expires_at && new Date(l.expires_at).getTime() > now).pop();
  const assessUrl = afLink ? `${skPubUrl('assess.html')}?t=${afLink.token}` : '';
  const monUrl = monLink ? `${skPubUrl('hogosha.html')}?k=mon&t=${monLink.token}` : '';
  const docUrl = liveDoc ? `${skPubUrl('leo_contract_sign.html')}?t=${liveDoc.token}` : '';

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
    <p><a href="#leo/kata">送迎 型表を開く</a>　<a href="#leo/sougei">送迎を開く</a></p></div>`;

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
    ${docUrl ? skLineBox('sk_msg_doc', 'doc', sel, '', liveDoc.token, docUrl, skLastLineSend(sends, 'doc', sel)) : ''}
    ${!docUrl && sel && !allSigned ? `<p><button type="button" onclick="skDocLink('${skArg(sel)}')">署名リンクを発行</button></p>` : ''}
    ${!docUrl && allSigned ? '<p class="note">署名済みのため、新しい署名リンクは出していません。</p>' : ''}
    <p class="note">署名リンクの発行、署名の状況、署名済み書類の閲覧・印刷、契約期間の入力は、既存の契約画面でも行えます。発行済みのリンクがあれば、上の案内をコピーして公式LINEで送ってください（ポータルからは送りません）。</p>
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

  const assessAnsTxt = assessAnswered
    ? (afSub ? '回答済み（' + skWhen(afSub.created_at) + (afSub.status === 'applied' || hasAssessData ? '・利用者情報に反映済み' : '・まだ反映前') + '）' : 'アセスメントのデータあり')
    : 'まだ回答がありません';
  const step6 = `<div class="card"><h4>⑥ アセスメント</h4>
    <p>${skSt(assessIssued, 'リンクを発行済み', 'リンクはまだ発行していません')}</p>
    <p>${skSt(assessAnswered, assessAnsTxt, 'まだ回答がありません')}</p>
    ${assessUrl ? skLineBox('sk_msg_assess', 'assess', sel, '', afLink.token, assessUrl, skLastLineSend(sends, 'assess', sel)) : ''}
    ${!assessUrl && sel ? `<p><button type="button" onclick="skAssessLink('${skArg(sel)}')">アセスメントのリンクを発行</button></p>` : ''}
    <p class="note">発行と回答の判定は、アセスメント画面と同じ token 方式（leo_af_links / leo_af_subs、反映後は leo_child_assess）です。発行済みなら、上の案内をコピーして公式LINEで送ってください（ポータルからは送りません）。</p>
    <p><a href="#leo/assess">アセスメント画面を開く</a></p></div>`;

  const monAnsTxt = monAnswered
    ? '回答済み（' + skWhen((monAns.find(a => a.token === monLink.token) || {}).submitted_at) + '）'
    : 'まだ回答がありません';
  const step7 = `<div class="card"><h4>⑦ 個別支援計画の保護者アンケート</h4>
    <p>${skSt(!!monLink, 'リンクを発行済み（' + (monLink && monLink.term ? monLink.term : monTerm) + '）', 'リンクはまだ発行していません（' + monTerm + '）')}</p>
    <p>${skSt(monAnswered, monAnsTxt, 'まだ回答がありません')}</p>
    ${monUrl ? skLineBox('sk_msg_mon', 'mon', sel, monLink && monLink.term || monTerm, monLink.token, monUrl, skLastLineSend(sends, 'mon', sel, s => !monLink || s.term === monLink.term || s.token === monLink.token)) : ''}
    ${!monUrl && sel ? `<p><button type="button" onclick="skMonLink('${skArg(sel)}','${skArg(monTerm)}')">保護者アンケートのリンクを発行</button></p>` : ''}
    <p class="note">既存の仕組み（個別支援計画の画面と同じ。leo_mon_links / leo_mon_answers、保護者ページ hogosha.html）。Googleフォームは使いません。発行済みなら、上の案内をコピーして公式LINEで送ってください（ポータルからは送りません）。</p>
    <p><a href="#leo/plan">個別支援計画（管理）を開く</a></p></div>`;

  const planHead = plan ? `第${plan.term_no}期` : 'まだ計画行がありません';
  const planCreateBtn = !plan
    ? (assessAnswered && startY && sel ? `<p><button type="button" onclick="skPlanNew('${skArg(sel)}',${startY},${startM})">アセスメントから第1期の計画書を作る</button></p>`
      : '<p class="note">⑥のアセスメントの返事が届いてから、ここから計画書（原案・本案）を作れます。</p>')
    : (planEmpty
      ? (assessAnswered && plan.id ? `<p><button type="button" onclick="skPlanFill(${plan.id})">アセスメントから本文を入れる</button></p>`
        : '<p class="note">⑥のアセスメントの返事が届いてから、ここから計画書の本文を入れられます。</p>')
      : '');
  const planEditBtns = plan && plan.id ? `<p><button type="button" onclick="typeof planEdit==='function'?planEdit(${plan.id}):(location.hash='leo/plan')">書類を開いて直す</button> <button type="button" onclick="typeof planPrint==='function'?planPrint(${plan.id}):null">印刷する</button></p>` : '';
  const planMadeBtn = plan && plan.id && hasGenan && hasHonan && !planMade ? `<p><button type="button" onclick="skPlanMade(${plan.id})">確認した（計画書作成＝済）</button></p>` : '';
  const genanBtn = plan && plan.id && planMade && !genanOk && !genanUrl ? `<p><button type="button" onclick="skDouiLink(${plan.id},'原案','${skArg(sel)}')">原案の同意リンクを発行</button></p>` : '';
  const honanBtn = plan && plan.id && genanOk && !honanOk && !honanUrl ? `<p><button type="button" onclick="skDouiLink(${plan.id},'本案','${skArg(sel)}')">本案の同意リンクを発行</button></p>` : '';
  const termLabel = plan ? `第${plan.term_no}期` : '第1期';
  const genanBox = genanUrl ? skLineBox('sk_msg_genan', 'doui', sel, termLabel, genanLink.token, genanUrl, skLastLineSend(sends, 'doui', sel, s => s.doc === '原案' || s.token === genanLink.token), '原案') : '';
  const honanBox = honanUrl ? skLineBox('sk_msg_honan', 'doui', sel, termLabel, honanLink.token, honanUrl, skLastLineSend(sends, 'doui', sel, s => s.doc === '本案' || s.token === honanLink.token), '本案') : '';
  const copies = (honanOk && !DEMO && typeof dvCell === 'function' && dvCell('レオ', sel, sel))
    ? `<p class="note">本案の同意が済んでいます。保護者は書類の控えページで、いつでも本案を見られます。</p>${dvCell('レオ', sel, sel)}` : '';
  const step8 = `<div class="card"><h4>⑦ 個別支援計画（原案・本案・同意）</h4>
    <p>対象：${esc(planHead)}</p>
    <p>${skSt(hasGenan, '原案の本文あり', '原案はまだありません')}</p>
    <p>${skSt(hasHonan, '本案の本文あり', '本案はまだありません')}</p>
    <p>${skSt(planMade, '計画書作成＝済', '計画書作成はまだ未')}</p>
    <p>${skSt(genanOk, '原案の同意済み（' + skWhen(plan && plan.genan_consent_at) + '）', '原案の同意はまだです')}</p>
    <p>${skSt(honanOk, '本案の同意済み（' + skWhen(plan && plan.honan_consent_at) + '）', '本案の同意はまだです')}</p>
    <p class="note">初回の計画は⑥アセスメント（保護者の願い6領域を含む）から、この画面で作ります。保護者アンケートは2回目以降の見直し用なので、ここでは出しません。作った書類は確認して「計画書作成＝済」にしたあと、同意リンクをコピーして公式LINEで送ってください（ポータルからは送りません）。判定は leo_plans の本文（genan / honan）、plan_made、genan_consent_at / honan_consent_at です。</p>
    ${planCreateBtn}${planEditBtns}${planMadeBtn}${genanBtn}${genanBox}${honanBtn}${honanBox}${copies}
    <p><a href="#leo/plan">個別支援計画（管理）を開く</a></p></div>`;

  return `${back}<h3>🚪 初回利用</h3>${typeof demoNote === 'function' ? demoNote() : ''}
    <p class="note">新しい児童の手続きを、この画面で順に確認します。各項目はいまの登録内容で判定します。⑥アセスメント・③契約の署名リンク・⑦の同意リンクは、発行済みなら案内文とURLを最初から出します。コピーして公式LINEの1対1トークに貼って送ってください（ポータルからは送りません）。送ったら「LINEで送った」を押すと記録します。公式LINEの友だち追加は手でチェックします。</p>
    ${pick}${sel ? step1 + step2 + step3 + step4 + step5 + step6 + step8 : ''}`;
};
