// 職員の勤務実績・常勤換算の集計。根拠: 指定障害福祉サービス等の人員、設備及び運営に関する基準(平18厚令171)第186条・第199条、
// 解釈通知(平18障発1206001)第二の2(1)「常勤換算方法」「常勤」。docs/staff-roster.md 参照。
export const JOBS = ['サービス管理責任者', '管理者', '職業指導員', '生活支援員', '目標工賃達成指導員', 'その他'] as const;
export const OTHER = '他業務(本事業外の兼務)';
export const DUTIES = [...JOBS, OTHER];
export const DIRECT = ['職業指導員', '生活支援員'];
export const EMPLOY = ['常勤', '非常勤'];

export type Member = { id: string; name: string; employment: string; job: string; weekly_hours: number; reduced_hours: boolean; concurrent_note: string; active: boolean };
export type Shift = { id: string; staff_id: string; work_date: string; start_time: string; end_time: string; break_min: number; duty: string; note: string };
export type Params = { month: string; weekly: number; users: number; capacity: number; basis: 'cal' | 'w4'; sabiCount: boolean };

const toMin = (t: string) => { const [h, m] = (t || '').split(':').map(Number); return Number.isFinite(h) ? h * 60 + (m || 0) : NaN; };
export const shiftMinutes = (s: Pick<Shift, 'start_time' | 'end_time' | 'break_min'>) => { const v = toMin(s.end_time) - toMin(s.start_time) - (Number(s.break_min) || 0); return Number.isFinite(v) && v > 0 ? v : 0; };
export const daysIn = (month: string) => { const [y, m] = month.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };

/** 常勤の従業者が勤務すべき時間数(月)。週32時間未満は32時間を基本。暦月=週×暦日数/7、4週=週×4 (どちらの扱いか要確認) */
export const monthStandard = (p: Params, weekly = p.weekly) => (p.basis === 'cal' ? (weekly * daysIn(p.month)) / 7 : weekly * 4);
export const baseWeekly = (p: Params) => Math.max(p.weekly, 32);

export type StaffRow = { m: Member; byDay: Record<number, number>; byDuty: Record<string, number>; total: number; counted: number; fte: number; standard: number; excluded: number };
export function compute(members: Member[], shifts: Shift[], p: Params) {
  const std = monthStandard({ ...p, weekly: baseWeekly(p) }, baseWeekly(p));
  const rows: StaffRow[] = members.filter((m) => m.active).map((m) => {
    const mine = shifts.filter((s) => s.staff_id === m.id && s.work_date.startsWith(p.month));
    const byDay: Record<number, number> = {}, byDuty: Record<string, number> = {};
    for (const s of mine) { const mm = shiftMinutes(s); const d = Number(s.work_date.slice(8, 10)); byDay[d] = (byDay[d] ?? 0) + mm; byDuty[s.duty] = (byDuty[s.duty] ?? 0) + mm; }
    const total = Object.values(byDuty).reduce((a, b) => a + b, 0);
    // 本事業のサービス提供に従事する時間のみ算入。サビ管・管理者・他業務の時間は算入しない(サビ管は定員20人未満のとき任意で算入可)
    const countable = (d: string) => DIRECT.includes(d) || (d === 'サービス管理責任者' && p.sabiCount);
    const countedMin = Object.entries(byDuty).filter(([d]) => countable(d)).reduce((a, [, v]) => a + v, 0);
    // 育児・介護・治療の短縮措置: 週30時間以上で1として扱える(要確認)
    const denom = m.reduced_hours ? monthStandard(p, 30) : std;
    const counted = Math.min(countedMin / 60, denom) ; // 1人あたり常勤の時間数が上限
    const excluded = (total - countedMin) / 60;
    return { m, byDay, byDuty, total: total / 60, counted, fte: counted / denom, standard: denom, excluded };
  });
  const sum = (f: (r: StaffRow) => number) => rows.reduce((a, r) => a + f(r), 0);
  const fteDirect = Math.round(sum((r) => r.fte) * 100) / 100;
  const need = Math.round((p.users / 10) * 100) / 100;
  const hasDuty = (j: string) => rows.some((r) => (r.byDuty[j] ?? 0) > 0);
  // 常勤の判定は「勤務時間が常勤の者の所定時間に達しているか」。月の祝日・休暇の扱いが未確認のため、目安として 週所定×4週 以上で判定(要確認)
  const ftMin = (baseWeekly(p) * 4) - 1e-9;
  const fullTimeDirect = rows.some((r) => r.m.employment === '常勤' && DIRECT.some((d) => (r.byDuty[d] ?? 0) > 0) && r.total >= ftMin && !(r.byDuty[OTHER] > 0));
  const sabiFull = rows.some((r) => r.m.employment === '常勤' && (r.byDuty['サービス管理責任者'] ?? 0) > 0 && r.total >= ftMin);
  const sabiNeed = p.users <= 60 ? 1 : 1 + Math.ceil((p.users - 60) / 40);
  const sabiN = rows.filter((r) => (r.byDuty['サービス管理責任者'] ?? 0) > 0).length;
  const concurrent = rows.filter((r) => Object.keys(r.byDuty).filter((d) => (r.byDuty[d] ?? 0) > 0).length > 1);
  type Chk = { label: string; ok: boolean | null; detail: string };
  const checks: Chk[] = [
    { label: '職業指導員＋生活支援員の常勤換算数 ≧ 利用者数÷10', ok: fteDirect >= need, detail: `${fteDirect.toFixed(2)} ／ 必要 ${need.toFixed(2)}（利用者数 ${p.users}人）` },
    { label: '職業指導員が1人以上', ok: hasDuty('職業指導員'), detail: '当月に職業指導員として勤務した職員の有無' },
    { label: '生活支援員が1人以上', ok: hasDuty('生活支援員'), detail: '当月に生活支援員として勤務した職員の有無' },
    { label: '職業指導員または生活支援員のうち1人以上が常勤', ok: fullTimeDirect, detail: `常勤区分で、当月の勤務が目安の${(ftMin + 1e-9).toFixed(0)}h(週${baseWeekly(p)}h×4週)以上、かつ他業務の兼務なし。専従の厳密な判定は要確認` },
    { label: `サービス管理責任者が${sabiNeed}人以上（利用者${p.users}人）`, ok: sabiN >= sabiNeed, detail: `勤務のあった職員 ${sabiN}人` },
    { label: 'サービス管理責任者のうち1人以上が常勤', ok: sabiFull, detail: '常勤区分で、当月の勤務が目安(週所定×4週)以上' },
    { label: '兼務者の勤務区分ごとの時間が分けて記録されている', ok: null, detail: concurrent.length ? `兼務あり: ${concurrent.map((r) => r.m.name).join('、')}。兼務時間の算入可否は要確認` : '兼務者なし' },
  ];
  return { rows, std: std / 60, fteDirect, need, checks, totalHours: sum((r) => r.total) };
}
