// レオ業務日誌の算定加算（P列）を「なし」にする追加分。
//
// このリポジトリにも、Drive「レオ業務日誌 GAS（貼り付け用）.txt」（2026-10-03）にも、
// 食事（N列）・おやつ（O列）をシートへ書く処理は無い。朝7時の prefillForDate_ が
// 書くのは、名前が既に入っている行の開始・終了・運転手・「送迎なし」と、欠席者の名前だけ。
// 原本のコメントどおり、食事・おやつ・加算は書かない。
//
// シート上の食事「なし」は数式ではない（テンプレも日タブも数式0）。名前がある行に値が入っている。
// 算定加算も同じ条件にする：利用の行 9〜18 で、利用者名（B）があり、P が空欄で、数式でないときだけ「なし」。
// 名前が空の行と、すでに入っている値は変えない。テンプレは埋めない（名前が無い行に「なし」が付くため）。
//
// 貼る場所はライブの Apps Script「レオ業務日誌 自動処理」（script.google.com）。
// Drive の貼り付け用 txt は古いまま。あとでその txt で全部差し替えると、この追加は消える。
//
// 手順:
//   1. prefillForDate_ の最後、`if (wrote.length)` の直前に次の1行を足す。
//        fillBlankKasanNamed_(tab, dryRun, run, ymd);
//   2. このファイルの関数 rowsNeedingKasanNashi_ / fillBlankKasanNamed_ / fillBlankKasanToday
//      を、コードの一番下に貼って保存する。
//   3. dryRunPrefill を実行する（シートは変わらない。処理ログに件数が出る）。
//   4. 今日の空欄を埋めるときは fillBlankKasanToday を実行する。
//      別の日は、上の方の MANUAL_DATE を '2026-10-21' のようにしてから実行し、終わったら '' に戻す。
//   5. 翌朝からは 7時の prefillFromCalendar が同じ処理を行う。
//      7時よりあとに名前を足した行は、その場では入らない。fillBlankKasanToday をもう一度実行する。

/** 名前があり、値が空欄で、数式でない行の添字だけ返す。 */
function rowsNeedingKasanNashi_(names, values, formulas) {
  const norm = function (s) { return String(s == null ? '' : s).replace(/[\s\u3000]+/g, ' ').trim(); };
  const out = [];
  const n = Math.min(names.length, values.length);
  for (let i = 0; i < n; i++) {
    if (!norm(names[i])) continue;
    if (formulas && norm(formulas[i])) continue;
    if (norm(values[i])) continue;
    out.push(i);
  }
  return out;
}

/**
 * 利用の行（9〜18）だけ。利用者名がある行の算定加算が空欄なら「なし」。
 * 欠席者の行（20〜29）・名前が空の行・入っている値・数式は変えない。
 * 書き換えた件数を返す。
 */
function fillBlankKasanNamed_(sh, dryRun, run, ymd) {
  const N = CONFIG.NIKKI;
  const n = N.CHILD_LAST - N.CHILD_FIRST + 1;
  const names = sh.getRange(N.CHILD_FIRST, N.COL.NAME, n, 1).getDisplayValues();
  const vals = sh.getRange(N.CHILD_FIRST, N.COL.KASAN, n, 1).getDisplayValues();
  const formulas = sh.getRange(N.CHILD_FIRST, N.COL.KASAN, n, 1).getFormulas();
  const idxs = rowsNeedingKasanNashi_(
    names.map(function (r) { return r[0]; }),
    vals.map(function (r) { return r[0]; }),
    formulas.map(function (r) { return r[0]; })
  );
  if (!dryRun) {
    idxs.forEach(function (i) {
      sh.getRange(N.CHILD_FIRST + i, N.COL.KASAN).setValue('なし');
    });
  }
  if (idxs.length && run) {
    const label = (ymd ? ymd + '：' : '') + '算定加算の空欄 ' + idxs.length + '件を「なし」にしました（利用者名がある行だけ。入っている値はそのままです）。';
    run.info((dryRun ? '（試し）' : '') + label, ymd || '');
  }
  return idxs.length;
}

/** 手動用。MANUAL_DATE（空なら今日）のタブだけ。名前がある行の空欄の算定加算を「なし」にする。 */
function fillBlankKasanToday() {
  const ymd = CONFIG.MANUAL_DATE || todayYmd_();
  runJob_('算定加算の空欄をなしに', function (run) {
    const p = ymdParts_(ymd);
    const nikki = findNikkiSpreadsheet_(p.y, p.m);
    if (!nikki) { run.info(ymd + '：日誌ファイルがないので何もしませんでした。', ymd); return; }
    const tab = findDayTab_(nikki, p.d);
    if (!tab) { run.info(ymd + '：この日のタブがないので何もしませんでした。', ymd); return; }
    const n = fillBlankKasanNamed_(tab, false, run, ymd);
    if (!n) run.info(ymd + '：算定加算を入れる行はありませんでした（名前がないか、すでに入っています）。', ymd);
  }, ymd);
}
