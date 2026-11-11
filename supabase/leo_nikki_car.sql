-- 日誌の車：運転手から自動で入れる（齊藤・宮本＝アクア、中村友香＝フリード、それ以外＝モコ、保護者送迎・送迎なし＝—）。
-- 運転手を入れた/変えたとき、車が空のとき（カレンダー取り込み含む）に入る。手で入れた車は、運転手が変わらない限り残す。
create or replace function public.leo_car_for(p_driver text) returns text language sql immutable as $$
  select case
    when btrim(coalesce(p_driver,'')) = '' then null
    when regexp_replace(p_driver, '\s', '', 'g') ~ '保護者|送迎なし|^なし$|徒歩|自力' then '—'
    when regexp_replace(p_driver, '\s', '', 'g') ~ '齊藤|斉藤|齋藤|^連|宮本' then 'アクア'
    when regexp_replace(p_driver, '\s', '', 'g') ~ '中村友香|友香' then 'フリード'
    else 'モコ' end
$$;
create or replace function public.leo_nikki_car_fill() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.pick_driver is distinct from old.pick_driver or coalesce(new.pick_car,'') = '' then
    if tg_op = 'INSERT' and coalesce(new.pick_car,'') <> '' then null;
    else new.pick_car := public.leo_car_for(new.pick_driver); end if;
  end if;
  if tg_op = 'INSERT' or new.drop_driver is distinct from old.drop_driver or coalesce(new.drop_car,'') = '' then
    if tg_op = 'INSERT' and coalesce(new.drop_car,'') <> '' then null;
    else new.drop_car := public.leo_car_for(new.drop_driver); end if;
  end if;
  return new;
end $$;
drop trigger if exists leo_nikki_car_fill on public.leo_nikki;
create trigger leo_nikki_car_fill before insert or update on public.leo_nikki
  for each row execute function public.leo_nikki_car_fill();
-- 既存行（11月以降）の空欄を埋める
update public.leo_nikki set pick_driver = pick_driver where day >= '2026-11-01' and (coalesce(pick_car,'')='' or coalesce(drop_car,'')='');
