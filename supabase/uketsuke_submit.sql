-- ポータル画面から受付に送る（Chat受付が使えない時の代わり）。送り主・事業所はDB側で本人から決める
create or replace function public.uketsuke_submit(p_category text, p_body text)
returns bigint language plpgsql security definer set search_path = public as $$
declare nm text; off text; cat text; nid bigint;
begin
  if auth.uid() is null then raise exception 'ログインが必要です'; end if;
  if coalesce(btrim(p_body),'') = '' or char_length(p_body) > 4000 then raise exception '内容が空か長すぎます'; end if;
  cat := case when p_category in ('日誌','送迎','請求','計画','記録','その他') then p_category else 'その他' end;
  select coalesce(nullif(full_name,''), nikki_name), office into nm, off from staff_profiles where user_id = auth.uid();
  insert into uketsuke(sender_name, office, category, body, message_name)
    values (coalesce(nm,'（不明）'), off, cat, btrim(p_body), 'portal:' || gen_random_uuid()) returning id into nid;
  return nid;
end $$;
revoke all on function public.uketsuke_submit(text,text) from public, anon;
grant execute on function public.uketsuke_submit(text,text) to authenticated;
