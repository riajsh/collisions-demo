# Eventbrite Sync Specification (proposed)

- Version: 0.1 — scoping draft, not yet built
- Status: Proposed
- Related: ADR 0011, `docs/specs/calendar-sync.md` (the pattern this mirrors), `docs/specs/import-pipeline.md` (attendee matching + event tagging reused here)

---

## 1. Purpose

Pull attendee lists from Eventbrite automatically instead of exporting a CSV and uploading it manually — same outcome as today's "Attach to an event" import flow, but self-updating and carrying richer per-attendee detail (ticket type, order date, check-in status, custom registration question answers).

---

## 2. Before anything else: the feasibility check

Do this first, before writing any code:

1. Log into the Eventbrite account that owns your events.
2. Go to Account Settings → **Developer Links** / **API Keys**.
3. Confirm you can generate a private OAuth token.

If that's not available (locked behind a paid tier, disabled for the account, or the "Create API Key" option is missing/broken — all of which have been reported by other users since Eventbrite's 2026 ownership change), stop here. The CSV export → import flow you already have is the fallback and requires no further work.

If you can generate a token, the rest of this spec holds.

---

## 3. Scope

### In scope (proposed V1)

- One connected Eventbrite account per org (`eventbrite_accounts`), authenticated with a private token
- Manual mapping: pick which Eventbrite event corresponds to which Nova Collective event (or create a new Nova Collective event from it)
- Pull attendees for mapped events on a schedule (cron), not in real time
- Match attendees to profiles by `lower(email)` — reuses the same matching function as CSV import, Gmail sync, and Calendar sync
- Matched attendee → filled profile fields (ticket type, custom question answers → `profiles.extended`), added as `event_attendees`, tagged with the event's name (same `findOrCreateTagAndLink` call import commit already uses)
- Unmatched attendee → queued for review (same pattern as `calendar_participant_reviews`), not silently dropped and not auto-created as a profile
- Manual "sync now" button in addition to the scheduled cron
- Admin-only connect/manage screen, mirroring `/admin/integrations`'s calendar account rows

### Out of scope (V1)

- Webhooks / real-time updates (see ADR 0011 — polling first, webhooks later if needed)
- Two-way sync (creating or editing Eventbrite events from Nova Collective)
- Ticket sales / revenue reporting
- Multiple Eventbrite accounts (orgs, not just one connected account) — add only if actually needed
- Auto-creating a Nova Collective event for every Eventbrite event without a human picking/confirming the mapping

---

## 4. Data model additions

```
eventbrite_accounts
├── id
├── org_id
├── connected_by         references users
├── access_token         encrypted (same TOKEN_ENCRYPTION_KEY pattern as calendar_accounts.refresh_token)
├── sync_enabled         boolean
├── last_sync_at
└── metadata             jsonb — { last_run: { eventsChecked, attendeesProcessed, errors[] } }

events
└── eventbrite_event_id  text, nullable, unique per org — links a Nova Collective event to its Eventbrite source

eventbrite_attendee_reviews        (mirrors calendar_participant_reviews)
├── id
├── org_id
├── eventbrite_event_id
├── email
├── name
├── ticket_type
├── status                pending / linked / created / ignored
└── profile_id            nullable, set once resolved
```

No changes needed to `profiles`, `event_attendees`, or `tags` — those are reused exactly as they exist today.

---

## 5. Sync pipeline

```
┌──────────────┐    ┌───────────────────────┐    ┌──────────────────────────┐
│ Vercel Cron  │───▶│ eventbrite-sync route │───▶│ For each mapped event    │
│ every 30 min │    │ (only near-term events)│    │ (events.eventbrite_event_id│
└──────────────┘    └───────────────────────┘    │  is set)                 │
                                                  └────────────┬─────────────┘
                                                               ▼
                                                  ┌──────────────────────────┐
                                                  │ Eventbrite: GET          │
                                                  │ /events/{id}/attendees/  │
                                                  │ (paginated)              │
                                                  └────────────┬─────────────┘
                                                               ▼
                                                  ┌──────────────────────────┐
                                                  │ For each attendee:       │
                                                  │  matched  → fill profile,│
                                                  │   add attendee, tag      │
                                                  │  unmatched → review row  │
                                                  └──────────────────────────┘
```

Implementation would live in `src/lib/integrations/eventbrite/` — `client.ts` (thin API wrapper), `sync.ts` (the loop above), reusing `participant-email.ts` and the same `findOrCreateTagAndLink`-equivalent helper import commit uses (worth extracting that into a shared function at build time, since it'll then have three callers: import, the event page's bulk-add action, and this).

---

## 6. Event mapping

Eventbrite events and Nova Collective events are not automatically the same thing — a human needs to confirm the link once per event:

1. Admin screen lists the org's upcoming/recent Eventbrite events (via `GET /users/me/events/`).
2. For each, either: pick an existing Nova Collective event to link, or click "Create Nova Collective event from this" (pre-fills title/date from Eventbrite).
3. Once linked, `events.eventbrite_event_id` is set and the cron picks it up on its next run.

This mirrors the existing "Attach to an event" step at CSV upload — same one-time human decision, just triggered from the Eventbrite side instead of an upload.

---

## 7. Rate limits and sync cadence

- Eventbrite's documented limit is roughly 2,000 requests/hour per token — not a real constraint at this scale (a handful of mapped events, polled every 30 minutes).
- Only poll events happening soon (e.g. within the next 2 weeks) or that finished in the last 48 hours frequently; older linked events fall back to a slow daily reconciliation pass, same tiering logic as calendar sync's backfill/lookahead windows.
- Cache event metadata (title, date, venue) — only attendee lists need re-fetching often, per Eventbrite's own guidance.

---

## 8. Error handling

| Failure | Behaviour |
|---|---|
| Token invalid/revoked | Set `sync_enabled=false`, surface a clear "reconnect Eventbrite" prompt in Admin |
| Rate limited | Log, skip this run, retry next cron |
| Eventbrite event deleted/cancelled | Leave the Nova Collective event alone; stop polling that mapping, flag it in the admin screen |
| Partial page failure | Log per-attendee error in stats; continue the rest of the batch (same tolerance as calendar sync) |

---

## 9. Effort estimate (rough)

Given this reuses the matching/tagging logic wholesale and mirrors an already-built pattern, this is closer in size to the Calendar sync build than a from-scratch integration — Google Calendar sync (ADR 0008) was roughly a multi-day, phased build with its own migration, cron, and review UI. Ballpark phases:

1. **Feasibility check + connect flow** (private token, `eventbrite_accounts` table, encrypted storage) — small.
2. **Event mapping screen** (list Eventbrite events, link or create) — small–medium.
3. **Attendee pull + matching + tagging + review queue** — medium (the bulk of the work, though most of the matching/tagging code is reused, not new).
4. **Cron wiring + error handling + admin visibility** (sync status, last run, errors) — small.

Recommend building in that order and pausing after phase 1 to confirm the token actually works reliably before investing in the rest.

---

## 10. Open questions for Jordan

- Confirmed: does your Eventbrite account/plan actually let you generate a private token? (Blocks everything else if not.)
- Do you want unmatched attendees to require manual review before becoming profiles (like Calendar sync), or auto-create like a CSV "new" row does? Recommend review-first initially, matching the more cautious existing pattern for auto-pulled (not manually uploaded) data.
- Is 30-minute polling often enough, or do you need closer-to-real-time updates around an event (which would push us toward webhooks sooner than planned)?
- Single Eventbrite account, or does the team use more than one?

---

## 11. Acceptance criteria (once built)

- [ ] Feasibility check passed: a private token can be generated and stored
- [ ] Linking an Eventbrite event to a Nova Collective event persists and survives a re-sync without duplicating
- [ ] A matched attendee (by email) gets added as an event attendee and tagged with the event's name, without creating a duplicate profile
- [ ] An unmatched attendee produces a review row, never a silently auto-created profile
- [ ] Re-running the sync is idempotent — no duplicate attendees, tags, or review rows
- [ ] A revoked/invalid token disables sync and surfaces clearly in Admin, rather than failing silently
- [ ] Rate limits are respected; a sync run never exceeds Eventbrite's documented cap
