// 出退勤打刻の判定（画面 dakoku.js と node tools/dakoku_check.js が共用）。
// 距離の式は地球半径 6371000m（旧 GAS と同じ式だが、打刻経路では Google を使わない）。
// 個人の氏名・メールはこのファイルに書かない。見本は架空の名前だけ。
// 本番はログインメール一致のみ。他人の名前選択は禁止（見本だけ allowPick）。
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
  // 2点間の距離（メートル）。
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
  // ログインメールと一致する有効職員（全事業所）。メール空は対象外。
  function staffByEmail(staff, email) {
    const e = String(email || '').trim().toLowerCase();
    if (!e) return [];
    return (staff || []).map(staffView).filter(s => s.enabled && s.id && s.name && s.email && s.email.toLowerCase() === e);
  }
  // メール一致職員の所属事業所だけ（有効な事業所に限定）。
  function officesForEmail(offices, staff, email) {
    const mine = staffByEmail(staff, email);
    const names = [];
    mine.forEach(s => { if (s.office && names.indexOf(s.office) < 0) names.push(s.office); });
    const visible = visibleOffices(offices).filter(o => names.indexOf(o.name) >= 0);
    return { staff: mine, offices: visible, names: names };
  }
  // メール一致が正。allowPick は見本モード用の暫定選択だけ。
  // mode: email / ambiguous / unregistered / noemail / pick
  function resolveStaff(opt) {
    const email = String(opt.email || '').trim().toLowerCase();
    const officeName = String(opt.office || '').trim();
    const allowPick = !!opt.allowPick;
    if (!allowPick) {
      if (!email) return { staff: null, mode: 'noemail', list: [] };
      const mine = staffByEmail(opt.staff, email);
      if (!mine.length) return { staff: null, mode: 'unregistered', list: [] };
      const atOffice = officeName ? mine.filter(s => s.office === officeName) : mine;
      if (atOffice.length === 1) return { staff: atOffice[0], mode: 'email', list: atOffice };
      if (atOffice.length > 1) {
        const chosen = atOffice.find(s => s.id === String(opt.chosenId || ''));
        return { staff: chosen || null, mode: 'ambiguous', list: atOffice };
      }
      return { staff: null, mode: 'email', list: [] };
    }
    const list = staffFor(opt.staff, officeName);
    const hits = email ? list.filter(s => s.email.toLowerCase() === email) : [];
    const pool = hits.length > 1 ? hits : list;
    if (hits.length === 1) return { staff: hits[0], mode: 'email', list: pool };
    const chosen = pool.find(s => s.id === String(opt.chosenId || ''));
    return { staff: chosen || null, mode: hits.length > 1 ? 'ambiguous' : 'pick', list: pool };
  }
  // 緯度・経度・半径がそろっている事業所だけ位置情報を要する（金斗雲などは不要）。
  function gpsRequired(office) {
    const o = officeView(office);
    return o.lat != null && o.lng != null && o.radius > 0;
  }
  // 現在地が許可半径の中か。GPS不要の事業所は位置なしで打刻可。
  function judge(pos, office) {
    const o = officeView(office);
    if (!o.enabled) return { ok: false, distance: null, reason: 'この事業所は打刻を停止しています', gps: false };
    if (!gpsRequired(o)) return { ok: true, distance: null, reason: '', gps: false };
    if (!pos || !Number.isFinite(pos.lat) || !Number.isFinite(pos.lng)) return { ok: false, distance: null, reason: '位置情報がありません', gps: true };
    const distance = meters(pos.lat, pos.lng, o.lat, o.lng);
    if (distance > o.radius) return { ok: false, distance: distance, reason: '範囲外です（' + Math.round(distance) + 'm / 許可' + Math.round(o.radius) + 'm）', gps: true };
    return { ok: true, distance: distance, reason: '', gps: true };
  }
  const kindOk = k => KINDS.indexOf(k) >= 0;

  // 管理者代理入力のメモ（先頭一致）
  function isProxyMemo(memo) {
    return String(memo || '').indexOf('管理者記録') === 0;
  }
  // 本人申告（打刻忘れ申告を管理者が承認した打刻）のメモ（先頭一致）
  function isRequestMemo(memo) {
    return String(memo || '').indexOf('本人申告') === 0;
  }
  // punched_at_jst（YYYY-MM-DD HH:MM:SS）から日・分を取る
  function parseJst(at) {
    const m = String(at || '').match(/^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!m) return null;
    return { day: m[1], hm: String(m[2]).padStart(2,'0') + ':' + m[3], minutes: (+m[2]) * 60 + (+m[3]) };
  }
  // 月の打刻を日ごとに出勤→退勤で組む。複数シフト可。未対応は missing。
  function pairMonth(rows) {
    const byDay = {};
    (rows || []).forEach(r => {
      const p = parseJst(r.at);
      if (!p) return;
      const item = { at: String(r.at || ''), kind: r.kind, memo: r.memo || '', proxy: r.proxy === true || isProxyMemo(r.memo), req: r.request === true || isRequestMemo(r.memo), day: p.day, hm: p.hm, minutes: p.minutes };
      (byDay[p.day] = byDay[p.day] || []).push(item);
    });
    const pairs = [];
    let totalMinutes = 0;
    Object.keys(byDay).sort().forEach(day => {
      const list = byDay[day].slice().sort((a, b) => a.at < b.at ? -1 : a.at > b.at ? 1 : 0);
      let open = null;
      list.forEach(ev => {
        if (ev.kind === '出勤') {
          if (open) pairs.push({ day: day, inAt: open.hm, outAt: null, minutes: null, proxy: !!open.proxy, req: !!open.req, inReq: !!open.req, outReq: false, missing: '退勤なし' });
          open = ev;
        } else if (ev.kind === '退勤') {
          if (open) {
            const mins = ev.minutes - open.minutes;
            const ok = Number.isFinite(mins) && mins >= 0;
            if (ok) totalMinutes += mins;
            pairs.push({ day: day, inAt: open.hm, outAt: ev.hm, minutes: ok ? mins : null, proxy: !!(open.proxy || ev.proxy), req: !!(open.req || ev.req), inReq: !!open.req, outReq: !!ev.req, missing: null });
            open = null;
          } else {
            pairs.push({ day: day, inAt: null, outAt: ev.hm, minutes: null, proxy: !!ev.proxy, req: !!ev.req, inReq: false, outReq: !!ev.req, missing: '出勤なし' });
          }
        }
      });
      if (open) pairs.push({ day: day, inAt: open.hm, outAt: null, minutes: null, proxy: !!open.proxy, req: !!open.req, inReq: !!open.req, outReq: false, missing: '退勤なし' });
    });
    return { pairs: pairs, totalMinutes: totalMinutes };
  }
  function formatHours(mins) {
    if (mins == null || !Number.isFinite(mins)) return '—';
    const h = Math.floor(mins / 60);
    const m = Math.abs(Math.round(mins % 60));
    return h + '時間' + String(m).padStart(2, '0') + '分';
  }
  function shiftMonth(ym, delta) {
    const parts = String(ym || '').split('-');
    const y = +parts[0], m = +parts[1];
    if (!y || !m) return ym;
    const d = new Date(Date.UTC(y, m - 1 + (delta || 0), 1));
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
  }
  function todayJst(now) {
    const d = now || new Date();
    try { return d.toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo' }).slice(0, 10); } catch (e) { return d.toISOString().slice(0, 10); }
  }
  function nowHmJst(now) {
    const d = now || new Date();
    try { return d.toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo' }).slice(11, 16); } catch (e) { return d.toISOString().slice(11, 16); }
  }
  function addDays(ymd, n) {
    const p = String(ymd || '').split('-').map(Number);
    const d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + (n || 0)));
    return d.toISOString().slice(0, 10);
  }
  const REQ_MAX_DAYS = 31;
  // 打刻忘れ申告の入力チェック（サーバー dakoku_request_submit と同じ規則。最終判定はサーバー）
  function checkRequest(f, now) {
    f = f || {};
    const today = todayJst(now);
    const date = String(f.date || '').trim();
    const time = String(f.time || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: '日付を選んでください / Escolha a data' };
    if (!kindOk(f.kind)) return { ok: false, error: '出勤か退勤を選んでください / Escolha entrada ou saída' };
    if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(time)) return { ok: false, error: '時刻を入れてください / Informe o horário' };
    if (date > today) return { ok: false, error: '先の日付は申告できません / Não é possível informar data futura' };
    if (date < addDays(today, -REQ_MAX_DAYS)) return { ok: false, error: '31日より前の分は責任者に伝えてください / Mais de 31 dias: avise o responsável' };
    const hm = time.padStart(5, '0');
    if (date === today && hm > nowHmJst(now)) return { ok: false, error: 'まだ来ていない時刻は申告できません / Horário ainda não chegou' };
    if (!String(f.reason || '').trim()) return { ok: false, error: '理由を書いてください / Escreva o motivo' };
    return { ok: true, date: date, kind: f.kind, time: hm, reason: String(f.reason).trim().slice(0, 200) };
  }
  // 月別一覧の「なし」から申告できるか（期間内の日だけ）
  function canRequestDay(day, now) {
    const today = todayJst(now);
    return /^\d{4}-\d{2}-\d{2}$/.test(String(day || '')) && day <= today && day >= addDays(today, -REQ_MAX_DAYS);
  }
  const REQ_STATUS = { pending: '承認待ち / Pendente', approved: '承認済み / Aprovado', rejected: '却下 / Recusado' };
  const reqStatusLabel = st => REQ_STATUS[st] || String(st || '');

  function currentMonthJst(now) {
    const d = now || new Date();
    try {
      return d.toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo' }).slice(0, 7);
    } catch (e) {
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    }
  }

  // 見本モード用。実在の職員名は入れない。座標だけ RYDEEN の事業所（設定シートと同じ）。
  const SAMPLE = {
    offices: [
      { name: 'レオ', code: 'LEO', radius: 200, lat: null, lng: null, enabled: false },
      { name: '金斗雲', code: 'KINTOUN', radius: null, lat: null, lng: null, enabled: true },
      { name: 'RYDEEN', code: 'RYDEEN', radius: 200, lat: 35.034866, lng: 136.583191, enabled: true },
    ],
    staff: [
      { id: 'R001', name: '見本 責任者', office: 'RYDEEN', email: '', role: '責任者', enabled: true },
      { id: 'R002', name: '見本 職員', office: 'RYDEEN', email: 'demo-staff@example.com', role: '本人', enabled: true },
      { id: 'R009', name: '見本 無効', office: 'RYDEEN', email: '', role: '本人', enabled: false },
      { id: 'L001', name: '見本 レオ', office: 'レオ', email: 'leo@example.com', role: '本人', enabled: true },
      { id: 'K001', name: '見本 ヘルパー', office: '金斗雲', email: '', role: '本人', enabled: true },
    ],
  };
  const sample = () => JSON.parse(JSON.stringify(SAMPLE));

  const api = {
    R, KINDS, on, num, meters, officeView, staffView, visibleOffices, staffFor, staffByEmail, officesForEmail, resolveStaff, gpsRequired, judge, kindOk, isProxyMemo, isRequestMemo, parseJst, pairMonth, formatHours, shiftMonth, currentMonthJst, todayJst, nowHmJst, addDays, checkRequest, canRequestDay, reqStatusLabel, REQ_MAX_DAYS, sample,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Dakoku = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
