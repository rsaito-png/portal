#!/usr/bin/env node
// 個別支援計画 AI下書き 処理ツール（collect / apply / fail / clean）。手順: docs/ai-draft.md
//   node tools/draft-plans.js collect [--office RYDEEN] [--out /tmp/ai-draft/collect.json]
//   node tools/draft-plans.js apply   --draft /path/draft.json [--collect /path/collect.json]
//   node tools/draft-plans.js fail    <request_id> "理由"
//   node tools/draft-plans.js clean
// service_role キー: 環境変数 SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SERVICE_KEY、なければ /workspace/b-portal/.env.local。キーは出力しない。
// 外部AIには何も送らない。collect の出力(個人情報を含む)は 0600 のファイルで、apply/clean 後に削除する。
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ENV_FILE = process.env.BP_ENV_FILE || '/workspace/b-portal/.env.local';
const DIR = process.env.AI_DRAFT_DIR || '/tmp/ai-draft';
const EDITABLE = ['assessment', 'draft', 'meeting'];
const DRAFT_SECTIONS = ['assessment', 'monitoring', 'plan'];   // 会議録(meeting)は事実を知り得ないので対象外
const MAXLEN = 2000;

function loadEnv() {
  const e = { ...process.env };
  try { for (const l of fs.readFileSync(ENV_FILE, 'utf8').split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !(m[1] in e)) e[m[1]] = m[2].replace(/^["']|["']$/g, ''); } } catch (_) { }
  return e;
}
const ENV = loadEnv();
const URL_ = (ENV.NEXT_PUBLIC_SUPABASE_URL || 'https://zvrardoyxocmqhvyddnf.supabase.co').replace(/\/$/, '');
const KEY = ENV.SUPABASE_SERVICE_ROLE_KEY || ENV.SUPABASE_SERVICE_KEY;
if (!KEY) { console.error('service_role キーが見つかりません'); process.exit(2); }

async function rest(method, p, body, prefer) {
  const r = await fetch(URL_ + '/rest/v1/' + p, { method, headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', 'User-Agent': 'curl/8', ...(prefer ? { Prefer: prefer } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${p.split('?')[0]} → ${r.status} ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}
const Q = encodeURIComponent;

// 画面と同じ集計ロジック(rydeen-lib.js)を読み込む
function loadLib() {
  const code = fs.readFileSync(path.join(__dirname, '..', 'rydeen-lib.js'), 'utf8');
  const ctx = { crypto: globalThis.crypto, TextEncoder, console }; vm.createContext(ctx); vm.runInContext(code + ';this.RydLib=RydLib', ctx); return ctx.RydLib;
}
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const writeSecret = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true, mode: 0o700 }); fs.writeFileSync(f, JSON.stringify(o, null, 1), { mode: 0o600 }); };
const rm = f => { try { fs.unlinkSync(f); } catch (_) { } };

async function collect() {
  const L = loadLib(), office = arg('office'), out = arg('out', path.join(DIR, 'collect.json'));
  const reqs = await rest('GET', `bp_plan_draft_requests?status=eq.pending&select=id,office,plan_id,requested_at&order=requested_at${office ? '&office=eq.' + Q(office) : ''}`);
  const win = L.previousWindow(), result = { generated_at: new Date().toISOString(), window: win, sections: DRAFT_SECTIONS.map(k => L.SECTIONS.find(s => s.key === k)).map(s => ({ key: s.key, title: s.title, fields: s.fields })), requests: [] };
  for (const q of reqs) {
    const p = (await rest('GET', `bp_support_plans?id=eq.${q.plan_id}&office=eq.${Q(q.office)}&select=*`))[0];
    if (!p) { await fail(q.id, '対象の計画が見つかりません'); continue; }
    if (!EDITABLE.includes(p.stage)) { await fail(q.id, '確定・署名後の計画には下書きできません'); continue; }
    const [prof, jr, dr, prev] = await Promise.all([
      rest('GET', `bp_profiles?id=eq.${p.worker_id}&office=eq.${Q(q.office)}&select=display_name`),
      rest('GET', `bp_journal?worker_id=eq.${p.worker_id}&office=eq.${Q(q.office)}&journal_date=gte.${win.from}&journal_date=lte.${win.to}&select=journal_date,status,start_time,end_time,break_min,work,health,memo,abs_reason&order=journal_date`),
      rest('GET', `bp_daily_reports?worker_id=eq.${p.worker_id}&office=eq.${Q(q.office)}&report_date=gte.${win.from}&report_date=lte.${win.to}&select=report_date,condition,work_content,reflection&order=report_date`),
      rest('GET', `bp_support_plans?worker_id=eq.${p.worker_id}&office=eq.${Q(q.office)}&id=neq.${p.id}&stage=in.(signed,superseded,final)&select=version,stage,content&order=version.desc&limit=1`)]);
    const c = p.content, keep = {};
    for (const k of DRAFT_SECTIONS) keep[k] = Object.fromEntries(Object.entries(c[k] || {}).filter(([, v]) => String(v || '').trim()));
    const pc = prev[0]?.content;
    result.requests.push({
      request_id: q.id, plan_id: p.id, office: q.office, stage: p.stage, version: p.version,
      worker_name: prof[0]?.display_name || '', period: c.period,
      already_filled_fields: keep,                    // 職員が入力済み(上書きしない・参考にする)。AI下書き済みの項目は再作成で置き換わる
      ai_flagged_fields: Object.keys(c.ai_draft?.fields || {}),
      previous_plan: pc ? { version: prev[0].version, period: pc.period, plan: pc.plan } : null,
      auto_summary: c.summary ? { text: c.summary.text, metrics: c.summary.metrics, material: c.summary.material } : L.buildSummary(jr, win.from, win.to, dr),
      journal: jr, daily_reports: dr,
    });
  }
  writeSecret(out, result);
  console.log(JSON.stringify({ collect_file: out, pending: reqs.length, requests: result.requests.map(r => ({ request_id: r.request_id, worker_name: r.worker_name, journal_days: r.journal.length, reports: r.daily_reports.length })) }, null, 1));
  console.log('※ collect_file は個人情報を含みます。apply 後(または clean)に削除されます。');
}

async function fail(id, note) { await rest('PATCH', `bp_plan_draft_requests?id=eq.${id}&status=eq.pending`, { status: 'error', done_at: new Date().toISOString(), result_note: String(note).slice(0, 300) }); console.log('error 記録:', id, note); }

async function applyOne(d) {
  const L = loadLib(), id = d.request_id;
  const q = (await rest('GET', `bp_plan_draft_requests?id=eq.${id}&select=*`))[0];
  if (!q) throw new Error('依頼が見つかりません: ' + id);
  if (q.status !== 'pending') return console.log('skip(処理済み):', id);
  if (d.plan_id && d.plan_id !== q.plan_id) throw new Error('plan_id が依頼と一致しません');
  const p = (await rest('GET', `bp_support_plans?id=eq.${q.plan_id}&office=eq.${Q(q.office)}&select=*`))[0];
  if (!p) return fail(id, '対象の計画が見つかりません');
  if (!EDITABLE.includes(p.stage)) return fail(id, '確定・署名後の計画には下書きできません');
  const c = JSON.parse(JSON.stringify(p.content)), flags = { ...(c.ai_draft?.fields || {}) }, wrote = [], skipped = [];
  for (const sec of DRAFT_SECTIONS) {
    const def = L.SECTIONS.find(s => s.key === sec); const src = (d.sections || {})[sec] || {};
    for (const f of def.fields) {
      let t = src[f]; if (typeof t !== 'string' || !t.trim()) continue; t = t.trim().slice(0, MAXLEN);
      const key = sec + '|' + f, cur = String(c[sec][f] || '').trim();
      if (cur && !flags[key]) { skipped.push(f); continue; }   // 職員が書いた内容は上書きしない
      c[sec][f] = t; flags[key] = true; wrote.push(f);
    }
  }
  if (!wrote.length) return fail(id, '書き込める項目がありませんでした（職員入力済み、または下書きが空）');
  const now = new Date().toISOString();
  c.ai_draft = { generated_at: now, request_id: id, fields: flags };
  // 職員が同時に編集していたら上書きしない（updated_at が変わっていたら 0 行更新になる）
  const upd = await rest('PATCH', `bp_support_plans?id=eq.${p.id}&office=eq.${Q(p.office)}&updated_at=eq.${Q(p.updated_at)}&stage=in.(assessment,draft,meeting)`, { content: c, updated_at: now }, 'return=representation');
  if (!upd || !upd.length) throw new Error('計画が同時に編集されたため反映しませんでした。依頼は pending のままです（次回の実行で再処理）');
  const last = await rest('GET', `bp_support_plan_revisions?plan_id=eq.${p.id}&select=rev_no&order=rev_no.desc&limit=1`);
  await rest('POST', 'bp_support_plan_revisions', { office: p.office, plan_id: p.id, rev_no: (last[0]?.rev_no ?? 0) + 1, stage: p.stage, content: c, note: `AI下書きを反映（${wrote.length}項目・要確認）`, saved_by_name: 'AI下書き(ボット)', saved_at: now }, 'return=minimal');
  await rest('PATCH', `bp_plan_draft_requests?id=eq.${id}`, { status: 'done', done_at: now, result_note: `${wrote.length}項目を下書き${skipped.length ? `（職員入力済み${skipped.length}項目は未変更）` : ''}` });
  console.log('done:', id, '書込', wrote.length, '項目 / 未変更', skipped.length);
}

async function apply() {
  const f = arg('draft'); if (!f) { console.error('--draft が必要です'); process.exit(2); }
  const j = JSON.parse(fs.readFileSync(f, 'utf8')), list = Array.isArray(j.drafts) ? j.drafts : [j]; let bad = 0;
  for (const d of list) { try { await applyOne(d); } catch (e) { bad++; console.error('NG:', d.request_id, e.message); } }
  if (!bad) { rm(f); const c = arg('collect', path.join(DIR, 'collect.json')); rm(c); console.log('入力ファイルを削除しました'); }
  else console.error(`${bad} 件失敗。ファイルは残してあります（確認後 clean で削除）`), process.exitCode = 1;
}
function clean() { if (fs.existsSync(DIR)) for (const n of fs.readdirSync(DIR)) rm(path.join(DIR, n)); console.log('削除しました:', DIR); }

const [cmd, a1, a2] = process.argv.slice(2);
({ collect, apply, clean, fail: () => fail(a1, a2 || '失敗') }[cmd] || (() => { console.error('usage: collect | apply --draft F | fail ID 理由 | clean'); process.exit(2); }))().catch(e => { console.error(e.message); process.exit(1); });
