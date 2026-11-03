-- レオ 実費：保護者の確認ページ（kakunin.html）に利用料（利用者負担額＝leo_jippi.burden）も載せ、合計を Square の請求額（lunch+snack+burden）とそろえる。2026-11-03
-- 前提：supabase/leo_kakunin.sql・leo_jippi.sql・leo_jippi_stale_link.sql。再実行できる。データは消さない（列を足し、関数を置き換えるだけ）
alter table public.leo_confirmations add column if not exists jippi_burden integer;
alter table public.leo_confirmations drop constraint if exists leo_confirmations_jippi_burden_check;
alter table public.leo_confirmations add constraint leo_confirmations_jippi_burden_check check (jippi_burden is null or jippi_burden >= 0);
comment on column public.leo_confirmations.jippi_burden is '送信時点の利用料（利用者負担額、円）。null は利用料を載せる前の回答。保護者が送った値ではない。';

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
    -- total は Square の請求額と同じ（お昼代＋おやつ代＋利用料）
    'jippi', jsonb_build_object('found', found_j, 'lunch', lunch, 'snack', snack, 'burden', burden, 'total', lunch + snack + burden, 'pay_link', pay),
    'last', (select jsonb_build_object('confirm', c.confirm, 'parent', c.parent_name, 'at', c.submitted_at)
             from public.leo_confirmations c where c.token = l.token order by c.id desc limit 1));
end $$;
revoke all on function public.leo_confirm_get(text) from public;
grant execute on function public.leo_confirm_get(text) to anon, authenticated;

-- 金額はクライアントから受け取らない。送った瞬間の leo_jippi（お昼・おやつ・利用料）を回答に残す
create or replace function public.leo_confirm_submit(p_token text, p_confirm text, p_parent text, p_comment text, p_signature text)
returns text language plpgsql security definer set search_path = public as $$
declare
  l public.leo_confirm_links%rowtype;
  lunch int := 0;
  snack int := 0;
  burden int := 0;
  found_j boolean := false;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{48}$' then raise exception 'リンクが正しくありません'; end if;
  select * into l from public.leo_confirm_links where token = p_token;
  if not found then raise exception 'リンクが正しくありません'; end if;
  if (select count(*) from public.leo_confirmations where token = p_token and submitted_at > now() - interval '1 hour') >= 5
    then raise exception '送信が多すぎます。時間をおいてください'; end if;
  select j.lunch, j.snack, j.burden into lunch, snack, burden from public.leo_jippi j where j.ym = l.month and j.child = l.child;
  found_j := found;
  if not found_j then lunch := 0; snack := 0; burden := 0;
  else lunch := coalesce(lunch, 0); snack := coalesce(snack, 0); burden := coalesce(burden, 0); end if;
  insert into public.leo_confirmations (token, confirm, parent_name, comment, signature, jippi_found, jippi_lunch, jippi_snack, jippi_burden)
    values (p_token, p_confirm, trim(p_parent), nullif(trim(coalesce(p_comment, '')), ''), nullif(p_signature, ''), found_j, lunch, snack, burden);
  return 'ok';
end $$;
revoke all on function public.leo_confirm_submit(text, text, text, text, text) from public;
grant execute on function public.leo_confirm_submit(text, text, text, text, text) to anon, authenticated;
