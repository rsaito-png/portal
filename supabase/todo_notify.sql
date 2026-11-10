-- レオの担当者別依頼（source_key=leo:…）と法定研修の依頼（ht:…）はChatに出さない。ポータルの私への依頼だけ
-- 指示（staff_todo）を出したら職員全員用チャットスペースへ知らせる（名前だけ。内容はポータルで）。夜間(22-6時)は notify-chat が6時以降に送る
create or replace function public.trg_notify_todo() returns trigger language plpgsql security definer set search_path = public as $$
declare n text;
begin
  if new.source_key is not null and (new.source_key like 'leo:%' or new.source_key like 'ht:%') then
    return new;
  end if;
  select coalesce(nullif(full_name,''), nikki_name, '') into n from staff_profiles where user_id = new.assignee;
  perform notify_enqueue('all', '指示', '📌 ' || coalesce(nullif(n,''), 'ご担当') || 'さんに新しい指示があります。ポータルの「私への依頼」で確認してください。', 'https://rsaito-png.github.io/portal/#report', 'レオ');
  return new;
end $$;
drop trigger if exists notify_todo on staff_todo;
create trigger notify_todo after insert on staff_todo for each row execute function trg_notify_todo();
