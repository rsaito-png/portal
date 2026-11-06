-- 個別支援計画（管理）の本案を、今日の利用児童カード用 leo_child_plan に載せる。
-- 本案同意時に自動反映。同意待ちでも本文があれば読めるよう、管理画面側の表示は leo_plans を正とする。
create or replace function public.leo_sync_child_plan_from_plan(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p record;
  body text;
  term text;
  period text;
begin
  select * into p from leo_plans where id = p_id;
  if not found then return; end if;
  if length(btrim(coalesce(p.honan, ''))) = 0 then return; end if;
  body := regexp_replace(regexp_replace(p.honan, '(^|\n)#T ', E'\\1', 'g'), '(^|\n)#R ', E'\\1', 'g');
  term := case when p.term_no is null then null else p.term_no::text || '期' end;
  period := case
    when p.start_on is null or p.end_on is null then null
    else format('令和%s年%s月%s日 〜 令和%s年%s月%s日',
      extract(year from p.start_on)::int - 2018, extract(month from p.start_on)::int, extract(day from p.start_on)::int,
      extract(year from p.end_on)::int - 2018, extract(month from p.end_on)::int, extract(day from p.end_on)::int)
  end;
  insert into leo_child_plan as c (name, term, period, body, updated_at)
  values (p.child, term, period, body, now())
  on conflict (name) do update set
    term = excluded.term,
    period = excluded.period,
    body = excluded.body,
    updated_at = excluded.updated_at;
end $$;

create or replace function public.leo_plans_sync_child_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 本案本文が入った／同意が付いたときだけ反映（空で上書きしない）
  if tg_op = 'INSERT' then
    if length(btrim(coalesce(new.honan, ''))) > 0 then
      perform public.leo_sync_child_plan_from_plan(new.id);
    end if;
  elsif length(btrim(coalesce(new.honan, ''))) > 0
    and (
      new.honan is distinct from old.honan
      or new.honan_consent_at is distinct from old.honan_consent_at
      or new.term_no is distinct from old.term_no
      or new.start_on is distinct from old.start_on
      or new.end_on is distinct from old.end_on
    ) then
    perform public.leo_sync_child_plan_from_plan(new.id);
  end if;
  return new;
end $$;

drop trigger if exists leo_plans_sync_child_plan on public.leo_plans;
create trigger leo_plans_sync_child_plan
after insert or update of honan, honan_consent_at, term_no, start_on, end_on
on public.leo_plans
for each row execute function public.leo_plans_sync_child_plan();

revoke all on function public.leo_sync_child_plan_from_plan(bigint) from public, anon;
grant execute on function public.leo_sync_child_plan_from_plan(bigint) to authenticated;

-- いま本案本文があるのに leo_child_plan が無い／古い児童を埋める（今日を含む期を優先）
with ranked as (
  select p.*, row_number() over (
    partition by replace(p.child, ' ', '')
    order by
      (p.start_on <= current_date and p.end_on >= current_date) desc,
      p.start_on desc nulls last,
      p.id desc
  ) as rn
  from leo_plans p
  where length(btrim(coalesce(p.honan, ''))) > 0
)
select public.leo_sync_child_plan_from_plan(id) from ranked where rn = 1;
