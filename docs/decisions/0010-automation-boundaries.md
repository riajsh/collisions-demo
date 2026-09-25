# ADR 0010: Automation boundaries — speed without silent corruption

- Status: Accepted
- Date: 2026-06-22
- Deciders: Nova Collective team
- Amends: [0009-agent-workflows.md](./0009-agent-workflows.md) (write policy only — agent workflows unchanged)
- Related: [0008-calendar-sync.md](./0008-calendar-sync.md), [0004-import-dedup.md](./0004-import-dedup.md), [calendar-sync.md](../specs/calendar-sync.md), [ai-conventions.md](../ai-conventions.md)

## Context

ADR 0009 stated that **no activity is written without human confirmation**. Phase 1.1 calendar sync already contradicts that in practice: matched external participants get `meeting` activities written automatically (`source=calendar_sync`, idempotent on `source_ref`). That is intentional — manual confirmation on every coffee would recreate the CRM friction Ecosystem exists to remove.

The team’s operating requirement (Jordan, Jun 2026 check-in): **do not slow capture down**. Review queues are async triage, not gates. Sync and timelines must populate immediately. Human attention is reserved for identity, judgment, and strategic fields — not for re-confirming facts the calendar already proved.

This ADR replaces the blanket “human confirms all Layer 1 writes” rule with a **tiered write policy**: strict boundaries on *what* may auto-write, *how* it is labelled, and *when* humans are required.

ADR 0009’s four agent workflows remain in scope. This ADR changes **how writes happen**, not **which workflows exist**.

---

## Decision

### Principle

| Goal | Rule |
|---|---|
| Speed | High-confidence sync evidence writes immediately. No blocking modal, no “confirm to add to timeline” for calendar facts. |
| Safety | Identity, linking ambiguity, connections, ownership, and profile enrichment never auto-write without passing confidence gates or human action. |
| Trust | Every auto-write carries `source` + `source_ref`. AI-generated text is labelled generated, never presented as human-entered. |
| Reversibility | Admin can ignore, unlink, or delete sync-derived rows without breaking idempotent re-sync. |

Review queues (`calendar_participant_reviews`, import soft-matches, future email reviews) are **backlog**, not **blockers**. The cron finishes; the UI reflects new data on next load.

---

### Tier A — Auto-write (no human step)

Deterministic rules only. Implemented today or extended only with the same confidence bar.

| Write | Conditions | Fields |
|---|---|---|
| `meeting` activity on matched profile | Past event (`start_at ≤ now`); external participant; exact email match to profile; within sync window | `activity_type=meeting`, `title` from event, `summary` null, `source=calendar_sync`, `source_ref=google_event_id` |
| `relationship_sources` (meeting provenance) | Same as above | `source_type=meeting`, append-only |
| Review row for unmatched external | External; not noise domain; within lookahead | `calendar_participant_reviews.status=pending` |
| Skip internal / noise | `ORG_INTERNAL_EMAIL_DOMAINS`, non-person patterns | No profile, activity, or review row |
| Recency / Layer 2 views | Derived from Tier A activities | Views only — never user-editable columns |
| Import commit (after dedup resolved) | Admin committed import; dedup status `new` or `matched_email` | Per import pipeline spec |

**Never add to Tier A without an ADR amendment.**

---

### Tier B — Auto-enrich (append-only, labelled)

Phase 3+ optional. Must not block sync or profile saves. Must not overwrite existing human-entered values.

| Enrichment | Conditions | Storage |
|---|---|---|
| Meeting summary text | Tier A activity already exists; summary still null; input is calendar metadata only (title, location, attendee list) — no LLM inference of facts | Update `activities.summary` with prefix or UI badge “Generated from calendar” |
| Company hint from email domain | Domain is organisational (not gmail/outlook/etc.); profile `organisation_name` is null | Write to `profiles.extended` jsonb key e.g. `suggested_company` OR surface in triage only — **do not** set `organisation_name` until human confirms |
| Role hint from meeting title | Profile `occupation` is null; pattern match only (no LLM) | Same — suggestion field or triage queue, not `occupation` |

LLM-generated enrichment that could state false facts (role, company, relationship quality) stays **Tier C** unless eval set proves ≥99% precision on org sample data.

---

### Tier C — Human required (async, non-blocking)

Judgment calls. Always available in review UI; never required before sync completes or before timelines update.

| Action | Surface |
|---|---|
| Create profile from unmatched participant | Calendar review, import commit, future email review |
| Link participant to profile (non-exact or ambiguous) | Calendar review search + confirm |
| Ignore / dismiss participant | Calendar review one-click |
| Profile company / role / owner / status / tags | Profile edit, import, event CSV — human or explicit import mapping |
| Inferred `connections` row | Connect / admin inference with confirm (inferred flag mandatory) |
| Introduction outcome update | Profile activity form |
| Bulk link exact email matches | One confirmation (“Link 14 matches?”) — acceptable because rule is deterministic |

Calendar review “Create profile” may pre-fill name, email, company, role from form — human still clicks Create.

---

### Tier D — Never auto (Phase 3 included)

| Action | Reason |
|---|---|
| Subjective scores (Influence, Trust, Warmth, etc.) | Product non-goal V1; computed in Phase 2+ if ever |
| Change `relationship_owners` from sync | Ownership is strategic, not calendar-derived |
| Auto-merge profiles on name alone | ADR 0004 |
| Silent overwrite of existing `organisation_name`, `occupation`, owner | Corrupts human work |
| AI chat as write path | No copilot writing Layer 1 in V1 |
| Connection creation without inferred flag + provenance | Graph integrity |

---

## Impact on ADR 0009 agents

| Agent | Auto (Tier A/B) | Human (Tier C) |
|---|---|---|
| **1 Meeting intelligence** | Log past meetings on exact email match (shipped). Optional Tier B summary from metadata. | New profiles, fuzzy links, connection inference between third parties |
| **2 Relationship health** | Read-only analysis; Layer 2 suggestions | Any draft message sent; any profile/activity write |
| **3 Event preparation** | Read-only briefing document | N/A — output is not Layer 1 |
| **4 Introduction facilitation** | Draft text shown in UI (not stored as fact) | Send, mark outcome, write introduction activity |

Remove “draft activity note → confirm → write” as the **default** meeting path. Meeting activities from calendar are **Tier A**. Agent 1 adds **Tier B** enrichment and **Tier C** queues for unknowns — not a confirm step on every matched meeting.

---

## UI rules

1. **No sync-blocking modals** — OAuth connect shows banner (“Initial sync running…”), not a wizard gate.
2. **Generated ≠ entered** — Tier B text uses `--color-data-inferred` / “Generated” label per `docs/design-tokens.md`.
3. **Review is throughput, not permission** — progress indicator (“Person 3 of 47”), keyboard shortcuts, auto-advance per `docs/specs/admin-review.md`.
4. **Overview / recent activity** — past evidence only; future invites stay in calendar/review, not timelines (`docs/plans/2026-06-22-replatforming-plan.md`).

---

## Engineering checklist (before any Phase 3 write)

- [ ] Classified as Tier A, B, C, or D in PR description
- [ ] Tier A: idempotent upsert on natural key; `source` + `source_ref` set
- [ ] Tier B: does not overwrite non-null human fields; labelled in UI
- [ ] Tier C: uses existing review queue or explicit server action with `requireAdmin()` / owner check
- [ ] No `org_id` from client; RLS unchanged
- [ ] Eval set entry if LLM involved in write decision

---

## Consequences

- `docs/ai-conventions.md` Layer 3 rule is narrowed: sync-fact writes (Tier A) and labelled enrichment (Tier B) are permitted without confirmation; identity and judgment writes (Tier C/D) require human action.
- `docs/domain-model-v1.md` Phase 3 summary should reference this ADR for write policy.
- Cursor sessions on calendar sync or agents must read this ADR alongside 0009.
- Phase 5 “people pulse” and NL query features remain read-only until eval criteria exist; they do not auto-write Tier C/D fields.

---

## Open questions

| Question | Default until decided |
|---|---|
| Bulk “link all exact email matches” — Tier A or C? | Tier C with single bulk confirm (deterministic rule) |
| Auto-create profile for repeat unmatched attendee (3+ meetings)? | Tier C — suggest prominently, never silent create |
| Tier B summary via LLM vs template-only | Template-only first; LLM only after eval |
