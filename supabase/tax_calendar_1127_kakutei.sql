-- 税カレンダー：会長確定（2026-11-27、総務経由）の反映。再実行可。
-- 1) 給与支給日は毎月15日（確定） 2) インボイス登録なし（確定） 3) 年末調整・法定調書などの担当は会長（齊藤連）
-- 4) 堤会計の引き継ぎ関連3行（id 10・11・17）は不要。行は消さず not_needed=true・remind_date=NULL・備考の先頭に印。
--    戻すときは not_needed=false にして remind_date を入れ直す（#taxcal の「直す」でもできる）。「済」にはしない。
alter table public.tax_calendar add column if not exists not_needed boolean not null default false;

-- 1) 給与支給日
update public.tax_calendar set detail = replace(detail, '給与支給日は15日頃（要確認）', '給与支給日は毎月15日（確定）'), updated_at = now()
 where detail like '%給与支給日は15日頃（要確認）%';
-- 2) インボイス
update public.tax_calendar set detail = replace(detail, 'インボイス登録の有無は要確認（シート原文）', 'インボイス登録なし（確定）'), updated_at = now()
 where detail like '%インボイス登録の有無は要確認%';
-- 3) 担当は会長
update public.tax_calendar set assignee = '齊藤連（会長）', updated_at = now()
 where id in (4, 6, 13, 14, 15, 20) and assignee is distinct from '齊藤連（会長）';
update public.tax_calendar set detail = replace(detail,
    '2026年分の計算・精算の実施者は要確認（ポータルtax_calendar上の担当は「Grok Bot（準備）＋齊藤連」）。',
    '2026年分の計算・精算の担当は会長（齊藤連）（2026-11-27 会長確定）。'), updated_at = now()
 where id = 6 and detail like '%実施者は要確認%';
update public.tax_calendar set detail = replace(detail, '契約終了後の実施者は要確認。', '担当は会長（齊藤連）（2026-11-27 会長確定）。'), updated_at = now()
 where id = 13 and detail like '%契約終了後の実施者は要確認。%';
update public.tax_calendar set detail = replace(detail, '実施者は要確認。', '担当は会長（齊藤連）（2026-11-27 会長確定）。'), updated_at = now()
 where id in (14, 15, 20) and detail like '%実施者は要確認。%';
-- 4) 不要の3行
update public.tax_calendar set not_needed = true, remind_date = null,
       note = case when coalesce(note, '') like '不要（2026-11-27 会長確定）%' then note else '不要（2026-11-27 会長確定）' || coalesce(nullif(note, ''), '') end,
       updated_at = now()
 where id in (10, 11, 17);

-- 不要の行には依頼を作らない（remind_date が NULL でも念のため）
create or replace function public.taxcal_remind(p_today date default (now() at time zone 'Asia/Tokyo')::date)
returns int language plpgsql security definer set search_path = public as $$
declare
  chair uuid; chair_office text; r public.tax_calendar; k text; tid bigint; n int := 0;
begin
  perform pg_advisory_xact_lock(hashtext('taxcal_remind'));
  begin
    perform public.taxcal_ensure_monthly(p_today);
  exception when others then
    insert into public.tax_calendar_log (kind, msg) values ('error', '毎月分の追加に失敗：' || sqlerrm);
  end;
  select user_id, office into chair, chair_office from public.staff_profiles where is_chair and active order by user_id limit 1;
  if chair is null then
    insert into public.tax_calendar_log (kind, msg) values ('error', '会長（is_chair）が見つからないため依頼を作れませんでした');
    return 0;
  end if;
  for r in select * from public.tax_calendar
            where not done and not not_needed and remind_date is not null and remind_date <= p_today
              and due_date >= p_today - 60          -- 期限切れ60日まで拾う
              and todo_id is null
            order by due_date, id loop
    begin
      k := 'taxcal:' || r.id;
      select id into tid from public.staff_todo where source_key = k order by id limit 1;
      if tid is null then
        insert into public.staff_todo (assignee, title, status, due, note, created_by, link, office, source_key)
        values (chair, public.taxcal_todo_title(r), 'open', r.due_date, public.taxcal_todo_note(r), null,
                '#taxcal/' || r.id, coalesce(chair_office, 'レオ'), k)
        on conflict do nothing
        returning id into tid;
        if tid is null then select id into tid from public.staff_todo where source_key = k order by id limit 1;
        else n := n + 1; end if;
      end if;
      update public.tax_calendar set todo_id = tid where id = r.id and todo_id is null;
    exception when others then
      insert into public.tax_calendar_log (kind, msg) values ('error', '依頼の作成に失敗（税カレンダー ' || r.id || '）：' || sqlerrm);
    end;
  end loop;
  if n > 0 then insert into public.tax_calendar_log (kind, msg) values ('info', '会長の「私への依頼」を ' || n || ' 件作成（' || p_today || '）'); end if;
  return n;
end $$;
revoke all on function public.taxcal_remind(date) from public, anon, authenticated;
