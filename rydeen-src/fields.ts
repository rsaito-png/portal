// 個別支援計画の様式(国の様式にとらわれず、使いやすさ優先)。構成の参考: 仕事用Driveの個別支援計画の下書き様式(見出しのみ。個人情報は使用しない)。
export const STAGES = ['assessment', 'draft', 'meeting', 'final', 'signed', 'superseded'] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_LABEL: Record<string, string> = { assessment: '①アセスメント', draft: '②計画原案', meeting: '③会議録', final: '④本案(署名待ち)', signed: '署名済', superseded: '旧版' };
export const EDITABLE = ['assessment', 'draft', 'meeting'];
export type Section = 'assessment' | 'monitoring' | 'plan' | 'meeting';
export const SECTIONS: { key: Section; title: string; stage: string; fields: string[] }[] = [
  { key: 'assessment', title: 'アセスメント', stage: 'assessment', fields: ['利用者概要', '本人の意向', '家族の意向', '健康・生活の状況', '作業・日中活動の状況', '対人関係・コミュニケーション', '強み・できること', '課題'] },
  { key: 'monitoring', title: '前期の評価(モニタリング)', stage: 'assessment', fields: ['前期の目標と評価', '総括'] },
  { key: 'plan', title: '個別支援計画', stage: 'draft', fields: ['総合的な援助の方針', '長期目標', '短期目標', '課題・支援内容(担当・頻度・期間)', '工賃・就労に関する目標', '評価の時期・方法'] },
  { key: 'meeting', title: '個別支援会議録', stage: 'meeting', fields: ['日時・場所', '出席者(本人・家族の出席有無も)', '検討事項', '検討経過', '結論(原案から修正した点)'] },
];
export const TBD = '【要確認】';
export type Content = { period: { start: string; end: string }; assessment: Record<string, string>; monitoring: Record<string, string>; plan: Record<string, string>; meeting: Record<string, string>; summary: Summary | null };
export type Summary = { generated_at: string; from: string; to: string; metrics: Record<string, any>; text: string; material: string[] };
export const emptyContent = (start: string, end: string, summary: Summary | null): Content => {
  const mk = (s: Section) => Object.fromEntries(SECTIONS.find((x) => x.key === s)!.fields.map((f) => [f, '']));
  return { period: { start, end }, assessment: mk('assessment'), monitoring: mk('monitoring'), plan: mk('plan'), meeting: mk('meeting'), summary };
};
export const PLAN_CONSENT = [
  '個別支援計画の内容について、職員から説明を受け、理解しました。',
  '本計画の内容に同意します。',
  '本計画書の写しの交付を受けることを確認しました。(交付方法は要確認)',
];
