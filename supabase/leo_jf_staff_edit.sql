-- 受給者証の入力：職員が pending を直す・消す（can_manage）。バックアップ表は確認用。
-- SQL Editor で再実行しても同じ。

create table if not exists public.leo_jf_subs_backup (
  backup_id bigint generated always as identity primary key,
  backed_up_at timestamptz not null default now(),
  backup_reason text,
  id bigint, token text, child text, vals jsonb, consent_at timestamptz,
  status text, applied jsonb, before jsonb, note text,
  reviewed_by uuid, reviewed_at timestamptz, created_at timestamptz
);
alter table public.leo_jf_subs_backup enable row level security;
revoke all on public.leo_jf_subs_backup from anon, authenticated;
grant select on public.leo_jf_subs_backup to authenticated;
drop policy if exists ljf_backup_sel on public.leo_jf_subs_backup;
create policy ljf_backup_sel on public.leo_jf_subs_backup for select to authenticated using (public.can_manage());

create or replace function public.leo_jf_edit_pending(p_id bigint, p_vals jsonb, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare s leo_jf_subs; v jsonb := '{}'::jsonb; k text; x text;
  keys text[] := array['jukyusha_no','city_name','city_no','guardian_name','child_name','child_birth','issue_date','kind','contract_days','period_from','period_to','cap_monthly','cap_other','cap_mgmt','mushouka','amount_text','other','soudan_office','soudan_person'];
  dates text[] := array['child_birth','issue_date','period_from','period_to'];
begin
  if not public.can_manage() then raise exception '事務・管理者・児発管のみ'; end if;
  select * into s from leo_jf_subs where id = p_id for update;
  if not found then raise exception '見つかりません'; end if;
  if s.status <> 'pending' then raise exception '確認待ち以外は直せません'; end if;
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
    if (v ->> 'cap_monthly') not in ('0', '4600', '37200') then raise exception '負担上限月額は 0・4600・37200 のどれかです'; end if;
  elsif coalesce(v ->> 'cap_other', '') !~ '^\d{1,7}$' then raise exception '負担上限月額を選ぶか、その他の金額を入れてください'; end if;
  update leo_jf_subs set vals = v, note = left(nullif(btrim(coalesce(p_note, note, '')), ''), 500) where id = p_id;
end $$;
revoke all on function public.leo_jf_edit_pending from public;
grant execute on function public.leo_jf_edit_pending to authenticated;

create or replace function public.leo_jf_delete_pending(p_id bigint, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare s leo_jf_subs;
begin
  if not public.can_manage() then raise exception '事務・管理者・児発管のみ'; end if;
  select * into s from leo_jf_subs where id = p_id for update;
  if not found then raise exception '見つかりません'; end if;
  if s.status <> 'pending' then raise exception '確認待ち以外は消せません（反映済みは残します）'; end if;
  insert into leo_jf_subs_backup (backup_reason, id, token, child, vals, consent_at, status, applied, before, note, reviewed_by, reviewed_at, created_at)
  values (left(coalesce(nullif(btrim(p_reason), ''), '職員が確認待ちを削除'), 200), s.id, s.token, s.child, s.vals, s.consent_at, s.status, s.applied, s.before, s.note, s.reviewed_by, s.reviewed_at, s.created_at);
  delete from leo_jf_subs where id = p_id;
end $$;
revoke all on function public.leo_jf_delete_pending from public;
grant execute on function public.leo_jf_delete_pending to authenticated;
