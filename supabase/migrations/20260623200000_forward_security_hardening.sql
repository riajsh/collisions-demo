/*
 * Forward security hardening — closes audit gaps before Gmail / scale.
 *
 * - Email participant reviews: admin-only writes (mirror calendar reviews)
 * - user_can_read_email_body: remove spoofable participant-email path
 * - email_messages.body/fts: block member writes on sensitive columns
 * - merge_profiles_atomic: admin-only + team-member guard
 * - Evidence tables: tighten update/delete policies
 */

-- ---------------------------------------------------------------------------
-- user_can_read_email_body — provenance via linked reviews only (not raw email match)
-- ---------------------------------------------------------------------------

create or replace function public.user_can_read_email_body(p_org_id uuid, p_thread_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() is not null
    and public.auth_org_id() = p_org_id
    and (
      public.org_has_full_body_access(p_org_id)
      or public.auth_is_admin()
      or exists (
        select 1
        from public.email_participant_reviews epr
        join public.relationship_owners ro
          on ro.org_id = epr.org_id
         and ro.user_id = auth.uid()
        join public.relationships r
          on r.id = ro.relationship_id
         and r.profile_id = epr.profile_id
         and r.org_id = epr.org_id
        where epr.thread_id = p_thread_id
          and epr.org_id = p_org_id
          and epr.profile_id is not null
          and epr.status in ('linked', 'created')
      )
    )
    and not exists (
      select 1
      from public.organisations
      where id = p_org_id
        and email_access_level = 'metadata_only'
    )
$$;

-- ---------------------------------------------------------------------------
-- email_participant_reviews — admin-only writes
-- ---------------------------------------------------------------------------

drop policy if exists email_participant_reviews_insert on public.email_participant_reviews;
drop policy if exists email_participant_reviews_update on public.email_participant_reviews;

create policy email_participant_reviews_insert on public.email_participant_reviews
  for insert to authenticated
  with check (org_id = public.auth_org_id() and public.auth_is_admin());

create policy email_participant_reviews_update on public.email_participant_reviews
  for update to authenticated
  using (org_id = public.auth_org_id() and public.auth_is_admin())
  with check (org_id = public.auth_org_id() and public.auth_is_admin());

-- ---------------------------------------------------------------------------
-- email_messages — members cannot write body or fts (sync uses service role)
-- ---------------------------------------------------------------------------

revoke insert (body, fts), update (body, fts) on public.email_messages from authenticated, anon;

-- ---------------------------------------------------------------------------
-- merge_profiles_atomic — admin-only; block team-member profiles
-- ---------------------------------------------------------------------------

create or replace function public.merge_profiles_atomic(
  p_survivor_id uuid,
  p_duplicate_ids uuid[],
  p_retained_email text,
  p_survivor_fields jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.auth_org_id();
  v_user_id uuid := auth.uid();
  v_duplicate_id uuid;
  v_merged_count integer := 0;
begin
  if v_org_id is null or v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not public.auth_is_admin() then
    raise exception 'Admin required to merge profiles';
  end if;

  if p_duplicate_ids is null or cardinality(p_duplicate_ids) = 0 then
    raise exception 'Select at least one other profile to merge';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = p_survivor_id and org_id = v_org_id
  ) then
    raise exception 'Primary profile not found';
  end if;

  if exists (
    select 1 from public.profiles
    where id = p_survivor_id
      and org_id = v_org_id
      and public.profile_is_team_member(org_id, email)
  ) then
    raise exception 'Cannot merge team member profiles';
  end if;

  if exists (
    select 1 from public.profiles p
    where p.id = any(p_duplicate_ids)
      and p.org_id = v_org_id
      and public.profile_is_team_member(p.org_id, p.email)
  ) then
    raise exception 'Cannot merge team member profiles';
  end if;

  foreach v_duplicate_id in array p_duplicate_ids
  loop
    if v_duplicate_id is null or v_duplicate_id = p_survivor_id then
      continue;
    end if;

    perform public.merge_one_profile_duplicate(
      p_survivor_id,
      v_duplicate_id,
      v_org_id,
      v_user_id
    );
    v_merged_count := v_merged_count + 1;
  end loop;

  update public.profiles
  set
    full_name = coalesce(p_survivor_fields->>'full_name', full_name),
    phone = coalesce(p_survivor_fields->>'phone', phone),
    linkedin_url = coalesce(p_survivor_fields->>'linkedin_url', linkedin_url),
    website_url = coalesce(p_survivor_fields->>'website_url', website_url),
    organisation_name = coalesce(p_survivor_fields->>'organisation_name', organisation_name),
    organisation_name_normalised = coalesce(
      p_survivor_fields->>'organisation_name_normalised',
      organisation_name_normalised
    ),
    occupation = coalesce(p_survivor_fields->>'occupation', occupation),
    location_city = coalesce(p_survivor_fields->>'location_city', location_city),
    location_country = coalesce(p_survivor_fields->>'location_country', location_country),
    bio = coalesce(p_survivor_fields->>'bio', bio),
    email = p_retained_email
  where id = p_survivor_id and org_id = v_org_id;

  return v_merged_count;
end;
$$;

revoke all on function public.merge_profiles_atomic(uuid, uuid[], text, jsonb) from public, anon;
grant execute on function public.merge_profiles_atomic(uuid, uuid[], text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Evidence integrity — restrict destructive / sync tampering
-- ---------------------------------------------------------------------------

drop policy if exists activities_update on public.activities;

create policy activities_update on public.activities
  for update to authenticated
  using (
    org_id = public.auth_org_id()
    and (
      public.auth_is_admin()
      or (source = 'manual' and created_by = auth.uid())
    )
  )
  with check (
    org_id = public.auth_org_id()
    and (
      public.auth_is_admin()
      or (source = 'manual' and created_by = auth.uid())
    )
  );

drop policy if exists relationships_delete on public.relationships;

create policy relationships_delete on public.relationships
  for delete to authenticated
  using (org_id = public.auth_org_id() and public.auth_is_admin());

drop policy if exists relationship_sources_update on public.relationship_sources;

create policy relationship_sources_update on public.relationship_sources
  for update to authenticated
  using (org_id = public.auth_org_id() and public.auth_is_admin())
  with check (org_id = public.auth_org_id() and public.auth_is_admin());

drop policy if exists connections_delete on public.connections;

create policy connections_delete on public.connections
  for delete to authenticated
  using (org_id = public.auth_org_id() and public.auth_is_admin());

drop policy if exists events_delete on public.events;

create policy events_delete on public.events
  for delete to authenticated
  using (org_id = public.auth_org_id() and public.auth_is_admin());
