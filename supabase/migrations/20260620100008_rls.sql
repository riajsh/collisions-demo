/*
 * Phase 1 — Step 9: Row Level Security
 *
 * Org isolation on every table: org_id = (select org_id from users where id = auth.uid()).
 * org_id is never accepted from the client — policies enforce session-derived org scope.
 *
 * Email privacy (ADR 0003): thread metadata is org-wide; message body and body fts
 * are restricted to admins, relationship owners for matched profiles on the thread,
 * or all org members when email_access_level = full_body_access. Column privileges
 * on email_messages.body and email_messages.fts enforce the body tier at the database
 * layer; a user-facing view exposes body conditionally.
 */

-- ---------------------------------------------------------------------------
-- Auth helper functions
-- ---------------------------------------------------------------------------

create or replace function public.auth_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from public.users where id = auth.uid()
$$;

create or replace function public.auth_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users
    where id = auth.uid()
      and role = 'admin'
  )
$$;

create or replace function public.org_has_full_body_access(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organisations
    where id = p_org_id
      and email_access_level = 'full_body_access'
  )
$$;

-- True when the current user may read email message bodies for a thread.
create or replace function public.user_can_read_email_body(p_org_id uuid, p_thread_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() is not null
    and public.auth_org_id() = p_org_id
    and (
      public.org_has_full_body_access(p_org_id)
      or public.auth_is_admin()
      or exists (
        -- Relationship owner for a profile whose email appears on the thread
        select 1
        from public.email_threads et
        join public.relationship_owners ro
          on ro.org_id = et.org_id
         and ro.user_id = auth.uid()
        join public.relationships r
          on r.id = ro.relationship_id
         and r.org_id = ro.org_id
        join public.profiles p
          on p.id = r.profile_id
         and p.org_id = r.org_id
        where et.id = p_thread_id
          and et.org_id = p_org_id
          and p.email is not null
          and exists (
            select 1
            from jsonb_array_elements(et.participants) as participant
            where lower(participant->>'email') = lower(p.email)
          )
      )
      or exists (
        -- Linked review row: owner of the linked profile
        select 1
        from public.email_participant_reviews epr
        join public.relationship_owners ro
          on ro.org_id = epr.org_id
         and ro.user_id = auth.uid()
        join public.relationships r
          on r.id = ro.relationship_id
         and r.profile_id = epr.profile_id
         and r.org_id = epr.org_id
        where epr.thread_id = p_thread_id
          and epr.org_id = p_org_id
          and epr.profile_id is not null
          and epr.status in ('linked', 'created')
      )
    )
    and not exists (
      -- metadata_only orgs never expose bodies to authenticated users
      select 1
      from public.organisations
      where id = p_org_id
        and email_access_level = 'metadata_only'
    )
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS on all tables
-- ---------------------------------------------------------------------------

alter table public.organisations enable row level security;
alter table public.users enable row level security;
alter table public.profiles enable row level security;
alter table public.tags enable row level security;
alter table public.profile_tags enable row level security;
alter table public.relationships enable row level security;
alter table public.relationship_owners enable row level security;
alter table public.relationship_sources enable row level security;
alter table public.connections enable row level security;
alter table public.events enable row level security;
alter table public.event_attendees enable row level security;
alter table public.gmail_accounts enable row level security;
alter table public.email_threads enable row level security;
alter table public.email_messages enable row level security;
alter table public.email_participant_reviews enable row level security;
alter table public.activities enable row level security;
alter table public.imports enable row level security;
alter table public.import_rows enable row level security;

-- ---------------------------------------------------------------------------
-- organisations (tenant row; match by id, not org_id)
-- ---------------------------------------------------------------------------

create policy organisations_select on public.organisations
  for select to authenticated
  using (id = public.auth_org_id());

create policy organisations_update on public.organisations
  for update to authenticated
  using (id = public.auth_org_id() and public.auth_is_admin())
  with check (id = public.auth_org_id() and public.auth_is_admin());

-- ---------------------------------------------------------------------------
-- users (org members visible within org; self always readable)
-- ---------------------------------------------------------------------------

create policy users_select on public.users
  for select to authenticated
  using (org_id = public.auth_org_id());

create policy users_insert on public.users
  for insert to authenticated
  with check (org_id = public.auth_org_id());

create policy users_update on public.users
  for update to authenticated
  using (org_id = public.auth_org_id())
  with check (org_id = public.auth_org_id());

create policy users_delete on public.users
  for delete to authenticated
  using (org_id = public.auth_org_id() and public.auth_is_admin());

-- ---------------------------------------------------------------------------
-- Standard org-scoped CRUD macro (applied per table below)
-- ---------------------------------------------------------------------------

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (org_id = public.auth_org_id());
create policy profiles_insert on public.profiles for insert to authenticated
  with check (org_id = public.auth_org_id());
create policy profiles_update on public.profiles for update to authenticated
  using (org_id = public.auth_org_id()) with check (org_id = public.auth_org_id());
create policy profiles_delete on public.profiles for delete to authenticated
  using (org_id = public.auth_org_id());

-- tags
create policy tags_select on public.tags for select to authenticated
  using (org_id = public.auth_org_id());
create policy tags_insert on public.tags for insert to authenticated
  with check (org_id = public.auth_org_id());
create policy tags_update on public.tags for update to authenticated
  using (org_id = public.auth_org_id()) with check (org_id = public.auth_org_id());
create policy tags_delete on public.tags for delete to authenticated
  using (org_id = public.auth_org_id());

-- profile_tags
create policy profile_tags_select on public.profile_tags for select to authenticated
  using (org_id = public.auth_org_id());
create policy profile_tags_insert on public.profile_tags for insert to authenticated
  with check (org_id = public.auth_org_id());
create policy profile_tags_update on public.profile_tags for update to authenticated
  using (org_id = public.auth_org_id()) with check (org_id = public.auth_org_id());
create policy profile_tags_delete on public.profile_tags for delete to authenticated
  using (org_id = public.auth_org_id());

-- relationships
create policy relationships_select on public.relationships for select to authenticated
  using (org_id = public.auth_org_id());
create policy relationships_insert on public.relationships for insert to authenticated
  with check (org_id = public.auth_org_id());
create policy relationships_update on public.relationships for update to authenticated
  using (org_id = public.auth_org_id()) with check (org_id = public.auth_org_id());
create policy relationships_delete on public.relationships for delete to authenticated
  using (org_id = public.auth_org_id());

-- relationship_owners
create policy relationship_owners_select on public.relationship_owners for select to authenticated
  using (org_id = public.auth_org_id());
create policy relationship_owners_insert on public.relationship_owners for insert to authenticated
  with check (org_id = public.auth_org_id());
create policy relationship_owners_update on public.relationship_owners for update to authenticated
  using (org_id = public.auth_org_id()) with check (org_id = public.auth_org_id());
create policy relationship_owners_delete on public.relationship_owners for delete to authenticated
  using (org_id = public.auth_org_id());

-- relationship_sources (append-only in V1; delete restricted to admin)
create policy relationship_sources_select on public.relationship_sources for select to authenticated
  using (org_id = public.auth_org_id());
create policy relationship_sources_insert on public.relationship_sources for insert to authenticated
  with check (org_id = public.auth_org_id());
create policy relationship_sources_update on public.relationship_sources for update to authenticated
  using (org_id = public.auth_org_id()) with check (org_id = public.auth_org_id());
create policy relationship_sources_delete on public.relationship_sources for delete to authenticated
  using (org_id = public.auth_org_id() and public.auth_is_admin());

-- connections
create policy connections_select on public.connections for select to authenticated
  using (org_id = public.auth_org_id());
create policy connections_insert on public.connections for insert to authenticated
  with check (org_id = public.auth_org_id());
create policy connections_update on public.connections for update to authenticated
  using (org_id = public.auth_org_id()) with check (org_id = public.auth_org_id());
create policy connections_delete on public.connections for delete to authenticated
  using (org_id = public.auth_org_id());

-- events
create policy events_select on public.events for select to authenticated
  using (org_id = public.auth_org_id());
create policy events_insert on public.events for insert to authenticated
  with check (org_id = public.auth_org_id());
create policy events_update on public.events for update to authenticated
  using (org_id = public.auth_org_id()) with check (org_id = public.auth_org_id());
create policy events_delete on public.events for delete to authenticated
  using (org_id = public.auth_org_id());

-- event_attendees
create policy event_attendees_select on public.event_attendees for select to authenticated
  using (org_id = public.auth_org_id());
create policy event_attendees_insert on public.event_attendees for insert to authenticated
  with check (org_id = public.auth_org_id());
create policy event_attendees_update on public.event_attendees for update to authenticated
  using (org_id = public.auth_org_id()) with check (org_id = public.auth_org_id());
create policy event_attendees_delete on public.event_attendees for delete to authenticated
  using (org_id = public.auth_org_id());

-- gmail_accounts (refresh_token readable only by account owner or admin)
create policy gmail_accounts_select on public.gmail_accounts for select to authenticated
  using (
    org_id = public.auth_org_id()
    and (user_id = auth.uid() or public.auth_is_admin())
  );
create policy gmail_accounts_insert on public.gmail_accounts for insert to authenticated
  with check (org_id = public.auth_org_id() and user_id = auth.uid());
create policy gmail_accounts_update on public.gmail_accounts for update to authenticated
  using (
    org_id = public.auth_org_id()
    and (user_id = auth.uid() or public.auth_is_admin())
  )
  with check (
    org_id = public.auth_org_id()
    and (user_id = auth.uid() or public.auth_is_admin())
  );
create policy gmail_accounts_delete on public.gmail_accounts for delete to authenticated
  using (
    org_id = public.auth_org_id()
    and (user_id = auth.uid() or public.auth_is_admin())
  );

-- email_threads (metadata org-wide within org, ADR 0003)
create policy email_threads_select on public.email_threads for select to authenticated
  using (org_id = public.auth_org_id());
create policy email_threads_insert on public.email_threads for insert to authenticated
  with check (org_id = public.auth_org_id());
create policy email_threads_update on public.email_threads for update to authenticated
  using (org_id = public.auth_org_id()) with check (org_id = public.auth_org_id());
create policy email_threads_delete on public.email_threads for delete to authenticated
  using (org_id = public.auth_org_id() and public.auth_is_admin());

-- email_messages (org row access; body/fts column privileges below)
create policy email_messages_select on public.email_messages for select to authenticated
  using (org_id = public.auth_org_id());
create policy email_messages_insert on public.email_messages for insert to authenticated
  with check (org_id = public.auth_org_id());
create policy email_messages_update on public.email_messages for update to authenticated
  using (org_id = public.auth_org_id()) with check (org_id = public.auth_org_id());
create policy email_messages_delete on public.email_messages for delete to authenticated
  using (org_id = public.auth_org_id() and public.auth_is_admin());

-- email_participant_reviews
create policy email_participant_reviews_select on public.email_participant_reviews for select to authenticated
  using (org_id = public.auth_org_id());
create policy email_participant_reviews_insert on public.email_participant_reviews for insert to authenticated
  with check (org_id = public.auth_org_id());
create policy email_participant_reviews_update on public.email_participant_reviews for update to authenticated
  using (org_id = public.auth_org_id()) with check (org_id = public.auth_org_id());
create policy email_participant_reviews_delete on public.email_participant_reviews for delete to authenticated
  using (org_id = public.auth_org_id() and public.auth_is_admin());

-- activities
create policy activities_select on public.activities for select to authenticated
  using (org_id = public.auth_org_id());
create policy activities_insert on public.activities for insert to authenticated
  with check (org_id = public.auth_org_id());
create policy activities_update on public.activities for update to authenticated
  using (org_id = public.auth_org_id()) with check (org_id = public.auth_org_id());
create policy activities_delete on public.activities for delete to authenticated
  using (org_id = public.auth_org_id());

-- imports (admin-only write in V1)
create policy imports_select on public.imports for select to authenticated
  using (org_id = public.auth_org_id());
create policy imports_insert on public.imports for insert to authenticated
  with check (org_id = public.auth_org_id() and public.auth_is_admin());
create policy imports_update on public.imports for update to authenticated
  using (org_id = public.auth_org_id() and public.auth_is_admin())
  with check (org_id = public.auth_org_id() and public.auth_is_admin());
create policy imports_delete on public.imports for delete to authenticated
  using (org_id = public.auth_org_id() and public.auth_is_admin());

-- import_rows
create policy import_rows_select on public.import_rows for select to authenticated
  using (org_id = public.auth_org_id());
create policy import_rows_insert on public.import_rows for insert to authenticated
  with check (org_id = public.auth_org_id() and public.auth_is_admin());
create policy import_rows_update on public.import_rows for update to authenticated
  using (org_id = public.auth_org_id() and public.auth_is_admin())
  with check (org_id = public.auth_org_id() and public.auth_is_admin());
create policy import_rows_delete on public.import_rows for delete to authenticated
  using (org_id = public.auth_org_id() and public.auth_is_admin());

-- ---------------------------------------------------------------------------
-- Two-tier email body access (ADR 0003)
-- Revoke direct SELECT on sensitive columns; expose via view with conditional body.
-- ---------------------------------------------------------------------------

revoke select (body) on public.email_messages from authenticated, anon;

create or replace view public.email_messages_user
with (security_invoker = true)
as
select
  em.id,
  em.org_id,
  em.thread_id,
  em.gmail_message_id,
  em.sender,
  em.recipients,
  case
    when public.user_can_read_email_body(em.org_id, em.thread_id) then em.body
    else null
  end as body,
  em.sent_at,
  em.created_at,
  em.updated_at
from public.email_messages em
where em.org_id = public.auth_org_id();

grant select on public.email_messages_user to authenticated;

comment on view public.email_messages_user is
  'User-facing email messages. Body is null unless the caller is admin, a relationship owner for a matched profile on the thread, or the org has full_body_access (ADR 0003).';

-- RPC for authorized body reads (explicit path for UI and body search)
create or replace function public.get_email_message_body(p_message_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select em.body
  from public.email_messages em
  where em.id = p_message_id
    and em.org_id = public.auth_org_id()
    and public.user_can_read_email_body(em.org_id, em.thread_id)
$$;

grant execute on function public.get_email_message_body(uuid) to authenticated;
