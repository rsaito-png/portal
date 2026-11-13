-- 初回利用の「LINEで送った」記録用。既存の mon / doui に、アセスメントと契約署名リンクを足す。
alter table public.leo_link_sends drop constraint if exists leo_link_sends_kind_check;
alter table public.leo_link_sends add constraint leo_link_sends_kind_check
  check (kind in ('mon', 'doui', 'assess', 'doc'));
