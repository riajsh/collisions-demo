# ADR 0007: Gmail sync ownership

- Status: Accepted
- Date: 2026-06-20
- Deciders: Nova Collective team

## Context

Email ingestion is the highest-risk subsystem: privacy, permissions, and relationship attribution intersect here. Pathway PM may have its own Gmail sync. Ecosystem needs a decision on whether to share that infrastructure or own email ingestion independently.

## Options

1. **Shared sync with Pathway PM.** Reuse existing cron, labels, and thread storage. Less initial work, but couples the relationship graph to another product's data model and release cycle.
2. **Dedicated Ecosystem sync.** Ecosystem owns Gmail OAuth, sync jobs, and all email tables from day one.

## Decision

Option 2. **Dedicated Ecosystem sync.**

The relationship graph is a core asset. Email ingestion must not be coupled to Pathway PM. Ecosystem owns:

- `gmail_accounts` — connected inboxes and OAuth tokens
- `email_threads`
- `email_messages`
- `email_participant_reviews` — unmatched participant queue (ADR 0002)

Pathway PM may continue its own sync for project management purposes. Ecosystem sync is scoped to relationship intelligence: project-labelled threads, profile matching, activity generation, provenance. No shared tables, no shared cron job.

Implementation spec: `docs/specs/gmail-sync.md`.

## Consequences

- Separate OAuth flow and token storage for Ecosystem Gmail accounts.
- Duplicate Gmail API usage vs Pathway (acceptable; scopes and retention may differ).
- Ecosystem can evolve email→relationship attribution without coordinating with Pathway releases.
- Cron runs as an Ecosystem-owned job (see `docs/technical-architecture.md`).
