# Ecosystem documentation

Start here for Cursor sessions and onboarding.

## Core (read first)

| Doc | Purpose |
|---|---|
| [domain-model-v1.md](./domain-model-v1.md) | Data model — single source of truth |
| [product-brief-v1.md](./product-brief-v1.md) | What V1 is and is not |
| [information-architecture.md](./information-architecture.md) | Navigation and screens |
| [technical-architecture.md](./technical-architecture.md) | What lives where (read before SQL) |
| [ai-conventions.md](./ai-conventions.md) | Stack, layer rules, hard "never do" list |
| [build-quality.md](./build-quality.md) | Session discipline, testing, schema-locked mode |
| [design-tokens.md](./design-tokens.md) | `@theme` tokens, CVA, owner palette |
| [design-principles.md](./design-principles.md) | How the product should feel |

## Feature specs

| Spec | Status |
|---|---|
| [specs/profile-detail.md](./specs/profile-detail.md) | Accepted — most-used screen |
| [specs/gmail-sync.md](./specs/gmail-sync.md) | Accepted — **schema ready; sync not implemented** |
| [specs/calendar-sync.md](./specs/calendar-sync.md) | Accepted — Phase 1.1 shipped |
| [specs/admin-review.md](./specs/admin-review.md) | Accepted — review queue UX |
| [specs/workflows.md](./specs/workflows.md) | Accepted — core user jobs |
| [specs/interaction-speed.md](./specs/interaction-speed.md) | Accepted — speed patterns |
| [specs/import-pipeline.md](./specs/import-pipeline.md) | Accepted — CSV import |
| [specs/search.md](./specs/search.md) | Accepted — Postgres FTS |
| [specs/orbit-interaction.md](./specs/orbit-interaction.md) | Draft — expand before Phase 2 Orbit |

## Decisions (ADRs)

Accepted decisions in [decisions/](./decisions/) — 0001 through 0010.

| ADR | Topic |
|---|---|
| 0001 | Org scoping and clone strategy |
| 0002 | Unmatched email participants → review queue |
| 0003 | Email body access |
| 0004 | Import dedup |
| 0005 | Dormant / reconnect thresholds |
| 0006 | Search approach |
| 0007 | Gmail sync ownership |
| 0008 | Google Calendar sync (Phase 1.1 shipped) |
| 0009 | Phase 3 agent workflows |
| 0010 | Automation boundaries (Tier A–D write policy) |

## Gate and history

| Doc | Purpose |
|---|---|
| [../SETUP.md](../SETUP.md) | **Step-by-step setup** — Cursor onboarding checklist |
| [pre-migration-gate.md](./pre-migration-gate.md) | Pre-migration sign-off (2026-06-20) + post-gate notes |

## Cursor rules

Project rules in `.cursor/rules/` — `supabase.mdc`, `data.mdc`, `ui.mdc`. Agent entry point: [../AGENTS.md](../AGENTS.md).
