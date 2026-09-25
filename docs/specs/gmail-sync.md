# Gmail Sync Specification

- Version: 1.0
- Status: Accepted — **not implemented** (schema + review table ready)
- Related: ADR 0002, ADR 0003, ADR 0007, domain-model-v1.md §5.9, `docs/specs/calendar-sync.md` (parallel calendar pipeline), `docs/specs/admin-review.md` §6

The highest-risk subsystem. Privacy, permissions, and relationship attribution intersect here. **Calendar sync shipped first as the auto-capture path for meetings; Gmail sync remains spec + schema only until implementation starts.**

---

## 1. Purpose

Daily incremental sync of Gmail threads labelled with project labels. Store raw email data, match participants to profiles, generate activities, record relationship provenance, and queue unmatched participants for human review.

Ecosystem owns this entirely (ADR 0007). Not shared with Pathway PM.

---

## 2. Scope

### In scope (V1)

- Multiple connected team inboxes (`gmail_accounts`)
- Incremental sync via Gmail `historyId`
- Threads filtered by configured project labels
- Full message bodies stored (access restricted per ADR 0003)
- Participant → profile matching by email
- Activity generation per matched profile per thread
- `relationship_sources` append on new email evidence
- Unmatched participant review queue (ADR 0002)
- Org ignore list for non-people addresses
- Tombstone deleted threads (soft, not hard delete)
- Idempotent re-runs

### Out of scope (V1)

- Email-inferred profile-to-profile connections (V2)
- Sentiment analysis or AI summarisation (Phase 3)
- Two-way Gmail write (send, label management from Ecosystem)
- Shared sync infrastructure with Pathway PM
- Sync of personal/non-project mail

---

## 3. Whose inbox?

**Multiple inboxes.** Each team member who holds relationships may connect their Gmail account.

| Question | Answer |
|---|---|
| One inbox or many? | **Many.** One row per connected account in `gmail_accounts`. |
| Who can connect? | Any org member; admin can disable `sync_enabled` per account. |
| Which mail is synced? | Only threads carrying a configured **project label** (e.g. Gmail labels matching configured projects). |
| Shared inbox (hello@pu.com)? | Supported as a separate `gmail_accounts` row; typically connected by admin. |

Label configuration (V1): `GMAIL_SYNC_LABELS` env var — comma-separated Gmail label names or IDs (e.g. `GMAIL_SYNC_LABELS=ProjectA,ProjectB,Client-X`). Set in `.env.local` before first sync. Admin UI for managing labels deferred to Phase 1.1 if needed.

---

## 4. Sync pipeline

```
┌─────────────┐    ┌──────────────┐    ┌─────────────────┐
│ Vercel Cron │───▶│ gmail-sync   │───▶│ For each account│
│  (daily)    │    │ route handler│    │ with sync_enabled│
└─────────────┘    └──────────────┘    └────────┬────────┘
                                                │
                    ┌───────────────────────────┘
                    ▼
         ┌──────────────────────┐
         │ Gmail API: history   │
         │ list (incremental)   │
         └──────────┬───────────┘
                    ▼
         ┌──────────────────────┐
         │ Fetch new/changed    │
         │ threads + messages   │
         └──────────┬───────────┘
                    ▼
         ┌──────────────────────┐
         │ Upsert threads       │
         │ Upsert messages      │
         └──────────┬───────────┘
                    ▼
         ┌──────────────────────┐
         │ For each external    │
         │ participant:         │
         │  match → activity    │
         │  no match → queue    │
         └──────────┬───────────┘
                    ▼
         ┌──────────────────────┐
         │ Update sync_cursor   │
         │ (historyId)          │
         └──────────────────────┘
```

### 4.1 Initial backfill (on connect)

When a user completes OAuth:

1. Store refresh token on `gmail_accounts`.
2. Trigger one-time backfill job: fetch all threads with project labels, last 12 months (configurable).
3. Process through same pipeline as incremental sync.
4. Set `sync_cursor` to current `historyId`.

### 4.2 Incremental sync (daily cron)

1. Load all `gmail_accounts` where `sync_enabled = true`.
2. For each account, call `users.history.list` from stored `sync_cursor`.
3. Process `messagesAdded`, `messagesDeleted`, `labelsAdded`, `labelsRemoved` events.
4. Upsert affected threads and messages.
5. Re-run participant matching and activity generation for changed threads.
6. Update `sync_cursor` and `last_sync_at`.

### 4.3 Idempotency

| Natural key | Upsert behaviour |
|---|---|
| `(org_id, gmail_thread_id)` | Update metadata, message_count, last_message_at |
| `(org_id, gmail_message_id)` | Update body, recipients if changed |
| Activity `(profile_id, source_ref=gmail_thread_id)` | Skip if exists |
| `relationship_sources` `(relationship_id, source_type=email, source_id=thread_id)` | Skip if exists |

Re-running sync for the same thread must not duplicate activities or sources.

---

## 5. How emails attach to profiles

**Match key:** `lower(participant.email) = lower(profiles.email)`.

For each external participant on a thread (not a team member address):

1. Normalise email (lowercase, trim).
2. Check org ignore list → skip if matched.
3. Query profile by email within org.
4. **On match:**
   - Ensure profile has a `relationship` row (create if missing with `status=prospect`, `source` implied via relationship_source).
   - Upsert `email`-type `activity` on profile timeline:
     - `title`: thread subject
     - `summary`: first 200 chars of latest message or snippet
     - `activity_date`: `last_message_at`
     - `source`: `gmail_sync`
     - `source_ref`: `gmail_thread_id`
   - Append `relationship_sources` row if not exists: `source_type=email`, `source_id=thread.id`.
5. **On no match:**
   - Create `email_participant_reviews` row: `status=pending`.
   - Do **not** create profile or relationship.

### 5.1 org internal addresses

Internal (team) participants are identified by:

1. **`ORG_INTERNAL_EMAIL_DOMAINS`** — comma-separated domains in env (e.g. `novacollective.io`). Set in `.env.local` / Vercel env. Documented in `docs/technical-architecture.md` §8.
2. **`users.email`** — all org member emails are treated as internal at runtime (loaded from DB during sync).

Implementation: `src/lib/integrations/participant-email.ts` (`loadOrgParticipantFilters`, `isInternalParticipant`).

These participants:

- Are stored in thread `participants` jsonb for context.
- Do **not** get profiles, activities, or review rows (they are owners, not contacts).
- Used to determine **relationship owner attribution** (see §6).

Threads or events with **only** internal participants: store metadata if labelled, but generate no activities and no review rows.

---

## 6. How emails attach to relationships

A **relationship** is org→profile (one per profile). Email evidence strengthens provenance; it does not create duplicate relationships.

**Owner attribution:** when a team member appears as sender or recipient on a thread involving an external profile:

- If that user is not already a `relationship_owner`, optionally suggest adding them (Phase 2). V1: no auto-add.
- If they are an owner, update `last_interaction_at` on that owner row (manual field V1; computed V2).

**Primary owner** is never changed by sync in V1.

**Relationship source:** each thread linked to a profile appends provenance. Aggregated UI: "Appears in 18 email threads".

---

## 7. CCs, BCCs, and recipients

All participants parsed from message headers:

| Role | Stored in | Matched to profile? |
|---|---|---|
| From | `participants` + message `sender` | Yes, if external |
| To | `participants` + message `recipients` | Yes, if external |
| CC | `participants` | Yes, if external |
| BCC | `participants` if visible to syncing account | Yes, if external |

Each external participant is processed independently. A thread with Aaron (to) and Henry (cc) generates:

- Activity on Aaron's timeline (if matched)
- Activity on Henry's timeline (if matched)
- Review queue rows for any unmatched externals

One thread can therefore produce multiple activities and multiple review rows. This is intentional (single-profile-per-row model).

---

## 8. External-only threads

Thread where all external participants are unmatched and no team member sent/received project-labelled mail in a meaningful way:

- Still store thread and messages (metadata always; bodies per ADR 0003).
- Create review rows for each external participant.
- No activities until a participant is linked or a profile created.
- Thread remains searchable by subject (org-wide metadata).

If thread contains **only org internal addresses** (no externals): store for audit if labelled, but generate no activities and no review rows.

---

## 9. Deleted emails and threads

| Gmail event | Ecosystem behaviour |
|---|---|
| Message deleted | Keep message row; set `metadata.deleted_at` or soft flag. Do not remove activity (evidence was real). |
| Thread removed from project label | Keep thread; set `project_label` null or `metadata.label_removed_at`. Stop generating new activities. Existing activities remain. |
| Thread permanently deleted / not returned | Set `email_threads.is_deleted = true`. Activities remain; UI shows "source no longer available". |
| Account disconnected | Set `sync_enabled = false`. Data retained. |

**Principle:** evidence timeline is append-only. Deletions in Gmail do not erase relationship history in Ecosystem.

---

## 10. Privacy and access (ADR 0003)

| Data | Default access (V1) |
|---|---|
| Thread subject, participants, dates, counts | All org members |
| Message body | Relationship owners for matched profiles on thread + admins |
| Search over subjects | All org members |
| Search over bodies | Same as body access |

RLS policies enforce per `organisations.email_access_level`. V1 default: `restricted_body_access`.

Cron/sync jobs use service role but still write `org_id` correctly. Service role reads bodies for processing; user-facing queries respect RLS.

---

## 11. Review queue (ADR 0002)

Combined admin UX: `docs/specs/admin-review.md` §6. **Not yet built** — table and RLS exist; UI pending Gmail sync route handler.

Admin → Review → Email participants (planned route).

| Action | Behaviour |
|---|---|
| **Link to existing profile** | Set `profile_id`, `status=linked`. Backfill activity + relationship_source for that thread/profile. |
| **Create profile** | Create profile + relationship. Link review row, `status=created`. Backfill activity + source. |
| **Ignore** | `status=ignored`. Optionally add email to org ignore list. |

Review list shows: email, display name, thread subject, date, account synced from.

---

## 12. Ignore list

**Phase 1.1 deferred.** No `gmail_ignore_patterns` column on `organisations` and no org-level ignore table in the current schema.

V1 uses hardcoded patterns in `src/lib/integrations/participant-email.ts` (`IGNORED_EMAIL_PATTERNS`: `noreply@`, `no-reply@`, `calendar-notification@`, `mailer-daemon@`). These skip review queue creation entirely.

When org-configurable ignore patterns are needed, add `gmail_ignore_patterns jsonb default '[]'::jsonb` to `organisations` as a new migration and wire the admin "Ignore + add to list" action from §11.

---

## 13. Error handling

| Failure | Behaviour |
|---|---|
| OAuth token expired | Mark account `sync_enabled=false`, notify admin, log error |
| Gmail rate limit | Exponential backoff within job; resume next cron |
| Partial thread fetch | Log, skip thread, continue batch |
| Duplicate participant in thread | Idempotent upsert on review row |
| Profile email changed after match | Old activities stay on profile; re-sync does not auto-move |

All sync runs log: account, threads processed, messages upserted, matches, queue additions, errors. Store in `gmail_accounts.metadata.last_run` or dedicated `sync_runs` table (implementation choice).

---

## 14. OAuth scopes

Minimum Gmail scopes:

- `https://www.googleapis.com/auth/gmail.readonly` — read threads and messages
- `openid email profile` — identify connecting user

Request incremental auth. Store refresh token encrypted with `TOKEN_ENCRYPTION_KEY`.

**OAuth verification status:** `gmail.readonly` is a sensitive scope but **verification is not required** — the Google Cloud project OAuth app is configured as Internal user type (org Google Workspace only). Internal apps bypass Google's OAuth verification process. Each integration (Gmail, Calendar) uses a separate OAuth client ID within the same GCP project.

---

## 15. Decisions (closed)

| Item | Decision |
|---|---|
| Label configuration | `GMAIL_SYNC_LABELS` env var. Starting list set in `.env.local` at deploy time. Admin UI in Phase 1.1. |
| Backfill window | 12 months on first connect, incremental daily after. Stage the backfill to avoid contention (process in batches, respect Gmail rate limits). |
| Auto-suggest relationship_owner | No in V1. team member presence on thread does not auto-add them as an owner. Owner management is manual. |
| Sync audit logging | Dedicated `sync_runs` table if sync volume warrants; otherwise log to `gmail_accounts.metadata.last_run` in V1. Implementation decision for builder — either is acceptable, `sync_runs` preferred for observability. |

---

## 16. Acceptance criteria

- [ ] Connecting an inbox triggers backfill without duplicate activities on re-run
- [ ] External participant with matching profile email gets activity + relationship_source
- [ ] Unmatched participant creates review row, not profile
- [ ] CC participants processed independently
- [ ] Deleted Gmail thread tombstoned, activities preserved
- [ ] Non-owner cannot read message body via API or UI
- [ ] Ignore list prevents review noise from no-reply addresses
