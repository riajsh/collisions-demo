/*
 * Phase 1.1 — calendar_accounts, calendar_events, calendar_participant_reviews
 *
 * Google Calendar sync (ADR 0008). Same org-scoped, idempotent pattern as Gmail.
 * Events upsert on (org_id, google_event_id). Unmatched external participants
 * go to calendar_participant_reviews (ADR 0002 pattern).
 */

-- ---------------------------------------------------------------------------
-- calendar_accounts
-- ---------------------------------------------------------------------------

create table public.calendar_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete restrict,
  user_id uuid not null references public.users (id) on delete cascade,
  email text not null,
  refresh_token text not null,
  sync_enabled boolean not null default true,
  last_sync_at timestamptz,
  sync_cursor text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint calendar_accounts_org_email_unique unique (org_id, email)
);

create index calendar_accounts_org_id_idx on public.calendar_accounts (org_id);
create index calendar_accounts_user_id_idx on public.calendar_accounts (user_id);

create trigger calendar_accounts_set_updated_at
  before update on public.calendar_accounts
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- calendar_events
-- ---------------------------------------------------------------------------

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete restrict,
  google_event_id text not null,
  calendar_account_id uuid not null references public.calendar_accounts (id) on delete cascade,
  title text,
  description text,
  participants jsonb not null default '[]'::jsonb,
  start_at timestamptz,
  end_at timestamptz,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint calendar_events_org_google_event_unique unique (org_id, google_event_id)
);

create index calendar_events_org_id_idx on public.calendar_events (org_id);
create index calendar_events_calendar_account_id_idx on public.calendar_events (calendar_account_id);
create index calendar_events_start_at_idx on public.calendar_events (org_id, start_at desc);

create trigger calendar_events_set_updated_at
  before update on public.calendar_events
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- calendar_participant_reviews (unmatched participant queue, ADR 0002)
-- ---------------------------------------------------------------------------

create table public.calendar_participant_reviews (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete restrict,
  email text not null,
  display_name text,
  calendar_event_id uuid not null references public.calendar_events (id) on delete cascade,
  status public.participant_review_status not null default 'pending',
  profile_id uuid references public.profiles (id) on delete set null,
  reviewed_by uuid references public.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint calendar_participant_reviews_org_email_event_unique
    unique (org_id, email, calendar_event_id)
);

create index calendar_participant_reviews_org_id_idx
  on public.calendar_participant_reviews (org_id);
create index calendar_participant_reviews_event_id_idx
  on public.calendar_participant_reviews (calendar_event_id);
create index calendar_participant_reviews_status_idx
  on public.calendar_participant_reviews (org_id, status)
  where status = 'pending';

create trigger calendar_participant_reviews_set_updated_at
  before update on public.calendar_participant_reviews
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.calendar_accounts enable row level security;
alter table public.calendar_events enable row level security;
alter table public.calendar_participant_reviews enable row level security;

-- calendar_accounts (refresh_token readable only by account owner or admin)
create policy calendar_accounts_select on public.calendar_accounts for select to authenticated
  using (
    org_id = public.auth_org_id()
    and (user_id = auth.uid() or public.auth_is_admin())
  );
create policy calendar_accounts_insert on public.calendar_accounts for insert to authenticated
  with check (org_id = public.auth_org_id() and user_id = auth.uid());
create policy calendar_accounts_update on public.calendar_accounts for update to authenticated
  using (
    org_id = public.auth_org_id()
    and (user_id = auth.uid() or public.auth_is_admin())
  )
  with check (
    org_id = public.auth_org_id()
    and (user_id = auth.uid() or public.auth_is_admin())
  );
create policy calendar_accounts_delete on public.calendar_accounts for delete to authenticated
  using (
    org_id = public.auth_org_id()
    and (user_id = auth.uid() or public.auth_is_admin())
  );

-- calendar_events (metadata org-wide within org)
create policy calendar_events_select on public.calendar_events for select to authenticated
  using (org_id = public.auth_org_id());
create policy calendar_events_insert on public.calendar_events for insert to authenticated
  with check (org_id = public.auth_org_id());
create policy calendar_events_update on public.calendar_events for update to authenticated
  using (org_id = public.auth_org_id()) with check (org_id = public.auth_org_id());
create policy calendar_events_delete on public.calendar_events for delete to authenticated
  using (org_id = public.auth_org_id() and public.auth_is_admin());

-- calendar_participant_reviews
create policy calendar_participant_reviews_select on public.calendar_participant_reviews
  for select to authenticated
  using (org_id = public.auth_org_id());
create policy calendar_participant_reviews_insert on public.calendar_participant_reviews
  for insert to authenticated
  with check (org_id = public.auth_org_id());
create policy calendar_participant_reviews_update on public.calendar_participant_reviews
  for update to authenticated
  using (org_id = public.auth_org_id()) with check (org_id = public.auth_org_id());
create policy calendar_participant_reviews_delete on public.calendar_participant_reviews
  for delete to authenticated
  using (org_id = public.auth_org_id() and public.auth_is_admin());
