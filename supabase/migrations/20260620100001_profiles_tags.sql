/*
 * Phase 1 — Step 2: profiles, tags, profile_tags
 *
 * External people (profiles) are the participant records relationships attach to.
 * Tags classify profiles; profile_tags is the join table. Dedup on import and
 * email sync uses lower(email) per org (ADR 0004). organisation_name_normalised
 * supports same-company connection inference (computed at write, never displayed).
 */

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete restrict,
  full_name text not null,
  email text,
  phone text,
  linkedin_url text,
  website_url text,
  organisation_name text,
  occupation text,
  location_city text,
  location_country text,
  bio text,
  source text not null default 'manual'
    check (source in ('csv', 'email', 'manual')),
  organisation_name_normalised text,
  extended jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_org_id_idx on public.profiles (org_id);

create unique index profiles_org_email_unique_idx
  on public.profiles (org_id, lower(email))
  where email is not null;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- tags
-- ---------------------------------------------------------------------------

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete restrict,
  name text not null,
  category text not null default 'other'
    check (category in ('sector', 'role', 'interest', 'other')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index tags_org_name_unique_idx on public.tags (org_id, name);
create index tags_org_id_idx on public.tags (org_id);

create trigger tags_set_updated_at
  before update on public.tags
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- profile_tags
-- ---------------------------------------------------------------------------

create table public.profile_tags (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete restrict,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint profile_tags_profile_tag_unique unique (profile_id, tag_id)
);

create index profile_tags_org_id_idx on public.profile_tags (org_id);
create index profile_tags_profile_id_idx on public.profile_tags (profile_id);
create index profile_tags_tag_id_idx on public.profile_tags (tag_id);

create trigger profile_tags_set_updated_at
  before update on public.profile_tags
  for each row
  execute function public.set_updated_at();
