-- レオ 実費の日別明細（お昼代・おやつ代）。保護者の確認ページ（kakunin.html）で「総額＋開けば日別明細」を出すため。2026-11-03
-- 元データ：実績記録シートの「一覧」タブ（日付・児童名・お昼代・おやつ代）。tools/jippi_import.py が月の金額と一緒に入れる
-- 前提：leo_jippi.sql・leo_kakunin.sql・leo_jippi_fee_confirm.sql。再実行できる。既存データは消さない・変えない
-- 戻すとき：supabase/leo_jippi_day_rollback.sql
create table if not exists public.leo_jippi_day (
  day date not null,
  child text not null,
  ym text not null check (ym ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  lunch integer not null default 0 check (lunch >= 0),
  snack integer not null default 0 check (snack >= 0),
  imported_at timestamptz not null default now(),
  primary key (day, child),
  check (to_char(day, 'YYYY-MM') = ym)
);
create index if not exists leo_jippi_day_ym_child on public.leo_jippi_day (ym, child);
comment on table public.leo_jippi_day is 'レオ 実費の日別明細（お昼代・おやつ代、円）。月の合計は leo_jippi。合計が leo_jippi と合わない月は保護者に明細を出さない';
alter table public.leo_jippi_day enable row level security;
drop policy if exists jippi_day_all on public.leo_jippi_day;
create policy jippi_day_all on public.leo_jippi_day for all to authenticated using (public.can_manage_for('レオ')) with check (public.can_manage_for('レオ'));
revoke all on table public.leo_jippi_day from anon;
grant select, insert, update, delete on table public.leo_jippi_day to authenticated;

-- leo_confirm_get：jippi に days を足すだけ（ほかのキーと値は leo_jippi_fee_confirm.sql と同じ）
-- days は日別の合計が leo_jippi の lunch・snack とどちらも一致するときだけ配列、それ以外は null（矛盾を保護者に見せない）
create or replace function public.leo_confirm_get(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  l public.leo_confirm_links%rowtype;
  lunch int := 0;
  snack int := 0;
  burden int := 0;
  pay text;
  pay_amt int;
  found_j boolean := false;
  days jsonb;
  d_lunch bigint;
  d_snack bigint;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{48}$' then return null; end if;
  select * into l from public.leo_confirm_links where token = p_token;
  if not found then return null; end if;
  select j.lunch, j.snack, j.burden, j.pay_link, j.pay_link_amount into lunch, snack, burden, pay, pay_amt
    from public.leo_jippi j where j.ym = l.month and j.child = l.child;
  found_j := found;
  if not found_j then
    lunch := 0; snack := 0; burden := 0; pay := null;
  else
    lunch := coalesce(lunch, 0); snack := coalesce(snack, 0); burden := coalesce(burden, 0);
    if lunch + snack + burden <= 0 or pay is null or pay !~ '^https://' then pay := null; end if;
    -- 古い金額で作ったリンク（または金額の分からないリンク）は出さない
    if pay is not null and (pay_amt is null or pay_amt <> lunch + snack + burden) then pay := null; end if;
  end if;
  if found_j and lunch + snack > 0 then
    select coalesce(sum(d.lunch), 0), coalesce(sum(d.snack), 0),
           jsonb_agg(jsonb_build_object('day', d.day, 'lunch', d.lunch, 'snack', d.snack) order by d.day) filter (where d.lunch > 0 or d.snack > 0)
      into d_lunch, d_snack, days
      from public.leo_jippi_day d where d.ym = l.month and d.child = l.child;
    if d_lunch <> lunch or d_snack <> snack then days := null; end if;
  end if;
  return jsonb_build_object(
    'child', l.child, 'month', l.month,
    'rows', coalesce((select jsonb_agg(jsonb_build_object('day', j.day, 'status', j.status, 'start', j.start_time, 'end', j.end_time) order by j.day)
                      from public.leo_jisseki j where j.child = l.child and to_char(j.day, 'YYYY-MM') = l.month), '[]'::jsonb),
    -- total は Square の請求額と同じ（お昼代＋おやつ代＋利用料）
    'jippi', jsonb_build_object('found', found_j, 'lunch', lunch, 'snack', snack, 'burden', burden, 'total', lunch + snack + burden, 'pay_link', pay, 'days', days),
    'last', (select jsonb_build_object('confirm', c.confirm, 'parent', c.parent_name, 'at', c.submitted_at)
             from public.leo_confirmations c where c.token = l.token order by c.id desc limit 1));
end $$;
revoke all on function public.leo_confirm_get(text) from public;
grant execute on function public.leo_confirm_get(text) to anon, authenticated;
