# ADR 0011: Eventbrite sync — design intent

- Status: Proposed — scoping only, not yet built
- Date: 2026-08-17
- Deciders: Nova Collective team

## Context

Event attendee lists currently get into Nova Collective one way: export a CSV from wherever they were collected (Eventbrite, a spreadsheet, whatever) and upload it through Profiles → Import, optionally attaching it to an Event so everyone gets linked as an attendee and tagged with the event's name.

That works, but it's manual: someone has to remember to export the list and upload it, and Eventbrite holds richer data than a plain CSV export usually carries — ticket type, order date, checked-in status, answers to custom registration questions. Jordan asked whether Eventbrite could plug in directly, the way Google Calendar already does, so attendee data shows up automatically and with more detail.

## Important: verify feasibility before committing engineering time

Before scoping this further, it's worth being direct about something Google Calendar didn't have to deal with: Eventbrite's developer platform is in a visibly uncertain state right now.

- Eventbrite was acquired by Bending Spoons (an Italian tech holding company) in March 2026, and headcount has been cut substantially since (866 → 636 employees through end of 2025, per public reporting).
- Eventbrite's own support channels describe API support as community/self-service only — there's no dedicated developer support team to escalate to if something breaks.
- The public Event Search API was removed in 2025 (separate from the organizer-side Attendees API this integration would use, but a signal of the platform narrowing what it exposes).
- Multiple developer-community threads report trouble generating new API keys/private tokens on some accounts.

None of this rules the integration out — the core Events/Attendees v3 API and OAuth flow are still documented and appear to be live. But it means the very first step, before any code, should be a 5-minute check: **can Jordan actually generate a private token or OAuth app in her own Eventbrite account, today, under Account Settings → API Keys?** If that's blocked or the account doesn't have API access at this plan tier, this whole approach is a non-starter and the CSV-export path (already fully working) is the practical answer instead. If it works, the plan below holds.

## Decision (proposed, pending the feasibility check above)

Mirror the architectural pattern already proven for Google Calendar sync (ADR 0008) rather than inventing a new shape:

1. **Auth: a private token, not a full OAuth app.** Eventbrite supports a personal/organization "private token" (a long-lived bearer token generated in account settings) for accessing your own account's data — no OAuth consent screen, no app review, same simplicity as how Priya's single Google Workspace account authorizes calendar sync today. Store it encrypted, same as calendar refresh tokens (`TOKEN_ENCRYPTION_KEY`).

2. **New table `eventbrite_accounts`** (one row, realistically — this is a single-org tool):
   ```
   eventbrite_accounts
   ├── org_id
   ├── connected_by       references users
   ├── access_token       encrypted
   ├── sync_enabled
   ├── last_sync_at
   └── metadata           jsonb — last_run stats, errors
   ```

3. **`events` gains an optional link, not a new events table.** Rather than a parallel `eventbrite_events` table, add `events.eventbrite_event_id` (nullable, unique per org) — the same shape as the `imports.event_id` link added for CSV uploads. An Eventbrite event either matches an existing Nova Collective event (matched by admin, or by title+date heuristic) or creates a new one.

4. **Attendee sync reuses existing matching and tagging logic wholesale.** Eventbrite attendees get matched to profiles by `lower(email)` — same function already shared across Gmail sync, Calendar sync, and CSV import (`participant-email.ts`, profile email matching in `imports.ts`). A matched attendee: fill empty profile fields (ticket type, answers to custom questions → `profiles.extended`), add as `event_attendees`, tag with the event's name (`findOrCreateTagAndLink`, category `events`) — literally the same function import commit already calls. An unmatched attendee: queue for review, same pattern as `calendar_participant_reviews` / `email_participant_reviews` (ADR 0002).

5. **Sync trigger: polling cron, not webhooks, for V1.** Eventbrite's best-practice guidance is to prefer webhooks over polling for order/attendee changes, but webhooks add real complexity (a public signed-webhook endpoint, retry/replay handling, a second thing that can silently break). Given this is a single-org internal tool where "attendee list updates a few times a day around an event" is the real usage pattern, a scheduled poll (e.g. every 15–30 minutes for events happening soon, daily otherwise) is simpler to build, simpler to debug, and matches the existing calendar-sync cron pattern (`vercel.json` cron + `CRON_SECRET`-guarded route). Webhooks can be added later if polling proves too slow in practice.

## Consequences

- No new OAuth app review process (private token, same trust model as calendar sync's internal Google Workspace app).
- `events` table gets one new nullable column; no new core entity.
- All attendee-matching, tagging, and profile-fill logic is reused, not reinvented — lower risk, faster to build, and any future improvement to that shared logic benefits Eventbrite sync for free.
- Real risk: Eventbrite's platform stability and long-term API support are genuinely uncertain post-acquisition. This should be treated as a "build small, verify early" integration, not a multi-week bet — see the phased plan in `docs/specs/eventbrite-sync.md`.
- Full pipeline spec: `docs/specs/eventbrite-sync.md`.
