-- レオ「利用者情報」：児童ごとに1画面（ワンストップ）。受給者証は既存の leo_children、送迎の配慮は既存の leo_child_care を再利用。
-- ここは「連絡先・送迎・Googleフォトのアルバム」の追加分だけ。既存データには触らない（新しい表のみ）。
-- 読む：レオ職員・事務（my_office()='レオ' or can_bill()）／書く：児発管・管理者・事務（can_manage）。受給者証番号を含む leo_children は従来どおり管理側のみ。
create table if not exists public.leo_child_info (
  name text primary key,                                   -- 日誌・leo_children と同じ表記
  guardian_name text check (char_length(guardian_name) <= 100),
  guardian_phone text check (char_length(guardian_phone) <= 60),
  guardian_phone2 text check (char_length(guardian_phone2) <= 60),
  emergency_contact text check (char_length(emergency_contact) <= 200),
  home_address text check (char_length(home_address) <= 200),
  use_transport boolean not null default true,              -- 送迎あり
  pickup_place text check (char_length(pickup_place) <= 200), -- 乗る場所（迎え）
  dropoff_place text check (char_length(dropoff_place) <= 200), -- 降りる場所（送り）
  transport_mode text check (transport_mode in ('送迎あり','迎えのみ','送りのみ','保護者送迎','なし')),
  transport_days text[] not null default '{}',             -- 送迎の曜日（月〜日）
  transport_note text check (char_length(transport_note) <= 500),
  album_url text check (album_url is null or album_url ~ '^https://'), -- Googleフォト共有アルバム
  note text check (char_length(note) <= 1000),
  updated_by uuid default auth.uid(), updated_at timestamptz not null default now());
alter table public.leo_child_info enable row level security;
drop policy if exists lci_read on public.leo_child_info;
create policy lci_read on public.leo_child_info for select to authenticated using (public.my_office() = 'レオ' or public.can_bill());
drop policy if exists lci_write on public.leo_child_info;
create policy lci_write on public.leo_child_info for all to authenticated using (public.can_manage()) with check (public.can_manage());
