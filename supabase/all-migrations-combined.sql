-- ===== 20260620100000_organisations_users.sql =====
/*
 * Phase 1 — Step 1: organisations and users
 *
 * Establishes the tenant boundary (organisations) and maps Supabase Auth users
 * to internal team members (users). Every subsequent table references org_id
 * from organisations. email_access_level on organisations supports the
 * two-tier email privacy model (ADR 0003); V1 default is restricted_body_access.
 */

-- ---------------------------------------------------------------------------
-- Shared: updated_at trigger (reused by all mutable tables)
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.email_access_level as enum (
  'metadata_only',
  'restricted_body_access',
  'full_body_access'
);

-- ---------------------------------------------------------------------------
-- organisations
-- ---------------------------------------------------------------------------

create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  email_access_level public.email_access_level not null default 'restricted_body_access',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint organisations_slug_unique unique (slug)
);

create trigger organisations_set_updated_at
  before update on public.organisations
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- users (internal team; id mirrors auth.users)
-- ---------------------------------------------------------------------------

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  org_id uuid not null references public.organisations (id) on delete restrict,
  email text not null,
  full_name text not null,
  role text not null default 'member'
    check (role in ('admin', 'member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index users_org_id_idx on public.users (org_id);
create unique index users_org_email_idx on public.users (org_id, lower(email));

create trigger users_set_updated_at
  before update on public.users
  for each row
  execute function public.set_updated_at();

-- ===== 20260620100001_profiles_tags.sql =====
/*
 * Phase 1 — Step 2: profiles, tags, profile_tags
 *
 * External people (profiles) are the participant records relationships attach to.
 * Tags classify profiles; profile_tags is the join table. Dedup on import and
 * email sync uses lower(email) per org (ADR 0004). organisation_name_normalised
 * supports same-company connection inference (computed at write, never displayed).
 */

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete restrict,
  full_name text not null,
  email text,
  phone text,
  linkedin_url text,
  website_url text,
  organisation_name text,
  occupation text,
  location_city text,
  location_country text,
  bio text,
  source text not null default 'manual'
    check (source in ('csv', 'email', 'manual')),
  organisation_name_normalised text,
  extended jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_org_id_idx on public.profiles (org_id);

create unique index profiles_org_email_unique_idx
  on public.profiles (org_id, lower(email))
  where email is not null;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- tags
-- ---------------------------------------------------------------------------

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete restrict,
  name text not null,
  category text not null default 'other'
    check (category in ('sector', 'role', 'interest', 'other')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index tags_org_name_unique_idx on public.tags (org_id, name);
create index tags_org_id_idx on public.tags (org_id);

create trigger tags_set_updated_at
  before update on public.tags
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- profile_tags
-- ---------------------------------------------------------------------------

create table public.profile_tags (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete restrict,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint profile_tags_profile_tag_unique unique (profile_id, tag_id)
);

create index profile_tags_org_id_idx on public.profile_tags (org_id);
create index profile_tags_profile_id_idx on public.profile_tags (profile_id);
create index profile_tags_tag_id_idx on public.profile_tags (tag_id);

create trigger profile_tags_set_updated_at
  before update on public.profile_tags
  for each row
  execute function public.set_updated_at();

-- ===== 20260620100002_relationships.sql =====
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

-- ===== 20260620100003_connections.sql =====
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

-- ===== 20260620100004_events.sql =====
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

-- ===== 20260620100005_gmail.sql =====
/*
 * Phase 1 — Step 6: gmail_accounts, email_threads, email_messages,
 *               email_participant_reviews
 *
 * Raw email communications, separate from activities. Ecosystem-owned sync
 * (ADR 0007). Threads and messages upsert on natural keys per org for
 * idempotent re-runs. Unmatched external participants go to the review
 * queue (ADR 0002), not auto-created profiles. Body access is restricted
 * in the RLS migration (ADR 0003).
 */

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.participant_review_status as enum (
  'pending',
  'linked',
  'created',
  'ignored'
);

-- ---------------------------------------------------------------------------
-- gmail_accounts
-- ---------------------------------------------------------------------------

create table public.gmail_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete restrict,
  user_id uuid not null references public.users (id) on delete cascade,
  email text not null,
  refresh_token text not null,
  sync_enabled boolean not null default true,
  last_sync_at timestamptz,
  sync_cursor text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint gmail_accounts_org_email_unique unique (org_id, email)
);

create index gmail_accounts_org_id_idx on public.gmail_accounts (org_id);
create index gmail_accounts_user_id_idx on public.gmail_accounts (user_id);

create trigger gmail_accounts_set_updated_at
  before update on public.gmail_accounts
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- email_threads
-- ---------------------------------------------------------------------------

create table public.email_threads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete restrict,
  gmail_thread_id text not null,
  gmail_account_id uuid not null references public.gmail_accounts (id) on delete cascade,
  subject text,
  participants jsonb not null default '[]'::jsonb,
  project_label text,
  last_message_at timestamptz,
  message_count integer not null default 0,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint email_threads_org_gmail_thread_unique unique (org_id, gmail_thread_id)
);

create index email_threads_org_id_idx on public.email_threads (org_id);
create index email_threads_gmail_account_id_idx on public.email_threads (gmail_account_id);
create index email_threads_last_message_at_idx on public.email_threads (org_id, last_message_at desc);

create trigger email_threads_set_updated_at
  before update on public.email_threads
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- email_messages
-- ---------------------------------------------------------------------------

create table public.email_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete restrict,
  thread_id uuid not null references public.email_threads (id) on delete cascade,
  gmail_message_id text not null,
  sender text,
  recipients jsonb not null default '[]'::jsonb,
  body text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint email_messages_org_gmail_message_unique unique (org_id, gmail_message_id)
);

create index email_messages_org_id_idx on public.email_messages (org_id);
create index email_messages_thread_id_idx on public.email_messages (thread_id);
create index email_messages_sent_at_idx on public.email_messages (thread_id, sent_at desc);

create trigger email_messages_set_updated_at
  before update on public.email_messages
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- email_participant_reviews (unmatched participant queue, ADR 0002)
-- ---------------------------------------------------------------------------

create table public.email_participant_reviews (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete restrict,
  email text not null,
  display_name text,
  thread_id uuid not null references public.email_threads (id) on delete cascade,
  status public.participant_review_status not null default 'pending',
  profile_id uuid references public.profiles (id) on delete set null,
  reviewed_by uuid references public.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint email_participant_reviews_org_email_thread_unique unique (org_id, email, thread_id)
);

create index email_participant_reviews_org_id_idx on public.email_participant_reviews (org_id);
create index email_participant_reviews_thread_id_idx on public.email_participant_reviews (thread_id);
create index email_participant_reviews_status_idx on public.email_participant_reviews (org_id, status)
  where status = 'pending';

create trigger email_participant_reviews_set_updated_at
  before update on public.email_participant_reviews
  for each row
  execute function public.set_updated_at();

-- ===== 20260620100006_activities.sql =====
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

-- ===== 20260620100007_imports.sql =====
/*
 * Phase 1 — Step 8: imports and import_rows
 *
 * CSV import audit trail and row-level staging table. import_rows holds parsed
 * and mapped rows through dedup and review before commit (ADR 0004). Staging
 * rows are retained after commit for traceability and rollback reference.
 */

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.import_status as enum (
  'pending',
  'processing',
  'complete',
  'failed'
);

create type public.dedup_status as enum (
  'pending',
  'matched_email',
  'soft_match',
  'new',
  'error'
);

-- ---------------------------------------------------------------------------
-- imports
-- ---------------------------------------------------------------------------

create table public.imports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete restrict,
  filename text not null,
  source text not null
    check (source in ('clay', 'airtable', 'affinity', 'attio', 'hubspot', 'csv', 'other')),
  row_count integer not null default 0,
  status public.import_status not null default 'pending',
  created_by uuid not null references public.users (id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index imports_org_id_idx on public.imports (org_id);
create index imports_status_idx on public.imports (org_id, status);

create trigger imports_set_updated_at
  before update on public.imports
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- import_rows (staging)
-- ---------------------------------------------------------------------------

create table public.import_rows (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete restrict,
  import_id uuid not null references public.imports (id) on delete cascade,
  row_number integer not null,
  raw jsonb not null default '{}'::jsonb,
  normalized jsonb not null default '{}'::jsonb,
  dedup_status public.dedup_status not null default 'pending',
  matched_profile_id uuid references public.profiles (id) on delete set null,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint import_rows_import_row_number_unique unique (import_id, row_number),
  constraint import_rows_row_number_positive check (row_number > 0)
);

create index import_rows_org_id_idx on public.import_rows (org_id);
create index import_rows_import_id_idx on public.import_rows (import_id);
create index import_rows_dedup_status_idx on public.import_rows (import_id, dedup_status);

create trigger import_rows_set_updated_at
  before update on public.import_rows
  for each row
  execute function public.set_updated_at();

-- ===== 20260620100008_rls.sql =====
/*
 * Phase 1 — Step 9: Row Level Security
 *
 * Org isolation on every table: org_id = (select org_id from users where id = auth.uid()).
 * org_id is never accepted from the client — policies enforce session-derived org scope.
 *
 * Email privacy (ADR 0003): thread metadata is org-wide; message body and body fts
 * are restricted to admins, relationship owners for matched profiles on the thread,
 * or all org members when email_access_level = full_body_access. Column privileges
 * on email_messages.body and email_messages.fts enforce the body tier at the database
 * layer; a user-facing view exposes body conditionally.
 */

-- ---------------------------------------------------------------------------
-- Auth helper functions
-- ---------------------------------------------------------------------------

create or replace function public.auth_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from public.users where id = auth.uid()
$$;

create or replace function public.auth_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users
    where id = auth.uid()
      and role = 'admin'
  )
$$;

create or replace function public.org_has_full_body_access(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organisations
    where id = p_org_id
      and email_access_level = 'full_body_access'
  )
$$;

-- True when the current user may read email message bodies for a thread.
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
        -- Relationship owner for a profile whose email appears on the thread
        select 1
        from public.email_threads et
        join public.relationship_owners ro
          on ro.org_id = et.org_id
         and ro.user_id = auth.uid()
        join public.relationships r
          on r.id = ro.relationship_id
         and r.org_id = ro.org_id
        join public.profiles p
          on p.id = r.profile_id
         and p.org_id = r.org_id
        where et.id = p_thread_id
          and et.org_id = p_org_id
          and p.email is not null
          and exists (
            select 1
            from jsonb_array_elements(et.participants) as participant
            where lower(participant->>'email') = lower(p.email)
          )
      )
      or exists (
        -- Linked review row: owner of the linked profile
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
      -- metadata_only orgs never expose bodies to authenticated users
      select 1
      from public.organisations
      where id = p_org_id
        and email_access_level = 'metadata_only'
    )
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS on all tables
-- ---------------------------------------------------------------------------

alter table public.organisations enable row level security;
alter table public.users enable row level security;
alter table public.profiles enable row level security;
alter table public.tags enable row level security;
alter table public.profile_tags enable row level security;
alter table public.relationships enable row level security;
alter table public.relationship_owners enable row level security;
alter table public.relationship_sources enable row level security;
alter table public.connections enable row level security;
alter table public.events enable row level security;
alter table public.event_attendees enable row level security;
alter table public.gmail_accounts enable row level security;
alter table public.email_threads enable row level security;
alter table public.email_messages enable row level security;
alter table public.email_participant_reviews enable row level security;
alter table public.activities enable row level security;
alter table public.imports enable row level security;
alter table public.import_rows enable row level security;

-- ---------------------------------------------------------------------------
-- organisations (tenant row; match by id, not org_id)
-- ---------------------------------------------------------------------------

create policy organisations_select on public.organisations
  for select to authenticated
  using (id = public.auth_org_id());

create policy organisations_update on public.organisations
  for update to authenticated
  using (id = public.auth_org_id() and public.auth_is_admin())
  with check (id = public.auth_org_id() and public.auth_is_admin());

-- ---------------------------------------------------------------------------
-- users (org members visible within org; self always readable)
-- ---------------------------------------------------------------------------

create policy users_select on public.users
  for select to authenticated
  using (org_id = public.auth_org_id());

create policy users_insert on public.users
  for insert to authenticated
  with check (org_id = public.auth_org_id());

create policy users_update on public.users
  for update to authenticated
  using (org_id = public.auth_org_id())
  with check (org_id = public.auth_org_id());

create policy users_delete on public.users
  for delete to authenticated
  using (org_id = public.auth_org_id() and public.auth_is_admin());

-- ---------------------------------------------------------------------------
-- Standard org-scoped CRUD macro (applied per table below)
-- ---------------------------------------------------------------------------

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (org_id = public.auth_org_id());
create policy profiles_insert on public.profiles for insert to authenticated
  with check (org_id = public.auth_org_id());
create policy profiles_update on public.profiles for update to authenticated
  using (org_id = public.auth_org_id()) with check (org_id = public.auth_org_id());
create policy profiles_delete on public.profiles for delete to authenticated
  using (org_id = public.auth_org_id());

-- tags
create policy tags_select on public.tags for select to authenticated
  using (org_id = public.auth_org_id());
create policy tags_insert on public.tags for insert to authenticated
  with check (org_id = public.auth_org_id());
create policy tags_update on public.tags for update to authenticated
  using (org_id = public.auth_org_id()) with check (org_id = public.auth_org_id());
create policy tags_delete on public.tags for delete to authenticated
  using (org_id = public.auth_org_id());

-- profile_tags
create policy profile_tags_select on public.profile_tags for select to authenticated
  using (org_id = public.auth_org_id());
create policy profile_tags_insert on public.profile_tags for insert to authenticated
  with check (org_id = public.auth_org_id());
create policy profile_tags_update on public.profile_tags for update to authenticated
  using (org_id = public.auth_org_id()) with check (org_id = public.auth_org_id());
create policy profile_tags_delete on public.profile_tags for delete to authenticated
  using (org_id = public.auth_org_id());

-- relationships
create policy relationships_select on public.relationships for select to authenticated
  using (org_id = public.auth_org_id());
create policy relationships_insert on public.relationships for insert to authenticated
  with check (org_id = public.auth_org_id());
create policy relationships_update on public.relationships for update to authenticated
  using (org_id = public.auth_org_id()) with check (org_id = public.auth_org_id());
create policy relationships_delete on public.relationships for delete to authenticated
  using (org_id = public.auth_org_id());

-- relationship_owners
create policy relationship_owners_select on public.relationship_owners for select to authenticated
  using (org_id = public.auth_org_id());
create policy relationship_owners_insert on public.relationship_owners for insert to authenticated
  with check (org_id = public.auth_org_id());
create policy relationship_owners_update on public.relationship_owners for update to authenticated
  using (org_id = public.auth_org_id()) with check (org_id = public.auth_org_id());
create policy relationship_owners_delete on public.relationship_owners for delete to authenticated
  using (org_id = public.auth_org_id());

-- relationship_sources (append-only in V1; delete restricted to admin)
create policy relationship_sources_select on public.relationship_sources for select to authenticated
  using (org_id = public.auth_org_id());
create policy relationship_sources_insert on public.relationship_sources for insert to authenticated
  with check (org_id = public.auth_org_id());
create policy relationship_sources_update on public.relationship_sources for update to authenticated
  using (org_id = public.auth_org_id()) with check (org_id = public.auth_org_id());
create policy relationship_sources_delete on public.relationship_sources for delete to authenticated
  using (org_id = public.auth_org_id() and public.auth_is_admin());

-- connections
create policy connections_select on public.connections for select to authenticated
  using (org_id = public.auth_org_id());
create policy connections_insert on public.connections for insert to authenticated
  with check (org_id = public.auth_org_id());
create policy connections_update on public.connections for update to authenticated
  using (org_id = public.auth_org_id()) with check (org_id = public.auth_org_id());
create policy connections_delete on public.connections for delete to authenticated
  using (org_id = public.auth_org_id());

-- events
create policy events_select on public.events for select to authenticated
  using (org_id = public.auth_org_id());
create policy events_insert on public.events for insert to authenticated
  with check (org_id = public.auth_org_id());
create policy events_update on public.events for update to authenticated
  using (org_id = public.auth_org_id()) with check (org_id = public.auth_org_id());
create policy events_delete on public.events for delete to authenticated
  using (org_id = public.auth_org_id());

-- event_attendees
create policy event_attendees_select on public.event_attendees for select to authenticated
  using (org_id = public.auth_org_id());
create policy event_attendees_insert on public.event_attendees for insert to authenticated
  with check (org_id = public.auth_org_id());
create policy event_attendees_update on public.event_attendees for update to authenticated
  using (org_id = public.auth_org_id()) with check (org_id = public.auth_org_id());
create policy event_attendees_delete on public.event_attendees for delete to authenticated
  using (org_id = public.auth_org_id());

-- gmail_accounts (refresh_token readable only by account owner or admin)
create policy gmail_accounts_select on public.gmail_accounts for select to authenticated
  using (
    org_id = public.auth_org_id()
    and (user_id = auth.uid() or public.auth_is_admin())
  );
create policy gmail_accounts_insert on public.gmail_accounts for insert to authenticated
  with check (org_id = public.auth_org_id() and user_id = auth.uid());
create policy gmail_accounts_update on public.gmail_accounts for update to authenticated
  using (
    org_id = public.auth_org_id()
    and (user_id = auth.uid() or public.auth_is_admin())
  )
  with check (
    org_id = public.auth_org_id()
    and (user_id = auth.uid() or public.auth_is_admin())
  );
create policy gmail_accounts_delete on public.gmail_accounts for delete to authenticated
  using (
    org_id = public.auth_org_id()
    and (user_id = auth.uid() or public.auth_is_admin())
  );

-- email_threads (metadata org-wide within org, ADR 0003)
create policy email_threads_select on public.email_threads for select to authenticated
  using (org_id = public.auth_org_id());
create policy email_threads_insert on public.email_threads for insert to authenticated
  with check (org_id = public.auth_org_id());
create policy email_threads_update on public.email_threads for update to authenticated
  using (org_id = public.auth_org_id()) with check (org_id = public.auth_org_id());
create policy email_threads_delete on public.email_threads for delete to authenticated
  using (org_id = public.auth_org_id() and public.auth_is_admin());

-- email_messages (org row access; body/fts column privileges below)
create policy email_messages_select on public.email_messages for select to authenticated
  using (org_id = public.auth_org_id());
create policy email_messages_insert on public.email_messages for insert to authenticated
  with check (org_id = public.auth_org_id());
create policy email_messages_update on public.email_messages for update to authenticated
  using (org_id = public.auth_org_id()) with check (org_id = public.auth_org_id());
create policy email_messages_delete on public.email_messages for delete to authenticated
  using (org_id = public.auth_org_id() and public.auth_is_admin());

-- email_participant_reviews
create policy email_participant_reviews_select on public.email_participant_reviews for select to authenticated
  using (org_id = public.auth_org_id());
create policy email_participant_reviews_insert on public.email_participant_reviews for insert to authenticated
  with check (org_id = public.auth_org_id());
create policy email_participant_reviews_update on public.email_participant_reviews for update to authenticated
  using (org_id = public.auth_org_id()) with check (org_id = public.auth_org_id());
create policy email_participant_reviews_delete on public.email_participant_reviews for delete to authenticated
  using (org_id = public.auth_org_id() and public.auth_is_admin());

-- activities
create policy activities_select on public.activities for select to authenticated
  using (org_id = public.auth_org_id());
create policy activities_insert on public.activities for insert to authenticated
  with check (org_id = public.auth_org_id());
create policy activities_update on public.activities for update to authenticated
  using (org_id = public.auth_org_id()) with check (org_id = public.auth_org_id());
create policy activities_delete on public.activities for delete to authenticated
  using (org_id = public.auth_org_id());

-- imports (admin-only write in V1)
create policy imports_select on public.imports for select to authenticated
  using (org_id = public.auth_org_id());
create policy imports_insert on public.imports for insert to authenticated
  with check (org_id = public.auth_org_id() and public.auth_is_admin());
create policy imports_update on public.imports for update to authenticated
  using (org_id = public.auth_org_id() and public.auth_is_admin())
  with check (org_id = public.auth_org_id() and public.auth_is_admin());
create policy imports_delete on public.imports for delete to authenticated
  using (org_id = public.auth_org_id() and public.auth_is_admin());

-- import_rows
create policy import_rows_select on public.import_rows for select to authenticated
  using (org_id = public.auth_org_id());
create policy import_rows_insert on public.import_rows for insert to authenticated
  with check (org_id = public.auth_org_id() and public.auth_is_admin());
create policy import_rows_update on public.import_rows for update to authenticated
  using (org_id = public.auth_org_id() and public.auth_is_admin())
  with check (org_id = public.auth_org_id() and public.auth_is_admin());
create policy import_rows_delete on public.import_rows for delete to authenticated
  using (org_id = public.auth_org_id() and public.auth_is_admin());

-- ---------------------------------------------------------------------------
-- Two-tier email body access (ADR 0003)
-- Revoke direct SELECT on sensitive columns; expose via view with conditional body.
-- ---------------------------------------------------------------------------

revoke select (body) on public.email_messages from authenticated, anon;

create or replace view public.email_messages_user
with (security_invoker = true)
as
select
  em.id,
  em.org_id,
  em.thread_id,
  em.gmail_message_id,
  em.sender,
  em.recipients,
  case
    when public.user_can_read_email_body(em.org_id, em.thread_id) then em.body
    else null
  end as body,
  em.sent_at,
  em.created_at,
  em.updated_at
from public.email_messages em
where em.org_id = public.auth_org_id();

grant select on public.email_messages_user to authenticated;

comment on view public.email_messages_user is
  'User-facing email messages. Body is null unless the caller is admin, a relationship owner for a matched profile on the thread, or the org has full_body_access (ADR 0003).';

-- RPC for authorized body reads (explicit path for UI and body search)
create or replace function public.get_email_message_body(p_message_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select em.body
  from public.email_messages em
  where em.id = p_message_id
    and em.org_id = public.auth_org_id()
    and public.user_can_read_email_body(em.org_id, em.thread_id)
$$;

grant execute on function public.get_email_message_body(uuid) to authenticated;

-- ===== 20260620100009_search.sql =====
/*
 * Phase 1 — Step 10: Full-text search
 *
 * Generated tsvector columns and GIN indexes per docs/specs/search.md and ADR 0006.
 * email_messages.fts is excluded from the general search_index view — body search
 * is a separate query path gated by the same body access policy as direct reads (ADR 0003).
 */

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column fts tsvector generated always as (
    setweight(to_tsvector('english', coalesce(full_name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(organisation_name, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(occupation, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(location_city, '') || ' ' || coalesce(location_country, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(bio, '')), 'D')
  ) stored;

create index profiles_fts_idx on public.profiles using gin (fts);

-- ---------------------------------------------------------------------------
-- activities
-- ---------------------------------------------------------------------------

alter table public.activities
  add column fts tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(summary, '')), 'B')
  ) stored;

create index activities_fts_idx on public.activities using gin (fts);

-- ---------------------------------------------------------------------------
-- events
-- ---------------------------------------------------------------------------

alter table public.events
  add column fts tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B')
  ) stored;

create index events_fts_idx on public.events using gin (fts);

-- ---------------------------------------------------------------------------
-- tags
-- ---------------------------------------------------------------------------

alter table public.tags
  add column fts tsvector generated always as (
    to_tsvector('english', coalesce(name, ''))
  ) stored;

create index tags_fts_idx on public.tags using gin (fts);

-- ---------------------------------------------------------------------------
-- email_threads (subjects — org-wide)
-- ---------------------------------------------------------------------------

alter table public.email_threads
  add column fts tsvector generated always as (
    to_tsvector('english', coalesce(subject, ''))
  ) stored;

create index email_threads_fts_idx on public.email_threads using gin (fts);

-- ---------------------------------------------------------------------------
-- email_messages (bodies — owner/admin only, ADR 0003)
-- ---------------------------------------------------------------------------

alter table public.email_messages
  add column fts tsvector generated always as (
    to_tsvector('english', coalesce(body, ''))
  ) stored;

create index email_messages_fts_idx on public.email_messages using gin (fts);

-- Restrict body fts to the same access tier as body text
revoke select (fts) on public.email_messages from authenticated, anon;

-- Body search RPC: returns message ids the caller may search/read
create or replace function public.search_email_message_bodies(p_query text, p_limit integer default 20)
returns table (
  id uuid,
  thread_id uuid,
  gmail_message_id text,
  sent_at timestamptz,
  rank real
)
language sql
stable
security definer
set search_path = public
as $$
  select
    em.id,
    em.thread_id,
    em.gmail_message_id,
    em.sent_at,
    ts_rank_cd(em.fts, query) as rank
  from public.email_messages em,
       plainto_tsquery('english', p_query) query
  where em.org_id = public.auth_org_id()
    and em.fts @@ query
    and public.user_can_read_email_body(em.org_id, em.thread_id)
  order by rank desc
  limit greatest(p_limit, 1)
$$;

grant execute on function public.search_email_message_bodies(text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- search_index view (convenience union; excludes email_messages per ADR 0003)
-- ---------------------------------------------------------------------------

create or replace view public.search_index
with (security_invoker = true)
as
  select id, org_id, 'profile'::text as entity_type, full_name as title, organisation_name as subtitle, fts
  from public.profiles
  union all
  select id, org_id, 'activity'::text, title, summary as subtitle, fts
  from public.activities
  union all
  select id, org_id, 'event'::text, title, description as subtitle, fts
  from public.events
  union all
  select id, org_id, 'tag'::text, name as title, null::text as subtitle, fts
  from public.tags
  union all
  select id, org_id, 'thread'::text, subject as title, null::text as subtitle, fts
  from public.email_threads;

grant select on public.search_index to authenticated;

comment on view public.search_index is
  'Cross-entity FTS union for org-scoped search. email_messages excluded — body search uses search_email_message_bodies() (ADR 0003).';

-- ===== 20260620100010_imports_storage.sql =====
/*
 * Phase 1 — imports storage bucket
 *
 * Original CSV files for import audit trail (import-pipeline.md §3).
 * Path: {org_id}/imports/{import_id}/original.csv
 * Private bucket; admin service role uploads; org-scoped read for authenticated admins.
 */

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'imports',
  'imports',
  false,
  10485760,
  array['text/csv', 'application/csv', 'text/plain']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists imports_storage_select on storage.objects;
drop policy if exists imports_storage_insert on storage.objects;
drop policy if exists imports_storage_update on storage.objects;
drop policy if exists imports_storage_delete on storage.objects;

create policy imports_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'imports'
    and (storage.foldername(name))[1] = public.auth_org_id()::text
  );

create policy imports_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'imports'
    and public.auth_is_admin()
    and (storage.foldername(name))[1] = public.auth_org_id()::text
  );

create policy imports_storage_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'imports'
    and public.auth_is_admin()
    and (storage.foldername(name))[1] = public.auth_org_id()::text
  )
  with check (
    bucket_id = 'imports'
    and public.auth_is_admin()
    and (storage.foldername(name))[1] = public.auth_org_id()::text
  );

create policy imports_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'imports'
    and public.auth_is_admin()
    and (storage.foldername(name))[1] = public.auth_org_id()::text
  );

-- ===== 20260621100000_calendar.sql =====
/*
 * Phase 1.1 — calendar_accounts, calendar_events, calendar_participant_reviews
 *
 * Google Calendar sync (ADR 0008). Same org-scoped, idempotent pattern as Gmail.
 * Events upsert on (org_id, google_event_id). Unmatched external participants
 * go to calendar_participant_reviews (ADR 0002 pattern).
 */

-- ---------------------------------------------------------------------------
-- calendar_accounts
-- ---------------------------------------------------------------------------

create table public.calendar_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete restrict,
  user_id uuid not null references public.users (id) on delete cascade,
  email text not null,
  refresh_token text not null,
  sync_enabled boolean not null default true,
  last_sync_at timestamptz,
  sync_cursor text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint calendar_accounts_org_email_unique unique (org_id, email)
);

create index calendar_accounts_org_id_idx on public.calendar_accounts (org_id);
create index calendar_accounts_user_id_idx on public.calendar_accounts (user_id);

create trigger calendar_accounts_set_updated_at
  before update on public.calendar_accounts
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- calendar_events
-- ---------------------------------------------------------------------------

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete restrict,
  google_event_id text not null,
  calendar_account_id uuid not null references public.calendar_accounts (id) on delete cascade,
  title text,
  description text,
  participants jsonb not null default '[]'::jsonb,
  start_at timestamptz,
  end_at timestamptz,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint calendar_events_org_google_event_unique unique (org_id, google_event_id)
);

create index calendar_events_org_id_idx on public.calendar_events (org_id);
create index calendar_events_calendar_account_id_idx on public.calendar_events (calendar_account_id);
create index calendar_events_start_at_idx on public.calendar_events (org_id, start_at desc);

create trigger calendar_events_set_updated_at
  before update on public.calendar_events
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- calendar_participant_reviews (unmatched participant queue, ADR 0002)
-- ---------------------------------------------------------------------------

create table public.calendar_participant_reviews (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete restrict,
  email text not null,
  display_name text,
  calendar_event_id uuid not null references public.calendar_events (id) on delete cascade,
  status public.participant_review_status not null default 'pending',
  profile_id uuid references public.profiles (id) on delete set null,
  reviewed_by uuid references public.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint calendar_participant_reviews_org_email_event_unique
    unique (org_id, email, calendar_event_id)
);

create index calendar_participant_reviews_org_id_idx
  on public.calendar_participant_reviews (org_id);
create index calendar_participant_reviews_event_id_idx
  on public.calendar_participant_reviews (calendar_event_id);
create index calendar_participant_reviews_status_idx
  on public.calendar_participant_reviews (org_id, status)
  where status = 'pending';

create trigger calendar_participant_reviews_set_updated_at
  before update on public.calendar_participant_reviews
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.calendar_accounts enable row level security;
alter table public.calendar_events enable row level security;
alter table public.calendar_participant_reviews enable row level security;

-- calendar_accounts (refresh_token readable only by account owner or admin)
create policy calendar_accounts_select on public.calendar_accounts for select to authenticated
  using (
    org_id = public.auth_org_id()
    and (user_id = auth.uid() or public.auth_is_admin())
  );
create policy calendar_accounts_insert on public.calendar_accounts for insert to authenticated
  with check (org_id = public.auth_org_id() and user_id = auth.uid());
create policy calendar_accounts_update on public.calendar_accounts for update to authenticated
  using (
    org_id = public.auth_org_id()
    and (user_id = auth.uid() or public.auth_is_admin())
  )
  with check (
    org_id = public.auth_org_id()
    and (user_id = auth.uid() or public.auth_is_admin())
  );
create policy calendar_accounts_delete on public.calendar_accounts for delete to authenticated
  using (
    org_id = public.auth_org_id()
    and (user_id = auth.uid() or public.auth_is_admin())
  );

-- calendar_events (metadata org-wide within org)
create policy calendar_events_select on public.calendar_events for select to authenticated
  using (org_id = public.auth_org_id());
create policy calendar_events_insert on public.calendar_events for insert to authenticated
  with check (org_id = public.auth_org_id());
create policy calendar_events_update on public.calendar_events for update to authenticated
  using (org_id = public.auth_org_id()) with check (org_id = public.auth_org_id());
create policy calendar_events_delete on public.calendar_events for delete to authenticated
  using (org_id = public.auth_org_id() and public.auth_is_admin());

-- calendar_participant_reviews
create policy calendar_participant_reviews_select on public.calendar_participant_reviews
  for select to authenticated
  using (org_id = public.auth_org_id());
create policy calendar_participant_reviews_insert on public.calendar_participant_reviews
  for insert to authenticated
  with check (org_id = public.auth_org_id());
create policy calendar_participant_reviews_update on public.calendar_participant_reviews
  for update to authenticated
  using (org_id = public.auth_org_id()) with check (org_id = public.auth_org_id());
create policy calendar_participant_reviews_delete on public.calendar_participant_reviews
  for delete to authenticated
  using (org_id = public.auth_org_id() and public.auth_is_admin());

-- ===== 20260621120000_perf_indexes.sql =====
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

-- ===== 20260622120000_activity_recency_past_only.sql =====
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

-- ===== 20260623085606_security_rls_hardening.sql =====
/*
 * Security hardening — audit fixes (2026-06-23)
 *
 * - Block member self-escalation to admin (users.role)
 * - Restrict imports / import_rows / storage CSV reads to admins
 * - Restrict tag DDL to admins
 * - Protect team-member profiles (email matches org users) from member delete/update
 * - Restrict calendar_participant_reviews writes to admins
 * - Restrict activity deletes to admins
 */

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- True when a profile email belongs to an internal team member (users row in org).
create or replace function public.profile_is_team_member(p_org_id uuid, p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_email is not null
    and exists (
      select 1
      from public.users u
      where u.org_id = p_org_id
        and lower(u.email) = lower(trim(p_email))
    )
$$;

revoke all on function public.profile_is_team_member(uuid, text) from public, anon;
grant execute on function public.profile_is_team_member(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- users — self-update only; role changes via service role / triggers only
-- ---------------------------------------------------------------------------

drop policy if exists users_insert on public.users;

create policy users_insert on public.users
  for insert to authenticated
  with check (id = auth.uid() and org_id = public.auth_org_id());

drop policy if exists users_update on public.users;

create policy users_update on public.users
  for update to authenticated
  using (id = auth.uid() and org_id = public.auth_org_id())
  with check (id = auth.uid() and org_id = public.auth_org_id());

create or replace function public.prevent_users_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and auth.uid() is not null then
    raise exception 'role changes are not permitted';
  end if;

  return new;
end;
$$;

drop trigger if exists users_prevent_role_change on public.users;

create trigger users_prevent_role_change
  before update on public.users
  for each row
  execute function public.prevent_users_role_change();

-- ---------------------------------------------------------------------------
-- imports — admin-only read (staging CSV PII)
-- ---------------------------------------------------------------------------

drop policy if exists imports_select on public.imports;
drop policy if exists import_rows_select on public.import_rows;

create policy imports_select on public.imports
  for select to authenticated
  using (org_id = public.auth_org_id() and public.auth_is_admin());

create policy import_rows_select on public.import_rows
  for select to authenticated
  using (org_id = public.auth_org_id() and public.auth_is_admin());

-- ---------------------------------------------------------------------------
-- imports storage — admin-only read (matches table RLS intent)
-- ---------------------------------------------------------------------------

drop policy if exists imports_storage_select on storage.objects;

create policy imports_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'imports'
    and public.auth_is_admin()
    and (storage.foldername(name))[1] = public.auth_org_id()::text
  );

-- ---------------------------------------------------------------------------
-- tags — admin-only DDL (members use profile_tags via separate policies)
-- ---------------------------------------------------------------------------

drop policy if exists tags_insert on public.tags;
drop policy if exists tags_update on public.tags;
drop policy if exists tags_delete on public.tags;

create policy tags_insert on public.tags
  for insert to authenticated
  with check (org_id = public.auth_org_id() and public.auth_is_admin());

create policy tags_update on public.tags
  for update to authenticated
  using (org_id = public.auth_org_id() and public.auth_is_admin())
  with check (org_id = public.auth_org_id() and public.auth_is_admin());

create policy tags_delete on public.tags
  for delete to authenticated
  using (org_id = public.auth_org_id() and public.auth_is_admin());

-- ---------------------------------------------------------------------------
-- profiles — team-member rows protected from member delete/update
-- ---------------------------------------------------------------------------

drop policy if exists profiles_update on public.profiles;
drop policy if exists profiles_delete on public.profiles;

create policy profiles_update on public.profiles
  for update to authenticated
  using (
    org_id = public.auth_org_id()
    and (
      public.auth_is_admin()
      or not public.profile_is_team_member(org_id, email)
    )
  )
  with check (
    org_id = public.auth_org_id()
    and (
      public.auth_is_admin()
      or not public.profile_is_team_member(org_id, email)
    )
  );

create policy profiles_delete on public.profiles
  for delete to authenticated
  using (
    org_id = public.auth_org_id()
    and (
      public.auth_is_admin()
      or not public.profile_is_team_member(org_id, email)
    )
  );

-- ---------------------------------------------------------------------------
-- activities — delete restricted to admins (evidence integrity)
-- ---------------------------------------------------------------------------

drop policy if exists activities_delete on public.activities;

create policy activities_delete on public.activities
  for delete to authenticated
  using (org_id = public.auth_org_id() and public.auth_is_admin());

-- ---------------------------------------------------------------------------
-- calendar_participant_reviews — member read; admin write
-- ---------------------------------------------------------------------------

drop policy if exists calendar_participant_reviews_insert on public.calendar_participant_reviews;
drop policy if exists calendar_participant_reviews_update on public.calendar_participant_reviews;

create policy calendar_participant_reviews_insert on public.calendar_participant_reviews
  for insert to authenticated
  with check (org_id = public.auth_org_id() and public.auth_is_admin());

create policy calendar_participant_reviews_update on public.calendar_participant_reviews
  for update to authenticated
  using (org_id = public.auth_org_id() and public.auth_is_admin())
  with check (org_id = public.auth_org_id() and public.auth_is_admin());

-- ===== 20260623120000_calendar_multi_sync.sql =====
/*
 * Multi-calendar sync — cross-calendar occurrence dedup via iCalUID + start_at.
 * Per-calendar sync tokens live in calendar_accounts.metadata.sync_cursors (no column change).
 */

alter table public.calendar_events
  add column if not exists ical_uid text,
  add column if not exists source_calendar_id text;

create index if not exists calendar_events_org_occurrence_idx
  on public.calendar_events (org_id, ical_uid, start_at)
  where ical_uid is not null;

create unique index if not exists calendar_events_org_occurrence_unique
  on public.calendar_events (org_id, ical_uid, start_at)
  where ical_uid is not null and not is_deleted;

-- ===== 20260623150000_dedupe_calendar_sync_activities.sql =====
/*
 * Remove duplicate calendar_sync activities created before cross-calendar dedup.
 * Legacy rows used google_event_id as source_ref; newer rows use ical_uid#start_at.
 */

delete from public.activities
where source = 'calendar_sync'
  and id in (
    select id
    from (
      select
        id,
        row_number() over (
          partition by org_id, profile_id, activity_date, title
          order by
            case when source_ref like '%#%' then 0 else 1 end,
            created_at asc,
            id asc
        ) as row_num
      from public.activities
      where source = 'calendar_sync'
        and title is not null
    ) duplicates
    where row_num > 1
  );

-- ===== 20260623190000_merge_profiles_atomic.sql =====
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

-- ===== 20260623200000_forward_security_hardening.sql =====
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

-- ===== 20260623210000_latest_calendar_meetings_rpc.sql =====
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

-- ===== 20260623220000_login_rate_limit.sql =====
/*
 * Distributed login rate limiting — shared across serverless instances.
 * Server actions call consume_login_rate_limit via service role.
 */

create table if not exists public.login_rate_limit_buckets (
  bucket_key text primary key,
  attempt_count integer not null default 1,
  reset_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists login_rate_limit_buckets_reset_at_idx
  on public.login_rate_limit_buckets (reset_at);

alter table public.login_rate_limit_buckets enable row level security;

revoke all on table public.login_rate_limit_buckets from public, anon, authenticated;

create or replace function public.consume_login_rate_limit(
  p_bucket_key text,
  p_limit integer,
  p_window_seconds integer default 900
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_reset_at timestamptz;
  v_count integer;
begin
  if p_bucket_key is null or btrim(p_bucket_key) = '' then
    return true;
  end if;

  if p_limit is null or p_limit < 1 then
    return true;
  end if;

  select attempt_count, reset_at
  into v_count, v_reset_at
  from public.login_rate_limit_buckets
  where bucket_key = p_bucket_key
  for update;

  if not found then
    insert into public.login_rate_limit_buckets (bucket_key, attempt_count, reset_at)
    values (
      p_bucket_key,
      1,
      v_now + make_interval(secs => p_window_seconds)
    );
    return true;
  end if;

  if v_reset_at <= v_now then
    update public.login_rate_limit_buckets
    set
      attempt_count = 1,
      reset_at = v_now + make_interval(secs => p_window_seconds),
      updated_at = v_now
    where bucket_key = p_bucket_key;
    return true;
  end if;

  if v_count >= p_limit then
    return false;
  end if;

  update public.login_rate_limit_buckets
  set
    attempt_count = attempt_count + 1,
    updated_at = v_now
  where bucket_key = p_bucket_key;

  return true;
end;
$$;

revoke all on function public.consume_login_rate_limit(text, integer, integer) from public, anon;
grant execute on function public.consume_login_rate_limit(text, integer, integer) to service_role;

-- ===== 20260623230000_function_execute_hardening.sql =====
/*
 * Phase 1 — Security hardening: function execute privileges
 *
 * Supabase security advisor (lint 0028) flagged SECURITY DEFINER functions
 * callable by anon via PostgREST /rest/v1/rpc/.... Internal helpers and email
 * body RPCs are not public API (ADR 0003). Revoke anon/PUBLIC execute; re-grant
 * only to authenticated where policies or views require it. Pins set_updated_at
 * search_path (lint 0011).
 */

-- ---------------------------------------------------------------------------
-- Pin search_path on trigger function (lint 0011)
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Revoke default PUBLIC execute, then grant intentionally
-- ---------------------------------------------------------------------------

-- Internal: only invoked inside other SECURITY DEFINER functions
revoke all on function public.org_has_full_body_access(uuid) from public, anon, authenticated;

-- Used in RLS policies and security_invoker views — authenticated only
revoke all on function public.auth_org_id() from public, anon;
grant execute on function public.auth_org_id() to authenticated;

revoke all on function public.auth_is_admin() from public, anon;
grant execute on function public.auth_is_admin() to authenticated;

revoke all on function public.user_can_read_email_body(uuid, uuid) from public, anon;
grant execute on function public.user_can_read_email_body(uuid, uuid) to authenticated;

-- User-facing email RPCs (ADR 0003) — authenticated only
revoke all on function public.get_email_message_body(uuid) from public, anon;
grant execute on function public.get_email_message_body(uuid) to authenticated;

revoke all on function public.search_email_message_bodies(text, integer) from public, anon;
grant execute on function public.search_email_message_bodies(text, integer) to authenticated;

-- ===== 20260813120000_tags_category_narrowing.sql =====
/*
 * Narrow tags.category to the three categories the team actually uses:
 * Expertise, Industry, Signal/Influence — replacing the original
 * sector / role / interest / other placeholders from the Phase 1 build.
 *
 * Existing rows (if any) are remapped to the closest new category first
 * so the new check constraint doesn't reject them:
 *   sector   -> industry
 *   role     -> expertise
 *   interest -> signal_influence
 *   other    -> expertise (fallback)
 */

update public.tags set category = 'industry' where category = 'sector';
update public.tags set category = 'expertise' where category = 'role';
update public.tags set category = 'signal_influence' where category = 'interest';
update public.tags set category = 'expertise' where category = 'other';

alter table public.tags drop constraint tags_category_check;

alter table public.tags
  alter column category set default 'expertise';

alter table public.tags
  add constraint tags_category_check
    check (category in ('expertise', 'industry', 'signal_influence'));

-- ===== 20260814090000_import_event_attach.sql =====
/*
 * Support attaching a bulk CSV import to an Event:
 * - tags.category gains a fourth value, 'events', so each bulk-uploaded
 *   attendee list can be tagged with the event name.
 * - imports.event_id links an import batch to the event its attendees
 *   should be linked to on commit (nullable — most imports aren't tied
 *   to an event).
 */

alter table public.tags drop constraint tags_category_check;

alter table public.tags
  add constraint tags_category_check
    check (category in ('expertise', 'industry', 'signal_influence', 'events'));

alter table public.imports
  add column event_id uuid references public.events (id) on delete set null;

create index imports_event_id_idx on public.imports (event_id);

-- ===== 20260817120000_eventbrite_accounts.sql =====
/*
 * Eventbrite sync, Phase 1 — connect flow only (ADR 0011, docs/specs/eventbrite-sync.md).
 *
 * eventbrite_accounts holds one connected Eventbrite private token per org,
 * encrypted the same way calendar_accounts.refresh_token is (TOKEN_ENCRYPTION_KEY,
 * encrypted/decrypted at the application layer — this column just stores text).
 *
 * This migration only adds the connect-flow table. Event mapping and attendee
 * sync (Phases 2-3) will add further tables/columns later once Phase 1 is
 * confirmed working.
 */

create table public.eventbrite_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete restrict,
  connected_by uuid not null references public.users (id) on delete cascade,
  account_name text,
  account_email text,
  access_token text not null,
  sync_enabled boolean not null default true,
  last_sync_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint eventbrite_accounts_org_unique unique (org_id)
);

create index eventbrite_accounts_org_id_idx on public.eventbrite_accounts (org_id);

create trigger eventbrite_accounts_set_updated_at
  before update on public.eventbrite_accounts
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — admin-only. This is an org-wide integration (one shared token), not a
-- per-user connection like calendar_accounts, so there's no "owner" concept —
-- any admin can view, connect, or disconnect it.
-- ---------------------------------------------------------------------------

alter table public.eventbrite_accounts enable row level security;

create policy eventbrite_accounts_select on public.eventbrite_accounts for select to authenticated
  using (org_id = public.auth_org_id() and public.auth_is_admin());
create policy eventbrite_accounts_insert on public.eventbrite_accounts for insert to authenticated
  with check (org_id = public.auth_org_id() and public.auth_is_admin());
create policy eventbrite_accounts_update on public.eventbrite_accounts for update to authenticated
  using (org_id = public.auth_org_id() and public.auth_is_admin())
  with check (org_id = public.auth_org_id() and public.auth_is_admin());
create policy eventbrite_accounts_delete on public.eventbrite_accounts for delete to authenticated
  using (org_id = public.auth_org_id() and public.auth_is_admin());

-- ===== 20260819100000_eventbrite_sync.sql =====
/*
 * Eventbrite sync, Phases 2-3 — event mapping + attendee pull (ADR 0011,
 * docs/specs/eventbrite-sync.md). Phase 1 (the connect screen) already
 * shipped eventbrite_accounts.
 *
 * - events.eventbrite_event_id links a Nova Collective event to its Eventbrite
 *   source, same shape as imports.event_id — nullable, one Eventbrite
 *   event maps to at most one Nova Collective event per org.
 * - eventbrite_attendee_reviews holds attendees whose email didn't match
 *   any existing profile, mirroring calendar_participant_reviews (ADR
 *   0002's unmatched-participant review pattern) — reuses the same
 *   participant_review_status enum.
 */

alter table public.events
  add column eventbrite_event_id text;

create unique index events_org_eventbrite_event_id_unique_idx
  on public.events (org_id, eventbrite_event_id)
  where eventbrite_event_id is not null;

create table public.eventbrite_attendee_reviews (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete restrict,
  event_id uuid not null references public.events (id) on delete cascade,
  eventbrite_attendee_id text not null,
  email text not null,
  display_name text,
  ticket_type text,
  status public.participant_review_status not null default 'pending',
  profile_id uuid references public.profiles (id) on delete set null,
  reviewed_by uuid references public.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint eventbrite_attendee_reviews_org_event_attendee_unique
    unique (org_id, event_id, eventbrite_attendee_id)
);

create index eventbrite_attendee_reviews_org_id_idx
  on public.eventbrite_attendee_reviews (org_id);
create index eventbrite_attendee_reviews_event_id_idx
  on public.eventbrite_attendee_reviews (event_id);
create index eventbrite_attendee_reviews_status_idx
  on public.eventbrite_attendee_reviews (org_id, status)
  where status = 'pending';

create trigger eventbrite_attendee_reviews_set_updated_at
  before update on public.eventbrite_attendee_reviews
  for each row
  execute function public.set_updated_at();

alter table public.eventbrite_attendee_reviews enable row level security;

create policy eventbrite_attendee_reviews_select on public.eventbrite_attendee_reviews
  for select to authenticated
  using (org_id = public.auth_org_id());
create policy eventbrite_attendee_reviews_insert on public.eventbrite_attendee_reviews
  for insert to authenticated
  with check (org_id = public.auth_org_id());
create policy eventbrite_attendee_reviews_update on public.eventbrite_attendee_reviews
  for update to authenticated
  using (org_id = public.auth_org_id()) with check (org_id = public.auth_org_id());
create policy eventbrite_attendee_reviews_delete on public.eventbrite_attendee_reviews
  for delete to authenticated
  using (org_id = public.auth_org_id() and public.auth_is_admin());

-- ===== 20260820100000_fix_eventbrite_bytes_names.sql =====
/*
 * One-time data fix: Eventbrite has had a bug since its 2026 ownership
 * change where some attendee names come through as Python "bytes" reprs
 * instead of plain text — e.g. "b'Eva' b'Kulkarni'" instead of
 * "Eva Kulkarni". The app itself now strips this on every future sync
 * (src/lib/integrations/eventbrite/client.ts), but rows already pulled in
 * before that fix need a one-time cleanup.
 */

update public.eventbrite_attendee_reviews
set display_name = regexp_replace(display_name, 'b([''"])(.*?)\1', '\2', 'g')
where display_name ~ 'b[''"]';

update public.eventbrite_attendee_reviews
set ticket_type = regexp_replace(ticket_type, 'b([''"])(.*?)\1', '\2', 'g')
where ticket_type ~ 'b[''"]';

-- ===== 20260820110000_eventbrite_enrichment.sql =====
/*
 * Eventbrite enrichment — pull registration-question answers (role, phone,
 * company size) into profiles, flag possible updates on existing profiles
 * instead of silently overwriting, and make company size searchable.
 *
 * - profiles.company_size: new free-text field (e.g. "11-50"), populated
 *   from a mapped Eventbrite question answer. Widened into profiles.fts so
 *   it's searchable alongside role/occupation.
 * - eventbrite_question_mappings: one row per (event, Eventbrite question),
 *   remembering which Nova Collective field it feeds — a one-time admin decision
 *   per linked event, same pattern as event mapping itself.
 * - eventbrite_attendee_reviews.mapped_fields: the mapped answers captured
 *   at sync time for an attendee who didn't match anyone yet, so they can
 *   be applied once the review turns into (or links to) a profile.
 * - eventbrite_profile_update_reviews: when a matched attendee's answers
 *   differ from what's already on their profile (not just filling a blank),
 *   queue it for a human to apply or ignore rather than overwriting.
 */

alter table public.profiles
  add column company_size text;

-- The search_index view reads profiles.fts, so it has to be dropped before
-- we can drop and rebuild that column, then recreated identically afterward.
drop view public.search_index;

drop index public.profiles_fts_idx;

alter table public.profiles
  drop column fts;

alter table public.profiles
  add column fts tsvector generated always as (
    setweight(to_tsvector('english', coalesce(full_name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(organisation_name, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(occupation, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(company_size, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(location_city, '') || ' ' || coalesce(location_country, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(bio, '')), 'D')
  ) stored;

create index profiles_fts_idx on public.profiles using gin (fts);

create or replace view public.search_index
with (security_invoker = true)
as
  select id, org_id, 'profile'::text as entity_type, full_name as title, organisation_name as subtitle, fts
  from public.profiles
  union all
  select id, org_id, 'activity'::text, title, summary as subtitle, fts
  from public.activities
  union all
  select id, org_id, 'event'::text, title, description as subtitle, fts
  from public.events
  union all
  select id, org_id, 'tag'::text, name as title, null::text as subtitle, fts
  from public.tags
  union all
  select id, org_id, 'thread'::text, subject as title, null::text as subtitle, fts
  from public.email_threads;

grant select on public.search_index to authenticated;

comment on view public.search_index is
  'Cross-entity FTS union for org-scoped search. email_messages excluded — body search uses search_email_message_bodies() (ADR 0003).';

alter table public.eventbrite_attendee_reviews
  add column mapped_fields jsonb not null default '{}'::jsonb;

create type public.profile_update_review_status as enum (
  'pending',
  'applied',
  'ignored'
);

create table public.eventbrite_question_mappings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete restrict,
  event_id uuid not null references public.events (id) on delete cascade,
  eventbrite_question_id text not null,
  question_text text not null,
  target_field text not null default 'ignore'
    check (target_field in ('role', 'company_size', 'phone', 'ignore')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint eventbrite_question_mappings_org_event_question_unique
    unique (org_id, event_id, eventbrite_question_id)
);

create index eventbrite_question_mappings_event_id_idx
  on public.eventbrite_question_mappings (event_id);

create trigger eventbrite_question_mappings_set_updated_at
  before update on public.eventbrite_question_mappings
  for each row
  execute function public.set_updated_at();

create table public.eventbrite_profile_update_reviews (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete restrict,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  eventbrite_attendee_id text not null,
  proposed_changes jsonb not null default '{}'::jsonb,
  status public.profile_update_review_status not null default 'pending',
  reviewed_by uuid references public.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint eventbrite_profile_update_reviews_org_event_attendee_unique
    unique (org_id, event_id, eventbrite_attendee_id)
);

create index eventbrite_profile_update_reviews_org_id_idx
  on public.eventbrite_profile_update_reviews (org_id);
create index eventbrite_profile_update_reviews_status_idx
  on public.eventbrite_profile_update_reviews (org_id, status)
  where status = 'pending';

create trigger eventbrite_profile_update_reviews_set_updated_at
  before update on public.eventbrite_profile_update_reviews
  for each row
  execute function public.set_updated_at();

alter table public.eventbrite_question_mappings enable row level security;
alter table public.eventbrite_profile_update_reviews enable row level security;

create policy eventbrite_question_mappings_select on public.eventbrite_question_mappings
  for select to authenticated using (org_id = public.auth_org_id());
create policy eventbrite_question_mappings_insert on public.eventbrite_question_mappings
  for insert to authenticated with check (org_id = public.auth_org_id() and public.auth_is_admin());
create policy eventbrite_question_mappings_update on public.eventbrite_question_mappings
  for update to authenticated
  using (org_id = public.auth_org_id() and public.auth_is_admin())
  with check (org_id = public.auth_org_id() and public.auth_is_admin());
create policy eventbrite_question_mappings_delete on public.eventbrite_question_mappings
  for delete to authenticated using (org_id = public.auth_org_id() and public.auth_is_admin());

create policy eventbrite_profile_update_reviews_select on public.eventbrite_profile_update_reviews
  for select to authenticated using (org_id = public.auth_org_id());
create policy eventbrite_profile_update_reviews_insert on public.eventbrite_profile_update_reviews
  for insert to authenticated with check (org_id = public.auth_org_id());
create policy eventbrite_profile_update_reviews_update on public.eventbrite_profile_update_reviews
  for update to authenticated
  using (org_id = public.auth_org_id()) with check (org_id = public.auth_org_id());
create policy eventbrite_profile_update_reviews_delete on public.eventbrite_profile_update_reviews
  for delete to authenticated using (org_id = public.auth_org_id() and public.auth_is_admin());

-- ===== 20260820120000_ignore_info_requested_reviews.sql =====
/*
 * One-time cleanup: Eventbrite shows a literal "Info Requested" placeholder
 * name/email for additional attendees on a group ticket who haven't filled
 * in their own registration details yet. Before the sync code started
 * filtering these out (see client.ts normaliseAttendeeEmail), they were
 * queued as ordinary review rows — this clears out any already sitting in
 * the queue. Nothing else is affected; real attendees are untouched.
 */

update public.eventbrite_attendee_reviews
set status = 'ignored',
    reviewed_at = now()
where status = 'pending'
  and (
    lower(email) = 'info requested'
    or lower(display_name) like '%info requested%'
  );

-- ===== 20260820130000_eventbrite_company_and_role.sql =====
/*
 * Some events ask "What's your company & role?" as a single combined
 * question instead of two separate ones. Adds a new question-mapping target
 * ("company_and_role") so that one answer can be split into both the Role
 * and Company profile fields — the actual splitting logic lives in the app
 * (src/lib/ai/split-company-role.ts), this just widens the allowed value.
 */

alter table public.eventbrite_question_mappings
  drop constraint eventbrite_question_mappings_target_field_check;

alter table public.eventbrite_question_mappings
  add constraint eventbrite_question_mappings_target_field_check
  check (target_field in ('role', 'company_size', 'phone', 'company_and_role', 'ignore'));

-- ===== 20260820140000_eventbrite_company_field.sql =====
/*
 * Adds a standalone "company" question-mapping target, for events that ask
 * for company name as its own separate registration question (as opposed to
 * "company_and_role", which is for a single combined question that needs
 * splitting). A "company"-mapped answer fills the organisation_name profile
 * field directly — see src/lib/integrations/eventbrite/sync.ts.
 */

alter table public.eventbrite_question_mappings
  drop constraint eventbrite_question_mappings_target_field_check;

alter table public.eventbrite_question_mappings
  add constraint eventbrite_question_mappings_target_field_check
  check (target_field in ('role', 'company', 'company_size', 'phone', 'company_and_role', 'ignore'));

-- ===== 20260821100000_eventbrite_note_field.sql =====
/*
 * Adds a "note" question-mapping target. Unlike role/company/company
 * size/phone, a "note"-mapped answer doesn't fill in a profile field — it's
 * an open-ended answer (e.g. "what are you struggling with right now?")
 * that becomes its own dated entry on the attendee's profile timeline,
 * tagged to the event it came from. See src/lib/integrations/eventbrite/
 * sync.ts and src/lib/data/eventbrite-reviews.ts.
 */

alter table public.eventbrite_question_mappings
  drop constraint eventbrite_question_mappings_target_field_check;

alter table public.eventbrite_question_mappings
  add constraint eventbrite_question_mappings_target_field_check
  check (target_field in ('role', 'company', 'company_size', 'phone', 'company_and_role', 'note', 'ignore'));

-- ===== 20260824100000_eventbrite_resumable_sync.sql =====
/*
 * Makes the org-wide Eventbrite sync resumable, so it stops depending on
 * finishing every linked event inside a single server request.
 *
 * - eventbrite_accounts.sync_progress: when a sync run doesn't finish in one
 *   burst, this holds exactly where it left off (which events are still
 *   queued, which are done, and the running totals so far) so the next
 *   burst — whether that's the same browser tab asking for more, or the
 *   next scheduled cron tick — picks up rather than starting over. Null
 *   means no run is currently in progress.
 * - eventbrite_answer_ai_cache: remembers the AI's last cleaned/split
 *   result for a given attendee's exact raw answer to a mapped question.
 *   Eventbrite resends every attendee's full current answers on every
 *   sync, even ones nobody has touched since the last run — this stops
 *   those unchanged answers from being sent to the AI (and paid for)
 *   again every single time, and as a side effect keeps the result stable
 *   run-to-run instead of an AI model occasionally phrasing an unchanged
 *   answer slightly differently.
 */

alter table public.eventbrite_accounts
  add column sync_progress jsonb;

create table public.eventbrite_answer_ai_cache (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  eventbrite_attendee_id text not null,
  field text not null,
  raw_answer text not null,
  result jsonb not null,
  updated_at timestamptz not null default now(),

  constraint eventbrite_answer_ai_cache_unique
    unique (org_id, eventbrite_attendee_id, field)
);

create index eventbrite_answer_ai_cache_org_id_idx
  on public.eventbrite_answer_ai_cache (org_id);

alter table public.eventbrite_answer_ai_cache enable row level security;

-- Written only by the sync job (service role) — no direct end-user access
-- needed, admin or otherwise, so there's no authenticated-role policy here,
-- matching how purely-internal sync-support tables are handled elsewhere.

-- ===== 20260824110000_profile_notes_summary.sql =====
alter table public.profiles
  add column notes_summary text,
  add column notes_summary_generated_at timestamptz,
  add column notes_summary_note_count integer;

-- ===== 20260824120000_ai_profile_attributes.sql =====
/*
 * Foundation for AI-powered "intelligent search" over profiles:
 * - tags.category gains two more values, 'seniority' and 'function', so the
 *   AI can classify a profile's seniority level (e.g. "VP", "C-level") and
 *   functional area (e.g. "Marketing", "Operations") the same visible way
 *   'industry' tags already work.
 * - profile_tags.source distinguishes tags a person added manually from
 *   ones the AI inferred, so re-running enrichment can safely replace its
 *   own previous guesses without ever touching a tag a human added by hand
 *   (this matters most for 'industry', which both humans and the AI can
 *   tag).
 * - profiles.ai_enrichment_generated_at / ai_enrichment_source_hash let the
 *   enrichment job skip profiles whose occupation/company/bio haven't
 *   changed since it last ran, so re-running it (e.g. on a schedule) is
 *   cheap and doesn't needlessly re-tag everyone every time.
 */

alter table public.tags drop constraint tags_category_check;

alter table public.tags
  add constraint tags_category_check
    check (category in ('expertise', 'industry', 'signal_influence', 'events', 'seniority', 'function'));

-- 'function' and 'industry' both use "Other" as a fallback value in their
-- fixed vocabularies, and tags were previously unique per (org_id, name)
-- only — so the first profile classified as function="Other" would create
-- a tag that a later industry="Other" classification would incorrectly
-- reuse (findOrCreateTag matches by name only), attaching it to the wrong
-- category. Scoping uniqueness to (org_id, name, category) lets the same
-- name exist once per category, which is what the two-dimension vocab
-- design actually needs.
drop index if exists public.tags_org_name_unique_idx;

create unique index tags_org_name_category_unique_idx
  on public.tags (org_id, name, category);

alter table public.profile_tags
  add column source text not null default 'manual'
    check (source in ('manual', 'ai_inferred'));

alter table public.profiles
  add column ai_enrichment_generated_at timestamptz,
  add column ai_enrichment_source_hash text;

