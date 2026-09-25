/*
 * Phase 1 — Step 7: activities
 *
 * Evidence timeline — every meaningful interaction becomes one row attributed
 * to a single profile (V1 design: one row per profile per interaction).
 * source + source_ref enable idempotent re-sync from Gmail, calendar, and imports.
 * Introduction activities carry attribution fields for conversion tracking.
 */

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.activity_type as enum (
  'email',
  'meeting',
  'event',
  'introduction',
  'note',
  'call',
  'other'
);

create type public.activity_source as enum (
  'gmail_sync',
  'calendar_sync',
  'manual',
  'event_system',
  'import'
);

create type public.introduction_outcome as enum (
  'pending',
  'accepted',
  'led_to_meeting',
  'no_response'
);

-- ---------------------------------------------------------------------------
-- activities
-- ---------------------------------------------------------------------------

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete restrict,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  activity_type public.activity_type not null,
  title text not null,
  summary text,
  activity_date timestamptz not null,
  source public.activity_source not null,
  source_ref text,
  introduced_by uuid references public.users (id) on delete set null,
  introduction_outcome public.introduction_outcome,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index activities_org_id_idx on public.activities (org_id);
create index activities_profile_id_idx on public.activities (profile_id);
create index activities_activity_date_idx on public.activities (profile_id, activity_date desc);
create index activities_source_ref_idx on public.activities (org_id, profile_id, source, source_ref)
  where source_ref is not null;

create trigger activities_set_updated_at
  before update on public.activities
  for each row
  execute function public.set_updated_at();
