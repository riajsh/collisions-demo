# ADR 0003: Email body access

- Status: Accepted
- Date: 2026-06-20
- Deciders: Nova Collective team

## Context

The sync stores full email bodies. Bodies are the most sensitive data in the system. We need an access model before email goes near production.

## Decision

**Split access for V1:**

- **Thread metadata** (subject, participants, dates, message counts) — org-wide read for all members.
- **Full body text** — restricted to relationship owners (users who are `relationship_owners` for any matched profile on the thread) and admins.

Enforce in both RLS and UI. Search over bodies respects the same tier per user (ADR 0006).

**Org setting for future flexibility:**

Add `email_access_level` on `organisations`:

| Value | Behaviour |
|---|---|
| `metadata_only` | Bodies never stored or never readable (future) |
| `restricted_body_access` | **V1 default.** Metadata org-wide; bodies owner/admin only |
| `full_body_access` | Bodies readable by all org members (future, if policy changes) |

V1 ships with `restricted_body_access`. The column exists from day one so a policy change does not require a painful migration.

## Consequences

- Two RLS tiers on email data: metadata policies vs body policies.
- Search index design must tag body content separately from metadata.
- Clear story for clients and team about how correspondence is handled.
- Admin can change `email_access_level` later without schema rework.
