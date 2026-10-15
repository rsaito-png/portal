/**
 * 国保連請求CSV(J111請求書+J121明細書 / J611実績記録票) 生成ロジック。
 * chamu-billing/gas/ChamuBilling.gs の buildCsvData 等を TypeScript へ移植したもの(出力はバイト一致を検証済み)。
 * 入力は GAS と同じ「月次集計」形式(日本語キーの行オブジェクト)。事業所固有情報は一切持たない。
 */
import { SERVICE_CODES } from './svc-codes';
import { B_DECISION_CODE, B_JISSEKI_FORM, B_SERVICE_TYPE, resolveB, type BCtx } from './b-type';

export type Row = Record<string, any>;
export type BuildInput = {
  office: Row; // 事業所マスタ1行
  unitMap?: Row; // 単位数マスタ(キー→値)
  svcRows?: Row[]; // サービスコード表
  users: Row[]; // 利用者マスタ
  agg: Row[]; // 実績記録集計(月次集計)
};
export type BuildResult = {
  claimRows: string[][];
  jissekiRows: string[][];
  summary: { ym: string; billingYm: string; ishiGen: boolean; users: number; totalUnits: number; totalCost: number; totalBenefit: number; totalBurden: number };
};

const pad2 = (n: number | string) => { const s = String(n); return s.length >= 2 ? s : '0' + s; };
export const yyyymm = (y: number, m: number) => String(y) + pad2(m);
export function nextYm(ym: string) {
  let y = Number(ym.substring(0, 4)), m = Number(ym.substring(4, 6)) + 1;
  if (m > 12) { m = 1; y++; }
  return yyyymm(y, m);
}
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export function ifFileName(prefix: string, ym: string) {
  const name = prefix + ym.substring(2, 6);
  if (!/^[A-Za-z][A-Za-z0-9]{0,7}$/.test(name)) throw new Error('ファイル名規則違反: ' + name);
  return name + '.CSV';
}
const toHalfDigits = (v: any) => String(v ?? '').replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
const padLeft = (s: any, len: number) => { let r = String(s ?? '').replace(/\.0$/, ''); while (r.length < len) r = '0' + r; return r; };
const padRecipientId = (v: any) => { const s = String(v ?? '').trim().replace(/\.0$/, ''); if (!s) return ''; return /^\d+$/.test(s) ? padLeft(s, 10) : s; };
const padCityCode = (v: any) => { const s = String(v ?? '').trim().replace(/\.0$/, ''); if (!s) return ''; return /^\d+$/.test(s) ? padLeft(s, 6) : s; };

export function resolveKeiyakuDays(v: any, year: number, month: number) {
  const gensoku = daysInMonth(year, month) - 8;
  const s = toHalfDigits(v).replace(/\.0+$/, '').trim();
  if (!s) return { days: gensoku, source: 'BLANK' };
  if (s.indexOf('原則') >= 0) return { days: gensoku, source: 'GENSOKU' };
  const m = s.match(/^(\d{1,3})\s*(日)?$/);
  if (m) return { days: Number(m[1]), source: 'NUMBER' };
  return { days: gensoku, source: 'UNKNOWN' };
}
const keiyakuQtyToIf = (days: number) => padLeft(String(Math.round(days * 100)), 5);
export function toYmd8(v: any): string {
  if (v === null || v === undefined || v === '') return '';
  const s = toHalfDigits(v).trim();
  if (/^\d{8}$/.test(s)) return s;
  const m = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  return m ? m[1] + pad2(m[2]) + pad2(m[3]) : '';
}

const KANA_FULL = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲンァィゥェォッャュョー・';
const KANA_HALF = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜｦﾝｧｨｩｪｫｯｬｭｮｰ･';
const DAKU = 'ガギグゲゴザジズゼゾダヂヅデドバビブベボ', DAKU_BASE = 'カキクケコサシスセソタチツテトハヒフヘホ';
const HANDAKU = 'パピプペポ', HANDAKU_BASE = 'ハヒフヘホ';
export function toHankakuKana(v: any): string {
  const s = String(v ?? '').trim();
  if (!s) return '';
  let out = '';
  for (let i = 0; i < s.length; i++) {
    let c = s.charAt(i), code = c.charCodeAt(0), k: number;
    if (code >= 0x3041 && code <= 0x3096) { c = String.fromCharCode(code + 0x60); code += 0x60; }
    if ((k = KANA_FULL.indexOf(c)) >= 0) { out += KANA_HALF.charAt(k); continue; }
    if ((k = DAKU.indexOf(c)) >= 0) { out += KANA_HALF.charAt(KANA_FULL.indexOf(DAKU_BASE.charAt(k))) + 'ﾞ'; continue; }
    if ((k = HANDAKU.indexOf(c)) >= 0) { out += KANA_HALF.charAt(KANA_FULL.indexOf(HANDAKU_BASE.charAt(k))) + 'ﾟ'; continue; }
    if (c === 'ヴ') { out += 'ｳﾞ'; continue; }
    if (c === '　' || c === ' ') { out += ' '; continue; }
    if (/^[A-Za-z0-9\-\.\(\)]$/.test(c)) { out += c; continue; }
    if (code >= 0xff01 && code <= 0xff5e) { out += String.fromCharCode(code - 0xfee0); continue; }
    if (code >= 0xff61 && code <= 0xff9f) { out += c; continue; } // 既に半角カナ(GASではSJIS往復後に同値になるサンプル入力の扱い)
    return '';
  }
  return out.substring(0, 25);
}

export function timeToMinutes(v: any): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' && isFinite(v)) { if (v >= 0 && v < 1.5) return Math.round((v % 1) * 24 * 60) % (24 * 60); }
  let s = String(v).trim();
  if (!s) return null;
  if (/GMT|UTC|1899|Japan|標準時/i.test(s)) return null;
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  if (/^\d{3,4}$/.test(s)) { if (s.length === 3) s = '0' + s; return Number(s.substring(0, 2)) * 60 + Number(s.substring(2, 4)); }
  return null;
}
export function formatTimeHHMM(v: any) {
  if (v === null || v === undefined || v === '') return '';
  const m = timeToMinutes(v);
  return m === null ? '' : pad2(Math.floor(m / 60)) + ':' + pad2(m % 60);
}
export function minutesToTimeBand(mins: number | null): string | null {
  if (mins === null || isNaN(mins) || mins < 0) return null;
  const h = mins / 60;
  if (h < 3) return '3時間未満';
  if (h < 4) return '3時間以上4時間未満';
  if (h < 5) return '4時間以上5時間未満';
  if (h < 6) return '5時間以上6時間未満';
  if (h < 7) return '6時間以上7時間未満';
  if (h < 8) return '7時間以上8時間未満';
  return '8時間以上9時間未満';
}
export function deriveTimeBand(startVal: any, endVal: any) {
  const a = timeToMinutes(startVal), b = timeToMinutes(endVal);
  if (a === null || b === null) return null;
  let d = b - a; if (d < 0) d += 1440;
  return minutesToTimeBand(d);
}
export function normalizeTimeBandLabel(v: any) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (s.indexOf('時間') >= 0) return s;
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Math.floor(Number(s));
    if (n < 3) return '3時間未満';
    if (n >= 8) return '8時間以上9時間未満';
    return `${n}時間以上${n + 1}時間未満`;
  }
  return s;
}

function ifRecord(itemCount: number, items: Record<number, any>): string[] {
  const rec: string[] = new Array(itemCount).fill('');
  for (const no of Object.keys(items)) {
    const n = Number(no);
    if (n < 1 || n > itemCount) throw new Error(`項番範囲外: ${no} / ${itemCount}`);
    const v = items[n];
    rec[n - 1] = v === null || v === undefined ? '' : String(v);
  }
  return rec;
}

function findBasicCode(svcRows: Row[], capacity: string, timeBand: string, kubun: any, ishiGen: boolean) {
  let k = Number(kubun); if (k <= 2) k = 2;
  const cat = ishiGen ? '基本医減' : '基本';
  for (const r of svcRows) {
    if (String(r['区分']) !== cat || String(r['定員規模']) !== String(capacity) || String(r['時間帯']) !== String(timeBand) || Number(r['障害支援区分']) !== k) continue;
    return { code: String(r['サービスコード']), units: Number(r['単位数']), name: String(r['名称']) };
  }
  throw new Error((ishiGen ? '医師未配置減算の' : '') + `基本サービスコード未登録: 定員規模=${capacity} 時間帯=${timeBand} 区分=${kubun}`);
}
function findAddonCode(svcRows: Row[], category: string, nameHint?: string) {
  for (const r of svcRows) {
    if (String(r['区分']) !== category) continue;
    if (nameHint && String(r['名称']).indexOf(nameHint) < 0) continue;
    return { code: String(r['サービスコード']), units: Number(r['単位数']), name: String(r['名称']) };
  }
  return null;
}
function sogeiUnitsForUser(u: Row, svcRows: Row[]) {
  const kind = String(u['送迎加算区分'] || 'I').toUpperCase();
  if (kind === 'なし' || kind === 'N' || kind === 'NONE') return { code: '', units: 0, name: '' };
  const hint = kind === 'II' || kind === '2' ? '送迎加算Ⅱ' : kind === '重度' ? '重度' : '送迎加算Ⅰ';
  const f = findAddonCode(svcRows, '送迎', hint);
  if (!f) throw new Error('送迎加算コード未登録: ' + kind);
  return f;
}
export const isIshiGen = (office: Row) => /^(あり|有|有り|する|1|○|はい|true)$/.test(String(office['医師未配置減算'] ?? '').trim());
export function resolveBillingYm(ym: string, today?: Date) {
  const d = today ?? new Date();
  const cur = yyyymm(d.getFullYear(), d.getMonth() + 1);
  const nxt = nextYm(ym);
  return cur > nxt ? cur : nxt;
}
const formatTimeForJisseki = (v: any) => { if (v === null || v === undefined || v === '') return ''; const m = timeToMinutes(v); return m === null ? '' : pad2(Math.floor(m / 60)) + pad2(m % 60); };
function santeiHoursToIf(s: string, e: string) {
  if (!s || !e) return '';
  const sm = timeToMinutes(s), em = timeToMinutes(e);
  if (sm === null || em === null || em <= sm) return '';
  return padLeft(String(Math.floor(((em - sm) * 100) / 60)), 4);
}
function wrapFile(dataRows: string[][], dataType: string, officeNo: string, processYm: string) {
  if (!/^\d{6}$/.test(processYm)) throw new Error('処理対象年月が不正: ' + processYm);
  const rows: string[][] = [['1', '1', '0', String(dataRows.length), dataType, '0', officeNo, '0', '1', processYm, '']];
  dataRows.forEach((r, i) => rows.push(['2', String(i + 2), ...r]));
  rows.push(['3', String(dataRows.length + 2)]);
  return rows;
}

export function formatField(value: any) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return s === '' ? '' : '"' + s.replace(/"/g, '""') + '"';
}
export const rowsToCsvText = (rows: string[][]) => rows.map((r) => r.map(formatField).join(',')).join('\r\n') + '\r\n';

export function buildCsvData(year: number, month: number, input: BuildInput, today?: Date): BuildResult {
  const ym = yyyymm(year, month);
  const { office, users } = input;
  const unitMap = input.unitMap ?? {};
  const svcRows = input.svcRows ?? SERVICE_CODES;
  const agg = input.agg.filter((r) => String(r['対象年月']) === ym);

  const officeNo = String(office['事業所番号'] ?? '');
  const svcType = String(office['サービス種類コード'] || '22');
  const isB = svcType === B_SERVICE_TYPE; // 就労継続支援B型(46)は b-type.ts のコード表・計算を使う。それ以外は従来の生活介護(22)ロジック
  let bctx: BCtx | null = null;
  if (isB) {
    const rb = resolveB(office, ym);
    if (rb.blocking.length || !rb.ctx) throw new Error('B型の要確認項目があるため出力できません: ' + rb.blocking.join(' / '));
    bctx = rb.ctx;
  }
  const capacity = String(office['利用定員規模'] || '11-20');
  const defaultBand = normalizeTimeBandLabel(office['標準提供時間帯'] || '6時間以上7時間未満');
  const regionCode = String(office['地域区分コード'] || '20');
  const unitPrice = Number(office['地域区分単価'] || unitMap['地域単価_その他'] || 10);
  const shoguRate = isB ? (bctx!.shogu?.rate ?? 0) : Number(office['処遇改善加算率'] || unitMap['処遇改善率_IIロ'] || 0.096);
  const shoguItem = String(office['処遇改善サービスコード項目'] || '5175');
  const shoguCode = isB ? (bctx!.shogu?.code ?? '') : svcType + shoguItem;
  const ishiGen = isIshiGen(office);
  const mealUnitsMaster = Number(unitMap['食事提供体制加算_単位'] || 30);
  const mealAddon = isB ? null : findAddonCode(svcRows, '食事', '食事');
  const mealCode = mealAddon ? mealAddon.code : svcType + '5070';
  const mealUnits = mealAddon && mealAddon.units ? mealAddon.units : mealUnitsMaster;

  const userById: Record<string, Row> = {};
  for (const u of users) userById[String(u['利用者ID'])] = u;

  type Bill = { user: Row; agg: Row; useDays: number; firstDay: number; go: number; back: number; mealTimes: number; detailLines: any[]; totalUnits: number; totalCost: number; userBurden: number; benefit: number };
  const bills: Bill[] = [];
  for (const ag of agg) {
    const u = userById[String(ag['利用者ID'])];
    if (!u) continue;
    const useDays = Number(ag['利用日数'] || 0);
    if (useDays <= 0) continue;
    const detailLines: any[] = [];
    const bucket: Record<string, { unitsEach: number; times: number; name: string }> = {};
    let firstDay = 0;
    for (let day = 1; day <= 31; day++) {
      if (String(ag['利用_' + pad2(day)]) !== '1') continue;
      if (!firstDay) firstDay = day;
      const band = String(ag['時間_' + pad2(day)] || defaultBand);
      const basic = isB ? bctx!.basic : findBasicCode(svcRows, capacity, band, u['障害支援区分'], ishiGen);
      if (!bucket[basic.code]) bucket[basic.code] = { unitsEach: basic.units, times: 0, name: basic.name };
      bucket[basic.code].times++;
    }
    for (const code of Object.keys(bucket)) {
      const b = bucket[code];
      detailLines.push({ code, unitsEach: b.unitsEach, times: b.times, serviceUnits: b.unitsEach * b.times, name: b.name });
    }
    const go = Number(ag['送迎往回数'] || 0), back = Number(ag['送迎復回数'] || 0);
    const trips = go + back;
    const mealTimes = Number(ag['食事回数'] || 0);
    if (isB) {
      // B型: 加算は事業所設定(b-type.ts)で選択されたもののみ。日数/食事回数/送迎回数×単位数。利用者の送迎区分が「なし」なら送迎加算なし
      const noTransport = /^(なし|N|NONE)$/i.test(String(u['送迎加算区分'] || ''));
      for (const l of bctx!.lines) {
        const times = l.per === 'day' ? useDays : l.per === 'meal' ? mealTimes : noTransport ? 0 : trips;
        if (times > 0) detailLines.push({ code: l.code, unitsEach: l.unitsEach, times, serviceUnits: l.unitsEach * times, name: l.name });
      }
    } else {
      const sd = sogeiUnitsForUser(u, svcRows);
      if (trips > 0 && sd.units > 0) detailLines.push({ code: sd.code, unitsEach: sd.units, times: trips, serviceUnits: sd.units * trips, name: sd.name });
      if (mealTimes > 0) detailLines.push({ code: mealCode, unitsEach: mealUnits, times: mealTimes, serviceUnits: mealUnits * mealTimes, name: '食事提供体制加算' });
    }
    let sumBefore = 0;
    for (const d of detailLines) sumBefore += d.serviceUnits;
    let shoguUnits = 0;
    if (shoguRate > 0) {
      shoguUnits = Math.round(sumBefore * shoguRate);
      detailLines.push({ code: shoguCode, unitsEach: shoguUnits, times: 1, serviceUnits: shoguUnits, name: '福祉・介護職員等処遇改善加算' });
    }
    const totalUnits = sumBefore + shoguUnits;
    const totalCost = Math.floor(totalUnits * unitPrice);
    const ichiwari = Math.floor(totalCost * 0.1);
    const cap = Number(u['上限月額'] || 0);
    let afterCap = cap > 0 ? Math.min(ichiwari, cap) : ichiwari;
    if (String(u['上限管理有無']) === '無' && cap === 0) afterCap = 0;
    bills.push({ user: u, agg: ag, useDays, firstDay: firstDay || 1, go, back, mealTimes, detailLines, totalUnits, totalCost, userBurden: afterCap, benefit: totalCost - afterCap });
  }

  const cityOrder: string[] = [];
  const byCity: Record<string, Bill[]> = {};
  for (const b of bills) {
    const k = padCityCode(b.user['支給決定市町村番号']);
    if (!byCity[k]) { byCity[k] = []; cityOrder.push(k); }
    byCity[k].push(b);
  }
  cityOrder.sort();

  const claimData: string[][] = [], jissekiData: string[][] = [];
  const unitPriceIf = String(Math.round(unitPrice * 1000));
  for (const cityNo of cityOrder) {
    const cb = byCity[cityNo];
    let cUnits = 0, cCost = 0, cBenefit = 0, cBurden = 0;
    for (const b of cb) { cUnits += b.totalUnits; cCost += b.totalCost; cBenefit += b.benefit; cBurden += b.userBurden; }
    const cCount = cb.length;
    claimData.push(ifRecord(23, { 1: 'J111', 2: '01', 3: ym, 4: cityNo, 5: officeNo, 6: cBenefit, 7: cCount, 8: cUnits, 9: cCost, 10: cBenefit, 12: cBurden, 17: cCount, 18: cUnits, 19: cCost, 20: cBenefit, 22: cBurden }));
    claimData.push(ifRecord(14, { 1: 'J111', 2: '02', 3: ym, 4: cityNo, 5: officeNo, 6: '1', 7: svcType, 8: cCount, 9: cUnits, 10: cCost, 11: cBenefit, 13: cBurden }));
    for (const bill of cb) {
      const u = bill.user, city = cityNo;
      const hihokensha = padRecipientId(u['受給者証番号']);
      const kanaHalf = toHankakuKana(u['氏名カナ']);
      const capYen = String(u['上限月額'] || 0);
      const kanri = String(u['上限管理有無']) === '有';
      claimData.push(ifRecord(35, { 1: 'J121', 2: '01', 3: ym, 4: city, 5: officeNo, 6: hihokensha, 8: kanaHalf, 10: regionCode, 11: '1', 12: capYen, 13: '1',
        15: kanri ? String(u['上限額管理事業所番号'] || '') : '', 20: bill.totalUnits, 21: bill.totalCost, 22: bill.userBurden, 25: bill.userBurden, 26: kanri ? bill.userBurden : '', 27: bill.userBurden, 28: bill.benefit }));
      const svcStart = toYmd8(u['サービス開始年月日']) || ym + pad2(bill.firstDay);
      claimData.push(ifRecord(12, { 1: 'J121', 2: '02', 3: ym, 4: city, 5: officeNo, 6: hihokensha, 7: svcType, 8: svcStart, 10: bill.useDays }));
      for (const l of bill.detailLines)
        claimData.push(ifRecord(11, { 1: 'J121', 2: '03', 3: ym, 4: city, 5: officeNo, 6: hihokensha, 7: l.code, 8: l.unitsEach, 9: l.times, 10: l.serviceUnits }));
      const ichi2 = Math.floor(bill.totalCost * 0.1);
      claimData.push(ifRecord(33, { 1: 'J121', 2: '04', 3: ym, 4: city, 5: officeNo, 6: hihokensha, 7: svcType, 8: '1', 9: bill.useDays, 10: bill.totalUnits, 11: unitPriceIf, 12: '0',
        13: bill.totalCost, 14: ichi2, 15: ichi2, 16: bill.userBurden, 20: kanri ? bill.userBurden : '', 21: bill.userBurden, 22: bill.benefit }));
      const kd = resolveKeiyakuDays(u['契約支給量_日'], year, month);
      claimData.push(ifRecord(11, { 1: 'J121', 2: '05', 3: ym, 4: city, 5: officeNo, 6: hihokensha, 7: String(u['決定サービスコード'] || (isB ? B_DECISION_CODE : '221000')), 8: keiyakuQtyToIf(kd.days),
        9: toYmd8(u['契約開始年月日']) || ym + '01', 10: toYmd8(u['契約終了年月日']), 11: toHalfDigits(u['事業者記入欄番号'] || '1') }));

      const dayRecs: string[][] = [];
      let sumSantei = 0;
      for (let d = 1; d <= 31; d++) {
        if (String(bill.agg['利用_' + pad2(d)]) !== '1') continue;
        const sog = String(bill.agg['送迎_' + pad2(d)] || 'なし');
        const goN = sog === '両' || sog === '往' ? '1' : '', backN = sog === '両' || sog === '復' ? '1' : '';
        const mealN = String(bill.agg['食事_' + pad2(d)]) === '1' ? '1' : '';
        const so = formatTimeForJisseki(bill.agg['開始_' + pad2(d)]), eo = formatTimeForJisseki(bill.agg['終了_' + pad2(d)]);
        const santei = santeiHoursToIf(so, eo);
        if (santei && !isB) sumSantei += Number(santei);
        dayRecs.push(ifRecord(113, { 1: 'J611', 2: '02', 3: ym, 4: city, 5: officeNo, 6: hihokensha, 7: isB ? B_JISSEKI_FORM : '0701', 9: pad2(d), 14: so, 15: eo, 16: isB ? '' : santei, 21: goN, 22: backN, 32: mealN }));
      }
      jissekiData.push(ifRecord(172, { 1: 'J611', 2: '01', 3: ym, 4: city, 5: officeNo, 6: hihokensha, 7: isB ? B_JISSEKI_FORM : '0701',
        19: sumSantei > 0 ? padLeft(String(sumSantei), 5) : '', 34: bill.go + bill.back > 0 ? bill.go + bill.back : '', 45: bill.mealTimes > 0 ? bill.mealTimes : '' }));
      jissekiData.push(...dayRecs);
    }
  }
  const billingYm = resolveBillingYm(ym, today);
  const sum = bills.reduce((a, b) => ({ u: a.u + b.totalUnits, c: a.c + b.totalCost, b: a.b + b.benefit, p: a.p + b.userBurden }), { u: 0, c: 0, b: 0, p: 0 });
  return {
    claimRows: wrapFile(claimData, 'J11', officeNo, billingYm),
    jissekiRows: wrapFile(jissekiData, 'J61', officeNo, billingYm),
    summary: { ym, billingYm, ishiGen, users: bills.length, totalUnits: sum.u, totalCost: sum.c, totalBenefit: sum.b, totalBurden: sum.p },
  };
}
