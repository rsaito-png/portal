-- 日誌の保存：画面を開いている間に行が入れ替わっても保存できるようにする。
-- 行番号が見つからないときは、児童名で同じ日の行を探す。それも無ければ、その児童の行を新しく作る（手入力）。
drop function if exists public.leo_nikki_apply(date, integer, jsonb);
create or replace function public.leo_nikki_apply(p_day date, p_row integer, p_fields jsonb, p_child text default null)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare
  allowed text[] := array['activity','pick_place','pick_time','pick_driver','start_time','end_time','drop_time','drop_driver','drop_place'];
  k text; v text; child text; touched_activity boolean := false; row_n integer := p_row; base integer;
begin
  if not public.leo_record_allowed() then raise exception 'レオ職員のみ'; end if;
  if p_day is null or p_row is null or jsonb_typeof(p_fields) <> 'object' then raise exception '形式'; end if;
  if not exists (select 1 from leo_nikki where day = p_day and row_no = row_n) then
    if coalesce(btrim(p_child), '') = '' then raise exception '日誌の行がありません'; end if;
    select n.row_no into row_n from leo_nikki n where n.day = p_day and public.leo_norm(n.child) = public.leo_norm(p_child) order by n.row_no limit 1;
    if row_n is null then
      base := 9;
      while exists (select 1 from leo_nikki where day = p_day and row_no = base) loop
        base := base + 1;
        if base > 80 then raise exception '日誌の行が足りません'; end if;
      end loop;
      insert into leo_nikki (day, row_no, kind, child, service, seed)
        values (p_day, base, '利用', btrim(p_child),
                (select c.kind from leo_children c where public.leo_norm(c.name) = public.leo_norm(p_child) limit 1), 'manual');
      row_n := base;
    end if;
  end if;
  for k, v in select e.key, e.value from jsonb_each_text(p_fields) e loop
    if not (k = any (allowed)) then continue; end if;
    v := nullif(btrim(v), '');
    if k = 'activity' then
      update leo_nikki set activity = left(coalesce(v, ''), 6000), activity_via = '手入力' where day = p_day and row_no = row_n;
      touched_activity := true;
    elsif k = 'pick_place' then update leo_nikki set pick_place = v where day = p_day and row_no = row_n;
    elsif k = 'pick_time' then update leo_nikki set pick_time = v where day = p_day and row_no = row_n;
    elsif k = 'pick_driver' then update leo_nikki set pick_driver = v where day = p_day and row_no = row_n;
    elsif k = 'start_time' then update leo_nikki set start_time = v where day = p_day and row_no = row_n;
    elsif k = 'end_time' then update leo_nikki set end_time = v where day = p_day and row_no = row_n;
    elsif k = 'drop_time' then update leo_nikki set drop_time = v where day = p_day and row_no = row_n;
    elsif k = 'drop_driver' then update leo_nikki set drop_driver = v where day = p_day and row_no = row_n;
    elsif k = 'drop_place' then update leo_nikki set drop_place = v where day = p_day and row_no = row_n;
    end if;
  end loop;
  update leo_nikki set staff_saved_at = coalesce(staff_saved_at, now()) where day = p_day and row_no = row_n and p_day >= public.leo_sync_start();
  if touched_activity then
    select nk.child into child from leo_nikki nk where nk.day = p_day and nk.row_no = row_n;
    insert into leo_activity (day, child, text, source, made_by)
    select p_day, child, left(coalesce(nk.activity, ''), 6000), '手入力', auth.uid()
      from leo_nikki nk where nk.day = p_day and nk.row_no = row_n
    on conflict (day, child) do update
      set text = excluded.text, source = '手入力', made_at = now(), made_by = excluded.made_by;
  end if;
  perform public.leo_jisseki_from_nikki(p_day);
end $function$;
grant execute on function public.leo_nikki_apply(date, integer, jsonb, text) to authenticated, service_role;
