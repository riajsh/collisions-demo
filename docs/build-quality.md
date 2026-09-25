# Build Quality

- Version: 1.0
- Status: Accepted
- Audience: the team and anyone running Cursor sessions on Ecosystem

This document captures the practices that keep an AI-assisted build clean and consistent. The risk with Cursor is not the big architectural decisions — those are in the docs — it's the thousand small plausible-looking choices made session by session that quietly drift from the model. These practices create the feedback loops that catch drift early.

---

## 1. Before the first line of code

Do these once, before any feature work. They prevent entire classes of problem.

### Design tokens first

Run through `docs/design-tokens.md` and define your `@theme` block in `globals.css` before any UI work. Without tokens, Cursor invents arbitrary hex values that accumulate and become expensive to change. The owner colour palette and strength colours are the most critical — set them up in `src/config/owner-colours.ts` keyed by `users.id` before the first Orbit component is written.

### Layer 2 views as interface stubs

The Phase 1 migration set is shipped and locked — do **not** add stub views to those migrations retroactively.

When Phase 2 schema work begins, add stub SQL views as the **first Phase 2 migration**: `orbit_ring_view`, `connect_suggestions_view`, `relationship_strength_view`. Stubs return empty result sets but define the exact column names and shapes the UI will consume. Benefits: Phase 2 Cursor sessions work against a real contract (not invented schemas), naming collisions surface immediately, the architectural intent is explicit from day one.

### Rich seed data

`supabase/seed.sql` should exercise every meaningful state in the system, not just happy-path data. Include:

- Profiles with email matches (dedup test)
- Profiles without emails (soft-match test)
- Introduction activities with and without outcomes
- Email threads with matched and unmatched participants
- Connections of each type — manual, inferred, introduced
- Imports in `pending`, `processing`, `complete`, and `failed` states
- A relationship in each recency band (active, reconnect, dormant)
- At least two users with different owner colours

This makes the review queue visible from day one, prevents empty-state blindness, and catches UI edge cases before they reach production.

### Tokens in place before any UI Cursor session

Add the following to the top of every UI-focused Cursor session prompt:

> Read `docs/design-tokens.md` and `docs/design-principles.md` before writing any JSX. Use only `@theme` tokens — never arbitrary Tailwind values. Inferred data gets `--color-data-inferred` styling and dashed borders. Owner colours come from `ownerColour(userId)` in `src/config/owner-colours.ts`.

---

## 2. Cursor session discipline

### Structured session starters

Rather than prompting Cursor ad hoc, use consistent session-starter templates. Each template pre-loads the right constraints. Suggested set:

**New repository function:**
> Read `docs/domain-model-v1.md §[section]`, `docs/ai-conventions.md`, and `src/lib/data/[nearest-file].ts`. Add a repository function for [feature] in `src/lib/data/[table].ts`. Layer 1 only — no computed values. `org_id` from `getOrgId()`, never from the client. Return type from generated types in `src/types/database.ts`.

**New route handler / server action:**
> Read `docs/technical-architecture.md §4`, `docs/ai-conventions.md`. Add a server action for [mutation]. Pattern: `requireUser()` → validate with Zod → repository write → `revalidatePath`. Never accept `org_id` from the client.

**New migration step:**
> Read `docs/domain-model-v1.md §[section]` and the last migration file in `supabase/migrations/`. Write the next migration for [table]. Include RLS policy. Include `updated_at` trigger if the table is mutable. Follow the naming convention in `docs/ai-conventions.md`.

**UI component (profile or admin):**
> Read `docs/design-tokens.md`, `docs/design-principles.md`, `docs/information-architecture.md`, and `docs/specs/profile-detail.md` or `docs/specs/admin-review.md` as appropriate. Build [component name]. Use only `@theme` tokens. Inferred data uses `--color-data-inferred`. Use CVA for any component with 3+ visual states. No arbitrary Tailwind values.

**Calendar or Gmail sync work:**
> Read `docs/specs/calendar-sync.md` or `docs/specs/gmail-sync.md`, `docs/technical-architecture.md` §6–§7, `.cursor/rules/data.mdc`. Cron uses `createAdminClient()` + explicit `org_id`. Participant matching via `participant-email.ts` and `ORG_INTERNAL_EMAIL_DOMAINS`. Idempotent upserts only.

### Diff review after every session

Before committing any Cursor-generated code, read the diff and ask:
- Does every new table/column match `docs/domain-model-v1.md`?
- Does every new component use `@theme` tokens?
- Does every mutation go through a Server Action, not a direct client write?
- Does `org_id` come from the session, not the client, in every insert?
- Does any new computed value live in a view, not a user-editable column?

This takes two minutes and catches the most common drift.

### AI red team — second opinion after each session

After a significant Cursor session (new subsystem, new migration, new component), open a fresh Claude context with no conversation history and paste in:

> Here are the project conventions: [paste `docs/ai-conventions.md`]. Here is what was just built: [paste the diff or key files]. What violated the conventions? What would a strict reviewer flag?

A second AI reviewing what the first AI built catches drift that you'd never notice while you're in flow. This is especially valuable for:
- RLS policy completeness (every table covered?)
- Layer 2 / Layer 1 separation (any computed value written as a fact?)
- Clone safety (any hard-coded tenant references?)

---

## 3. Schema discipline

### Schema-locked mode after Phase 1 migrations

Once the Phase 1 migration set is accepted (including Phase 1.1 calendar), add this to `.cursor/rules/supabase.mdc`:

> The Phase 1 schema is locked. Do not suggest new tables, new columns, or schema changes. If a feature cannot be implemented against the current schema, stop and flag it as a required discussion before continuing.

This forces features that don't fit the schema to surface as a conversation — not as a surprise migration buried in a PR. Re-enable schema changes when starting Phase 2.

### Migration changelog

Keep a comment block at the top of each migration file explaining in plain English what it does and why:

```sql
-- Migration: 0005_activities
-- Adds the activities table: per-profile interaction timeline.
-- One row per profile per interaction. Multi-party interactions write
-- one row per profile (single-profile-per-row model, see domain-model §5.8).
-- source_ref enables idempotent re-sync for gmail_sync and calendar_sync.
-- introduced_by and introduction_outcome added at v1.1 for attribution tracking.
```

This prevents "what does migration 005 actually do?" confusion weeks later when you need to reason about the schema.

### Type generation after every migration

Run immediately after every migration:

```bash
supabase gen types typescript --local > src/types/database.ts
```

Make this the last step of every migration session before committing. Never hand-edit `database.ts`.

---

## 4. Data flywheel — reducing capture friction

Industry research: 79% of relationship-relevant data never enters CRMs due to manual entry friction. Ecosystem addresses this structurally, but the architecture choices matter.

### Zero-friction capture points (build these with care)

| Moment | Capture mechanism | Status |
|---|---|---|
| Email correspondence | Gmail sync → email activities | Phase 1 |
| Event attendance | event_attendees + activity generation | Phase 1 |
| Calendar meetings | Google Calendar sync → meeting activities | Phase 1.1 shipped (ADR 0008) |
| Quick note | Fast note entry from profile or search | Phase 1 UX |
| New contact from search | "Add [query] as new profile" in search empty state | Phase 1 UX |
| Introduction facilitation | Introduction activity with `introduced_by` field | Phase 1 schema, Phase 1.1 UX |

The highest-leverage automatic capture channel after email is calendar sync — now shipped in Phase 1.1. Remaining friction wins: quick-add from search, introduction UX.

### Quick-add from search

When a search returns no results, the empty state must include a one-click "Add [query] as new profile" action. This is the moment of highest intent — the user was already looking for the person. Without the button, friction wins and the graph stays sparse.

---

## 5. Testing

### RLS policy tests

Write pgTAP or Supabase-native tests that verify RLS policies work correctly — not just that they exist. Minimum test set:

- User A cannot read User B's org data
- Non-owner cannot read `email_messages.body`
- Admin can read all email bodies
- Service role writes must still include `org_id`
- Participant review rows (`email_participant_reviews`, `calendar_participant_reviews`) are org-scoped in RLS — any authenticated org member can SELECT. Admin-only access to the review **UI** is enforced in application code via `requireAdmin()` on `/admin/*` routes, not via RLS. Tests must verify org isolation; tightening review tables to admin-only RLS is deferred hardening.
- `calendar_accounts` OAuth tokens (`refresh_token`) are not readable by non-owner users — verify owner-or-admin select policy
- `calendar_events` metadata is org-scoped — User A cannot read User B's org events
- `calendar_participant_reviews` respects org RLS — User A cannot read User B's org review rows
- Cron/sync service role inserts include explicit `org_id` on all calendar table writes

These are different from application tests and catch the most dangerous class of bug.

### Acceptance criteria per feature

Each feature from `docs/specs/` has acceptance criteria. Run them manually before marking a feature complete. Do not skip the empty state and error state criteria — these are the ones that matter in a half-populated early production database.

---

## 6. Org isolation check — test in week two

Org-scoping architecture should guarantee that a fresh `org_id` sees only its own rows. Verify in local dev:

**The test:** create a second org row with a different `org_id`. Seed minimal data against it. Verify:
- No data bleeds across org boundaries
- All queries return empty results for the new org until seeded
- No hard-coded tenant IDs appear in the result set

If anything breaks isolation, fix it early — not at handover time.

---

## 7. The organisation name matching problem

`organisation_name` on profiles is free text. "Acme Corp", "Acme Corporation", "Acme" are three different strings. The inferred-connection logic (same company → they probably know each other) relies on `organisation_name_normalised`, a computed column that lowercases and strips common suffixes at write time.

This column is **for inference queries only** — never display it. It is not a solution to the underlying company-as-string problem, which requires company-as-entity (a significant model change deferred to a future version). It is a hedge that makes the V1 inference meaningfully better without requiring that change.

Keep monitoring: if the normalised matching produces too many false positives (connecting people who happen to work at companies with similar names), add a threshold or require confirmation.
