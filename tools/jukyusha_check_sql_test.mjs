// supabase/leo_jukyusha_check.sql の動作確認（PGlite＝Postgres で、Supabase の部品を簡単な代用品で置いて実行する）
// 実行：cd tools && npm i @electric-sql/pglite && node jukyusha_check_sql_test.mjs   ※架空のデータだけ。本物の Supabase にはつながない
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const db = new PGlite();
const SQL = fs.readFileSync(new URL('..', import.meta.url).pathname + 'supabase/leo_jukyusha_check.sql', 'utf8');
let bad = 0;
const t = async (name, fn, expectErr) => { try { const r = await fn(); if (expectErr) { bad++; console.log('NG (エラーのはずが通った)', name); } else console.log('ok', name); return r; } catch (e) { if (expectErr && (!(expectErr instanceof RegExp) || expectErr.test(e.message))) console.log('ok', name, '→', e.message.slice(0, 50)); else { bad++; console.log('NG', name, e.message); } } };
await db.exec(`
do $$ begin create role anon nologin; create role authenticated nologin; exception when duplicate_object then null; end $$;
create schema auth; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create function public.can_manage() returns boolean language sql stable as $$ select coalesce(current_setting('test.role', true), '') = 'mgr' $$;
create function public.can_bill() returns boolean language sql stable as $$ select coalesce(current_setting('test.role', true), '') = 'bill' $$;
create function public.my_office() returns text language sql stable as $$ select case when current_setting('test.role', true) in ('mgr', 'leo') then 'レオ' else null end $$;
grant usage on schema public, auth to anon, authenticated; grant execute on all functions in schema public, auth to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;`);   // 本物の Supabase と同じく、新しい表に権限が自動で付く
await db.exec(SQL);
await t('sql を2回流しても壊れない（再実行できる）', () => db.exec(SQL));
const U = '11111111-1111-1111-1111-111111111111', V = '22222222-2222-2222-2222-222222222222';
const as = async (role, who, sql, params) => { await db.exec(`set test.role='${who}'; set test.uid='${U}'; set role ${role}`); try { return await db.query(sql, params); } finally { await db.exec('reset role'); } };
const ins = (who, over = {}, role = 'authenticated') => { const r = { child: 'テスト 太郎', on: '2026-10-20', by: '職員X', note: null, uid: U, ...over }; return as(role, who, `insert into leo_jukyusha_checks (child, checked_on, checked_by, note, created_by) values ($1, $2, $3, $4, $5)`, [r.child, r.on, r.by, r.note, r.uid]); };
await t('管理側（can_manage）は追加できる', () => ins('mgr', { note: '更新後の受給者証を持参' }));
await t('created_by を省くと自分のIDが入る', async () => { await as('authenticated', 'mgr', `insert into leo_jukyusha_checks (child, checked_on, checked_by) values ('テスト 太郎', '2025-04-12', '職員Y')`); const r = await db.query(`select created_by from leo_jukyusha_checks where checked_on = '2025-04-12'`); if (r.rows[0].created_by !== U) throw new Error('uid'); });
await t('レオ職員（管理側でない）は追加できない', () => ins('leo'), /row-level security/);
await t('匿名は追加できない', () => ins('mgr', {}, 'anon'), /permission denied/);
await t('ほかの人のIDでの追加は不可（なりすまし防止）', () => ins('mgr', { uid: V }), /row-level security/);
await t('未来の日付は不可', () => ins('mgr', { on: '2099-01-01' }), /row-level security/);
await t('確認した職員が空は不可', () => ins('mgr', { by: '   ' }), /check/);
await t('職員名が60字を超えると不可', () => ins('mgr', { by: 'あ'.repeat(61) }), /check/);
await t('メモが500字を超えると不可', () => ins('mgr', { note: 'あ'.repeat(501) }), /check/);
await t('児童名が空は不可', () => ins('mgr', { child: '' }), /check/);
await t('レオ職員は読める', async () => { const r = await as('authenticated', 'leo', `select * from leo_jukyusha_checks`); if (r.rows.length !== 2) throw new Error(r.rows.length); });
await t('請求担当（can_bill）も読める', async () => { const r = await as('authenticated', 'bill', `select * from leo_jukyusha_checks`); if (r.rows.length !== 2) throw new Error(r.rows.length); });
await t('ほかの職員（レオでも請求でもない）は読めない（0件）', async () => { const r = await as('authenticated', 'other', `select * from leo_jukyusha_checks`); if (r.rows.length !== 0) throw new Error(r.rows.length); });
await t('匿名は読めない', () => as('anon', 'mgr', `select * from leo_jukyusha_checks`), /permission denied/);
await t('管理側でも直せない（update）', () => as('authenticated', 'mgr', `update leo_jukyusha_checks set checked_by = 'x'`), /permission denied/);
await t('管理側でも消せない（delete）', () => as('authenticated', 'mgr', `delete from leo_jukyusha_checks`), /permission denied/);
await t('新しい順（確認日→id）に並べられる', async () => { const r = await as('authenticated', 'mgr', `select checked_on::text d from leo_jukyusha_checks order by checked_on desc, id desc`); if (r.rows.map(x => x.d).join() !== '2026-10-20,2025-04-12') throw new Error(JSON.stringify(r.rows)); });
await t('既存の表を変えていない（新しい表は1つだけ）', async () => { const r = await db.query(`select table_name from information_schema.tables where table_schema = 'public'`); if (r.rows.map(x => x.table_name).join() !== 'leo_jukyusha_checks') throw new Error(JSON.stringify(r.rows)); });
console.log(bad ? `FAILED ${bad}` : 'ALL OK'); process.exit(bad ? 1 : 0);
