// Shift_JIS(CP932)出力と IF仕様の機械チェック。b-portal の output.ts(iconv-lite)をブラウザ用に移植:
// 文字コード変換は ポータル同梱の encoding-japanese(vendor/encoding.min.js、グローバル Encoding)を使う。
import { buildCsvData, ifFileName, rowsToCsvText, type BuildInput, type BuildResult } from './billing/core';
declare const Encoding: any;
const enc = () => (globalThis as any).Encoding as any;
export const toSjis = (rows: string[][]): Uint8Array => Uint8Array.from(enc().convert(enc().stringToCode(rowsToCsvText(rows)), { to: 'SJIS', from: 'UNICODE' }));
const fromSjis = (b: Uint8Array): string => enc().codeToString(enc().convert(Array.from(b), { to: 'UNICODE', from: 'SJIS' }));
const latin1 = (b: Uint8Array) => { let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return s; };
export const bytesLatin1 = latin1;

export type BillingFiles = { j111: { name: string; bytes: Uint8Array }; j611: { name: string; bytes: Uint8Array }; summary: BuildResult['summary']; issues: string[] };
export function buildBillingFiles(year: number, month: number, input: BuildInput, today?: Date): BillingFiles {
  const r = buildCsvData(year, month, input, today);
  const ym = r.summary.ym;
  const j111 = { name: ifFileName('J111', ym), bytes: toSjis(r.claimRows) };
  const j611 = { name: ifFileName('J611', ym), bytes: toSjis(r.jissekiRows) };
  const issues = [...specCheck(j111.name, j111.bytes, 'J11'), ...specCheck(j611.name, j611.bytes, 'J61')];
  return { j111, j611, summary: r.summary, issues };
}

const ITEMS: Record<string, number> = { 'J111/01': 23, 'J111/02': 14, 'J121/01': 35, 'J121/02': 12, 'J121/03': 11, 'J121/04': 33, 'J121/05': 11, 'J611/01': 172, 'J611/02': 113 };
function parseCsv(text: string): string[][] {
  return text.split('\n').filter((l, i, a) => !(i === a.length - 1 && l === '')).map((line) => {
    const out: string[] = []; let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
    }
    out.push(cur); return out;
  });
}
const nextYmStr = (ym: string) => { let y = +ym.slice(0, 4), m = +ym.slice(4) + 1; if (m > 12) { y++; m = 1; } return `${y}${String(m).padStart(2, '0')}`; };

/** chamu-billing/test/spec_check.py の TypeScript 移植(IF仕様の機械チェック)。指摘の配列を返す(0件が正常)。 */
export function specCheck(fileName: string, bytes: Uint8Array, dataType: 'J11' | 'J61'): string[] {
  const errs: string[] = [];
  const raw = latin1(bytes);
  if (raw.indexOf('\r\n') < 0) errs.push('改行がCRLFでない');
  if (!/^[A-Za-z][A-Za-z0-9]{0,7}\.CSV$/i.test(fileName)) errs.push(`ファイル名規則違反: ${fileName}`);
  const rows = parseCsv(fromSjis(bytes).replace(/\r\n/g, '\n'));
  const ctl = rows[0], data = rows.slice(1, -1), end = rows[rows.length - 1];
  if (ctl.length !== 11) errs.push(`コントロールレコード項目数 ${ctl.length} != 11`);
  if (ctl[0] !== '1' || ctl[1] !== '1' || ctl[2] !== '0') errs.push('コントロール 1/2/3 不正');
  if (ctl[3] !== String(data.length)) errs.push(`レコード件数 ${ctl[3]} != ${data.length}`);
  if (ctl[4] !== dataType) errs.push(`データ種別 ${ctl[4]} != ${dataType}`);
  if (data.length && ctl[4] !== data[0][2].slice(0, 3)) errs.push('データ種別が先頭データの交換情報識別番号上3桁と不一致');
  if (ctl[5] !== '0' || ctl[7] !== '0' || ctl[8] !== '1') errs.push('市町村番号0/都道府県番号0/媒体区分1 不正');
  if (ctl[10] !== '') errs.push('予備に値');
  const svcYm = data.length ? data[0][4] : '';
  if (data.length && ctl[9] < nextYmStr(svcYm)) errs.push(`処理対象年月 ${ctl[9]} が提供月翌月 ${nextYmStr(svcYm)} より前`);
  data.forEach((r, i) => {
    const ln = i + 2;
    if (r[0] !== '2' || r[1] !== String(i + 2)) errs.push(`行${ln}: レコード種別/連番不正`);
    const key = `${r[2]}/${r[3]}`, n = r.length - 2;
    if (!(key in ITEMS)) { errs.push(`行${ln}: 未知レコード ${key}`); return; }
    if (n !== ITEMS[key]) errs.push(`行${ln}: ${key} 項目数 ${n} != ${ITEMS[key]}`);
    if (r[4] !== svcYm) errs.push(`行${ln}: サービス提供年月不一致`);
    r.slice(2).forEach((v, j) => { for (const ch of v) { const c = ch.charCodeAt(0); if (c > 0x7e && !(c >= 0xff61 && c <= 0xff9f)) { errs.push(`行${ln}: ${key} 項番${j + 1} に全角文字`); break; } } });
    if (key === 'J611/02' && !/^\d{2}$/.test(r[10])) errs.push(`行${ln}: J611-02 項番9 日付が2桁でない`);
    if ((key === 'J111/01' || key === 'J111/02') && r[5] === '0') errs.push(`行${ln}: J111 市町村番号が0`);
  });
  if (end.length !== 2 || end[0] !== '3' || end[1] !== String(rows.length)) errs.push('エンドレコード不正');
  if (dataType === 'J11') {
    let cur = ''; const sums: Record<string, { j: number[]; n: number; u: number; c: number }> = {};
    for (const r of data) {
      if (r[2] === 'J111' && r[3] === '01') { cur = r[5]; sums[cur] = { j: [+r[8], +r[9], +r[10]], n: 0, u: 0, c: 0 }; }
      if (r[2] === 'J121' && r[3] === '01') { if (r[5] !== cur) errs.push(`J121 市町村 ${r[5]} が直前の請求書 ${cur} と不一致`); const s = sums[cur]; if (s) { s.n++; s.u += +r[21]; s.c += +r[22]; } }
    }
    for (const [c, s] of Object.entries(sums)) if (s.j[0] !== s.n || s.j[1] !== s.u || s.j[2] !== s.c) errs.push(`市町村${c}: J111と J121計 が不一致`);
  }
  return errs;
}
