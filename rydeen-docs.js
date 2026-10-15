// RYDEEN: 利用契約書・重要事項説明書の電子署名 / 個別支援計画（アセスメント→原案→会議録→本案→署名）
// 署名・版履歴の表は追記専用（DBのトリガーで更新・削除不可）。署名の SHA-256 は署名時に保存し、表示時に再計算して改ざんを検知する。
const RY_CST = { draft: '下書き', explained: '説明済・署名待ち', signed: '署名済', superseded: '旧版(新版あり)' };
const ryP = k => document.getElementById(k);

// ================= 契約・重説 =================
RV.contracts = async () => {
  await ryLib();
  const id = RYD.st.contract; if (id) return ryContractPage(id);
  const tid = RYD.st.ctpl; if (tid) return ryTemplatePage(tid);
  const [templates, list] = await Promise.all([rb('bp_contract_templates?select=id,kind,title,version,updated_at&order=kind'), rb('bp_contracts?select=id,title,status,version,worker_id,signed_at,created_at&order=created_at.desc')]);
  const wid = RYD.st.cworker || (RYD.workers[0] || {}).id;
  const priv = wid ? (await rb(`bp_worker_private?user_id=eq.${wid}&select=recipient_number,address`))[0] || {} : {};
  const init = { 利用者氏名: RYD.wname[wid] || '', 利用者住所: priv.address || '', 受給者証番号: priv.recipient_number || '', 契約開始日: '', 契約終了日: '' };
  ryAdminFrame('contracts', `<h3>利用契約書・重要事項説明書（電子署名）</h3><p class="note">事業所情報の空欄は「【要確認】」と表示されます。テンプレートで補ってください。</p>
    <div class="card"><h4>テンプレート（事業所情報・文面）</h4>${templates.length ? `<ul>${templates.map(t => `<li><a href="#rydeen/contracts" onclick="RYD.st.ctpl='${t.id}';renderRydeen('contracts');return false">${ryEsc(t.title)}</a> <small>（第${t.version}版・${ryDT(t.updated_at)}更新）</small></li>`).join('')}</ul>`
      : `<p>まだありません。標準の文面（運営規程をもとにした雛形）から作れます。</p><button class="sec inl" onclick="ryMakeTemplates()">標準テンプレートを作成</button>`}</div>
    <div class="card"><h4>利用者への文書を作成</h4><div class="row"><div><label class="l">利用者</label>${ryWorkerSelect('c_w', wid)}</div><div style="align-self:end"><button class="sec" onclick="RYD.st.cworker=ryV('c_w');renderRydeen('contracts')">利用者を選ぶ</button></div></div>
    <div class="row"><div><label class="l">文書</label><select id="c_t">${templates.map(t => `<option value="${t.id}">${ryEsc(t.title)}</option>`).join('')}</select></div>${RydLib.WORKER_FIELDS.map(k => ryInp('cf_' + k, k, init[k], 'text', k.startsWith('契約') ? 'placeholder="例: 令和8年11月1日"' : '')).join('')}</div>
    <button onclick="ryCreateContract()">作成する</button></div>
    <div class="card"><h4>作成済みの文書</h4><table class="tbl"><tr><th>利用者</th><th>文書</th><th>版</th><th>状態</th><th>署名日時</th></tr>${list.map(c => `<tr><td>${ryEsc(RYD.wname[c.worker_id] || '')}</td><td><a href="#rydeen/contracts" onclick="RYD.st.contract='${c.id}';renderRydeen('contracts');return false">${ryEsc(c.title)}</a></td><td>第${c.version}版</td><td>${RY_CST[c.status]}</td><td>${ryDT(c.signed_at)}</td></tr>`).join('')}</table>${list.length ? '' : '<p>まだありません。</p>'}</div>`);
};
async function ryMakeTemplates() { ryGo(async () => { const o = Object.fromEntries(RydLib.OFFICE_FIELDS);
  await rIns('bp_contract_templates', [{ kind: 'contract', title: '利用契約書', body: RydLib.CONTRACT_BODY, office_info: o, version: 1 }, { kind: 'explanation', title: '重要事項説明書', body: RydLib.EXPLAIN_BODY, office_info: o, version: 1 }]); await renderRydeen('contracts'); }); }
async function ryTemplatePage(id) {
  const t = (await rb(`bp_contract_templates?id=eq.${id}`))[0]; if (!t) { RYD.st.ctpl = null; return RV.contracts('contracts'); }
  ryAdminFrame('contracts', `<button class="back" onclick="RYD.st.ctpl=null;renderRydeen('contracts')">← 戻る</button><h3>テンプレート編集：${ryEsc(t.title)}（現在 第${t.version}版）</h3>
    <p class="note">保存すると版が上がります。既に作成・署名済みの文書は変わりません（作成時点の本文を保存しているため）。本文中の {{項目名}} が差し込み項目です。空欄の事業所情報は「【要確認】」と表示されます。</p>
    <div class="card"><h4>事業所情報（差し込み値）</h4><div class="row">${Object.entries(t.office_info || {}).map(([k, v], i) => ryInp('to_' + i, ryEsc(k) + (v ? '' : '（要確認）'), v)).join('')}</div></div>
    <div class="card">${ryInp('tt_title', '題名', t.title)}<label class="l">本文（利用者項目: {{利用者氏名}} {{利用者住所}} {{契約開始日}} {{契約終了日}} {{受給者証番号}}）</label><textarea id="tt_body" style="min-height:420px;font-family:monospace;font-size:14px">${ryEsc(t.body)}</textarea></div>
    <button onclick="rySaveTemplate('${id}')">保存（新しい版にする）</button>`);
  RYD.st.tkeys = Object.keys(t.office_info || {}); RYD.st.tcur = t;
}
async function rySaveTemplate(id) { ryGo(async () => { const t = RYD.st.tcur, info = {}; RYD.st.tkeys.forEach((k, i) => { info[k] = ryV('to_' + i).trim(); });
  await rUpd('bp_contract_templates', 'id=eq.' + id, { title: ryV('tt_title').trim(), body: ryV('tt_body'), office_info: info, version: t.version + 1, updated_at: await ryNow() }); RYD.st.ctpl = null; await renderRydeen('contracts'); }); }
async function ryBuildContract(tid, fields) {
  const t = (await rb(`bp_contract_templates?id=eq.${tid}`))[0]; if (!t) throw new Error('テンプレートがありません');
  const rendered_body = RydLib.renderBody(t.body, { ...t.office_info, ...fields });
  return { t, fields, rendered_body, title: t.title, content_hash: await RydLib.hashContent(t.title, rendered_body, fields) };
}
const ryWFields = (prefix, cur) => { const f = {}; RydLib.WORKER_FIELDS.forEach(k => { f[k] = ryV(prefix + k).trim(); }); return f; };
async function ryCreateContract() { ryGo(async () => {
  const wid = ryV('c_w'), tid = ryV('c_t'); if (!wid || !tid) throw new Error('利用者と文書を選んでください');
  const b = await ryBuildContract(tid, ryWFields('cf_'));
  const row = (await rIns('bp_contracts', { worker_id: wid, template_id: tid, kind: b.t.kind, template_version: b.t.version, title: b.title, rendered_body: b.rendered_body, fields: b.fields, content_hash: b.content_hash, status: 'draft', version: 1, supersedes_id: null, created_by: RYD.me.uid }, true))[0];
  RYD.st.contract = row.id; await renderRydeen('contracts'); }); }
async function ryContractPage(id) {
  const c = (await rb(`bp_contracts?id=eq.${id}`))[0]; if (!c) { RYD.st.contract = null; return RV.contracts('contracts'); }
  const sigs = await rb(`bp_contract_signatures?contract_id=eq.${id}&order=signed_at`), sig = sigs[0];
  const intact = (await RydLib.hashContent(c.title, c.rendered_body, c.fields)) === c.content_hash;
  const nav = `<button class="back noprint" onclick="RYD.st.contract=null;renderRydeen('contracts')">← 一覧</button>`;
  if (RYD.st.cprint) return ryShow(`<div class="ry">${nav}<button class="noprint" onclick="window.print()">印刷／PDFにする</button><button class="sec noprint" onclick="RYD.st.cprint=false;renderRydeen('contracts')">戻る</button>
    <h3>${ryEsc(c.title)}（第${c.version}版）${c.status === 'superseded' ? '【旧版】' : ''}</h3><div class="pre" style="font-size:15px">${ryEsc(c.rendered_body)}</div><hr>${sig ? `<div style="font-size:13px"><p><b>電子署名の記録</b></p><p>署名日時：${ryDT(sig.signed_at)} ／ 署名者：利用者本人</p><p>説明した職員：${ryEsc(sig.explained_by_name)}（${ryDT(sig.explained_at)}）</p><img class="sg" src="${sig.signature_data}" alt="署名"><p class="mono">文書ハッシュ(SHA-256)：${sig.content_hash}</p><p>内容の一致：${intact && sig.content_hash === c.content_hash ? '署名時から変更なし' : '不一致'}</p></div>` : '<p style="color:#b00"><b>【未署名】この書面は署名前の下書きです。</b></p>'}</div>`);
  ryAdminFrame('contracts', `${nav}<h3>${ryEsc(c.title)}（第${c.version}版）— ${ryEsc(RYD.wname[c.worker_id] || '')}</h3><p>状態：<b>${RY_CST[c.status]}</b>${c.supersedes_id ? ` ／ <a href="#rydeen/contracts" onclick="RYD.st.contract='${c.supersedes_id}';renderRydeen('contracts');return false">前の版</a>（変更理由：${ryEsc(c.revision_reason)}）` : ''} ／ <a href="#rydeen/contracts" onclick="RYD.st.cprint=true;renderRydeen('contracts');return false">印刷用ページ（PDF保存可）</a></p>
    <div class="card pre" style="max-height:28rem;overflow:auto">${ryEsc(c.rendered_body)}</div>
    <div class="card"><h4>① 説明の実施記録</h4>${c.explained_at ? `<p>説明した職員：<b>${ryEsc(c.explained_by_name)}</b> ／ 日時：${ryDT(c.explained_at)}（サーバー時刻）／ 方法：${ryEsc(c.explain_method)} ${c.explain_note ? '／ ' + ryEsc(c.explain_note) : ''}</p>` : ''}
    ${c.status === 'draft' || c.status === 'explained' ? `<div class="row"><div><label class="l">説明の方法</label><select id="ce_m"><option>対面</option><option>オンライン</option></select></div>${ryInp('ce_n', 'メモ（任意）', '')}</div><button onclick="ryExplain('${id}')">${c.explained_at ? '説明を記録し直す（職員・日時を更新）' : '説明した、と記録する（ログイン中の職員・現在時刻）'}</button>` : ''}</div>
    ${c.status === 'explained' ? `<div class="card"><h4>② 利用者の確認と署名（端末を利用者に渡してください）</h4>${RydLib.CONSENT_ITEMS.map((t, i) => `<label style="display:block;font-size:18px;margin:8px 0"><input type="checkbox" id="cc_${i}"> ${t}</label>`).join('')}${ryPad('cs_sig')}<button onclick="rySignContract('${id}')">同意して署名する</button></div>` : ''}
    ${sig ? `<div class="card"><h4>同意の証跡（追記専用）</h4><table class="tbl"><tr><th>署名日時</th><td>${ryDT(sig.signed_at)}（サーバー時刻）</td></tr><tr><th>説明した職員・日時</th><td>${ryEsc(sig.explained_by_name)} ／ ${ryDT(sig.explained_at)}</td></tr><tr><th>署名者</th><td>利用者本人（代理署名は未対応・要確認）</td></tr><tr><th>文書ハッシュ(SHA-256)</th><td class="mono">${sig.content_hash}</td></tr><tr><th>内容の一致</th><td>${intact && sig.content_hash === c.content_hash ? '✔ 署名時から変更なし' : '✘ 署名時と一致しません'}</td></tr><tr><th>確認項目</th><td>${(sig.consent_items || []).map(x => `<div>${x.checked ? '☑' : '☐'} ${ryEsc(x.text)}</div>`).join('')}</td></tr><tr><th>署名</th><td><img class="sg" src="${sig.signature_data}" alt="署名"></td></tr></table></div>` : ''}
    ${c.status === 'signed' ? `<div class="card"><h4>内容を変更する（新版を作成。再度 説明→署名 が必要）</h4><div class="row">${RydLib.WORKER_FIELDS.map(k => ryInp('rf_' + k, k, (c.fields || {})[k] || '')).join('')}</div><label class="l">変更理由（必須）</label><textarea id="rv_reason"></textarea><button class="sec" onclick="ryReviseContract('${id}')">新版を作る</button></div>` : ''}
    ${c.status === 'draft' || c.status === 'explained' ? `<button class="del" onclick="ryDelContract('${id}')">この下書きを削除</button>` : ''}`);
}
async function ryExplain(id) { ryGo(async () => { const c = (await rb(`bp_contracts?id=eq.${id}&select=status`))[0]; if (!c || !['draft', 'explained'].includes(c.status)) throw new Error('この状態では説明記録できません');
  await rUpd('bp_contracts', 'id=eq.' + id, { status: 'explained', explained_by: RYD.me.uid, explained_by_name: RYD.me.name, explained_at: await ryNow(), explain_method: ryV('ce_m') || '対面', explain_note: ryV('ce_n') }); await renderRydeen('contracts'); }); }
// 署名: 追記専用の contract_signatures に1行追加 → 契約行を signed に（以後、内容変更不可）
async function rySignContract(id) { ryGo(async () => {
  const c = (await rb(`bp_contracts?id=eq.${id}`))[0]; if (!c || c.status !== 'explained') throw new Error('先に説明の記録が必要です');
  const sig = ryPadData('cs_sig'); if (!sig) throw new Error('署名してください');
  const agreed = RydLib.CONSENT_ITEMS.map((_, i) => ryC('cc_' + i)); if (!agreed.every(Boolean)) throw new Error('すべての確認項目にチェックしてください');
  const hash = await RydLib.hashContent(c.title, c.rendered_body, c.fields); if (hash !== c.content_hash) throw new Error('文書内容が変更されています');
  const at = await ryNow();
  await rIns('bp_contract_signatures', { contract_id: id, worker_id: c.worker_id, signed_at: at, content_hash: hash, signature_data: sig, consent_items: RydLib.CONSENT_ITEMS.map((t, i) => ({ text: t, checked: agreed[i] })), signer_kind: 'self', witness_staff_id: RYD.me.uid, explained_at: c.explained_at, explained_by_name: c.explained_by_name });
  await rUpd('bp_contracts', 'id=eq.' + id, { status: 'signed', signed_at: at }); await renderRydeen('contracts'); ryMsg('署名を記録しました。', true); }); }
async function ryReviseContract(id) { ryGo(async () => {
  const old = (await rb(`bp_contracts?id=eq.${id}`))[0]; if (!old || old.status !== 'signed') throw new Error('署名済みの文書のみ新版を作れます');
  const reason = ryV('rv_reason').trim(); if (!reason) throw new Error('変更理由が必要です');
  const b = await ryBuildContract(old.template_id, ryWFields('rf_'));
  const row = (await rIns('bp_contracts', { worker_id: old.worker_id, template_id: old.template_id, kind: old.kind, template_version: b.t.version, title: b.title, rendered_body: b.rendered_body, fields: b.fields, content_hash: b.content_hash, status: 'draft', version: old.version + 1, supersedes_id: old.id, revision_reason: reason, created_by: RYD.me.uid }, true))[0];
  await rUpd('bp_contracts', 'id=eq.' + id, { status: 'superseded' }); RYD.st.contract = row.id; await renderRydeen('contracts'); }); }
async function ryDelContract(id) { if (!confirm('この下書きを削除しますか？')) return; ryGo(async () => { const c = (await rb(`bp_contracts?id=eq.${id}&select=status`))[0]; if (c && ['draft', 'explained'].includes(c.status)) await rDel('bp_contracts', 'id=eq.' + id); RYD.st.contract = null; await renderRydeen('contracts'); }); }

// ================= 個別支援計画 =================
const RY_NEXT = { assessment: '②計画原案へ進む', draft: '③会議録へ進む', meeting: '④本案として確定する(内容を固定)' };
RV.plans = async () => {
  await ryLib();
  const id = RYD.st.plan; if (id) return ryPlanPage(id);
  const list = await rb('bp_support_plans?select=id,version,stage,signed_at,created_at,content,worker_id&order=created_at.desc'), def = RydLib.defaultPeriod();
  ryAdminFrame('plans', `<h3>個別支援計画</h3><p class="note">流れ：①アセスメント → ②計画原案 → ③会議録 → ④本案(確定) → 利用者・家族の電子署名。作成時に業務日誌・日報から直近約3か月の集計とモニタリング材料を自動で挿入します（外部AIは使いません）。</p>
    <div class="card"><h4>新しい計画を作る</h4><div class="row"><div><label class="l">利用者</label>${ryWorkerSelect('p_w', '')}</div>${ryInp('p_s', '計画期間 開始', def.start, 'date')}${ryInp('p_e', '終了', def.end, 'date')}</div><button onclick="ryCreatePlan()">作成して集計を取り込む</button></div>
    <div class="card"><h4>計画一覧</h4><table class="tbl"><tr><th>利用者</th><th>期間</th><th>版</th><th>段階</th><th>署名日時</th></tr>${list.map(p => `<tr><td>${ryEsc(RYD.wname[p.worker_id] || '')}</td><td>${ryEsc(p.content?.period?.start)}〜${ryEsc(p.content?.period?.end)}</td><td>第${p.version}版</td><td><a href="#rydeen/plans" onclick="RYD.st.plan='${p.id}';renderRydeen('plans');return false">${RydLib.STAGE_LABEL[p.stage]}</a></td><td>${ryDT(p.signed_at)}</td></tr>`).join('')}</table>${list.length ? '' : '<p>まだありません。</p>'}</div>`);
};
const ryPlanData = async wid => { const w = RydLib.previousWindow(); const [j, r] = await Promise.all([rb(`bp_journal?worker_id=eq.${wid}&journal_date=gte.${w.from}&journal_date=lte.${w.to}&select=*`), rb(`bp_daily_reports?worker_id=eq.${wid}&select=report_date,condition,work_content,reflection`)]); return RydLib.buildSummary(j, w.from, w.to, r); };
async function ryAddRevision(plan, content, stage, note) {
  const last = await rb(`bp_support_plan_revisions?plan_id=eq.${plan.id}&select=rev_no&order=rev_no.desc&limit=1`);
  await rIns('bp_support_plan_revisions', { plan_id: plan.id, rev_no: (last[0]?.rev_no ?? 0) + 1, stage, content, note, saved_by: RYD.me.uid, saved_by_name: RYD.me.name, saved_at: await ryNow() }); }
async function ryCreatePlan() { ryGo(async () => {
  const wid = ryV('p_w'); if (!wid) throw new Error('利用者を選んでください'); const def = RydLib.defaultPeriod(), D = /^\d{4}-\d{2}-\d{2}$/;
  const start = D.test(ryV('p_s')) ? ryV('p_s') : def.start, end = D.test(ryV('p_e')) ? ryV('p_e') : def.end;
  const content = RydLib.emptyContent(start, end, await ryPlanData(wid));
  const row = (await rIns('bp_support_plans', { worker_id: wid, version: 1, stage: 'assessment', content, content_hash: null, supersedes_id: null, created_by: RYD.me.uid }, true))[0];
  await ryAddRevision(row, content, 'assessment', '新規作成(集計を自動挿入)'); RYD.st.plan = row.id; await renderRydeen('plans'); }); }
const ryReadPlan = old => { const c = JSON.parse(JSON.stringify(old)); for (const sec of RydLib.SECTIONS) sec.fields.forEach((f, i) => { const e = ryP(`pf_${sec.key}_${i}`); if (e) c[sec.key][f] = e.value; });
  if (ryP('pf_start') && ryV('pf_start')) c.period.start = ryV('pf_start'); if (ryP('pf_end') && ryV('pf_end')) c.period.end = ryV('pf_end'); return c; };
async function ryPlanPage(id) {
  const p = (await rb(`bp_support_plans?id=eq.${id}`))[0]; if (!p) { RYD.st.plan = null; return RV.plans('plans'); }
  const [revs, sigs] = await Promise.all([rb(`bp_support_plan_revisions?plan_id=eq.${id}&select=rev_no,stage,note,saved_by_name,saved_at&order=rev_no.desc`), rb(`bp_support_plan_signatures?plan_id=eq.${id}&order=signed_at`)]);
  RYD.st.pcur = p; const self = sigs.find(x => x.signer_kind === 'self'), fam = sigs.find(x => x.signer_kind === 'family'), editable = RydLib.EDITABLE.includes(p.stage), c = p.content, sm = c.summary;
  const intact = p.content_hash ? (await RydLib.hashPlan(p.worker_id, p.version, c)) === p.content_hash : null;
  const nav = `<button class="back noprint" onclick="RYD.st.plan=null;RYD.st.pprint=false;renderRydeen('plans')">← 一覧</button>`;
  const consent = RydLib.PLAN_CONSENT.map((t, i) => `<label style="display:block;margin:6px 0"><input type="checkbox" id="pc_${i}"> ${t}</label>`).join('');
  if (RYD.st.pprint) { const off = Object.fromEntries(RydLib.OFFICE_FIELDS);
    return ryShow(`<div class="ry">${nav}<button class="noprint" onclick="window.print()">印刷／PDFにする</button><button class="sec noprint" onclick="RYD.st.pprint=false;renderRydeen('plans')">戻る</button>
    <h3>個別支援計画（第${p.version}版）${p.stage === 'superseded' ? '【旧版】' : ''}${!['final', 'signed', 'superseded'].includes(p.stage) ? '【下書き】' : ''}</h3><p style="font-size:13px">事業所：${ryEsc(off['事業所名'])}（${ryEsc(off['事業所の種類'])}）／ サービス管理責任者：${ryEsc(off['サービス管理責任者'] || ryTBD)}<br>利用者：${ryEsc(RYD.wname[p.worker_id])} ／ 計画期間：${ryEsc(c.period.start)}〜${ryEsc(c.period.end)}</p>
    ${sm ? `<h4>支援記録の要約（自動集計 ${sm.from}〜${sm.to}）</h4><p class="pre">${ryEsc(sm.text)}</p>` : ''}${RydLib.SECTIONS.map(sec => `<h4 style="border-bottom:1px solid #999">${sec.title}</h4>${sec.fields.map(f => `<p style="font-size:13px;margin:8px 0 0"><b>${f}</b></p><p class="pre">${ryEsc((c[sec.key][f] || '').trim() || ryTBD)}</p>`).join('')}`).join('')}<hr>
    ${await Promise.all(sigs.map(async x => `<div style="font-size:13px"><p><b>電子署名の記録：${x.signer_kind === 'self' ? '利用者本人' : '家族・代理人 ' + ryEsc(x.signer_name) + '（' + ryEsc(x.relationship) + '）'}</b></p><p>署名日時：${ryDT(x.signed_at)} ／ 説明・立会：${ryEsc(x.explained_by_name)}（${ryEsc(x.explain_method)}）</p><img class="sg" src="${x.signature_data}" alt="署名"><p class="mono">ハッシュ(SHA-256)：${x.content_hash}（${(await RydLib.hashPlan(p.worker_id, p.version, c)) === x.content_hash ? '署名時から変更なし' : '不一致'}）</p></div>`)).then(a => a.join('')) || ''}${sigs.length ? '' : '<p style="color:#b00"><b>【未署名】</b></p>'}</div>`); }
  ryAdminFrame('plans', `${nav}<h3>個別支援計画（第${p.version}版）— ${ryEsc(RYD.wname[p.worker_id] || '')}</h3><p>段階：<b>${RydLib.STAGE_LABEL[p.stage]}</b> ／ <a href="#rydeen/plans" onclick="RYD.st.pprint=true;renderRydeen('plans');return false">印刷用ページ（PDF保存可）</a>${p.supersedes_id ? ` ／ <a href="#rydeen/plans" onclick="RYD.st.plan='${p.supersedes_id}';renderRydeen('plans');return false">前の版</a>（理由：${ryEsc(p.revision_reason)}）` : ''}</p>
    ${sm ? `<div class="card"><h4>支援記録の要約・モニタリング材料（自動集計: ${ryDT(sm.generated_at)}／${sm.from}〜${sm.to}）</h4><p>${ryEsc(sm.text)}</p><ul>${sm.material.map(m => `<li>${ryEsc(m)}</li>`).join('')}</ul>${editable ? `<button class="sec inl" onclick="ryRefreshSummary('${id}')">最新の記録で集計し直す</button>` : ''}</div>` : ''}
    <div class="card"><div class="row">${ryInp('pf_start', '計画期間 開始', c.period.start, 'date', editable ? '' : 'disabled')}${ryInp('pf_end', '終了', c.period.end, 'date', editable ? '' : 'disabled')}</div></div>
    ${RydLib.SECTIONS.map(sec => `<div class="card"><h4>${sec.title}</h4>${sec.fields.map((f, i) => `<label class="l">${f}</label><textarea id="pf_${sec.key}_${i}" ${editable ? '' : 'disabled'} placeholder="未入力（空欄は印刷時に【要確認】）">${ryEsc(c[sec.key][f])}</textarea>`).join('')}</div>`).join('')}
    ${editable ? `<div class="card">${ryInp('pf_note', '変更メモ（版履歴に残ります）', '')}<button onclick="rySavePlan('${id}')">保存（版履歴に追加）</button> <button class="sec" onclick="ryAdvancePlan('${id}')">${RY_NEXT[p.stage]}</button></div>` : ''}
    ${p.stage === 'final' && !self ? `<div class="card"><h4>利用者本人の確認と署名（端末を本人に渡してください）</h4><label class="l">説明の方法</label><select id="ps_m"><option>対面</option><option>オンライン</option></select>${consent}${ryPad('ps_sig')}<button onclick="ryPlanSign('${id}','self')">同意して署名する</button> <button class="sec inl" onclick="ryReopenPlan('${id}')">本案の確定を取り消して編集に戻す</button></div>` : ''}
    ${(p.stage === 'final' || p.stage === 'signed') && self && !fam ? `<div class="card"><h4>家族・代理人の署名（任意）</h4><div class="row">${ryInp('pg_n', '署名者の氏名', '')}${ryInp('pg_r', '続柄', '')}${ryInp('pg_x', '代筆・代理の場合の理由（任意）', '')}</div><label class="l">説明の方法</label><select id="ps_m"><option>対面</option><option>オンライン</option></select>${consent}${ryPad('ps_sig')}<button onclick="ryPlanSign('${id}','family')">家族として署名する</button></div>` : ''}
    ${sigs.length ? `<div class="card"><h4>同意の証跡（追記専用）</h4><p>確定時ハッシュ(SHA-256)：<span class="mono">${p.content_hash}</span> ／ 内容の一致：${intact ? '✔ 確定時から変更なし' : '✘ 不一致'}</p>${sigs.map(x => `<table class="tbl" style="margin-top:8px"><tr><th>署名者</th><td>${x.signer_kind === 'self' ? '利用者本人' : '家族・代理人：' + ryEsc(x.signer_name) + '（' + ryEsc(x.relationship) + '）' + (x.proxy_note ? ' 代筆/代理理由：' + ryEsc(x.proxy_note) : '')}</td></tr><tr><th>署名日時</th><td>${ryDT(x.signed_at)}（サーバー時刻）／ 立会・説明：${ryEsc(x.explained_by_name)}（${ryEsc(x.explain_method)}）</td></tr><tr><th>確認項目</th><td>${(x.consent_items || []).map(i => `<div>${i.checked ? '☑' : '☐'} ${ryEsc(i.text)}</div>`).join('')}</td></tr><tr><th>署名</th><td><img class="sg" src="${x.signature_data}" alt="署名"></td></tr></table>`).join('')}</div>` : ''}
    ${p.stage === 'signed' ? `<div class="card"><h4>内容を変更する・次期計画を作る（新版を作成。会議→署名のやり直し）</h4><label class="l">変更理由（必須）</label><textarea id="pv_reason"></textarea><button class="sec" onclick="ryRevisePlan('${id}')">新版を作る</button></div>` : ''}
    <div class="card"><h4>版履歴（追記専用）</h4><table class="tbl"><tr><th>#</th><th>日時</th><th>段階</th><th>職員</th><th>内容</th></tr>${revs.map(r => `<tr><td>${r.rev_no}</td><td>${ryDT(r.saved_at)}</td><td>${RydLib.STAGE_LABEL[r.stage]}</td><td>${ryEsc(r.saved_by_name)}</td><td>${ryEsc(r.note)}</td></tr>`).join('')}</table></div>`);
}
const ryPlanLoad = async id => (await rb(`bp_support_plans?id=eq.${id}`))[0];
async function rySavePlan(id) { ryGo(async () => { const p = await ryPlanLoad(id); if (!RydLib.EDITABLE.includes(p.stage)) throw new Error('この状態では編集できません');
  const content = ryReadPlan(p.content); await rUpd('bp_support_plans', 'id=eq.' + id, { content, updated_at: await ryNow() }); await ryAddRevision(p, content, p.stage, ryV('pf_note').trim() || '編集'); await renderRydeen('plans'); ryMsg('保存しました（版履歴に追加）。', true); }); }
async function ryRefreshSummary(id) { ryGo(async () => { const p = await ryPlanLoad(id); if (!RydLib.EDITABLE.includes(p.stage)) throw new Error('この状態では更新できません');
  const content = { ...ryReadPlan(p.content), summary: await ryPlanData(p.worker_id) }; await rUpd('bp_support_plans', 'id=eq.' + id, { content, updated_at: await ryNow() }); await ryAddRevision(p, content, p.stage, '集計を再実行'); await renderRydeen('plans'); }); }
// 段階を進める: assessment→draft→meeting→final。final で内容を固定しハッシュを保存
async function ryAdvancePlan(id) { ryGo(async () => { const p = await ryPlanLoad(id), next = { assessment: 'draft', draft: 'meeting', meeting: 'final' }[p.stage]; if (!next) throw new Error('次の段階がありません');
  const content = ryReadPlan(p.content), patch = { stage: next, content, updated_at: await ryNow() }; if (next === 'final') patch.content_hash = await RydLib.hashPlan(p.worker_id, p.version, content);
  await rUpd('bp_support_plans', 'id=eq.' + id, patch); await ryAddRevision(p, content, next, next === 'final' ? '本案として確定(内容固定・ハッシュ保存)' : `${next} へ進める`); await renderRydeen('plans'); }); }
async function ryReopenPlan(id) { ryGo(async () => { const p = await ryPlanLoad(id); if (p.stage !== 'final') throw new Error('署名前の本案のみ戻せます');
  const sg = await rb(`bp_support_plan_signatures?plan_id=eq.${id}&select=id`); if (sg.length) throw new Error('署名済みのため戻せません');
  await rUpd('bp_support_plans', 'id=eq.' + id, { stage: 'meeting', content_hash: null }); await ryAddRevision(p, p.content, 'meeting', '本案の確定を取り消し(編集に戻す)'); await renderRydeen('plans'); }); }
async function ryPlanSign(id, kind) { ryGo(async () => {
  const p = await ryPlanLoad(id); if (p.stage !== 'final' && p.stage !== 'signed') throw new Error('本案の確定後に署名できます');
  const nm = kind === 'family' ? ryV('pg_n').trim() : '', rel = kind === 'family' ? ryV('pg_r').trim() : '';
  if (kind === 'family' && !(nm && rel)) throw new Error('家族・代理人は氏名と続柄が必要です'); if (kind === 'self' && p.stage !== 'final') throw new Error('本人の署名は済んでいます');
  if ((await rb(`bp_support_plan_signatures?plan_id=eq.${id}&signer_kind=eq.${kind}&select=id`)).length) throw new Error('この署名者の署名は記録済みです');
  const sig = ryPadData('ps_sig'); if (!sig) throw new Error('署名してください');
  const agreed = RydLib.PLAN_CONSENT.map((_, i) => ryC('pc_' + i)); if (!agreed.every(Boolean)) throw new Error('すべての確認項目にチェックしてください');
  const hash = await RydLib.hashPlan(p.worker_id, p.version, p.content); if (hash !== p.content_hash) throw new Error('計画の内容が確定時から変わっています');
  const at = await ryNow();
  await rIns('bp_support_plan_signatures', { plan_id: id, worker_id: p.worker_id, signer_kind: kind, signer_name: nm || null, relationship: rel || null, proxy_note: kind === 'family' ? ryNull(ryV('pg_x')) : null, signed_at: at, content_hash: hash, signature_data: sig,
    consent_items: RydLib.PLAN_CONSENT.map((t, i) => ({ text: t, checked: agreed[i] })), witness_staff_id: RYD.me.uid, explained_by_name: RYD.me.name, explained_at: at, explain_method: ryV('ps_m') || '対面' });
  if (kind === 'self') await rUpd('bp_support_plans', 'id=eq.' + id, { stage: 'signed', signed_at: at }); await renderRydeen('plans'); ryMsg('署名を記録しました。', true); }); }
async function ryRevisePlan(id) { ryGo(async () => { const old = await ryPlanLoad(id); if (old.stage !== 'signed') throw new Error('署名済みの計画のみ新版を作れます'); const reason = ryV('pv_reason').trim(); if (!reason) throw new Error('変更理由が必要です');
  const content = JSON.parse(JSON.stringify(old.content));
  const row = (await rIns('bp_support_plans', { worker_id: old.worker_id, version: old.version + 1, stage: 'draft', content, content_hash: null, supersedes_id: old.id, revision_reason: reason, created_by: RYD.me.uid }, true))[0];
  await rUpd('bp_support_plans', 'id=eq.' + id, { stage: 'superseded' }); await ryAddRevision(row, content, 'draft', `第${old.version}版から新版を作成: ${reason}`); RYD.st.plan = row.id; await renderRydeen('plans'); }); }
