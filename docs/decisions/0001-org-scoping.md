# ADR 0001: Org scoping and multi-tenancy

- Status: Accepted
- Date: 2026-06-20
- Deciders: Nova Collective team

## Context

V1 serves a single organisation per deployment (Nova Collective in this repository). The schema is org-scoped from day one so the platform can be re-hosted for another team without rebuilding data models or RLS policies. We need clean separation without building go-to-market SaaS machinery.

## Decision

- Every table carries `org_id`, set from the start.
- RLS on every table restricts reads and writes to the user's org.
- `org_id` is derived server side from the authenticated session, never accepted from the client.
- Org name, slug, and team roster live in `src/config/team-members.json`, seed, and the `organisations` row — not hard-coded in application code.
- Provisioning another deployment means a fresh Supabase project (or new `org_id`), the same migrations, and empty data.

## Consequences

- Slightly more discipline per query and per policy, paid once.
- Handover to a new team is a configuration and data migration exercise, not a rebuild.
- No billing, signup or self-serve onboarding is built. This is not a commercial SaaS.
