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
