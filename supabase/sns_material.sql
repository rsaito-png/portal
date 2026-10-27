-- SNS投稿素材：職員が写真とひとことメモを入稿 → X自動投稿ボットが下書き → 会長OK後にBuffer投稿。
-- 写真は非公開バケット sns-material（公開用 sns-public とは別）。パスは <user_id>/<uuid>.<ext>
create extension if not exists pg_net;
create table if not exists public.sns_office (name text primary key, sort int not null default 100, active boolean not null default true);
insert into public.sns_office (name, sort) values ('レオ',10),('茶夢',20),('梁山泊',30),('その他',90) on conflict do nothing;
alter table public.sns_office enable row level security;
drop policy if exists so_sel on public.sns_office;
create policy so_sel on public.sns_office for select to authenticated using (true);
revoke all on public.sns_office from anon, authenticated; grant select on public.sns_office to authenticated;

create table if not exists public.sns_material (
  id bigint generated always as identity primary key,
  office text not null references public.sns_office(name) on update cascade,
  purpose text not null check (purpose in ('Instagram','Googleマップ')),
  photos text[] not null default '{}',
  memo text, shot_on date,
  user_id uuid not null default auth.uid() references auth.users(id),
  poster_email text default (auth.jwt()->>'email'),
  status text not null default '未使用' check (status in ('未使用','下書き済み','投稿済み','見送り')),
  created_at timestamptz not null default now());
alter table public.sns_material enable row level security;
drop policy if exists sm_sel on public.sns_material; drop policy if exists sm_ins on public.sns_material; drop policy if exists sm_upd on public.sns_material;
create policy sm_sel on public.sns_material for select to authenticated using (user_id=auth.uid() or public.is_chair());
create policy sm_ins on public.sns_material for insert to authenticated with check (user_id=auth.uid());
create policy sm_upd on public.sns_material for update to authenticated using (public.is_chair()) with check (public.is_chair());
revoke all on public.sns_material from anon, authenticated;
grant select on public.sns_material to authenticated;
grant insert (office, purpose, photos, memo, shot_on) on public.sns_material to authenticated;
grant update (status) on public.sns_material to authenticated;
grant all on public.sns_material, public.sns_office to service_role;

insert into storage.buckets (id, name, public) values ('sns-material','sns-material', false) on conflict (id) do nothing;
drop policy if exists sns_mat_ins on storage.objects; drop policy if exists sns_mat_sel on storage.objects;
create policy sns_mat_ins on storage.objects for insert to authenticated with check (bucket_id='sns-material' and (storage.foldername(name))[1]=auth.uid()::text);
create policy sns_mat_sel on storage.objects for select to authenticated using (bucket_id='sns-material' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_chair()));

-- Webhook：private_config.sns_material_webhook_url が空/未設定なら何もしない（sns_material_webhook_secret は任意）
create table if not exists private_config (k text primary key, v text not null);
create or replace function public.sns_material_kick() returns trigger language plpgsql security definer set search_path=public, extensions as $$
declare u text; s text;
begin
  select v into u from private_config where k='sns_material_webhook_url';
  if coalesce(trim(u),'')='' then return new; end if;
  select v into s from private_config where k='sns_material_webhook_secret';
  begin
    perform net.http_post(url := u,
      headers := jsonb_build_object('Content-Type','application/json','x-sns-secret',coalesce(s,'')),
      body := jsonb_build_object('id',new.id,'office',new.office,'purpose',new.purpose,'memo',new.memo,'shot_on',new.shot_on,'bucket','sns-material','photos',to_jsonb(new.photos)),
      timeout_milliseconds := 10000);
  exception when others then null; end;
  return new;
end $$;
drop trigger if exists sns_material_kick on public.sns_material;
create trigger sns_material_kick after insert on public.sns_material for each row execute function public.sns_material_kick();

-- 茶夢・梁山泊はGoogleマップ掲載なし（Instagramのみ）
alter table public.sns_material drop constraint if exists sns_material_chamu_no_gmap;
alter table public.sns_material add constraint sns_material_chamu_no_gmap check (not (office='茶夢' and purpose='Googleマップ'));
alter table public.sns_material drop constraint if exists sns_material_ryozan_no_gmap;
alter table public.sns_material add constraint sns_material_ryozan_no_gmap check (not (office='梁山泊' and purpose='Googleマップ'));

-- 職員会議（文字起こし）の入稿（原文は個人情報：本人と会長のみ閲覧。RLSは既存 sm_sel のまま）
alter table public.sns_material add column if not exists kind text not null default '写真';
alter table public.sns_material add column if not exists transcript text;
alter table public.sns_material drop constraint if exists sns_material_kind_chk;
alter table public.sns_material add constraint sns_material_kind_chk check (kind in ('写真','職員会議（文字起こし）'));
alter table public.sns_material drop constraint if exists sns_material_transcript_chk;
alter table public.sns_material add constraint sns_material_transcript_chk check (
  (kind='写真' and transcript is null) or
  (kind='職員会議（文字起こし）' and length(trim(coalesce(transcript,'')))>0 and length(transcript)<=200000));
grant insert (kind, transcript) on public.sns_material to authenticated;
create or replace function public.sns_material_kick() returns trigger language plpgsql security definer set search_path=public, extensions as $$
declare u text; s text;
begin
  select v into u from private_config where k='sns_material_webhook_url';
  if coalesce(trim(u),'')='' then return new; end if;
  select v into s from private_config where k='sns_material_webhook_secret';
  begin
    perform net.http_post(url := u,
      headers := jsonb_build_object('Content-Type','application/json','x-sns-secret',coalesce(s,'')),
      body := jsonb_build_object('id',new.id,'kind',new.kind,'office',new.office,'purpose',new.purpose,'memo',new.memo,'shot_on',new.shot_on,'bucket','sns-material','photos',to_jsonb(new.photos),'transcript',new.transcript),
      timeout_milliseconds := 10000);
  exception when others then null; end;
  return new;
end $$;
