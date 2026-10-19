-- 提供実績記録表：保護者に確認リンクを「送った」印（月×児童）。確認の中身は leo_confirm_links / leo_confirmations を使う
create table if not exists public.leo_jissekihyo_sent (
  ym text not null check (ym ~ '^\d{4}-\d{2}$'), child text not null,
  sent_at timestamptz not null default now(), sent_by uuid default auth.uid(),
  primary key (ym, child));
alter table public.leo_jissekihyo_sent enable row level security;
drop policy if exists ljs_sel on public.leo_jissekihyo_sent;
create policy ljs_sel on public.leo_jissekihyo_sent for select to authenticated using (public.can_manage());
drop policy if exists ljs_ins on public.leo_jissekihyo_sent;
create policy ljs_ins on public.leo_jissekihyo_sent for insert to authenticated with check (public.can_manage());
drop policy if exists ljs_del on public.leo_jissekihyo_sent;
create policy ljs_del on public.leo_jissekihyo_sent for delete to authenticated using (public.can_manage());
