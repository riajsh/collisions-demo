/*
 * Batch latest calendar meeting per profile — avoids N+1 on profiles list.
 */

create or replace function public.get_latest_calendar_meetings_for_profiles(
  p_org_id uuid,
  p_profile_ids uuid[],
  p_before timestamptz default now()
)
returns table (
  profile_id uuid,
  title text,
  activity_date timestamptz,
  source_ref text
)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct on (a.profile_id)
    a.profile_id,
    a.title,
    a.activity_date,
    a.source_ref
  from public.activities a
  where a.org_id = p_org_id
    and a.profile_id = any(p_profile_ids)
    and a.source = 'calendar_sync'
    and a.activity_type = 'meeting'
    and a.activity_date <= coalesce(p_before, now())
  order by a.profile_id, a.activity_date desc;
$$;

revoke all on function public.get_latest_calendar_meetings_for_profiles(uuid, uuid[], timestamptz) from public, anon;
grant execute on function public.get_latest_calendar_meetings_for_profiles(uuid, uuid[], timestamptz) to authenticated;
