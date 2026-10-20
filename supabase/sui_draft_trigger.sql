-- 水晶玉：sui_request に「待ち」が入ると Edge Function sui-draft を非同期に呼ぶ。
-- service_role キーは vault の 'sui_service_key'（リポジトリには置かない。投入: select vault.create_secret('<key>','sui_service_key')）
create extension if not exists pg_net;
alter table public.sui_request add column if not exists error text;  -- 生成失敗の内容（成功時は null）
create or replace function public.trg_sui_request_fire() returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare k text;
begin
  select decrypted_secret into k from vault.decrypted_secrets where name = 'sui_service_key' limit 1;
  if k is null then
    update public.sui_request set error = 'vaultにsui_service_keyがありません' where id = new.id; return new; end if;
  perform net.http_post(url := 'https://zvrardoyxocmqhvyddnf.supabase.co/functions/v1/sui-draft',
    headers := jsonb_build_object('content-type','application/json','authorization','Bearer ' || k),
    body := jsonb_build_object('id', new.id), timeout_milliseconds := 5000);
  return new;
end $$;
revoke all on function public.trg_sui_request_fire() from public, anon, authenticated;
drop trigger if exists sui_request_fire on public.sui_request;
create trigger sui_request_fire after insert on public.sui_request for each row when (new.status = '待ち') execute function public.trg_sui_request_fire();
