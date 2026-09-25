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
