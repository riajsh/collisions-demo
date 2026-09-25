# Import Pipeline Specification

- Version: 1.0
- Status: Accepted
- Related: ADR 0004, domain-model-v1.md §5.3, §5.12, §5.6, `docs/specs/admin-review.md` §5

Imports are the primary data ingestion path for months after launch. This spec defines the full pipeline in detail before any code is written.

---

## 1. Purpose

Load external people data (CSV from Clay, Airtable, Affinity, Attio, HubSpot, or manual export) into the relationship graph with:

- Column mapping flexibility
- Safe dedup (email hard match only; name+company to review)
- Human review for ambiguous matches
- Full audit trail and rollback capability
- Automatic relationship + provenance creation

---

## 2. Pipeline overview

```
 Upload → Parse (mapping auto-guessed, dedup runs automatically) → Check & fix (review queue, optional mapping fix) → Complete → Audit Log
```

As of 2026-08-17, column mapping is auto-guessed and dedup runs automatically right after upload — there's no separate manual "confirm mapping" or "run dedup" click in the UI. Admins can still open "Fix column mapping" on the Check & fix screen if the auto-guess is wrong, which re-saves the mapping and re-runs dedup in one action (`updateMappingAndRecheck`).

Each stage persists state on the `imports` row. A failed import never partially commits without explicit recovery.

---

## 3. Stage 1: Upload

**Actor:** Admin  
**UI:** Admin → Import → Upload

| Step | Behaviour |
|---|---|
| File selection | CSV only in V1 (.csv, max 10MB configurable) |
| Source tag | User selects: clay / airtable / affinity / attio / hubspot / csv / other |
| Storage | File uploaded to Supabase Storage: `{org_id}/imports/{import_id}/original.csv` |
| Record created | `imports` row: `status=pending`, `filename`, `source`, `created_by` |

Validation:

- Reject empty files
- Reject non-UTF-8 without warning (attempt latin-1 fallback, flag in metadata)
- Virus scan: defer V1 (trusted internal users)

---

## 4. Stage 2: Parse

**Trigger:** Automatic on upload complete  
**Status transition:** `pending` → `processing`

| Step | Behaviour |
|---|---|
| Read CSV | Stream parse; handle quoted fields, embedded commas |
| Detect headers | First row = headers unless user overrides |
| Row count | Store `row_count` on import |
| Staging | Parsed rows stored in `imports.metadata.parsed_rows` (jsonb array) OR staging table `import_rows` (implementation choice; staging table preferred for large files) |

**Staging table `import_rows` (recommended):**

| column | type | notes |
|---|---|---|
| import_id | uuid | references imports |
| row_number | int | 1-based |
| raw | jsonb | original column → value map |
| normalized | jsonb | mapped field values after column mapping |
| dedup_status | enum | `pending` / `matched_email` / `soft_match` / `new` / `error` |
| matched_profile_id | uuid | nullable |
| error | text | nullable |

On parse error: `imports.status=failed`, errors in `metadata.errors`.

---

## 5. Stage 3: Preview

**Actor:** Admin  
**UI:** Admin → Import → {import_id} → Preview

Shows:

- First 20 rows as parsed
- Detected headers
- Row count, error count
- File source tag

Admin confirms headers look correct or goes back to re-upload.

---

## 6. Stage 4: Map

**Actor:** Admin  
**UI:** Column mapping interface

Map CSV columns → Ecosystem fields:

| Ecosystem field | Required | Notes |
|---|---|---|
| full_name | Yes | |
| email | No | Primary dedup key when present |
| organisation_name | No | Used for soft match |
| phone | No | |
| linkedin_url | No | |
| occupation | No | |
| location_city | No | |
| location_country | No | |
| relationship_status | No | Default `prospect` |
| relationship_type | No | Default `other` |
| owner_email | No | Match to `users.email` for relationship_owner |
| owner_strength | No | Default `unknown` |
| tags | No | Comma-separated; create tags if missing |

Unmapped columns: stored in `profiles.extended` under original header names.

Mapping saved to `imports.metadata.column_mapping`. Applying mapping populates `import_rows.normalized`.

Mapping is auto-guessed and auto-confirmed at upload (`mapping_confirmed: true` is set immediately, since every row is already normalised with the guessed mapping). Manually fixing the mapping from the Check & fix screen resaves it, re-applies it to every row, and re-runs dedup in one action.

---

## 7. Stage 5: Dedup

**Trigger:** Runs automatically right after upload (and again after any manual mapping fix)  
**Rules:** ADR 0004

For each `import_rows` row with normalized data:

### Tier 1 — Email match (auto)

```
IF normalized.email IS NOT NULL
AND EXISTS profile WHERE lower(profile.email) = lower(normalized.email) AND org_id = import.org_id
THEN dedup_status = matched_email
     matched_profile_id = profile.id
```

Row will **update** existing profile on commit (fill empty fields only; never overwrite non-empty without explicit "overwrite" flag — V1: fill empty only).

### Tier 2 — Name + company soft match (review)

```
IF dedup_status = pending
AND normalized.full_name IS NOT NULL
AND normalized.organisation_name IS NOT NULL
AND EXISTS profile WHERE similarity(full_name, organisation_name) exceeds threshold
THEN dedup_status = soft_match
     matched_profile_id = candidate.id
     metadata.match_reason = "name+company"
```

Similarity: normalised lowercase, trim whitespace. V1: exact match on `lower(full_name) + lower(organisation_name)` first; fuzzy (trigram) in Phase 1.1 if needed.

**Never auto-merge on soft match.**

### Tier 3 — New profile

```
IF dedup_status = pending
THEN dedup_status = new
```

### Errors

Missing `full_name` → `dedup_status=error`, `error="full_name required"`.

Summary written to `imports.metadata.dedup_summary`:

```json
{
  "matched_email": 42,
  "soft_match": 7,
  "new": 103,
  "error": 2
}
```

---

## 8. Stage 6: Review queue

**Actor:** Admin  
**UI:** Admin → Import → {import_id} → Review

Combined admin patterns: `docs/specs/admin-review.md` §5.

### Soft match review (import dedup)

For each `soft_match` row, show:

- Incoming: name, company, email
- Candidate: existing profile card
- Actions: **Confirm merge** | **Create new** | **Skip row**

| Action | Result |
|---|---|
| Confirm merge | `dedup_status=matched_email`, `matched_profile_id` confirmed |
| Create new | `dedup_status=new`, clear matched_profile_id |
| Skip row | `dedup_status=error`, `error="skipped by admin"` |

### Email participant review

Separate queue — `docs/specs/admin-review.md` §6 (planned; gmail-sync.md §11). Calendar participant review is shipped — admin-review.md §4.

Import cannot commit while unresolved `soft_match` rows remain (unless admin explicitly "commit anyway" with confirmation — not recommended).

---

## 9. Stage 7: Commit

**Trigger:** Admin clicks "Complete import"  
**Status transition:** `processing` → `complete` (or `failed`)

Soft matches can be resolved as: merge into the matched profile (`confirm`), create as a separate new profile (`create`), skip entirely (`skip`), or delete the matched profile and create a fresh one in its place (`replace`, added 2026-08-17). "Replace" deletes the existing profile at commit time and is tracked for rollback (the profile row is restored if the commit later fails) but does not restore its relationships/tags/event attendance, which are cascade-deleted with it.

**Cancelling (`cancelImport`, added 2026-08-17):** An admin can cancel any import that hasn't reached `complete` with real writes. If a commit was never started, this just deletes the staged import. If a commit was started (mid-flight or interrupted), it first undoes everything that commit has written so far — reusing the same rollback path as a failed commit (`rollbackImportCommitProgress`) — then deletes the import. The commit loop also checks every ~150 rows whether its own import row still exists, so a cancel issued while a commit is actively running will stop it within one chunk rather than racing it.

Atomic per org using a database transaction:

For each import_row where `dedup_status` in (`matched_email`, `new`):

### New profile path

1. Insert `profiles` (source=`csv`, org_id)
2. Insert `relationships` (profile_id, status, type from normalized)
3. Insert `relationship_owners` if owner_email mapped
4. Insert `relationship_sources`: `source_type=csv_import`, `source_id=import.id`, `source_label="{source} import {date}"`
5. Insert tags + profile_tags
6. Insert `activities` if row contains note/date metadata (optional V1)

### Email match path

1. Update existing profile: fill **empty** fields from normalized
2. Ensure `relationships` exists (create if missing)
3. Upsert `relationship_owners` if mapped
4. Append `relationship_sources` if not exists for this import
5. Upsert tags

### Post-commit

- `imports.status = complete`
- `imports.metadata.commit_summary` = counts created, updated, skipped
- Staging rows retained for audit (do not delete `import_rows`)

---

## 10. Stage 8: Audit log

Every import is fully traceable:

| What | Where |
|---|---|
| Original file | Supabase Storage path |
| Who uploaded | `imports.created_by` |
| Column mapping | `imports.metadata.column_mapping` |
| Dedup summary | `imports.metadata.dedup_summary` |
| Per-row decisions | `import_rows` with dedup_status, matched_profile_id |
| Commit summary | `imports.metadata.commit_summary` |
| Provenance | `relationship_sources` pointing to `import.id` |

**Rollback (V1 manual):** No automated rollback. Admin executes in this order:

1. Identify `imports.id` and confirm `status = complete`.
2. Read `imports.metadata.commit_summary` for `created_profile_ids` and `updated_profile_ids`.
3. **Created profiles only:** delete each profile by ID. Postgres cascades `relationships`, `relationship_owners`, `activities`, `profile_tags`, and `relationship_sources` tied to those profiles. Do **not** delete profiles that existed before the import (the `updated_profile_ids` list).
4. **Updated profiles:** field fills from email-match are logged in `commit_summary` but not auto-reverted. Revert manually if needed (rare).
5. **Import staging:** delete `import_rows` where `import_id` matches (optional — keeps audit trail if retained).
6. **Import record:** set `imports.status = failed` and append rollback note to `imports.metadata`, or delete the `imports` row if no audit needed.
7. **Storage:** delete the uploaded file from Supabase Storage if reclaiming space (path in `imports.storage_path`).

Full automated rollback (revert updates, undo merges, restore previous field values) deferred to Phase 1.1.

---

## 11. UI states

| imports.status | Meaning | Admin sees |
|---|---|---|
| `pending` | Uploaded, not parsed | "Processing…" |
| `processing` | Parsed, mapping/dedup in progress | Mapping / review UI |
| `complete` | Committed | Summary + link to created/updated profiles |
| `failed` | Parse or commit error | Error details + retry option |

---

## 12. Edge cases

| Case | Handling |
|---|---|
| Duplicate email within same CSV | First row wins; subsequent flagged `error="duplicate in file"` |
| Same person, different emails in file | Both create separate profiles unless admin merges manually later |
| Owner email not found in users | Row commits; owner skipped; warning in commit summary |
| Empty organisation_name on soft match | Skip soft match tier; treat as new |
| Re-import same Clay export | Email matches update existing; no duplicate profiles |
| Profile with needs_review from email | Import email match links normally; email review is separate |

---

## 13. Acceptance criteria

- [ ] Upload CSV → preview shows correct rows and headers
- [ ] Column mapping persists and applies to all rows
- [ ] Email match merges into existing profile without duplicating
- [ ] Name+company near-match never auto-merges; requires review action
- [ ] Unreviewed soft matches block commit
- [ ] Commit creates profiles + relationships + relationship_sources
- [ ] Re-running same file is idempotent (email matches update, not duplicate)
- [ ] Full audit trail queryable by import_id

---

## 14. Decisions (closed)

| Item | Decision |
|---|---|
| Staging | Dedicated `import_rows` table. Map, dedup, review and commit all read from it. Do not use jsonb metadata for row-level staging. |
| Soft match algorithm | Exact `lower(full_name) + lower(organisation_name)` in V1. Trigram fuzzy match in Phase 1.1 if false negatives are a problem in practice. |
| Email match overwrite policy | Fill empty fields only. Never overwrite non-empty curated data on email match. Per-field source precedence is a future upgrade. |
| File size limits | 10 MB max file size. 5,000 row limit per import in V1 (raise in Phase 1.1 with background job support). Enforce at upload; show clear error if exceeded. |
