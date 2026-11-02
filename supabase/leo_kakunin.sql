-- レオ 保護者の実績確認（Googleフォームの置き換え。11/1切り替え）
-- 保護者はログインなし。児童×月ごとの推測できないトークン付きリンクで、その児童のその月だけを見て確認する
-- 項目はフォームを引き継ぐ：児童名・対象月・確認（内容に相違ありません／相違があります）・保護者氏名・相違点・ご意見 ＋ 署名（任意）
-- 同じ画面で実費負担（leo_jippi のお昼代・おやつ代）も見せる。一度の送信が実績と実費の両方の確認になる
-- 利用者負担額（国保連）・保護者名・メモ・他の児童の行は返さない。支払いリンクが無くても確認はできる
-- 再実行できる。前提：public.can_manage() / public.can_manage_for(text) / public.leo_jippi がある
-- 閲覧ポリシーは can_manage_for('レオ')。leo_duty.sql も同じ式（全事業所の can_manage() には戻さない）
create table if not exists public.leo_confirm_links (
  token text primary key, child text not null, month text not null check (month ~ '^\d{4}-\d{2}$'),
  created_at timestamptz not null default now(), created_by uuid default auth.uid(),
  unique (child, month));
create table if not exists public.leo_confirmations (
  id bigint generated always as identity primary key,
  token text not null references public.leo_confirm_links(token) on delete cascade,
  confirm text not null check (confirm in ('内容に相違ありません','相違があります')),
  parent_name text not null check (length(parent_name) between 1 and 60),
  comment text check (length(comment) <= 2000),
  signature text check (signature is null or (signature like 'data:image/png;base64,%' and length(signature) < 200000)),
  submitted_at timestamptz not null default now());
-- 送信時点の実費。保護者の入力ではなく、サーバが leo_jippi から写す。null は実費を載せる前の回答
alter table public.leo_confirmations add column if not exists jippi_found boolean;
alter table public.leo_confirmations add column if not exists jippi_lunch integer;
alter table public.leo_confirmations add column if not exists jippi_snack integer;
alter table public.leo_confirmations drop constraint if exists leo_confirmations_jippi_lunch_check;
alter table public.leo_confirmations add constraint leo_confirmations_jippi_lunch_check check (jippi_lunch is null or jippi_lunch >= 0);
alter table public.leo_confirmations drop constraint if exists leo_confirmations_jippi_snack_check;
alter table public.leo_confirmations add constraint leo_confirmations_jippi_snack_check check (jippi_snack is null or jippi_snack >= 0);
comment on column public.leo_confirmations.jippi_found is '送信時点で leo_jippi にその児童・その月の行があったか。null は実費統合前の回答。';
comment on column public.leo_confirmations.jippi_lunch is '送信時点のお昼代（円）。行が無いときは 0。保護者が送った値ではない。';
comment on column public.leo_confirmations.jippi_snack is '送信時点のおやつ代（円）。行が無いときは 0。保護者が送った値ではない。';
alter table public.leo_confirm_links enable row level security;
alter table public.leo_confirmations enable row level security;
-- レオを管理できる人だけが一覧を見られる（保護者は直接読めない。anon にポリシーは無い）
drop policy if exists lcl_clerk on public.leo_confirm_links;
create policy lcl_clerk on public.leo_confirm_links for select to authenticated using (public.can_manage_for('レオ'));
drop policy if exists lc_clerk on public.leo_confirmations;
create policy lc_clerk on public.leo_confirmations for select to authenticated using (public.can_manage_for('レオ'));

-- 事務・管理者・児発管：その月の児童ぶんのリンクを作る（既にあれば作らない）。実績・日誌に出てくる児童が対象
create or replace function public.leo_confirm_make_links(p_month text)
returns int language plpgsql security definer set search_path = public, extensions as $$
declare n int;
begin
  if not public.can_manage() then raise exception '事務・管理者・児発管のみ'; end if;
  if p_month !~ '^\d{4}-\d{2}$' then raise exception '月は 2026-11 の形'; end if;
  insert into leo_confirm_links (token, child, month)
    select encode(gen_random_bytes(24), 'hex'), c, p_month from (
      select distinct child c from leo_jisseki where to_char(day, 'YYYY-MM') = p_month and coalesce(child,'') <> ''
      union select distinct child from leo_nikki where to_char(day, 'YYYY-MM') = p_month and kind = '利用' and coalesce(child,'') <> '') x
    on conflict (child, month) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.leo_confirm_make_links(text) from public, anon;
grant execute on function public.leo_confirm_make_links(text) to authenticated;

-- 保護者：トークンの児童・月だけ。実績と、その行の実費（お昼・おやつ・合計・あれば支払いリンク）
-- 金額の入力欄は無い。他の児童の leo_jippi は結合しない
create or replace function public.leo_confirm_get(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  l public.leo_confirm_links%rowtype;
  lunch int := 0;
  snack int := 0;
  pay text;
  found_j boolean := false;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{48}$' then return null; end if;
  select * into l from public.leo_confirm_links where token = p_token;
  if not found then return null; end if;
  select j.lunch, j.snack, j.pay_link into lunch, snack, pay
    from public.leo_jippi j where j.ym = l.month and j.child = l.child;
  found_j := found;
  if not found_j then
    lunch := 0; snack := 0; pay := null;
  else
    lunch := coalesce(lunch, 0); snack := coalesce(snack, 0);
    if lunch + snack <= 0 or pay is null or pay !~ '^https://' then pay := null; end if;
  end if;
  return jsonb_build_object(
    'child', l.child, 'month', l.month,
    'rows', coalesce((select jsonb_agg(jsonb_build_object('day', j.day, 'status', j.status, 'start', j.start_time, 'end', j.end_time) order by j.day)
                      from public.leo_jisseki j where j.child = l.child and to_char(j.day, 'YYYY-MM') = l.month), '[]'::jsonb),
    'jippi', jsonb_build_object('found', found_j, 'lunch', lunch, 'snack', snack, 'total', lunch + snack, 'pay_link', pay),
    'last', (select jsonb_build_object('confirm', c.confirm, 'parent', c.parent_name, 'at', c.submitted_at)
             from public.leo_confirmations c where c.token = l.token order by c.id desc limit 1));
end $$;
revoke all on function public.leo_confirm_get(text) from public;
grant execute on function public.leo_confirm_get(text) to anon, authenticated;

-- 金額はクライアントから受け取らない。送った瞬間の leo_jippi を回答に残す
create or replace function public.leo_confirm_submit(p_token text, p_confirm text, p_parent text, p_comment text, p_signature text)
returns text language plpgsql security definer set search_path = public as $$
declare
  l public.leo_confirm_links%rowtype;
  lunch int := 0;
  snack int := 0;
  found_j boolean := false;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{48}$' then raise exception 'リンクが正しくありません'; end if;
  select * into l from public.leo_confirm_links where token = p_token;
  if not found then raise exception 'リンクが正しくありません'; end if;
  if (select count(*) from public.leo_confirmations where token = p_token and submitted_at > now() - interval '1 hour') >= 5
    then raise exception '送信が多すぎます。時間をおいてください'; end if;
  select j.lunch, j.snack into lunch, snack from public.leo_jippi j where j.ym = l.month and j.child = l.child;
  found_j := found;
  if not found_j then lunch := 0; snack := 0; else lunch := coalesce(lunch, 0); snack := coalesce(snack, 0); end if;
  insert into public.leo_confirmations (token, confirm, parent_name, comment, signature, jippi_found, jippi_lunch, jippi_snack)
    values (p_token, p_confirm, trim(p_parent), nullif(trim(coalesce(p_comment, '')), ''), nullif(p_signature, ''), found_j, lunch, snack);
  return 'ok';
end $$;
revoke all on function public.leo_confirm_submit(text, text, text, text, text) from public;
grant execute on function public.leo_confirm_submit(text, text, text, text, text) to anon, authenticated;

-- 保護者は表を直接読まない（RPC だけ）。anon の権限が残っていると、ポリシーの付け忘れで他の児童が見える
revoke all on table public.leo_jippi from anon;
revoke all on table public.leo_confirm_links from anon;
revoke all on table public.leo_confirmations from anon;

-- 届いた通知も、実績と実費の両方を確認した回答だと分かるようにする
create or replace function public.trg_notify_kakunin() returns trigger language plpgsql security definer set search_path = public as $$
declare c text; m text;
begin
  select child, month::text into c, m from leo_confirm_links where token = new.token;
  perform notify_enqueue('mgr', '実績確認', '🖊️ ' || coalesce(c, '') || 'さんの保護者から、実績と実費の確認（' || coalesce(m, '') || '）の回答が届きました。',
    'https://rsaito-png.github.io/portal/#leo/kakunin');
  return new;
end $$;
