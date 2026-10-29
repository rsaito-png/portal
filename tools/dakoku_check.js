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
ok(!Dakoku.judge({ lat: 1, lng: 1 }, { enabled: true, radius: 200, lat: null, lng: null }).ok, 'no coords');
ok(!Dakoku.judge(null, base).ok, 'no fix');

const sample = Dakoku.sample();
eq(Dakoku.visibleOffices(sample.offices).map(o => o.name), ['RYDEEN'], 'only enabled');
ok(Dakoku.visibleOffices([{ name: 'レオ', enabled: 'FALSE' }, { name: '金斗雲', enabled: false }]).length === 0, 'leo and kintoun hidden');

const staff = sample.staff;
const emailHit = Dakoku.resolveStaff({ email: 'Demo-Staff@example.com', staff: staff, office: 'RYDEEN', chosenId: 'R001' });
eq(emailHit.mode, 'email', 'email mode');
eq(emailHit.staff.id, 'R002', 'email wins');
const pick = Dakoku.resolveStaff({ email: 'nobody@example.com', staff: staff, office: 'RYDEEN', chosenId: 'R001' });
eq(pick.mode, 'pick', 'pick mode');
eq(pick.staff.id, 'R001', 'chosen');
eq(pick.list.map(s => s.id), ['R001', 'R002'], 'inactive and other office dropped');
const none = Dakoku.resolveStaff({ email: '', staff: staff, office: 'RYDEEN', chosenId: '' });
ok(!none.staff && none.list.length === 2, 'need a choice');
const amb = Dakoku.resolveStaff({
  email: 'a@example.com', office: 'RYDEEN', chosenId: 'B',
  staff: [{ id: 'A', name: '甲', office: 'RYDEEN', email: 'a@example.com', enabled: true }, { id: 'B', name: '乙', office: 'RYDEEN', email: 'a@example.com', enabled: true }],
});
eq(amb.mode, 'ambiguous', 'ambiguous');
eq(amb.staff.id, 'B', 'pick among dupes');

ok(Dakoku.kindOk('出勤') && Dakoku.kindOk('退勤') && !Dakoku.kindOk('休憩') && !Dakoku.kindOk(''), 'kinds');

const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
ok(index.includes("id === 'dakoku'") && index.includes('dakoku-lib.js') && index.includes('dakoku.js'), 'index wired');
const cfg = fs.readFileSync(path.join(root, 'config.js'), 'utf8');
ok(cfg.includes("#dakoku") && cfg.includes('gasUrl') && cfg.includes('token:'), 'config tile and endpoint');
const staffJs = fs.readFileSync(path.join(root, 'rydeen-staff.js'), 'utf8');
ok(staffJs.includes('href="#dakoku"'), 'link beside staff screen');
const gas = fs.readFileSync(path.join(root, 'dakoku-gas/Code.gs'), 'utf8');
['function doGet', 'function doPost', 'DAKOKU_TOKEN', '打刻ログ', '設定', '職員', '6371000', '1KEyzLGVwIWR2ziWNyghhGzSf6B2ZfHE-UIj8U0szxzs', 'text/plain', '管理者修正'].forEach(s => ok(gas.includes(s), 'gas ' + s));
ok(gas.includes('種別は出勤か退勤') && gas.includes('ログイン中のメールと職員が一致しません'), 'gas checks');

console.log('ok', n);
