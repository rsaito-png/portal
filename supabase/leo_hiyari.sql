-- ヒヤリハット報告（事業所ごと・その事業所の全職員が見る）。項目は既存「ヒヤリハット報告書 テンプレ」を引き継ぐ。職員が報告 → 同じ事業所の職員が一覧で見る → 事務（管理者）が確認・対策を記入
create table if not exists public.hiyari (
  id bigint generated always as identity primary key,
  office text not null default public.my_office(),
  occurred_at timestamptz not null, place text, kind text not null check (kind in ('転倒・転落・つまづき','誤嚥・誤飲','誤与薬','無断外出','行方不明','暴力行為','事業所の事故（火災等）','交通事故','権利侵害','その他')),  -- 既存の報告書テンプレの種類
  service text, child_age text,
  child_label text check (length(child_label) <= 40),   -- 関わった児童（イニシャル等・任意）
  what text not null check (length(what) <= 3000), response text, cause text, prevention text,
  reported_by uuid not null default auth.uid(), reported_at timestamptz not null default now(),
  checked_by uuid, checked_at timestamptz, manager_comment text,
  status text not null default '未確認' check (status in ('未確認','確認済')));
alter table public.hiyari enable row level security;
drop policy if exists hy_read on public.hiyari;
create policy hy_read on public.hiyari for select to authenticated using (office = public.my_office() or public.my_role() = '事務');
drop policy if exists hy_insert on public.hiyari;
create policy hy_insert on public.hiyari for insert to authenticated
  with check (office = public.my_office() and reported_by = auth.uid() and status = '未確認' and checked_by is null);
drop policy if exists hy_check on public.hiyari;
create policy hy_check on public.hiyari for update to authenticated using (public.my_role() = '事務') with check (public.my_role() = '事務');
revoke update on public.hiyari from authenticated;
grant select, insert on public.hiyari to authenticated;
grant update (prevention, manager_comment, status, checked_by, checked_at) on public.hiyari to authenticated;
