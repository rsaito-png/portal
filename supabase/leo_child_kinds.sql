-- 予定画面がサービス名（児発／放デイ）を出すための読み取り。
-- leo_children は受給者証番号を含むので、一般のレオ職員は行を読めない（can_manage_for）。
-- この関数は名前と種別だけを返す。列の追加はない。
create or replace function public.leo_child_kinds()
returns table (name text, kind text)
language sql
stable
security definer
set search_path = public
as $$
  select c.name, c.kind
    from public.leo_children c
   where public.my_office() = 'レオ' or public.can_manage() or public.can_bill()
   order by c.name;
$$;

revoke all on function public.leo_child_kinds() from public;
grant execute on function public.leo_child_kinds() to authenticated;
