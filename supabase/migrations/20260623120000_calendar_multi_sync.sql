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
