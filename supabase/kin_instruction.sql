-- 金斗雲「サ責からの指示」（GAS シート「サ責指示」／Code.gs v11.7）。
-- ヘルパーは訪問のたびには書かない。サ責が利用者ごと（または全員）に登録し、有効なあいだヘルパー画面は読むだけ。
-- 対象が空（target_user_id is null）＝「全員」。有効終了日が空＝継続。終了は行を消さず、終了日と ended_at を入れる。
-- 新規の訪問記録を保存するとき、その提供日に有効な指示IDを kin_visit.instruction_id に入れる（無ければ「指示なし」）。既存行の instruction_id は上書きしない。

create table if not exists public.kin_instruction (
  id text primary key check (id ~ '^SJ-[0-9]{4,}$'),
  target_user_id bigint references public.kin_user(id) on delete restrict, -- null = 全員
  start_date date,
  end_date date,
  content text not null check (char_length(content) between 1 and 2000),
  instructed_by text not null default '山川美恵子' check (char_length(instructed_by) between 1 and 60),
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  updated_by uuid default auth.uid()
);
-- 終了日が開始日より前になることがある（GASと同じ。開始前の指示を取り消すと、終了日＝開始日の前日）。
create index if not exists kin_instruction_target on public.kin_instruction(target_user_id, start_date, end_date);
alter table public.kin_instruction enable row level security;
drop policy if exists kin_instruction_rw on public.kin_instruction;
create policy kin_instruction_rw on public.kin_instruction for all to authenticated
  using (public.my_office() = '金斗雲' or public.can_manage())
  with check (public.my_office() = '金斗雲' or public.can_manage());
revoke all on public.kin_instruction from anon;
grant select, insert, update on public.kin_instruction to authenticated;

-- 確認した指示IDはカンマ区切りで複数入る（GASと同じ）。60字では足りないことがある。
do $$ declare r record; begin
  for r in select conname from pg_constraint
    where conrelid = 'public.kin_visit'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%instruction_id%'
  loop
    execute format('alter table public.kin_visit drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.kin_visit add constraint kin_visit_instruction_id_len check (instruction_id is null or char_length(instruction_id) <= 300);
