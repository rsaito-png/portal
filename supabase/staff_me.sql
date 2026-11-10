-- 給与口座・マイナンバー（#me）。口座と本人の個人番号。既存データは変更しない。何度実行しても同じ。
-- RLS（全表共通）: 本人は自分の行のみ SELECT/INSERT/UPDATE。事務は my_role()='事務'、会長は is_chair() で SELECT のみ。
-- staff_admin_can() や職責「管理者」には見せない。anon 不可。DELETE なし。
-- 年末調整の申告はフリーウェイで行う。旧の年末調整用テーブルと添付バケットの削除は staff_me_drop_ye.sql。

create or replace function public.staff_my_number_valid(p text)
returns boolean
language sql
immutable
as $$
  select
    coalesce(p, '') ~ '^[0-9]{12}$'
    and (
      case
        when (
          substr(p,1,1)::int*2 + substr(p,2,1)::int*3 + substr(p,3,1)::int*4 +
          substr(p,4,1)::int*5 + substr(p,5,1)::int*6 + substr(p,6,1)::int*7 +
          substr(p,7,1)::int*2 + substr(p,8,1)::int*3 + substr(p,9,1)::int*4 +
          substr(p,10,1)::int*5 + substr(p,11,1)::int*6
        ) % 11 <= 1 then 0
        else 11 - (
          (
            substr(p,1,1)::int*2 + substr(p,2,1)::int*3 + substr(p,3,1)::int*4 +
            substr(p,4,1)::int*5 + substr(p,5,1)::int*6 + substr(p,6,1)::int*7 +
            substr(p,7,1)::int*2 + substr(p,8,1)::int*3 + substr(p,9,1)::int*4 +
            substr(p,10,1)::int*5 + substr(p,11,1)::int*6
          ) % 11
        )
      end
    ) = substr(p,12,1)::int;
$$;
revoke all on function public.staff_my_number_valid(text) from public, anon;

create or replace function public.staff_me_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
revoke all on function public.staff_me_set_updated_at() from public, anon;

-- ① 給与振込口座
create table if not exists public.staff_bank_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  bank_name text not null,
  branch_name text not null,
  account_type text not null check (account_type in ('普通', '当座')),
  account_number text not null,
  account_holder_kana text not null,
  updated_at timestamptz not null default now(),
  constraint staff_bank_accounts_bank_name_len check (char_length(btrim(bank_name)) between 1 and 40),
  constraint staff_bank_accounts_branch_name_len check (char_length(btrim(branch_name)) between 1 and 40),
  constraint staff_bank_accounts_number_digits check (account_number ~ '^[0-9]{4,16}$'),
  constraint staff_bank_accounts_kana check (account_holder_kana ~ '^[ァ-ヶー・　 ]+$' and char_length(btrim(account_holder_kana)) between 1 and 40)
);
comment on table public.staff_bank_accounts is '職員の給与振込口座。本人が登録し、事務と会長だけが閲覧できる。';

create or replace function public.staff_bank_accounts_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.bank_name := btrim(new.bank_name);
  new.branch_name := btrim(new.branch_name);
  new.account_number := regexp_replace(coalesce(new.account_number, ''), '[^0-9]', '', 'g');
  new.account_holder_kana := btrim(new.account_holder_kana);
  return new;
end $$;
revoke all on function public.staff_bank_accounts_touch() from public, anon;
drop trigger if exists staff_bank_accounts_touch on public.staff_bank_accounts;
create trigger staff_bank_accounts_touch before insert or update on public.staff_bank_accounts
  for each row execute function public.staff_bank_accounts_touch();

alter table public.staff_bank_accounts enable row level security;
alter table public.staff_bank_accounts force row level security;
revoke all on public.staff_bank_accounts from public, anon;
grant select, insert, update on public.staff_bank_accounts to authenticated;
revoke delete on public.staff_bank_accounts from authenticated, public, anon;

drop policy if exists sba_self_sel on public.staff_bank_accounts;
create policy sba_self_sel on public.staff_bank_accounts for select to authenticated using (user_id = auth.uid());
drop policy if exists sba_clerk_sel on public.staff_bank_accounts;
create policy sba_clerk_sel on public.staff_bank_accounts for select to authenticated using (public.my_role() = '事務');
drop policy if exists sba_chair_sel on public.staff_bank_accounts;
create policy sba_chair_sel on public.staff_bank_accounts for select to authenticated using (public.is_chair());
drop policy if exists sba_self_ins on public.staff_bank_accounts;
create policy sba_self_ins on public.staff_bank_accounts for insert to authenticated with check (user_id = auth.uid());
drop policy if exists sba_self_upd on public.staff_bank_accounts;
create policy sba_self_upd on public.staff_bank_accounts for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ② 本人の個人番号
create table if not exists public.staff_my_numbers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  my_number text not null,
  purpose_ack boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint staff_my_numbers_valid check (public.staff_my_number_valid(my_number)),
  constraint staff_my_numbers_ack check (purpose_ack = true)
);
comment on table public.staff_my_numbers is '職員本人の個人番号。本人が登録し、事務と会長だけが閲覧できる。利用目的の同意必須。';

create or replace function public.staff_my_numbers_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.my_number := regexp_replace(coalesce(new.my_number, ''), '[^0-9]', '', 'g');
  return new;
end $$;
revoke all on function public.staff_my_numbers_touch() from public, anon;
drop trigger if exists staff_my_numbers_touch on public.staff_my_numbers;
create trigger staff_my_numbers_touch before insert or update on public.staff_my_numbers
  for each row execute function public.staff_my_numbers_touch();

alter table public.staff_my_numbers enable row level security;
alter table public.staff_my_numbers force row level security;
revoke all on public.staff_my_numbers from public, anon;
grant select, insert, update on public.staff_my_numbers to authenticated;
revoke delete on public.staff_my_numbers from authenticated, public, anon;

drop policy if exists smn_self_sel on public.staff_my_numbers;
create policy smn_self_sel on public.staff_my_numbers for select to authenticated using (user_id = auth.uid());
drop policy if exists smn_clerk_sel on public.staff_my_numbers;
create policy smn_clerk_sel on public.staff_my_numbers for select to authenticated using (public.my_role() = '事務');
drop policy if exists smn_chair_sel on public.staff_my_numbers;
create policy smn_chair_sel on public.staff_my_numbers for select to authenticated using (public.is_chair());
drop policy if exists smn_self_ins on public.staff_my_numbers;
create policy smn_self_ins on public.staff_my_numbers for insert to authenticated with check (user_id = auth.uid());
drop policy if exists smn_self_upd on public.staff_my_numbers;
create policy smn_self_upd on public.staff_my_numbers for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke truncate, references, trigger on public.staff_bank_accounts, public.staff_my_numbers from authenticated, public, anon;
