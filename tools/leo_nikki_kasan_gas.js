// レオ業務日誌 GAS に足す処理（本体は Drive「レオ業務日誌 GAS（貼り付け用）.txt」）。
// 算定加算（P列・CONFIG.NIKKI.COL.KASAN）が空欄の行だけ「なし」にする。
// すでに入っている値と数式は変えない。ポータル以外の事業所の日誌は対象外。
// 呼び方:
//   buildNikki_ … テンプレをコピーする前に fillBlankKasan_(tmpl, false)、日タブ作成後に fillBlankKasan_(sh, false)
//   prefillForDate_ … 日誌ファイルを開いた直後に fillBlankKasanInFile_(nikki, dryRun, run)

/** 算定加算（P列）が空欄の行だけ「なし」にする。入っている値と数式は変えない。書き換えた件数を返す。 */
function fillBlankKasan_(sh, dryRun) {
  const N = CONFIG.NIKKI;
  const c = N.COL.KASAN;
  const n = N.CHILD_LAST - N.CHILD_FIRST + 1;
  const vals = sh.getRange(N.CHILD_FIRST, c, n, 1).getDisplayValues();
  const formulas = sh.getRange(N.CHILD_FIRST, c, n, 1).getFormulas();
  const rows = [];
  for (let i = 0; i < vals.length; i++) {
    if (formulas[i][0]) continue;
    if (text_(vals[i][0])) continue;
    rows.push(N.CHILD_FIRST + i);
  }
  if (!dryRun) rows.forEach(function (row) { sh.getRange(row, c).setValue('なし'); });
  return rows.length;
}

/** テンプレと、日のタブ全部の算定加算の空欄を「なし」にする。 */
function fillBlankKasanInFile_(ss, dryRun, run) {
  let n = 0;
  const tmpl = sheetByNameLoose_(ss, CONFIG.NIKKI.TEMPLATE);
  if (tmpl) n += fillBlankKasan_(tmpl, dryRun);
  ss.getSheets().forEach(function (sh) {
    if (dayOfTabName_(sh.getName()) !== null) n += fillBlankKasan_(sh, dryRun);
  });
  if (n && run) run.info((dryRun ? '（試し）' : '') + '算定加算の空欄 ' + n + '件を「なし」にしました（入っている値はそのままです）。');
  return n;
}
