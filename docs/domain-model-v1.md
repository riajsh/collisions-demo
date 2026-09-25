# Ecosystem V1 Domain Model

- Version: 1.2
- Status: Accepted
- Changelog: v1.2 adds calendar_accounts, calendar_events, calendar_participant_reviews (Phase 1.1 Google Calendar sync, ADR 0008). v1.1 adds organisation_name_normalised (profiles), introduced_by + introduction_outcome (activities), source_event_id + introduced_by (connections), calendar_sync source type. All additions are nullable and non-breaking.
- Owner: Nova Collective
- Purpose of this file: single source of truth for the data model. Schema, APIs and UI are generated from this, not the other way around.

---

## 1. Purpose

The platform exists to answer one question:

> Who do we know, who on the team knows them, how strong is that relationship, and how can we create value through the network?

Profiles are participants. Activities are evidence. Events are catalysts. Search is the interface. AI is a reasoning layer that comes last. The thing at the centre is the relationship.

---

## 2. Guiding principles

1. **Relationships are primary, not people.** People are stored so relationships can hang off them.
2. **The system computes; humans do not maintain scores.** No subjective fields like Influence, Trust, Alignment, Warmth, Momentum in V1. We accumulate evidence first, score later.
3. **Three layers of truth, kept separate.**
   - Layer 1 Reality: things people enter (name, company, tags, notes, manual strength).
   - Layer 2 Inference: things the system derives (strength, ring, overlap, suggestions).
   - Layer 3 AI: things Claude reasons about, once Layers 1 and 2 are populated.
   We never let Layer 2 or 3 write back into Layer 1 as if it were fact.
4. **Single tenant, org-scoped from day one.** V1 serves one organisation per deployment. Every table carries `org_id` so the platform can be re-hosted for another team without a rebuild.
5. **Low automation now.** Manual entry is acceptable for V1. Automation and agents come once the graph holds real data.

---

## 3. Core concept

Three relationship axes, all required:

- **Org to person:** The org has a relationship with Aaron. This is the spine. One row per profile.
- **User to person:** Team members each hold the Aaron relationship at different strengths. This is the asset that most CRMs miss.
- **Person to person:** Aaron knows Henry (both external). This is the graph that powers introductions and the outer structure of Orbit.

If we only model org to person, we get a contact database. Modelling all three is what makes it a relationship intelligence platform.

---

## 4. Entity map

```
Organisation
│
├── Users                         (internal team)
│
├── Profiles                      (external people)
│   ├── Profile Tags
│   ├── Connections               (profile to profile graph)
│   ├── Activities                (evidence timeline)
│   └── Event Attendance
│
├── Relationships                 (org to profile spine, 1:1 with profile)
│   ├── Relationship Owners       (user to profile, with strength)
│   └── Relationship Sources      (provenance: why we know this person)
│
├── Gmail Accounts                (connected inboxes, OAuth)
├── Email Threads
│   ├── Email Messages
│   └── Email Participant Reviews (unmatched → Admin queue)
│
├── Events
│   └── Event Attendees
│
├── Tags
│
└── Imports                       (supporting)
```

---

## 5. Entities

Conventions: every table has `id uuid pk default gen_random_uuid()`, `org_id uuid not null references organisations`, and `created_at timestamptz default now()`. Mutable tables also carry `updated_at`. Enums are listed inline.

### 5.1 organisations

Tenant boundary. V1 has exactly one row per deployment (Nova Collective in this repo). Org name and slug live here — never hard-code them elsewhere.

| column | type | notes |
|---|---|---|
| name | text | e.g. "Nova Collective" |
| slug | text | unique, e.g. `nova-collective`; used for auth bootstrap via `DEFAULT_ORG_SLUG` |
| email_access_level | enum | `metadata_only` / `restricted_body_access` / `full_body_access`. V1 default: `restricted_body_access` (ADR 0003) |

### 5.2 users

Internal team members. Maps to Supabase `auth.users`. Users are owners of relationships, never contacts.

| column | type | notes |
|---|---|---|
| id | uuid | references auth.users |
| org_id | uuid | references organisations |
| email | text | |
| full_name | text | |
| role | text | `admin` / `member` |

### 5.3 profiles

External people. Clean record of a human. No scoring fields.

| column | type | notes |
|---|---|---|
| full_name | text | |
| email | text | primary match key for email sync and import dedup; nullable |
| phone | text | |
| linkedin_url | text | |
| website_url | text | |
| organisation_name | text | their company, free text |
| occupation | text | |
| location_city | text | |
| location_country | text | |
| bio | text | |
| source | text | `csv` / `email` / `manual` — how the profile was first created |
| organisation_name_normalised | text | computed at write: `lower(organisation_name)` with common suffixes stripped (Ltd, Limited, Inc, LLC, Pty, Corp, Co). Never displayed. Used only for connection inference queries so "Acme Corp" and "Acme Limited" match. |
| extended | jsonb | escape hatch for odd fields, kept out of the relational core on purpose |

Rules:
- Shared profiles. One row per person per org, visible to everyone in the org.
- Dedup on import by `lower(email)` first, then `full_name + organisation_name` as a soft match for review.
- Partial unique index: `unique(org_id, lower(email)) where email is not null`.

### 5.4 relationships (org to profile)

The spine. "The org has a relationship with this person." Exactly one per profile.

| column | type | notes |
|---|---|---|
| profile_id | uuid | references profiles, **unique per org** |
| status | enum | `prospect` / `active` / `partner` / `advisor` / `community` / `dormant` / `inactive` |
| relationship_type | enum | `founder` / `investor` / `operator` / `advisor` / `partner` / `sponsor` / `media` / `other` |
| notes | text | shared org-level notes |

Constraint: `unique(org_id, profile_id)`.

Note: because this is 1:1 with profile, some teams collapse it into the profile table. I am keeping it separate because status and type are about the org's relationship, not about the person, and it gives us a clean place to attach owners.

### 5.5 relationship_owners (user to profile)

Who on the team holds the relationship, and how warm it is for them specifically. This is the high-value bit.

| column | type | notes |
|---|---|---|
| relationship_id | uuid | references relationships |
| user_id | uuid | references users |
| strength | enum | `inner_circle` / `strong` / `warm` / `weak` / `unknown` |
| is_primary | boolean | one primary owner per relationship |
| notes | text | per-owner private notes |
| last_interaction_at | timestamptz | manual in V1, computed from activities in V2 |

Constraint: `unique(relationship_id, user_id)`.

This lets the system answer "who on the team knows Aaron best?", which is usually more actionable than "do we know Aaron?".

### 5.6 relationship_sources (provenance)

Answers: **why do we think we know this person?** Append-only provenance attached to the org→profile relationship, not the person record itself.

| column | type | notes |
|---|---|---|
| relationship_id | uuid | references relationships |
| source_type | enum | `csv_import` / `email` / `event_attendance` / `manual` / `introduction` / `meeting` / `other` |
| source_id | uuid | nullable; references the originating row (import, thread, event, activity) — enforced at application layer |
| source_label | text | human-readable summary, e.g. "Clay import Mar 2024", "18 email threads" |
| created_by | uuid | nullable; references users; null when system-generated |

Rules:
- Multiple sources per relationship. A person may be known via import, events, and email simultaneously.
- Sources are append-only in V1. Do not delete provenance when evidence is removed; mark superseded in metadata if needed.
- System creates sources automatically on import commit, email match, event attendance, manual relationship creation.
- UI surfaces aggregated provenance on the profile: "Imported 2024 · 3 events · 18 email threads".

### 5.7 connections (profile to profile)

The inter-person graph. "Aaron knows Henry", where both are external. This is the piece the earlier brief under-specified and the reason the product can suggest introductions.

| column | type | notes |
|---|---|---|
| profile_a_id | uuid | references profiles |
| profile_b_id | uuid | references profiles |
| connection_type | enum | `colleague` / `cofounder` / `introduced` / `met_at_event` / `personal` / `unknown` |
| strength | enum | `strong` / `warm` / `weak` / `unknown` |
| source | enum | `manual` / `inferred_company` / `inferred_event` / `inferred_email` / `import` |
| source_event_id | uuid | nullable; references events; set when `connection_type = 'met_at_event'` — links the connection to the specific event where they met. Enables "Aaron and Henry met at Community Dinner March 2024". |
| introduced_by | uuid | nullable; references users; set when `connection_type = 'introduced'` — the team member who facilitated the connection. Enables introduction attribution and outcome tracking. |
| notes | text | |

Constraints:
- Canonical ordering `profile_a_id < profile_b_id` so edges are stored once.
- `unique(org_id, profile_a_id, profile_b_id)`.

V1 stance: manual connections plus two cheap inferred sources (same `organisation_name`, co-attended an event), clearly flagged as inferred so they never masquerade as confirmed. Email-inferred connections are V2.

### 5.8 activities

The heartbeat. Every meaningful interaction becomes one row, attributed to one profile's timeline.

| column | type | notes |
|---|---|---|
| profile_id | uuid | references profiles |
| activity_type | enum | `email` / `meeting` / `event` / `introduction` / `note` / `call` / `other` |
| title | text | |
| summary | text | |
| activity_date | timestamptz | |
| source | enum | `gmail_sync` / `calendar_sync` / `manual` / `event_system` / `import` — `calendar_sync` reserved for Phase 1.1 Google Calendar integration (ADR 0008) |
| source_ref | text | e.g. gmail_thread_id, calendar_event_id, or event_id, for idempotent re-sync |
| introduced_by | uuid | nullable; references users; set only when `activity_type = 'introduction'`. The team member who made the introduction. Enables attribution and conversion tracking. |
| introduction_outcome | enum | nullable; `pending` / `accepted` / `led_to_meeting` / `no_response`. Set only when `activity_type = 'introduction'`. Research shows warm intros convert 3–5× faster — this field makes that measurable. |
| metadata | jsonb | |
| created_by | uuid | nullable, null when system generated; references users |

Design decision: activities attribute to a single profile. A three-person meeting writes three activity rows, one per profile timeline. This keeps per-profile history simple and avoids a participants join in V1. If we need true multi-party activity objects later, the upgrade path is an `activity_participants` join table. Flagged in open questions.

### 5.9 gmail_accounts, email_threads, email_messages, email_participant_reviews

Raw communications, kept separate from activities. Dedicated Ecosystem sync (ADR 0007). The cron writes here; activities and relationship sources are derived.

**gmail_accounts**

| column | type | notes |
|---|---|---|
| user_id | uuid | references users; the team member who connected this inbox |
| email | text | the Gmail address |
| refresh_token | text | encrypted; server-side only |
| sync_enabled | boolean | admin can pause without disconnecting |
| last_sync_at | timestamptz | |
| sync_cursor | text | Gmail historyId or page token for incremental sync |

Constraint: `unique(org_id, email)`.

**email_threads**

| column | type | notes |
|---|---|---|
| gmail_thread_id | text | unique per org |
| gmail_account_id | uuid | references gmail_accounts; which inbox synced this thread |
| subject | text | |
| participants | jsonb | array of `{email, name, role}` — role: `from` / `to` / `cc` / `bcc` |
| project_label | text | the Gmail label the sync pulled this under |
| last_message_at | timestamptz | |
| message_count | int | |
| is_deleted | boolean | true if thread no longer returned by Gmail API (tombstone, not hard delete) |

**email_messages**

| column | type | notes |
|---|---|---|
| thread_id | uuid | references email_threads |
| gmail_message_id | text | unique per org |
| sender | text | |
| recipients | jsonb | |
| body | text | full body, see privacy note |
| sent_at | timestamptz | |

**email_participant_reviews**

Queue for unmatched participants (ADR 0002). Not a profile until promoted.

| column | type | notes |
|---|---|---|
| email | text | participant address |
| display_name | text | nullable; from email headers |
| thread_id | uuid | references email_threads |
| status | enum | `pending` / `linked` / `created` / `ignored` |
| profile_id | uuid | nullable; set when linked or created |
| reviewed_by | uuid | nullable; references users |
| reviewed_at | timestamptz | |

Constraint: `unique(org_id, email, thread_id)`.

Resolution: match `participants[].email` and `sender` to `profiles.email`. On match, generate an `email` activity, append `relationship_sources`, and skip the review queue. On no match, create `email_participant_reviews` row. Full flow in `docs/specs/gmail-sync.md`.

Privacy: full email bodies are sensitive. Access is org-scoped via RLS with a metadata/body split per ADR 0003. Honour `organisations.email_access_level`.

### 5.10 calendar_accounts, calendar_events, calendar_participant_reviews

Raw calendar data from Google Calendar sync (ADR 0008). Same org-scoped, idempotent pattern as Gmail. Cron writes here; `meeting` activities and `relationship_sources` are derived.

**calendar_accounts**

| column | type | notes |
|---|---|---|
| user_id | uuid | references users; the team member who connected this calendar |
| email | text | the Google account email |
| refresh_token | text | encrypted; server-side only |
| sync_enabled | boolean | admin or owner can pause without disconnecting |
| last_sync_at | timestamptz | |
| sync_cursor | text | Legacy primary-calendar token; per-calendar tokens in `metadata.sync_cursors` |
| metadata | jsonb | sync run stats, `sync_cursors`, `needs_backfill` |

Constraint: `unique(org_id, email)`.

**calendar_events**

| column | type | notes |
|---|---|---|
| google_event_id | text | unique per org |
| calendar_account_id | uuid | references calendar_accounts |
| ical_uid | text | nullable; Google iCalUID for cross-calendar dedup |
| source_calendar_id | text | nullable; calendarList id this copy came from |
| title | text | |
| description | text | |
| participants | jsonb | array of `{email, name, responseStatus, organizer}` |
| start_at | timestamptz | |
| end_at | timestamptz | |
| is_deleted | boolean | tombstone when event cancelled or removed from sync |

**calendar_participant_reviews**

Queue for unmatched external attendees (ADR 0002 pattern). Not a profile until promoted.

| column | type | notes |
|---|---|---|
| email | text | participant address |
| display_name | text | nullable; from attendee metadata |
| calendar_event_id | uuid | references calendar_events |
| status | enum | `pending` / `linked` / `created` / `ignored` |
| profile_id | uuid | nullable; set when linked or created |
| reviewed_by | uuid | nullable; references users |
| reviewed_at | timestamptz | |

Constraint: `unique(org_id, email, calendar_event_id)`.

Resolution: match `participants[].email` to `profiles.email`. On match, generate a `meeting` activity with `source=calendar_sync` and `source_ref=google_event_id`, append `relationship_sources` with `source_type=meeting`. On no match, create `calendar_participant_reviews` row. Skip internal-only meetings (no external participants outside org team emails). Full flow in `docs/specs/calendar-sync.md`.

### 5.11 events and event_attendees

community events as a first-class object. This is where a lot of the network value originates for the org.

**events**

| column | type | notes |
|---|---|---|
| title | text | |
| description | text | |
| event_type | enum | `dinner` / `roundtable` / `workshop` / `retreat` / `summit` / `other` |
| event_date | timestamptz | |
| location | text | |
| event_size | text | **Planned Phase 1.1** — optional; e.g. `intimate` / `medium` / `large`. Not in schema yet. Supports event prep agent (ADR 0009). |
| event_purpose | text | **Planned Phase 1.1** — optional free text; e.g. "founder dinner", "LP summit". Not in schema yet. Supports event prep agent (ADR 0009). |

**event_attendees**

| column | type | notes |
|---|---|---|
| event_id | uuid | references events |
| profile_id | uuid | references profiles |
| attended | boolean | registered vs actually showed |

Constraint: `unique(event_id, profile_id)`.

Unlocks: who attends often, who stopped attending, who attends together (a cheap signal for inferred connections), which relationships originated at an event.

### 5.12 tags and profile_tags

**tags**

| column | type | notes |
|---|---|---|
| name | text | unique per org |
| category | text | `expertise` / `industry` / `signal_influence` |

**profile_tags**: join of `profile_id` and `tag_id`, `unique(profile_id, tag_id)`. Kept to profiles in V1 rather than a generic polymorphic taggable, to stay simple.

### 5.13 imports

Supporting. Tracks each CSV load for traceability and rollback.

| column | type | notes |
|---|---|---|
| filename | text | |
| source | text | clay / airtable / affinity / attio / hubspot / csv / other |
| row_count | int | |
| status | enum | `pending` / `processing` / `complete` / `failed` |
| created_by | uuid | references users |
| metadata | jsonb | column mapping, error rows |

### 5.14 custom_fields (deferred)

The original brief wanted flexible custom fields. We are deferring this deliberately, it is a classic source of the complexity Lovable fell into. The `profiles.extended` jsonb column is the interim escape hatch. Revisit only if a real need appears.

---

## 6. Derived concepts (computed, never stored as truth)

These are views or query-time calculations, not user-editable columns.

- **Profile strength**: aggregate of owner strengths plus interaction recency. Drives Orbit.
- **Orbit ring**: bucketed from profile strength and recency.
- **last_interaction**: latest `activity_date` for a profile (replaces the manual field in V2).
- **Connect suggestions**: reconnect, introduce, emerging (see section 8).

Keeping these as views means we can change the formula without a migration and without rewriting history.

---

## 7. Orbit model

Orbit is a visualisation of relationship strength, not a separate system. Subtitle stands: "Our ecosystem at a glance. The closer to the centre, the stronger the relationship."

Rings combine owner strength with recency bands (ADR 0005):

- **Inner circle**: strength `inner_circle` or `strong`, active (0–6 months).
- **Active network**: `warm`, or strong but in reconnect band (6–9 months).
- **Extended network**: `weak`, still active.
- **Dormant**: 9+ months regardless of nominal strength.

Recency bands (config-driven, not stored):

| Band | Threshold |
|---|---|
| Active | 0–6 months since last activity |
| Reconnect | 6–9 months |
| Dormant | 9+ months |

Node colour encodes the primary owner (Priya, Henry, Simon, Jordan). At a glance you see both how close someone is and who owns them. That ownership colouring is what turns Orbit from decoration into an operating view of the studio's network.

---

## 8. Connect model

Connect answers three questions, all computed from the graph:

1. **Reconnect**: strong or inner-circle relationships with no activity in 6+ months.
2. **Introduce**: two profiles with shared tags or shared events and no existing connection edge.
3. **Emerging**: profiles with a recent activity spike, multiple events attended, or new connections.

No AI required for V1 Connect. These are deterministic queries over activities, connections, events and tags.

---

## 9. Search model

Search spans more than profile fields. It indexes:

- Profiles (name, company, occupation, location, bio)
- Tags
- Activities (title, summary)
- Events
- Email subjects, and bodies subject to the privacy decision (ADR 0003)

This is the one place I would expand the original brief. Search over evidence, not just cards, is most of where users will spend their time.

Implementation: see ADR 0006 and `docs/specs/search.md` (Postgres FTS in Phase 1, pgvector optional in Phase 2).

---

## 10. Permissions and RLS

- Every table carries `org_id`. RLS policy on all tables: a user sees rows only where `org_id` equals their org.
- Within the org, profiles and relationships are shared and visible to all members. Ownership is informational, it does not restrict read access in V1 (except email bodies per ADR 0003).
- Org name, slug, and team roster are configured in `src/config/team-members.json` and the `organisations` row — not hard-coded in application code.

See ADR 0001.

---

## 11. Not in V1 (on purpose)

- Subjective scoring fields: Influence, Trust, Alignment, Warmth, Momentum, Current Relevance, Future Potential. Hidden, not surfaced for human upkeep.
- Claude chat and copilot.
- Automated strength scoring and agents (Phase 3 — see ADR 0009 for the planned workflows).
- Network ML or graph analytics beyond the deterministic Connect queries.
- Billing, public signup, self-serve onboarding.
- Custom field UI.

**Phase 1.1 (partially shipped):**
- Google Calendar sync — **shipped** (`calendar_accounts`, `calendar_events`, `calendar_participant_reviews`; OAuth connect + daily cron; see ADR 0008).
- Field-level merge rules on the admin merge UI (preserve best value per field, not just "winner takes all").

**Planned Phase 1.1 (not yet in schema):**
- Continuous dedup — `potential_duplicates` review table + background fuzzy name+company scan job. No migration yet; admin dedup page is detect-only against current schema.

---

## 12. Build sequence

**Phase 1, Foundation.** Org, users, auth, RLS, profiles, tags, CSV import, search, email ingestion (threads, messages, activity generation), relationships, relationship_owners, activities, events, event_attendees. No AI, no scoring, no chat.

**Phase 1.1, Calendar sync (shipped 2026-06-21).** `calendar_accounts`, `calendar_events`, `calendar_participant_reviews`; OAuth connect; daily cron; admin review UI. Spec: `docs/specs/calendar-sync.md`.

**Phase 2, Intelligence.** Connections graph (incl. inferred), Orbit, computed strength and last_interaction, Connect suggestions, watchlist.

**Phase 3, AI.** Only once the graph holds real data. Four agent workflows: meeting intelligence (calendar-triggered participant matching and connection inference), relationship health (weekly proactive action suggestions), event preparation (per-attendee briefings), and introduction facilitation (draft → outcome tracking). See ADR 0009. **Write policy:** ADR 0010 — sync facts auto-write; humans confirm identity, linking, connections, and enrichment.

---

## 13. Decisions (closed via ADRs)

| Question | ADR | Status |
|---|---|---|
| Org scoping and clone strategy | 0001 | Accepted |
| Unmatched email participants | 0002 | Accepted |
| Email body access | 0003 | Accepted |
| Import dedup | 0004 | Accepted |
| Dormant / reconnect thresholds | 0005 | Accepted |
| Search approach | 0006 | Accepted |
| Gmail sync ownership | 0007 | Accepted |
| Multi-party activities | — | Accepted: single-profile-per-row for V1; `activity_participants` is the upgrade path |
| Connection inference scope | — | Accepted: manual + same-company + co-event in V1; email inference V2 |
| Introduction attribution | — | Accepted: `introduced_by` on both `activities` and `connections`; `introduction_outcome` on introduction activities |
| Organisation name matching | — | Accepted: `organisation_name_normalised` computed at write for inference only; company-as-entity deferred |
| Calendar sync design intent | 0008 | Accepted; Phase 1.1 shipped 2026-06-21 |
| Phase 3 agent workflows | 0009 | Accepted: four agents (meeting intelligence, relationship health, event prep, intro facilitation); calendar sync is prerequisite |
| Automation boundaries (Tier A–D writes) | 0010 | Accepted: sync facts auto-write; humans for identity, linking, connections, enrichment |
| Continuous dedup | — | Accepted: `potential_duplicates` review table planned Phase 1.1; no migration yet |
