// レオ「今日やること」の穴集めスクリプト（自動発行用）
// 平日朝の自動発行ルーチン／手動発行で穴集めに使う。発行自体は leo_publish_home_todos（SQL/RPC）で行う。
// このスクリプトはDBへ書き込まない。標準出力に { tday, count, items, titles } のJSONを出すだけ。
// 使い方: SUPABASE_SERVICE_KEY=... node tools/leo_publish_home_once.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const URL = 'https://zvrardoyxocmqhvyddnf.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_KEY;
if (!KEY) { console.error('no SUPABASE_SERVICE_KEY'); process.exit(1); }

async function sb(path) {
  const r = await fetch(URL + '/rest/v1/' + path, { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, Accept: 'application/json' } });
  if (!r.ok) throw new Error(path + ' ' + r.status + ' ' + await r.text());
  return r.json();
}

const sandbox = {
  DEMO: false, console, ROLE: '事務', DUTY: '管理者',
  C: { supabaseUrl: URL, supabaseKey: KEY },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  location: { origin: 'https://rsaito-png.github.io', pathname: '/portal/', hash: '#leo/home', search: '' },
  navigator: { clipboard: { writeText: async () => {} } },
  document: { getElementById: () => null, addEventListener() {}, querySelector: () => null, body: { classList: { toggle() {} }, appendChild() {}, removeChild() {} } },
  fetch: async () => ({ ok: false }),
  setInterval() { return 0; }, setTimeout() { return 0; }, clearTimeout() {},
  btoa, atob, URLSearchParams,
};
sandbox.window = sandbox; sandbox.globalThis = sandbox;
sandbox.$ = () => ({ textContent: '', style: {}, value: '', innerHTML: '' });
vm.createContext(sandbox);
vm.runInContext(read('leo_left.js'), sandbox, { filename: 'leo_left.js' });
vm.runInContext(read('gl.js'), sandbox, { filename: 'gl.js' });
vm.runInContext(read('leo.js') + '\nthis.__leo = { planHomeTodos, leoTodoItem, today, leftIndex, planDates, trackToRow: typeof trackToRow !== "undefined" ? trackToRow : null, canLeoHomeTodo: () => true };', sandbox, { filename: 'leo.js' });

const { planHomeTodos, leoTodoItem, today, leftIndex, trackToRow: leoTrackToRow } = sandbox.__leo;
const ymj = d => { const [y, m] = String(d).split('-'); return `${y}年${+m}月`; };
const slashD = d => d ? String(d).replace(/-/g, '/') : '';
const localTrackToRow = t => ({ 児童名: t.child, 現在の期: `${t.term_no}期`, 現在の計画期間: t.period_from && t.period_to ? `${ymj(t.period_from)}〜${ymj(t.period_to)}` : '', 次期開始月: t.next_start ? ymj(t.next_start) : '',
  フォーム送付目安日: t.survey_due ? slashD(t.survey_due) : '至急', フォーム回答日: slashD(t.survey_answered_at), 計画書作成: t.plan_made ? '済' : '未', 原案署名: t.genan_consent_at ? '済' : '未', 本案署名: t.honan_consent_at ? '済' : '未', 備考: t.note || '', 根拠資料: t.source_ref || '', _track: t });

const trackToRow = leoTrackToRow || localTrackToRow;

(async () => {
  const tday = today();
  const t = new Date(tday + 'T00:00:00+09:00');
  const mo = tday.slice(0, 7);
  const [tracks, plans, links, ans, staff, sends, leftRows, hiyari, edits, clinks, confs] = await Promise.all([
    sb('leo_plan_track?order=next_start,child'),
    sb('leo_plans?order=child,term_no'),
    sb('leo_mon_links?select=token,child,term').catch(() => []),
    sb('leo_mon_answers?order=submitted_at.desc').catch(() => []),
    sb('leo_staff_mon').catch(() => []),
    sb('leo_link_sends?order=sent_at').catch(() => []),
    sb('leo_child_info?select=name,left_on&left_on=not.is.null').catch(() => []),
    sb('hiyari?select=id,status,office&status=eq.未確認').catch(() => []),
    sb('leo_edits?status=eq.衝突&select=id').catch(() => []),
    sb(`leo_confirm_links?month=eq.${mo}&select=token`).catch(() => []),
    sb('leo_confirmations?select=token').catch(() => []),
  ]);
  const L = Object.fromEntries((links || []).map(l => [l.token, l]));
  const D0 = {
    rows: (tracks || []).map(trackToRow),
    plans: plans || [],
    links: links || [],
    sends: sends || [],
    clinks: [],
    staff: staff || [],
    mon: (ans || []).map(a => ({ ...L[a.token], answers: a.answers, submitted_at: a.submitted_at })),
  };
  const LEFT = leftIndex(leftRows || []);
  const todo = [];
  planHomeTodos(D0, LEFT, tday, t).forEach(x => todo.push(x));
  const hy = (hiyari || []).filter(r => r.status === '未確認');
  if (hy.length) todo.push([0, '⚠️', `ヒヤリハットの確認 ${hy.length}件`, '#leo/hiyari', '読んで、再発防止の工夫を書いて「確認した」を押す']);
  const confSet = new Set((confs || []).map(x => x.token));
  const nKak = (clinks || []).filter(l => !confSet.has(l.token)).length;
  if (nKak > 0) todo.push([1, '🖊️', `保護者の実績確認がまだ ${nKak}家庭`, '#leo/kakunin', '公式LINEでリンクを送ったか確認']);
  if ((edits || []).length) todo.push([1, '🔧', `日誌の直しが反映できなかったもの ${edits.length}件`, '#leo/edits', '日誌を見て、必要ならもう一度直す']);
  todo.sort((a, b) => a[0] - b[0]);
  const items = todo.map(leoTodoItem);
  console.log(JSON.stringify({ tday, count: items.length, items, titles: todo.map(x => x[2]) }, null, 2));
})().catch(e => { console.error(e); process.exit(1); });
