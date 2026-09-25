/*
 * Phase 1 — Step 10: Full-text search
 *
 * Generated tsvector columns and GIN indexes per docs/specs/search.md and ADR 0006.
 * email_messages.fts is excluded from the general search_index view — body search
 * is a separate query path gated by the same body access policy as direct reads (ADR 0003).
 */

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column fts tsvector generated always as (
    setweight(to_tsvector('english', coalesce(full_name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(organisation_name, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(occupation, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(location_city, '') || ' ' || coalesce(location_country, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(bio, '')), 'D')
  ) stored;

create index profiles_fts_idx on public.profiles using gin (fts);

-- ---------------------------------------------------------------------------
-- activities
-- ---------------------------------------------------------------------------

alter table public.activities
  add column fts tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(summary, '')), 'B')
  ) stored;

create index activities_fts_idx on public.activities using gin (fts);

-- ---------------------------------------------------------------------------
-- events
-- ---------------------------------------------------------------------------

alter table public.events
  add column fts tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B')
  ) stored;

create index events_fts_idx on public.events using gin (fts);

-- ---------------------------------------------------------------------------
-- tags
-- ---------------------------------------------------------------------------

alter table public.tags
  add column fts tsvector generated always as (
    to_tsvector('english', coalesce(name, ''))
  ) stored;

create index tags_fts_idx on public.tags using gin (fts);

-- ---------------------------------------------------------------------------
-- email_threads (subjects — org-wide)
-- ---------------------------------------------------------------------------

alter table public.email_threads
  add column fts tsvector generated always as (
    to_tsvector('english', coalesce(subject, ''))
  ) stored;

create index email_threads_fts_idx on public.email_threads using gin (fts);

-- ---------------------------------------------------------------------------
-- email_messages (bodies — owner/admin only, ADR 0003)
-- ---------------------------------------------------------------------------

alter table public.email_messages
  add column fts tsvector generated always as (
    to_tsvector('english', coalesce(body, ''))
  ) stored;

create index email_messages_fts_idx on public.email_messages using gin (fts);

-- Restrict body fts to the same access tier as body text
revoke select (fts) on public.email_messages from authenticated, anon;

-- Body search RPC: returns message ids the caller may search/read
create or replace function public.search_email_message_bodies(p_query text, p_limit integer default 20)
returns table (
  id uuid,
  thread_id uuid,
  gmail_message_id text,
  sent_at timestamptz,
  rank real
)
language sql
stable
security definer
set search_path = public
as $$
  select
    em.id,
    em.thread_id,
    em.gmail_message_id,
    em.sent_at,
    ts_rank_cd(em.fts, query) as rank
  from public.email_messages em,
       plainto_tsquery('english', p_query) query
  where em.org_id = public.auth_org_id()
    and em.fts @@ query
    and public.user_can_read_email_body(em.org_id, em.thread_id)
  order by rank desc
  limit greatest(p_limit, 1)
$$;

grant execute on function public.search_email_message_bodies(text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- search_index view (convenience union; excludes email_messages per ADR 0003)
-- ---------------------------------------------------------------------------

create or replace view public.search_index
with (security_invoker = true)
as
  select id, org_id, 'profile'::text as entity_type, full_name as title, organisation_name as subtitle, fts
  from public.profiles
  union all
  select id, org_id, 'activity'::text, title, summary as subtitle, fts
  from public.activities
  union all
  select id, org_id, 'event'::text, title, description as subtitle, fts
  from public.events
  union all
  select id, org_id, 'tag'::text, name as title, null::text as subtitle, fts
  from public.tags
  union all
  select id, org_id, 'thread'::text, subject as title, null::text as subtitle, fts
  from public.email_threads;

grant select on public.search_index to authenticated;

comment on view public.search_index is
  'Cross-entity FTS union for org-scoped search. email_messages excluded — body search uses search_email_message_bodies() (ADR 0003).';
