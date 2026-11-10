-- 法定研修の本人提出。begin/rollback のみ。実在のメール・auth.users.id は使わない。
-- 前提: supabase/ht_self_submit.sql を適用済み（2回流してもエラーにならないこと）。
-- 最後の rollback を外さない。検証行は残さない。auth.users には触らない
-- （auth_user_id の外部キーは遅延なので、未コミットの架空UUIDで判定だけ確認できる）。
begin;

do $$ begin
  if to_regprocedure('public.ht_submit_own_quiz(text,jsonb,text,text)') is null
     or to_regprocedure('private.ht_submit_own_quiz(text,jsonb,text,text)') is null
     or to_regprocedure('public.ht_my_staff()') is null then
    raise exception 'ht_self_submit.sql が未適用です';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'ht_submit_own_quiz' and p.prosecdef) then
    raise exception '公開の提出関数が security definer になっている';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'ht_my_staff' and p.prosecdef) then
    raise exception '公開の本人関数が security definer になっている';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'private' and p.proname in ('ht_submit_own_quiz', 'ht_self_staff_id', 'ht_staff_auth_guard', 'ht_my_staff')
               and (not p.prosecdef or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))) then
    raise exception 'private 関数の security definer または search_path が足りない';
  end if;
  if has_function_privilege('anon', 'public.ht_submit_own_quiz(text,jsonb,text,text)', 'execute')
     or has_function_privilege('anon', 'public.ht_my_staff()', 'execute')
     or has_function_privilege('authenticated', 'private.ht_self_staff_id()', 'execute') then
    raise exception '関数の実行権限が広すぎる';
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'ht_questions' and column_name = 'answer') then
    raise exception '正解列が ht_questions に残っている';
  end if;
end $$;

insert into public.ht_offices_t(id, name, types, sort) values
  ('__ht_o1', '検証事業所1', array['検証種別'], 1),
  ('__ht_o2', '検証事業所2', array['検証種別'], 2),
  ('__ht_o3', '検証事業所3', array['別種別'], 3);
insert into public.ht_access(email, office_id, can_edit) values
  ('ht-self-admin@example.invalid', null, true),
  ('ht-self-editor@example.invalid', '__ht_o1', true),
  ('login-a@example.invalid', '__ht_o1', false),
  ('login-b@example.invalid', '__ht_o1', false),
  ('login-f@example.invalid', '__ht_o1', false);
insert into public.ht_staff(id, name, email, main_office, sub_offices, status, auth_user_id) values
  ('__ht_self_a', '検証甲', 'login-a@example.invalid', '__ht_o1', '{}', '在籍', null),
  ('__ht_self_b', '検証乙', 'contact-b@example.invalid', '__ht_o1', array['__ht_o2'], '在籍', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2'),
  ('__ht_self_c', '検証丙', 'meta-c@example.invalid', '__ht_o1', '{}', '在籍', null),
  ('__ht_self_d', '検証丁', 'login-d@example.invalid', '__ht_o1', '{}', '退職', 'dddddddd-dddd-dddd-dddd-ddddddddddd4'),
  ('__ht_self_e', '検証戊', 'login-d@example.invalid', '__ht_o1', '{}', '在籍', null),
  ('__ht_self_f', '検証己', 'login-f@example.invalid', '__ht_o3', '{}', '在籍', null),
  ('__ht_self_map', '検証紐付', 'map@example.invalid', '__ht_o1', '{}', '在籍', null);
insert into public.ht_trainings(id, name, target_types, pass_score, active) values
  ('__ht_self_tr', '検証研修', array['検証種別'], 75, true),
  ('__ht_self_other', '対象外研修', array['別種別'], 75, true);
insert into public.ht_questions(training_id, no, question, opt_a, opt_b, opt_c, points) values
  ('__ht_self_tr', 1, '問1', '選択肢A', '選択肢B', null, 1),
  ('__ht_self_tr', 2, '問2', '選択肢A', '選択肢B', '選択肢C', 2);
insert into public.ht_question_keys(training_id, no, answer) values
  ('__ht_self_tr', 1, 'A'),
  ('__ht_self_tr', 2, 'B');

-- メール一致（紐付けなし）の本人
select set_config('request.jwt.claims', json_build_object(
  'sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
  'email', 'login-a@example.invalid',
  'role', 'authenticated',
  'user_metadata', json_build_object('email', 'meta-c@example.invalid')
)::text, true);
set local role authenticated;
do $$
declare g jsonb; n int; v_fy int;
begin
  if (select id from public.ht_my_staff()) <> '__ht_self_a' then raise exception 'メール一致の本人判定が違う'; end if;
  if (select count(*) from public.ht_question_keys) <> 0 then raise exception '閲覧者が正解を読めた'; end if;
  if (select count(*) from public.ht_questions where training_id = '__ht_self_tr') <> 2 then raise exception '閲覧者が問題文を読めない'; end if;
  begin
    perform auth_user_id from public.ht_staff limit 1;
    raise exception '閲覧者がログイン紐付けを読めた';
  exception when insufficient_privilege then null;
  end;
  begin
    perform private.ht_self_staff_id();
    raise exception '内部関数を直接実行できた';
  exception when insufficient_privilege then null;
  end;
  g := public.ht_submit_own_quiz('__ht_self_tr', '{"1":"A","2":"B"}'::jsonb, '所感甲', '計画甲');
  if g->>'passed' <> '合格' or (g->>'rate')::int <> 100 or (g->>'score')::int <> 3 then
    raise exception '本人の正解が合格にならない %', g;
  end if;
  v_fy := date_part('year', (timezone('Asia/Tokyo', now()))::date)::int
      - case when date_part('month', (timezone('Asia/Tokyo', now()))::date)::int >= 4 then 0 else 1 end;
  if not exists (
    select 1 from public.ht_records r
    where r.id = g->>'id' and r.staff_id = '__ht_self_a' and r.staff_name = '検証甲'
      and r.email = 'login-a@example.invalid' and r.submit_email = 'login-a@example.invalid'
      and r.source = 'ポータル' and r.evidence = 'ポータル（本人確認あり）'
      and r.confirmed_at is null and r.confirmed_by is null
      and r.offices = array['__ht_o1'] and r.fy = v_fy and r.impression = '所感甲'
  ) then raise exception '本人提出の記録内容が違う'; end if;
  update public.ht_records set score = 100 where id = g->>'id';
  get diagnostics n = row_count;
  if n <> 0 then raise exception '閲覧者が提出後に記録を直せた'; end if;
  update public.ht_staff set name = '改ざん', email = 'other@example.invalid' where id = '__ht_self_b';
  get diagnostics n = row_count;
  if n <> 0 then raise exception '閲覧者が名簿を直せた'; end if;
  begin
    update public.ht_staff set auth_user_id = 'ffffffff-ffff-ffff-ffff-ffffffffffff' where id = '__ht_self_a';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'viewer wrote auth mapping'; end if;
  exception
    when insufficient_privilege then null;
    when raise_exception then
      if sqlerrm not like '%ログイン紐付け%' then raise; end if;
  end;
  begin
    insert into public.ht_access(email, office_id, can_edit) values ('login-a@example.invalid', '__ht_o2', true);
    raise exception '閲覧者が権限を追加できた';
  exception when insufficient_privilege then null;
  end;
  update public.ht_access set can_edit = true where email = 'login-a@example.invalid';
  get diagnostics n = row_count;
  if n <> 0 then raise exception '閲覧者が自分の権限を編集可にできた'; end if;
  begin
    insert into public.ht_records(fy, training_id, staff_id, staff_name, email, offices, score, max_score, rate, passed, impression, plan, source, confirmed_at, confirmed_by)
    values (v_fy, '__ht_self_tr', '__ht_self_b', '検証乙', 'contact-b@example.invalid', array['__ht_o1'], 100, 100, 100, '合格', '偽造', '偽造', 'ポータル', now(), '偽造');
    raise exception 'forged confirm insert accepted';
  exception
    when insufficient_privilege then null;
    when raise_exception then
      if sqlerrm = 'forged confirm insert accepted' or sqlerrm not like '%統括確認%' then raise; end if;
  end;
  begin
    insert into public.ht_records(fy, training_id, staff_id, offices, impression, plan, source, score, rate, passed)
    values (v_fy, '__ht_self_tr', '__ht_self_a', array['__ht_o2'], '手入力', '計画', '手入力', 100, 100, '合格');
    raise exception '手入力または他事業所の直挿入が通った';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.ht_submit_own_quiz('__ht_self_tr', '{"1":"C","2":"B"}'::jsonb, '所感', '計画');
    raise exception 'bad choice accepted';
  exception when raise_exception then
    if sqlerrm = 'bad choice accepted' or sqlerrm not like '%選択肢%' then raise; end if;
  end;
  begin
    perform public.ht_submit_own_quiz('__ht_self_other', '{"1":"A"}'::jsonb, '所感', '計画');
    raise exception 'out of scope training accepted';
  exception when raise_exception then
    if sqlerrm = 'out of scope training accepted' or (sqlerrm not like '%対象%' and sqlerrm not like '%テスト%') then raise; end if;
  end;
end $$;

-- user_metadata のメールでは本人にならない
select set_config('request.jwt.claims', json_build_object(
  'sub', 'cccccccc-cccc-cccc-cccc-ccccccccccc3',
  'email', 'nobody@example.invalid',
  'role', 'authenticated',
  'user_metadata', json_build_object('email', 'login-a@example.invalid')
)::text, true);
do $$ begin
  if exists (select 1 from public.ht_my_staff()) then raise exception 'user_metadata のメールで本人になった'; end if;
end $$;

-- 紐付け済み（連絡先とログインが違う）の本人。メールが一致する他人にはならない。
select set_config('request.jwt.claims', json_build_object(
  'sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
  'email', 'login-b@example.invalid',
  'role', 'authenticated',
  'user_metadata', json_build_object('email', 'login-a@example.invalid')
)::text, true);
do $$
declare g jsonb;
begin
  if (select id from public.ht_my_staff()) <> '__ht_self_b' then raise exception 'UUID紐付けの本人判定が違う'; end if;
  g := public.ht_submit_own_quiz('__ht_self_tr', '{"1":"A","2":"C"}'::jsonb, '所感乙', '計画乙');
  if g->>'passed' <> '不合格' or (g->>'rate')::int <> 33 or (g->>'score')::int <> 1 or (g->>'max_score')::int <> 3 then
    raise exception '誤答の採点がクライアント値を信用している %', g;
  end if;
  if not exists (
    select 1 from public.ht_records
    where id = g->>'id' and staff_id = '__ht_self_b' and email = 'contact-b@example.invalid'
      and submit_email = 'login-b@example.invalid' and source = 'ポータル'
      and evidence = 'ポータル（本人確認あり）' and confirmed_at is null
      and offices = array['__ht_o1']
  ) then raise exception '紐付け提出で連絡先・ログイン・事業所が違う'; end if;
  g := public.ht_submit_own_quiz('__ht_self_tr', '{"1":"a","2":"b"}'::jsonb, '所感乙2', '計画乙2');
  if g->>'passed' <> '合格' or (g->>'rate')::int <> 100 then raise exception '小文字の正答が不合格 %', g; end if;
  begin
    insert into public.ht_records(fy, training_id, staff_id, offices, impression, plan, source)
    values (2026, '__ht_self_tr', '__ht_self_a', array['__ht_o1'], '他人', '他人', 'ポータル');
    raise exception '紐付けユーザーが他人の記録を入れられた';
  exception when insufficient_privilege then null;
  end;
end $$;

-- 退職者への紐付けがあるときは、同じ連絡先の在籍者へ落ちない
select set_config('request.jwt.claims', json_build_object(
  'sub', 'dddddddd-dddd-dddd-dddd-ddddddddddd4',
  'email', 'login-d@example.invalid',
  'role', 'authenticated'
)::text, true);
do $$ begin
  if exists (select 1 from public.ht_my_staff()) then raise exception '退職者の紐付けから在籍者へ落ちた'; end if;
  begin
    perform public.ht_submit_own_quiz('__ht_self_tr', '{"1":"A","2":"B"}'::jsonb, '所感', '計画');
    raise exception '退職者が提出できた';
  exception when raise_exception then
    if sqlerrm not like '%結びついていません%' then raise; end if;
  end;
end $$;

-- 所属と閲覧範囲が交差しない事業所
select set_config('request.jwt.claims', json_build_object(
  'sub', 'ffffffff-ffff-ffff-ffff-fffffffffff6',
  'email', 'login-f@example.invalid',
  'role', 'authenticated'
)::text, true);
do $$ begin
  if (select id from public.ht_my_staff()) <> '__ht_self_f' then raise exception '事業所不一致の職員を本人とみなせない'; end if;
  begin
    perform public.ht_submit_own_quiz('__ht_self_tr', '{"1":"A","2":"B"}'::jsonb, '所感', '計画');
    raise exception '所属外の閲覧範囲で提出できた';
  exception when raise_exception then
    if sqlerrm not like '%対象事業所%' then raise; end if;
  end;
end $$;

reset role;

-- 事業所の編集者: 記録の手入力と名簿の通常編集はでき、紐付け・マスタ・削除はできない
select set_config('request.jwt.claims', '{"email":"ht-self-editor@example.invalid","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int; rid text;
begin
  if public.ht_all() then raise exception '事業所担当を統括と誤認'; end if;
  if (select count(*) from public.ht_question_keys where training_id = '__ht_self_tr') <> 2 then raise exception '編集者が正解を読めない'; end if;
  update public.ht_staff set name = '担当が修正' where id = '__ht_self_b';
  get diagnostics n = row_count;
  if n <> 1 then raise exception '担当者が名簿を直せない'; end if;
  begin
    update public.ht_staff set auth_user_id = 'ffffffff-ffff-ffff-ffff-ffffffffffff' where id = '__ht_self_b';
    raise exception 'editor wrote auth mapping';
  exception when raise_exception then
    if sqlerrm not like '%ログイン紐付け%' then raise; end if;
  end;
  begin
    insert into public.ht_staff(id, name, main_office, auth_user_id)
    values ('__ht_self_new', '新規', '__ht_o1', 'ffffffff-ffff-ffff-ffff-ffffffffffff');
    raise exception '担当者が新規職員に紐付けを書けた';
  exception when raise_exception then
    if sqlerrm not like '%ログイン紐付け%' then raise; end if;
  end;
  insert into public.ht_staff(id, name, email, main_office, status)
  values ('__ht_self_new', '新規', 'new@example.invalid', '__ht_o1', '在籍');
  insert into public.ht_records(id, fy, training_id, staff_id, staff_name, email, offices, impression, plan, source, score, max_score, rate, passed)
  values ('__ht_self_hand', 2026, '__ht_self_tr', '__ht_self_a', '検証甲', 'login-a@example.invalid', array['__ht_o1'], '手入力の所感', '手入力の計画', '手入力', 80, 100, 80, '合格')
  returning id into rid;
  update public.ht_records set impression = '編集済' where id = rid;
  get diagnostics n = row_count;
  if n <> 1 then raise exception '担当者が受講記録を直せない'; end if;
  if not exists (select 1 from public.ht_records where id = rid and evidence = '手入力（編集済み・証跡なし）' and confirmed_at is null and source = '手入力') then
    raise exception '編集後の証跡リセットが崩れた';
  end if;
  insert into public.ht_records(fy, training_id, training_name, staff_id, staff_name, email, offices, score, max_score, rate, passed, impression, plan, source)
  values (2026, '__ht_self_tr', '検証研修', '__ht_self_a', '検証甲', 'login-a@example.invalid', array['__ht_o1'], 100, 100, 100, '合格', '代理所感', '代理計画', 'ポータル');
  if not exists (
    select 1 from public.ht_records
    where impression = '代理所感' and source = 'ポータル' and evidence = 'ポータル（本人確認あり）' and submit_email = 'ht-self-editor@example.invalid'
  ) then raise exception '担当者のポータル記録が残せない'; end if;
  delete from public.ht_records where staff_id = '__ht_self_a';
  get diagnostics n = row_count;
  if n <> 0 then raise exception '担当者が受講記録を消せた'; end if;
  update public.ht_trainings set name = '禁止' where id = '__ht_self_tr';
  get diagnostics n = row_count;
  if n <> 0 then raise exception '担当者が研修マスタを直せた'; end if;
  begin
    insert into public.ht_question_keys(training_id, no, answer) values ('__ht_self_tr', 9, 'A');
    raise exception '担当者が正解を書けた';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.ht_records set offices = array['__ht_o2'] where id = '__ht_self_hand';
    raise exception '担当者が範囲外の事業所へ記録を移せた';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.ht_access(email, office_id, can_edit) values ('intruder@example.invalid', '__ht_o1', true);
    raise exception '担当者が権限を追加できた';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
do $$ begin
  if not exists (
    select 1 from public.ht_staff
    where id = '__ht_self_b' and name = '担当が修正' and email = 'contact-b@example.invalid'
      and auth_user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2'
  ) then raise exception '名簿修正で連絡先か紐付けが変わった'; end if;
  if exists (select 1 from public.ht_staff where id = '__ht_self_new' and auth_user_id is not null) then
    raise exception '新規職員に紐付けが残った';
  end if;
end $$;

-- 統括: マスタ編集、確認、紐付けの変更はできる
select set_config('request.jwt.claims', '{"email":"ht-self-admin@example.invalid","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  if not public.ht_all() then raise exception '統括判定失敗'; end if;
  update public.ht_trainings set name = '統括が修正' where id = '__ht_self_tr';
  get diagnostics n = row_count;
  if n <> 1 then raise exception '統括が研修マスタを直せない'; end if;
  update public.ht_records set confirmed_at = now(), confirmed_by = '検証統括' where id = '__ht_self_hand';
  get diagnostics n = row_count;
  if n <> 1 then raise exception '統括確認ができない'; end if;
  if not exists (select 1 from public.ht_records where id = '__ht_self_hand' and confirmed_by = '検証統括' and confirmed_at is not null) then
    raise exception '統括確認が保存されない';
  end if;
  update public.ht_staff set auth_user_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' where id = '__ht_self_map';
  get diagnostics n = row_count;
  if n <> 1 then raise exception '統括がログイン紐付けを書けない'; end if;
  if (select email from public.ht_staff where id = '__ht_self_map') <> 'map@example.invalid' then
    raise exception '紐付け変更で連絡先が変わった';
  end if;
  insert into public.ht_questions(training_id, no, question, opt_a, opt_b, points)
  values ('__ht_self_tr', 8, '追加', '選択肢A', '選択肢B', 1);
  insert into public.ht_question_keys(training_id, no, answer) values ('__ht_self_tr', 8, 'D');
  delete from public.ht_question_keys where training_id = '__ht_self_tr' and no = 8;
  get diagnostics n = row_count;
  if n <> 1 then raise exception '統括が正解を管理できない'; end if;
  delete from public.ht_questions where training_id = '__ht_self_tr' and no = 8;
  get diagnostics n = row_count;
  if n <> 1 then raise exception '統括が問題を管理できない'; end if;
end $$;

reset role;
rollback;
select 'PASS: 本人2通りの提出、他人・他事業所・偽造・名簿と権限の拒否、編集者と統括の維持、再実行可能な権限境界（検証データはrollback）' as result;
