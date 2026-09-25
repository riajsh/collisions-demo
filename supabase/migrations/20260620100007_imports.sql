/*
 * Phase 1 — Step 8: imports and import_rows
 *
 * CSV import audit trail and row-level staging table. import_rows holds parsed
 * and mapped rows through dedup and review before commit (ADR 0004). Staging
 * rows are retained after commit for traceability and rollback reference.
 */

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.import_status as enum (
  'pending',
  'processing',
  'complete',
  'failed'
);

create type public.dedup_status as enum (
  'pending',
  'matched_email',
  'soft_match',
  'new',
  'error'
);

-- ---------------------------------------------------------------------------
-- imports
-- ---------------------------------------------------------------------------

create table public.imports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete restrict,
  filename text not null,
  source text not null
    check (source in ('clay', 'airtable', 'affinity', 'attio', 'hubspot', 'csv', 'other')),
  row_count integer not null default 0,
  status public.import_status not null default 'pending',
  created_by uuid not null references public.users (id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index imports_org_id_idx on public.imports (org_id);
create index imports_status_idx on public.imports (org_id, status);

create trigger imports_set_updated_at
  before update on public.imports
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- import_rows (staging)
-- ---------------------------------------------------------------------------

create table public.import_rows (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete restrict,
  import_id uuid not null references public.imports (id) on delete cascade,
  row_number integer not null,
  raw jsonb not null default '{}'::jsonb,
  normalized jsonb not null default '{}'::jsonb,
  dedup_status public.dedup_status not null default 'pending',
  matched_profile_id uuid references public.profiles (id) on delete set null,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint import_rows_import_row_number_unique unique (import_id, row_number),
  constraint import_rows_row_number_positive check (row_number > 0)
);

create index import_rows_org_id_idx on public.import_rows (org_id);
create index import_rows_import_id_idx on public.import_rows (import_id);
create index import_rows_dedup_status_idx on public.import_rows (import_id, dedup_status);

create trigger import_rows_set_updated_at
  before update on public.import_rows
  for each row
  execute function public.set_updated_at();
