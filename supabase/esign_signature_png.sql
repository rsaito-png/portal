-- 職員の電子サインを手書きPNGにする（既に supabase/esign.sql を流した環境へ足すだけ）
-- 署名者名（typed_name）はログイン中の staff_profiles.full_name。氏名の再入力はしない
-- signature_png は金斗雲と同じ data:image/png;base64,... 。未署名の古い行は null のまま
-- 署名記録の更新・削除禁止（sig_immutable）はそのまま。画像列も後から書き換えられない

alter table public.doc_signatures add column if not exists signature_png text;
alter table public.doc_signatures drop constraint if exists doc_signatures_signature_png_chk;
alter table public.doc_signatures add constraint doc_signatures_signature_png_chk
  check (signature_png is null or (signature_png like 'data:image/png;base64,%' and char_length(signature_png) <= 300000));

drop function if exists public.doc_sign(bigint, text);
create function public.doc_sign(p_doc bigint, p_signature text) returns void language plpgsql security definer set search_path = public as $$
declare d staff_docs; t doc_templates; nm text; off text;
begin
  select * into d from staff_docs where id = p_doc and user_id = auth.uid() and status = 'issued' and method = 'electronic';
  if not found then raise exception '署名できる書類がありません'; end if;
  if p_signature is null or p_signature not like 'data:image/png;base64,%' or char_length(p_signature) > 300000 then
    raise exception '署名を書いてください'; end if;
  select full_name, office into nm, off from staff_profiles where user_id = auth.uid();
  if coalesce(nm,'') = '' then raise exception '登録されている氏名がありません。事務に連絡してください'; end if;
  select * into t from doc_templates where id = d.template_id;
  insert into doc_signatures(doc_id, user_id, typed_name, text_sha256, template_version, signature_png)
    values (p_doc, auth.uid(), nm, encode(sha256(convert_to(d.rendered_text, 'UTF8')), 'hex'), t.version, p_signature);
  update staff_docs set status = 'superseded' where id = d.prev_doc_id and status in ('signed','paper');
  update staff_docs set status = 'signed' where id = p_doc;
  insert into doc_events(doc_id, actor, event) values (p_doc, auth.uid(), 'signed');
  perform notify_enqueue('mgr', '署名完了', '✅ 書類への署名が届きました（' || nm || '）。', 'https://rsaito-png.github.io/portal/#clerk/docs', coalesce(off, 'レオ'));
end $$;
revoke all on function public.doc_sign(bigint, text) from public, anon;
grant execute on function public.doc_sign(bigint, text) to authenticated;
