create or replace function public.rank_list() returns table(rank text, name text) language sql stable security definer set search_path=public as
$$ select rank, coalesce(full_name, nikki_name) from staff_profiles where rank is not null and public.is_leader() order by rank $$;
grant execute on function public.rank_list() to authenticated;
