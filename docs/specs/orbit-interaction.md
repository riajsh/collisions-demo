# Orbit Interaction Specification (Phase 2)

- Version: 0.1
- Status: **Draft — write before Phase 2 Orbit UI work begins**
- Related: domain-model-v1.md §7, ADR 0005, design-tokens.md §4.2, information-architecture.md §Orbit

Placeholder spec so Phase 2 planning does not start cold. Expand each section when Orbit enters the build queue.

---

## 1. Purpose

Orbit is the relationship radar: strength and recency as distance from centre, owner as node colour. It answers "who matters most right now?" at a glance — not a decorative graph.

---

## 2. Data source (Layer 2)

Orbit reads **computed views only** — never user-editable columns:

- `orbit_ring_view` (stub in first Phase 2 migration — see `docs/build-quality.md` §1)
- `relationship_strength_view` for node sizing
- Primary owner from `relationship_owners.is_primary`
- Owner colours from `ownerColour(userId)` / `@theme` tokens

Recency bands (ADR 0005):

| Band | Threshold |
|---|---|
| Active | 0–6 months since last activity |
| Reconnect | 6–9 months |
| Dormant | 9+ months |

Ring assignment combines owner strength + recency band (domain-model §7).

---

## 3. Interaction model (to specify)

- [ ] Default view: filtered subset, never full hairball
- [ ] Filter controls: owner, tag, status, ring band
- [ ] Node click → profile drawer (same as profiles table)
- [ ] Node chrome: name only at default zoom; strength/recency on hover
- [ ] Legend: owner colours + ring labels
- [ ] Empty state: explain what populates Orbit (activities, owners, strength)
- [ ] Performance budget: max nodes rendered without virtualization threshold

---

## 4. Visual language (to specify)

Reference `design-tokens.md` §4.1–4.2:

- Node fill = primary owner colour
- Node size = strength tier
- Ring boundaries = recency band
- Dormant nodes: reduced opacity per token
- Inferred edges (Phase 2+): dashed stroke, `--color-data-inferred`

---

## 5. Out of scope

- Manual drag-to-reposition (rings are computed, not layout preferences)
- Subjective score editing from Orbit
- AI chat overlay

---

## 6. Acceptance criteria (draft)

- [ ] Orbit renders from Layer 2 views, not ad-hoc client computation
- [ ] Filter-before-decorate: sensible default subset on load
- [ ] Node click opens profile drawer with correct profile
- [ ] Owner legend matches `ownerColour()` for all visible nodes
- [ ] Dormant band visually distinct from active inner circle
