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
