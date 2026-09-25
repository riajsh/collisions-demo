/*
 * Eventbrite sync, Phase 1 — connect flow only (ADR 0011, docs/specs/eventbrite-sync.md).
 *
 * eventbrite_accounts holds one connected Eventbrite private token per org,
 * encrypted the same way calendar_accounts.refresh_token is (TOKEN_ENCRYPTION_KEY,
 * encrypted/decrypted at the application layer — this column just stores text).
 *
 * This migration only adds the connect-flow table. Event mapping and attendee
 * sync (Phases 2-3) will add further tables/columns later once Phase 1 is
 * confirmed working.
 */

create table public.eventbrite_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete restrict,
  connected_by uuid not null references public.users (id) on delete cascade,
  account_name text,
  account_email text,
  access_token text not null,
  sync_enabled boolean not null default true,
  last_sync_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint eventbrite_accounts_org_unique unique (org_id)
);

create index eventbrite_accounts_org_id_idx on public.eventbrite_accounts (org_id);

create trigger eventbrite_accounts_set_updated_at
  before update on public.eventbrite_accounts
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — admin-only. This is an org-wide integration (one shared token), not a
-- per-user connection like calendar_accounts, so there's no "owner" concept —
-- any admin can view, connect, or disconnect it.
-- ---------------------------------------------------------------------------

alter table public.eventbrite_accounts enable row level security;

create policy eventbrite_accounts_select on public.eventbrite_accounts for select to authenticated
  using (org_id = public.auth_org_id() and public.auth_is_admin());
create policy eventbrite_accounts_insert on public.eventbrite_accounts for insert to authenticated
  with check (org_id = public.auth_org_id() and public.auth_is_admin());
create policy eventbrite_accounts_update on public.eventbrite_accounts for update to authenticated
  using (org_id = public.auth_org_id() and public.auth_is_admin())
  with check (org_id = public.auth_org_id() and public.auth_is_admin());
create policy eventbrite_accounts_delete on public.eventbrite_accounts for delete to authenticated
  using (org_id = public.auth_org_id() and public.auth_is_admin());
