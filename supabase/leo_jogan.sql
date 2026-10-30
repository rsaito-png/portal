-- レオ 利用者負担上限額管理（#leo/jogan）
-- 上限額管理がある児童だけ。無償化・レオのみ利用・不要は入れない。
-- 区分は「レオが管理」（レオが上限額管理事業所）と「他所が管理」（相手が上限額管理事業所）。
-- どちらの区分も、相手へ送るのはその月の利用金額（総費用額）。ポータルはメール下書きまで（送信しない）。
--
-- 適用（マージ後、Supabase の SQL Editor にこのファイルを貼って Run。再実行できる）
-- 1. このファイルを最後まで実行する（表・RLS・対象児童の初期行）
-- 2. 職員ポータルを開き、事務（soumu）または児発管・管理者で #leo/jogan を開く
-- 3. 対象児童が出て、総費用額を保存できれば適用できている
-- 退所などで外すときは active を false にする（画面の一覧から消える。金額の履歴は残る）
--   update public.leo_jogan_master set active = false where child = '児童名';
-- 再実行しても、すでに入っている相手メールが空の行は、後から入れたメールを消さない。

create table if not exists public.leo_jogan_master (
  child text primary key check (char_length(child) between 1 and 100),
  side text not null check (side in ('レオが管理', '他所が管理')),
  partner_name text not null check (char_length(partner_name) between 1 and 200),
  partner_email text check (partner_email is null or partner_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  active boolean not null default true,
  sort_no int not null default 0
);
create table if not exists public.leo_jogan_amount (
  ym text not null check (ym ~ '^\d{4}-\d{2}$'),
  child text not null references public.leo_jogan_master (child) on update cascade,
  total_yen int not null check (total_yen between 0 and 99999999),
  burden_yen int check (burden_yen is null or burden_yen between 0 and 99999999),
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (ym, child)
);

alter table public.leo_jogan_master enable row level security;
alter table public.leo_jogan_amount enable row level security;
drop policy if exists jogan_master_all on public.leo_jogan_master;
create policy jogan_master_all on public.leo_jogan_master for all to authenticated
  using (public.can_manage()) with check (public.can_manage());
drop policy if exists jogan_amount_all on public.leo_jogan_amount;
create policy jogan_amount_all on public.leo_jogan_amount for all to authenticated
  using (public.can_manage()) with check (public.can_manage());

revoke all on public.leo_jogan_master from anon;
revoke all on public.leo_jogan_amount from anon;
grant select, insert, update, delete on public.leo_jogan_master to authenticated;
grant select, insert, update, delete on public.leo_jogan_amount to authenticated;

-- 更新者はログイン職員。クライアントから渡した uuid では上書きしない。
create or replace function public.leo_jogan_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  if auth.uid() is not null then
    new.updated_by := auth.uid();
  end if;
  return new;
end $$;
drop trigger if exists leo_jogan_amount_touch on public.leo_jogan_amount;
create trigger leo_jogan_amount_touch
  before insert or update on public.leo_jogan_amount
  for each row execute function public.leo_jogan_touch();

-- 2026-10 時点で有効、かつ上限額管理がある児童。メール未確認は null（画面では送信不可）。
insert into public.leo_jogan_master (sort_no, child, side, partner_name, partner_email) values
  (1, '市川碧音', '他所が管理', 'あけぼの学園', 'akebonogakuen@city.yokkaichi.mie.jp'),
  (2, '大森愛子', 'レオが管理', 'ここから未来へ四日市校', 'yokkaichi@kokomira.biz'),
  (3, '西山琴', 'レオが管理', 'ひまわりキッズ', 'himawarikids@siencenter.sakura.ne.jp'),
  (4, '日置大智', 'レオが管理', 'あけぼの学園', 'akebonogakuen@city.yokkaichi.mie.jp'),
  (5, '山根一輝', 'レオが管理', 'ここから未来へ四日市校', 'yokkaichi@kokomira.biz'),
  (6, '裏川遥大', 'レオが管理', 'さくら四日市・ウィズユー', null),
  (7, '谷口惺太朗', '他所が管理', 'あいぷろ', 'i-project@sf.commufa.jp'),
  (8, '増田匠杜', '他所が管理', 'キディあかつき', 'kiddyakatsuki@gmail.com')
on conflict (child) do update set
  sort_no = excluded.sort_no,
  side = excluded.side,
  partner_name = excluded.partner_name,
  partner_email = coalesce(excluded.partner_email, leo_jogan_master.partner_email);
