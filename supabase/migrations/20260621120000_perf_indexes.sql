/*
 * Performance indexes and idempotency constraints for calendar sync,
 * admin queries, ILIKE search, and activity recency RPC.
 */

-- ---------------------------------------------------------------------------
-- Query performance indexes (#16)
-- ---------------------------------------------------------------------------

create index if not exists activities_org_source_idx
  on public.activities (org_id, source);

create index if not exists relationship_sources_org_type_idx
  on public.relationship_sources (org_id, source_type, source_id);

-- ---------------------------------------------------------------------------
-- Idempotent calendar sync upserts (#2)
-- Dedupe existing rows before adding unique constraints (re-sync race / pre-check gaps).
-- ---------------------------------------------------------------------------

delete from public.activities
where id in (
  select id
  from (
    select
      id,
      row_number() over (
        partition by org_id, profile_id, source, source_ref
        order by created_at asc, id asc
      ) as row_num
    from public.activities
    where source_ref is not null
  ) duplicates
  where row_num > 1
);

delete from public.relationship_sources
where id in (
  select id
  from (
    select
      id,
      row_number() over (
        partition by relationship_id, source_type, source_id
        order by created_at asc, id asc
      ) as row_num
    from public.relationship_sources
    where source_id is not null
  ) duplicates
  where row_num > 1
);

create unique index if not exists activities_org_profile_source_ref_unique
  on public.activities (org_id, profile_id, source, source_ref)
  where source_ref is not null;

create unique index if not exists relationship_sources_relationship_type_source_unique
  on public.relationship_sources (relationship_id, source_type, source_id)
  where source_id is not null;

-- ---------------------------------------------------------------------------
-- pg_trgm ILIKE search (#27)
-- ---------------------------------------------------------------------------

create extension if not exists pg_trgm;

create index if not exists profiles_full_name_trgm_idx
  on public.profiles using gin (full_name gin_trgm_ops);

create index if not exists profiles_org_name_trgm_idx
  on public.profiles using gin (organisation_name gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Latest activity per profile (#9)
-- ---------------------------------------------------------------------------

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
  order by profile_id, activity_date desc;
$$;

revoke all on function public.get_last_activity_per_profile(uuid) from public, anon;
grant execute on function public.get_last_activity_per_profile(uuid) to authenticated;
