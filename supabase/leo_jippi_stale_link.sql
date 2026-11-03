-- レオ 実費：保護者の確認ページ（kakunin.html）に、金額が変わる前の古い Square 支払いリンクを出さない。2026-11-03
-- Square の支払いリンク（quick_pay）は作成時の金額で固定。URL パラメータで金額は変えられないので、
-- 金額が変わったら jippi-checkout で作り直す。pay_link_amount が今の lunch+snack+burden と違うリンクは返さない。
-- 再実行できる。データは変えない（関数の置き換えだけ）
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
  return jsonb_build_object(
    'child', l.child, 'month', l.month,
    'rows', coalesce((select jsonb_agg(jsonb_build_object('day', j.day, 'status', j.status, 'start', j.start_time, 'end', j.end_time) order by j.day)
                      from public.leo_jisseki j where j.child = l.child and to_char(j.day, 'YYYY-MM') = l.month), '[]'::jsonb),
    'jippi', jsonb_build_object('found', found_j, 'lunch', lunch, 'snack', snack, 'total', lunch + snack, 'pay_link', pay),
    'last', (select jsonb_build_object('confirm', c.confirm, 'parent', c.parent_name, 'at', c.submitted_at)
             from public.leo_confirmations c where c.token = l.token order by c.id desc limit 1));
end $$;
revoke all on function public.leo_confirm_get(text) from public;
grant execute on function public.leo_confirm_get(text) to anon, authenticated;
