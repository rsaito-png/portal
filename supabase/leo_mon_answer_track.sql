-- ポータルの保護者アンケートに回答が届いたら、進み具合の表（leo_plan_track）のアンケート回答日を自動で入れる
create or replace function public.leo_mon_answer_track() returns trigger language plpgsql security definer set search_path=public as $$
begin
  update leo_plan_track t set survey_answered_at = coalesce(t.survey_answered_at, (now() at time zone 'Asia/Tokyo')::date)
   from leo_mon_links l where l.token = new.token and replace(t.child,'　',' ') = replace(l.child,'　',' ');
  return new;
end $$;
drop trigger if exists leo_mon_answer_track_t on public.leo_mon_answers;
create trigger leo_mon_answer_track_t after insert on public.leo_mon_answers for each row execute function public.leo_mon_answer_track();
-- これまでに届いた分も反映
update leo_plan_track t set survey_answered_at = (a.submitted_at at time zone 'Asia/Tokyo')::date
  from leo_mon_answers a join leo_mon_links l on l.token = a.token
 where replace(t.child,'　',' ') = replace(l.child,'　',' ') and t.survey_answered_at is null
   and a.submitted_at >= (t.period_to - interval '2 months');
