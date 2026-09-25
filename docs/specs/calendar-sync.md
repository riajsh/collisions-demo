# Google Calendar Sync Specification

- Version: 1.0
- Status: Accepted — **Phase 1.1 shipped 2026-06-21**
- Related: ADR 0008, ADR 0010 (Tier A auto-writes), domain-model-v1.md §5.10, `docs/specs/gmail-sync.md` (participant matching pattern), `src/lib/integrations/calendar/`

Daily incremental sync of Google Calendar events for connected team calendar accounts. Store event metadata, match external participants to profiles, generate meeting activities, record provenance, and queue unmatched participants for admin review.

---

## 1. Purpose

Capture meeting evidence automatically. Email sync gives correspondence breadth; calendar sync gives confirmed bilateral and multi-party interactions. Combined, they cover the two highest-volume relationship evidence channels without manual logging.

Ecosystem owns this entirely (ADR 0007 pattern). Separate OAuth client and tokens from Gmail.

---

## 2. Scope

### In scope (Phase 1.1 — shipped)

- Multiple connected calendar accounts (`calendar_accounts`)
- Incremental sync via Google Calendar `nextSyncToken`
- **Multi-calendar sync:** primary plus subscribed `@novacollective.io` calendars and team room resources (`CALENDAR_SYNC_DOMAINS` / `ORG_INTERNAL_EMAIL_DOMAINS`); per-calendar tokens in `calendar_accounts.metadata.sync_cursors`
- Cross-calendar dedup on `(org_id, ical_uid, start_at)`; activities keyed by iCalUID occurrence
- Initial backfill: **12 months back**, **3 months forward**
- Ongoing cron keeps the forward window rolling; events beyond lookahead are skipped and purged
- External participant → profile matching by `lower(email)`
- `meeting` activity generation per matched profile per **past** event (Tier A, ADR 0010 — no human confirm step)
- `relationship_sources` append with `source_type=meeting`
- Unmatched participant review queue (`calendar_participant_reviews`, ADR 0002 pattern)
- Internal participant filtering (`ORG_INTERNAL_EMAIL_DOMAINS` + `users.email`)
- Skip internal-only meetings (no external participants)
- Hardcoded ignore patterns for noreply addresses (`participant-email.ts`)
- Cancelled events tombstoned (`is_deleted=true`); activities preserved
- Idempotent re-runs on `(org_id, google_event_id)` and `(org_id, email, calendar_event_id)` review keys
- Admin review UI at `/admin/calendar-sync/review`
- OAuth connect at `/api/auth/google-calendar/connect`

### Out of scope (V1 / Phase 1.1)

- Calendar write (create/update events from Ecosystem)
- Auto-inferred profile-to-profile connections from co-attendance (Phase 2 / Agent 1 per ADR 0009)
- AI meeting notes (Phase 3)
- Recurring event expansion beyond Google's `singleEvents: true` behaviour

---

## 3. Whose calendar?

| Question | Answer |
|---|---|
| One account or many? | **Many.** One row per connected user in `calendar_accounts`. |
| Who can connect? | Any org member connects their own account; admin can disable `sync_enabled`. |
| Which events? | Events on the user's **primary** calendar where at least one **external** participant is present. |
| Token access | RLS: account owner or admin only (`calendar_accounts` select policy). |

---

## 4. Sync pipeline

```
┌─────────────┐    ┌──────────────────┐    ┌─────────────────────────┐
│ Vercel Cron │───▶│ calendar-sync    │───▶│ For each calendar_account│
│ 03:00 UTC   │    │ route handler    │    │ with sync_enabled=true   │
└─────────────┘    └──────────────────┘    └────────────┬────────────┘
                                                        │
         ┌──────────────────────────────────────────────┘
         ▼
  ┌──────────────────────┐
  │ Purge internal sync  │  (team profiles polluted by pre-fix data)
  │ Purge beyond lookahead│  (far-future recurring events)
  └──────────┬───────────┘
             ▼
  ┌──────────────────────┐
  │ Google Calendar API  │
  │ events.list          │
  │ syncToken or backfill│
  └──────────┬───────────┘
             ▼
  ┌──────────────────────┐
  │ For each event:      │
  │ upsert calendar_events│
  │ match participants   │
  └──────────┬───────────┘
             ▼
  ┌──────────────────────┐
  │ External + matched   │──▶ activity (source=calendar_sync)
  │                      │    relationship_source (meeting)
  │ External + no match  │──▶ calendar_participant_reviews
  │ Internal / ignored   │──▶ skip
  │ Beyond lookahead     │──▶ skip (no store on initial parse)
  │ Internal-only event  │──▶ skip entirely
  └──────────────────────┘
```

Implementation: `src/lib/integrations/calendar/sync.ts`, `match.ts`.

Cron: `vercel.json` → `/api/cron/calendar-sync` at `0 3 * * *`. Auth: `CRON_SECRET` header (see `docs/technical-architecture.md` §7).

Manual purge without full sync: `npm run purge:calendar` (`scripts/purge-calendar-sync.mjs`).

---

## 5. Sync windows

| Constant | Value | Location |
|---|---|---|
| `CALENDAR_BACKFILL_MONTHS` | 12 | `src/lib/integrations/calendar/env.ts` |
| `CALENDAR_LOOKAHEAD_WEEKS` | 4 | same |

- **Initial connect:** `timeMin` = now − 12 months, `timeMax` = now + 4 weeks. Paginate with `pageToken`.
- **Incremental:** use stored `sync_cursor` (`nextSyncToken`). No time bounds on incremental pages.
- **Skip on ingest:** events with `start_at` beyond lookahead are not processed for activities/reviews.
- **Purge each run:** delete `calendar_sync` activities and meeting provenance beyond lookahead; purge internal-profile calendar data. See `purge-beyond-lookahead.ts`, `purge-internal.ts`.

---

## 6. Participant matching

Same rules as Gmail sync (`docs/specs/gmail-sync.md` §5.1). Implementation shared in `src/lib/integrations/participant-email.ts`.

### 6.1 Internal identification

1. `ORG_INTERNAL_EMAIL_DOMAINS` env var (comma-separated, e.g. `novacollective.io`)
2. All `users.email` for the org (loaded at sync start)

Internal participants: stored in event `participants` jsonb for context; **no** profile, activity, or review row.

### 6.2 External-only gate

Event skipped entirely unless `hasExternalParticipant()` returns true — at least one participant who is not internal and not on the ignore list.

### 6.3 Match resolution

For each external participant:

| Match | Action |
|---|---|
| Profile found by email | Upsert `meeting` activity (`source=calendar_sync`, `source_ref=google_event_id`); append `relationship_sources` |
| No profile | Upsert `calendar_participant_reviews` row (`status=pending`) |
| Ignored email pattern | Skip |

Idempotency: activity keyed by `(org_id, profile_id, source, source_ref)`; review keyed by `(org_id, email, calendar_event_id)`.

---

## 7. Review queue

Admin → Calendar sync review (`/admin/calendar-sync/review`). Requires `requireAdmin()`.

| Action | Behaviour |
|---|---|
| **Link to existing profile** | Set `profile_id`, `status=linked`. Backfill activity + relationship_source. |
| **Create profile** | Create profile + relationship. Link review row, `status=created`. Backfill. |
| **Ignore** | `status=ignored` |
| **Ignore all team** | Bulk ignore pending reviews for internal addresses |

Review list groups unmatched rows by email. Internal (team) matches shown in collapsed section with bulk ignore.

Matched meetings tab shows recent auto-linked meetings for audit.

---

## 8. Deleted and cancelled events

| Google status | Ecosystem behaviour |
|---|---|
| `cancelled` | Set `calendar_events.is_deleted=true`. Do not remove existing activities (evidence was real). |
| Event removed from incremental feed | Handled by sync token tombstone semantics |

---

## 9. OAuth

- Scope: `https://www.googleapis.com/auth/calendar.readonly`
- Separate client ID/secret from Gmail (`GOOGLE_CALENDAR_*` env vars)
- Refresh token encrypted with `TOKEN_ENCRYPTION_KEY`
- Internal Google Cloud OAuth app (Workspace only) — no verification required

---

## 10. Error handling

| Failure | Behaviour |
|---|---|
| OAuth token invalid | Mark `sync_enabled=false`, log in `metadata.last_run` |
| Rate limit | Log error, continue next account; retry next cron |
| Partial page failure | Log per-event error in stats; continue batch |
| Duplicate participant in event | Idempotent upsert |

Sync stats stored on `calendar_accounts.metadata`: events processed, activities created, reviews queued, errors, `syncing` flag.

---

## 11. RLS summary

| Table | Select policy |
|---|---|
| `calendar_accounts` | Owner or admin only (protects refresh_token) |
| `calendar_events` | All org members |
| `calendar_participant_reviews` | All org members (admin UI gated in app) |

Cron uses service role; all writes include explicit `org_id`.

---

## 12. Acceptance criteria

- [ ] Connecting a calendar triggers backfill without duplicate activities on re-run
- [ ] External participant with matching profile email gets meeting activity + relationship_source
- [ ] Unmatched participant creates `calendar_participant_reviews` row, not profile
- [ ] Internal-only meetings produce no activities and no review rows
- [ ] Team member emails (`@novacollective.io`) never queue reviews
- [ ] Events beyond 3-month lookahead are not ingested as activities
- [ ] Re-running sync purges stale far-future and internal-profile calendar data
- [ ] Cancelled events tombstoned; existing activities preserved
- [ ] Non-owner cannot read another user's `calendar_accounts.refresh_token`
- [ ] Cron rejects requests without valid `CRON_SECRET`
