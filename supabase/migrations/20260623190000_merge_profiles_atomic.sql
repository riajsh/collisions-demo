/*
 * Atomic profile merge — single transaction for all duplicate reassignments.
 * Validation (team members, email choice) stays in application code.
 */

create or replace function public.pick_stronger_owner_strength(
  left_strength public.owner_strength,
  right_strength public.owner_strength
)
returns public.owner_strength
language sql
immutable
as $$
  select case
    when left_strength = 'inner_circle' or right_strength = 'inner_circle' then 'inner_circle'::public.owner_strength
    when left_strength = 'strong' or right_strength = 'strong' then 'strong'::public.owner_strength
    when left_strength = 'warm' or right_strength = 'warm' then 'warm'::public.owner_strength
    when left_strength = 'weak' or right_strength = 'weak' then 'weak'::public.owner_strength
    else 'unknown'::public.owner_strength
  end
$$;

create or replace function public.normalise_organisation_name_sql(p_name text)
returns text
language sql
immutable
as $$
  select case
    when p_name is null or btrim(p_name) = '' then null
    else lower(
      regexp_replace(
        btrim(p_name),
        '\s+(ltd\.?|limited|inc\.?|llc|pty\.?|corp\.?|corporation|co\.?)$',
        '',
        'i'
      )
    )
  end
$$;

create or replace function public.merge_one_profile_duplicate(
  p_survivor_id uuid,
  p_duplicate_id uuid,
  p_org_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_survivor_relationship_id uuid;
  v_duplicate_relationship_id uuid;
  v_duplicate_notes text;
  v_survivor_notes text;
  v_owner record;
  v_existing_owner record;
  v_connection record;
  v_profile_a_id uuid;
  v_profile_b_id uuid;
  v_existing_connection_id uuid;
  v_tag record;
  v_existing_tag_id uuid;
  v_attendance record;
  v_existing_attendance_id uuid;
  v_activity record;
  v_survivor_activity_id uuid;
begin
  if p_survivor_id = p_duplicate_id then
    return;
  end if;

  if not exists (
    select 1 from public.profiles
    where id = p_survivor_id and org_id = p_org_id
  ) then
    raise exception 'Primary profile not found';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = p_duplicate_id and org_id = p_org_id
  ) then
    raise exception 'Duplicate profile not found';
  end if;

  -- Calendar activities: drop duplicates already on survivor (same title + date), move the rest.
  for v_activity in
    select id, source_ref, activity_date, title
    from public.activities
    where org_id = p_org_id
      and profile_id = p_duplicate_id
      and source = 'calendar_sync'
  loop
    select a.id
    into v_survivor_activity_id
    from public.activities a
    where a.org_id = p_org_id
      and a.profile_id = p_survivor_id
      and a.source = 'calendar_sync'
      and (
        (v_activity.source_ref is not null and a.source_ref = v_activity.source_ref)
        or (
          v_activity.title is not null
          and a.title = v_activity.title
          and a.activity_date = v_activity.activity_date
        )
      )
    limit 1;

    if v_survivor_activity_id is not null then
      delete from public.activities
      where id = v_activity.id and org_id = p_org_id;
    else
      update public.activities
      set profile_id = p_survivor_id
      where id = v_activity.id and org_id = p_org_id;
    end if;
  end loop;

  -- Non-calendar activities
  update public.activities
  set profile_id = p_survivor_id
  where org_id = p_org_id
    and profile_id = p_duplicate_id
    and source <> 'calendar_sync';

  update public.calendar_participant_reviews
  set profile_id = p_survivor_id
  where org_id = p_org_id and profile_id = p_duplicate_id;

  update public.email_participant_reviews
  set profile_id = p_survivor_id
  where org_id = p_org_id and profile_id = p_duplicate_id;

  update public.import_rows
  set matched_profile_id = p_survivor_id
  where org_id = p_org_id and matched_profile_id = p_duplicate_id;

  -- Survivor relationship
  select id into v_survivor_relationship_id
  from public.relationships
  where org_id = p_org_id and profile_id = p_survivor_id
  limit 1;

  if v_survivor_relationship_id is null then
    insert into public.relationships (org_id, profile_id, status, relationship_type)
    values (p_org_id, p_survivor_id, 'prospect', 'other')
    returning id into v_survivor_relationship_id;

    insert into public.relationship_sources (
      org_id, relationship_id, source_type, source_label, created_by
    )
    values (
      p_org_id,
      v_survivor_relationship_id,
      'manual',
      'Relationship created during profile merge',
      p_user_id
    );
  end if;

  select id, notes
  into v_duplicate_relationship_id, v_duplicate_notes
  from public.relationships
  where org_id = p_org_id and profile_id = p_duplicate_id
  limit 1;

  if v_duplicate_relationship_id is not null then
    select notes into v_survivor_notes
    from public.relationships
    where id = v_survivor_relationship_id and org_id = p_org_id;

    if coalesce(btrim(v_survivor_notes), '') = '' and coalesce(btrim(v_duplicate_notes), '') <> '' then
      update public.relationships
      set notes = v_duplicate_notes
      where id = v_survivor_relationship_id and org_id = p_org_id;
    end if;

    for v_owner in
      select user_id, strength, is_primary, notes, last_interaction_at
      from public.relationship_owners
      where org_id = p_org_id and relationship_id = v_duplicate_relationship_id
    loop
      select id, strength, notes, is_primary, last_interaction_at
      into v_existing_owner
      from public.relationship_owners
      where org_id = p_org_id
        and relationship_id = v_survivor_relationship_id
        and user_id = v_owner.user_id
      limit 1;

      if v_existing_owner.id is not null then
        update public.relationship_owners
        set
          strength = public.pick_stronger_owner_strength(v_existing_owner.strength, v_owner.strength),
          is_primary = v_existing_owner.is_primary or v_owner.is_primary,
          notes = coalesce(nullif(btrim(v_existing_owner.notes), ''), nullif(btrim(v_owner.notes), '')),
          last_interaction_at = greatest(v_existing_owner.last_interaction_at, v_owner.last_interaction_at)
        where id = v_existing_owner.id and org_id = p_org_id;
      else
        insert into public.relationship_owners (
          org_id, relationship_id, user_id, strength, is_primary, notes, last_interaction_at
        )
        values (
          p_org_id,
          v_survivor_relationship_id,
          v_owner.user_id,
          v_owner.strength,
          v_owner.is_primary,
          v_owner.notes,
          v_owner.last_interaction_at
        );
      end if;
    end loop;

    update public.relationship_sources
    set relationship_id = v_survivor_relationship_id
    where org_id = p_org_id and relationship_id = v_duplicate_relationship_id;

    delete from public.relationships
    where id = v_duplicate_relationship_id and org_id = p_org_id;
  end if;

  -- Connections
  for v_connection in
    select id, profile_a_id, profile_b_id
    from public.connections
    where org_id = p_org_id
      and (profile_a_id = p_duplicate_id or profile_b_id = p_duplicate_id)
  loop
    if v_connection.profile_a_id = p_duplicate_id then
      if v_connection.profile_b_id = p_survivor_id then
        delete from public.connections where id = v_connection.id and org_id = p_org_id;
        continue;
      end if;
      v_profile_a_id := least(p_survivor_id, v_connection.profile_b_id);
      v_profile_b_id := greatest(p_survivor_id, v_connection.profile_b_id);
    else
      if v_connection.profile_a_id = p_survivor_id then
        delete from public.connections where id = v_connection.id and org_id = p_org_id;
        continue;
      end if;
      v_profile_a_id := least(p_survivor_id, v_connection.profile_a_id);
      v_profile_b_id := greatest(p_survivor_id, v_connection.profile_a_id);
    end if;

    select id into v_existing_connection_id
    from public.connections
    where org_id = p_org_id
      and profile_a_id = v_profile_a_id
      and profile_b_id = v_profile_b_id
    limit 1;

    if v_existing_connection_id is not null then
      delete from public.connections where id = v_connection.id and org_id = p_org_id;
    else
      update public.connections
      set profile_a_id = v_profile_a_id, profile_b_id = v_profile_b_id
      where id = v_connection.id and org_id = p_org_id;
    end if;
  end loop;

  -- Tags
  for v_tag in
    select id, tag_id from public.profile_tags
    where org_id = p_org_id and profile_id = p_duplicate_id
  loop
    select id into v_existing_tag_id
    from public.profile_tags
    where org_id = p_org_id and profile_id = p_survivor_id and tag_id = v_tag.tag_id
    limit 1;

    if v_existing_tag_id is not null then
      delete from public.profile_tags where id = v_tag.id and org_id = p_org_id;
    else
      update public.profile_tags
      set profile_id = p_survivor_id
      where id = v_tag.id and org_id = p_org_id;
    end if;
  end loop;

  -- Event attendance
  for v_attendance in
    select id, event_id from public.event_attendees
    where org_id = p_org_id and profile_id = p_duplicate_id
  loop
    select id into v_existing_attendance_id
    from public.event_attendees
    where org_id = p_org_id
      and profile_id = p_survivor_id
      and event_id = v_attendance.event_id
    limit 1;

    if v_existing_attendance_id is not null then
      delete from public.event_attendees where id = v_attendance.id and org_id = p_org_id;
    else
      update public.event_attendees
      set profile_id = p_survivor_id
      where id = v_attendance.id and org_id = p_org_id;
    end if;
  end loop;

  -- Dedupe survivor calendar activities (canonical source_ref with # wins)
  delete from public.activities a
  using (
    select id
    from (
      select
        id,
        row_number() over (
          partition by activity_date, title
          order by
            case when source_ref like '%#%' then 0 else 1 end,
            created_at asc,
            id asc
        ) as row_num
      from public.activities
      where org_id = p_org_id
        and profile_id = p_survivor_id
        and source = 'calendar_sync'
        and title is not null
    ) ranked
    where row_num > 1
  ) dup
  where a.id = dup.id and a.org_id = p_org_id;

  delete from public.profiles
  where id = p_duplicate_id and org_id = p_org_id;
end;
$$;

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

  if p_duplicate_ids is null or cardinality(p_duplicate_ids) = 0 then
    raise exception 'Select at least one other profile to merge';
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

revoke all on function public.pick_stronger_owner_strength(public.owner_strength, public.owner_strength) from public, anon;
revoke all on function public.normalise_organisation_name_sql(text) from public, anon;
revoke all on function public.merge_one_profile_duplicate(uuid, uuid, uuid, uuid) from public, anon;
revoke all on function public.merge_profiles_atomic(uuid, uuid[], text, jsonb) from public, anon;

grant execute on function public.merge_profiles_atomic(uuid, uuid[], text, jsonb) to authenticated;
