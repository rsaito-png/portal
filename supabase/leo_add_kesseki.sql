-- 日誌から欠席（加算対応）を足す。
-- カレンダーと同じ予定（kind=休み、title=欠席（欠席時対応加算）、note に連絡日と区分）を入れ、
-- leo_record_day で日誌（kind=欠席）と実績へ流す。キャンセルはここでは作らない。
-- 予定表を直接書けるのは児発管・管理者・事務だけなので、現場の日誌からはこの関数で足す。
-- 再実行できる。列は足さない。

create or replace function public.leo_add_kesseki(p_day date, p_child text, p_contact date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  label text := '欠席（欠席時対応加算）';
  nm text := btrim(coalesce(p_child, ''));
  contact date := coalesce(p_contact, p_day);
begin
  if not public.leo_record_allowed() then
    raise exception 'レオ職員のみ';
  end if;
  if p_day is null or nm = '' then
    raise exception '日付と児童名が必要です';
  end if;
  if contact is null or contact > p_day then
    raise exception '連絡日は利用日より後にはできません';
  end if;

  insert into public.leo_events (day, kind, child, title, note, source, updated_at)
  values (
    p_day,
    '休み',
    nm,
    label,
    '連絡日:' || to_char(contact, 'YYYY-MM-DD') || chr(10) || '区分:' || label,
    'portal',
    now()
  );

  perform public.leo_record_day(p_day);

  -- 活動を手入力した行は予定の写しが種別を変えない。日誌で欠席にしたときは欠席にする。
  update public.leo_nikki n
     set kind = '欠席',
         start_time = null,
         end_time = null,
         seed = coalesce(n.seed, 'events')
   where n.day = p_day
     and public.leo_norm(n.child) = public.leo_norm(nm);

  perform public.leo_jisseki_from_nikki(p_day);

  return jsonb_build_object('day', p_day, 'child', nm, 'contact', contact);
end $$;

revoke all on function public.leo_add_kesseki(date, text, date) from public, anon;
grant execute on function public.leo_add_kesseki(date, text, date) to authenticated, service_role;

-- 加算対応をした行は、話した内容が空だと保存できない。空の行が既にあるときは制約を足さない。
do $$
begin
  if not exists (
    select 1 from public.leo_day_flags
     where absent_support
       and char_length(btrim(coalesce(absent_note, ''))) = 0
  ) then
    alter table public.leo_day_flags drop constraint if exists leo_day_flags_absent_note_required;
    alter table public.leo_day_flags
      add constraint leo_day_flags_absent_note_required
      check (not absent_support or char_length(btrim(coalesce(absent_note, ''))) > 0);
  end if;
end $$;
