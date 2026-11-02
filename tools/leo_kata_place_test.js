// 迎え場所・送り場所（回答→型表→空欄）の SQL が、3つの SQL ファイルで同じ内容かを確かめる（DB は使わない）。
// 使い方: node tools/leo_kata_place_test.js
const fs = require('fs'), assert = require('assert');
const block = f => { const s = fs.readFileSync(f, 'utf8'); const m = s.match(/-- BEGIN leo_sched_plan_core\n([\s\S]*?)-- END leo_sched_plan_core/); assert(m, f + ': plan_core block'); return m[1]; };
const files = ['supabase/leo_schedule_build.sql', 'supabase/leo_left.sql', 'supabase/leo_sched_name.sql'];
const b = files.map(block);
assert.strictEqual(b[0], b[1], 'leo_left.sql plan_core differs from leo_schedule_build.sql');
assert.strictEqual(b[0], b[2], 'leo_sched_name.sql plan_core differs from leo_schedule_build.sql');
for (const x of b) {
  assert(!/'（未登録）'/.test(x), '（未登録）が残っている');
  assert(!/else '自宅' end/.test(x) && !/, '自宅'\)/.test(x), '自宅の既定値が残っている');
  assert(/coalesce\(nullif\(btrim\(w\.pick_place, E' \\t　'\), ''\), s\.pplace\)/.test(x), '回答の迎え場所（空白だけは空欄扱い）→型表の順になっていない');
  assert(/coalesce\(nullif\(btrim\(w\.drop_place, E' \\t　'\), ''\), s\.dplace\)/.test(x), '回答の送り場所（空白だけは空欄扱い）→型表の順になっていない');
  assert(/where v\.kind|v\.kind = '送り場所変更'/.test(x) || /送り場所変更/.test(x), '送り場所変更の例外が消えている');
  assert(/set dplace = v\.place/.test(x), '送り場所変更の上書きが消えている');
  assert(/jsonb_object_agg\(child, nullif\(btrim\(pe\), ''\)\) kt/.test(x), '送りの児童ごとの時刻が送り終了になっていない');
  assert(!/jsonb_object_agg\(child, ke\) kt/.test(x), '送りの児童ごとの時刻に利用終了が残っている');
  assert(/nullif\(btrim\(kata\.k->>'送り時間'\), ''\)/.test(x), '列名が送り時間の行を読んでいない');
}
const dep = fs.readFileSync('supabase/leo_schedule_build.sql', 'utf8');
const commit = dep.slice(dep.indexOf('create or replace function public.leo_sched_commit'), dep.indexOf('revoke all on function public.leo_sched_plan, public.leo_sched_commit'));
assert(/coalesce\(v, ''\) <> '' and v <> '自宅'/.test(commit), 'commit の place が空欄を除いていない');

// 保護者フォームの場所の初期値：型表だけ（前回の回答は使わない）。型表が空欄なら空欄（自宅を補わない）
const getBlock = f => { const t = fs.readFileSync(f, 'utf8'); const i = t.indexOf('create or replace function public.leo_sched_get'); assert(i >= 0, f + ': leo_sched_get'); return t.slice(i, t.indexOf('end $$;', i)); };
const gets = ['supabase/leo_sched_name.sql', 'supabase/leo_left.sql', 'supabase/leo_schedule.sql'].map(getBlock);
assert.strictEqual(gets[0], gets[1], 'leo_left.sql の leo_sched_get が違う');
assert.strictEqual(gets[0], gets[2], 'leo_schedule.sql の leo_sched_get が違う');
assert(!/'自宅'/.test(gets[0]), 'leo_sched_get に自宅の既定値が残っている');
assert(/'drop_place', nullif\(btrim\(k->>'送り場所（空欄なら自宅）', E' \\t　'\), ''\)/.test(gets[0]), 'drop_place が空欄のままになっていない');
const html = fs.readFileSync('yotei.html', 'utf8');
const wdLine = html.split('\n').find(l => l.includes('S.wd[w] = {'));
assert(wdLine, 'yotei.html の初期値の行');
assert(/pick_place: r\.pick_place \|\| '', drop_place: r\.drop_place \|\| ''/.test(wdLine), '場所の初期値が型表だけになっていない');
assert(!/p\.pick_place|p\.drop_place|'自宅'/.test(wdLine), '場所の初期値に前回の回答か自宅が残っている');
assert(html.includes('お迎え・送りの場所を変える'), '保護者フォームの場所欄は残す');
console.log('leo_kata_place_test.js ok');
