-- 保護者へのリンク（アンケート・原案/本案の同意）を「いつ送ったか」の記録。返事が遅い家庭を画面で分かるようにする。
create table if not exists leo_link_sends (
  id bigserial primary key,
  kind text not null check (kind in ('mon','doui')),
  child text not null,
  term text,
  plan_id bigint references leo_plans(id) on delete cascade,
  doc text,
  token text,
  url text,                -- Google側で送ったもの（全員共通のフォームURL）のときだけ入れる
  via text not null default 'ポータル',
  sent_at timestamptz not null default now(),
  sent_by uuid default auth.uid(),
  note text
);
alter table leo_link_sends enable row level security;
drop policy if exists leo_link_sends_sel on leo_link_sends;
create policy leo_link_sends_sel on leo_link_sends for select to authenticated using (public.my_office() is not null);
drop policy if exists leo_link_sends_ins on leo_link_sends;
create policy leo_link_sends_ins on leo_link_sends for insert to authenticated with check (public.can_manage());
