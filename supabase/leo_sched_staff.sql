-- 型表の担当名 → 予定（leo_events.staff）に入れる職員名。型表から予定を作るとき（leo_sched_plan_core など）に使う。
-- 2026-11-10 会長：宮本は休職のため自動で当てない（「祥」→宮本　幸子 の読み替えをやめる）。横田はレオ職員に昇格したので、
-- 祥先生・祥・横田祥・横田　祥 は「横田　祥」。宮本〜（宮本さん・宮本　幸子）と書かれた運転は「齊藤　連」（会長「宮本で入ってる分は齊藤にして」）。
-- この関数が「宮本　幸子」を返すことは無い。
create or replace function public.leo_sched_staff(p text)
returns text
language sql
immutable
as $$
  select case
    when p like '友香%' then '中村　友香'
    when p like '文%' then '中村　文'
    when p like '祥%' or p like '横田%' then '横田　祥'
    when p like '齊藤%' or p like '連%' or p like '宮本%' then '齊藤　連'
    else nullif(p, '') end
$$;
