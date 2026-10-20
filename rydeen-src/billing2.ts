import { deriveTimeBand, formatTimeHHMM, normalizeTimeBandLabel, yyyymm, type Row } from './billing/core';
import { B_DECISION_CODE, B_SERVICE_TYPE, resolveB, B_DEFAULTS, B_FEE_CLASS_OPTIONS, B_ADDON_OPTIONS, B_SHOGU_ALL_OPTIONS, type BOption, type BSettings } from './billing/b-type';
const p2 = (n: number) => String(n).padStart(2, '0');
// ---- 請求設定 ----
export type BillingSettings = { office_no: string; office_name: string; service_type: string; region_code: string; unit_price: string; shogu_rate: string; shogu_item: string; capacity_scale: string; standard_band: string; default_start: string; default_end: string; ishi_gen: boolean } & { [K in keyof BSettings as `b_${K}`]: string };
export const SETTING_FIELDS: { key: string; label: string; hint: string; sample: string }[] = [
  { key: 'office_no', label: '事業所番号(10桁)', hint: '指定障害福祉サービス事業所の10桁', sample: '9999999999' },
  { key: 'office_name', label: '事業所名', hint: '', sample: 'サンプル事業所' },
  { key: 'service_type', label: 'サービス種類コード', hint: '就労継続支援B型=46', sample: '46' },
  { key: 'region_code', label: '地域区分コード', hint: '例 06=6級地, 20=その他', sample: '20' },
  { key: 'unit_price', label: '地域区分単価(円/単位)', hint: '例 10.37', sample: '10.00' },
  { key: 'standard_band', label: '標準提供時間帯', hint: '時刻不明時の既定', sample: '5時間以上6時間未満' },
  { key: 'default_start', label: '既定開始時刻', hint: '開始が空欄の記録の補完', sample: '09:30' },
  { key: 'default_end', label: '既定終了時刻', hint: '終了が空欄の記録の補完', sample: '15:00' },
];
export type BField = { key: string; label: string; hint: string; type: 'text' | 'select' | 'multi'; options?: BOption[] };
export const B_SETTING_FIELDS: BField[] = [
  { key: 'fee_class', label: 'サービス費の区分', hint: '体制届出の区分', type: 'select', options: B_FEE_CLASS_OPTIONS },
  { key: 'capacity', label: '利用定員(人)', hint: '定員区分(20人以下/21-40/41-60/61-80/81以上)の判定に使用', type: 'text' },
  { key: 'avg_wage', label: '前年度の平均工賃月額(円)', hint: '(Ⅰ)〜(Ⅲ)で必須。報酬算定上の額(届出済みの区分)を入力。(Ⅳ)〜(Ⅵ)では不要', type: 'text' },
  { key: 'r8_scope', label: '令和8年6月〜の区分見直し(提供月が令和8年6月以降で(Ⅰ)〜(Ⅲ)のとき必須)', hint: '令和6年度改定前後で区分が上がっていない事業所=対象外。不明なら自治体へ確認(未設定だと出力ブロック)', type: 'select', options: [{ v: '', l: '未設定(要確認)' }, { v: '対象', l: '改定対象(新区分を適用)' }, { v: '対象外', l: '改定対象外(従前の区分を適用)' }] },
  { key: 'local_gov', label: '地方公共団体が設置する事業所', hint: '該当時は地公体のコードを使用', type: 'select', options: [{ v: 'なし', l: 'いいえ' }, { v: 'あり', l: 'はい' }] },
  { key: 'plan_missing', label: '就労継続支援B型計画 未作成減算', hint: '1=減算開始月から2月目まで / 2=3月以上連続', type: 'select', options: [{ v: 'なし', l: 'なし' }, { v: '1', l: '未計画1(〜2月目)' }, { v: '2', l: '未計画2(3月以上連続)' }] },
  { key: 'short_time', label: '短時間利用減算', hint: '(Ⅳ)〜(Ⅵ)のみコードあり。(Ⅰ)〜(Ⅲ)で「あり」にすると要確認で出力ブロック', type: 'select', options: [{ v: 'なし', l: 'なし' }, { v: 'あり', l: 'あり' }] },
  { key: 'other_reduction', label: 'その他の減算(身体拘束廃止未実施・虐待防止・BCP・情報公表・R8.6新規指定特例 等)', hint: '「あり」は未対応のため出力ブロック', type: 'select', options: [{ v: 'なし', l: '該当なし' }, { v: 'あり', l: '該当あり(要確認)' }] },
  { key: 'addons', label: '算定する加算(体制届出済みのもの)', hint: '選んだ加算だけ請求に入ります（送迎・食事提供は行わないため選択肢にありません）', type: 'multi', options: B_ADDON_OPTIONS.filter((o) => !['meal', 'transport1', 'transport2'].includes(o.v)) },
  { key: 'shogu_class', label: '福祉・介護職員等処遇改善加算の区分', hint: '提供月に応じた加算率(告示)で計算。R6.6〜R8.5は(Ⅰ)〜(Ⅳ)、R8.6〜は(Ⅰ)イ/ロ(Ⅱ)イ/ロ(Ⅲ)(Ⅳ)', type: 'select', options: B_SHOGU_ALL_OPTIONS },
];
export function resolveSettings(db: Row | null) {
  const s: any = {}; const sources: Record<string, 'db' | 'sample'> = {};
  for (const f of SETTING_FIELDS) { const d = db?.[f.key]; if (d != null && String(d).trim() !== '') { s[f.key] = String(d).trim(); sources[f.key] = 'db'; } else { s[f.key] = f.sample; sources[f.key] = 'sample'; } }
  for (const k of Object.keys(B_DEFAULTS) as (keyof BSettings)[]) { const key = 'b_' + k; const d = db?.[key]; if (d != null && String(d).trim() !== '') { s[key] = String(d).trim(); sources[key] = 'db'; } else { s[key] = B_DEFAULTS[k]; sources[key] = 'sample'; } }
  s.shogu_rate = ''; s.shogu_item = ''; s.capacity_scale = ''; s.ishi_gen = !!db?.ishi_gen; sources.ishi_gen = db?.ishi_gen != null ? 'db' : 'sample';
  return { s: s as BillingSettings, sources };
}
export const bSettingsOf = (s: BillingSettings): BSettings => Object.fromEntries((Object.keys(B_DEFAULTS) as (keyof BSettings)[]).map((k) => [k, (s as any)['b_' + k] as string])) as BSettings;
export const toOfficeRow = (s: BillingSettings): Row => ({
  B型設定: bSettingsOf(s), 事業所番号: s.office_no, 事業所名: s.office_name, サービス種類コード: s.service_type, 地域区分コード: s.region_code, 地域区分単価: s.unit_price,
  処遇改善加算率: s.shogu_rate, 処遇改善サービスコード項目: s.shogu_item, 利用定員規模: s.capacity_scale, 標準提供時間帯: s.standard_band,
  既定開始時刻: s.default_start, 既定終了時刻: s.default_end, 医師未配置減算: s.ishi_gen ? 'あり' : 'なし',
});

// ---- 署名済みの実績記録票 → 月次集計(国保連CSVの入力)。DBの取得は呼び出し側(ブラウザ)で行う ----
const toKanaOk = (v: string) => /^[ァ-ヴー・ぁ-ん 　ｦ-ﾟA-Za-z0-9\-.()]+$/.test(v);
export function buildPortalBillingInput(year: number, month: number, d: { setRow: Row | null; records: Row[]; profiles: Row[]; privs: Row[] }, override?: Partial<BillingSettings> | null) {
  const ym = yyyymm(year, month);
  const { s: settings, sources } = resolveSettings(d.setRow);
  if (override) for (const [k, v] of Object.entries(override)) { (settings as any)[k] = v; sources[k] = 'sample'; }
  const rb = resolveB(toOfficeRow(settings), ym);
  const blocking: string[] = [], warnings: string[] = [], infos: string[] = [];
  if (!/^\d{10}$/.test(settings.office_no) || settings.office_no === '9999999999') blocking.push('事業所番号が未設定(サンプル値のまま)です。請求設定で10桁の事業所番号を入力してください。');
  if (settings.service_type !== B_SERVICE_TYPE) blocking.push(`サービス種類コード ${settings.service_type} は未対応です(対応: 46=就労継続支援B型)。`);
  for (const m of rb.blocking) blocking.push(m);
  if (rb.ctx) { infos.push(...rb.ctx.notes); for (const l of rb.ctx.lines) infos.push(`加算: ${l.name} ${l.unitsEach}単位(${l.code}) ×利用日数`); if (rb.ctx.shogu) infos.push(`処遇改善: ${rb.ctx.shogu.name} 加算率${(rb.ctx.shogu.rate * 100).toFixed(1)}%(${rb.ctx.shogu.code})`); }
  if (sources.unit_price === 'sample' || sources.region_code === 'sample') blocking.push('【要確認】地域区分コード・地域区分単価が未設定(サンプル値のまま)です。請求設定で入力してください(就労継続支援の地域区分別単価)。');
  const signed = d.records.filter((r) => r.signed_at);
  const ids = [...new Set(signed.map((r) => r.worker_id))] as string[];
  const pm = new Map<string, Row>(d.privs.map((p) => [p.user_id, p])), nm = new Map<string, string>(d.profiles.map((p) => [p.id, p.display_name]));
  const defStart = settings.default_start, defEnd = settings.default_end, defaultBand = normalizeTimeBandLabel(settings.standard_band);
  const users: Row[] = [], agg: Row[] = [];
  for (const id of ids) {
    const p = pm.get(id) ?? {}, name = nm.get(id) ?? id;
    const rn = String(p.recipient_number ?? '').trim(), mc = String(p.municipality_code ?? '').trim();
    if (!/^\d{1,10}$/.test(rn)) blocking.push(`${name}: 受給者証番号が未設定または不正です。`);
    if (!/^\d{1,6}$/.test(mc)) blocking.push(`${name}: 支給決定市町村番号が未設定または不正です。`);
    if (!p.name_kana) warnings.push(`${name}: 氏名カナ未設定(請求CSVのカナ欄は空欄になります)。`);
    else if (!toKanaOk(p.name_kana)) warnings.push(`${name}: 氏名カナを半角カナに変換できません(空欄になります)。`);
    users.push({ 利用者ID: id, 受給者証番号: rn, 支給決定市町村番号: mc, 氏名: name, 氏名カナ: p.name_kana ?? '', 障害支援区分: p.support_level ?? '', 上限管理有無: p.cap_management ?? '無', 上限月額: p.cap_amount ?? 0, 上限額管理事業所番号: p.cap_office_no ?? '', 決定サービスコード: p.decision_service_code && p.decision_service_code !== '221000' ? p.decision_service_code : B_DECISION_CODE, 契約支給量_日: p.contract_days ?? '原則', 契約開始年月日: p.contract_start ?? '', 契約終了年月日: p.contract_end ?? '', サービス開始年月日: p.service_start_date ?? '', 事業者記入欄番号: p.provider_entry_no ?? '1', 食事提供体制加算対象: '非対象', 送迎加算区分: 'なし' });
    const row: Row = { 対象年月: ym, 利用者ID: id }; let days = 0; const cols: Record<string, string> = {};
    for (const r of signed.filter((x) => x.worker_id === id)) {
      const day = Number(String(r.service_date).slice(8, 10));
      const st = r.start_time ? formatTimeHHMM(String(r.start_time)) : defStart, en = r.end_time ? formatTimeHHMM(String(r.end_time)) : defEnd;
      if (!r.start_time || !r.end_time) warnings.push(`${name} ${r.service_date}: 開始/終了が空欄のため既定時刻(${defStart}-${defEnd})で補完。`);
      const band = deriveTimeBand(st, en) ?? defaultBand; days++; const k = p2(day);
      Object.assign(cols, { ['利用_' + k]: '1', ['時間_' + k]: band, ['送迎_' + k]: 'なし', ['食事_' + k]: '0', ['開始_' + k]: st, ['終了_' + k]: en });
    }
    Object.assign(row, { 利用日数: days, 送迎往回数: 0, 送迎復回数: 0, 食事回数: 0 }, cols); agg.push(row);
  }
  return { office: toOfficeRow(settings), users, agg, settings, sources, blocking, warnings, infos, signedCount: signed.length, unsignedCount: d.records.length - signed.length };
}
