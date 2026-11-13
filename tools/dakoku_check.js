// 出退勤打刻の判定。node tools/dakoku_check.js
const fs = require('fs');
const path = require('path');
const Dakoku = require('../dakoku-lib.js');
const root = path.join(__dirname, '..');
let n = 0;
const ok = (cond, msg) => { n++; if (!cond) { console.error('FAIL', msg); process.exit(1); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), msg + ' got ' + JSON.stringify(a));

ok(Dakoku.on('TRUE') && Dakoku.on(true) && !Dakoku.on('FALSE') && !Dakoku.on(''), 'on');
ok(Dakoku.officeView({ '事業所名': 'レオ', '略称': 'LEO', '有効': 'FALSE', '打刻許可半径(m)': '200' }).enabled === false, 'sheet false');
const ry = Dakoku.officeView({ name: 'RYDEEN', enabled: 'TRUE', radius: '200', lat: '35.034866', lng: '136.583191' });
eq(ry.lat, 35.034866, 'lat');
eq(ry.radius, 200, 'radius');

const base = { name: 'RYDEEN', enabled: true, radius: 200, lat: 35.034866, lng: 136.583191 };
const here = Dakoku.judge({ lat: 35.034866, lng: 136.583191 }, base);
ok(here.ok && here.distance < 1, 'same point');
const north = { lat: 35.034866 + 0.001, lng: 136.583191 };
const d = Dakoku.meters(base.lat, base.lng, north.lat, north.lng);
ok(d > 100 && d < 130, 'about 111m ' + d);
ok(Dakoku.judge(north, base).ok, 'inside 200m');
const far = { lat: 35.034866 + 0.003, lng: 136.583191 };
const out = Dakoku.judge(far, base);
ok(!out.ok && out.reason.indexOf('範囲外') === 0, 'outside ' + out.reason);
ok(!Dakoku.judge({ lat: 1, lng: 1 }, { enabled: false, radius: 200, lat: 1, lng: 1 }).ok, 'disabled office');
ok(Dakoku.judge({ lat: 1, lng: 1 }, { enabled: true, radius: 200, lat: null, lng: null }).ok, 'no coords means GPS off');
ok(Dakoku.gpsRequired({ enabled: true, radius: 200, lat: null, lng: null }) === false, 'gpsRequired empty');
ok(!Dakoku.judge(null, base).ok, 'no fix');

const sample = Dakoku.sample();
eq(Dakoku.visibleOffices(sample.offices).map(o => o.name), ['金斗雲', 'RYDEEN'], 'enabled offices');
ok(Dakoku.visibleOffices([{ name: 'レオ', enabled: 'FALSE' }, { name: '金斗雲', enabled: false }]).length === 0, 'disabled hidden');

const staff = sample.staff;
const emailHit = Dakoku.resolveStaff({ email: 'Demo-Staff@example.com', staff: staff, office: 'RYDEEN', chosenId: 'R001' });
eq(emailHit.mode, 'email', 'email mode');
eq(emailHit.staff.id, 'R002', 'email wins');
const unreg = Dakoku.resolveStaff({ email: 'nobody@example.com', staff: staff, office: 'RYDEEN', chosenId: 'R001' });
eq(unreg.mode, 'unregistered', 'unregistered blocks others');
ok(!unreg.staff && unreg.list.length === 0, 'no stranger pick');
const pick = Dakoku.resolveStaff({ email: 'nobody@example.com', staff: staff, office: 'RYDEEN', chosenId: 'R001', allowPick: true });
eq(pick.mode, 'pick', 'demo pick mode');
eq(pick.staff.id, 'R001', 'demo chosen');
const none = Dakoku.resolveStaff({ email: '', staff: staff, office: 'RYDEEN', chosenId: '' });
eq(none.mode, 'noemail', 'no login email');
ok(!none.staff, 'no staff without email');
const amb = Dakoku.resolveStaff({
  email: 'a@example.com', office: 'RYDEEN', chosenId: 'B',
  staff: [{ id: 'A', name: '甲', office: 'RYDEEN', email: 'a@example.com', enabled: true }, { id: 'B', name: '乙', office: 'RYDEEN', email: 'a@example.com', enabled: true }],
});
eq(amb.mode, 'ambiguous', 'ambiguous');
eq(amb.staff.id, 'B', 'pick among dupes');
const multi = Dakoku.officesForEmail(sample.offices, [
  { id: 'L002', name: '見本A', office: '金斗雲', email: 'dual@example.com', enabled: true },
  { id: 'R002', name: '見本B', office: 'RYDEEN', email: 'dual@example.com', enabled: true },
  { id: 'R001', name: '他', office: 'RYDEEN', email: 'other@example.com', enabled: true },
], 'dual@example.com');
eq(multi.offices.map(o => o.name).sort(), ['RYDEEN', '金斗雲'], 'email offices only');
const self = Dakoku.resolveStaff({ email: 'dual@example.com', staff: multi.staff.concat([{ id: 'X', name: '他人', office: 'RYDEEN', email: 'x@example.com', enabled: true }]), office: 'RYDEEN', chosenId: '' });
eq(self.mode, 'email', 'self at office');
eq(self.staff.id, 'R002', 'self id');

ok(Dakoku.kindOk('出勤') && Dakoku.kindOk('退勤') && !Dakoku.kindOk('休憩') && !Dakoku.kindOk(''), 'kinds');

const noGps = { name: '金斗雲', code: 'KINTOUN', radius: null, lat: null, lng: null, enabled: true };
ok(Dakoku.gpsRequired(noGps) === false, 'gpsRequired false for empty coords');
ok(Dakoku.judge(null, noGps).ok === true, 'judge ok without position when GPS off');
ok(Dakoku.gpsRequired({ name: 'RYDEEN', lat: 35.034866, lng: 136.583191, radius: 200, enabled: true }) === true, 'gpsRequired true for RYDEEN');

const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
ok(index.includes("id === 'dakoku'") && index.includes('dakoku-lib.js') && index.includes('dakoku.js'), 'index wired');
ok(index.includes("id === 'dakoku-settings'") && index.includes('dakoku_admin.js'), 'settings screen wired');
const cfg = fs.readFileSync(path.join(root, 'config.js'), 'utf8');
ok(cfg.includes("#dakoku") && cfg.includes('#dakoku-settings'), 'config dakoku tiles');
const staffJs = fs.readFileSync(path.join(root, 'rydeen-staff.js'), 'utf8');
ok(staffJs.includes('href="#dakoku"'), 'link beside staff screen');
const ui = fs.readFileSync(path.join(root, 'dakoku.js'), 'utf8');
ok(ui.includes('gpsRequired') && ui.includes('位置情報不要') && ui.includes('ポータルへ'), 'ui no-GPS path');
ok(ui.includes('名簿に未登録') && ui.includes('staffByEmail') && ui.includes('dkOffices'), 'ui email lock');
ok(ui.includes('rpc/dakoku_bootstrap') && ui.includes('rpc/dakoku_punch') && ui.includes('rpc/dakoku_recent') && ui.includes('rpc/dakoku_month'), 'ui uses Supabase RPCs');
ok(!ui.includes('script.google.com') && !ui.includes('gasUrl') && !ui.includes('dkIngestFromGas_') && !ui.includes('dakoku_ingest_gas'), 'ui has no GAS/Google punch path');
ok(ui.includes('月別一覧') && ui.includes('Registro mensal') && ui.includes('dkLoadMonth'), 'ui month list');
ok(!cfg.includes('script.google.com') || !/dakoku:\s*\{[^}]*gasUrl/.test(cfg.replace(/\n/g,' ')), 'config dakoku has no gasUrl');
ok(!/dakoku:\s*\{[^}]*gasUrl/.test(cfg.replace(/\s+/g,' ')), 'config dakoku block has no gasUrl');
ok(!cfg.includes("gasUrl: 'https://script.google.com"), 'config no script.google gasUrl');
const gas = fs.readFileSync(path.join(root, 'dakoku-gas/Code.gs'), 'utf8');
ok(gas.includes('function doGet') && gas.includes('function doPost') && gas.includes('新しい画面に切り替わりました'), 'gas stub refuses punches');
ok(!gas.includes('dkAppend_') && !gas.includes('SpreadsheetApp') && !gas.includes('dakoku_ingest'), 'gas stub writes nothing');
const admin = fs.readFileSync(path.join(root, 'dakoku_admin.js'), 'utf8');
ok(admin.includes('renderDakokuSettings') && admin.includes('dakoku_offices') && admin.includes('dakoku_staff'), 'admin edits offices/staff');
const sql = fs.readFileSync(path.join(root, 'supabase/dakoku.sql'), 'utf8');
ok(sql.includes('dakoku_bootstrap') && sql.includes('dakoku_punch') && sql.includes('on conflict (name) do nothing'), 'sql migrate preserves values');
ok(sql.includes('dakoku_month') && sql.includes('自分の打刻だけ見られます'), 'sql month rpc + recent lock');
ok(!sql.includes('dakoku_ingest_gas'), 'sql has no gas ingest');
ok(sql.includes("'金斗雲', 'KINTOUN', null, null, null"), 'kintoun seeded without GPS');
ok(index.includes('portalBuild') && index.includes('dakoku.js?v=20261113approve') && index.includes('dakoku-lib.js?v=20261110req') && index.includes('Cache-Control'), 'index cache-bust');
ok(index.includes("sub === 'approve'") && index.includes('renderDakokuApprove'), 'index routes #dakoku/approve');

ok(Dakoku.currentMonthJst(new Date('2026-11-09T06:00:00Z')) === '2026-11', 'currentMonthJst');
eq(Dakoku.shiftMonth('2026-11', -1), '2026-10', 'shift prev');
eq(Dakoku.shiftMonth('2026-12', 1), '2027-01', 'shift next year');
ok(Dakoku.isProxyMemo('管理者記録（打刻漏れ）／齊藤さん指示で代理入力') && !Dakoku.isProxyMemo('昼食=いいえ'), 'proxy memo');
const packed = Dakoku.pairMonth([
  { at: '2026-11-07 10:55:40', kind: '出勤' },
  { at: '2026-11-07 13:12:35', kind: '退勤' },
  { at: '2026-11-07 14:58:47', kind: '出勤' },
  { at: '2026-11-07 20:43:48', kind: '退勤' },
  { at: '2026-11-09 15:00:00', kind: '出勤', memo: '管理者記録（打刻漏れ）／齊藤さん指示で代理入力' },
]);
eq(packed.pairs.length, 3, 'pair count');
eq(packed.pairs[0], { day: '2026-11-07', inAt: '10:55', outAt: '13:12', minutes: 137, proxy: false, req: false, inReq: false, outReq: false, missing: null }, 'pair1');
eq(packed.pairs[1].minutes, 345, 'pair2 mins');
ok(packed.pairs[2].proxy && packed.pairs[2].missing === '退勤なし', 'proxy open');
eq(packed.totalMinutes, 137 + 345, 'month total');
eq(Dakoku.formatHours(137), '2時間17分', 'formatHours');
ok(Dakoku.parseJst('2026-11-09 9:14:14') && Dakoku.parseJst('2026-11-09 9:14:14').hm === '09:14', 'parseJst pads hour');
const missIn = Dakoku.pairMonth([{ at: '2026-11-01 18:00:00', kind: '退勤' }]);
eq(missIn.pairs[0].missing, '出勤なし', 'missing in');

// 打刻忘れ申告
ok(Dakoku.isRequestMemo('本人申告（打刻漏れ）／齊藤連承認：押し忘れ') && !Dakoku.isRequestMemo('管理者記録（打刻漏れ）') && !Dakoku.isProxyMemo('本人申告（打刻漏れ）'), 'request memo');
const reqPack = Dakoku.pairMonth([
  { at: '2026-11-05 09:00:00', kind: '出勤' },
  { at: '2026-11-05 18:00:00', kind: '退勤', memo: '本人申告（打刻漏れ）／齊藤連承認：押し忘れ', request: true },
]);
ok(reqPack.pairs[0].req && reqPack.pairs[0].outReq && !reqPack.pairs[0].inReq && !reqPack.pairs[0].proxy, 'request pair flagged on out');
eq(reqPack.totalMinutes, 540, 'request counted in total');
const NOW = new Date('2026-11-10T06:00:00Z'); // JST 15:00
eq(Dakoku.todayJst(NOW), '2026-11-10', 'todayJst');
eq(Dakoku.addDays('2026-11-10', -31), '2026-10-10', 'addDays');
const rq = f => Dakoku.checkRequest(Object.assign({ date: '2026-11-09', kind: '退勤', time: '18:00', reason: '押し忘れ' }, f), NOW);
ok(rq({}).ok && rq({}).time === '18:00', 'request ok');
ok(rq({ time: '9:05' }).ok && rq({ time: '9:05' }).time === '09:05', 'request pads time');
ok(!rq({ date: '2026-11-11' }).ok, 'request future date');
ok(!rq({ date: '2026-10-09' }).ok && rq({ date: '2026-10-10' }).ok, 'request 31-day window');
ok(!rq({ date: '2026-11-10', time: '15:30' }).ok && rq({ date: '2026-11-10', time: '14:59' }).ok, 'request today future time');
ok(!rq({ reason: '  ' }).ok, 'request reason required');
ok(!rq({ kind: '休憩' }).ok && !rq({ time: '25:00' }).ok && !rq({ date: '' }).ok, 'request bad input');
ok(Dakoku.canRequestDay('2026-11-01', NOW) && !Dakoku.canRequestDay('2026-11-11', NOW) && !Dakoku.canRequestDay('2026-09-30', NOW), 'canRequestDay');
ok(Dakoku.reqStatusLabel('pending').indexOf('承認待ち') === 0 && Dakoku.reqStatusLabel('rejected').indexOf('却下') === 0, 'status labels');
ok(ui.includes('rpc/dakoku_request_submit') && ui.includes('rpc/dakoku_request_list') && ui.includes('rpc/dakoku_request_decide'), 'ui request RPCs');
ok(ui.includes('打刻忘れを申告') && ui.includes('Informar registro esquecido') && ui.includes('req-fill') && ui.includes('申告 / Declarado'), 'ui request form + prefill + label');
ok(ui.includes('dkReqAdminHtml') && ui.includes('承認') && ui.includes('却下'), 'ui admin approve/reject');
ok(ui.includes('function renderDakokuApprove') && ui.includes('function dkPaintApprove') && ui.includes('dkIsApprovePage'), 'approve-only screen');
const ap = (ui.match(/function dkPaintApprove\([\s\S]*?\nasync function renderDakokuApprove/) || [])[0] || '';
ok(ap && ap.includes('承認待ちはありません') && ap.includes('req-ok') && ap.includes('req-ng') && ap.includes('理由：'), 'approve shows list + decide buttons + empty line');
ok(ap && !ap.includes('data-dk="in"') && !ap.includes('月別一覧') && !ap.includes('dk_lunch') && !ap.includes('req-open') && !ap.includes('位置を取り直す'), 'approve has no punch/month/form/geo');
ok(ui.includes('function renderDakoku()') && ui.includes('押し忘れたら、下の「打刻忘れを申告」') && ui.includes('Registrar entrada/saída'), 'regular #dakoku screen unchanged');

ok(!ui.includes('押し忘れを直す画面は、まだありません'), 'old no-fix note removed');
const rsql = fs.readFileSync(path.join(root, 'supabase/dakoku_requests.sql'), 'utf8');
ok(rsql.includes('create table if not exists public.dakoku_requests') && rsql.includes('alter table public.dakoku_requests enable row level security'), 'requests table + RLS');
ok(rsql.includes('revoke all on public.dakoku_requests from public, anon, authenticated') && !/create policy[^;]*dakoku_requests/.test(rsql), 'requests no direct access');
['dakoku_request_submit', 'dakoku_request_list', 'dakoku_request_decide'].forEach(fn => {
  const m = rsql.match(new RegExp('create or replace function public\\.' + fn + '\\([\\s\\S]*?\\$\\$;'));
  ok(m && /security definer set search_path = public/.test(m[0]), fn + ' security definer + search_path');
  ok(new RegExp('revoke all on function public\\.' + fn + '\\([^)]*\\) from public, anon').test(rsql) && new RegExp('grant execute on function public\\.' + fn + '\\([^)]*\\) to authenticated').test(rsql), fn + ' grants');
});
ok(rsql.includes('dakoku_admin_can()') && rsql.includes("'本人申告（打刻漏れ）／' || decider || '承認：'") && rsql.includes("'YYYY-MM-DD HH24:MI:SS'") && rsql.includes("at time zone 'Asia/Tokyo'"), 'decide inserts JST punch with memo');
ok(rsql.includes('dakoku_todo_assignee') && rsql.includes("is_chair") && rsql.includes("'rsaito@psr-seishinkai.org'"), 'todo assignee is chair then rsaito@');
ok(rsql.includes("insert into public.staff_todo") && rsql.includes("'dakoku:req:'") && rsql.includes("'#dakoku/approve'"), 'submit creates staff_todo for chair');
ok(!/values \(who, v_title, '#dakoku',/.test(rsql) && rsql.includes("set link = '#dakoku/approve'"), 'todo link is approve page, existing rows updated');
ok(rsql.includes("t.source_key = 'dakoku:req:' || r.id and t.status <> 'done'"), 'decide closes matching staff_todo');
ok(!rsql.includes('notify_enqueue') && !rsql.includes('script.google.com'), 'request path still no chat/Google');

ok(rsql.includes("'request', coalesce(memo,'') like '本人申告%'") && sql.includes("'request', coalesce(memo,'') like '本人申告%'"), 'month returns request flag (both sql files)');
ok(!rsql.includes('script.google.com') && !rsql.includes('gasUrl') && !lib_has_google(), 'no Google in request path');
function lib_has_google() { const lib = fs.readFileSync(path.join(root, 'dakoku-lib.js'), 'utf8'); return lib.includes('script.google.com') || lib.includes('gasUrl'); }

console.log('ok', n);
