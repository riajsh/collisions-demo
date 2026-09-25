/*
 * Phase 1 — Step 6: gmail_accounts, email_threads, email_messages,
 *               email_participant_reviews
 *
 * Raw email communications, separate from activities. Ecosystem-owned sync
 * (ADR 0007). Threads and messages upsert on natural keys per org for
 * idempotent re-runs. Unmatched external participants go to the review
 * queue (ADR 0002), not auto-created profiles. Body access is restricted
 * in the RLS migration (ADR 0003).
 */

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.participant_review_status as enum (
  'pending',
  'linked',
  'created',
  'ignored'
);

-- ---------------------------------------------------------------------------
-- gmail_accounts
-- ---------------------------------------------------------------------------

create table public.gmail_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete restrict,
  user_id uuid not null references public.users (id) on delete cascade,
  email text not null,
  refresh_token text not null,
  sync_enabled boolean not null default true,
  last_sync_at timestamptz,
  sync_cursor text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint gmail_accounts_org_email_unique unique (org_id, email)
);

create index gmail_accounts_org_id_idx on public.gmail_accounts (org_id);
create index gmail_accounts_user_id_idx on public.gmail_accounts (user_id);

create trigger gmail_accounts_set_updated_at
  before update on public.gmail_accounts
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- email_threads
-- ---------------------------------------------------------------------------

create table public.email_threads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete restrict,
  gmail_thread_id text not null,
  gmail_account_id uuid not null references public.gmail_accounts (id) on delete cascade,
  subject text,
  participants jsonb not null default '[]'::jsonb,
  project_label text,
  last_message_at timestamptz,
  message_count integer not null default 0,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint email_threads_org_gmail_thread_unique unique (org_id, gmail_thread_id)
);

create index email_threads_org_id_idx on public.email_threads (org_id);
create index email_threads_gmail_account_id_idx on public.email_threads (gmail_account_id);
create index email_threads_last_message_at_idx on public.email_threads (org_id, last_message_at desc);

create trigger email_threads_set_updated_at
  before update on public.email_threads
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- email_messages
-- ---------------------------------------------------------------------------

create table public.email_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete restrict,
  thread_id uuid not null references public.email_threads (id) on delete cascade,
  gmail_message_id text not null,
  sender text,
  recipients jsonb not null default '[]'::jsonb,
  body text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint email_messages_org_gmail_message_unique unique (org_id, gmail_message_id)
);

create index email_messages_org_id_idx on public.email_messages (org_id);
create index email_messages_thread_id_idx on public.email_messages (thread_id);
create index email_messages_sent_at_idx on public.email_messages (thread_id, sent_at desc);

create trigger email_messages_set_updated_at
  before update on public.email_messages
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- email_participant_reviews (unmatched participant queue, ADR 0002)
-- ---------------------------------------------------------------------------

create table public.email_participant_reviews (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete restrict,
  email text not null,
  display_name text,
  thread_id uuid not null references public.email_threads (id) on delete cascade,
  status public.participant_review_status not null default 'pending',
  profile_id uuid references public.profiles (id) on delete set null,
  reviewed_by uuid references public.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint email_participant_reviews_org_email_thread_unique unique (org_id, email, thread_id)
);

create index email_participant_reviews_org_id_idx on public.email_participant_reviews (org_id);
create index email_participant_reviews_thread_id_idx on public.email_participant_reviews (thread_id);
create index email_participant_reviews_status_idx on public.email_participant_reviews (org_id, status)
  where status = 'pending';

create trigger email_participant_reviews_set_updated_at
  before update on public.email_participant_reviews
  for each row
  execute function public.set_updated_at();
