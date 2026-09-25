/*
 * Foundation for AI-powered "intelligent search" over profiles:
 * - tags.category gains two more values, 'seniority' and 'function', so the
 *   AI can classify a profile's seniority level (e.g. "VP", "C-level") and
 *   functional area (e.g. "Marketing", "Operations") the same visible way
 *   'industry' tags already work.
 * - profile_tags.source distinguishes tags a person added manually from
 *   ones the AI inferred, so re-running enrichment can safely replace its
 *   own previous guesses without ever touching a tag a human added by hand
 *   (this matters most for 'industry', which both humans and the AI can
 *   tag).
 * - profiles.ai_enrichment_generated_at / ai_enrichment_source_hash let the
 *   enrichment job skip profiles whose occupation/company/bio haven't
 *   changed since it last ran, so re-running it (e.g. on a schedule) is
 *   cheap and doesn't needlessly re-tag everyone every time.
 */

alter table public.tags drop constraint tags_category_check;

alter table public.tags
  add constraint tags_category_check
    check (category in ('expertise', 'industry', 'signal_influence', 'events', 'seniority', 'function'));

-- 'function' and 'industry' both use "Other" as a fallback value in their
-- fixed vocabularies, and tags were previously unique per (org_id, name)
-- only — so the first profile classified as function="Other" would create
-- a tag that a later industry="Other" classification would incorrectly
-- reuse (findOrCreateTag matches by name only), attaching it to the wrong
-- category. Scoping uniqueness to (org_id, name, category) lets the same
-- name exist once per category, which is what the two-dimension vocab
-- design actually needs.
drop index if exists public.tags_org_name_unique_idx;

create unique index tags_org_name_category_unique_idx
  on public.tags (org_id, name, category);

alter table public.profile_tags
  add column source text not null default 'manual'
    check (source in ('manual', 'ai_inferred'));

alter table public.profiles
  add column ai_enrichment_generated_at timestamptz,
  add column ai_enrichment_source_hash text;
