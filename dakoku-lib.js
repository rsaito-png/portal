// 出退勤打刻の判定（画面 dakoku.js と node tools/dakoku_check.js が共用）。
// 距離の式は dakoku-gas/Code.gs の dkMeters_ と同じ（地球半径 6371000m）。
// 個人の氏名・メールはこのファイルに書かない。見本は架空の名前だけ。
(function (root) {
  const R = 6371000;
  const KINDS = ['出勤', '退勤'];

  function on(v) {
    if (v === true || v === 1) return true;
    const s = String(v == null ? '' : v).trim().toUpperCase();
    return s === 'TRUE' || s === '1' || s === 'YES';
  }
  function num(v) {
    if (v === '' || v == null) return null;
    const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  function pick(o, key, header) {
    if (o && Object.prototype.hasOwnProperty.call(o, key) && o[key] !== undefined) return o[key];
    if (o && Object.prototype.hasOwnProperty.call(o, header)) return o[header];
    return undefined;
  }
  // 2点間の距離（メートル）。同じ式を GAS にも置いてある。
  function meters(lat1, lng1, lat2, lng2) {
    const rad = d => d * Math.PI / 180;
    const dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  }
  function officeView(o) {
    o = o || {};
    return {
      name: String(pick(o, 'name', '事業所名') || '').trim(),
      code: String(pick(o, 'code', '略称') || '').trim(),
      radius: num(pick(o, 'radius', '打刻許可半径(m)')),
      lat: num(pick(o, 'lat', '緯度')),
      lng: num(pick(o, 'lng', '経度')),
      enabled: on(pick(o, 'enabled', '有効')),
    };
  }
  function staffView(s) {
    s = s || {};
    return {
      id: String(pick(s, 'id', '職員ID') || '').trim(),
      name: String(pick(s, 'name', '氏名') || '').trim(),
      office: String(pick(s, 'office', '所属事業所') || '').trim(),
      email: String(pick(s, 'email', 'ログイン用メール') || '').trim(),
      role: String(pick(s, 'role', '役割(本人/責任者)') || '').trim(),
      enabled: on(pick(s, 'enabled', '有効')),
    };
  }
  // 設定.有効が TRUE の事業所だけ。FALSE は出さない。
  function visibleOffices(offices) {
    return (offices || []).map(officeView).filter(o => o.enabled && o.name);
  }
  function staffFor(staff, officeName) {
    return (staff || []).map(staffView).filter(s => s.enabled && s.office === officeName && s.id && s.name);
  }
  // メールが職員シートと1件だけ一致すれば本人。空欄・不一致のときは名前選択（暫定）。
  function resolveStaff(opt) {
    const list = staffFor(opt.staff, opt.office);
    const email = String(opt.email || '').trim().toLowerCase();
    const hits = email ? list.filter(s => s.email.toLowerCase() === email) : [];
    const pool = hits.length > 1 ? hits : list;
    if (hits.length === 1) return { staff: hits[0], mode: 'email', list: pool };
    const chosen = pool.find(s => s.id === String(opt.chosenId || ''));
    return { staff: chosen || null, mode: hits.length > 1 ? 'ambiguous' : 'pick', list: pool };
  }
  // 現在地が許可半径の中か。範囲外・座標なしは打刻不可。
  function judge(pos, office) {
    const o = officeView(office);
    if (!o.enabled) return { ok: false, distance: null, reason: 'この事業所は打刻を停止しています' };
    if (o.lat == null || o.lng == null) return { ok: false, distance: null, reason: '緯度・経度が未設定です' };
    if (!(o.radius > 0)) return { ok: false, distance: null, reason: '打刻許可半径が未設定です' };
    if (!pos || !Number.isFinite(pos.lat) || !Number.isFinite(pos.lng)) return { ok: false, distance: null, reason: '位置情報がありません' };
    const distance = meters(pos.lat, pos.lng, o.lat, o.lng);
    if (distance > o.radius) return { ok: false, distance: distance, reason: '範囲外です（' + Math.round(distance) + 'm / 許可' + Math.round(o.radius) + 'm）' };
    return { ok: true, distance: distance, reason: '' };
  }
  const kindOk = k => KINDS.indexOf(k) >= 0;

  // 見本モード用。実在の職員名は入れない。座標だけ RYDEEN の事業所（設定シートと同じ）。
  const SAMPLE = {
    offices: [
      { name: 'レオ', code: 'LEO', radius: 200, lat: null, lng: null, enabled: false },
      { name: '金斗雲', code: 'KINTOUN', radius: 200, lat: null, lng: null, enabled: false },
      { name: 'RYDEEN', code: 'RYDEEN', radius: 200, lat: 35.034866, lng: 136.583191, enabled: true },
    ],
    staff: [
      { id: 'R001', name: '見本 責任者', office: 'RYDEEN', email: '', role: '責任者', enabled: true },
      { id: 'R002', name: '見本 職員', office: 'RYDEEN', email: 'demo-staff@example.com', role: '本人', enabled: true },
      { id: 'R009', name: '見本 無効', office: 'RYDEEN', email: '', role: '本人', enabled: false },
      { id: 'L001', name: '見本 レオ', office: 'レオ', email: 'leo@example.com', role: '本人', enabled: true },
    ],
  };
  const sample = () => JSON.parse(JSON.stringify(SAMPLE));

  const api = {
    R, KINDS, on, num, meters, officeView, staffView, visibleOffices, staffFor, resolveStaff, judge, kindOk, sample,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Dakoku = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
