-- 日誌→実績の写しをDB内で行う（GAS transferForDate_ のルールを移植）。11/1までは「影」で動かし、GASの結果と照合するだけ
-- 請求に関わる列（お昼代・おやつ代・加算・利用料）は扱わない
create or replace function public.leo_norm(s text) returns text language sql immutable as
$$ select regexp_replace(normalize(coalesce(s,''), NFKC), '\s+', '', 'g') $$;
create or replace function public.leo_time(s text) returns text language sql immutable as $$
  select case when m is null or m[1]::int > 23 or m[2]::int > 59 then null else m[1]::int || ':' || lpad(m[2], 2, '0') end
  from (select regexp_match(public.leo_norm(s), '^(\d{1,2})[:時](\d{1,2})') m) x $$;

create table if not exists public.leo_jisseki_shadow (
  day date not null, child text not null, service text, status text not null, start_time text, end_time text,
  pick_mark text, drop_mark text, source text, made_at timestamptz default now(), primary key (day, child));
alter table public.leo_jisseki_shadow enable row level security;
drop policy if exists shadow_read on public.leo_jisseki_shadow;
create policy shadow_read on public.leo_jisseki_shadow for select to authenticated using (public.my_role() = '事務');

-- 日誌（DB）にある日の利用・欠席を、まだ無いものだけ写す（GASと同じ「既にある日付＋児童は追加しない」）
create or replace function public.leo_shadow_transfer() returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into leo_jisseki_shadow (day, child, service, status, start_time, end_time, pick_mark, drop_mark, source)
  select distinct on (n.day, leo_norm(n.child)) n.day, regexp_replace(normalize(trim(n.child), NFKC), '\s+', ' ', 'g'), n.service,
    case when n.kind = '利用' then '出席' else '欠席' end,
    case when n.kind = '利用' then leo_time(n.start_time) end, case when n.kind = '利用' then leo_time(n.end_time) end,
    case when n.kind <> '利用' or leo_norm(n.pick_time) ~ 'なし' then '' when leo_norm(n.pick_time) <> '' or leo_norm(n.pick_car||n.pick_driver||n.pick_place) <> '' then '◯' else '' end,
    case when n.kind <> '利用' or leo_norm(n.drop_time) ~ 'なし' then '' when leo_norm(n.drop_time) <> '' or leo_norm(n.drop_car||n.drop_driver||n.drop_place) <> '' then '◯' else '' end,
    '日誌 ' || n.row_no || '行目'
  from leo_nikki n where coalesce(trim(n.child), '') <> ''
  order by n.day, leo_norm(n.child), (n.kind = '利用') desc, n.row_no
  on conflict (day, child) do nothing;
  get diagnostics n = row_count; return n;
end $$;
revoke all on function public.leo_shadow_transfer from public;

-- 照合：GAS が作った実績（leo_jisseki）と、DBの写し（影）の違い
create or replace view public.leo_shadow_diff with (security_invoker = true) as
select coalesce(s.day, j.day) as day, coalesce(s.child, j.child) as child,
  case when j.child is null then 'DBだけ' when s.child is null then 'GASだけ'
       when s.status <> j.status then '状況が違う'
       when coalesce(s.start_time,'') <> coalesce(leo_time(j.start_time),'') or coalesce(s.end_time,'') <> coalesce(leo_time(j.end_time),'') then '時間が違う' end as kind,
  s.status s_status, j.status g_status, s.start_time s_start, j.start_time g_start, s.end_time s_end, j.end_time g_end
from leo_jisseki_shadow s full join leo_jisseki j on j.day = s.day and leo_norm(j.child) = leo_norm(s.child)
where coalesce(s.day, j.day) >= (select min(day) from leo_jisseki_shadow);

-- box の同期の最後に呼ぶ（同期トークンつき）
create or replace function public.leo_shadow_run(p_token text) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare n int;
begin
  if encode(digest(p_token, 'sha256'), 'hex') is distinct from (select token_sha256 from sync_secret where name = 'leo') then raise exception 'bad token'; end if;
  n := leo_shadow_transfer();
  return jsonb_build_object('added', n, 'diff', (select count(*) from leo_shadow_diff where kind is not null and day < current_date));
end $$;
revoke all on function public.leo_shadow_run from public;
grant execute on function public.leo_shadow_run to anon;
