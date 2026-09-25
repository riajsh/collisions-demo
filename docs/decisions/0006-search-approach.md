# ADR 0006: Search approach

- Status: Accepted
- Date: 2026-06-20
- Deciders: Nova Collective team

## Context

Search is the primary interface. It must span more than profile fields: tags, activities, events and email subjects too. We want to avoid standing up external search infrastructure before it is justified.

## Decision

- **Phase 1:** Postgres full-text search (`tsvector`, GIN indexes) over profiles, tags, activities, events and email subjects. No external search service.
- Results are ranked and evidence-rich (owner, last interaction, matching context), not bare entity cards.
- Body-text search respects the email body access tier from ADR 0003.
- **Phase 2 (future):** add pgvector for semantic search if keyword search proves insufficient. pgvector is Supabase-native, so no new infrastructure.

## Consequences

- Search is fast and cheap to run in Phase 1 with no extra services.
- The index design leaves room for later RAG over org-scoped data with metadata filtering (tenant, sensitivity) in Phase 3.
- Search relevance tuning is deferred and tracked as it emerges from real use.
