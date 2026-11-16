-- ヒヤリハットを事業所ごとに（レオ・金斗雲・茶夢）。2026-11-16
-- 画面：#leo/hiyari・#kintoun/hiyari・#chamu/hiyari（leo.js の HY_OFFICES）
-- 見える・書ける範囲＝所属（staff_profiles.office）か兼務（extra_offices）の事業所。事務と会長は全部見える。
create or replace function public.hy_in_office(o text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(exists (select 1 from public.staff_profiles
    where user_id = auth.uid() and active
      and (office = o or o = any(coalesce(extra_offices, '{}'::text[])))), false) $$;

drop policy if exists hy_read on public.hiyari;
create policy hy_read on public.hiyari for select using (public.hy_in_office(office) or public.my_role() = '事務' or public.is_chair());
drop policy if exists hy_insert on public.hiyari;
create policy hy_insert on public.hiyari for insert with check (public.hy_in_office(office) and reported_by = auth.uid() and status = '未確認' and checked_by is null);
drop policy if exists hy_check on public.hiyari;
create policy hy_check on public.hiyari for update using (public.can_manage() and (public.hy_in_office(office) or public.my_role() = '事務')) with check (public.can_manage());

-- Chat通知のリンクを事業所の画面へ
create or replace function public.trg_notify_hiyari() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform notify_enqueue('all', 'ヒヤリハット',
    '⚠️ ヒヤリハットの新しい報告があります（' || coalesce(new.office, 'レオ') || '・' || to_char(coalesce(new.occurred_at, now()) at time zone 'Asia/Tokyo', 'MM/DD') ||
    coalesce('・' || nullif(new.place, ''), '') || '）。ポータルで読んでください。',
    'https://rsaito-png.github.io/portal/#' || case new.office when '金斗雲' then 'kintoun' when '茶夢' then 'chamu' else 'leo' end || '/hiyari',
    coalesce(new.office, 'レオ'));
  return new;
end $$;
