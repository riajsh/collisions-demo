# ADR 0004: Import dedup

- Status: Accepted
- Date: 2026-06-20
- Deciders: Nova Collective team

## Context

Data arrives as CSVs from mixed sources (Clay, Airtable, Affinity, Attio, HubSpot, manual lists). The same person will appear across files. We need dedup that does not silently merge the wrong people.

## Decision

**Three-tier matching:**

1. **Email match (auto-merge).** If `lower(email)` matches an existing profile in the org, merge incoming row into that profile. Safe, deterministic.
2. **Name + company match (review queue).** If no email match but `full_name + organisation_name` is a near-match to an existing profile, surface in Admin import review. Human confirms or rejects. **Never auto-merge on name alone.**
3. **No match (new profile).** Create profile + relationship + owners as mapped.

Wrong merges on common names (John Smith, Sarah Lee, Chris Taylor) are expensive and hard to unpick. We never auto-merge on a guess.

Every import row records its `import_id` for traceability, rollback, and relationship source provenance.

## Consequences

- Needs import soft-match review surface in Admin (shares queue pattern with ADR 0002).
- Import pipeline implements explicit dedup stages (see `docs/specs/import-pipeline.md`).
- Each committed import creates `relationship_sources` rows where applicable.
