/**
 * 出退勤打刻のウェブアプリ（静的ポータルから呼ぶ）。
 * 秘密鍵はポータルに置かない。このスクリプトを実行する Google アカウントがシートを編集する。
 *
 * デプロイ手順は dakoku-gas/README.md。
 * スクリプトプロパティ DAKOKU_TOKEN を、config.js の dakoku.token と同じ文字列にする。
 *
 * CORS: GAS は OPTIONS（プリフライト）に答えない。
 * クライアントは Content-Type: text/plain の POST（JSON 文字列）を使う。
 * リダイレクトで POST の中身が落ちたときは、同じ内容を GET のクエリでも受ける。
 *
 * 範囲判定の式は dakoku-lib.js の meters / judge と同じ（地球半径 6371000m）。
 * 管理者修正タブはまだ書かない（修正画面は後回し）。
 */
var DK_SHEET_ID = '1KEyzLGVwIWR2ziWNyghhGzSf6B2ZfHE-UIj8U0szxzs';
var DK_R = 6371000;

function doGet(e) {
  return dkHandle_(e && e.parameter ? e.parameter : {});
}

function doPost(e) {
  var raw = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
  var body;
  try { body = JSON.parse(raw); } catch (err) { return dkOut_({ ok: false, error: 'JSONを読めませんでした' }); }
  return dkHandle_(body || {});
}

function dkHandle_(b) {
  try {
    if (!dkTokenOk_(b.token)) return dkOut_({ ok: false, error: 'トークンが違います。config.js の dakoku.token とスクリプトプロパティ DAKOKU_TOKEN を同じにしてください。' });
    var action = b.action || 'bootstrap';
    if (action === 'bootstrap') return dkOut_(dkBootstrap_());
    if (action === 'recent') return dkOut_(dkRecent_(b.staffId));
    if (action === 'punch') return dkOut_(dkPunch_(b));
    return dkOut_({ ok: false, error: '不明な操作です' });
  } catch (err) {
    return dkOut_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function dkOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function dkTokenOk_(token) {
  var expected = PropertiesService.getScriptProperties().getProperty('DAKOKU_TOKEN');
  if (!expected || token == null || token === '') return false;
  return String(token) === String(expected);
}

function dkBook_() {
  try { return SpreadsheetApp.openById(DK_SHEET_ID); }
  catch (e) { throw new Error('スプレッドシートを開けません。実行ユーザーに編集権限があるか確認してください'); }
}

function dkRows_(name) {
  var sh = dkBook_().getSheetByName(name);
  if (!sh) throw new Error('シートがありません: ' + name);
  var values = sh.getDataRange().getValues();
  if (!values.length) return [];
  var head = values[0].map(function (h) { return String(h).trim(); });
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var line = values[i];
    var empty = true;
    for (var c = 0; c < line.length; c++) { if (line[c] !== '' && line[c] != null) { empty = false; break; } }
    if (empty) continue;
    var o = {};
    for (var c2 = 0; c2 < head.length; c2++) if (head[c2]) o[head[c2]] = line[c2];
    out.push(o);
  }
  return out;
}

function dkOn_(v) {
  if (v === true) return true;
  var s = String(v == null ? '' : v).trim().toUpperCase();
  return s === 'TRUE' || s === '1' || s === 'YES';
}

function dkNum_(v) {
  if (v === '' || v == null) return null;
  var n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
  return isFinite(n) ? n : null;
}

function dkMeters_(lat1, lng1, lat2, lng2) {
  var rad = function (d) { return d * Math.PI / 180; };
  var dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
  var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * DK_R * Math.asin(Math.min(1, Math.sqrt(s)));
}

function dkOffices_() {
  return dkRows_('設定').map(function (r) {
    return {
      name: String(r['事業所名'] || '').trim(),
      code: String(r['略称'] || '').trim(),
      radius: dkNum_(r['打刻許可半径(m)']),
      lat: dkNum_(r['緯度']),
      lng: dkNum_(r['経度']),
      enabled: dkOn_(r['有効']),
    };
  }).filter(function (o) { return o.name; });
}

function dkStaff_() {
  return dkRows_('職員').map(function (r) {
    return {
      id: String(r['職員ID'] || '').trim(),
      name: String(r['氏名'] || '').trim(),
      office: String(r['所属事業所'] || '').trim(),
      email: String(r['ログイン用メール'] || '').trim(),
      role: String(r['役割(本人/責任者)'] || '').trim(),
      enabled: dkOn_(r['有効']),
    };
  }).filter(function (s) { return s.id && s.name; });
}

function dkBootstrap_() {
  var offices = dkOffices_().filter(function (o) { return o.enabled; });
  var names = {};
  offices.forEach(function (o) { names[o.name] = true; });
  var staff = dkStaff_().filter(function (s) { return s.enabled && names[s.office]; });
  return { ok: true, offices: offices, staff: staff };
}

function dkRecent_(staffId) {
  var id = String(staffId || '').trim();
  if (!id) return { ok: false, error: '職員が指定されていません' };
  var rows = dkRows_('打刻ログ');
  var mine = [];
  for (var i = rows.length - 1; i >= 0 && mine.length < 8; i--) {
    if (String(rows[i]['職員ID'] || '').trim() !== id) continue;
    mine.push({
      at: String(rows[i]['日時'] || ''),
      kind: String(rows[i]['種別(出勤/退勤)'] || ''),
      office: String(rows[i]['事業所'] || ''),
    });
  }
  return { ok: true, rows: mine };
}

function dkPunch_(b) {
  var kind = String(b.kind || '');
  if (kind !== '出勤' && kind !== '退勤') return { ok: false, error: '種別は出勤か退勤です' };
  var office = null;
  dkOffices_().forEach(function (o) { if (o.name === String(b.office || '').trim()) office = o; });
  if (!office || !office.enabled) return { ok: false, error: 'この事業所は打刻できません' };
  if (office.lat == null || office.lng == null) return { ok: false, error: '緯度・経度が未設定です' };
  if (!(office.radius > 0)) return { ok: false, error: '打刻許可半径が未設定です' };
  var staff = null;
  dkStaff_().forEach(function (s) {
    if (s.id === String(b.staffId || '').trim() && s.office === office.name && s.enabled) staff = s;
  });
  if (!staff) return { ok: false, error: '職員が見つかりません' };
  var email = String(b.email || '').trim().toLowerCase();
  if (staff.email && email !== staff.email.toLowerCase()) return { ok: false, error: 'ログイン中のメールと職員が一致しません' };
  var lat = dkNum_(b.lat), lng = dkNum_(b.lng);
  if (lat == null || lng == null) return { ok: false, error: '位置情報がありません' };
  var distance = dkMeters_(lat, lng, office.lat, office.lng);
  if (distance > office.radius) return { ok: false, error: '範囲外です（' + Math.round(distance) + 'm / 許可' + Math.round(office.radius) + 'm）' };
  var at = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
  var acc = dkNum_(b.accuracy);
  var memo = 'acc=' + (acc == null ? '' : String(Math.round(acc))) + '; ' + String(b.memo || '').slice(0, 160);
  var note = 'dist=' + distance.toFixed(1) + '; email=' + String(b.email || '').slice(0, 120);
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    dkAppend_('打刻ログ', {
      '日時': at,
      '事業所': office.name,
      '職員ID': staff.id,
      '氏名': staff.name,
      '種別(出勤/退勤)': kind,
      '緯度': lat,
      '経度': lng,
      '端末メモ': memo,
      '生データ備考': note,
    });
  } finally { lock.releaseLock(); }
  return { ok: true, at: at, distance: distance, office: office.name, staffId: staff.id, kind: kind };
}

function dkAppend_(name, obj) {
  var sh = dkBook_().getSheetByName(name);
  if (!sh) throw new Error('シートがありません: ' + name);
  var last = sh.getLastColumn();
  if (last < 1) throw new Error('シートが空です: ' + name);
  var head = sh.getRange(1, 1, 1, last).getValues()[0].map(function (h) { return String(h).trim(); });
  var row = head.map(function (h) { return h && obj[h] != null ? obj[h] : ''; });
  sh.appendRow(row);
}

/** エディタから実行して、距離が 0 になることだけ確認する（シートには書かない）。 */
function dakokuEditorCheck() {
  var d = dkMeters_(35.034866, 136.583191, 35.034866, 136.583191);
  if (d > 1) throw new Error('distance ' + d);
  Logger.log('dakoku ok ' + d);
}
