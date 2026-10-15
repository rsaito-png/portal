/**
 * 就労継続支援B型(サービス種類46)の報酬コード選択・単位計算。
 * コード/単位数は svc-codes-b.ts(厚労省サービスコード表Excelから機械生成)のみを根拠にし、推測値は持たない。
 * 確信が持てない/未対応の組合せは blocking(=「要確認」)として返し、呼び出し側(請求画面・CSV出力)が出力を止める。
 */
import { B_BASIC_R6, B_BASIC_R8, B_OTHER_R6, B_OTHER_R8, type BBasicRow, type BOtherRow, type BVer } from './svc-codes-b';

export type { BVer };
export const B_SERVICE_TYPE = '46';
export const B_DECISION_CODE = '461000'; // 決定サービスコード(就労継続支援B型基本決定) 出典: IF仕様書 共通編 コード一覧
export const B_JISSEKI_FORM = '1701'; // 実績記録票 様式種別番号(就労継続支援) 出典: IF仕様書 様式17

/** サービス提供年月→適用コード表。令和8年6月以降はR8表、令和6年4月〜令和8年5月はR6表、それ以前は未対応 */
export const bVersion = (ym: string): BVer | null => (ym >= '202606' ? 'R8' : ym >= '202404' ? 'R6' : null);

export type BSettings = {
  fee_class: string; capacity: string; avg_wage: string; r8_scope: string; local_gov: string; plan_missing: string; short_time: string;
  other_reduction: string; addons: string; shogu_class: string; transport_same_site: string;
};
export const B_DEFAULTS: BSettings = { fee_class: 'Ⅰ', capacity: '20', avg_wage: '', r8_scope: '', local_gov: 'なし', plan_missing: 'なし', short_time: 'なし', other_reduction: 'なし', addons: '', shogu_class: '', transport_same_site: 'なし' };

export type BOption = { v: string; l: string };
export const B_FEE_CLASS_OPTIONS: BOption[] = [
  { v: 'Ⅰ', l: 'サービス費(Ⅰ) 平均工賃月額方式・人員配置6:1' }, { v: 'Ⅱ', l: 'サービス費(Ⅱ) 平均工賃月額方式・人員配置7.5:1' }, { v: 'Ⅲ', l: 'サービス費(Ⅲ) 平均工賃月額方式・人員配置10:1' },
  { v: 'Ⅳ', l: 'サービス費(Ⅳ) 参加等評価方式(スコア)・人員配置6:1' }, { v: 'Ⅴ', l: 'サービス費(Ⅴ) 参加等評価方式・人員配置7.5:1' }, { v: 'Ⅵ', l: 'サービス費(Ⅵ) 参加等評価方式・人員配置10:1' },
];
export const B_ADDON_OPTIONS: (BOption & { unsupported?: boolean })[] = [
  { v: 'fukushi1', l: '福祉専門職員配置等加算(Ⅰ)' }, { v: 'fukushi2', l: '福祉専門職員配置等加算(Ⅱ)' }, { v: 'fukushi3', l: '福祉専門職員配置等加算(Ⅲ)' },
  { v: 'jusho1', l: '重度者支援体制加算(Ⅰ)' }, { v: 'jusho2', l: '重度者支援体制加算(Ⅱ)' },
  { v: 'mokuhyo_shidoin', l: '目標工賃達成指導員配置加算' }, { v: 'mokuhyo_tassei', l: '目標工賃達成加算' },
  { v: 'shikaku1', l: '視覚・聴覚言語障害者支援体制加算(Ⅰ)' }, { v: 'shikaku2', l: '視覚・聴覚言語障害者支援体制加算(Ⅱ)' }, { v: 'koujinou', l: '高次脳機能障害者支援体制加算' },
  { v: 'meal', l: '食事提供体制加算' }, { v: 'transport1', l: '送迎加算(Ⅰ)' }, { v: 'transport2', l: '送迎加算(Ⅱ)' },
  { v: 'absent', l: '欠席時対応加算(※欠席の実績データ未対応→選ぶと出力ブロック)', unsupported: true },
  { v: 'shoki', l: '初期加算(※利用開始30日の判定未対応→選ぶと出力ブロック)', unsupported: true },
  { v: 'houmon', l: '訪問支援特別加算(※訪問実績データ未対応→選ぶと出力ブロック)', unsupported: true },
];

/** 福祉・介護職員等処遇改善加算の区分。加算率は告示(サービスコード表には無い)。出典は docs/b-type-codes.md */
export const B_SHOGU: Record<BVer, { v: string; l: string; code: string; rate: number }[]> = {
  R6: [{ v: 'Ⅰ', l: '処遇改善加算(Ⅰ) 9.3%', code: '465120', rate: 0.093 }, { v: 'Ⅱ', l: '処遇改善加算(Ⅱ) 9.1%', code: '465121', rate: 0.091 }, { v: 'Ⅲ', l: '処遇改善加算(Ⅲ) 7.6%', code: '465122', rate: 0.076 }, { v: 'Ⅳ', l: '処遇改善加算(Ⅳ) 6.2%', code: '465123', rate: 0.062 }],
  R8: [{ v: 'Ⅰイ', l: '処遇改善加算(Ⅰ)イ 10.5%', code: '465120', rate: 0.105 }, { v: 'Ⅰロ', l: '処遇改善加算(Ⅰ)ロ 10.9%', code: '465174', rate: 0.109 }, { v: 'Ⅱイ', l: '処遇改善加算(Ⅱ)イ 10.3%', code: '465121', rate: 0.103 }, { v: 'Ⅱロ', l: '処遇改善加算(Ⅱ)ロ 10.7%', code: '465175', rate: 0.107 }, { v: 'Ⅲ', l: '処遇改善加算(Ⅲ) 8.8%', code: '465122', rate: 0.088 }, { v: 'Ⅳ', l: '処遇改善加算(Ⅳ) 7.4%', code: '465123', rate: 0.074 }],
};
export const B_SHOGU_ALL_OPTIONS: BOption[] = [{ v: '', l: 'なし(算定しない)' }, { v: 'Ⅰ', l: '(Ⅰ) 〜R8.5分 9.3%' }, { v: 'Ⅱ', l: '(Ⅱ) 〜R8.5分 9.1%' }, { v: 'Ⅲ', l: '(Ⅲ) R6:7.6% / R8.6〜:8.8%' }, { v: 'Ⅳ', l: '(Ⅳ) R6:6.2% / R8.6〜:7.4%' },
  { v: 'Ⅰイ', l: '(Ⅰ)イ R8.6〜 10.5%' }, { v: 'Ⅰロ', l: '(Ⅰ)ロ R8.6〜 10.9%' }, { v: 'Ⅱイ', l: '(Ⅱ)イ R8.6〜 10.3%' }, { v: 'Ⅱロ', l: '(Ⅱ)ロ R8.6〜 10.7%' }];

export type BLine = { code: string; unitsEach: number; name: string; per: 'day' | 'meal' | 'trip' };
export type BCtx = { ver: BVer; basic: { code: string; units: number; name: string }; lines: BLine[]; shogu: { code: string; rate: number; name: string } | null; transportOn: boolean; notes: string[] };
export type BResult = { blocking: string[]; ctx: BCtx | null };

const OTHER: Record<BVer, BOtherRow[]> = { R6: B_OTHER_R6, R8: B_OTHER_R8 };
const BASIC: Record<BVer, BBasicRow[]> = { R6: B_BASIC_R6, R8: B_BASIC_R8 };
const findOther = (ver: BVer, code6: string) => OTHER[ver].find((r) => '46' + r[0] === code6);

export const capacityClass = (n: number) => (n <= 20 ? 1 : n <= 40 ? 2 : n <= 60 ? 3 : n <= 80 ? 4 : 5);
const CAP_LABEL = ['', '定員20人以下', '定員21〜40人', '定員41〜60人', '定員61〜80人', '定員81人以上'];

/** 設定(文字列)→正規化。DB/環境変数由来の値はここで検証する */
export function resolveB(office: Record<string, any>, ym: string): BResult {
  const raw: Partial<BSettings> = office['B型設定'] ?? {};
  const s: BSettings = { ...B_DEFAULTS };
  for (const k of Object.keys(B_DEFAULTS) as (keyof BSettings)[]) if (raw[k] != null && String(raw[k]).trim() !== '') s[k] = String(raw[k]).trim();
  const blocking: string[] = [];
  const block = (m: string) => blocking.push('【要確認】' + m);
  const ver = bVersion(ym);
  if (!ver) { block(`サービス提供年月 ${ym} は令和6年4月より前のため、B型のコード表に未対応です。`); return { blocking, ctx: null }; }
  if (!B_FEE_CLASS_OPTIONS.some((o) => o.v === s.fee_class)) block(`サービス費区分「${s.fee_class}」が不正です。`);
  const cap = Number(s.capacity);
  if (!Number.isInteger(cap) || cap < 1) block('利用定員(人)が未設定または不正です。');
  if (blocking.length) return { blocking, ctx: null };
  const capCls = capacityClass(cap);
  const cls = s.fee_class;
  const wageBased = 'ⅠⅡⅢ'.includes(cls);
  const notes: string[] = [];

  // --- 基本報酬 ---
  const planMissing = s.plan_missing === 'なし' ? 0 : Number(s.plan_missing);
  if (![0, 1, 2].includes(planMissing)) block(`計画未作成減算の指定「${s.plan_missing}」が不正です。(なし/1/2)`);
  const local = s.local_gov === 'あり' ? 1 : 0;
  const short = s.short_time === 'あり' ? 1 : 0;
  if (short && wageBased) block('短時間利用減算: サービスコード表上、短時間のコードはサービス費(Ⅳ)〜(Ⅵ)にのみ存在し、(Ⅰ)〜(Ⅲ)では該当コードを確認できません。厚労省の算定構造・留意事項で適用有無を確認してください。');
  if (s.other_reduction !== 'なし') block('その他の減算(身体拘束廃止未実施・虐待防止措置未実施・業務継続計画未策定・情報公表未報告・令和8年6月以降の新規指定事業所特例 等)に該当する場合のコード・単位は未対応です。サービスコード表の該当コードを個別に確認してください。');

  let baseRow: BBasicRow | undefined;
  if (wageBased) {
    const wage = Number(s.avg_wage);
    if (s.avg_wage === '' || !Number.isFinite(wage) || wage < 0) block('前年度の平均工賃月額(円)が未設定または不正です。');
    else {
      let scopes: string[] = [''];
      if (ver === 'R8') {
        if (s.r8_scope === '対象') scopes = ['', 'new']; else if (s.r8_scope === '対象外') scopes = ['', 'old'];
        else block('令和8年6月施行の基本報酬区分: 「改定対象/対象外」が未設定です。令和6年度改定前後で区分が上がっていない事業所は対象外(従前の区分を適用)とされています(厚労省 令和8年度改定事項 p.8)。該当は都道府県・市町村へ確認してください。');
      }
      if (!blocking.length) {
        const cands = BASIC[ver].filter((r) => r[1] === cls && r[2] === capCls && r[5] === 0 && !r[6] && !r[7] && scopes.includes(r[3]) && r[9] != null && wage >= r[9]! && (r[10] == null || wage < r[10]));
        if (cands.length !== 1) block(`平均工賃月額 ${wage}円に対応する報酬区分を一意に決定できません(候補${cands.length}件)。`);
        else baseRow = cands[0];
      }
    }
  } else {
    if (s.avg_wage !== '') notes.push('サービス費(Ⅳ)〜(Ⅵ)は平均工賃月額による区分がないため、平均工賃月額の入力は使用しません。');
    baseRow = BASIC[ver].find((r) => r[1] === cls && r[2] === capCls && r[5] === 0 && !r[6] && !r[7]);
  }
  let basic: BCtx['basic'] | null = null;
  if (baseRow && !blocking.length) {
    const v = BASIC[ver].find((r) => r[1] === baseRow![1] && r[2] === baseRow![2] && r[3] === baseRow![3] && r[4] === baseRow![4] && r[5] === planMissing && r[6] === local && r[7] === short);
    if (!v) block(`基本報酬コードが見つかりません(区分${cls}/${CAP_LABEL[capCls]}/未計画${planMissing}/地公体${local}/短時間${short})。`);
    else {
      basic = { code: '46' + v[0], units: v[8], name: v[11] };
      notes.push(`基本報酬: ${v[11]} ${v[8]}単位/日 (${ver === 'R8' ? '令和8年6月施行' : '令和6年度'}表 / ${CAP_LABEL[capCls]}${v[4] ? ' / 工賃区分' + (v[3] === 'new' ? '改定' : v[3] === 'old' ? '改定外' : '') + v[4] : ''})`);
    }
  }

  // --- 加算 ---
  const lines: BLine[] = [];
  const picked = s.addons.split(/[,、\s]+/).filter(Boolean);
  const known = new Set(B_ADDON_OPTIONS.map((o) => o.v));
  for (const k of picked) if (!known.has(k)) block(`適用加算に未知の指定「${k}」があります。`);
  const has = (k: string) => picked.includes(k);
  if (['fukushi1', 'fukushi2', 'fukushi3'].filter(has).length > 1) block('福祉専門職員配置等加算は(Ⅰ)〜(Ⅲ)のいずれか1つのみ選べます。');
  if (['jusho1', 'jusho2'].filter(has).length > 1) block('重度者支援体制加算は(Ⅰ)(Ⅱ)のいずれか1つのみ選べます。');
  if (['shikaku1', 'shikaku2'].filter(has).length > 1) block('視覚・聴覚言語障害者支援体制加算は(Ⅰ)(Ⅱ)のいずれか1つのみ選べます。');
  if (has('transport1') && has('transport2')) block('送迎加算は(Ⅰ)(Ⅱ)のいずれか1つのみ選べます。');
  for (const k of ['absent', 'shoki', 'houmon']) if (has(k)) block(`${B_ADDON_OPTIONS.find((o) => o.v === k)!.l.split('(')[0]}: 必要な実績データ(欠席・利用開始日・訪問記録)を本システムはまだ記録していないため自動算定できません。`);
  const add = (code6: string, per: BLine['per'], label: string) => {
    const r = findOther(ver, code6);
    if (!r) return block(`${label}: ${code6} がサービスコード表(${ver})に見つかりません。`);
    if (r[2] == null) return block(`${label}: ${code6} の単位数がサービスコード表に数値で載っていません。`);
    lines.push({ code: code6, unitsEach: r[2], name: r[1], per });
  };
  if (has('fukushi1')) add('466037', 'day', '福祉専門職員配置等加算(Ⅰ)');
  if (has('fukushi2')) add('466035', 'day', '福祉専門職員配置等加算(Ⅱ)');
  if (has('fukushi3')) add('466036', 'day', '福祉専門職員配置等加算(Ⅲ)');
  if (has('jusho1')) add(String(465810 + capCls - 1), 'day', '重度者支援体制加算(Ⅰ)');
  if (has('jusho2')) add(String(465815 + capCls - 1), 'day', '重度者支援体制加算(Ⅱ)');
  if (has('mokuhyo_shidoin')) add(String(465255 + capCls - 1), 'day', '目標工賃達成指導員配置加算');
  if (has('mokuhyo_tassei')) add('465087', 'day', '目標工賃達成加算');
  if (has('shikaku1')) add('465061', 'day', '視覚・聴覚言語障害者支援体制加算(Ⅰ)');
  if (has('shikaku2')) add('465060', 'day', '視覚・聴覚言語障害者支援体制加算(Ⅱ)');
  if (has('koujinou')) add('465078', 'day', '高次脳機能障害者支援体制加算');
  if (has('meal')) add('465070', 'meal', '食事提供体制加算');
  const same = s.transport_same_site === 'あり';
  if (has('transport1')) add(same ? '466592' : '466590', 'trip', '送迎加算(Ⅰ)');
  if (has('transport2')) add(same ? '466593' : '466591', 'trip', '送迎加算(Ⅱ)');

  // --- 処遇改善 ---
  let shogu: BCtx['shogu'] = null;
  if (s.shogu_class) {
    const d = B_SHOGU[ver].find((x) => x.v === s.shogu_class);
    if (!d) block(`処遇改善加算の区分「${s.shogu_class}」は${ver === 'R8' ? '令和8年6月以降' : '令和6年6月〜令和8年5月'}のコード表にありません。${ver === 'R8' ? '' : (ym < '202406' ? '令和6年6月より前は旧3加算で未対応です。' : '')}`);
    else {
      const r = findOther(ver, d.code);
      if (!r) block(`処遇改善加算: ${d.code} がコード表(${ver})に見つかりません。`);
      else shogu = { code: d.code, rate: d.rate, name: r[1] };
    }
    if (ver === 'R6' && ym < '202406') block('令和6年4・5月提供分の処遇改善加算(旧3加算)は未対応です。');
  }
  if (blocking.length || !basic) return { blocking, ctx: null };
  return { blocking: [], ctx: { ver, basic, lines, shogu, transportOn: lines.some((l) => l.per === 'trip'), notes } };
}
