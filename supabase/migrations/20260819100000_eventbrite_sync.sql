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
