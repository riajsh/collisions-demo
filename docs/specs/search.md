# Search Specification

- Version: 1.0
- Status: Accepted
- Related: ADR 0006, ADR 0003, domain-model-v1.md §9

Search is the primary interface. It spans evidence, not just cards.

---

## 1. Purpose

Return relevant profiles, activities, events and email threads from a single query. Evidence-rich results — not just name matches. Results respect privacy boundaries (ADR 0003): email subjects are org-wide; email bodies are owner/admin only.

---

## 2. Scope

### In scope (Phase 1)

- Profile fields: name, company, occupation, location, bio
- Tags: name
- Activities: title, summary
- Events: title, description
- Email thread subjects (org-wide)
- Email message bodies (owner/admin RLS — ADR 0003)
- Ranked results with entity type labels
- OR semantics across entity types (one query, multiple result types)

### Out of scope (Phase 1)

- Semantic/vector search (Phase 2, pgvector — ADR 0006)
- AI-assisted query expansion (Phase 3)
- Saved searches or search history
- Faceted filtering (beyond the basic filters in the UI — company, tag, owner)
- Full relationship graph traversal in search results

---

## 3. Index design

### Approach

Generated `fts tsvector` columns on each indexed table, updated automatically by Postgres. GIN index on each. At query time, parallel queries per entity type, merged and re-ranked in application layer. A `search_results` view unions the common shape for convenience.

This avoids a separate sync job and keeps search consistent with the live data. Materialized views deferred to Phase 2 if query latency becomes a problem.

### Per-table tsvector columns

**profiles**

```sql
fts tsvector generated always as (
  setweight(to_tsvector('english', coalesce(full_name, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(organisation_name, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(occupation, '')), 'C') ||
  setweight(to_tsvector('english', coalesce(location_city, '') || ' ' || coalesce(location_country, '')), 'C') ||
  setweight(to_tsvector('english', coalesce(bio, '')), 'D')
) stored
```

Weight rationale: name (A) > company (B) > role/location (C) > bio (D).

**activities**

```sql
fts tsvector generated always as (
  setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(summary, '')), 'B')
) stored
```

**events**

```sql
fts tsvector generated always as (
  setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(description, '')), 'B')
) stored
```

**tags**

```sql
fts tsvector generated always as (
  to_tsvector('english', coalesce(name, ''))
) stored
```

No weighting needed — tag name is the only field.

**email_threads** (subjects — org-wide)

```sql
fts tsvector generated always as (
  to_tsvector('english', coalesce(subject, ''))
) stored
```

**email_messages** (bodies — owner/admin only)

```sql
fts tsvector generated always as (
  to_tsvector('english', coalesce(body, ''))
) stored
```

Body column access is controlled by RLS (ADR 0003). The `fts` column inherits the same row-level visibility — a user who cannot read `body` cannot read `fts` either.

### GIN indexes

```sql
create index profiles_fts_idx        on profiles        using gin(fts);
create index activities_fts_idx       on activities       using gin(fts);
create index events_fts_idx           on events           using gin(fts);
create index tags_fts_idx             on tags             using gin(fts);
create index email_threads_fts_idx    on email_threads    using gin(fts);
create index email_messages_fts_idx   on email_messages   using gin(fts);
```

---

## 4. Query pattern

### Single-entity query (illustrative — profiles)

```sql
select
  id,
  'profile'           as entity_type,
  full_name           as title,
  organisation_name   as subtitle,
  ts_rank_cd(fts, query) as rank
from profiles, plainto_tsquery('english', :q) query
where org_id = :org_id
  and fts @@ query
order by rank desc
limit 20;
```

### Cross-entity union (via search view or application layer)

Run equivalent queries against each indexed table, UNION ALL, re-sort by rank. Application layer merges and groups by entity type. Limit 10 per entity type before union; overall limit 50.

### Search view (convenience, not required)

```sql
create view search_index as
  select id, org_id, 'profile'  as entity_type, full_name as title, organisation_name as subtitle, fts from profiles
  union all
  select id, org_id, 'activity' as entity_type, title, summary as subtitle, fts from activities
  union all
  select id, org_id, 'event'    as entity_type, title, description as subtitle, fts from events
  union all
  select id, org_id, 'tag'      as entity_type, name as title, null as subtitle, fts from tags
  union all
  select id, org_id, 'thread'   as entity_type, subject as title, null as subtitle, fts from email_threads;
```

`email_messages` excluded from the union view — queried separately with explicit RLS check for body access (ADR 0003). Do not expose body fts through the general search view.

---

## 5. Privacy boundary (ADR 0003)

| Source | Who can search | Column |
|---|---|---|
| Profile fields | All org members | `profiles.fts` |
| Activity titles + summaries | All org members | `activities.fts` |
| Event titles + descriptions | All org members | `events.fts` |
| Tag names | All org members | `tags.fts` |
| Email thread subjects | All org members | `email_threads.fts` |
| Email message bodies | Relationship owners for matched profiles + admins | `email_messages.fts` |

RLS on `email_messages` enforces the body access boundary. `search_index` view must not include `email_messages`. Body search is a separate query path, gated by the same policy as direct body reads.

---

## 6. Result shape

Each result returned to the UI:

```ts
type SearchResult = {
  id: string
  entityType: 'profile' | 'activity' | 'event' | 'tag' | 'thread' | 'message'
  title: string
  subtitle: string | null
  rank: number
  // entity-specific context fields, added per type:
  profileId?: string        // for activity, thread, message results
  activityDate?: string
  eventDate?: string
  ownerIds?: string[]       // relationship owners, for profile results
}
```

The UI groups results by `entityType`. Profile results are primary; other types surface as supporting evidence below.

---

## 7. Ranking

`ts_rank_cd` with the weighted tsvector columns. Cover density (`cd`) suits short documents like profile bios and email subjects — it penalises results where the query terms are spread far apart.

Default normalization: divide by `(1 + log(document length))` to prevent longer bios and email threads from dominating.

Phase 2 refinement: combine FTS rank with recency signal (e.g. `last_activity_at`) for profile results.

---

## 8. Phase 2: pgvector

When FTS recall proves insufficient (especially for semantic queries like "investor who cares about climate"), add pgvector as a second index:

- `embedding vector(1536)` on `profiles` (name + bio + company text, embedded on write)
- Cosine similarity query alongside FTS, results merged
- No new infrastructure: pgvector is a Supabase-native extension
- FTS remains the primary path; vector is a recall supplement

Do not build this until real search queries on real data show the gap.

---

## 9. Acceptance criteria

- [ ] All six indexed tables have `fts` generated columns and GIN indexes
- [ ] Single-word query returns matching profiles ranked by name > company > bio
- [ ] Multi-word query uses AND semantics by default (`plainto_tsquery`)
- [ ] Tag match returns profile results (via profile_tags join)
- [ ] Email subject search returns thread results for all org members
- [ ] Email body search returns results only for owners/admins of matched profiles
- [ ] Re-indexing (update profile name) automatically updates tsvector without manual trigger
- [ ] Search with empty string returns no results (not all rows)

---

## 10. Open items

None. All decisions closed.
