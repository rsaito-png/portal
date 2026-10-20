create extension if not exists pg_net;
create table if not exists private_config (k text primary key, v text not null);
alter table private_config enable row level security;
revoke all on private_config from anon, authenticated;
insert into private_config values ('leo_plan_webhook_url','(URLはDBにだけ保存)'),('leo_plan_webhook_key','(鍵はDBにだけ保存)') on conflict (k) do update set v=excluded.v;
create or replace function public.leo_mon_answer_track() returns trigger language plpgsql security definer set search_path=public, extensions as $$
declare l record;
begin
  select * into l from leo_mon_links where token = new.token;
  update leo_plan_track t set survey_answered_at = coalesce(t.survey_answered_at, (now() at time zone 'Asia/Tokyo')::date)
   where replace(t.child,'　',' ') = replace(l.child,'　',' ');
  begin
    perform net.http_post(url := (select v from private_config where k='leo_plan_webhook_url'),
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select v from private_config where k='leo_plan_webhook_key')),
      body := jsonb_build_object('event','leo_portal_monitoring_submitted','source','portal','child',l.child,'term',l.term,'answer_id',new.id,'submittedAt',now(),'answers',new.answers));
  exception when others then null; end;
  return new;
end $$;
