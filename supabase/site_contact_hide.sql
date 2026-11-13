-- 会長ページの問い合わせを一覧から消す（非表示）。行は残す。Gmail は触らない。
-- 取り込み（site-contact-intake）は新規 insert のみで、hidden_at は上書きしない。

alter table site_contact.inquiries
  add column if not exists hidden_at timestamptz;

create or replace function site_contact.rows_for(p_lane text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not site_contact.is_owner() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_lane is not null and p_lane not in ('normal', 'sales') then
    raise exception 'bad lane' using errcode = '22023';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', id,
      'created_at', created_at,
      'service', service,
      'name', name,
      'email', email,
      'body', body,
      'lane', lane,
      'review', review,
      'sales_reason', sales_reason,
      'read_at', read_at,
      'restored_at', restored_at
    ) order by created_at desc)
    from site_contact.inquiries
    where test = false
      and hidden_at is null
      and (p_lane is null or lane = p_lane)
  ), '[]'::jsonb);
end $$;

create or replace function site_contact.unread_count()
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not site_contact.is_owner() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return (
    select count(*)::integer from site_contact.inquiries
    where test = false and lane = 'normal' and read_at is null and hidden_at is null
  );
end $$;

create or replace function site_contact.hide(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare row_json jsonb;
begin
  if not site_contact.is_owner() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update site_contact.inquiries
    set hidden_at = coalesce(hidden_at, now()),
        read_at = coalesce(read_at, now())
    where id = p_id and test = false
    returning jsonb_build_object('id', id, 'hidden_at', hidden_at) into row_json;
  return row_json;
end $$;

revoke all on function site_contact.hide(uuid) from public, anon;
grant execute on function site_contact.hide(uuid) to authenticated;

create or replace function public.site_contact_hide(p_id uuid)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$ select site_contact.hide(p_id) $$;

revoke all on function public.site_contact_hide(uuid) from public, anon;
grant execute on function public.site_contact_hide(uuid) to authenticated;
