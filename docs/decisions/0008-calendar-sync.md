# ADR 0008: Google Calendar sync — design intent

- Status: Accepted — **Phase 1.1 shipped**
- Date: 2026-06-20
- Deciders: Nova Collective team

## Implementation status (2026-06-21)

Phase 1.1 migrations are applied and locked. The following are live:

- Tables: `calendar_accounts`, `calendar_events`, `calendar_participant_reviews` (`supabase/migrations/20260621100000_calendar.sql`)
- OAuth connect/callback: `api/auth/google-calendar/connect`, `api/auth/google-calendar/callback`
- Cron handler: `api/cron/calendar-sync` (daily 03:00 UTC per `vercel.json`)
- Admin review UI: `/admin/calendar-sync/review`
- Sync logic: `src/lib/integrations/calendar/` (incremental `nextSyncToken`, 12-month backfill, 3-month lookahead, internal-participant filtering via `ORG_INTERNAL_EMAIL_DOMAINS`)

The "Do not build in Phase 1" decision below was the original Phase 1 gate. It no longer applies — treat this ADR as design intent plus shipped reference, not a stop sign.

## Context

Industry research shows 79% of opportunity-relevant data never enters CRMs due to manual entry friction. The Gmail sync (ADR 0007) captures email evidence automatically. The highest-signal gap remaining is **meetings**: every team member has meetings with founders, investors, and partners recorded in Google Calendar. Without calendar sync, those meetings are only logged if someone manually creates an activity. That friction is high enough that most meetings go unlogged.

Google Calendar uses the same OAuth 2.0 flow as Gmail. The `https://www.googleapis.com/auth/calendar.readonly` scope is sufficient — it grants read access to all events across calendars the user can access, which is what participant matching and meeting activity generation require. No write scopes are needed. The architectural pattern is identical to `gmail_accounts` + `gmail_sync` cron.

## Decision

**Phase 1 (historical):** Do not build Google Calendar sync in Phase 1. Design for it now so Phase 1.1 is a clean additive build, not a retrofit. That gate is closed — Phase 1.1 is shipped (see status note above).

Specifically:

1. **Reserve `calendar_sync` in the `activities.source` enum.** This column already carries `gmail_sync / manual / event_system / import`. Adding `calendar_sync` costs nothing now and avoids a migration later.

2. **Reserve `calendar_event_id` as a recognised `source_ref` value.** `activities.source_ref` is free text used for idempotent re-sync. Calendar event IDs will follow the pattern of `gmail_thread_id` — document this convention so Phase 1.1 can use the same idempotency logic.

3. **The Phase 1.1 table shape** (shipped in `20260621100000_calendar.sql`):

   ```
   calendar_accounts
   ├── user_id         references users
   ├── email           the Google account
   ├── refresh_token   encrypted
   ├── sync_enabled    boolean
   ├── last_sync_at
   └── sync_cursor     (nextSyncToken for incremental sync)

   calendar_events
   ├── google_event_id   unique per org
   ├── calendar_account_id
   ├── title
   ├── description
   ├── participants      jsonb — {email, name, response_status}
   ├── start_at
   ├── end_at
   └── is_deleted        tombstone, not hard delete
   ```

4. **Participant matching** follows the same logic as Gmail sync: match by `lower(email)` to `profiles.email`, generate `meeting`-type activity on match, queue unmatched participants in `calendar_participant_reviews` (separate table from `email_participant_reviews`; same ADR 0002 queue pattern).

5. **Scope**: sync only events where a team member is the organiser or an attendee, and at least one external participant is present. Skip internal-only meetings.

## Consequences

- `activities.source` enum includes `calendar_sync` from Phase 1 migrations. No Phase 1 behaviour changes.
- Phase 1.1 adds `calendar_accounts` and `calendar_events` tables, a new cron job, and reuses the participant-matching logic from `gmail_sync`. Full pipeline spec: `docs/specs/calendar-sync.md`.
- Combined Gmail + Calendar sync covers the two highest-volume relationship evidence channels without requiring any manual logging from the team.
- The `calendar_accounts` OAuth flow is separate from `gmail_accounts` (different scope, different token). Admin UI additions are minimal.
- `calendar.readonly` is a sensitive scope but **verification is not required** — the Google Cloud project OAuth app is configured as Internal user type (org Google Workspace only). Internal apps bypass the OAuth verification process entirely. Phase 1.1 build can proceed immediately.
