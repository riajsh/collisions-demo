# ADR 0002: Unmatched email participants

- Status: Accepted
- Date: 2026-06-20
- Deciders: Nova Collective team

## Context

The Gmail sync pulls full project-related threads. Thread participants are matched to profiles by email. Some participants will have no matching profile. We must decide what happens to them without either losing signal or filling the graph with noise.

## Options

1. **Skip.** Ignore unmatched participants. Simple, but we lose evidence of who is in the org's orbit.
2. **Auto-create stub profiles.** Every unmatched email becomes a profile. Captures everything, but pollutes the database with vendors, no-reply addresses and one-off contacts.
3. **Review queue.** Create lightweight pending records surfaced in Admin. A human links to an existing profile, creates a profile, or ignores.

## Decision

Option 3. **Do not auto-create profiles from email ingestion.**

When a participant email has no profile match:

1. Attempt match on `lower(email)` against existing profiles.
2. On match: attach thread to profile, generate activity, record relationship source (see domain model §5.6).
3. On no match: create an `email_participant_reviews` row (not a profile).
4. Surface in Admin review queue.

Review actions:

- **Link to existing profile** — attach participant to profile; backfill activities for that thread where applicable.
- **Create profile** — create profile + relationship + optional owner; then link review row.
- **Ignore** — dismiss; add email to org ignore list if appropriate (no-reply, billing, calendar).

Add an org-level ignore list for obvious non-people (no-reply@, calendar-notification@, billing@ patterns).

## Consequences

- Needs `email_participant_reviews` table and Admin review surface (see `docs/specs/gmail-sync.md` §11, `docs/specs/admin-review.md` §6).
- No profile or relationship exists until a human promotes or links.
- Slight ongoing curation effort, in exchange for a clean graph.
