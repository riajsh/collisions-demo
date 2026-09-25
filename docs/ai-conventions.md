# AI Development Conventions

- Version: 1.0
- Status: Accepted
- Audience: the team and Cursor. Referenced by AGENTS.md.

How we build Ecosystem consistently. Keep this doc the detailed reference. Keep AGENTS.md short and pointing here.

## Stack

- Next.js 16 (App Router), TypeScript.
- Supabase (Postgres, Auth, RLS, Storage).
- Vercel hosting.
- Tailwind plus shadcn/ui for primitives. Do not rebuild Button, Input, Modal from scratch.
- Postgres full-text search in Phase 1. pgvector only if and when Phase 2 needs semantic search.

## Source of truth

- The database schema is the source of truth. Generate TypeScript types from it (`supabase gen types`), never hand-maintain a parallel type definition.
- domain-model-v1.md governs the schema. If reality diverges, update the doc in the same PR.

## Layer separation

Mirror the three layers of truth in the folder structure and the code.

- Layer 1 Reality: user-entered data. Plain tables, normal writes.
- Layer 2 Inference: computed values (strength, Orbit ring, last_interaction, Connect suggestions). Implemented as SQL views or query-time computation. Never user-editable columns. Changing a formula must not require a migration or rewrite history.
- Layer 3 AI: reasoning over Layers 1 and 2. Phase 3 only. **Write policy (ADR 0010):** Tier A sync facts (e.g. calendar `meeting` activities on exact email match) auto-write with `source` + `source_ref`. Tier C/D writes (identity, linking, connections, enrichment, ownership) require human action. Tier B AI enrichment is append-only and UI-labelled — never overwrites human-entered fields.

## Hard rules (never do)

- Never take `org_id` from the client. Derive it from the authenticated session, server side.
- Never write a computed value as if it were user-entered fact.
- Never ship a table without an RLS policy. RLS from day one, on every table.
- Never hard-code org name or team emails outside `src/config/team-members.json`, seed, and the `organisations` row.
- Never put a subjective score field (Influence, Trust, Warmth, etc.) in front of a user in V1.
- Never store secrets in the repo or pass an API key from the client.

## Conventions

- Naming: snake_case in the database, camelCase in TypeScript, kebab-case for files and routes.
- Every ingested record carries `source` and `source_ref` for traceability and idempotent re-sync.
- Imports and syncs are idempotent. Re-running must not duplicate rows. Use natural keys (gmail_thread_id, gmail_message_id) and upserts.
- Inferred data is flagged in the schema (a `source` enum value) and rendered distinctly in the UI.
- Docs-first lifecycle: domain model agreed, ADR for each real decision, then code. Update docs in the same PR when reality changes.

## Phase discipline

- Phase 1 ships no AI, no scoring, no chat. Foundation only.
- Phase 2 adds intelligence with deterministic queries and views, no LLMs required.
- Phase 3 adds the AI layer over a populated graph, with logging of (context, action, outcome) for every AI call and an eval set before any AI feature ships.
- Gmail sync is Ecosystem-owned, not shared with Pathway PM (ADR 0007). See `docs/specs/gmail-sync.md`.
- Calendar sync (Phase 1.1) follows `docs/specs/calendar-sync.md`. Participant matching shares `ORG_INTERNAL_EMAIL_DOMAINS` with Gmail.
- Import pipeline follows `docs/specs/import-pipeline.md`. Never auto-merge on name alone (ADR 0004).
- Search follows `docs/specs/search.md`. Postgres FTS in Phase 1; pgvector deferred (ADR 0006).
- Profile detail UI follows `docs/specs/profile-detail.md`. Admin review queues follow `docs/specs/admin-review.md`.

## Privacy

- Email bodies are sensitive. Honour the access decision in ADR 0003 in both RLS and UI.
- Never put personal data in URLs or query strings.
