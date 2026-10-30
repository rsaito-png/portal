-- レオ 初回アセスメント（保護者の入力 → 職員の確認 → leo_child_assess）
-- 流れ：職員が児童ごとの専用リンクを作る（まだ利用者情報にいない児童の名前でもよい）
--      → 保護者が assess.html で、Google フォーム「アセスメントシート（児童）」と同じ項目を入力して送る（ログインなし・トークンだけ）
--      → 職員が「アセスメント」画面で確認・修正し、「確認して反映」を押したときだけ leo_child_assess.data に足す
-- 保護者の画面：assess.html ／ 職員の画面：#leo/assess（leo_assess.js）／ 項目：assess_lib.js
-- 前提：supabase/leo_assess.sql（leo_child_assess・can_manage）が実行済みであること。
-- 既存の表は変えない（列の追加・削除もしない）。新しい表 leo_af_links / leo_af_subs と関数だけ。何度実行しても同じ。
-- 保険証・受給者証の写真は受け取らない・保管しない（ファイル置き場は作らない）。リンク欄は任意。

-- 1. 児童ごとの専用リンク（トークンは推測できない48桁の16進）。児童名は一意（同じ子は同じリンク。期限だけ延びる）
create table if not exists public.leo_af_links (
  token text primary key check (token ~ '^[0-9a-f]{48}$'),
  child text not null unique check (char_length(btrim(child)) between 1 and 100),
  created_at timestamptz not null default now(), created_by uuid default auth.uid(),
  expires_at timestamptz not null default now() + interval '30 days',
  revoked boolean not null default false,
  prefill boolean not null default false);
-- 2. 保護者の入力（1回の送信＝1行）。反映前のアセスメント（before）も残す
create table if not exists public.leo_af_subs (
  id bigint generated always as identity primary key,
  token text not null references public.leo_af_links(token) on delete cascade,
  child text not null,
  vals jsonb not null,
  consent_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'applied', 'rejected', 'superseded')),
  applied jsonb,
  before jsonb,
  note text check (char_length(note) <= 500),
  reviewed_by uuid, reviewed_at timestamptz,
  created_at timestamptz not null default now());
create index if not exists leo_af_subs_status on public.leo_af_subs (status, created_at desc);
alter table public.leo_af_links enable row level security;
alter table public.leo_af_subs enable row level security;
drop policy if exists laf_links_sel on public.leo_af_links;
create policy laf_links_sel on public.leo_af_links for select to authenticated using (public.can_manage());
drop policy if exists laf_subs_sel on public.leo_af_subs;
create policy laf_subs_sel on public.leo_af_subs for select to authenticated using (public.can_manage());

revoke all on public.leo_af_links, public.leo_af_subs from anon, authenticated;
grant select on public.leo_af_links, public.leo_af_subs to authenticated;

-- 項目キー（assess_lib.js の KEYS と同じ順）。中身は項目名だけで、児童の情報は返さない
create or replace function public.leo_af_keys() returns text[]
language sql immutable as $$
  select array['name_kana','birth','school','guardian','address','phone','guardian_phone','emergency','family','rel','diagnosis','techo','agencies','visit_status','meds_status','meds_regular','hp_pediatric','hp_ortho','hp_ent','hp_derm','hp_other','allergy','allergy_detail','utensil','likes','dislikes','amount','urine','stool','wipe','handwash','gargle','dress','undress','button','play_home','play_out','interest','personality','panic','other_msg','temp','convulsion','convulsion_detail','h_bleed','h_fall','h_skin','h_earnose','h_hernia','h_joint','h_cold','h_tonsil','h_asthma','h_allergic','h_vaccine','h_rash','h_drugrash','h_vomit','h_diarrhea','h_constipation','under_doctor','health_other','wish_life','wish_habit','wish_motor','wish_cog','wish_lang','wish_human','other_service','photo_consent','photo_detail','doc_insurance','doc_jukyusha']::text[]
$$;
revoke all on function public.leo_af_keys() from public;
grant execute on function public.leo_af_keys() to anon, authenticated;

-- 入力を整える。空は捨てる。決まった項目以外は受け付けない。
-- p_require_name：保護者の送信は児童名が必須。職員の反映は、チェックした項目だけなので必須にしない。
-- p_strict_url：保護者は写真欄が空か https のリンクだけ。職員の反映は「原本は持参」のような短いメモも残せる。
create or replace function public.leo_af_clean(p_vals jsonb, p_require_name boolean, p_strict_url boolean) returns jsonb
language plpgsql immutable set search_path = public as $$
declare v jsonb := '{}'::jsonb; k text; x text; y int; m int; d int;
  areas text[] := array['emergency','family','rel','diagnosis','techo','agencies','visit_status','meds_status','meds_regular','allergy_detail','likes','dislikes','play_home','play_out','interest','personality','panic','other_msg','convulsion_detail','health_other','wish_life','wish_habit','wish_motor','wish_cog','wish_lang','wish_human','other_service','photo_detail'];
  yn text[] := array['convulsion','h_bleed','h_fall','h_skin','h_earnose','h_hernia','h_joint','h_cold','h_tonsil','h_asthma','h_allergic','h_vaccine','h_rash','h_drugrash','h_vomit','h_diarrhea','h_constipation','under_doctor'];
begin
  if p_vals is null or jsonb_typeof(p_vals) <> 'object' or length(p_vals::text) > 50000 then raise exception '入力が正しくありません'; end if;
  for k in select jsonb_object_keys(p_vals) loop
    if not (k = any (public.leo_af_keys())) then raise exception '受け付けられない項目です：%', k; end if;
    if jsonb_typeof(p_vals -> k) <> 'string' then raise exception '入力が正しくありません：%', k; end if;
    x := btrim(p_vals ->> k);
    if x <> '' then v := v || jsonb_build_object(k, x); end if;
  end loop;
  if coalesce(p_require_name, false) and coalesce(v ->> 'name_kana', '') = '' then raise exception '児童名（ふりがな）を入れてください'; end if;
  if exists (select 1 from jsonb_each_text(v) e where char_length(e.value) > case
      when e.key = 'name_kana' then 120
      when e.key in ('doc_insurance', 'doc_jukyusha') then 500
      when e.key = any (areas) then 2000
      else 300 end) then raise exception '入力が長すぎます'; end if;
  if v ? 'birth' then
    if (v ->> 'birth') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception '生年月日が正しくありません'; end if;
    y := split_part(v ->> 'birth', '-', 1)::int; m := split_part(v ->> 'birth', '-', 2)::int; d := split_part(v ->> 'birth', '-', 3)::int;
    if y < 1990 or y > 2100 then raise exception '生年月日が正しくありません'; end if;
    begin
      perform (v ->> 'birth')::date;
    exception when others then
      raise exception '生年月日が正しくありません';
    end;
  end if;
  if v ? 'allergy' and (v ->> 'allergy') not in ('有り', '無し') then raise exception 'アレルギーの有無は 有り か 無し です'; end if;
  if exists (select 1 from unnest(yn) yk where v ? yk and (v ->> yk) not in ('はい', 'いいえ')) then raise exception '健康状態は はい か いいえ で答えてください'; end if;
  if coalesce(p_strict_url, false) and v ? 'doc_insurance' and (v ->> 'doc_insurance') !~ '^https://' then raise exception '保険証のリンクは https:// で始まるものにしてください（空欄でも送れます）'; end if;
  if coalesce(p_strict_url, false) and v ? 'doc_jukyusha' and (v ->> 'doc_jukyusha') !~ '^https://' then raise exception '受給者証のリンクは https:// で始まるものにしてください（空欄でも送れます）'; end if;
  return v;
end $$;
revoke all on function public.leo_af_clean(jsonb, boolean, boolean) from public;
grant execute on function public.leo_af_clean(jsonb, boolean, boolean) to anon, authenticated;

-- 3. 職員：児童の専用リンクを作る（あれば同じものを返し、期限を30日先に延ばす）。利用者情報に未登録の名前でも作れる
create or replace function public.leo_af_make_link(p_child text, p_prefill boolean default false) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare t text; c text := btrim(coalesce(p_child, ''));
begin
  if not public.can_manage() then raise exception '事務・管理者・児発管のみ'; end if;
  if c = '' or char_length(c) > 100 then raise exception '児童名が正しくありません'; end if;
  insert into leo_af_links (token, child, prefill) values (encode(gen_random_bytes(24), 'hex'), c, coalesce(p_prefill, false))
    on conflict (child) do update set expires_at = now() + interval '30 days', revoked = false, prefill = coalesce(p_prefill, false)
    returning token into t;
  return t;
end $$;
revoke all on function public.leo_af_make_link(text, boolean) from public;
grant execute on function public.leo_af_make_link(text, boolean) to authenticated;

-- 4. 保護者：リンクから、その児童の名前と「送信ずみか」を返す。
--    prefill のリンクで、期限切れ・取り消しでないときだけ、その児童1人分のアセスメント（決まった項目の文字だけ）を返す。
--    ほかの児童の情報は返さない。リンクを持っている人には、この内容が見える。
create or replace function public.leo_af_get(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare l leo_af_links; d jsonb; pf jsonb := '{}'::jsonb; k text; r jsonb;
begin
  if length(coalesce(p_token, '')) <> 48 then return null; end if;
  select * into l from leo_af_links where token = p_token;
  if not found then return null; end if;
  r := jsonb_build_object('child', l.child, 'expired', (l.revoked or l.expires_at <= now()),
    'last', (select jsonb_build_object('at', s.created_at, 'status', s.status) from leo_af_subs s where s.token = l.token order by s.id desc limit 1));
  if l.prefill and not (l.revoked or l.expires_at <= now()) then
    select a.data into d from leo_child_assess a where a.name = l.child;
    if d is null or d = '{}'::jsonb then
      select s.applied into d from leo_af_subs s where s.token = l.token and s.status = 'applied' order by s.id desc limit 1;
    end if;
    if d is not null and jsonb_typeof(d) = 'object' then
      for k in select jsonb_object_keys(d) loop
        if k = any (public.leo_af_keys()) and jsonb_typeof(d -> k) = 'string' and btrim(d ->> k) <> '' then
          pf := pf || jsonb_build_object(k, btrim(d ->> k));
        end if;
      end loop;
    end if;
    if pf <> '{}'::jsonb then r := r || jsonb_build_object('prefill', pf); end if;
  end if;
  return r;
end $$;
revoke all on function public.leo_af_get(text) from public;
grant execute on function public.leo_af_get(text) to anon, authenticated;

-- 5. 保護者：入力を送信。同意があり、項目と形式が正しいときだけ受け付ける（1時間に5回まで）。
--    新しい送信が来たら、確認待ちの古い送信は superseded（置き換え済み）にする。利用者情報・アセスメント本体はまだ変えない。
create or replace function public.leo_af_submit(p_token text, p_vals jsonb, p_consent boolean) returns text
language plpgsql security definer set search_path = public as $$
declare l leo_af_links; v jsonb;
begin
  select * into l from leo_af_links where token = p_token and length(p_token) = 48;
  if not found or l.revoked or l.expires_at <= now() then raise exception 'リンクが正しくないか、期限が切れています'; end if;
  if p_consent is not true then raise exception '個人情報の取り扱いへの同意が必要です'; end if;
  v := public.leo_af_clean(p_vals, true, true);
  if (select count(*) from leo_af_subs where token = p_token and created_at > now() - interval '1 hour') >= 5
    then raise exception '送信が多すぎます。時間をおいてください'; end if;
  update leo_af_subs set status = 'superseded' where token = p_token and status = 'pending';
  insert into leo_af_subs (token, child, vals, consent_at) values (p_token, l.child, v, now());
  return 'ok';
end $$;
revoke all on function public.leo_af_submit(text, jsonb, boolean) from public;
grant execute on function public.leo_af_submit(text, jsonb, boolean) to anon, authenticated;

-- 6. 職員：「確認して反映」。p_vals に入っているキーだけを、leo_child_assess.data に足す（ほかのキーは消さない）。
--    ない児童は、アセスメントの行だけ新しく作る（受給者証や連絡先の表は作らない）。1回の送信につき1回だけ（pending のときだけ）。
create or replace function public.leo_af_apply(p_id bigint, p_vals jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s leo_af_subs; v jsonb; b jsonb; merged jsonb;
begin
  if not public.can_manage() then raise exception '事務・管理者・児発管のみ'; end if;
  select * into s from leo_af_subs where id = p_id for update;
  if not found then raise exception '見つかりません'; end if;
  if s.status <> 'pending' then raise exception 'この送信はすでに処理済みか、新しい入力に置き換わっています'; end if;
  v := public.leo_af_clean(p_vals, false, false);
  if v = '{}'::jsonb then raise exception '反映する項目がありません'; end if;
  select a.data into merged from leo_child_assess a where a.name = s.child;
  merged := coalesce(merged, '{}'::jsonb) || v;
  if jsonb_typeof(merged) <> 'object' or pg_column_size(merged) >= 60000 then raise exception '入力が長すぎます'; end if;
  select to_jsonb(a) into b from leo_child_assess a where a.name = s.child;
  insert into leo_child_assess (name, data, source, answered_at, updated_by, updated_at)
  values (s.child, merged, '保護者入力（確認済）', current_date, auth.uid(), now())
  on conflict (name) do update set
    data = excluded.data,
    source = left(case
      when coalesce(leo_child_assess.source, '') = '' then '保護者入力（確認済）'
      when leo_child_assess.source like '%保護者入力%' then leo_child_assess.source
      else leo_child_assess.source || '／保護者入力' end, 100),
    answered_at = current_date,
    updated_by = auth.uid(),
    updated_at = now();
  update leo_af_subs set status = 'applied', applied = v, before = b, reviewed_by = auth.uid(), reviewed_at = now() where id = p_id;
  return v;
end $$;
revoke all on function public.leo_af_apply(bigint, jsonb) from public;
grant execute on function public.leo_af_apply(bigint, jsonb) to authenticated;

-- 7. 職員：反映しない（別の児童・入力まちがいなど）
create or replace function public.leo_af_reject(p_id bigint, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage() then raise exception '事務・管理者・児発管のみ'; end if;
  update leo_af_subs set status = 'rejected', note = left(nullif(btrim(coalesce(p_note, '')), ''), 500), reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_id and status = 'pending';
end $$;
revoke all on function public.leo_af_reject(bigint, text) from public;
grant execute on function public.leo_af_reject(bigint, text) to authenticated;
