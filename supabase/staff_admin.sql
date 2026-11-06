-- 職員マスタ（#staff）：staff_profiles を画面から直す
-- 見られる：会長・事務（bp_is_corp_admin）・職責「管理者」
-- ほかの職員を直す：会長・事務だけ
-- 会長フラグ(is_chair)：会長だけ。自分を会長／事務へ上げることは不可
-- 既存データは変更しない。何度実行しても同じ。

create or replace function public.staff_admin_can()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.is_chair()
    or public.bp_is_corp_admin()
    or public.my_duty() = '管理者',
    false
  );
$$;

revoke all on function public.staff_admin_can() from public, anon;
grant execute on function public.staff_admin_can() to authenticated;

-- 管理者も名簿を読める（いまは事務の JWT／自事業所の事務だけ）
drop policy if exists sp_admin_read on public.staff_profiles;
create policy sp_admin_read on public.staff_profiles
  for select to authenticated
  using (public.staff_admin_can());

-- 名簿（メール付き）。security definer で auth.users を読む
create or replace function public.staff_admin_roster()
returns table (
  user_id uuid,
  email text,
  office text,
  role text,
  duty text,
  full_name text,
  nikki_name text,
  chamu_record_name text,
  extra_offices text[],
  nicchu boolean,
  daily_report boolean,
  active boolean,
  is_chair boolean,
  rank text,
  chat_email text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.staff_admin_can() then
    raise exception '職員マスタを見る権限がありません（会長・事務・管理者）';
  end if;
  return query
    select
      p.user_id,
      u.email::text,
      p.office,
      p.role,
      p.duty,
      p.full_name,
      p.nikki_name,
      p.chamu_record_name,
      p.extra_offices,
      p.nicchu,
      p.daily_report,
      p.active,
      p.is_chair,
      p.rank,
      p.chat_email
    from public.staff_profiles p
    left join auth.users u on u.id = p.user_id
    order by p.active desc, p.office, coalesce(nullif(p.full_name, ''), nullif(p.nikki_name, ''), u.email);
end;
$$;

revoke all on function public.staff_admin_roster() from public, anon;
grant execute on function public.staff_admin_roster() to authenticated;

-- 安全な更新（直接 UPDATE ポリシーは付けない）
create or replace function public.staff_admin_update(p_user_id uuid, p_patch jsonb)
returns public.staff_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.staff_profiles;
  me_chair boolean := coalesce(public.is_chair(), false);
  me_corp boolean := coalesce(public.bp_is_corp_admin(), false);
  me_mgr boolean := coalesce(public.my_duty() = '管理者', false);
  new_role text;
  new_duty text;
  new_office text;
  new_is_chair boolean;
  new_extra text[];
  patch jsonb := coalesce(p_patch, '{}'::jsonb);
begin
  if auth.uid() is null then
    raise exception 'ログインが必要です';
  end if;
  if not (me_chair or me_corp or me_mgr) then
    raise exception '職員マスタを直す権限がありません（会長・事務・管理者）';
  end if;
  if p_user_id is null then
    raise exception '対象の職員が指定されていません';
  end if;

  select * into t from public.staff_profiles where user_id = p_user_id for update;
  if not found then
    raise exception '職員プロフィールが見つかりません';
  end if;

  -- 会長の行は会長だけ
  if t.is_chair and not me_chair then
    raise exception '会長のプロフィールは会長だけが直せます';
  end if;

  -- ほかの職員を直すのは会長・事務だけ（管理者は自分だけ）
  if p_user_id is distinct from auth.uid() and not (me_chair or me_corp) then
    raise exception 'ほかの職員を直せるのは会長と事務（法人管理者）だけです';
  end if;

  -- 自分を事務／会長へ上げることは不可
  if p_user_id = auth.uid() then
    if patch ? 'role' and coalesce(patch->>'role', '') = '事務' and t.role is distinct from '事務' then
      raise exception '自分の役割を事務に上げることはできません';
    end if;
    if patch ? 'is_chair' and coalesce((patch->>'is_chair')::boolean, false) and not t.is_chair then
      raise exception '自分を会長にすることはできません';
    end if;
  end if;

  -- is_chair の変更は会長だけ
  if patch ? 'is_chair' then
    new_is_chair := (patch->>'is_chair')::boolean;
    if new_is_chair is distinct from t.is_chair and not me_chair then
      raise exception '会長フラグは会長だけが変更できます';
    end if;
  else
    new_is_chair := t.is_chair;
  end if;

  -- role の変更は会長・事務だけ
  if patch ? 'role' then
    new_role := patch->>'role';
    if new_role is distinct from t.role and not (me_chair or me_corp) then
      raise exception '役割（職員／事務）は会長と事務だけが変更できます';
    end if;
    if new_role is null or new_role not in ('職員', '事務') then
      raise exception '役割は「職員」か「事務」にしてください';
    end if;
  else
    new_role := t.role;
  end if;

  if patch ? 'duty' then
    new_duty := patch->>'duty';
    if new_duty is null or new_duty not in ('管理者', '児発管', '現場支援員', '事務') then
      raise exception '職責が不正です';
    end if;
  else
    new_duty := t.duty;
  end if;

  if patch ? 'office' then
    new_office := nullif(btrim(patch->>'office'), '');
    if new_office is null or char_length(new_office) > 40 then
      raise exception '所属事業所を入れてください';
    end if;
  else
    new_office := t.office;
  end if;

  if patch ? 'extra_offices' then
    if jsonb_typeof(patch->'extra_offices') = 'array' then
      select coalesce(array_agg(distinct x), '{}'::text[])
        into new_extra
      from (
        select nullif(btrim(value #>> '{}'), '') as x
        from jsonb_array_elements(patch->'extra_offices')
      ) s
      where x is not null;
    elsif patch->>'extra_offices' is null or patch->>'extra_offices' = '' then
      new_extra := '{}'::text[];
    else
      raise exception '兼務は配列で送ってください';
    end if;
    -- 所属と同じ名前は兼務から外す
    new_extra := array(select e from unnest(new_extra) e where e is distinct from new_office);
  else
    new_extra := t.extra_offices;
  end if;

  update public.staff_profiles set
    office = new_office,
    role = new_role,
    duty = new_duty,
    is_chair = new_is_chair,
    extra_offices = coalesce(new_extra, '{}'::text[]),
    full_name = case when patch ? 'full_name' then nullif(btrim(patch->>'full_name'), '') else full_name end,
    nikki_name = case when patch ? 'nikki_name' then nullif(btrim(patch->>'nikki_name'), '') else nikki_name end,
    chamu_record_name = case
      when patch ? 'chamu_record_name' then nullif(btrim(patch->>'chamu_record_name'), '')
      else chamu_record_name end,
    nicchu = case when patch ? 'nicchu' then coalesce((patch->>'nicchu')::boolean, false) else nicchu end,
    daily_report = case when patch ? 'daily_report' then coalesce((patch->>'daily_report')::boolean, false) else daily_report end,
    active = case when patch ? 'active' then coalesce((patch->>'active')::boolean, true) else active end,
    rank = case when patch ? 'rank' then nullif(btrim(patch->>'rank'), '') else rank end,
    chat_email = case when patch ? 'chat_email' then nullif(btrim(patch->>'chat_email'), '') else chat_email end,
    is_leader = case
      when patch ? 'rank' then (nullif(btrim(patch->>'rank'), '') is not null)
      else is_leader end
  where user_id = p_user_id
  returning * into t;

  return t;
end;
$$;

revoke all on function public.staff_admin_update(uuid, jsonb) from public, anon;
grant execute on function public.staff_admin_update(uuid, jsonb) to authenticated;
