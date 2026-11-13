// レオ 初回利用（#leo/shokai）：新しい児童の手続きを、いまの登録・署名の実データで確認する
// ①利用者情報 ②型表と予定 ③契約書・重要事項 ④公式LINE友だち追加
// ③の署名済みは leo_doc_log（保護者署名・紙で署名済み）。公式LINEの友だち追加は判定データが無いので手でチェック。
const SK_LINE_QR = 'img/leo-line-qr.png';
// 友だち追加URLは、齊藤さんから届いたQRを読めたときだけ入れる。推測では入れない。
const SK_LINE_ADD_URL = '';
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

LEO_VIEWS.shokai = async function () {
  const back = `<button class="back" onclick="location.hash='leo'">← レオへ</button>`;
  if (typeof canManage === 'function' && !canManage()) {
    return back + '<p>この画面は児発管・事務・管理者だけが使えます。</p>';
  }
  const todayJ = typeof today === 'function' ? today() : new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
  let kids = [], infos = [], parties = [], logs = [], types = [], kataRows = [], evs = [];
  if (DEMO) {
    kids = [{ name: '児童A', jukyusha_no: '0123456789', contract_start: '2026-11-12', contract_end: '2027-04-30' }];
    infos = [{ name: '児童A', guardian_name: '見本 花子' }];
    parties = [{ id: 1, child_name: '児童A', guardian_name: '見本 花子', contract_start: '2026-11-12', contract_end: '2027-04-30' }];
    logs = [{ party_id: 1, doc_code: 'keiyaku', method: '保護者', signed_on: '2026-11-12', signed_at: '2026-11-12T07:41:00+00:00' }];
    types = [{ code: 'keiyaku', label: '利用契約書' }, { code: 'juyo', label: '重要事項説明書' }];
    kataRows = [{ '児童名': '児童A', '曜日': '月' }];
    evs = [{ day: '2026-11-16', kind: '利用', child: '児童A', source: 'kata' }];
  } else {
    try {
      [kids, infos, parties, logs, types, kataRows, evs] = await Promise.all([
        sb('leo_children?select=name,jukyusha_no,contract_start,contract_end,first_date&order=name').catch(() => []),
        sb('leo_child_info?select=name,guardian_name').catch(() => []),
        sb('leo_doc_party?select=id,child_name,guardian_name,guardian_relation,guardian_address,contract_start,contract_end&order=child_name').catch(() => []),
        sb('leo_doc_log?select=id,party_id,doc_code,method,signed_on,signed_at,agent_name,agent_relation,reason&order=signed_at').catch(() => []),
        sb('leo_doc_type?select=code,label,version&order=sort').catch(() => []),
        (typeof sheetRows === 'function' ? sheetRows('kata') : sb('leo_master?kind=eq.kata&select=data&order=row_no').then(rs => (rs || []).map(r => r.data))).catch(() => []),
        sb(`leo_events?day=gte.${todayJ}&kind=eq.利用&select=day,kind,child,kids,source`).catch(() => [])
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
    ${sel ? `<p><label><input type="checkbox" ${lineOk ? 'checked' : ''} onchange="skToggleLine('${esc(sel).replace(/'/g, '')}')"> 友だち追加を確認した（手チェック）</label></p>
    <p>${skSt(lineOk, '確認済み（手チェック）', 'まだ確認していません')}</p>` : ''}
    </div>`;

  return `${back}<h3>🚪 初回利用</h3>${typeof demoNote === 'function' ? demoNote() : ''}
    <p class="note">新しい児童の手続きを、この画面で順に確認します。各項目はいまの登録内容で判定します（③の署名は契約書の署名記録）。公式LINEの友だち追加だけ、手でチェックします。</p>
    ${pick}${sel ? step1 + step2 + step3 + step4 : ''}`;
};
