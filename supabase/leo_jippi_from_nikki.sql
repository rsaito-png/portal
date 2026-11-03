-- 今日の日誌（leo_meal_record）の食事・おやつを、実費の日別（leo_jippi_day）と月合計（leo_jippi のお昼代・おやつ代）に反映する。2026-11-03
-- 昼食代は 1回 300円（下の leo_jippi_lunch_unit だけを変える）。おやつ代は snack が「あり」のときの snack_yen。
-- 変える列は leo_jippi_day の lunch/snack と、leo_jippi の lunch/snack だけ。
--   触らない：burden（利用料）、pay_link、pay_link_amount、sent、sent_at、sent_by、guardian、note。
-- 同じ日・同じ児童は上書き（行は増えない）。両方 0円ならその日の明細は消す。月の行は残し、合計だけ 0 にする。
-- 前提：leo_jippi.sql、leo_jippi_day.sql、leo_meal_snack_yen.sql（snack_yen 列）。再実行できる。
-- 権限（RLS）は変えない。日誌はレオの職員が書けるが、実費の表は児発管だけなので、反映は SECURITY DEFINER の関数だけが書く。
-- 戻すとき：supabase/leo_jippi_from_nikki_rollback.sql（入った金額は戻さない）
--
-- 注意：月の lunch/snack は、その月の leo_jippi_day の合計で置き換わる。
-- シート取り込みだけが月の金額に入っていて日別が無い児童は、日誌を保存したあと合計がその日の分だけになる。
-- 金額が変わると、作ってある Square の支払いリンクは古いまま。実費画面で作り直す（リンクは自動では消さない・無効化しない）。

-- 昼食代（1回、円）。変えるときはこの関数だけ。
create or replace function public.leo_jippi_lunch_unit() returns integer
language sql immutable parallel safe as $$ select 300 $$;

-- 1日1人分を日誌から日別へ書き、その月の合計を leo_jippi に写す。直接は呼ばない（トリガーと、下の任意の埋め直しだけ）。
create or replace function public.leo_jippi_sync_meal(p_day date, p_child text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_lunch integer := 0;
  v_snack integer := 0;
  v_ym text;
  v_sum_lunch integer := 0;
  v_sum_snack integer := 0;
  v_found boolean := false;
begin
  if p_day is null or coalesce(btrim(p_child), '') = '' then return; end if;
  v_ym := to_char(p_day, 'YYYY-MM');
  select
    case when m.meal = 'あり' then public.leo_jippi_lunch_unit() else 0 end,
    case when m.snack = 'あり' then coalesce(m.snack_yen, 0) else 0 end
    into v_lunch, v_snack
    from public.leo_meal_record m
   where m.day = p_day and m.child = p_child;
  v_found := found;
  if not v_found or (coalesce(v_lunch, 0) = 0 and coalesce(v_snack, 0) = 0) then
    delete from public.leo_jippi_day d where d.day = p_day and d.child = p_child;
  else
    insert into public.leo_jippi_day as d (day, child, ym, lunch, snack, imported_at)
    values (p_day, p_child, v_ym, v_lunch, v_snack, now())
    on conflict (day, child) do update
      set ym = excluded.ym, lunch = excluded.lunch, snack = excluded.snack, imported_at = now();
  end if;
  select coalesce(sum(d.lunch), 0)::integer, coalesce(sum(d.snack), 0)::integer
    into v_sum_lunch, v_sum_snack
    from public.leo_jippi_day d
   where d.ym = v_ym and d.child = p_child;
  if v_sum_lunch = 0 and v_sum_snack = 0 then
    update public.leo_jippi j
       set lunch = 0, snack = 0, imported_at = now()
     where j.ym = v_ym and j.child = p_child;
  else
    insert into public.leo_jippi as j (ym, child, lunch, snack)
    values (v_ym, p_child, v_sum_lunch, v_sum_snack)
    on conflict (ym, child) do update
      set lunch = excluded.lunch, snack = excluded.snack, imported_at = now();
  end if;
end $$;

create or replace function public.leo_jippi_meal_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if old.day is distinct from new.day or old.child is distinct from new.child then
      perform public.leo_jippi_sync_meal(old.day, old.child);
    end if;
    perform public.leo_jippi_sync_meal(new.day, new.child);
    return new;
  elsif tg_op = 'DELETE' then
    perform public.leo_jippi_sync_meal(old.day, old.child);
    return old;
  else
    perform public.leo_jippi_sync_meal(new.day, new.child);
    return new;
  end if;
end $$;

drop trigger if exists leo_meal_record_jippi on public.leo_meal_record;
create trigger leo_meal_record_jippi
  after insert or update or delete on public.leo_meal_record
  for each row execute function public.leo_jippi_meal_trg();

revoke all on function public.leo_jippi_lunch_unit() from public;
revoke all on function public.leo_jippi_sync_meal(date, text) from public, anon, authenticated;
revoke all on function public.leo_jippi_meal_trg() from public, anon, authenticated;
-- 画面から直接は呼ばせない。トリガー（関数の所有者）だけが書く。

comment on function public.leo_jippi_lunch_unit() is '昼食代（1回、円）。今日の日誌で食事が「あり」の日に使う。変えるときはこの関数だけ。';
comment on column public.leo_meal_record.snack_yen is 'おやつ提供が「あり」のときの金額（円、0以上の整数）。なしのときは空。保存すると leo_jippi_day と leo_jippi のおやつ代にたまる。利用料（burden）や支払いリンクには入れない。';

-- ===== 任意：今月の日誌から日別と月合計を入れ直す =====
-- 必要なときだけ、下のコメントを外して、このファイルの関数を作ったあとに実行する。
-- 今月は日本時間。leo_meal_record にある日だけ上書きする。日誌に無い日（以前シートから入れた日）は残る。
-- 月の lunch/snack は、残った日別の合計になる。burden・支払いリンク・送信済み・保護者名・メモは変えない。
--
-- do $$
-- declare r record;
--   v_from date := date_trunc('month', (now() at time zone 'Asia/Tokyo'))::date;
--   v_to date := (v_from + interval '1 month')::date;
-- begin
--   for r in
--     select m.day, m.child from public.leo_meal_record m
--      where m.day >= v_from and m.day < v_to
--   loop
--     perform public.leo_jippi_sync_meal(r.day, r.child);
--   end loop;
-- end $$;
