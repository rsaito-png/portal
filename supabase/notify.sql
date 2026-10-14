-- ポータルの出来事を Google Chat（受付窓口アプリのDM）へ知らせるための待ち行列
alter table staff_profiles add column if not exists chat_dm_space text;   -- 受付窓口アプリとのDM（spaces/xxx）。話しかけると自動登録
create table if not exists chat_dm_unknown (                               -- 職員表に無い人が話しかけてきた時の控え
  chat_user text primary key, email text, display_name text, space text, seen_at timestamptz default now());
create table if not exists notify_queue (
  id bigserial primary key,
  office text not null default 'レオ',
  audience text not null check (audience in ('all', 'mgr')),   -- all＝その事業所の職員全員 / mgr＝管理者・児発管
  kind text not null,
  text text not null,          -- 本文（詳細は書かない）
  link text,                   -- ポータルの該当ページ
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  result jsonb,
  test_only text               -- テスト用：この chat_user だけに送る
);
alter table notify_queue enable row level security;     -- 画面からは読めない（関数だけが使う）
alter table chat_dm_unknown enable row level security;

create or replace function public.notify_enqueue(p_aud text, p_kind text, p_text text, p_link text, p_office text default 'レオ')
returns void language sql security definer set search_path = public as $$
  insert into notify_queue (office, audience, kind, text, link) values (p_office, p_aud, p_kind, p_text, p_link);
$$;
revoke all on function public.notify_enqueue(text, text, text, text, text) from public, anon, authenticated;

-- ① ヒヤリハットの新規報告 → 職員全員
create or replace function public.trg_notify_hiyari() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform notify_enqueue('all', 'ヒヤリハット',
    '⚠️ ヒヤリハットの新しい報告があります（' || to_char(coalesce(new.occurred_at, now()) at time zone 'Asia/Tokyo', 'MM/DD') ||
    coalesce('・' || nullif(new.place, ''), '') || '）。ポータルで読んでください。',
    'https://rsaito-png.github.io/portal/#leo/hiyari', coalesce(new.office, 'レオ'));
  return new;
end $$;
drop trigger if exists notify_hiyari on hiyari;
create trigger notify_hiyari after insert on hiyari for each row execute function trg_notify_hiyari();

-- ② 保護者の回答 → 管理者・児発管（児童名まで。中身はリンク先で）
create or replace function public.trg_notify_mon() returns trigger language plpgsql security definer set search_path = public as $$
declare c text; t text;
begin
  select child, term into c, t from leo_mon_links where token = new.token;
  perform notify_enqueue('mgr', 'アンケート回答', '📝 ' || coalesce(c, '') || 'さんの保護者から、モニタリングアンケート（' || coalesce(t, '') || '）の回答が届きました。',
    'https://rsaito-png.github.io/portal/#leo/plan');
  return new;
end $$;
drop trigger if exists notify_mon on leo_mon_answers;
create trigger notify_mon after insert on leo_mon_answers for each row execute function trg_notify_mon();

create or replace function public.trg_notify_doui() returns trigger language plpgsql security definer set search_path = public as $$
declare c text; n int; d text;
begin
  select p.child, p.term_no, l.doc into c, n, d from leo_plan_consent_links l join leo_plans p on p.id = l.plan_id where l.token = new.token;
  perform notify_enqueue('mgr', '同意', '✅ ' || coalesce(c, '') || 'さんの保護者から、第' || coalesce(n::text, '') || '期 ' || coalesce(d, '') || 'への同意が届きました。',
    'https://rsaito-png.github.io/portal/#leo/plan');
  return new;
end $$;
drop trigger if exists notify_doui on leo_plan_consents;
create trigger notify_doui after insert on leo_plan_consents for each row execute function trg_notify_doui();

create or replace function public.trg_notify_kakunin() returns trigger language plpgsql security definer set search_path = public as $$
declare c text; m text;
begin
  select child, month::text into c, m from leo_confirm_links where token = new.token;
  perform notify_enqueue('mgr', '実績確認', '🖊️ ' || coalesce(c, '') || 'さんの保護者から、実績の確認（' || coalesce(m, '') || '）の回答が届きました。',
    'https://rsaito-png.github.io/portal/#leo/kakunin');
  return new;
end $$;
drop trigger if exists notify_kakunin on leo_confirmations;
create trigger notify_kakunin after insert on leo_confirmations for each row execute function trg_notify_kakunin();
