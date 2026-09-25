/*
 * Security hardening — audit fixes (2026-06-23)
 *
 * - Block member self-escalation to admin (users.role)
 * - Restrict imports / import_rows / storage CSV reads to admins
 * - Restrict tag DDL to admins
 * - Protect team-member profiles (email matches org users) from member delete/update
 * - Restrict calendar_participant_reviews writes to admins
 * - Restrict activity deletes to admins
 */

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- True when a profile email belongs to an internal team member (users row in org).
create or replace function public.profile_is_team_member(p_org_id uuid, p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_email is not null
    and exists (
      select 1
      from public.users u
      where u.org_id = p_org_id
        and lower(u.email) = lower(trim(p_email))
    )
$$;

revoke all on function public.profile_is_team_member(uuid, text) from public, anon;
grant execute on function public.profile_is_team_member(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- users — self-update only; role changes via service role / triggers only
-- ---------------------------------------------------------------------------

drop policy if exists users_insert on public.users;

create policy users_insert on public.users
  for insert to authenticated
  with check (id = auth.uid() and org_id = public.auth_org_id());

drop policy if exists users_update on public.users;

create policy users_update on public.users
  for update to authenticated
  using (id = auth.uid() and org_id = public.auth_org_id())
  with check (id = auth.uid() and org_id = public.auth_org_id());

create or replace function public.prevent_users_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and auth.uid() is not null then
    raise exception 'role changes are not permitted';
  end if;

  return new;
end;
$$;

drop trigger if exists users_prevent_role_change on public.users;

create trigger users_prevent_role_change
  before update on public.users
  for each row
  execute function public.prevent_users_role_change();

-- ---------------------------------------------------------------------------
-- imports — admin-only read (staging CSV PII)
-- ---------------------------------------------------------------------------

drop policy if exists imports_select on public.imports;
drop policy if exists import_rows_select on public.import_rows;

create policy imports_select on public.imports
  for select to authenticated
  using (org_id = public.auth_org_id() and public.auth_is_admin());

create policy import_rows_select on public.import_rows
  for select to authenticated
  using (org_id = public.auth_org_id() and public.auth_is_admin());

-- ---------------------------------------------------------------------------
-- imports storage — admin-only read (matches table RLS intent)
-- ---------------------------------------------------------------------------

drop policy if exists imports_storage_select on storage.objects;

create policy imports_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'imports'
    and public.auth_is_admin()
    and (storage.foldername(name))[1] = public.auth_org_id()::text
  );

-- ---------------------------------------------------------------------------
-- tags — admin-only DDL (members use profile_tags via separate policies)
-- ---------------------------------------------------------------------------

drop policy if exists tags_insert on public.tags;
drop policy if exists tags_update on public.tags;
drop policy if exists tags_delete on public.tags;

create policy tags_insert on public.tags
  for insert to authenticated
  with check (org_id = public.auth_org_id() and public.auth_is_admin());

create policy tags_update on public.tags
  for update to authenticated
  using (org_id = public.auth_org_id() and public.auth_is_admin())
  with check (org_id = public.auth_org_id() and public.auth_is_admin());

create policy tags_delete on public.tags
  for delete to authenticated
  using (org_id = public.auth_org_id() and public.auth_is_admin());

-- ---------------------------------------------------------------------------
-- profiles — team-member rows protected from member delete/update
-- ---------------------------------------------------------------------------

drop policy if exists profiles_update on public.profiles;
drop policy if exists profiles_delete on public.profiles;

create policy profiles_update on public.profiles
  for update to authenticated
  using (
    org_id = public.auth_org_id()
    and (
      public.auth_is_admin()
      or not public.profile_is_team_member(org_id, email)
    )
  )
  with check (
    org_id = public.auth_org_id()
    and (
      public.auth_is_admin()
      or not public.profile_is_team_member(org_id, email)
    )
  );

create policy profiles_delete on public.profiles
  for delete to authenticated
  using (
    org_id = public.auth_org_id()
    and (
      public.auth_is_admin()
      or not public.profile_is_team_member(org_id, email)
    )
  );

-- ---------------------------------------------------------------------------
-- activities — delete restricted to admins (evidence integrity)
-- ---------------------------------------------------------------------------

drop policy if exists activities_delete on public.activities;

create policy activities_delete on public.activities
  for delete to authenticated
  using (org_id = public.auth_org_id() and public.auth_is_admin());

-- ---------------------------------------------------------------------------
-- calendar_participant_reviews — member read; admin write
-- ---------------------------------------------------------------------------

drop policy if exists calendar_participant_reviews_insert on public.calendar_participant_reviews;
drop policy if exists calendar_participant_reviews_update on public.calendar_participant_reviews;

create policy calendar_participant_reviews_insert on public.calendar_participant_reviews
  for insert to authenticated
  with check (org_id = public.auth_org_id() and public.auth_is_admin());

create policy calendar_participant_reviews_update on public.calendar_participant_reviews
  for update to authenticated
  using (org_id = public.auth_org_id() and public.auth_is_admin())
  with check (org_id = public.auth_org_id() and public.auth_is_admin());
