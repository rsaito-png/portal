// 実施者養成研修の規則テスト。node tools/sct_check.js
const fs = require('fs');
const path = require('path');
const Sct = require('../sct_logic.js');
const SctCert = require('../sct_cert.js');
const root = path.join(__dirname, '..');
let n = 0;
const ok = (cond, msg) => { n++; if (!cond) { console.error('FAIL', msg); process.exit(1); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), msg + ' got ' + JSON.stringify(a));

eq(Sct.pricePlan('none', 'none'), { plan: 'bundle', amountYen: 12800, blocked: null }, 'bundle');
eq(Sct.pricePlan('subject1', 'approved').amountYen, 10800, 'exempt s1');
eq(Sct.pricePlan('all', 'approved'), { plan: 'exempt_all', amountYen: 0, blocked: null }, 'exempt all');
ok(Sct.pricePlan('subject1', 'pending').blocked, 'pending blocks pay');
eq(Sct.pricePlan('subject1', 'rejected').plan, 'bundle', 'rejected pays full');
eq(Sct.requiredSubjectIds('subject1', 'approved'), [2, 3], 'required without subject 1');
eq(Sct.requiredSubjectIds('all', 'approved'), [], 'all exempt has no subjects');

const session = (id, subject, start, end, instructor) => ({ id, subject_id: subject, starts_at: start, ends_at: end, instructor_name: instructor || '西岡愛梨', status: 'done' });
const book = (id, sid, status) => ({ id, session_id: sid, user_id: 'u1', status: status || 'attended' });
const log = (bid, join, leave, camera) => ({ booking_id: bid, joined_at: join, left_at: leave, camera_off: !!camera });
const profile = (extra) => Object.assign({ user_id: 'u1', full_name: '見本 花子', exemption: 'none', exemption_status: 'none', identity_status: 'verified', license_type: '看護師' }, extra);

const day = '2026-11-20';
const s1 = session('s1', 1, day + 'T10:00:00+09:00', day + 'T12:00:00+09:00');
const s2 = session('s2', 2, '2026-11-21T10:00:00+09:00', '2026-11-21T11:30:00+09:00');
const s3 = session('s3', 3, '2026-11-22T10:00:00+09:00', '2026-11-22T11:30:00+09:00');
const fullLogs = [
  log('b1', day + 'T10:00:00+09:00', day + 'T12:00:00+09:00'),
  log('b2', '2026-11-21T10:00:00+09:00', '2026-11-21T11:30:00+09:00'),
  log('b3', '2026-11-22T10:00:00+09:00', '2026-11-22T11:30:00+09:00'),
];
const base = { profile: profile(), sessions: [s1, s2, s3], bookings: [book('b1', 's1'), book('b2', 's2'), book('b3', 's3')], attendance: fullLogs };
ok(Sct.progress(base).complete === true, 'full attendance completes');
ok(Sct.progress(Object.assign({}, base, { profile: profile({ identity_status: 'pending' }) })).complete === false, 'identity required');
ok(Sct.progress(Object.assign({}, base, { attendance: fullLogs.slice(0, 2) })).blocked_reason === '視聴時間が足りない科目があります', 'missing subject');

const capped = Sct.progress({ profile: profile(), sessions: [s1], bookings: [book('b1', 's1')], attendance: [log('b1', day + 'T09:00:00+09:00', day + 'T13:00:00+09:00'), log('b1', day + 'T10:00:00+09:00', day + 'T11:00:00+09:00')] });
eq(capped.subjects[0].minutes, 120, 'cap at session and use max log not sum');

const off = Sct.progress({ profile: profile(), sessions: [s1], bookings: [book('b1', 's1')], attendance: [log('b1', day + 'T10:00:00+09:00', day + 'T12:00:00+09:00', true)] });
eq(off.subjects[0].minutes, 0, 'camera off excludes the session');
ok(Sct.progress({ profile: profile(), sessions: [s1], bookings: [book('b1', 's1', 'excluded')], attendance: fullLogs }).subjects[0].minutes === 0, 'excluded booking is zero');

const two = Sct.progress({
  profile: profile(),
  sessions: [session('a', 1, day + 'T10:00:00+09:00', day + 'T11:00:00+09:00'), session('b', 1, day + 'T13:00:00+09:00', day + 'T14:00:00+09:00')],
  bookings: [book('ba', 'a'), book('bb', 'b')],
  attendance: [log('ba', day + 'T10:00:00+09:00', day + 'T11:00:00+09:00'), log('bb', day + 'T13:00:00+09:00', day + 'T14:00:00+09:00')],
});
eq(two.subjects[0].minutes, 120, 'minutes sum across sessions');

const ex = Sct.progress(Object.assign({}, base, { profile: profile({ exemption: 'subject1', exemption_status: 'approved' }), attendance: fullLogs.slice(1) }));
ok(ex.complete === true && ex.required.join() === '2,3', 'subject 1 exemption');
ok(Sct.progress(Object.assign({}, base, { profile: profile({ exemption: 'all', exemption_status: 'approved' }) })).complete === false, 'full exemption is not a certificate');
ok(Sct.progress(Object.assign({}, base, { attendance: [], quiz: { passed: true } })).complete === false, 'quiz does not complete');

const early = Sct.refundSuggestion({ amountYen: 12800, feeYen: 300, sessionStartsAt: '2026-11-20T10:00:00+09:00', now: '2026-11-13T23:30:00+09:00' });
eq(early.amount, 12500, '7 calendar days before in JST is full minus fee');
const half = Sct.refundSuggestion({ amountYen: 10800, sessionStartsAt: '2026-11-20T10:00:00+09:00', now: '2026-11-14T00:30:00+09:00' });
eq(half.kind, 'half', '6 days before is half');
eq(half.amount, 5400, 'half of 10800');
eq(Sct.refundSuggestion({ amountYen: 12800, sessionStartsAt: '2026-11-20T10:00:00+09:00', now: '2026-11-19T23:00:00+09:00' }).kind, 'half', 'day before is half');
eq(Sct.refundSuggestion({ amountYen: 12800, sessionStartsAt: '2026-11-20T10:00:00+09:00', now: '2026-11-20T09:00:00+09:00' }).amount, 0, 'same day is none');
eq(Sct.refundSuggestion({ amountYen: 12800, hostCancel: true, sessionStartsAt: '2026-11-20T10:00:00+09:00', now: '2026-11-20T12:00:00+09:00' }).amount, 12800, 'host cancel is full');
eq(Sct.refundSuggestion({ amountYen: 12800, noShow: true, sessionStartsAt: '2026-11-13T10:00:00+09:00', now: '2026-11-01T10:00:00+09:00' }).amount, 0, 'no show is none');
ok(Sct.refundSuggestion({ amountYen: 12800, sessionStartsAt: '2026-11-20T00:30:00+09:00', now: '2026-11-13T23:30:00+09:00' }).kind === 'full_minus_fee', 'JST date not UTC date');

const rows = Sct.annualRows({
  year: 2026, sessions: [s1, s2, Object.assign({}, s3, { status: 'cancelled' })],
  bookings: [book('b1', 's1'), book('b2', 's2'), book('b3', 's3')], attendance: fullLogs,
  certificates: [{ user_id: 'u1', subjects: [{ id: 1, name: '労働者の健康管理' }, { id: 2, name: '事業場におけるメンタルヘルス対策' }] }],
});
eq(rows.map(r => [r.subject_id, r.sessions, r.graduates]), [[1, 1, 1], [2, 1, 1]], 'annual skips cancelled and uncertified');
ok(Sct.toCsv(rows).charCodeAt(0) === 0xFEFF && Sct.toCsv([{ year: 2026, subject_id: 1, subject_name: '=cmd', instructor_name: '西岡愛梨', sessions: 1, graduates: 0 }]).includes("\"'=cmd\""), 'csv bom and formula guard');

const snap = { full_name: '見本 <花子>', issued_on: '2026-11-22', subjects: [{ name: '労働者の健康管理' }], instructors: ['西岡愛梨'], org: '一般社団法人 心理社会的リハビリテーション・星心会', license_type: '看護師' };
const html = SctCert.html(snap);
ok(html.includes('修了日') && html.includes('科目') && html.includes('講師名') && html.includes('西岡愛梨') && html.includes('見本 &lt;花子&gt;') && !html.includes('<花子>'), 'certificate fields and escape');
ok(Sct.safeUrl('javascript:alert(1)') === '' && Sct.safeUrl('https://meet.google.com/abc-defg-hij').startsWith('https://'), 'meet url allowlist');

const noteId = '11111111-1111-4111-8111-111111111111';
eq(Sct.methodLabel('square'), 'Square', 'square label');
eq(Sct.methodLabel('stripe'), '旧カード', 'legacy card label');
eq(Sct.squareDecision({ type: 'payment.updated', data: { object: { payment: { id: 'pay1', status: 'APPROVED', amount_money: { amount: 12800, currency: 'JPY' }, note: noteId } } } }).action, 'ignore', 'approved does not fulfill');
const paid = Sct.squareDecision({ type: 'payment.updated', data: { object: { payment: { id: 'sqpay', status: 'COMPLETED', order_id: 'ord1', amount_money: { amount: 12800, currency: 'JPY' }, total_money: { amount: 12800, currency: 'JPY' }, note: noteId } } } });
eq(paid.action, 'pay', 'completed fulfills');
eq(paid.amount, 12800, 'amount passed through');
eq(paid.paymentId, noteId, 'note is the payment id');
eq(paid.orderId, 'ord1', 'order id passed through');
eq(Sct.squareDecision({ type: 'payment.updated', data: { object: { payment: { id: 'pay3', status: 'FAILED', amount_money: { amount: 12800, currency: 'JPY' }, note: noteId } } } }).action, 'ignore', 'failed attempt does not fulfill');
eq(Sct.squareDecision({ type: 'payment.created', data: { object: { payment: { id: 'pay4', status: 'COMPLETED', amount_money: { amount: 100, currency: 'USD' }, total_money: { amount: 100, currency: 'USD' }, note: noteId } } } }).action, 'ignore', 'non-jpy ignored');
eq(Sct.squareDecision({ type: 'payment.updated', data: { object: { payment: { id: 'pay5', status: 'COMPLETED', amount_money: { amount: 12800, currency: 'JPY' }, total_money: { amount: 13000, currency: 'JPY' }, note: noteId } } } }).reason, 'total', 'tip or discount does not fulfill');
eq(Sct.squareDecision({ type: 'order.updated', data: { object: {} } }).action, 'ignore', 'other events ignored');

const raw = Buffer.from(JSON.stringify({ type: 'google.workspace.meet.participant.v2.left', data: { participantSession: { name: 'conferenceRecords/c/participants/p/participantSessions/s', startTime: '2026-11-20T01:00:00Z', endTime: '2026-11-20T03:00:00Z', participant: { signedinUser: { displayName: '見本 花子' } } } } }), 'utf8').toString('base64');
const meet = Sct.parseMeetPush({ message: { messageId: 'm1', data: raw } });
eq(meet.displayName, '見本 花子', 'meet display name');
eq(meet.eventType, 'google.workspace.meet.participant.v2.left', 'meet event type');
ok(meet.resourceName.includes('participantSessions'), 'participantSessions name kept');

const sql = fs.readFileSync(path.join(root, 'supabase/sct.sql'), 'utf8');
for (const t of ['sct_subjects', 'sct_instructors', 'sct_settings', 'sct_profiles', 'sct_sessions', 'sct_session_access', 'sct_bookings', 'sct_payments', 'sct_attendance', 'sct_meet_events', 'sct_stripe_events', 'sct_square_events', 'sct_certificates', 'sct_quiz']) {
  ok(sql.includes('alter table public.' + t + ' enable row level security'), 'rls ' + t);
}
ok(sql.includes('12800') && sql.includes('10800') && sql.includes('120') && sql.includes('西岡愛梨'), 'sql prices and instructor');
ok(sql.includes('sct_no_delete') && sql.includes("app_metadata") && sql.includes('sct-proofs') && sql.includes('revoke all on function'), 'sql retention, role, storage');
ok(sql.includes("else 'square'") && sql.includes('square_order_id') && sql.includes('processor_fee_yen'), 'sql begins square payments');
const squareSql = fs.readFileSync(path.join(root, 'supabase/sct_square.sql'), 'utf8');
ok(squareSql.includes('sct_square_events') && squareSql.includes("else 'square'") && squareSql.includes('sct_payments_method_check') && squareSql.includes("status = 'pending'"), 'square migration is re-runnable');
const secret = /sk_live_|rk_live_|whsec_[A-Za-z0-9]{10}|sq0atp-|sq0csp-|EAAA[A-Za-z0-9_-]{20}/;
ok(!secret.test(sql + squareSql), 'sql has no payment secrets');
ok(!fs.existsSync(path.join(root, 'supabase/functions/stripe-webhook/index.ts')), 'stripe webhook removed');
const toml = fs.readFileSync(path.join(root, 'supabase/config.toml'), 'utf8');
ok(toml.includes('[functions.square-webhook]') && !toml.includes('stripe-webhook'), 'jwt skip is square');
for (const f of ['supabase/functions/square-webhook/index.ts', 'supabase/functions/sct-checkout/index.ts', 'supabase/functions/_shared/square.ts', 'supabase/functions/meet-events/index.ts', 'supabase/functions/sct-certificate/index.ts']) {
  const src = fs.readFileSync(path.join(root, f), 'utf8');
  ok(!secret.test(src), 'no embedded secret in ' + f);
  ok(!src.includes('STRIPE_'), 'no stripe secret name in ' + f);
}
const squareSrc = fs.readFileSync(path.join(root, 'supabase/functions/_shared/square.ts'), 'utf8');
const hook = fs.readFileSync(path.join(root, 'supabase/functions/square-webhook/index.ts'), 'utf8');
ok(hook.includes('x-square-hmacsha256-signature') && hook.includes('notificationUrl + raw') && hook.includes('SQUARE_WEBHOOK_SIGNATURE_KEY') && hook.includes('SQUARE_WEBHOOK_NOTIFICATION_URL'), 'signature uses notification url and raw body');
const crypto = require('crypto');
const vector = crypto.createHmac('sha256', 'asdf1234').update('https://example.com/webhook{"hello":"world"}').digest('base64');
ok(vector === '2kRE5qRU2tR+tBGlDwMEw2avJ7QM4ikPYD/PJ3bd9Og=' && squareSrc.includes(vector), 'square published signature vector');
ok(!/Stripe/.test(fs.readFileSync(path.join(root, 'sct.html'), 'utf8') + fs.readFileSync(path.join(root, 'sct.js'), 'utf8') + fs.readFileSync(path.join(root, 'README.md'), 'utf8')), 'screens and readme do not say Stripe');
ok(fs.readFileSync(path.join(root, 'supabase/functions/_shared/cert.ts'), 'utf8').includes('講師名'), 'edge cert template');
ok(fs.readFileSync(path.join(root, 'index.html'), 'utf8').includes("id === 'sct'") && fs.readFileSync(path.join(root, 'sct.html'), 'utf8').includes('sct_logic.js'), 'pages wired');

console.log('sct ok', n);
