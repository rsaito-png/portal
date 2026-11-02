-- 番頭：レオ児発管ホームの「今日やること」を担当者別の依頼（staff_todo）にする
alter table public.staff_todo add column if not exists link text check (link is null or link ~ '^#[A-Za-z0-9/_-]*$');
alter table public.staff_todo add column if not exists office text;
alter table public.staff_todo add column if not exists source_key text;
create unique index if not exists staff_todo_source_open on public.staff_todo (source_key) where source_key is not null and status <> 'done';

-- 担当の決め方（名簿から引く。固定IDは使わない）。kind: plan/hiyari/edits → 児発管、kakunin → 宮本（事務）。いなければ管理者
create or replace function public.leo_todo_assignee(p_kind text) returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    case when p_kind = 'kakunin' then
      (select user_id from staff_profiles where active and office = 'レオ' and (replace(replace(coalesce(full_name,''),'　',''),' ','') like '宮本%' or replace(replace(coalesce(nikki_name,''),'　',''),' ','') like '宮本%') order by full_name limit 1)
    else (select user_id from staff_profiles where active and office = 'レオ' and duty = '児発管' order by full_name limit 1) end,
    (select user_id from staff_profiles where active and office = 'レオ' and duty = '管理者' order by is_chair desc limit 1));
$$;

-- p_items: [{kind, key, title, link}]。同じ source_key の未完了があれば題名・リンクを直す、なければ新しく出す
create or replace function public.leo_publish_home_todos(p_items jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare it jsonb; who uuid; nm text; tid bigint; res jsonb := '[]'::jsonb; act text;
begin
  if not public.can_manage() then raise exception '管理者・児発管・事務だけが依頼を出せます'; end if;
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    if coalesce(it->>'key','') !~ '^leo:' or coalesce(it->>'title','') = '' then continue; end if;
    who := public.leo_todo_assignee(it->>'kind');
    if who is null then continue; end if;
    select coalesce(nullif(full_name,''), nikki_name) into nm from staff_profiles where user_id = who;
    select id into tid from staff_todo where source_key = it->>'key' and status <> 'done' limit 1;
    if tid is null then
      insert into staff_todo (assignee, title, link, office, source_key, created_by) values (who, left(it->>'title', 300), nullif(it->>'link',''), 'レオ', it->>'key', auth.uid()) returning id into tid; act := '新規';
    else
      update staff_todo set title = left(it->>'title', 300), link = nullif(it->>'link',''), updated_at = now() where id = tid; act := '更新';
    end if;
    res := res || jsonb_build_object('key', it->>'key', 'id', tid, 'assignee', who, 'name', nm, 'action', act);
  end loop;
  return res;
end $$;
revoke all on function public.leo_publish_home_todos(jsonb) from public, anon;
grant execute on function public.leo_publish_home_todos(jsonb) to authenticated;
revoke all on function public.leo_todo_assignee(text) from public, anon;

-- 依頼済みの表示用（未完了の source_key と担当名）。can_manage だけ
create or replace function public.leo_home_todo_status() returns table(source_key text, name text, status text) language sql stable security definer set search_path = public as $$
  select t.source_key, coalesce(nullif(p.full_name,''), p.nikki_name), t.status from staff_todo t left join staff_profiles p on p.user_id = t.assignee
  where t.source_key like 'leo:%' and t.status <> 'done' and public.can_manage();
$$;
revoke all on function public.leo_home_todo_status() from public, anon;
grant execute on function public.leo_home_todo_status() to authenticated;
