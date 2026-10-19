-- 個別支援計画「AI下書き」依頼キュー。管理者が画面で依頼 → ボットの定期処理(tools/draft-plans.js)が処理。冪等。
create table if not exists public.bp_plan_draft_requests (
  id uuid primary key default gen_random_uuid(),
  office text not null default public.bp_my_office() check (office <> ''),
  plan_id uuid not null,
  status text not null default 'pending' check (status in ('pending','done','error')),
  requested_by uuid default auth.uid(),
  requested_by_name text,
  requested_at timestamptz not null default now(),
  done_at timestamptz,
  result_note text,           -- done: 書き込んだ項目数など / error: 理由
  foreign key (plan_id, office) references public.bp_support_plans(id, office) on delete cascade
);
create unique index if not exists bp_plan_draft_requests_one_pending on public.bp_plan_draft_requests(plan_id) where status = 'pending';
create index if not exists bp_plan_draft_requests_plan on public.bp_plan_draft_requests(plan_id, requested_at desc);
alter table public.bp_plan_draft_requests enable row level security;
drop trigger if exists bp_office_immutable_t on public.bp_plan_draft_requests;
create trigger bp_office_immutable_t before update on public.bp_plan_draft_requests for each row execute function public.bp_office_immutable();
revoke all on public.bp_plan_draft_requests from anon;
grant select, insert, update, delete on public.bp_plan_draft_requests to authenticated, service_role;
drop policy if exists bp_plan_draft_requests_corp_all on public.bp_plan_draft_requests;
create policy bp_plan_draft_requests_corp_all on public.bp_plan_draft_requests for all to authenticated using (public.bp_is_corp_admin()) with check (public.bp_is_corp_admin());
drop policy if exists bp_plan_draft_requests_admin on public.bp_plan_draft_requests;
create policy bp_plan_draft_requests_admin on public.bp_plan_draft_requests for all to authenticated
  using (public.bp_is_admin() and office = public.bp_my_office()) with check (public.bp_is_admin() and office = public.bp_my_office());
