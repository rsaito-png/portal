-- 法定研修: 閲覧だけの職員が「本人の確認テスト」だけ提出できる増分。
-- 冪等。houtei.sql 全体は再実行しない（既存ポリシーやシードを上書きしうるため）。
-- このファイルに実在のメールアドレス・auth.users の id は入れない。
-- 名簿の連絡先（ht_staff.email）は変更しない。ログインとの紐付けは全事業所管理者（または JWT のない DB 所有者セッション）だけが書く。
-- 本人提出の採点・本人・事業所・証跡はサーバが決める。閲覧者の ht_records 直 INSERT は従来どおり拒否。

create schema if not exists private;

alter table public.ht_staff add column if not exists auth_user_id uuid;
comment on column public.ht_staff.auth_user_id is
  'ポータルログインの auth.users.id。連絡先メールとは別。未設定の行だけ、在籍かつ連絡先が JWT の email と一致する場合に本人とみなす。';

create unique index if not exists ht_staff_auth_user_uq
  on public.ht_staff (auth_user_id) where auth_user_id is not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ht_staff_auth_user_fk') then
    alter table public.ht_staff
      add constraint ht_staff_auth_user_fk
      foreign key (auth_user_id) references auth.users (id) on delete set null
      deferrable initially deferred;
  end if;
end $$;

-- 正解は問題文と分ける。閲覧者は問題文だけ読め、正解表は編集者と統括だけ。
create table if not exists public.ht_question_keys (
  training_id text not null,
  no int not null,
  answer text not null,
  primary key (training_id, no),
  foreign key (training_id, no) references public.ht_questions (training_id, no) on delete cascade,
  constraint ht_question_keys_answer_chk check (answer in ('A', 'B', 'C', 'D'))
);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ht_question_keys_answer_chk') then
    alter table public.ht_question_keys
      add constraint ht_question_keys_answer_chk check (answer in ('A', 'B', 'C', 'D'));
  end if;
end $$;

do $$
declare nbad int;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'ht_questions' and column_name = 'answer'
  ) then
    select count(*) into nbad from public.ht_questions
     where answer is not null and btrim(answer) <> ''
       and upper(btrim(answer)) not in ('A', 'B', 'C', 'D');
    if nbad > 0 then
      raise exception '確認テストの正解に A〜D 以外が % 件あります。直してから再実行してください', nbad;
    end if;
    insert into public.ht_question_keys (training_id, no, answer)
    select q.training_id, q.no, upper(btrim(q.answer))
    from public.ht_questions q
    where q.answer is not null and btrim(q.answer) <> ''
    on conflict (training_id, no) do update set answer = excluded.answer;
    alter table public.ht_questions drop column answer;
  end if;
end $$;

alter table public.ht_question_keys enable row level security;
drop policy if exists ht_question_keys_r on public.ht_question_keys;
create policy ht_question_keys_r on public.ht_question_keys
  for select to authenticated
  using (public.ht_all() or coalesce(array_length(public.ht_edit_offices(), 1), 0) > 0);
drop policy if exists ht_question_keys_w on public.ht_question_keys;
create policy ht_question_keys_w on public.ht_question_keys
  for all to authenticated
  using (public.ht_all()) with check (public.ht_all());

revoke all on public.ht_question_keys from public;
grant select, insert, update, delete on public.ht_question_keys to authenticated;

-- 連絡先一覧からログインの user id を読ませない（提出の本人判定は下の関数だけが見る）。
revoke select on public.ht_staff from authenticated;
grant select (
  id, name, kana, email, main_office, sub_offices, employment, job, hired, status, retired, note
) on public.ht_staff to authenticated;

-- ログイン中の本人（在籍のみ）。紐付けがあるユーザーはメール一致へ落ちない。
create or replace function private.ht_self_staff_id()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := pg_catalog.lower(coalesce(auth.jwt() ->> 'email', ''::text));
  v_id text;
  v_n int;
begin
  if v_uid is null then
    return null;
  end if;
  select count(*) into v_n from public.ht_staff s where s.auth_user_id = v_uid;
  if v_n > 1 then
    return null;
  end if;
  if v_n = 1 then
    select s.id into v_id from public.ht_staff s
     where s.auth_user_id = v_uid and s.status = '在籍';
    return v_id;
  end if;
  if v_email = '' then
    return null;
  end if;
  select count(*) into v_n from public.ht_staff s
   where s.auth_user_id is null and s.status = '在籍' and pg_catalog.lower(s.email) = v_email;
  if v_n <> 1 then
    return null;
  end if;
  select s.id into v_id from public.ht_staff s
   where s.auth_user_id is null and s.status = '在籍' and pg_catalog.lower(s.email) = v_email;
  return v_id;
end $$;

create or replace function private.ht_my_staff()
returns table (id text, name text, email text, main_office text, sub_offices text[], status text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id text := private.ht_self_staff_id();
begin
  return query
  select s.id, s.name, s.email, s.main_office, s.sub_offices, s.status
  from public.ht_staff s
  where s.id = v_id;
end $$;

-- 閲覧者の本人提出。得点・氏名・事業所・証跡は引数で受けない。
create or replace function private.ht_submit_own_quiz(
  p_training_id text,
  p_answers jsonb,
  p_impression text,
  p_plan text
) returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(auth.role(), auth.jwt() ->> 'role', ''::text);
  v_staff_id text;
  v_name text;
  v_email text;
  v_main text;
  v_subs text[];
  v_tr_name text;
  v_targets text[];
  v_pass int;
  v_offs text[];
  v_imp text := pg_catalog.btrim(coalesce(p_impression, ''::text));
  v_plan text := pg_catalog.btrim(coalesce(p_plan, ''::text));
  v_score int := 0;
  v_max int := 0;
  v_rate int;
  v_passed text;
  v_id text;
  v_n int;
  v_keys int;
  v_today date := (pg_catalog.timezone('Asia/Tokyo', pg_catalog.now()))::date;
  v_fy int;
begin
  if auth.uid() is null or v_role <> 'authenticated' then
    raise exception 'ログインが必要です';
  end if;
  v_staff_id := private.ht_self_staff_id();
  if v_staff_id is null then
    raise exception '名簿とログインが結びついていません';
  end if;
  select s.name, s.email, s.main_office, s.sub_offices
    into v_name, v_email, v_main, v_subs
  from public.ht_staff s
  where s.id = v_staff_id and s.status = '在籍';
  if not found then
    raise exception '名簿とログインが結びついていません';
  end if;
  if v_imp = '' or v_plan = '' then
    raise exception '所感と実践計画は必須です';
  end if;
  if pg_catalog.char_length(v_imp) > 4000 or pg_catalog.char_length(v_plan) > 4000 then
    raise exception '所感と実践計画は4000字以内にしてください';
  end if;
  select t.name, t.target_types, t.pass_score
    into v_tr_name, v_targets, v_pass
  from public.ht_trainings t
  where t.id = p_training_id and t.active;
  if not found then
    raise exception 'この研修のテストは受けられません';
  end if;
  select coalesce(array_agg(o.id order by o.sort, o.id), '{}'::text[])
    into v_offs
  from public.ht_offices_t o
  where o.id = any (array[v_main] || coalesce(v_subs, '{}'::text[]))
    and o.id = any (public.ht_offices())
    and ('全事業' = any (v_targets) or o.types operator(pg_catalog.&&) v_targets);
  if coalesce(pg_catalog.array_length(v_offs, 1), 0::int) = 0 then
    raise exception 'この研修の対象事業所ではありません';
  end if;
  if p_answers is null or pg_catalog.jsonb_typeof(p_answers) <> 'object' then
    raise exception '回答の形式を確認してください';
  end if;
  select count(*) into v_n from public.ht_questions q where q.training_id = p_training_id;
  if v_n = 0 then
    raise exception 'この研修にはテストがありません';
  end if;
  select count(*) into v_keys from public.ht_question_keys k where k.training_id = p_training_id;
  if v_keys <> v_n then
    raise exception 'このテストはいま採点できません。管理者に連絡してください';
  end if;
  if exists (
    select 1 from public.ht_questions q
    where q.training_id = p_training_id
      and not (p_answers ? q.no::text)
  ) or exists (
    select 1 from pg_catalog.jsonb_object_keys(p_answers) k
    where not exists (
      select 1 from public.ht_questions q
      where q.training_id = p_training_id and q.no::text = k
    )
  ) or exists (
    select 1 from public.ht_questions q
    where q.training_id = p_training_id
      and pg_catalog.upper(pg_catalog.btrim(coalesce(p_answers ->> q.no::text, ''::text))) not in (
        case when q.opt_a is not null and pg_catalog.btrim(q.opt_a) <> '' then 'A' else '' end,
        case when q.opt_b is not null and pg_catalog.btrim(q.opt_b) <> '' then 'B' else '' end,
        case when q.opt_c is not null and pg_catalog.btrim(q.opt_c) <> '' then 'C' else '' end,
        case when q.opt_d is not null and pg_catalog.btrim(q.opt_d) <> '' then 'D' else '' end
      )
  ) then
    raise exception 'すべての問いに、選択肢から答えてください';
  end if;
  select coalesce(sum(q.points), 0::bigint),
         coalesce(sum(case
           when k.answer = pg_catalog.upper(pg_catalog.btrim(p_answers ->> q.no::text)) then q.points
           else 0 end), 0::bigint)
    into v_max, v_score
  from public.ht_questions q
  join public.ht_question_keys k on k.training_id = q.training_id and k.no = q.no
  where q.training_id = p_training_id;
  if v_max <= 0 then
    raise exception 'このテストはいま採点できません。管理者に連絡してください';
  end if;
  v_rate := pg_catalog.round(v_score::numeric * 100 / v_max)::int;
  v_passed := case when v_rate >= v_pass then '合格' else '不合格' end;
  v_fy := pg_catalog.date_part('year', v_today)::int
    - case when pg_catalog.date_part('month', v_today)::int >= 4 then 0 else 1 end;
  insert into public.ht_records (
    fy, training_id, training_name, staff_id, staff_name, email, offices,
    score, max_score, rate, passed, impression, plan, source, confirmed_at, confirmed_by
  ) values (
    v_fy, p_training_id, v_tr_name, v_staff_id, v_name, v_email, v_offs,
    v_score, v_max, v_rate, v_passed, v_imp, v_plan, 'ポータル', null, null
  )
  returning id into v_id;
  return pg_catalog.jsonb_build_object(
    'id', v_id, 'score', v_score, 'max_score', v_max, 'rate', v_rate, 'passed', v_passed
  );
end $$;

-- API に出すのは invoker。中身の権限は private の security definer だけが持つ。
create or replace function public.ht_my_staff()
returns table (id text, name text, email text, main_office text, sub_offices text[], status text)
language sql
stable
security invoker
set search_path = ''
as $$ select id, name, email, main_office, sub_offices, status from private.ht_my_staff() $$;

create or replace function public.ht_submit_own_quiz(p_training_id text, p_answers jsonb, p_impression text, p_plan text)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$ select private.ht_submit_own_quiz(p_training_id, p_answers, p_impression, p_plan) $$;

-- 事業所の編集者は名簿の他の列を直せるが、ログイン紐付けは全事業所管理者だけ。
create or replace function private.ht_staff_auth_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(auth.role(), auth.jwt() ->> 'role', ''::text);
  v_changing boolean;
begin
  if tg_op = 'INSERT' then
    v_changing := new.auth_user_id is not null;
  else
    v_changing := new.auth_user_id is distinct from old.auth_user_id;
  end if;
  if not v_changing then
    return new;
  end if;
  if public.ht_all() or v_role = 'service_role' then
    return new;
  end if;
  -- JWT のない DB 所有者セッション（SQL エディタ）だけ、適用時の紐付けを許す。
  if session_user in ('postgres', 'supabase_admin')
     and v_role not in ('authenticated', 'anon')
     and auth.uid() is null
     and coalesce(auth.jwt() ->> 'email', ''::text) = '' then
    return new;
  end if;
  raise exception 'ログイン紐付けは全事業所の管理者だけが変更できます';
end $$;

revoke all on function private.ht_self_staff_id() from public, authenticated;
revoke all on function private.ht_staff_auth_guard() from public, authenticated;
revoke all on function private.ht_my_staff() from public;
revoke all on function private.ht_submit_own_quiz(text, jsonb, text, text) from public;
revoke all on function public.ht_my_staff() from public;
revoke all on function public.ht_submit_own_quiz(text, jsonb, text, text) from public;

grant usage on schema private to authenticated;
grant execute on function private.ht_my_staff() to authenticated;
grant execute on function private.ht_submit_own_quiz(text, jsonb, text, text) to authenticated;
grant execute on function public.ht_my_staff() to authenticated;
grant execute on function public.ht_submit_own_quiz(text, jsonb, text, text) to authenticated;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function private.ht_self_staff_id() from anon';
    execute 'revoke all on function private.ht_staff_auth_guard() from anon';
    execute 'revoke all on function private.ht_my_staff() from anon';
    execute 'revoke all on function private.ht_submit_own_quiz(text, jsonb, text, text) from anon';
    execute 'revoke all on function public.ht_my_staff() from anon';
    execute 'revoke all on function public.ht_submit_own_quiz(text, jsonb, text, text) from anon';
    execute 'revoke all on table public.ht_question_keys from anon';
    execute 'revoke usage on schema private from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update, delete on table public.ht_question_keys to service_role';
  end if;
end $$;

drop trigger if exists ht_staff_auth_guard on public.ht_staff;
create trigger ht_staff_auth_guard
  before insert or update on public.ht_staff
  for each row execute function private.ht_staff_auth_guard();

notify pgrst, 'reload schema';
