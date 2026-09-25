/*
 * Phase 1 — Step 3: relationships, relationship_owners, relationship_sources
 *
 * relationships is the org→profile spine (one row per profile). relationship_owners
 * captures who on the team holds each relationship and at what strength. relationship_sources
 * is append-only provenance — why we know this person (import, email, event, etc.).
 * Owner strength is user-entered Layer 1 data, not a computed score.
 */

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.relationship_status as enum (
  'prospect',
  'active',
  'partner',
  'advisor',
  'community',
  'dormant',
  'inactive'
);

create type public.relationship_type as enum (
  'founder',
  'investor',
  'operator',
  'advisor',
  'partner',
  'sponsor',
  'media',
  'other'
);

create type public.owner_strength as enum (
  'inner_circle',
  'strong',
  'warm',
  'weak',
  'unknown'
);

create type public.relationship_source_type as enum (
  'csv_import',
  'email',
  'event_attendance',
  'manual',
  'introduction',
  'meeting',
  'other'
);

-- ---------------------------------------------------------------------------
-- relationships (org → profile, 1:1 with profile)
-- ---------------------------------------------------------------------------

create table public.relationships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete restrict,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  status public.relationship_status not null default 'prospect',
  relationship_type public.relationship_type not null default 'other',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint relationships_org_profile_unique unique (org_id, profile_id)
);

create index relationships_org_id_idx on public.relationships (org_id);
create index relationships_profile_id_idx on public.relationships (profile_id);

create trigger relationships_set_updated_at
  before update on public.relationships
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- relationship_owners (user → profile via relationship)
-- ---------------------------------------------------------------------------

create table public.relationship_owners (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete restrict,
  relationship_id uuid not null references public.relationships (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  strength public.owner_strength not null default 'unknown',
  is_primary boolean not null default false,
  notes text,
  last_interaction_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint relationship_owners_relationship_user_unique unique (relationship_id, user_id)
);

create index relationship_owners_org_id_idx on public.relationship_owners (org_id);
create index relationship_owners_relationship_id_idx on public.relationship_owners (relationship_id);
create index relationship_owners_user_id_idx on public.relationship_owners (user_id);

create trigger relationship_owners_set_updated_at
  before update on public.relationship_owners
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- relationship_sources (append-only provenance)
-- ---------------------------------------------------------------------------

create table public.relationship_sources (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete restrict,
  relationship_id uuid not null references public.relationships (id) on delete cascade,
  source_type public.relationship_source_type not null,
  source_id uuid,
  source_label text not null,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index relationship_sources_org_id_idx on public.relationship_sources (org_id);
create index relationship_sources_relationship_id_idx on public.relationship_sources (relationship_id);
create index relationship_sources_source_type_source_id_idx
  on public.relationship_sources (relationship_id, source_type, source_id);

create trigger relationship_sources_set_updated_at
  before update on public.relationship_sources
  for each row
  execute function public.set_updated_at();
