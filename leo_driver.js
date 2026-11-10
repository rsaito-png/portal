// レオ送迎の実運転名 → 届け出上の担当名。
// 使うのは日誌・実績・職員配置（監査・届け出側）だけ。送迎表・予定・みんなの送迎・カレンダーには使わない。
// 横田祥（型表の旧称「祥先生」）は 2026-11-10 にレオ職員になったので、それ以降の運転は読み替えない（日誌・実績も「横田　祥」）。
// 2026-11-09 までの記録は従来どおり齊藤として出す（until。日付を渡したときだけ効く。過去の日誌・実績は書き換えない）。
// 宮本幸子の届け出は代表理事の齊藤連（連先生）。型表の呼び名「宮本」「宮本さん」も齊藤連。空白の有無は normDriver で吸収する。
// 送迎・予定・カレンダーの保存値は実名側（宮本　幸子／宮本さん）なので、ここでは監査画面だけ写す。
// ほかの人を足すときは、この表に足す。
(function (g) {
  const LEO_FILING_DRIVERS = [
    { actual: ['横田祥', '祥先生'], filing: '齊藤', until: '2026-11-09' },
    { actual: ['宮本幸子'], filing: '齊藤連' },
    { actual: ['宮本', '宮本さん'], filing: '齊藤連' },
  ];
  function normDriver(s) {
    return String(s ?? '').replace(/[\s\u3000]/g, '');
  }
  const dayKey = d => String(d ?? '').trim().replace(/\//g, '-').slice(0, 10);
  function filingDriverName(name, day) {
    if (name == null || name === '') return name;
    const key = normDriver(name), dk = dayKey(day);
    for (const row of LEO_FILING_DRIVERS) {
      if (row.until && (!dk || dk > row.until)) continue;
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
      pick: filingDriverName(r.pick_driver, r.day) || '',
      drop: filingDriverName(r.drop_driver, r.day) || '',
    };
  }

  // 運転手・職員のプルダウンに出す名前。職員マスタ（レオ所属・在籍中）＋送迎予定に入ったことのある名前。
  // 一般職員は RLS で自分の行しか読めないので、予定の名前で補う。保存値（全角空白入り）の形を優先する。
  let driverCache = null;
  // 選択肢に出さない人（今の保存値なら残る）。宮本幸子は休職（2026-11-10 会長）。運転は齊藤　連が担当
  const DRIVER_HIDE = new Set(['宮本幸子', '宮本']);
  async function leoDriverNames() {
    if (typeof DEMO !== 'undefined' && DEMO) return ['職員X', '職員Y'];
    if (driverCache) return driverCache;
    const q = typeof sb === 'function' ? sb : null;
    if (!q) return [];
    const since = new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10);
    // 全職員分は leo_staff_names()（名前だけ返す関数・supabase/leo_staff_names.sql）。読めなければ職員マスタ直読みで補う
    const [evs, rpc, prof] = await Promise.all([
      q(`leo_events?select=staff&staff=not.is.null&day=gte.${since}&limit=5000`).catch(() => []),
      q('rpc/leo_staff_names', { method: 'POST', body: '{}' }).catch(() => null),
      q('staff_profiles?select=full_name,nikki_name,office,extra_offices,active').catch(() => []),
    ]);
    const out = [], seen = new Set();
    const add = n => { const v = String(n ?? '').trim(); const k = normDriver(v); if (!v || seen.has(k) || DRIVER_HIDE.has(k)) return; seen.add(k); out.push(v); };
    // 関数が読めたら在籍のレオ職員だけ。読めないときだけ予定に出た名前と職員マスタ直読みで補う
    const fromRpc = (Array.isArray(rpc) ? rpc : []).map(r => r && typeof r === 'object' ? r.name : r).filter(Boolean);
    if (fromRpc.length) { fromRpc.forEach(add); out.sort((a, b) => a.localeCompare(b, 'ja')); driverCache = out; return out; }
    (evs || []).forEach(e => add(e.staff));
    (prof || []).filter(r => r && r.active !== false && (r.office === 'レオ' || (Array.isArray(r.extra_offices) && r.extra_offices.includes('レオ'))))
      .forEach(r => add(r.nikki_name || r.full_name));
    out.sort((a, b) => a.localeCompare(b, 'ja'));
    if (out.length) driverCache = out;
    return out;
  }
  // <option> の並び。先頭は空欄。今の保存値は、同じ人（空白違い）ならその選択肢の値を保存値に置き換え、無ければ足して選んだ状態にする。
  function driverOptionsHtml(names, cur, blank) {
    const e = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const v = String(cur ?? '').trim();
    const seen = new Set(), list = [];
    (names || []).forEach(n => { const t = String(n ?? '').trim(), k = normDriver(t); if (t && !seen.has(k)) { seen.add(k); list.push(t); } });
    list.sort((a, b) => a.localeCompare(b, 'ja'));
    if (v) {
      const i = list.findIndex(n => normDriver(n) === normDriver(v));
      if (i >= 0) list[i] = v; else list.unshift(v);
    }
    return `<option value="">${e(blank || '— 選んでください —')}</option>` + list.map(n => `<option value="${e(n)}"${n === v ? ' selected' : ''}>${e(n)}</option>`).join('');
  }
  const api = { LEO_FILING_DRIVERS, normDriver, filingDriverName, nikkiShownValue, nikkiEditValue, filingTripDrivers, leoDriverNames, driverOptionsHtml };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  Object.assign(g, api);
})(typeof window !== 'undefined' ? window : globalThis);
