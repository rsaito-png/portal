// moonSignLabel の期待値チェック（Node・ブラウザなし）
const fs = require('fs');
const vm = require('vm');
const code = fs.readFileSync(__dirname + '/data/seed.js', 'utf8');
const ctx = { window: {} }; vm.runInNewContext(code, ctx);
const SEED = ctx.window.SEED;
const MOONSIGN = (() => {
  const o = {}; let prev = '';
  Object.keys(SEED.days).sort().forEach(k => {
    const g = String(SEED.days[k].ingress || '').match(/^(?:(\d{1,2}:\d{2})\s+)?(\S+座)/);
    if (!g) { o[k] = null; return; }
    o[k] = g[1] ? { from: prev || null, to: g[2], at: g[1] } : { to: g[2] };
    prev = g[2];
  });
  return o;
})();
function moonSignLabel(k) {
  const m = MOONSIGN[k]; if (!m) return '';
  return m.at && m.from ? m.from + '→' + m.to : (m.to || '');
}
const cases = [
  ['2026-10-11', '天秤座', '天秤座'],         // 終日・太陽と同じだが月導出
  ['2026-10-12', '天秤座', '天秤座→蠍座'],   // 00:21 蠍座
  ['2026-10-15', '天秤座', '射手座'],        // 太陽天秤≠月射手
  ['2026-10-16', '天秤座', '射手座→山羊座'], // 21:57 山羊座
  ['2026-10-17', '天秤座', '山羊座'],        // 終日山羊（太陽は天秤）
];
let fail = 0;
for (const [d, sun, want] of cases) {
  const got = moonSignLabel(d);
  const ok = got === want;
  console.log(`${ok ? 'OK' : 'NG'} ${d} sun=${sun} moonLabel=${got} want=${want}`);
  if (!ok) fail++;
}
if (fail) { console.error(fail + ' failed'); process.exit(1); }
console.log('all passed');
