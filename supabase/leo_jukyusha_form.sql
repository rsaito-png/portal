-- レオ 受給者証の入力フォーム（写真・OCRなし）＋職員の確認・反映
-- 流れ：職員が児童ごとの専用リンクを作る → 保護者がスマホで、広げた受給者証を見ながら項目を入力して送る（ログインなし・リンクのトークンだけ）
--      → 職員が「受給者証の入力」画面で、保護者の入力と今の利用者情報を並べて確認・直す → 「確認して反映」を押したときだけ leo_children / leo_child_info に書く
-- 保護者の画面：jukyusha.html ／ 職員の画面：#leo/jukyusha（leo_jukyusha.js）／ 項目の定義・検証：jukyusha_lib.js
-- 前提：leo_billing.sql（leo_children・can_manage）と leo_userinfo.sql（leo_child_info）が実行済みであること。
-- 既存のデータは変更しない。leo_child_info には列を2つ足すだけ（soudan_office, soudan_person）。何度実行しても同じ。写真は受け取らない・保管しない（Storage は使わない）。

-- 1. 児童ごとの専用リンク（leo_confirm_links と同じ作り。トークンは推測できない48桁の16進）
create table if not exists public.leo_jf_links (
  token text primary key check (token ~ '^[0-9a-f]{48}$'),
  child text not null unique,                         -- leo_children / 日誌と同じ児童名の表記
  created_at timestamptz not null default now(), created_by uuid default auth.uid(),
  expires_at timestamptz not null default now() + interval '30 days',
  revoked boolean not null default false);
-- 2回め以降：リンクを作るとき「前回の内容を入れておく」を選べる（後から足した列。何度実行しても同じ）
alter table public.leo_jf_links add column if not exists prefill boolean not null default false;
-- 相談支援事業所・担当の相談支援専門員：利用者情報（leo_child_info）に列を足す（既存の列・データは変えない。何度実行しても同じ）
--   書く・読む権限は leo_child_info のいまの設定（読む：レオ職員・事務／書く：can_manage）のまま。利用者情報の画面で見て・直せる。
alter table public.leo_child_info add column if not exists soudan_office text check (char_length(soudan_office) <= 100);
alter table public.leo_child_info add column if not exists soudan_person text check (char_length(soudan_person) <= 60);
-- 2. 保護者の入力（1回の送信＝1行）。反映の前の値（before）も残す
create table if not exists public.leo_jf_subs (
  id bigint generated always as identity primary key,
  token text not null references public.leo_jf_links(token) on delete cascade,
  child text not null,
  vals jsonb not null,                                -- 保護者が入れた値（日付は西暦ISO）
  consent_at timestamptz not null,                    -- 利用目的に同意した時刻
  status text not null default 'pending' check (status in ('pending', 'applied', 'rejected', 'superseded')),
  applied jsonb,                                      -- 職員が確認して反映した値
  before jsonb,                                       -- 反映の直前の値（元に戻せるように）
  note text check (char_length(note) <= 500),
  reviewed_by uuid, reviewed_at timestamptz,
  created_at timestamptz not null default now());
create index if not exists leo_jf_subs_status on public.leo_jf_subs (status, created_at desc);
alter table public.leo_jf_links enable row level security;
alter table public.leo_jf_subs enable row level security;
-- 読めるのは事務・管理者・児発管（can_manage）だけ。書き込みは下の関数（RPC）だけ（直接の insert/update/delete は誰にも許可しない）
drop policy if exists ljf_links_sel on public.leo_jf_links;
create policy ljf_links_sel on public.leo_jf_links for select to authenticated using (public.can_manage());
drop policy if exists ljf_subs_sel on public.leo_jf_subs;
create policy ljf_subs_sel on public.leo_jf_subs for select to authenticated using (public.can_manage());

-- Supabase は public の新しい表に anon / authenticated の権限を自動で付けるので、いったん外し、職員が「読む」権限だけを付ける（RLS と二重で守る）
revoke all on public.leo_jf_links, public.leo_jf_subs from anon, authenticated;
grant select on public.leo_jf_links, public.leo_jf_subs to authenticated;

-- 3. 職員：児童の専用リンクを作る（あれば同じものを返し、期限を30日先に延ばす）
--    p_prefill = true：保護者のページを「前回の内容」を入れた状態で開く（4. 参照）。リンクを作り直すたびに、この選択も更新される。
drop function if exists public.leo_jf_make_link(text);      -- 古い版（引数が児童名だけ）。同じ名前が2つ残らないように
create or replace function public.leo_jf_make_link(p_child text, p_prefill boolean default false) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare t text; c text := btrim(coalesce(p_child, ''));
begin
  if not public.can_manage() then raise exception '事務・管理者・児発管のみ'; end if;
  if c = '' or char_length(c) > 100 then raise exception '児童名が正しくありません'; end if;
  insert into leo_jf_links (token, child, prefill) values (encode(gen_random_bytes(24), 'hex'), c, coalesce(p_prefill, false))
    on conflict (child) do update set expires_at = now() + interval '30 days', revoked = false, prefill = coalesce(p_prefill, false)
    returning token into t;
  return t;
end $$;
revoke all on function public.leo_jf_make_link from public;
grant execute on function public.leo_jf_make_link to authenticated;

-- 4. 保護者：リンクから、その児童の名前と「送信ずみか」を返す。
--    prefill つきのリンクのときだけ、その児童1人分の「前回の内容」（prefill）も返す（期限切れ・取り消しのリンクには返さない）：
--      ① 最後に職員が反映した（applied）入力の値（受給者証の項目だけ。相談支援・支給量等の文字・その他も含む）
--      ② その上に、いまの利用者情報の値（受給者証番号・市町村番号・サービス種類・支給量・保護者名・相談支援事業所名・担当者名・負担上限月額・給付決定期間の終わり・無償化が「はい」のとき）
--    ほかの児童の情報・住所・電話・送迎・備考などは返さない（備考の列は読みもしない）。リンク（トークン）を持っている人には、この内容が見える。
create or replace function public.leo_jf_get(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare l leo_jf_links; sv jsonb; src timestamptz; pf jsonb := '{}'::jsonb; c leo_children; i leo_child_info; k text; r jsonb;
  keys text[] := array['jukyusha_no','city_name','city_no','guardian_name','child_name','child_birth','issue_date','kind','contract_days','period_from','period_to','cap_monthly','cap_other','cap_mgmt','mushouka','amount_text','other','soudan_office','soudan_person'];
begin
  if length(coalesce(p_token, '')) <> 48 then return null; end if;
  select * into l from leo_jf_links where token = p_token;
  if not found then return null; end if;
  r := jsonb_build_object('child', l.child, 'expired', (l.revoked or l.expires_at <= now()),
    'last', (select jsonb_build_object('at', s.created_at, 'status', s.status) from leo_jf_subs s where s.token = l.token order by s.id desc limit 1));
  if l.prefill and not (l.revoked or l.expires_at <= now()) then
    select s.vals, s.created_at into sv, src from leo_jf_subs s where s.token = l.token and s.status = 'applied' order by s.id desc limit 1;
    if sv is not null then
      for k in select jsonb_object_keys(sv) loop
        if k = any (keys) and jsonb_typeof(sv -> k) = 'string' then pf := pf || jsonb_build_object(k, sv ->> k); end if;
      end loop;
    end if;
    select * into c from leo_children where name = l.child;
    select * into i from leo_child_info where name = l.child;
    if c.name is not null then
      if nullif(c.jukyusha_no, '') is not null then pf := pf || jsonb_build_object('jukyusha_no', c.jukyusha_no); end if;
      if nullif(c.city_no, '') is not null then pf := pf || jsonb_build_object('city_no', c.city_no); end if;
      if c.kind in ('児発', '放デイ') then pf := pf || jsonb_build_object('kind', c.kind); end if;
      if c.contract_days between 1 and 31 then pf := pf || jsonb_build_object('contract_days', c.contract_days::text); end if;
      if c.contract_end is not null then pf := pf || jsonb_build_object('period_to', to_char(c.contract_end, 'YYYY-MM-DD')); end if;
      if c.mushouka is true then pf := pf || jsonb_build_object('mushouka', 'yes'); end if;
      -- 負担上限月額：保護者が前に「その他の金額」を入れていたときは、職員の列（4,600などの3つだけ）で上書きしない
      if c.cap_monthly in (0, 4600, 37200) and (sv is null or sv ? 'cap_monthly' or not (sv ? 'cap_other')) then
        pf := (pf - 'cap_other' - 'cap_monthly') || jsonb_build_object('cap_monthly', c.cap_monthly::text); end if;
    end if;
    if nullif(i.guardian_name, '') is not null then pf := pf || jsonb_build_object('guardian_name', i.guardian_name); end if;
    if nullif(i.soudan_office, '') is not null then pf := pf || jsonb_build_object('soudan_office', i.soudan_office); end if;
    if nullif(i.soudan_person, '') is not null then pf := pf || jsonb_build_object('soudan_person', i.soudan_person); end if;
    if pf <> '{}'::jsonb then r := r || jsonb_build_object('prefill', pf, 'prefill_at', src); end if;
  end if;
  return r;
end $$;
revoke all on function public.leo_jf_get from public;
grant execute on function public.leo_jf_get to anon, authenticated;

-- 5. 保護者：入力を送信。同意があり、項目と形式が正しいときだけ受け付ける（1時間に5回まで）。
--    決まった項目以外は受け付けない。新しい送信が来たら、確認待ちの古い送信は superseded（置き換え済み）にする。
create or replace function public.leo_jf_submit(p_token text, p_vals jsonb, p_consent boolean) returns text
language plpgsql security definer set search_path = public as $$
declare l leo_jf_links; v jsonb := '{}'::jsonb; k text; x text;
  keys text[] := array['jukyusha_no','city_name','city_no','guardian_name','child_name','child_birth','issue_date','kind','contract_days','period_from','period_to','cap_monthly','cap_other','cap_mgmt','mushouka','amount_text','other','soudan_office','soudan_person'];
  dates text[] := array['child_birth','issue_date','period_from','period_to'];
begin
  select * into l from leo_jf_links where token = p_token and length(p_token) = 48;
  if not found or l.revoked or l.expires_at <= now() then raise exception 'リンクが正しくないか、期限が切れています'; end if;
  if p_consent is not true then raise exception '個人情報の取り扱いへの同意が必要です'; end if;
  if p_vals is null or jsonb_typeof(p_vals) <> 'object' or length(p_vals::text) > 4000 then raise exception '入力が正しくありません'; end if;
  for k in select jsonb_object_keys(p_vals) loop
    if not (k = any (keys)) then raise exception '受け付けられない項目です：%', k; end if;
    if jsonb_typeof(p_vals -> k) not in ('string', 'number') then raise exception '入力が正しくありません：%', k; end if;
    x := btrim(p_vals ->> k);
    if x <> '' then v := v || jsonb_build_object(k, x); end if;
  end loop;
  if coalesce(v ->> 'jukyusha_no', '') !~ '^\d{10}$' then raise exception '受給者証番号は10けたの数字です'; end if;
  if v ? 'city_no' and (v ->> 'city_no') !~ '^\d{6}$' then raise exception '市町村番号は6けたの数字です'; end if;
  if coalesce(v ->> 'guardian_name', '') = '' or coalesce(v ->> 'child_name', '') = '' then raise exception '保護者と児童のお名前を入れてください'; end if;
  if coalesce(v ->> 'kind', '') not in ('児発', '放デイ') then raise exception 'サービスの種類は 児発 か 放デイ です'; end if;
  if coalesce(v ->> 'contract_days', '') !~ '^\d{1,2}$' or (v ->> 'contract_days')::int not between 1 and 31 then raise exception '支給量は1〜31の日数です'; end if;
  foreach k in array dates loop
    if v ? k then
      if (v ->> k) !~ '^\d{4}-\d{2}-\d{2}$' then raise exception '日付が正しくありません：%', k; end if;
      perform (v ->> k)::date;
    end if;
  end loop;
  if not (v ? 'period_from' and v ? 'period_to') or (v ->> 'period_from') > (v ->> 'period_to') then raise exception '給付決定期間（はじめ・終わり）が正しくありません'; end if;
  if v ? 'cap_monthly' then
    if (v ->> 'cap_monthly') not in ('0', '4600', '37200') then raise exception '負担上限月額は 0・4600・37200 のどれかです（ほかの金額は「その他」に）'; end if;
  elsif coalesce(v ->> 'cap_other', '') !~ '^\d{1,7}$' then raise exception '負担上限月額を選ぶか、その他の金額を入れてください'; end if;
  if v ? 'cap_mgmt' and (v ->> 'cap_mgmt') not in ('該当', '非該当', '分からない') then raise exception '上限額管理が正しくありません'; end if;
  if v ? 'mushouka' and (v ->> 'mushouka') not in ('yes', 'no', 'unknown') then raise exception '無償化が正しくありません'; end if;
  if exists (select 1 from jsonb_each_text(v) e where char_length(e.value) > case when e.key = 'other' then 500 else 200 end) then raise exception '入力が長すぎます'; end if;
  if (select count(*) from leo_jf_subs where token = p_token and created_at > now() - interval '1 hour') >= 5
    then raise exception '送信が多すぎます。時間をおいてください'; end if;
  update leo_jf_subs set status = 'superseded' where token = p_token and status = 'pending';
  insert into leo_jf_subs (token, child, vals, consent_at) values (p_token, l.child, v, now());
  return 'ok';
end $$;
revoke all on function public.leo_jf_submit from public;
grant execute on function public.leo_jf_submit to anon, authenticated;

-- 6. 職員：「確認して反映」。職員が確認・修正した値（p_vals に入っているキーだけ）を、既存の利用者情報に書く。
--    書けるキー：jukyusha_no, city_no, kind, cap_monthly, contract_days, contract_end, mushouka → leo_children ／ guardian_name, soudan_office, soudan_person → leo_child_info
--    note_add（任意）：leo_child_info.note（備考）の末尾に追記する。いまの備考は消さない（合計1000文字まで）。
--    ない児童は新しく作る。反映前の値は before に残す。1回の送信につき1回だけ（pending のときだけ）。
create or replace function public.leo_jf_apply(p_id bigint, p_vals jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s leo_jf_subs; v jsonb := '{}'::jsonb; k text; b jsonb;
  allowed text[] := array['jukyusha_no','city_no','kind','cap_monthly','contract_days','contract_end','guardian_name','soudan_office','soudan_person','mushouka','note_add'];
begin
  if not public.can_manage() then raise exception '事務・管理者・児発管のみ'; end if;
  select * into s from leo_jf_subs where id = p_id for update;
  if not found then raise exception '見つかりません'; end if;
  if s.status <> 'pending' then raise exception 'この送信はすでに処理済みか、新しい入力に置き換わっています'; end if;
  for k in select jsonb_object_keys(coalesce(p_vals, '{}'::jsonb)) loop
    if not (k = any (allowed)) then raise exception '反映できない項目です：%', k; end if;
    if nullif(btrim(p_vals ->> k), '') is not null then v := v || jsonb_build_object(k, btrim(p_vals ->> k)); end if;
  end loop;
  if v = '{}'::jsonb then raise exception '反映する項目がありません'; end if;
  if v ? 'kind' and (v ->> 'kind') not in ('児発', '放デイ') then raise exception '種別は 児発 か 放デイ です'; end if;
  if char_length(coalesce(v ->> 'soudan_office', '')) > 100 or char_length(coalesce(v ->> 'soudan_person', '')) > 60 then raise exception '相談支援の入力が長すぎます'; end if;
  if v ? 'mushouka' and (v ->> 'mushouka') not in ('true', 'false') then raise exception '無償化は true か false です'; end if;
  if v ? 'note_add' and char_length(concat_ws(E'\n', nullif((select i.note from leo_child_info i where i.name = s.child), ''), v ->> 'note_add')) > 1000 then raise exception '備考が1000文字を超えます（追記する文を短くしてください）'; end if;
  if v ? 'cap_monthly' and (v ->> 'cap_monthly')::int not in (0, 4600, 37200) then raise exception '負担上限月額は 0・4600・37200 のいずれかです'; end if;
  -- 反映の前の値
  select jsonb_build_object('children', (select to_jsonb(c) from leo_children c where c.name = s.child),
                            'info', (select jsonb_build_object('guardian_name', i.guardian_name, 'note', i.note, 'soudan_office', i.soudan_office, 'soudan_person', i.soudan_person) from leo_child_info i where i.name = s.child)) into b;
  if v ?| array['jukyusha_no','city_no','kind','cap_monthly','contract_days','contract_end','mushouka'] then
    insert into leo_children (name, jukyusha_no, city_no, kind, cap_monthly, contract_days, contract_end, mushouka)
    values (s.child, v ->> 'jukyusha_no', v ->> 'city_no', coalesce(v ->> 'kind', '放デイ'), coalesce((v ->> 'cap_monthly')::int, 4600), (v ->> 'contract_days')::int, (v ->> 'contract_end')::date, coalesce((v ->> 'mushouka')::boolean, false))
    on conflict (name) do update set
      jukyusha_no = case when v ? 'jukyusha_no' then excluded.jukyusha_no else leo_children.jukyusha_no end,
      city_no = case when v ? 'city_no' then excluded.city_no else leo_children.city_no end,
      kind = case when v ? 'kind' then excluded.kind else leo_children.kind end,
      cap_monthly = case when v ? 'cap_monthly' then excluded.cap_monthly else leo_children.cap_monthly end,
      contract_days = case when v ? 'contract_days' then excluded.contract_days else leo_children.contract_days end,
      contract_end = case when v ? 'contract_end' then excluded.contract_end else leo_children.contract_end end,
      mushouka = case when v ? 'mushouka' then excluded.mushouka else leo_children.mushouka end,
      updated_by = auth.uid(), updated_at = now();
  end if;
  if v ?| array['guardian_name','note_add','soudan_office','soudan_person'] then
    insert into leo_child_info (name, guardian_name, note, soudan_office, soudan_person) values (s.child, v ->> 'guardian_name', v ->> 'note_add', v ->> 'soudan_office', v ->> 'soudan_person')
    on conflict (name) do update set
      guardian_name = case when v ? 'guardian_name' then excluded.guardian_name else leo_child_info.guardian_name end,
      soudan_office = case when v ? 'soudan_office' then excluded.soudan_office else leo_child_info.soudan_office end,
      soudan_person = case when v ? 'soudan_person' then excluded.soudan_person else leo_child_info.soudan_person end,
      note = case when v ? 'note_add' then concat_ws(E'\n', nullif(leo_child_info.note, ''), v ->> 'note_add') else leo_child_info.note end,
      updated_by = auth.uid(), updated_at = now();
  end if;
  update leo_jf_subs set status = 'applied', applied = v, before = b, reviewed_by = auth.uid(), reviewed_at = now() where id = p_id;
  return v;
end $$;
revoke all on function public.leo_jf_apply from public;
grant execute on function public.leo_jf_apply to authenticated;

-- 7. 職員：反映しない（別の児童・入力まちがいなど）
create or replace function public.leo_jf_reject(p_id bigint, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage() then raise exception '事務・管理者・児発管のみ'; end if;
  update leo_jf_subs set status = 'rejected', note = left(nullif(btrim(coalesce(p_note, '')), ''), 500), reviewed_by = auth.uid(), reviewed_at = now() where id = p_id and status = 'pending';
end $$;
revoke all on function public.leo_jf_reject from public;
grant execute on function public.leo_jf_reject to authenticated;
