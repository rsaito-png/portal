-- LINEの下書き（leo_diary_draft＝トップの「LINEの下書き」）からも日誌の活動記録へ転記する。
-- 既存の leo_activity_from_drafts は leo_line_drafts だけを見ていたため、
-- 職員が毎日使うトップ画面の保存が活動記録に入らなかった。
-- Supabase SQL Editor で Run すること。

create or replace function public.leo_activity_from_drafts(p_day date) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if public.my_office() is distinct from 'レオ'
     and current_user <> 'postgres'
     and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'レオ職員のみ';
  end if;

  -- トップの「LINEの下書き」にだけある分を、転記元（leo_line_drafts）へ写す
  insert into leo_line_drafts (day, child, body, author_name)
  select d.day, d.child, d.body, d.author
  from leo_diary_draft d
  where d.day = p_day
    and coalesce(trim(d.body), '') <> ''
    and not exists (
      select 1 from leo_line_drafts l
      where l.day = d.day and leo_norm(l.child) = leo_norm(d.child));

  insert into leo_activity (day, child, text, source, draft_id, made_by)
  select distinct on (d.child) d.day, d.child, leo_simple_activity(d.body), '自動（簡易）', d.id, auth.uid()
  from leo_line_drafts d
  where d.day = p_day
  order by d.child, d.updated_at desc
  on conflict (day, child) do update
    set text = excluded.text, draft_id = excluded.draft_id, made_at = now()
    where leo_activity.source = '自動（簡易）';

  get diagnostics n = row_count;
  return n;
end $$;

grant execute on function public.leo_activity_from_drafts to authenticated;
