/*
 * Phase 1 — Step 4: connections
 *
 * Profile-to-profile graph edges ("Aaron knows Henry"). Canonical ordering
 * (profile_a_id < profile_b_id) stores each edge once. source_event_id is
 * deferred without FK here because events are created in the next migration;
 * the FK is added in 20260620100004_events.sql.
 */

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.connection_type as enum (
  'colleague',
  'cofounder',
  'introduced',
  'met_at_event',
  'personal',
  'unknown'
);

create type public.connection_strength as enum (
  'strong',
  'warm',
  'weak',
  'unknown'
);

create type public.connection_source as enum (
  'manual',
  'inferred_company',
  'inferred_event',
  'inferred_email',
  'import'
);

-- ---------------------------------------------------------------------------
-- connections
-- ---------------------------------------------------------------------------

create table public.connections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete restrict,
  profile_a_id uuid not null references public.profiles (id) on delete cascade,
  profile_b_id uuid not null references public.profiles (id) on delete cascade,
  connection_type public.connection_type not null default 'unknown',
  strength public.connection_strength not null default 'unknown',
  source public.connection_source not null default 'manual',
  source_event_id uuid,
  introduced_by uuid references public.users (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint connections_profile_order_check check (profile_a_id < profile_b_id),
  constraint connections_org_profiles_unique unique (org_id, profile_a_id, profile_b_id),
  constraint connections_distinct_profiles_check check (profile_a_id <> profile_b_id)
);

create index connections_org_id_idx on public.connections (org_id);
create index connections_profile_a_id_idx on public.connections (profile_a_id);
create index connections_profile_b_id_idx on public.connections (profile_b_id);
create index connections_source_event_id_idx on public.connections (source_event_id)
  where source_event_id is not null;

create trigger connections_set_updated_at
  before update on public.connections
  for each row
  execute function public.set_updated_at();
