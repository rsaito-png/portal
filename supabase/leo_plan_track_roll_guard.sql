-- 個別支援計画の繰り越しが、本案の同意より先に走らないようにする。
-- このファイルは関数を置き換えるだけです。児童の行（期・次期開始日・回答日）は変えません。
-- 日付が過ぎただけでは期を進めません（そのような処理はもともとありません）。

-- 計画書の「計画書作成＝済」や原案の同意を保存したとき、その計画書に前から入っていた本案の同意日時まで管理表へ写さない。
-- 本案の同意日時は、今回の更新で変わったときだけ写す（新しく入ったとき、または取り消されて空になったとき）。
-- 管理表の期は「いま作っている期（現在の期+1）」の計画書に限る。
create or replace function public.leo_track_sync() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update leo_plan_track t set
    plan_made = new.plan_made,
    genan_consent_at = new.genan_consent_at,
    honan_consent_at = case
      when old.honan_consent_at is distinct from new.honan_consent_at then new.honan_consent_at
      else t.honan_consent_at
    end
  where replace(replace(t.child, '　', ''), ' ', '') = replace(replace(new.child, '　', ''), ' ', '')
    and t.term_no = new.term_no - 1;
  return new;
end $$;

-- 本案の同意で次期へ繰り越す。フラグOFFの間は何もしない（11/1までは管理表のGASが繰り越す想定）。
-- フラグONでも、いま作っている期の計画書に、今回の同意日時が一致するときだけ進める。
-- 一致しない同意日時（別の更新で写ったもの、昔の日時）では期を進めず、管理表の同意日時も空のまま戻す。
create or replace function public.leo_track_roll() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if not coalesce((select enabled from leo_flags where name = 'plan_track_rollover'), false) then return new; end if;
  if old.next_start is null then return new; end if;
  if not exists (
    select 1 from leo_plans p
    where replace(replace(p.child, '　', ''), ' ', '') = replace(replace(old.child, '　', ''), ' ', '')
      and p.term_no = old.term_no + 1
      and p.honan_consent_at = new.honan_consent_at
      and p.honan_consent_at > now() - interval '1 day'
  ) then
    new.honan_consent_at := old.honan_consent_at;
    return new;
  end if;
  new.term_no := old.term_no + 1;
  new.period_from := old.next_start;
  new.period_to := (old.next_start + interval '6 months' - interval '1 day')::date;
  new.next_start := (old.next_start + interval '6 months')::date;
  new.survey_due := (new.next_start - interval '1 month' + interval '14 days')::date;
  new.survey_sent_at := null; new.survey_answered_at := null; new.staff_mon_at := null;
  new.genan_date := null; new.kaigi_date := null; new.honan_date := null;
  new.plan_made := false; new.genan_consent_at := null; new.honan_consent_at := null;
  new.note := btrim(coalesce(old.note, '') || ' ' || to_char(now() at time zone 'Asia/Tokyo', 'YYYY/MM/DD') || ' 自動更新');
  return new;
end $$;
