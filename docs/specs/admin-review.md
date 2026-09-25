# Admin Review Queues Specification

- Version: 1.0
- Status: Accepted
- Related: ADR 0002, ADR 0004, `docs/specs/gmail-sync.md` §11, `docs/specs/calendar-sync.md` §7, `docs/specs/import-pipeline.md`, information-architecture.md §Admin

The daily workhorse screens in the first months post-launch. Three review surfaces share the same mental model: **something sync/import found → human decides link, create, or ignore.** This spec covers the combined admin UX, access control, and actions. Individual pipeline details remain in the source specs.

The review queue has three categories of items:
1. **Noise** — event platforms (@lu.ma, @eventbrite.com), shared inboxes (team@, hello@, info@), one-off vendors. Should be auto-skipped at ingest; never enter the queue.
2. **Obvious matches** — exact email already in Ecosystem. Should be auto-resolved or one-click bulk action.
3. **Real new people** — no match, has a name, worth creating. Should require one or two clicks.

The UX goal is to auto-resolve categories 1 and 2, and make category 3 take two clicks.

---

## 1. Purpose

Grow the relationship graph without noise. Unmatched email participants, unmatched calendar attendees, and import soft-matches all need human judgment before becoming profiles or relationships. Admin review is the gate.

---

## 2. Access control

| Rule | Implementation |
|---|---|
| Who can access | **Admins only** — every review route calls `requireAdmin()` |
| RLS | Review tables are org-scoped (any org member can SELECT at DB level); UI enforcement is app-layer |
| Clone safety | No hard-coded tenant IDs; all queries scoped by `getOrgId()` |

Routes:

| Queue | Path | Status |
|---|---|---|
| Calendar participants | `/admin/calendar-sync/review` | Shipped |
| Import soft-matches | `/profiles/import/[id]` (within import wizard) | Shipped |
| Email participants | `/admin/email-sync/review` (or equivalent) | **Not yet built** — spec in gmail-sync.md §11; queue table exists |

Admin hub: `/admin` links to each surface. Sub-nav via `src/config/admin-navigation.ts`.

---

## 3. Triage mode (primary UX)

**This is the default view for the calendar review queue and email review queue.** Replace the long scroll list with a one-at-a-time focus view. Triage mode alone cuts review time in half.

### 3.1 Triage card

One person at a time, full attention. The card shows:

- **Person identifier:** display name (from calendar/email) + email address, large and prominent.
- **Meeting context:** "3 meetings · last 18 Jun 2026 · [meeting title]" — the most important context for deciding link vs create vs ignore. Never force opening a separate view to see why this person is in the queue.
- **Team context:** "Met with: Chris, Tom" — which team members' calendars surfaced this person.
- **Search results:** automatic profile search runs on load. Shows the top 3 candidates with name, company, email match indicator. If zero results, shows nothing (create path).
- **Suggested action badge:** based on search results:
  - Exact email match → "Suggested: Link to [Name]" as primary button.
  - No match, has display name → "Suggested: Create profile".
  - Generic pattern (team@, @lu.ma, etc.) → "Suggested: Ignore".
- **Progress indicator:** "Person 3 of 47" — always visible. Seeing progress motivates completion.

### 3.2 Keyboard shortcuts (Phase 1, not deferred)

Keyboard shortcuts are a Phase 1 requirement for this screen — not polish. The queue is used daily in focused sessions. Mouse-only review is slow.

| Key | Action |
|---|---|
| `L` | Link to the currently selected search result (or open link search if none selected) |
| `C` | Create profile (pre-fills name from display name, email from review row) |
| `I` | Ignore — removes from queue, won't appear again |
| `J` / `↓` | Next person in queue |
| `K` / `↑` | Previous person in queue |
| `Enter` | Confirm the suggested action |
| `Escape` | Clear the current action, return to card |

Keyboard shortcuts are rendered as small badges on each button so they are discoverable without documentation.

### 3.3 Auto-advance

After each action (link, create, or ignore), **auto-advance to the next person** without requiring a click. The card transitions forward. This makes triage feel like a decisioning flow, not a list of tasks.

### 3.4 Optimistic UI

Each action removes the card from the queue **immediately**, before the server confirms. Run the action in the background. On error: re-add the card at the current position and show an error toast.

Never use `router.refresh()` after each action — this causes a full page reload, resets scroll position, and makes the queue feel unreliable. See `docs/specs/interaction-speed.md §Optimistic updates`.

---

## 4. Bulk actions

Two bulk actions sit above the triage card and persist as the queue is worked through:

### 4.1 Link all exact email matches

Auto-link every pending person whose email exactly matches an existing profile. Requires one confirmation click ("Link 14 exact matches?"). Clears the most obvious category instantly.

Implementation: server action scans `calendar_participant_reviews` where `status = 'pending'`, joins on `profiles.email = lower(review.email)`, links and backfills each match. Returns count of resolved items.

### 4.2 Ignore all from domain

"Ignore all @lu.ma" or "Ignore all @informa.com" — appears contextually when multiple pending items share a domain. One click ignores all items from that domain in the current queue.

The domain pattern is stored as an `ignored_review` row per email (existing behaviour). The bulk action is a shortcut that applies the same logic to all matching pending rows at once.

---

## 5. Queue ordering

Default sort for the calendar review queue (and email review when built):

1. **Most meetings first** — 3 meetings with Adrian is higher signal than 1 meeting with a vendor. Sort by meeting count descending.
2. **Most recent meeting date** — within the same meeting count, sort by last meeting date descending.
3. Show "47 remaining" with a load-more if queue exceeds 50 items. High-signal people surface first; the long tail is accessible but not forced.

This ordering is computed at query time from grouped `calendar_participant_reviews` rows.

---

## 6. One-click create when no match

When search returns zero results and the person has a display name from the calendar:

- Show a single large primary button: **"Create [Display Name]"** — not generic "Create new profile".
- Pre-fill: name from display name, email from review row, source = `calendar_sync`.
- Optional: owner dropdown showing team attendees on the same meeting. If there was only one team attendee, default to them as primary owner.
- Create immediately on click. No intermediate form unless the user wants to add more detail.

After creation: auto-advance to next person. The new profile is in the system; they can enrich it later via the profile drawer.

---

## 7. Ingest-time filtering (keep the queue small)

The best review is the one that never needs to happen. At sync time, skip addresses that match these patterns before they enter `calendar_participant_reviews`:

**Already skipped (shipped):**
- Room resources (calendar room addresses)
- Shared calendar addresses

**Add these patterns (no schema change, config in `src/lib/integrations/calendar/`):**
- Event platforms: `@lu.ma`, `@eventbrite.com`, `@informa.com`, `@eventbrite.co.uk`
- Generic inboxes: `team@*`, `hello@*`, `info@*`, `contact@*`, `noreply@*`, `no-reply@*`
- Calendar invite senders: `calendar-notification@*`, `invitations@*`

These are pattern-based skips, not per-email ignore rows. They apply at ingest, before anything hits the DB. The patterns should be defined as a config array in `src/lib/integrations/calendar/skip-patterns.ts` so they're easy to extend.

**"Ignore and remember" labelling:**
When an admin ignores an email, make it explicit: "Ignored — won't appear again from future syncs." This builds confidence that the ignore is persistent, so admins ignore more freely instead of wondering if the item will return.

---

## 8. Access control

| Rule | Implementation |
|---|---|
| Who can access | **Admins only** — every review route calls `requireAdmin()` |
| RLS | Review tables are org-scoped (any org member can SELECT at DB level); UI enforcement is app-layer |
| Clone safety | No hard-coded tenant IDs; all queries scoped by `getOrgId()` |

Routes:

| Queue | Path | Status |
|---|---|---|
| Calendar participants | `/admin/calendar-sync/review` | Shipped (list view — needs triage mode upgrade) |
| Import soft-matches | `/profiles/import/[id]` (within import wizard) | Shipped |
| Email participants | `/admin/email-sync/review` | **Not yet built** — queue table exists |

Admin hub: `/admin` links to each surface.

---

## 9. Shared UX patterns

### 9.1 Internal / team filtering

Separate external unmatched participants from internal (the team) addresses:
- External: full link / create / ignore actions.
- Internal: collapsed section; "Ignore all team" bulk action. Team addresses should not become external profiles.

Uses `ORG_INTERNAL_EMAIL_DOMAINS` + `users.email`. See `docs/specs/interaction-speed.md §Table row hover actions` for the general pattern.

### 9.2 Empty states

When queue is empty: "Queue is clear. The next calendar sync will surface any new unmatched attendees." Link to connect settings if no calendar connected.

### 9.3 Post-connect messaging

After OAuth connect, redirect with `?connected=[email]` query param. Show "Initial sync is running — check back in a few minutes." banner.

### 9.4 Admin notification (Phase 1.1)

Email or Slack notification when pending review count exceeds 20 after a sync. Turns review from a surprise backlog into a known weekly habit. Requires a notification config screen (Admin → Settings). Deferred to Phase 1.1 to avoid scope creep, but the hook should be in the sync cron — emit a notification if count > threshold.

---

## 10. Import soft-match review (shipped)

**Path:** `/profiles/import/[id]` during `processing` status

**Component:** `SoftMatchReview`

Per ADR 0004:

| Dedup tier | Behaviour |
|---|---|
| Email match | Auto-merge at commit (fill empty fields only) |
| Name + company soft match | **Review queue** — admin confirms merge or creates new |
| No match | New profile at commit |

Soft-match rows show: import row data, candidate existing profile, side-by-side diff. Actions: merge, create new, skip.

Full import flow: `docs/specs/import-pipeline.md`.

---

## 11. Bigger bets (need discussion / possible schema)

| Idea | Benefit | Notes |
|---|---|---|
| Org ignore list table | Persist `@vendor.com` or `*@lu.ma` as patterns, survives across re-imports and syncs | No schema today — `organisations` could add `review_skip_patterns jsonb` |
| Auto-link at sync (exact email) | Skip the queue entirely for profiles that already exist | Biggest reduction in queue size. Requires deliberate ADR — auto-writing Layer 1 without human review is a policy decision |
| Unified review inbox | Calendar + Gmail in one triage stream, grouped by email | Reduces context switching when both are live |
| Fuzzy match suggestions | "85% match to Adrian Grey" shown as suggested action | Admin confirms, never auto-write. Requires name similarity scoring |

Auto-link at sync for exact email is the largest engineering win. Triage mode is the largest UX win. Together they could shrink a 200-person backlog to ~20 requiring human judgment.

---

## 12. Acceptance criteria

- [ ] Non-admin receives 403 or redirect from all review routes
- [ ] Triage mode shows one person at a time with auto-advance after action
- [ ] Keyboard shortcuts (L / C / I / J / K) work and are shown as badges on buttons
- [ ] Optimistic UI removes card immediately; rolls back on error with toast
- [ ] Bulk "link all exact matches" resolves correct rows and shows count
- [ ] Bulk "ignore all from domain" works for any domain appearing in the queue
- [ ] Queue ordered by meeting count desc, then last meeting date desc
- [ ] One-click create pre-fills name and email; defaults owner to team attendee when unambiguous
- [ ] Ingest-time skip patterns prevent @lu.ma and generic inbox addresses entering the queue
- [ ] "Ignore and remember" label shown on ignore action
- [ ] Calendar review: link action backfills meeting activity idempotently
- [ ] Calendar review: create action does not duplicate profile on same email
- [ ] Import soft-match: merge never overwrites non-empty curated fields (ADR 0004)
- [ ] Empty queues show teaching empty states

---

## 4. Calendar sync review (shipped)

**Path:** `/admin/calendar-sync/review`

**Components:** `CalendarSyncReviewWizard`, data from `src/lib/data/calendar-sync-review.ts`

### Summary panel

- Sync in progress flag
- Last run timestamp
- Counts: events processed, activities created, reviews pending
- Split: external vs internal pending counts

### Tabs

1. **Unmatched** — external groups with link/create/ignore per email
2. **Matched** — recent auto-linked meetings for audit (read-only)
3. **Team (internal)** — collapsed; bulk ignore

### Link flow

1. Admin searches profiles by name/email (`searchProfilesForCalendarLinkAction`)
2. Select profile → `linkCalendarReviewAction`
3. Backfill meeting activity on linked profile

### Create flow

1. Pre-fill name from calendar display name, email from review row
2. `createProfileFromCalendarReviewAction`
3. Creates profile, relationship, links all pending review rows for that email

---

## 5. Import soft-match review (shipped)

**Path:** `/profiles/import/[id]` during `processing` status

**Component:** `SoftMatchReview`

Per ADR 0004:

| Dedup tier | Behaviour |
|---|---|
| Email match | Auto-merge at commit (fill empty fields only) |
| Name + company soft match | **Review queue** — admin confirms merge or creates new |
| No match | New profile at commit |

Soft-match rows show: import row data, candidate existing profile, side-by-side diff. Actions: merge, create new, skip.

Full import flow: `docs/specs/import-pipeline.md`.

---

## 6. Email participant review (planned)

**Spec source:** `docs/specs/gmail-sync.md` §11

**Table:** `email_participant_reviews`

When built, mirror calendar review patterns:

- Admin → Review → Email participants
- Same three actions: link, create, ignore
- Show thread subject, date, syncing account
- Group by email where multiple threads pending

Blocked on Gmail sync route handler shipping. Queue table and RLS already exist.

---

## 7. Pagination and scale

V1 limits:

- Calendar unmatched groups: capped at query limit (see `listPendingCalendarReviewGroups`)
- Import soft matches: all rows for one import (max 5,000 rows per import per import-pipeline spec)
- No infinite scroll in V1; add pagination when any queue routinely exceeds 100 items

---

## 8. Keyboard shortcuts

**Deferred to Phase 1.1 UX polish.** V1 is mouse-driven. When added:

- `j` / `k` — move between rows
- `l` — link, `c` — create, `i` — ignore
- Document in this spec when implemented

---

## 9. Acceptance criteria

- [ ] Non-admin receives 403 or redirect from all review routes
- [ ] Calendar review: link action backfills meeting activity idempotently
- [ ] Calendar review: create action does not duplicate profile on same email
- [ ] Calendar review: ignore all team clears internal pending rows
- [ ] Import soft-match: merge never overwrites non-empty curated fields (ADR 0004)
- [ ] All review actions log `reviewed_by` where schema supports it
- [ ] Empty queues show teaching empty states with links to connect/import
