const fs = require('fs'), assert = require('assert'), path = require('path');
const r = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const cfg = r('config.js'), idx = r('index.html');
assert(/id: 'ryozan', name: '梁山泊'/.test(cfg)); assert(cfg.includes("'#ryozan/meal'")); assert(cfg.includes("'梁山泊': { place: '梁山泊'"));
assert(idx.includes('ryozan.js?v=')); assert(idx.includes("id === 'ryozan' && sub === 'meal'"));
assert(fs.existsSync(path.join(__dirname, '..', 'supabase/ryozan_meal.sql')));
assert(r('dakoku.js').includes('function dkAssigned'));
console.log('ryozan ok');
