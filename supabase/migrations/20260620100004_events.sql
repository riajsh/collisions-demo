/*
 * Phase 1 — Step 5: events and event_attendees
 *
 * Community events as first-class objects. event_attendees links profiles
 * to events and enables co-attendance signals for inferred connections.
 * Also adds the deferred FK from connections.source_event_id → events.id.
 */

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.event_type as enum (
  'dinner',
  'roundtable',
  'workshop',
  'retreat',
  'summit',
  'other'
);

-- ---------------------------------------------------------------------------
-- events
-- ---------------------------------------------------------------------------

create table public.events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete restrict,
  title text not null,
  description text,
  event_type public.event_type not null default 'other',
  event_date timestamptz not null,
  location text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index events_org_id_idx on public.events (org_id);
create index events_event_date_idx on public.events (org_id, event_date desc);

create trigger events_set_updated_at
  before update on public.events
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- event_attendees
-- ---------------------------------------------------------------------------

create table public.event_attendees (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete restrict,
  event_id uuid not null references public.events (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  attended boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint event_attendees_event_profile_unique unique (event_id, profile_id)
);

create index event_attendees_org_id_idx on public.event_attendees (org_id);
create index event_attendees_event_id_idx on public.event_attendees (event_id);
create index event_attendees_profile_id_idx on public.event_attendees (profile_id);

create trigger event_attendees_set_updated_at
  before update on public.event_attendees
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Deferred FK: connections.source_event_id → events
-- ---------------------------------------------------------------------------

alter table public.connections
  add constraint connections_source_event_id_fkey
  foreign key (source_event_id) references public.events (id) on delete set null;
