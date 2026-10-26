// レオ送迎の実運転名 → 届け出上の担当名。
// 使うのは日誌・実績・職員配置（監査・届け出側）だけ。送迎表・予定・みんなの送迎・カレンダーには使わない。
// 横田祥は型表の旧称「祥先生」（staff_profiles）。従来どおり、その運転の日誌・実績の担当は齊藤。
// 宮本幸子の届け出は安藤尚子。型表の呼び名「宮本さん」も同じ人。空白の有無は normDriver で吸収する。
// 送迎・予定・カレンダーの保存値は実名側（宮本　幸子／宮本さん）なので、ここでは監査画面だけ写す。
// ほかの人を足すときは、この表に足す。
(function (g) {
  const LEO_FILING_DRIVERS = [
    { actual: ['横田祥', '祥先生'], filing: '齊藤' },
    { actual: ['宮本幸子'], filing: '安藤尚子' },
    { actual: ['宮本', '宮本さん'], filing: '安藤' },
  ];
  function normDriver(s) {
    return String(s ?? '').replace(/[\s\u3000]/g, '');
  }
  function filingDriverName(name) {
    if (name == null || name === '') return name;
    const key = normDriver(name);
    for (const row of LEO_FILING_DRIVERS) {
      if (row.actual.some(a => normDriver(a) === key)) return row.filing;
    }
    return name;
  }
  const DRIVER_FIELDS = { pick_driver: 1, drop_driver: 1 };
  // 日誌の入力欄に出す値。運転手欄だけ届け出名。data-old には元の値を残す。
  function nikkiShownValue(field, raw) {
    const v = raw ?? '';
    return DRIVER_FIELDS[field] ? (filingDriverName(v) ?? '') : v;
  }
  // 変更がなければ null。あるとき old はシート上の元の値、new は届け出名に揃えた値。
  function nikkiEditValue(field, raw, typed) {
    const shown = nikkiShownValue(field, raw);
    const next = DRIVER_FIELDS[field] ? (filingDriverName(typed) ?? '') : typed;
    if (next === shown) return null;
    return { old_value: raw ?? '', new_value: next };
  }
  function filingTripDrivers(row) {
    const r = row || {};
    return {
      pick: filingDriverName(r.pick_driver) || '',
      drop: filingDriverName(r.drop_driver) || '',
    };
  }
  const api = { LEO_FILING_DRIVERS, normDriver, filingDriverName, nikkiShownValue, nikkiEditValue, filingTripDrivers };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  Object.assign(g, api);
})(typeof window !== 'undefined' ? window : globalThis);
