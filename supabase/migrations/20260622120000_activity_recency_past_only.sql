-- Recency uses only activities that have already happened (not future calendar invites).

create or replace function public.get_last_activity_per_profile(p_org_id uuid)
returns table (profile_id uuid, activity_date timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct on (profile_id) profile_id, activity_date
  from public.activities
  where org_id = p_org_id
    and activity_date <= now()
  order by profile_id, activity_date desc;
$$;
