-- RYDEEN(B型) 業務日誌テーブルと利用者アカウント作成関数。bp_ 接頭辞・office列・RLS(既存方針に従う)
create table if not exists public.bp_journal (
  id uuid primary key default gen_random_uuid(),
  office text not null default public.bp_my_office() check (office <> ''),
  worker_id uuid not null references public.bp_profiles(id) on delete cascade,
  journal_date date not null,
  status text not null default '' check (status in ('','通所','施設外就労','施設外支援','在宅','欠席','休み')),
  start_time text not null default '', end_time text not null default '',
  break_min int not null default 0,
  work text not null default '', health text not null default '', memo text not null default '',
  abs_reason text, abs_at text, abs_staff text, abs_handled boolean not null default false, abs_note text,
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  unique (worker_id, journal_date),
  foreign key (worker_id, office) references public.bp_profiles(id, office) on delete cascade
);
alter table public.bp_journal enable row level security;
drop trigger if exists bp_office_immutable_t on public.bp_journal;
create trigger bp_office_immutable_t before update on public.bp_journal for each row execute function public.bp_office_immutable();
drop policy if exists bp_journal_corp_all on public.bp_journal;
create policy bp_journal_corp_all on public.bp_journal for all to authenticated using (public.bp_is_corp_admin()) with check (public.bp_is_corp_admin());
drop policy if exists bp_journal_admin on public.bp_journal;
create policy bp_journal_admin on public.bp_journal for all to authenticated
  using (public.bp_is_admin() and office = public.bp_my_office()) with check (public.bp_is_admin() and office = public.bp_my_office());

-- 利用者アカウント作成(静的サイトからは service role を使えないため、管理者のみ呼べる関数で作る)。登録先は呼んだ管理者の事業所
create or replace function public.bp_create_worker(p_email text, p_password text, p_name text) returns uuid
language plpgsql security definer set search_path = public, extensions, auth as $$
declare v_office text := public.bp_my_office(); v_id uuid := gen_random_uuid(); v_email text := lower(trim(p_email));
begin
  if not public.bp_is_admin() or v_office is null then raise exception '権限がありません'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+$' then raise exception 'メールアドレスが正しくありません'; end if;
  if length(coalesce(p_password,'')) < 8 then raise exception 'パスワードは8文字以上にしてください'; end if;
  if exists (select 1 from auth.users where lower(email) = v_email) then raise exception 'このメールアドレスは既に使われています'; end if;
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, reauthentication_token, phone_change, phone_change_token)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email, crypt(p_password, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('display_name', p_name), now(), now(), '', '', '', '', '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id, v_id::text, jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true), 'email', now(), now(), now());
  insert into public.bp_profiles (id, office, role, display_name) values (v_id, v_office, 'worker', coalesce(p_name,''));
  return v_id;
end $$;
revoke all on function public.bp_create_worker(text,text,text) from public, anon;
grant execute on function public.bp_create_worker(text,text,text) to authenticated;
