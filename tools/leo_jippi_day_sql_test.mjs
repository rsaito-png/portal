// supabase/leo_jippi_day.sql（日別明細）の動作確認。leo_jippi_fee_confirm.sql のあとに流す（PGlite。架空のデータだけ。本番にはつながない）
// 実行: cd tools && npm i @electric-sql/pglite && node leo_jippi_fee_sql_test.mjs
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import fs from 'fs';
const db = new PGlite({ extensions: { pgcrypto } });
const root = new URL('..', import.meta.url).pathname;
const KAKUNIN = fs.readFileSync(root + 'supabase/leo_kakunin.sql', 'utf8');
const FEE = fs.readFileSync(root + 'supabase/leo_jippi_fee_confirm.sql', 'utf8');
const DAY = fs.readFileSync(root + 'supabase/leo_jippi_day.sql', 'utf8');
const BACK = fs.readFileSync(root + 'supabase/leo_jippi_day_rollback.sql', 'utf8');
let bad = 0;
const ok = (c, name, info) => { if (c) console.log('ok', name); else { bad++; console.log('NG', name, info ?? ''); } };
await db.exec(`
create extension if not exists pgcrypto schema public;
create schema if not exists extensions;
create or replace function extensions.gen_random_bytes(int) returns bytea language sql as 'select public.gen_random_bytes($1)';
do $$ begin create role anon nologin; create role authenticated nologin; exception when duplicate_object then null; end $$;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create function public.can_manage() returns boolean language sql stable as $$ select false $$;
create function public.can_manage_for(p_office text) returns boolean language sql stable as $$ select false $$;
create function public.notify_enqueue(p_aud text, p_kind text, p_text text, p_link text, p_office text default 'レオ') returns void language sql as $$ select null $$;
grant usage on schema public, auth, extensions to anon, authenticated;
grant execute on all functions in schema public, extensions, auth to anon, authenticated;
create table public.leo_jisseki (day date not null, child text not null, status text, start_time text, end_time text, primary key (day, child));
create table public.leo_nikki (day date not null, row_no int not null, kind text not null, child text, primary key (day, row_no));
create table public.leo_jippi (ym text not null, child text not null, guardian text, lunch int not null default 0, snack int not null default 0,
  pay_link text, note text, primary key (ym, child));
`);
await db.exec(KAKUNIN);
await db.exec(`alter table leo_jippi add column burden int not null default 0; alter table leo_jippi add column pay_link_amount int;`);
await db.exec(FEE); await db.exec(DAY); await db.exec(DAY);
ok(true, 'sql を2回流しても壊れない');
const A = 'aa'.repeat(24), B = 'bb'.repeat(24), Z = 'cc'.repeat(24);
await db.exec(`
insert into leo_confirm_links (token, child, month) values ('${A}', '見本A', '2026-10'), ('${B}', '見本B', '2026-10'), ('${Z}', '見本Z', '2026-10');
insert into leo_jippi (ym, child, lunch, snack, burden, pay_link, pay_link_amount) values
  ('2026-10', '見本A', 0, 765, 4600, 'https://square.link/u/new', 5365),
  ('2026-10', '見本B', 0, 765, 4600, 'https://square.link/u/old', 765),
  ('2026-10', '見本Z', 0, 0, 4600, 'https://square.link/u/z', 4600);
`);
const get = async tok => { await db.exec('set role anon'); try { return (await db.query('select leo_confirm_get($1) j', [tok])).rows[0].j; } finally { await db.exec('reset role'); } };
await db.exec(`
insert into leo_jippi_day (day, child, ym, lunch, snack) values
  ('2026-10-01', '見本A', '2026-10', 0, 145), ('2026-10-02', '見本A', '2026-10', 0, 620), ('2026-10-05', '見本A', '2026-10', 0, 0),
  ('2026-10-01', '見本B', '2026-10', 0, 646);
`);
const a = await get(A);
ok(Object.keys(a.jippi).sort().join() === 'burden,days,found,lunch,pay_link,snack,total', 'jippi のキー（days を足しただけ）', Object.keys(a.jippi));
ok(a.jippi.total === 5365 && a.jippi.burden === 4600 && a.jippi.pay_link === 'https://square.link/u/new', '既存の値は変わらない', JSON.stringify(a.jippi));
ok(Array.isArray(a.jippi.days) && a.jippi.days.length === 2 && a.jippi.days[0].day === '2026-10-01' && a.jippi.days[1].snack === 620, '合計が合えば0円の日を除いて日付順', JSON.stringify(a.jippi.days));
ok(!JSON.stringify(a.jippi.days).includes('見本'), '明細に児童名は入れない');
const b = await get(B);
ok(b.jippi.days === null, '日別の合計（646）が月のおやつ代（765）と違えば出さない', JSON.stringify(b.jippi.days));
const z = await get(Z);
ok(z.jippi.days === null, 'お昼・おやつが0円なら明細なし（利用料は日別にしない）', JSON.stringify(z.jippi.days));
await db.exec('set role anon');
let denied = false; try { await db.query('select * from leo_jippi_day'); } catch { denied = true; }
await db.exec('reset role');
ok(denied, '匿名は leo_jippi_day を直接読めない');
let wrong = false; try { await db.exec(`insert into leo_jippi_day (day, child, ym) values ('2026-11-01', '見本A', '2026-10')`); } catch { wrong = true; }
ok(wrong, '日付と月がずれた行は入らない');
await db.exec(BACK);
const r = await get(A);
ok(!('days' in r.jippi) && r.jippi.total === 5365, 'ロールバックで days なしの形に戻る', JSON.stringify(r.jippi));
ok((await db.query('select count(*)::int n from leo_jippi_day')).rows[0].n === 4, 'ロールバックしても明細データは消えない');
if (bad) { console.log(bad + ' NG'); process.exit(1); } else console.log('all ok');
