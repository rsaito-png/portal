// supabase/leo_assess_form.sql の動作確認（PGlite。本物の Supabase にはつながない。架空のデータだけ）
// 実行：cd tools && npm i @electric-sql/pglite && node assess_form_sql_test.mjs
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import fs from 'fs';
const db = new PGlite({ extensions: { pgcrypto } });
const root = new URL('..', import.meta.url).pathname;
const SQL = fs.readFileSync(root + 'supabase/leo_assess_form.sql', 'utf8');
let bad = 0;
const t = async (name, fn, expectErr) => {
  try { const r = await fn(); if (expectErr) { bad++; console.log('NG (エラーのはずが通った)', name); } else console.log('ok', name); return r; }
  catch (e) { if (expectErr && (!(expectErr instanceof RegExp) || expectErr.test(e.message))) console.log('ok', name, '→', e.message.slice(0, 80)); else { bad++; console.log('NG', name, e.message); } }
};
await db.exec(`
create extension if not exists pgcrypto schema public;
create schema if not exists extensions; create or replace function extensions.gen_random_bytes(int) returns bytea language sql as 'select public.gen_random_bytes($1)';
do $$ begin create role anon nologin; create role authenticated nologin; exception when duplicate_object then null; end $$;
create schema auth; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create function public.can_manage() returns boolean language sql stable as $$ select coalesce(current_setting('test.mgr', true), '') = '1' $$;
grant usage on schema public, auth, extensions to anon, authenticated; grant execute on all functions in schema public, extensions, auth to anon, authenticated;
create table public.leo_child_assess (
  name text primary key,
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 60000),
  source text check (char_length(source) <= 100),
  answered_at date,
  updated_by uuid default auth.uid(), updated_at timestamptz not null default now());
grant select, insert, update on public.leo_child_assess to authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
`);
await db.exec(SQL);
await t('sql を2回流しても壊れない', () => db.exec(SQL));
const as = async (role, mgr, sql, params) => {
  await db.exec(`set test.mgr='${mgr ? 1 : 0}'; set test.uid='11111111-1111-1111-1111-111111111111'; set role ${role}`);
  try { return await db.query(sql, params); } finally { await db.exec('reset role'); }
};
const q = (sql, p) => db.query(sql, p);
const GOOD = { name_kana: '見本 太郎（みほん たろう）', birth: '2019-04-02', school: '見本保育園 年長', allergy: '有り', allergy_detail: '卵', convulsion: 'いいえ', temp: '36.5', wish_life: '自分でやってほしい' };
const sub = (tok, over, consent = true, drop = []) => { const v = { ...GOOD, ...over }; drop.forEach(k => delete v[k]); return as('anon', false, `select leo_af_submit($1, $2::jsonb, $3)`, [tok, JSON.stringify(v), consent]); };

await t('職員でない人はリンクを作れない', () => as('authenticated', false, `select leo_af_make_link('新規 花子')`), /のみ/);
await t('匿名はリンクを作れない', () => as('anon', false, `select leo_af_make_link('新規 花子')`), /permission denied/);
const tok = (await as('authenticated', true, `select leo_af_make_link('新規 花子', false) t`)).rows[0].t;
await t('トークンは48桁の16進', () => { if (!/^[0-9a-f]{48}$/.test(tok)) throw new Error(tok); });
await t('同じ児童は同じリンク', async () => { const r = await as('authenticated', true, `select leo_af_make_link('新規 花子', true) t`); if (r.rows[0].t !== tok) throw new Error('別'); });
await t('未登録の名前でもリンクを作れる', async () => { const r = await as('authenticated', true, `select leo_af_make_link('まだ居ない 子', false) t`); if (!/^[0-9a-f]{48}$/.test(r.rows[0].t)) throw new Error(r.rows[0].t); });
await t('匿名：get は児童名と期限と送信ずみだけ', async () => { const r = await as('anon', false, `select leo_af_get($1) j`, [tok]); const j = r.rows[0].j; if (j.child !== '新規 花子' || j.expired || j.last !== null || j.prefill) throw new Error(JSON.stringify(j)); });
await t('匿名：違うトークンは null', async () => { const r = await as('anon', false, `select leo_af_get($1) j`, ['0'.repeat(48)]); if (r.rows[0].j !== null) throw new Error('null でない'); });
await t('匿名：表は直接読めない', () => as('anon', false, `select * from leo_af_subs`), /permission denied/);
await t('匿名：表に直接書けない', () => as('anon', false, `insert into leo_af_subs (token, child, vals, consent_at) values ($1,'x','{}',now())`, [tok]), /permission denied/);
await t('職員でも表に直接書けない', () => as('authenticated', true, `insert into leo_af_subs (token, child, vals, consent_at) values ($1,'x','{}',now())`, [tok]), /permission denied|row-level security/);
await t('匿名：反映は呼べない', () => as('anon', false, `select leo_af_apply(1, '{}')`), /permission denied/);

await t('同意なしは不可', () => sub(tok, {}, false), /同意/);
await t('児童名なしは不可', () => sub(tok, {}, true, ['name_kana']), /児童名/);
await t('決まった項目以外は不可', () => sub(tok, { home_address: 'x' }), /受け付けられない/);
await t('アレルギーの表記がちがうと不可', () => sub(tok, { allergy: 'あり' }), /有り/);
await t('健康状態がちがうと不可', () => sub(tok, { h_fall: 'yes' }), /はい/);
await t('生年月日の形式がちがうと不可', () => sub(tok, { birth: '平成31年4月2日' }), /生年月日/);
await t('2月30日は不可', () => sub(tok, { birth: '2019-02-30' }), /生年月日/);
await t('写真の http リンクは不可', () => sub(tok, { doc_insurance: 'http://example.com/a' }), /https/);
await t('写真なし（空）は受け付ける', () => sub(tok, {}, true, []));
await t('送信してもアセスメント本体は空のまま', async () => { const r = await q(`select count(*)::int n from leo_child_assess`); if (r.rows[0].n) throw new Error('書かれている'); });

await t('https の写真リンクは受け付ける', () => sub(tok, { doc_jukyusha: 'https://example.com/j' }));
await t('前の確認待ちは置き換えになる', async () => { const r = await q(`select status, count(*)::int n from leo_af_subs group by status`); const m = Object.fromEntries(r.rows.map(x => [x.status, x.n])); if (m.pending !== 1 || m.superseded !== 1) throw new Error(JSON.stringify(m)); });
await t('職員でない認証ユーザーは入力が見えない', async () => { const r = await as('authenticated', false, `select * from leo_af_subs`); if (r.rows.length) throw new Error('見える'); });
const pend = (await as('authenticated', true, `select id, vals from leo_af_subs where status='pending'`)).rows[0];
await t('空の写真欄は保存されていない', () => { if ('doc_insurance' in pend.vals) throw new Error(JSON.stringify(pend.vals)); });
await t('https の受給者証リンクは残る', () => { if (pend.vals.doc_jukyusha !== 'https://example.com/j') throw new Error(JSON.stringify(pend.vals)); });

await q(`insert into leo_child_assess (name, data, source) values ('新規 花子', '{"school":"旧園","allergy":"無し","note_old":"残す"}'::jsonb, 'Googleフォーム 2026-05-07')`);
await t('職員でない人は反映できない', () => as('authenticated', false, `select leo_af_apply($1, $2::jsonb)`, [pend.id, JSON.stringify({ allergy: '有り' })]), /のみ/);
const applied = (await as('authenticated', true, `select leo_af_apply($1, $2::jsonb) j`, [pend.id, JSON.stringify({ allergy: '有り', temp: '36.5', doc_insurance: '原本は持参' })])).rows[0].j;
await t('反映したキーだけが戻り値', () => { if (applied.allergy !== '有り' || applied.temp !== '36.5' || applied.doc_insurance !== '原本は持参' || applied.school) throw new Error(JSON.stringify(applied)); });
await t('既存のキーは消えず、送ったキーだけ上書き', async () => {
  const r = await q(`select data, source from leo_child_assess where name='新規 花子'`);
  const d = r.rows[0].data;
  if (d.school !== '旧園' || d.allergy !== '有り' || d.temp !== '36.5' || d.note_old !== '残す' || d.doc_insurance !== '原本は持参') throw new Error(JSON.stringify(d));
  if (!String(r.rows[0].source).includes('Googleフォーム') || !String(r.rows[0].source).includes('保護者入力')) throw new Error(r.rows[0].source);
});
await t('反映前の値は記録に残る', async () => { const r = await q(`select before, status from leo_af_subs where id=$1`, [pend.id]); if (r.rows[0].status !== 'applied' || r.rows[0].before.data.allergy !== '無し') throw new Error(JSON.stringify(r.rows[0])); });
await t('同じ送信は二度反映できない', () => as('authenticated', true, `select leo_af_apply($1, '{"temp":"36.0"}'::jsonb)`, [pend.id]), /処理済み|置き換/);

const tok2 = (await as('authenticated', true, `select leo_af_make_link('見本 次郎', false) t`)).rows[0].t;
await sub(tok2, { name_kana: '見本 次郎' });
const id2 = (await q(`select id from leo_af_subs where token=$1 and status='pending'`, [tok2])).rows[0].id;
await t('反映しない', () => as('authenticated', true, `select leo_af_reject($1, '別の児童')`, [id2]));
await t('反映しないときは本体を作らない', async () => { const r = await q(`select count(*)::int n from leo_child_assess where name='見本 次郎'`); if (r.rows[0].n) throw new Error('作られた'); });

await t('prefill は、その子の項目だけ返す', async () => {
  await as('authenticated', true, `select leo_af_make_link('新規 花子', true)`);
  const r = await as('anon', false, `select leo_af_get($1) j`, [tok]);
  const p = r.rows[0].j.prefill;
  if (!p || p.allergy !== '有り' || p.school !== '旧園' || p.note_old) throw new Error(JSON.stringify(r.rows[0].j));
});
await t('prefill をはずすと中身を返さない', async () => {
  await as('authenticated', true, `select leo_af_make_link('新規 花子', false)`);
  const r = await as('anon', false, `select leo_af_get($1) j`, [tok]);
  if (r.rows[0].j.prefill) throw new Error(JSON.stringify(r.rows[0].j));
});

console.log(bad ? bad + ' failed' : 'all ok');
process.exit(bad ? 1 : 0);
