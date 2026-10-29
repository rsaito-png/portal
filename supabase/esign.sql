-- 電子サイン（労働契約書・秘密情報の保持に関する誓約書）用。Supabase の SQL Editor に全文を貼って Run（1回）
-- 何度流しても壊れないように書いてあります（既存の表・列は変えず、足すだけ）
-- 前提（本番で確認済み）: my_role() / my_office() / notify_enqueue() がある。staff_profiles に full_name は無かった→追加する

-- ① 職員の氏名（契約書に出す名前）。まず登録時の名前(auth の name)から入れ、無い人は nikki_name で補う
alter table public.staff_profiles add column if not exists full_name text;
update public.staff_profiles p set full_name = coalesce(nullif(u.raw_user_meta_data->>'name',''), nullif(p.nikki_name,''))
  from auth.users u where u.id = p.user_id and p.full_name is null;
-- 事務は全員のプロフィールを読める（一覧用）。役割はログイン情報(JWT)から見る＝再帰しない
drop policy if exists sp_clerk on public.staff_profiles;
create policy sp_clerk on public.staff_profiles for select to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = '事務');

-- ② 通知に「本人宛」を足す（audience='self' と宛先ユーザー）
alter table public.notify_queue add column if not exists target_user uuid;
alter table public.notify_queue drop constraint if exists notify_queue_audience_check;
alter table public.notify_queue add constraint notify_queue_audience_check check (audience in ('all','mgr','self'));
create or replace function public.notify_enqueue_self(p_user uuid, p_kind text, p_text text, p_link text, p_office text default 'レオ')
returns void language sql security definer set search_path = public as $$
  insert into notify_queue (office, audience, kind, text, link, target_user) values (p_office, 'self', p_kind, p_text, p_link, p_user);
$$;
revoke all on function public.notify_enqueue_self(uuid, text, text, text, text) from public, anon, authenticated;

-- ③ 文面テンプレート（版管理）
create table if not exists public.doc_templates (
  id bigint generated always as identity primary key,
  doc_type text not null check (doc_type in ('labor_contract','confidentiality')),
  variant text not null default 'standard',
  version int not null,
  title text not null,
  body text not null,                      -- {{項目}} 入りの文面
  effective_from date not null default current_date,
  retired_at date,
  created_at timestamptz not null default now(),
  unique (doc_type, variant, version)
);

-- ④ 文書（職員ごと・契約ごと）。契約項目は terms(jsonb)
create table if not exists public.staff_docs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id),
  doc_type text not null check (doc_type in ('labor_contract','confidentiality')),
  method text not null default 'electronic' check (method in ('electronic','paper')),  -- paper＝紙で締結済みの登録（署名なし）
  template_id bigint references public.doc_templates(id),
  terms jsonb not null default '{}',
  period_start date, period_end date,
  prev_doc_id bigint references public.staff_docs(id),
  status text not null default 'draft' check (status in ('draft','issued','signed','paper','superseded','void')),
  rendered_text text,                      -- 発行時に確定した全文。署名の対象
  paper_date date,                         -- 紙で締結した日
  note text,                               -- 備考（紙の保管場所など。個人情報は書かない）
  issued_by uuid, issued_at timestamptz,
  created_at timestamptz not null default now(),
  constraint terms_no_sensitive check (not (terms ?| array['my_number','mynumber','bank','bank_account','birth','address','マイナンバー','口座','生年月日','住所']))
);
create index if not exists staff_docs_user on public.staff_docs (user_id, doc_type, status);
create index if not exists staff_docs_end on public.staff_docs (period_end) where status in ('signed','paper');

-- ⑤ 署名記録（追記専用）
create table if not exists public.doc_signatures (
  id bigint generated always as identity primary key,
  doc_id bigint not null unique references public.staff_docs(id),
  user_id uuid not null,
  typed_name text not null,
  text_sha256 text not null,
  template_version int,
  signed_at timestamptz not null default now(),
  signature_png text                     -- 手書き署名のPNG（data URL）。記名だけの古い行は null
);
-- 既に表がある環境へ足すだけ。古い署名行は画像なしのまま残す
alter table public.doc_signatures add column if not exists signature_png text;
alter table public.doc_signatures drop constraint if exists doc_signatures_signature_png_chk;
alter table public.doc_signatures add constraint doc_signatures_signature_png_chk
  check (signature_png is null or (signature_png like 'data:image/png;base64,%' and char_length(signature_png) <= 300000));
-- ⑥ 経過の記録
create table if not exists public.doc_events (
  id bigint generated always as identity primary key,
  doc_id bigint references public.staff_docs(id), actor uuid,
  event text not null, at timestamptz not null default now(), note text);

alter table public.doc_templates enable row level security;
alter table public.staff_docs enable row level security;
alter table public.doc_signatures enable row level security;
alter table public.doc_events enable row level security;
revoke all on public.doc_templates, public.staff_docs, public.doc_signatures, public.doc_events from anon;

drop policy if exists tpl_read on public.doc_templates;
create policy tpl_read on public.doc_templates for select to authenticated using (true);
drop policy if exists tpl_write on public.doc_templates;
create policy tpl_write on public.doc_templates for insert to authenticated with check (public.my_role() = '事務');
drop policy if exists doc_read on public.staff_docs;
create policy doc_read on public.staff_docs for select to authenticated
  using (public.my_role() = '事務' or (user_id = auth.uid() and status in ('issued','signed','paper','superseded')));
drop policy if exists doc_ins on public.staff_docs;
create policy doc_ins on public.staff_docs for insert to authenticated with check (public.my_role() = '事務' and status = 'draft' and method = 'electronic');
drop policy if exists doc_upd on public.staff_docs;
create policy doc_upd on public.staff_docs for update to authenticated using (public.my_role() = '事務' and status = 'draft') with check (status in ('draft','void'));
drop policy if exists sig_read on public.doc_signatures;
create policy sig_read on public.doc_signatures for select to authenticated using (public.my_role() = '事務' or user_id = auth.uid());
drop policy if exists ev_read on public.doc_events;
create policy ev_read on public.doc_events for select to authenticated using (public.my_role() = '事務');
revoke insert, update, delete on public.doc_signatures, public.doc_events from authenticated;
revoke delete on public.staff_docs, public.doc_templates from authenticated;
revoke update on public.doc_templates from authenticated;

-- 署名済み・紙登録の文書は中身を変えられない／署名記録は更新・削除不可
create or replace function public.trg_docs_lock() returns trigger language plpgsql as $$
begin
  if old.status in ('signed','paper','superseded') and (new.rendered_text is distinct from old.rendered_text
     or new.terms is distinct from old.terms or new.user_id <> old.user_id or new.doc_type <> old.doc_type) then
    raise exception '署名済み・締結済みの文書は変更できません。新しい版を作ってください'; end if;
  return new; end $$;
drop trigger if exists docs_lock on public.staff_docs;
create trigger docs_lock before update on public.staff_docs for each row execute function public.trg_docs_lock();
create or replace function public.trg_sig_immutable() returns trigger language plpgsql as $$
begin raise exception '署名記録は変更できません'; end $$;
drop trigger if exists sig_immutable on public.doc_signatures;
create trigger sig_immutable before update or delete on public.doc_signatures for each row execute function public.trg_sig_immutable();

-- 発行（事務）: 項目を文面に埋めて全文を確定 → 本人に本人宛通知
create or replace function public.doc_issue(p_doc bigint) returns void language plpgsql security definer set search_path = public as $$
declare d staff_docs; t doc_templates; txt text; k text; v text; nm text; off text;
begin
  if public.my_role() is distinct from '事務' then raise exception '事務のみ発行できます'; end if;
  select * into d from staff_docs where id = p_doc and status = 'draft' and method = 'electronic';
  if not found then raise exception '下書きがありません'; end if;
  select * into t from doc_templates where id = d.template_id;
  select full_name, office into nm, off from staff_profiles where user_id = d.user_id;
  if coalesce(nm,'') = '' then raise exception '職員の氏名(full_name)が未登録です'; end if;
  txt := replace(t.body, '{{name}}', nm);
  for k, v in select key, value from jsonb_each_text(d.terms) loop txt := replace(txt, '{{' || k || '}}', v); end loop;
  if txt like '%{{%' then raise exception '未入力の項目があります: %', substring(txt from '\{\{[^}]*\}\}'); end if;
  update staff_docs set rendered_text = txt, status = 'issued', issued_by = auth.uid(), issued_at = now() where id = p_doc;
  insert into doc_events(doc_id, actor, event) values (p_doc, auth.uid(), 'issued');
  perform notify_enqueue_self(d.user_id, '署名依頼', '✍️ 確認・署名をお願いする書類があります。ポータルの「書類の確認と署名」を開いてください。',
    'https://rsaito-png.github.io/portal/#sign', coalesce(off, 'レオ'));
end $$;

-- 署名（本人）: ログイン済みなので氏名は登録の full_name を記録する。手書きPNGは必須。SHA-256はDB側で計算
drop function if exists public.doc_sign(bigint, text);
create function public.doc_sign(p_doc bigint, p_signature text) returns void language plpgsql security definer set search_path = public as $$
declare d staff_docs; t doc_templates; nm text; off text;
begin
  select * into d from staff_docs where id = p_doc and user_id = auth.uid() and status = 'issued' and method = 'electronic';
  if not found then raise exception '署名できる書類がありません'; end if;
  if p_signature is null or p_signature not like 'data:image/png;base64,%' or char_length(p_signature) > 300000 then
    raise exception '署名を書いてください'; end if;
  select full_name, office into nm, off from staff_profiles where user_id = auth.uid();
  if coalesce(nm,'') = '' then raise exception '登録されている氏名がありません。事務に連絡してください'; end if;
  select * into t from doc_templates where id = d.template_id;
  insert into doc_signatures(doc_id, user_id, typed_name, text_sha256, template_version, signature_png)
    values (p_doc, auth.uid(), nm, encode(sha256(convert_to(d.rendered_text, 'UTF8')), 'hex'), t.version, p_signature);
  update staff_docs set status = 'superseded' where id = d.prev_doc_id and status in ('signed','paper');
  update staff_docs set status = 'signed' where id = p_doc;
  insert into doc_events(doc_id, actor, event) values (p_doc, auth.uid(), 'signed');
  perform notify_enqueue('mgr', '署名完了', '✅ 書類への署名が届きました（' || nm || '）。', 'https://rsaito-png.github.io/portal/#clerk/docs', coalesce(off, 'レオ'));
end $$;

-- 紙で締結済みの登録（事務）: 署名なし。日付と備考だけ。紙で締結済みと明記して残す
create or replace function public.doc_register_paper(p_user uuid, p_type text, p_date date, p_note text default null, p_start date default null, p_end date default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare nid bigint; prev bigint;
begin
  if public.my_role() is distinct from '事務' then raise exception '事務のみ登録できます'; end if;
  if p_type not in ('labor_contract','confidentiality') then raise exception '書類の種類が不正です'; end if;
  if p_date is null then raise exception '締結日を入れてください'; end if;
  select id into prev from staff_docs where user_id = p_user and doc_type = p_type and status in ('signed','paper') order by coalesce(paper_date, issued_at::date) desc limit 1;
  insert into staff_docs(user_id, doc_type, method, status, paper_date, note, period_start, period_end, prev_doc_id, issued_by, issued_at)
    values (p_user, p_type, 'paper', 'paper', p_date, p_note, p_start, p_end, prev, auth.uid(), now()) returning id into nid;
  if prev is not null then update staff_docs set status = 'superseded' where id = prev; end if;
  insert into doc_events(doc_id, actor, event, note) values (nid, auth.uid(), 'paper_registered', p_note);
  return nid;
end $$;

-- 期間満了の通知（90日前・30日前に事務へ。同じ契約に同じ通知は1回だけ）。送信は既存の通知関数＝夜間は送らない規則のまま
create or replace function public.doc_renewal_notices() returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; ev text;
begin
  for r in select d.id, d.period_end, p.full_name, p.office from staff_docs d join staff_profiles p on p.user_id = d.user_id
           where d.doc_type = 'labor_contract' and d.status in ('signed','paper') and d.period_end is not null
             and d.period_end between current_date and current_date + 90 loop
    ev := case when r.period_end <= current_date + 30 then 'renewal30' else 'renewal90' end;
    if not exists (select 1 from doc_events where doc_id = r.id and event = ev) then
      perform notify_enqueue('mgr', '契約更新', '📅 ' || coalesce(r.full_name,'') || 'さんの雇用契約が ' || to_char(r.period_end, 'YYYY/MM/DD') || ' に期間満了です。更新の書類を作ってください。',
        'https://rsaito-png.github.io/portal/#clerk/docs', coalesce(r.office,'レオ'));
      insert into doc_events(doc_id, event) values (r.id, ev); n := n + 1;
    end if;
  end loop; return n;
end $$;
revoke all on function public.doc_issue(bigint), public.doc_sign(bigint, text), public.doc_register_paper(uuid, text, date, text, date, date), public.doc_renewal_notices() from public, anon;
grant execute on function public.doc_issue(bigint), public.doc_sign(bigint, text), public.doc_register_paper(uuid, text, date, text, date, date) to authenticated;
-- 毎日 JST 9:00（UTC 0:00）に実行する場合（pg_cron がある場合のみ。任意）:
-- select cron.schedule('doc-renewal', '0 0 * * *', $$select public.doc_renewal_notices()$$);

-- 事務用の職員別一覧（運営指導用）。security_invoker＝呼んだ人の権限で見える範囲だけ
create or replace view public.v_doc_overview with (security_invoker = true) as
select p.user_id, p.full_name, p.office,
  c.status as contract_status, c.method as contract_method, c.id as contract_doc, c.period_end as contract_end,
  coalesce(c.paper_date, cs.signed_at::date) as contract_date, cs.template_version as contract_version,
  f.status as pledge_status, f.method as pledge_method, f.id as pledge_doc,
  coalesce(f.paper_date, fs.signed_at::date) as pledge_date
from public.staff_profiles p
left join lateral (select * from public.staff_docs d where d.user_id = p.user_id and d.doc_type = 'labor_contract' and d.status in ('draft','issued','signed','paper') order by d.id desc limit 1) c on true
left join public.doc_signatures cs on cs.doc_id = c.id
left join lateral (select * from public.staff_docs d where d.user_id = p.user_id and d.doc_type = 'confidentiality' and d.status in ('draft','issued','signed','paper') order by d.id desc limit 1) f on true
left join public.doc_signatures fs on fs.doc_id = f.id;
grant select on public.v_doc_overview to authenticated;
revoke all on public.v_doc_overview from anon;

-- ⑦ テンプレート（初版）。個人情報は入れない。変数は {{...}}。住所・マイナンバー・口座の欄は設けない
insert into public.doc_templates (doc_type, variant, version, title, body) values
('labor_contract', 'standard', 1, '労働条件通知書兼雇用契約書',
$t$労働条件通知書兼雇用契約書

契約締結日：{{sign_date}}
氏名：{{name}}

次の労働条件によって雇用契約を締結します。

雇用期間：{{period}}
試用期間：{{probation}}
就業の場所：{{place}}
仕事の内容：{{job}}
就業時間：{{hours}}
所定時間外労働・休日労働の有無：{{overtime}}
休日：{{holidays}}
休暇：{{leave}}
退職に関する事項：{{retire}}
賃金：{{wage}}
割増賃金率：{{premium}}
締切日・支払日・支払方法：{{pay}}
賞与：{{bonus}}
昇給：{{raise}}
退職金：{{retirement_pay}}
社会保険・雇用保険：{{insurance}}
備考：{{remarks}}

本書面は、ポータル上で表示し、労働者が内容を確認のうえ電子署名により同意することで交付・締結します。労働者は、労働条件の明示を電子的な方法（ポータル上の表示）で受けることを希望します。署名後も、ポータルでいつでも確認・印刷できます。

使用者
所在地：{{employer_address}}
名称：{{employer_name}}
職氏名：{{employer_rep}}

労働者
氏名：{{name}}$t$),
('confidentiality', 'standard', 1, '秘密情報の保持に関する誓約書',
$t${{employer_name}}
{{employer_rep}} 殿

秘密情報の保持に関する誓約書

私は、個人情報保護法、その他の関係法令、貴法人就業規則ならびに個人情報保護規定に従い、貴法人が取扱う利用者等の個人情報につき、以下の事項を遵守し、適正に取扱い、在職中はもちろん退職後も開示するような行為は一切致しません。

この誓約に違反した場合には、貴法人就業規則に従い懲戒処分を受けることに異議はありません。また、違反したことにより貴法人が被った一切の損害を賠償する義務があることを認めます。

１ 秘密保持について
次に掲げる情報（以下「秘密情報という。」）について、貴法人の許可なく使用、貴法人あるいは貴法人外において、開示、提示もしくは漏洩しません。
① 業務上知りえた貴事業所の利用者及びその家族の情報や秘密事項
② 貴法人が秘密保持すべき対象と指定した情報
③ 貴法人の人事、経理、職員の情報等に関する情報

２ 秘密情報の報告及び帰属について
秘密情報の創出又は取得に関わった場合には、遅滞なくその内容を貴法人に報告するとともに、貴法人が業務上作成したものであることを確認し、当該情報の帰属が貴法人にあることを確認いたします。また、当該情報について私に帰属する一切の権利を貴法人に譲渡し、その権利が私に帰属する旨の主張をいたしません。

３ 退職後の秘密保持について
秘密情報については、貴法人を退職した後においても、開示、漏洩もしくは使用しないことを約束します。また、秘密情報が記載、記録されている媒体の複製物及び関係資料等がある場合には、退職時にこれを貴法人に全て返還もしくは廃棄し、自ら保有しません。

{{sign_date}}
氏名：{{name}}$t$)
on conflict (doc_type, variant, version) do nothing;
