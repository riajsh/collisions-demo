/*
 * Phase 1 — Step 1: organisations and users
 *
 * Establishes the tenant boundary (organisations) and maps Supabase Auth users
 * to internal team members (users). Every subsequent table references org_id
 * from organisations. email_access_level on organisations supports the
 * two-tier email privacy model (ADR 0003); V1 default is restricted_body_access.
 */

-- ---------------------------------------------------------------------------
-- Shared: updated_at trigger (reused by all mutable tables)
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.email_access_level as enum (
  'metadata_only',
  'restricted_body_access',
  'full_body_access'
);

-- ---------------------------------------------------------------------------
-- organisations
-- ---------------------------------------------------------------------------

create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  email_access_level public.email_access_level not null default 'restricted_body_access',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint organisations_slug_unique unique (slug)
);

create trigger organisations_set_updated_at
  before update on public.organisations
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- users (internal team; id mirrors auth.users)
-- ---------------------------------------------------------------------------

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  org_id uuid not null references public.organisations (id) on delete restrict,
  email text not null,
  full_name text not null,
  role text not null default 'member'
    check (role in ('admin', 'member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index users_org_id_idx on public.users (org_id);
create unique index users_org_email_idx on public.users (org_id, lower(email));

create trigger users_set_updated_at
  before update on public.users
  for each row
  execute function public.set_updated_at();
