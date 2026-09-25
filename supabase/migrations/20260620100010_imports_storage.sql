/*
 * Phase 1 — imports storage bucket
 *
 * Original CSV files for import audit trail (import-pipeline.md §3).
 * Path: {org_id}/imports/{import_id}/original.csv
 * Private bucket; admin service role uploads; org-scoped read for authenticated admins.
 */

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'imports',
  'imports',
  false,
  10485760,
  array['text/csv', 'application/csv', 'text/plain']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists imports_storage_select on storage.objects;
drop policy if exists imports_storage_insert on storage.objects;
drop policy if exists imports_storage_update on storage.objects;
drop policy if exists imports_storage_delete on storage.objects;

create policy imports_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'imports'
    and (storage.foldername(name))[1] = public.auth_org_id()::text
  );

create policy imports_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'imports'
    and public.auth_is_admin()
    and (storage.foldername(name))[1] = public.auth_org_id()::text
  );

create policy imports_storage_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'imports'
    and public.auth_is_admin()
    and (storage.foldername(name))[1] = public.auth_org_id()::text
  )
  with check (
    bucket_id = 'imports'
    and public.auth_is_admin()
    and (storage.foldername(name))[1] = public.auth_org_id()::text
  );

create policy imports_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'imports'
    and public.auth_is_admin()
    and (storage.foldername(name))[1] = public.auth_org_id()::text
  );
