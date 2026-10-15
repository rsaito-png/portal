// b-portal の src/lib から、サーバー依存(node:crypto・Supabaseクライアント・デモ用ストア)を外して移植した業務ロジック。
import type { Content, Summary } from './fields';

export const TBD = '【要確認】';
const p2 = (n: number) => String(n).padStart(2, '0');
export const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export const jst = (offset = 0) => new Date(Date.now() + 9 * 3600e3 + offset * 86400e3).toISOString().slice(0, 10);

// ---- ハッシュ(署名対象の SHA-256)。ブラウザの SubtleCrypto なので非同期 ----
export async function sha256(text: string): Promise<string> {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
export function renderBody(body: string, vals: Record<string, string>) {
  return body.replace(/\{\{([^}]+)\}\}/g, (_, k) => (vals[k.trim()]?.trim() ? vals[k.trim()] : TBD));
}
export const hashContent = (title: string, body: string, fields: Record<string, string>) => sha256(JSON.stringify(canon({ title, body, fields })));
export const CONSENT_ITEMS = [
  '文書の内容を読み、職員から説明を受けました。',
  '質問する機会があり、内容を理解しました。',
  '内容に同意し、電子署名（手書き署名）で署名することを承諾します。',
];
// jsonb はキー順を保持しないため、キーを並べ替えた正規化JSONでハッシュする
const canon = (v: any): any => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
export const hashPlan = (workerId: string, version: number, content: Content) => sha256(JSON.stringify(canon({ workerId, version, content })));
export const defaultPeriod = () => { const s = jst(); const e = new Date(s + 'T00:00:00Z'); e.setUTCMonth(e.getUTCMonth() + 6); e.setUTCDate(e.getUTCDate() - 1); return { start: s, end: e.toISOString().slice(0, 10) }; };
export const previousWindow = () => ({ from: jst(-90), to: jst(-1) });

// ---- 業務日誌 → 実績記録票(自動転記) ----
export const ATTEND = ['通所', '施設外就労', '施設外支援', '在宅'];
export type JournalRow = { worker_id: string; journal_date: string; status: string; start_time: string; end_time: string; break_min: number; work: string; health: string; memo: string; abs_reason?: string | null; abs_at?: string | null; abs_staff?: string | null; abs_handled?: boolean; abs_note?: string | null };
/** 日誌の1行から記録票の行を作る。利用した日(通所・施設外就労・施設外支援・在宅)だけが記録票になる。職員の入力は不要 */
export function recordFromJournal(j: JournalRow) {
  if (!ATTEND.includes(j.status)) return null;
  return { worker_id: j.worker_id, service_date: j.journal_date, start_time: j.start_time || null, end_time: j.end_time || null, work_summary: [j.status !== '通所' ? `【${j.status}】` : '', j.work].filter(Boolean).join(' ') };
}

// ---- 個別支援計画の要約(日誌・日報の集計) ----
const mins = (t: string) => { const [h, m] = (t || '').split(':').map(Number); return Number.isFinite(h) ? h * 60 + (m || 0) : NaN; };
const count = (xs: string[]) => xs.reduce<Record<string, number>>((a, x) => ((a[x] = (a[x] ?? 0) + 1), a), {});
const top = (c: Record<string, number>, n = 5) => Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, n);
export type DailyReport = { report_date: string; condition: string; work_content: string; reflection: string };
export function buildSummary(journal: JournalRow[], from: string, to: string, reports: DailyReport[]): Summary {
  const rows = journal.filter((r) => r.journal_date >= from && r.journal_date <= to && r.status).sort((a, b) => a.journal_date.localeCompare(b.journal_date)).map((r) => [r.journal_date, r] as [string, JournalRow]);
  const att = rows.filter(([, r]) => ATTEND.includes(r.status));
  const abs = rows.filter(([, r]) => r.status === '欠席');
  const stat = count(rows.map(([, r]) => r.status));
  const workMin = att.map(([, r]) => (mins(r.end_time) - mins(r.start_time) - (Number(r.break_min) || 0))).filter((x) => x > 0);
  const avgWork = workMin.length ? Math.round(workMin.reduce((a, b) => a + b, 0) / workMin.length) : null;
  const health = count(att.map(([, r]) => r.health).filter(Boolean));
  const absReason = count(abs.map(([, r]) => r.abs_reason || '理由未記入'));
  const rep = reports.filter((r) => r.report_date >= from && r.report_date <= to);
  const cond = count(rep.map((r) => ({ good: '良い', normal: 'ふつう', bad: '悪い' } as Record<string, string>)[r.condition] ?? r.condition));
  const works = count(att.flatMap(([, r]) => (r.work || '').split(/[、,・\n]/).map((s) => s.trim()).filter(Boolean)));
  const memos = rows.filter(([, r]) => r.memo).map(([d, r]) => `${d} ${r.memo}`);
  const refl = rep.filter((r) => r.reflection).sort((a, b) => b.report_date.localeCompare(a.report_date)).slice(0, 3).map((r) => `${r.report_date} ${r.reflection}`);
  const rate = att.length + abs.length ? Math.round((att.length / (att.length + abs.length)) * 100) : null;
  const bad = (health['やや悪い'] ?? 0) + (health['悪い'] ?? 0);
  const fmt = (c: Record<string, number>) => top(c).map(([k, v]) => `${k}${v}回`).join('、') || '記録なし';
  const metrics = { 記録日数: rows.length, 利用日数: att.length, 欠席日数: abs.length, 利用率: rate, 平均作業時間分: avgWork, 状態別: stat, 欠席理由: absReason, 体調: health, 日報の体調: cond, 日報提出数: rep.length, 主な作業: Object.fromEntries(top(works)) };
  const text = rows.length === 0
    ? `${from}〜${to}の業務日誌の記録がありません。${TBD}（日誌の入力状況を確認してください）`
    : [`${from}〜${to}の記録日数は${rows.length}日で、利用は${att.length}日、欠席は${abs.length}日でした${rate != null ? `（利用率${rate}%）` : ''}。`,
      avgWork != null ? `利用日の平均作業時間は約${(avgWork / 60).toFixed(1)}時間（休憩を除く）です。` : '',
      `主な作業内容は ${fmt(works)} でした。`,
      att.length ? `利用日の体調は ${fmt(health)} でした${bad ? `（「やや悪い」「悪い」が${bad}回）` : ''}。` : '',
      abs.length ? `欠席の理由は ${fmt(absReason)} です。` : '',
      rep.length ? `日報は${rep.length}件提出され、体調は ${fmt(cond)} でした。` : '日報の提出はありません。'].filter(Boolean).join('');
  const material: string[] = [];
  if (rate != null) material.push(rate >= 80 ? `通所は安定しています（利用率${rate}%）。目標の水準を上げるか検討します。` : `利用率が${rate}%です。欠席の背景（体調・通院・意欲）を本人に確認し、通所日数や時間の調整を検討します。`);
  if (bad >= 3) material.push(`体調が優れない日が${bad}回ありました。医療機関・家族・相談支援事業所との情報共有の要否を検討します。`);
  if (abs.length && Object.keys(absReason).length) material.push(`欠席理由の中心は「${top(absReason, 1)[0][0]}」です。連絡・対応の記録（欠席時対応）を確認します。`);
  if (top(works, 1).length) material.push(`取り組みの多い作業は「${top(works, 1)[0][0]}」です。本人の希望・得意との一致を確認し、作業の幅を広げるか検討します。`);
  if (memos.length) material.push(`日誌メモに特記事項が${memos.length}件あります（下記）。`);
  if (!material.length) material.push('集計できる材料が不足しています。' + TBD);
  return { generated_at: new Date().toISOString(), from, to, metrics, text, material: [...material, ...memos.slice(-5).map((m) => `［日誌メモ］${m}`), ...refl.map((m) => `［日報の振り返り］${m}`)] };
}

