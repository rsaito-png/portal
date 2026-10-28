// supabase/leo_jukyusha_form.sql の動作確認（PGlite＝Postgresで、Supabaseの部品を簡単な代用品で置いて実行する）
// 実行：cd tools && npm i @electric-sql/pglite && node jukyusha_form_sql_test.mjs   ※架空のデータだけ。本物のSupabaseにはつながない
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import fs from 'fs';
const db = new PGlite({ extensions: { pgcrypto } });
const root = new URL('..', import.meta.url).pathname, SQL = fs.readFileSync(root + 'supabase/leo_jukyusha_form.sql', 'utf8');
let bad = 0;
const t = async (name, fn, expectErr) => { try { const r = await fn(); if (expectErr) { bad++; console.log('NG (エラーのはずが通った)', name, JSON.stringify(r?.rows ?? r)); } else console.log('ok', name); return r; } catch (e) { if (expectErr && (!(expectErr instanceof RegExp) || expectErr.test(e.message))) console.log('ok', name, '→', e.message.slice(0, 70)); else { bad++; console.log('NG', name, e.message); } } };
await db.exec(`
create extension if not exists pgcrypto schema public;
create schema if not exists extensions; create or replace function extensions.gen_random_bytes(int) returns bytea language sql as 'select public.gen_random_bytes($1)';
do $$ begin create role anon nologin; create role authenticated nologin; exception when duplicate_object then null; end $$;
create schema auth; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create function public.can_manage() returns boolean language sql stable as $$ select coalesce(current_setting('test.mgr', true), '') = '1' $$;
grant usage on schema public, auth, extensions to anon, authenticated; grant execute on all functions in schema public, extensions, auth to anon, authenticated;
`);
// 既存の表（leo_billing.sql / leo_userinfo.sql の定義を、このテスト用に最小限で再現）
await db.exec(`
create table public.leo_children (name text primary key, kana text, jukyusha_no text check (jukyusha_no ~ '^\\d{10}$'), city_no text check (city_no ~ '^\\d{6}$'),
  kind text not null default '放デイ' check (kind in ('児発','放デイ')), cap_monthly int not null default 4600 check (cap_monthly in (0,4600,37200)),
  mushouka boolean not null default false, contract_days int check (contract_days between 1 and 31), contract_start date, contract_end date,
  updated_by uuid default auth.uid(), updated_at timestamptz not null default now());
create table public.leo_child_info (name text primary key, guardian_name text, home_address text, use_transport boolean not null default true, updated_by uuid default auth.uid(), updated_at timestamptz not null default now());
grant select, insert, update on public.leo_children, public.leo_child_info to authenticated;
-- 本物の Supabase と同じく、public に作る表には anon / authenticated の権限が自動で付く（SQL がそれを外していることを確かめる）
alter default privileges in schema public grant all on tables to anon, authenticated;
`);
await db.exec(SQL);
await t('sql を2回流しても壊れない（再実行できる）', () => db.exec(SQL));
await t('Storage を使わない（storage の文字がない）', () => { if (/storage\./i.test(SQL.replace(/--.*$/gm, ''))) throw new Error('storage'); });
const as = async (role, mgr, sql, params) => { await db.exec(`set test.mgr='${mgr ? 1 : 0}'; set test.uid='11111111-1111-1111-1111-111111111111'; set role ${role}`); try { return await db.query(sql, params); } finally { await db.exec('reset role'); } };
const q = (sql, p) => db.query(sql, p);
const GOOD = { jukyusha_no: '0123456789', city_name: '見本市', guardian_name: '見本 花子', child_name: '見本 太郎', child_birth: '2019-04-02', issue_date: '2026-03-20', kind: '放デイ', contract_days: '20', period_from: '2026-04-01', period_to: '2027-03-31', cap_monthly: '4600', cap_mgmt: '非該当', mushouka: 'unknown' };
const sub = (tok, over, consent = true, drop = []) => { const v = { ...GOOD, ...over }; drop.forEach(k => delete v[k]); return as('anon', false, `select leo_jf_submit($1, $2::jsonb, $3)`, [tok, JSON.stringify(v), consent]); };
// リンク
await t('職員でない人はリンクを作れない', () => as('authenticated', false, `select leo_jf_make_link('見本 太郎')`), /のみ/);
await t('匿名はリンクを作れない', () => as('anon', false, `select leo_jf_make_link('見本 太郎')`), /permission denied/);
const tok = (await as('authenticated', true, `select leo_jf_make_link('見本 太郎') t`)).rows[0].t;
await t('トークンは48桁の16進', () => { if (!/^[0-9a-f]{48}$/.test(tok)) throw new Error(tok); });
await t('同じ児童は同じリンク', async () => { const r = await as('authenticated', true, `select leo_jf_make_link('見本 太郎') t`); if (r.rows[0].t !== tok) throw new Error('別のトークン'); });
await t('匿名：leo_jf_get は児童名・期限・送信ずみだけを返す', async () => { const r = await as('anon', false, `select leo_jf_get($1) j`, [tok]); const j = r.rows[0].j; if (j.child !== '見本 太郎' || j.expired || j.last !== null || Object.keys(j).sort().join() !== 'child,expired,last') throw new Error(JSON.stringify(j)); });
await t('匿名：違うトークンは null', async () => { const r = await as('anon', false, `select leo_jf_get($1) j`, ['0'.repeat(48)]); if (r.rows[0].j !== null) throw new Error('null でない'); });
await t('匿名：表は直接読めない（リンク）', () => as('anon', false, `select * from leo_jf_links`), /permission denied/);
await t('匿名：表は直接読めない（入力）', () => as('anon', false, `select * from leo_jf_subs`), /permission denied/);
await t('匿名：表に直接書けない', () => as('anon', false, `insert into leo_jf_subs (token, child, vals, consent_at) values ($1, 'x', '{}', now())`, [tok]), /permission denied/);
await t('職員でも表に直接書けない（RPCだけ）', () => as('authenticated', true, `insert into leo_jf_subs (token, child, vals, consent_at) values ($1, 'x', '{}', now())`, [tok]), /permission denied|row-level security/);
await t('匿名：leo_jf_apply は呼べない', () => as('anon', false, `select leo_jf_apply(1, '{}')`), /permission denied/);
// 送信：検証
await t('同意なしは不可', () => sub(tok, {}, false), /同意/);
await t('違うトークンは不可', () => sub('1'.repeat(48), {}), /リンク/);
await t('受給者証番号が10けたでないと不可', () => sub(tok, { jukyusha_no: '12345' }), /10けた/);
await t('受給者証番号なしは不可', () => sub(tok, {}, true, ['jukyusha_no']), /10けた/);
await t('決まった項目以外は不可', () => sub(tok, { name: 'x' }), /受け付けられない項目/);
await t('配列・オブジェクトの値は不可', () => sub(tok, { memo: ['a'] }), /正しくありません/);
await t('市町村番号は6けた', () => sub(tok, { city_no: '1234' }), /6けた/);
await t('名前なしは不可', () => sub(tok, { guardian_name: ' ' }), /お名前/);
await t('種類が児発・放デイ以外は不可', () => sub(tok, { kind: '就労' }), /児発/);
await t('支給量 0 日は不可', () => sub(tok, { contract_days: '0' }), /1〜31/);
await t('支給量 40 日は不可', () => sub(tok, { contract_days: '40' }), /1〜31/);
await t('日付の形式がちがうと不可', () => sub(tok, { period_from: '令和8年4月1日' }), /日付/);
await t('2月30日は不可', () => sub(tok, { issue_date: '2026-02-30' }), /out of range|日付/);
await t('期間の終わりがはじめより前は不可', () => sub(tok, { period_from: '2027-04-01' }), /給付決定期間/);
await t('期間なしは不可', () => sub(tok, {}, true, ['period_from']), /給付決定期間/);
await t('負担上限 1234 円は不可', () => sub(tok, { cap_monthly: '1234' }), /負担上限月額/);
await t('負担上限なし（その他もなし）は不可', () => sub(tok, {}, true, ['cap_monthly']), /負担上限月額/);
await t('その他 9,300 円は受け付ける（cap_other）', () => sub(tok, { cap_other: '9300' }, true, ['cap_monthly']));
await t('上限額管理がちがう値は不可', () => sub(tok, { cap_mgmt: '？' }), /上限額管理/);
await t('無償化がちがう値は不可', () => sub(tok, { mushouka: 'maybe' }), /無償化/);
await t('200文字を超える値は不可', () => sub(tok, { memo: 'あ'.repeat(201) }), /長すぎ/);
await t('検証に落ちた送信は何も残らない（その他9,300の1件だけ）', async () => { const r = await q(`select count(*)::int n from leo_jf_subs`); if (r.rows[0].n !== 1) throw new Error('n=' + r.rows[0].n); });
// 送信：成功
await t('正しい入力は受け付ける', () => sub(tok, {}));
await t('前の確認待ち（その他9,300）は「置き換え」になる', async () => { const r = await q(`select status, count(*)::int n from leo_jf_subs group by status order by status`); const m = Object.fromEntries(r.rows.map(x => [x.status, x.n])); if (m.superseded !== 1 || m.pending !== 1) throw new Error(JSON.stringify(m)); });
await t('送信しても利用者情報は書かれていない', async () => { const r = await q(`select (select count(*) from leo_children)::int a, (select count(*) from leo_child_info)::int b`); if (r.rows[0].a || r.rows[0].b) throw new Error('書かれている'); });
await t('匿名：get に最後の送信が出る', async () => { const r = await as('anon', false, `select leo_jf_get($1) j`, [tok]); if (r.rows[0].j.last.status !== 'pending') throw new Error(JSON.stringify(r.rows[0].j)); });
await t('職員でない認証ユーザーは入力が見えない', async () => { const r = await as('authenticated', false, `select * from leo_jf_subs`); if (r.rows.length) throw new Error('見えてしまう'); });
await t('職員は入力が見える（値の空欄は入らない）', async () => { const r = await as('authenticated', true, `select * from leo_jf_subs where status='pending'`); if (r.rows.length !== 1 || r.rows[0].vals.jukyusha_no !== '0123456789' || 'memo' in r.rows[0].vals || !r.rows[0].consent_at) throw new Error(JSON.stringify(r.rows)); });
const pend = async () => (await q(`update leo_jf_subs set created_at = created_at - interval '2 hours'`), await q(`select id from leo_jf_subs where status='pending' order by id desc limit 1`)).rows[0].id;
const id1 = await pend();
// 反映
await t('職員でない人は反映できない', () => as('authenticated', false, `select leo_jf_apply($1, '{"cap_monthly":"4600"}')`, [id1]), /のみ/);
await t('反映できない項目は拒否', () => as('authenticated', true, `select leo_jf_apply($1, '{"name":"x"}')`, [id1]), /反映できない項目/);
await t('period_from は反映できない', () => as('authenticated', true, `select leo_jf_apply($1, '{"period_from":"2026-04-01"}')`, [id1]), /反映できない項目/);
await t('9,300円は拒否', () => as('authenticated', true, `select leo_jf_apply($1, '{"cap_monthly":"9300"}')`, [id1]), /負担上限月額/);
await t('空のとき拒否', () => as('authenticated', true, `select leo_jf_apply($1, '{}')`, [id1]), /反映する項目がありません/);
await t('受給者証番号が10桁でないと拒否（既存のcheck）', () => as('authenticated', true, `select leo_jf_apply($1, '{"jukyusha_no":"12345"}')`, [id1]), /check/);
await t('拒否されたあとも何も書かれず、確認待ちのまま', async () => { const r = await q(`select (select count(*) from leo_children)::int a, (select status from leo_jf_subs where id=$1) s`, [id1]); if (r.rows[0].a || r.rows[0].s !== 'pending') throw new Error(JSON.stringify(r.rows[0])); });
await t('反映：新しい児童が作られる', () => as('authenticated', true, `select leo_jf_apply($1, '{"jukyusha_no":"0123456789","city_no":"","kind":"放デイ","cap_monthly":4600,"contract_days":"20","contract_end":"2027-03-31","guardian_name":"見本 花子"}')`, [id1]));
await t('反映の結果', async () => { const c = (await q(`select * from leo_children`)).rows[0], i = (await q(`select * from leo_child_info`)).rows[0];
  if (c.name !== '見本 太郎' || c.jukyusha_no !== '0123456789' || c.city_no !== null || c.contract_days !== 20 || c.cap_monthly !== 4600 || String(c.contract_end.toISOString?.().slice(0, 10) ?? c.contract_end) !== '2027-03-31' || c.mushouka !== false || i.guardian_name !== '見本 花子' || i.home_address !== null) throw new Error(JSON.stringify([c, i])); });
await t('2回は反映できない', () => as('authenticated', true, `select leo_jf_apply($1, '{"cap_monthly":"0"}')`, [id1]), /処理済み/);
await t('applied になり、applied と before（前は空）が残る', async () => { const r = (await q(`select status, applied, before, reviewed_at from leo_jf_subs where id=$1`, [id1])).rows[0]; if (r.status !== 'applied' || r.applied.cap_monthly !== '4600' || r.before.children !== null || !r.reviewed_at) throw new Error(JSON.stringify(r)); });
await t('置き換え済みの送信は反映できない', async () => { const s = (await q(`select id from leo_jf_subs where status='superseded'`)).rows[0].id; await as('authenticated', true, `select leo_jf_apply($1, '{"cap_monthly":"0"}')`, [s]); }, /処理済み|置き換わって/);
// 2回目：一部だけ反映しても、ほかの値は消えず、前の値が残る
await q(`update leo_children set mushouka = true, contract_start = '2026-04-01', kana = 'ミホン'`); await q(`update leo_child_info set home_address = '見本町1-1'`);
await sub(tok, { cap_monthly: '0', contract_days: '23' });
const id2 = await pend();
await t('2回目：負担上限だけ反映 → ほかの項目は残る', async () => { await as('authenticated', true, `select leo_jf_apply($1, '{"cap_monthly":"0"}')`, [id2]); const c = (await q(`select * from leo_children`)).rows[0]; if (c.cap_monthly !== 0 || c.jukyusha_no !== '0123456789' || c.contract_days !== 20 || c.mushouka !== true || c.kana !== 'ミホン' || String(c.contract_start).length < 5) throw new Error(JSON.stringify(c)); });
await t('2回目：反映前の値（before）に4,600円が残る', async () => { const r = (await q(`select before from leo_jf_subs where id=$1`, [id2])).rows[0].before; if (r.children.cap_monthly !== 4600 || r.children.jukyusha_no !== '0123456789' || r.info.guardian_name !== '見本 花子') throw new Error(JSON.stringify(r)); });
await sub(tok, {});
const id3 = await pend();
await t('無償化は true/false 以外を拒否', () => as('authenticated', true, `select leo_jf_apply($1, '{"mushouka":"たぶん"}')`, [id3]), /無償化/);
await t('保護者名だけ反映 → 利用者情報の住所は残る', async () => { await as('authenticated', true, `select leo_jf_apply($1, '{"guardian_name":"見本 花"}')`, [id3]); const i = (await q(`select * from leo_child_info`)).rows[0]; if (i.guardian_name !== '見本 花' || i.home_address !== '見本町1-1') throw new Error(JSON.stringify(i)); });
await sub(tok, {});
const id4 = await pend();
await t('無償化(true)だけ反映', async () => { await as('authenticated', true, `select leo_jf_apply($1, '{"mushouka":"false"}')`, [id4]); const c = (await q(`select * from leo_children`)).rows[0]; if (c.mushouka !== false || c.cap_monthly !== 0 || c.jukyusha_no !== '0123456789') throw new Error(JSON.stringify(c)); });
// 反映しない
await sub(tok, {});
const id5 = await pend();
await t('職員でない人は「反映しない」にできない', () => as('authenticated', false, `select leo_jf_reject($1, 'x')`, [id5]), /のみ/);
await t('反映しない：状態とメモ', async () => { await as('authenticated', true, `select leo_jf_reject($1, '別の児童')`, [id5]); const r = (await q(`select status, note from leo_jf_subs where id=$1`, [id5])).rows[0]; if (r.status !== 'rejected' || r.note !== '別の児童') throw new Error(JSON.stringify(r)); });
await t('反映しなかったあと、反映もできない', () => as('authenticated', true, `select leo_jf_apply($1, '{"cap_monthly":"0"}')`, [id5]), /処理済み/);
// 期限・回数
await t('期限切れリンクの get は expired=true', async () => { await q(`update leo_jf_links set expires_at = now() - interval '1 day'`); const r = await as('anon', false, `select leo_jf_get($1) j`, [tok]); if (!r.rows[0].j.expired) throw new Error('expired でない'); });
await t('期限切れリンクでは送れない', () => sub(tok, {}), /期限/);
await t('リンクを作りなおすと期限が延びる（同じトークン）', async () => { const r = await as('authenticated', true, `select leo_jf_make_link('見本 太郎') t`); if (r.rows[0].t !== tok) throw new Error('別'); const g = await as('anon', false, `select leo_jf_get($1) j`, [tok]); if (g.rows[0].j.expired) throw new Error('まだ期限切れ'); });
await t('1時間に5回まで', async () => { await q(`update leo_jf_subs set created_at = now() - interval '2 hour'`); for (let i = 0; i < 6; i++) await sub(tok, {}); }, /多すぎます/);
await t('5回までは受け付けられていた', async () => { const r = await q(`select count(*)::int n from leo_jf_subs where created_at > now() - interval '1 hour'`); if (r.rows[0].n !== 5) throw new Error('n=' + r.rows[0].n); });
console.log(bad ? `\n${bad} 件 NG` : '\nすべて ok'); process.exit(bad ? 1 : 0);
