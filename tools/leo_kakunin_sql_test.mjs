// supabase/leo_kakunin.sql の動作確認（PGlite＝Postgres。架空のデータだけ。本番にはつながない）
// 実行: cd tools && npm i @electric-sql/pglite && node leo_kakunin_sql_test.mjs
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import fs from 'fs';
const db = new PGlite({ extensions: { pgcrypto } });
const root = new URL('..', import.meta.url).pathname;
const SQL = fs.readFileSync(root + 'supabase/leo_kakunin.sql', 'utf8');
let bad = 0;
const t = async (name, fn, expectErr) => {
  try {
    const r = await fn();
    if (expectErr) { bad++; console.log('NG (エラーのはずが通った)', name); }
    else console.log('ok', name);
    return r;
  } catch (e) {
    if (expectErr && (!(expectErr instanceof RegExp) || expectErr.test(e.message))) console.log('ok', name);
    else { bad++; console.log('NG', name, e.message); }
  }
};
await db.exec(`
create extension if not exists pgcrypto schema public;
create schema if not exists extensions;
create or replace function extensions.gen_random_bytes(int) returns bytea language sql as 'select public.gen_random_bytes($1)';
do $$ begin create role anon nologin; create role authenticated nologin; exception when duplicate_object then null; end $$;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create function public.can_manage() returns boolean language sql stable as $$ select coalesce(current_setting('test.mgr', true), '') = '1' $$;
create function public.can_manage_for(p_office text) returns boolean language sql stable as $$
  select public.can_manage() and p_office = 'レオ' $$;
create function public.notify_enqueue(p_aud text, p_kind text, p_text text, p_link text, p_office text default 'レオ')
  returns void language sql as $$ select null $$;
grant usage on schema public, auth, extensions to anon, authenticated;
grant execute on all functions in schema public, extensions, auth to anon, authenticated;
create table public.leo_jisseki (day date not null, child text not null, status text, start_time text, end_time text, primary key (day, child));
create table public.leo_nikki (day date not null, row_no int not null, kind text not null, child text, primary key (day, row_no));
create table public.leo_jippi (
  ym text not null, child text not null, guardian text, lunch int not null default 0, snack int not null default 0,
  pay_link text, note text, primary key (ym, child));
grant all on public.leo_jippi to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
`);
await t('sql を2回流しても壊れない', async () => { await db.exec(SQL); await db.exec(SQL); });
const as = async (role, mgr, sql, params) => {
  await db.exec(`set test.mgr='${mgr ? 1 : 0}'; set test.uid='11111111-1111-1111-1111-111111111111'; set role ${role}`);
  try { return await db.query(sql, params); }
  finally { await db.exec('reset role'); }
};
const A = 'aa'.repeat(24), B = 'bb'.repeat(24), NONE = 'cc'.repeat(24), ZERO = 'dd'.repeat(24);
await db.exec(`
insert into leo_confirm_links (token, child, month) values
  ('${A}', '見本A', '2026-11'), ('${B}', '見本B', '2026-11'), ('${NONE}', '見本なし', '2026-11'), ('${ZERO}', '見本ゼロ', '2026-11');
insert into leo_jippi (ym, child, guardian, lunch, snack, pay_link, note) values
  ('2026-11', '見本A', '保護者A', 1200, 400, 'https://square.link/u/a', 'メモA'),
  ('2026-11', '見本B', '保護者B', 9999, 8888, 'https://square.link/u/b', 'メモB'),
  ('2026-11', '見本ゼロ', '保護者Z', 0, 0, 'https://square.link/u/z', 'メモZ'),
  ('2026-11', '見本A ', '別人', 7777, 1, 'https://square.link/u/space', '空白違い');
insert into leo_jisseki (day, child, status, start_time, end_time) values
  ('2026-11-02', '見本A', '利用', '14:45', '17:00'),
  ('2026-11-03', '見本B', '利用', '10:00', '12:00');
`);
const get = tok => as('anon', false, 'select leo_confirm_get($1) j', [tok]);
await t('匿名：自分の実績と実費だけ', async () => {
  const j = (await get(A)).rows[0].j;
  const keys = Object.keys(j).sort().join();
  const jk = Object.keys(j.jippi).sort().join();
  if (keys !== 'child,jippi,last,month,rows') throw new Error('keys ' + keys);
  if (jk !== 'found,lunch,pay_link,snack,total') throw new Error('jippi keys ' + jk);
  if (j.child !== '見本A' || j.month !== '2026-11' || j.rows.length !== 1 || j.rows[0].status !== '利用') throw new Error(JSON.stringify(j.rows));
  if (!j.jippi.found || j.jippi.lunch !== 1200 || j.jippi.snack !== 400 || j.jippi.total !== 1600) throw new Error(JSON.stringify(j.jippi));
  if (j.jippi.pay_link !== 'https://square.link/u/a') throw new Error(j.jippi.pay_link);
  const text = JSON.stringify(j);
  if (/見本B|9999|8888|メモ|保護者A|7777|square\.link\/u\/b|square\.link\/u\/space|利用者負担/.test(text)) throw new Error(text);
});
await t('匿名：別の児童の実費は出ない', async () => {
  const j = (await get(B)).rows[0].j;
  if (j.child !== '見本B' || j.jippi.lunch !== 9999 || j.jippi.pay_link !== 'https://square.link/u/b') throw new Error(JSON.stringify(j.jippi));
  if (JSON.stringify(j).includes('1200') || JSON.stringify(j).includes('見本A')) throw new Error(JSON.stringify(j));
});
await t('行が無い月は実費なし（確認はできる形）', async () => {
  const j = (await get(NONE)).rows[0].j;
  if (j.jippi.found || j.jippi.lunch !== 0 || j.jippi.snack !== 0 || j.jippi.total !== 0 || j.jippi.pay_link !== null) throw new Error(JSON.stringify(j.jippi));
  if (j.rows.length !== 0) throw new Error('rows');
});
await t('0円は実費なし。支払いリンクは返さない', async () => {
  const j = (await get(ZERO)).rows[0].j;
  if (!j.jippi.found || j.jippi.total !== 0 || j.jippi.pay_link !== null) throw new Error(JSON.stringify(j.jippi));
});
await t('http のリンクは返さない', async () => {
  await db.exec(`update leo_jippi set pay_link = 'http://square.link/u/a' where child = '見本A'`);
  const j = (await get(A)).rows[0].j;
  if (j.jippi.pay_link !== null || j.jippi.total !== 1600) throw new Error(JSON.stringify(j.jippi));
  await db.exec(`update leo_jippi set pay_link = 'https://square.link/u/a' where child = '見本A'`);
});
await t('違うトークンは null', async () => {
  const j = (await get('ee'.repeat(24))).rows[0].j;
  if (j !== null) throw new Error(JSON.stringify(j));
});
await t('短いトークンは null', async () => {
  const j = (await get('abc')).rows[0].j;
  if (j !== null) throw new Error(JSON.stringify(j));
});
await t('匿名は実費の表を直接読めない', () => as('anon', false, 'select * from leo_jippi'), /permission denied/);
await t('匿名はリンク表を直接読めない', () => as('anon', false, 'select * from leo_confirm_links'), /permission denied/);
await t('匿名は回答表を直接読めない', () => as('anon', false, 'select * from leo_confirmations'), /permission denied/);
await t('匿名は回答を直接書けない', () => as('anon', false, `insert into leo_confirmations (token, confirm, parent_name) values ('${A}', '内容に相違ありません', 'x')`), /permission denied/);
await t('職員でも管理権限が無いと回答は見えない', async () => {
  const r = await as('authenticated', false, 'select * from leo_confirmations');
  if (r.rows.length) throw new Error('見えている');
});
await t('匿名はリンクを作れない', () => as('anon', false, `select leo_confirm_make_links('2026-11')`), /permission denied/);
await t('管理権限が無い認証ユーザーはリンクを作れない', () => as('authenticated', false, `select leo_confirm_make_links('2026-11')`), /のみ/);
await t('送信はサーバの金額を残す（画面の金額は受け取らない）', async () => {
  await db.exec(`update leo_jippi set lunch = 100, snack = 50 where child = '見本A'`);
  await as('anon', false, `select leo_confirm_submit($1, '内容に相違ありません', ' 見本 花子 ', '  ', '')`, [A]);
  const r = await db.query(`select confirm, parent_name, comment, jippi_found, jippi_lunch, jippi_snack from leo_confirmations where token = $1`, [A]);
  const row = r.rows[0];
  if (row.parent_name !== '見本 花子' || row.comment !== null || !row.jippi_found || row.jippi_lunch !== 100 || row.jippi_snack !== 50) throw new Error(JSON.stringify(row));
  await db.exec(`update leo_jippi set lunch = 1200, snack = 400 where child = '見本A'`);
  const now = (await get(A)).rows[0].j;
  if (now.jippi.lunch !== 1200) throw new Error('表示が古いまま');
  const snap = await db.query(`select jippi_lunch from leo_confirmations where token = $1`, [A]);
  if (snap.rows[0].jippi_lunch !== 100) throw new Error('記録が上書きされた');
});
await t('行が無い児童の送信は実費なしで残る', async () => {
  await as('anon', false, `select leo_confirm_submit($1, '相違があります', '見本 太郎', '時間が違います', '')`, [NONE]);
  const r = await db.query(`select jippi_found, jippi_lunch, jippi_snack from leo_confirmations where token = $1`, [NONE]);
  const row = r.rows[0];
  if (row.jippi_found !== false || row.jippi_lunch !== 0 || row.jippi_snack !== 0) throw new Error(JSON.stringify(row));
});
await t('0円の送信も行あり・合計0', async () => {
  await as('anon', false, `select leo_confirm_submit($1, '内容に相違ありません', '見本 ゼロ', '', '')`, [ZERO]);
  const r = await db.query(`select jippi_found, jippi_lunch, jippi_snack from leo_confirmations where token = $1`, [ZERO]);
  if (!r.rows[0].jippi_found || r.rows[0].jippi_lunch !== 0 || r.rows[0].jippi_snack !== 0) throw new Error(JSON.stringify(r.rows[0]));
});
await t('1時間に6回目は断る', async () => {
  for (let i = 0; i < 4; i++) await as('anon', false, `select leo_confirm_submit($1, '内容に相違ありません', '見本 花子', '', '')`, [A]);
  await as('anon', false, `select leo_confirm_submit($1, '内容に相違ありません', '見本 花子', '', '')`, [A]);
}, /多すぎ/);
await t('管理できる人は回答の実費が見える', async () => {
  const r = await as('authenticated', true, `select child from leo_confirm_links l join leo_confirmations c using (token) where c.jippi_lunch = 100`);
  if (r.rows.length !== 1 || r.rows[0].child !== '見本A') throw new Error(JSON.stringify(r.rows));
});
await t('別事業所の管理権限では回答は見えない', async () => {
  await db.exec(`create or replace function public.can_manage_for(p_office text) returns boolean language sql stable as $$ select public.can_manage() and p_office = '茶夢' $$`);
  const r = await as('authenticated', true, 'select count(*)::int n from leo_confirmations');
  if (r.rows[0].n !== 0) throw new Error('見えている ' + r.rows[0].n);
  await db.exec(`create or replace function public.can_manage_for(p_office text) returns boolean language sql stable as $$ select public.can_manage() and p_office = 'レオ' $$`);
});
await t('リンク作成は児童を足し、同じ児童は増やさない', async () => {
  await db.exec(`insert into leo_jisseki (day, child, status) values ('2026-11-09', '見本C', '利用')`);
  const n = await as('authenticated', true, `select leo_confirm_make_links('2026-11') n`);
  if (n.rows[0].n !== 1) throw new Error('n=' + n.rows[0].n);
  const again = await as('authenticated', true, `select leo_confirm_make_links('2026-11') n`);
  if (again.rows[0].n !== 0) throw new Error('again=' + again.rows[0].n);
});
const html = fs.readFileSync(root + 'kakunin.html', 'utf8');
const leo = fs.readFileSync(root + 'leo.js', 'utf8');
const idx = fs.readFileSync(root + 'index.html', 'utf8');
await t('見本に実費が出て、送信は1回', () => {
  if (!html.includes('lunch: 1200') || !html.includes('snack: 400') || !html.includes('この月の実費負担はありません')) throw new Error('demo');
  if (!html.includes('下の送信で、上のご利用実績と実費負担の両方を確認したことになります。')) throw new Error('copy');
  if (!html.includes('利用料（利用者負担額）・お昼代・おやつ代を足した金額') || !html.includes('id="jippi-burden"')) throw new Error('burden');
  if ((html.match(/onclick="send\(\)"/g) || []).length !== 1) throw new Error('buttons');
  if (!html.includes('value="内容に相違ありません"') || !html.includes('value="相違があります"')) throw new Error('values');
});
await t('職員一覧は確認した実費を読む。請求画面の関数は残る', () => {
  if (!leo.includes('jippi_found,jippi_lunch,jippi_snack')) throw new Error('select');
  if (!leo.includes('確認した実費') || !leo.includes('リンクに出る実費')) throw new Error('labels');
  if (!leo.includes("LEO_VIEWS.jippi") && !fs.readFileSync(root + 'leo_jippi.js', 'utf8').includes('LEO_VIEWS.jippi')) throw new Error('jippi view');
  if (!fs.readFileSync(root + 'leo_jippi.js', 'utf8').includes('この月のリンクを作成／更新')) throw new Error('checkout');
  if (!idx.includes('leo.js?v=20261103days')) throw new Error('cache');
});
await t('取得SQLは児童と月で1行だけ結合する', () => {
  const fn = SQL.slice(SQL.indexOf('function public.leo_confirm_get'), SQL.indexOf('function public.leo_confirm_submit'));
  if (!fn.includes('j.ym = l.month and j.child = l.child')) throw new Error('join');
  if (/guardian|note|burden|利用者負担/.test(fn)) throw new Error('extra column');
  const sub = SQL.slice(SQL.indexOf('function public.leo_confirm_submit'), SQL.indexOf('revoke all on function public.leo_confirm_submit'));
  if (sub.includes('p_lunch') || sub.includes('p_snack') || !sub.includes('jippi_lunch')) throw new Error('submit params');
});
console.log(bad ? 'failed ' + bad : 'kakunin sql ok');
process.exit(bad ? 1 : 0);
