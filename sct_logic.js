// ストレスチェック実施者養成研修の純粋関数。画面も node の tools/sct_check.js もここを使う。
// 料金・必要時間・修了判定の規則は supabase/sct.sql の sct_price / sct_progress と同じにする。
(function (root) {
  const SUBJECTS = [
    { id: 1, name: '労働者の健康管理', short: '労働者の健康管理', minMinutes: 120 },
    { id: 2, name: '事業場におけるメンタルヘルス対策', short: '事業場メンタルヘルス', minMinutes: 90 },
    { id: 3, name: '職場における個々の労働者及び労働者の集団への支援の方法', short: '個人・集団支援', minMinutes: 90 },
  ];
  const LICENSES = ['歯科医師', '看護師', '精神保健福祉士', '公認心理師'];
  const PRICES = { bundle: 12800, exempt_s1: 10800, exempt_all: 0 };
  const REFUND_POLICY = '開催7日前まで全額（決済手数料の実費を控除できる）。6日前から前日までは半額。当日以降と無断欠席は返金しない。主催都合は全額。振替を優先して案内する。';

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function jstDate(v) {
    const d = v instanceof Date ? v : new Date(v);
    if (!v || Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  }
  function jstYear(v) { return jstDate(v).slice(0, 4); }
  // 開催日の日本時間の日付から、今日の日本時間の日付を引いた日数（時刻は見ない）
  function daysBefore(sessionStart, now) {
    const a = jstDate(sessionStart), b = jstDate(now);
    if (!a || !b) return null;
    return Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86400000);
  }
  function minutesBetween(start, end) {
    if (!start || !end) return 0;
    const ms = new Date(end).getTime() - new Date(start).getTime();
    if (!Number.isFinite(ms) || ms <= 0) return 0;
    return Math.floor(ms / 60000);
  }
  function pricePlan(exemption, exemptionStatus) {
    if (exemption && exemption !== 'none' && exemptionStatus === 'pending') {
      return { plan: null, amountYen: null, blocked: '免除証明の確認待ちです' };
    }
    if (exemption === 'all' && exemptionStatus === 'approved') return { plan: 'exempt_all', amountYen: 0, blocked: null };
    if (exemption === 'subject1' && exemptionStatus === 'approved') return { plan: 'exempt_s1', amountYen: PRICES.exempt_s1, blocked: null };
    return { plan: 'bundle', amountYen: PRICES.bundle, blocked: null };
  }
  function requiredSubjectIds(exemption, exemptionStatus) {
    if (exemption === 'all' && exemptionStatus === 'approved') return [];
    if (exemption === 'subject1' && exemptionStatus === 'approved') return [2, 3];
    return [1, 2, 3];
  }
  function countedMinutes(session, booking, logs) {
    if (!session || !booking) return 0;
    if (booking.status === 'cancelled' || booking.status === 'excluded' || booking.status === 'no_show') return 0;
    const mine = (logs || []).filter(a => a.booking_id === booking.id);
    if (mine.some(a => a.camera_off)) return 0;
    const cap = minutesBetween(session.starts_at, session.ends_at);
    let best = 0;
    for (const a of mine) best = Math.max(best, minutesBetween(a.joined_at, a.left_at));
    return Math.min(cap, best);
  }
  function progress(input) {
    const profile = input.profile || {};
    const subjects = input.subjects || SUBJECTS;
    const required = requiredSubjectIds(profile.exemption, profile.exemption_status);
    const rows = subjects.map(s => {
      const bookings = (input.bookings || []).filter(b => b.user_id === profile.user_id && b.session_id && b.status !== 'cancelled');
      let minutes = 0;
      const instructors = [];
      for (const b of bookings) {
        const session = (input.sessions || []).find(x => x.id === b.session_id);
        if (!session || session.subject_id !== s.id) continue;
        const m = countedMinutes(session, b, input.attendance);
        minutes += m;
        if (m > 0 && session.instructor_name && !instructors.includes(session.instructor_name)) instructors.push(session.instructor_name);
      }
      return { id: s.id, name: s.name, min_minutes: s.minMinutes || s.min_minutes, minutes, met: minutes >= (s.minMinutes || s.min_minutes), required: required.includes(s.id), instructors };
    });
    let complete = false, blocked_reason = null;
    if (profile.exemption === 'all' && profile.exemption_status === 'approved') {
      blocked_reason = '労働衛生コンサルタント等の全免除のため受講不要です（修了証は発行しません）';
    } else if (profile.identity_status !== 'verified') {
      blocked_reason = '本人確認が済んでいません';
    } else if (rows.some(r => r.required && !r.met)) {
      blocked_reason = '視聴時間が足りない科目があります';
    } else if (!required.length) {
      blocked_reason = '対象科目がありません';
    } else complete = true;
    return {
      user_id: profile.user_id, full_name: profile.full_name || '', license_type: profile.license_type || '',
      exemption: profile.exemption || 'none', exemption_status: profile.exemption_status || 'none',
      identity_status: profile.identity_status || 'unverified', required, subjects: rows, complete, blocked_reason,
    };
  }
  function refundSuggestion(o) {
    const amountYen = Math.max(0, o.amountYen | 0);
    const preferTransfer = true;
    if (!amountYen && o.plan === 'exempt_all') return { amount: 0, kind: 'none', preferTransfer, label: '課金していないため返金はありません' };
    if (o.hostCancel) return { amount: amountYen, kind: 'full_host', preferTransfer, label: '主催都合のため全額' };
    if (o.noShow) return { amount: 0, kind: 'none', preferTransfer, label: '無断欠席のため返金なし' };
    const d = daysBefore(o.sessionStartsAt, o.now || new Date());
    if (d == null) return { amount: 0, kind: 'none', preferTransfer, label: '開催日時が未定です。振替を優先して案内してください' };
    if (d >= 7) {
      const fee = Math.max(0, Math.min(amountYen, o.feeYen | 0));
      return { amount: amountYen - fee, kind: 'full_minus_fee', fee, preferTransfer, label: '開催7日前まで全額（決済手数料を控除）' };
    }
    if (d >= 1) return { amount: Math.floor(amountYen / 2), kind: 'half', preferTransfer, label: '6日前から前日まで半額' };
    return { amount: 0, kind: 'none', preferTransfer, label: '当日以降は返金なし' };
  }
  function certSubjects(c) {
    if (!c) return [];
    if (Array.isArray(c.subjects)) return c.subjects.map(x => typeof x === 'number' ? { id: x } : x);
    if (c.snapshot && Array.isArray(c.snapshot.subjects)) return c.snapshot.subjects;
    if (Array.isArray(c.subject_ids)) return c.subject_ids.map(id => ({ id }));
    return [];
  }
  function annualRows(input) {
    const year = String(input.year);
    const subjects = input.subjects || SUBJECTS;
    const groups = new Map();
    for (const s of input.sessions || []) {
      if (s.status === 'cancelled' || jstYear(s.starts_at) !== year) continue;
      const instructor = s.instructor_name || '（未設定）';
      const key = s.subject_id + '\t' + instructor;
      if (!groups.has(key)) groups.set(key, { subject_id: s.subject_id, instructor_name: instructor, sessions: [] });
      groups.get(key).sessions.push(s);
    }
    const certByUser = new Map();
    for (const c of input.certificates || []) certByUser.set(c.user_id, certSubjects(c));
    const rows = [];
    for (const g of groups.values()) {
      const grads = new Set();
      for (const s of g.sessions) {
        for (const b of input.bookings || []) {
          if (b.session_id !== s.id) continue;
          if (countedMinutes(s, b, input.attendance) <= 0) continue;
          if (certByUser.get(b.user_id)?.some(x => x.id === g.subject_id)) grads.add(b.user_id);
        }
      }
      const sub = subjects.find(x => x.id === g.subject_id);
      rows.push({ year: Number(year), subject_id: g.subject_id, subject_name: sub ? sub.name : '', instructor_name: g.instructor_name, sessions: g.sessions.length, graduates: grads.size });
    }
    rows.sort((a, b) => a.subject_id - b.subject_id || a.instructor_name.localeCompare(b.instructor_name, 'ja'));
    return rows;
  }
  function csvCell(v) {
    let s = String(v ?? '');
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }
  function toCsv(rows) {
    const head = ['開催年', '科目ID', '科目名', '講師名', '開催回数', '修了者数'];
    const lines = [head, ...rows.map(r => [r.year, r.subject_id, r.subject_name, r.instructor_name, r.sessions, r.graduates])];
    return '\uFEFF' + lines.map(line => line.map(csvCell).join(',')).join('\r\n') + '\r\n';
  }
  function safeUrl(u) {
    try {
      const x = new URL(String(u), 'https://invalid.local');
      if (x.protocol !== 'https:' || x.hostname === 'invalid.local') return '';
      return x.href;
    } catch (e) { return ''; }
  }
  const PAY_METHOD = { square: 'Square', bank: '振込', none: 'なし', stripe: '旧カード' };
  function methodLabel(method) { return PAY_METHOD[method] || method || ''; }
  // Square の payment.created / payment.updated を、入金確定にしてよいかに分ける。金額の一致は呼び出し側で見る。
  // supabase/functions/_shared/square.ts の squareDecision と同じ。
  // COMPLETED かつ JPY かつ合計が請求額と一致するときだけ pay。APPROVED / FAILED / CANCELED は入金にしない。
  function squareDecision(event) {
    const type = event && event.type;
    const obj = (event && event.data && event.data.object) || {};
    const payment = obj.payment || (obj.status || obj.amount_money ? obj : {});
    const money = payment.amount_money || {};
    const total = payment.total_money || null;
    const note = typeof payment.note === 'string' ? payment.note.trim() : '';
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const base = {
      paymentId: uuid.test(note) ? note : null,
      orderId: typeof payment.order_id === 'string' ? payment.order_id : null,
      squarePaymentId: typeof payment.id === 'string' ? payment.id : null,
      amount: money.amount,
      total: total ? total.amount : undefined,
      currency: money.currency || null,
    };
    if (type !== 'payment.updated' && type !== 'payment.created') return { action: 'ignore', reason: type || 'unknown', ...base };
    const status = typeof payment.status === 'string' ? payment.status : '';
    if (status !== 'COMPLETED') return { action: 'ignore', reason: status ? status.toLowerCase() : 'unpaid', ...base };
    if (typeof money.amount !== 'number' || !Number.isFinite(money.amount)) return { action: 'ignore', reason: 'amount', ...base };
    if (String(money.currency || '').toUpperCase() !== 'JPY') return { action: 'ignore', reason: 'currency', ...base };
    if (total && total.amount != null && Number(total.amount) !== Number(money.amount)) return { action: 'ignore', reason: 'total', ...base };
    return { action: 'pay', ...base };
  }
  function b64json(data) {
    const s = String(data || '').replace(/-/g, '+').replace(/_/g, '/');
    let txt;
    if (typeof Buffer !== 'undefined') txt = Buffer.from(s, 'base64').toString('utf8');
    else {
      const bin = atob(s);
      txt = new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
    }
    return JSON.parse(txt);
  }
  // Pub/Sub push（message.data が Base64 の CloudEvent）と、直接の JSON の両方を読む。出席の自動確定はしない。
  function parseMeetPush(body) {
    const msg = body && body.message;
    let payload = body || {};
    const messageId = (msg && msg.messageId) || body && body.messageId || null;
    if (msg && msg.data) {
      try { payload = b64json(msg.data); } catch (e) { payload = { unparsed: true }; }
    }
    const data = payload.data || payload.resource || {};
    const ps = data.participantSession || data.participant_session || {};
    const participant = ps.participant || data.participant || {};
    const signed = participant.signedinUser || participant.signedInUser || {};
    const displayName = signed.displayName || participant.displayName || ps.displayName || '';
    const eventType = payload.type || payload.eventType || (msg && msg.attributes && (msg.attributes['ce-type'] || msg.attributes.type)) || '';
    const space = payload.space || data.space || (msg && msg.attributes && msg.attributes['ce-source']) || '';
    return {
      eventType, messageId, displayName, space,
      resourceName: ps.name || data.name || '',
      startTime: ps.startTime || ps.start_time || null,
      endTime: ps.endTime || ps.end_time || null,
    };
  }

  const api = {
    SUBJECTS, LICENSES, PRICES, REFUND_POLICY, esc, jstDate, jstYear, daysBefore, minutesBetween,
    pricePlan, requiredSubjectIds, countedMinutes, progress, refundSuggestion, annualRows, toCsv, csvCell,
    safeUrl, methodLabel, squareDecision, parseMeetPush, certSubjects,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Sct = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
