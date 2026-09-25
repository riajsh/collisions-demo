# AGENTS.md

Ecosystem is a relationship intelligence platform. This repository is the **Nova Collective** instance. It answers: who do we know, who on the team knows them, how strong is the relationship, and how do we create value through the network.

## Setup (read first)

**[SETUP.md](./SETUP.md)** — step-by-step setup for local dev and production. When helping a new user or setup task, follow SETUP.md phase by phase and verify each step before continuing.


## Read these before building

Doc index: `docs/README.md`

- `SETUP.md` — **start here** for local/production setup (Cursor onboarding)
- `docs/domain-model-v1.md` — the data model and source of truth.
- `docs/product-brief-v1.md` — what V1 is and is not.
- `docs/information-architecture.md` — navigation and screens.
- `docs/design-principles.md` — how it should feel.
- `docs/technical-architecture.md` — what lives where (read before SQL).
- `docs/ai-conventions.md` — stack, layer rules, and hard "never do" list.
- `docs/specs/gmail-sync.md` — email ingestion spec (**schema ready; sync not implemented**).
- `docs/specs/calendar-sync.md` — Google Calendar sync pipeline (Phase 1.1).
- `docs/specs/import-pipeline.md` — CSV import flow.
- `docs/specs/profile-detail.md` — profile page/drawer (most-used screen).
- `docs/specs/admin-review.md` — review queue UI (calendar, import, email).
- `docs/specs/workflows.md` — core user jobs (pre-meeting research, review, etc.).
- `docs/specs/interaction-speed.md` — two-touch rule, inline editing, quick-log, keyboard nav, optimistic updates. **Read before any UI work — these are constraints, not suggestions.**
- `docs/decisions/0008-calendar-sync.md` — Google Calendar sync design (implemented Phase 1.1).
- `docs/specs/search.md` — FTS index design (applied in Phase 1 migrations; read before any search feature work).
- `docs/design-tokens.md` — @theme tokens, owner palette, strength colours, CVA pattern. Read before any UI work.
- `docs/build-quality.md` — session discipline, AI red team, Nova Collective canary, schema-locked mode.
- `docs/decisions/` — accepted ADRs (0001–0010). **Before Phase 3 / agent work:** read 0009 (workflows) and 0010 (automation boundaries).

## Core rules

- Relationships are primary, not contacts.
- Schema is the source of truth. Generate types from it.
- RLS on every table. `org_id` comes from the session, never the client.
- Three layers stay separate: user-entered, computed (views), AI (Phase 3). Write policy ADR 0010: sync facts auto-write; humans for identity, linking, connections, enrichment.
- No subjective scoring fields, no AI chat, no scoring in V1.
- Never hard-code org name or team emails outside `src/config/team-members.json`, seed, and the `organisations` row.
- Imports and syncs are idempotent.

When in doubt, follow `docs/ai-conventions.md`. If a decision is missing, add an ADR rather than guessing in code.
