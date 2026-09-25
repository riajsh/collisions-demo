# Ecosystem Technical Architecture

- Version: 1.0
- Status: Accepted
- Related: domain-model-v1.md, ai-conventions.md, docs/decisions/

This document answers **what lives where** before any SQL is written. Migrations implement this; they do not invent it.

---

## 1. System overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Vercel                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              Next.js 16 (App Router)                       │  │
│  │  UI (React) │ Server Actions │ Route Handlers (API/cron)  │  │
│  └───────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
┌─────────────────┐ ┌───────────────┐ ┌─────────────────┐
│    Supabase     │ │  Gmail API    │ │  Anthropic API  │
│  Auth + Postgres│ │  (OAuth)      │ │  (Phase 3 only) │
│  RLS + Storage  │ │               │ │                 │
└─────────────────┘ └───────────────┘ └─────────────────┘
```

| System | Responsibility | Phase |
|---|---|---|
| **Next.js UI** | Screens, forms, search, Orbit canvas, Admin queues | 1+ |
| **Server Actions** | Mutations: create profile, log activity, import commit, review queue actions | 1 |
| **Route Handlers** | Webhooks, cron endpoints, OAuth callbacks, long-running sync triggers | 1 |
| **Supabase Auth** | Login, session, `auth.users` | 1 |
| **Supabase Postgres** | All Layer 1 data, RLS, FTS indexes, SQL views (Layer 2) | 1 |
| **Supabase Storage** | CSV uploads pending import | 1 |
| **Cron (Vercel)** | Daily Gmail sync, optional nightly derived-view refresh | 1 |
| **Gmail API** | Incremental thread/message fetch for connected accounts | 1 |
| **Anthropic / Claude** | Search reasoning, relationship intelligence (Phase 3) | 3 |

---

## 2. Layer model (code ↔ data)

Three layers of truth from the domain model, enforced in folder structure:

| Layer | What | Where in code | Where in DB |
|---|---|---|---|
| **1 — Reality** | User-entered and ingested facts | `src/lib/data/` repositories | Tables: profiles, relationships, activities, … |
| **2 — Inference** | Computed strength, Orbit rings, Connect, last_interaction | `src/lib/computed/` + SQL views | Views only; no user-editable columns |
| **3 — AI** | Claude reasoning over graph | `src/lib/ai/` | `ai_interactions` log table (Phase 3) |

**Rule:** Layer 2 never writes Layer 1. Layer 3 write policy: ADR 0010 — Tier A sync facts auto-write with provenance; Tier C/D (identity, connections, enrichment) require human action.

---

## 3. Repository layout

```
Ecosystem/
├── AGENTS.md
├── docs/
├── supabase/
│   ├── migrations/
│   ├── seed.sql
│   └── config.toml
├── scripts/
│   ├── purge-calendar-sync.mjs    # npm run purge:calendar
│   ├── sync-team.mjs              # npm run sync:team
│   └── backfill-import-owners.mjs # npm run backfill:import-owners
├── src/
│   ├── middleware.ts              # Session guard + Supabase cookie refresh
│   ├── app/
│   │   ├── (auth)/                # Login
│   │   ├── auth/
│   │   │   ├── callback/          # Google OAuth callback
│   │   │   └── confirm/           # Supabase email OTP (optional)
│   │   ├── (app)/                 # Authenticated shell
│   │   │   ├── page.tsx           # Overview (/)
│   │   │   ├── search/
│   │   │   ├── profiles/
│   │   │   ├── events/
│   │   │   ├── connect/           # Shipped UI; intelligence layer evolving
│   │   │   ├── orbit/
│   │   │   └── admin/
│   │   │       ├── calendar-sync/review/
│   │   │       ├── datasets/      # CSV upload list
│   │   │       ├── import/[id]/   # Import wizard + soft-match review
│   │   │       └── …
│   │   └── api/
│   │       ├── cron/calendar-sync/
│   │       └── auth/google-calendar/connect|callback
│   ├── components/
│   ├── lib/
│   │   ├── supabase/              # server.ts, admin.ts, client.ts (browser stub)
│   │   ├── auth/
│   │   ├── data/                  # Layer 1 repositories (includes search.ts)
│   │   ├── computed/              # Layer 2 (orbit, connect, recency)
│   │   └── integrations/
│   │       ├── calendar/          # Shipped
│   │       └── participant-email.ts
│   ├── config/
│   └── types/database.ts
└── vercel.json                    # calendar-sync cron
```

**Not yet in repo:** `src/lib/integrations/gmail/`, `api/cron/gmail-sync/`, Gmail OAuth routes. See `docs/specs/gmail-sync.md`.

---

## 4. Request flow patterns

### 4.1 Authenticated UI read

```
Browser → Next.js page (RSC) → createServerClient(cookies)
       → Supabase query with RLS → render
```

- Pages and server components use the **cookie-bound Supabase client**.
- RLS enforces org isolation. No `org_id` from the client.

### 4.2 User mutation (Server Action)

```
Browser form → Server Action → requireUser() → getOrgId()
            → validate (Zod) → repository write → revalidatePath
```

- All mutations go through Server Actions or Route Handlers, never direct client writes to sensitive tables.
- `org_id` is injected server-side on every insert.

### 4.3 Cron / background job

```
Vercel Cron → Route Handler → verify CRON_SECRET
           → createAdminClient() (service role)
           → sync job → upsert with natural keys
```

- Cron uses **service role** to bypass RLS for system writes.
- Jobs must still set `org_id` explicitly per org processed.
- Gmail sync: see `docs/specs/gmail-sync.md`.

### 4.4 OAuth (Gmail connect)

```
Admin UI → redirect to Google OAuth → callback Route Handler
        → store refresh_token on gmail_accounts → redirect to Admin
```

- Tokens stored encrypted, server-side only.
- Never exposed to browser or client bundle.

---

## 5. Supabase usage

### 5.1 Clients

| Client | Key | Used by | RLS |
|---|---|---|---|
| Browser | anon + user session | Client components (minimal) | Yes |
| Server | anon + cookies | RSC, Server Actions | Yes |
| Admin | service role | Cron, sync, import batch jobs | Bypassed |

Prefer server reads. Client-side Supabase only where interactivity requires it (realtime, optimistic UI).

### 5.2 Auth bootstrap

On first login after Supabase Auth signup:

1. Upsert `users` row: `id = auth.users.id`, `org_id` from invite metadata (V1: seeded org from `team-members.json`).
2. All subsequent requests resolve org via `users.org_id`.

### 5.3 RLS pattern

Every table: `org_id = (select org_id from users where id = auth.uid())`.

Exceptions (additional policies):

- **email_messages.body** — readable only if user is admin OR relationship owner for a matched profile on the thread (ADR 0003). Honour `organisations.email_access_level`.
- **Storage** — import CSV bucket scoped to org prefix.

### 5.4 Migrations discipline

- All schema changes via `supabase/migrations/*.sql`.
- Generate types after every migration: `supabase gen types typescript`.
- Seed script for local dev; never seed production with test fixture data.

---

## 6. Integration boundaries

### 6.1 Gmail (dedicated, ADR 0007)

| Owns | Does not own |
|---|---|
| `gmail_accounts`, `email_threads`, `email_messages`, `email_participant_reviews` | Pathway PM project tasks, timelines, or shared sync |
| OAuth for Ecosystem-connected inboxes | Pathway Gmail tokens |
| Activity + relationship_source generation from threads | Pathway notification logic |

Spec: `docs/specs/gmail-sync.md`. Review UI: `docs/specs/admin-review.md` §6 (planned).

### 6.2 Google Calendar (Phase 1.1 — shipped, ADR 0008)

| Owns | Does not own |
|---|---|
| `calendar_accounts`, `calendar_events`, `calendar_participant_reviews` | Gmail threads or shared OAuth tokens |
| OAuth for Ecosystem-connected calendars | Calendar write / event creation from Ecosystem |
| Meeting activity + relationship_source generation | Auto-inferred connections from co-attendance (Phase 2 / ADR 0009) |

Spec: `docs/specs/calendar-sync.md`. Review UI: `docs/specs/admin-review.md` §4.

### 6.3 CSV import

| Owns | Does not own |
|---|---|
| Upload → preview → map → dedup → review → commit pipeline | Real-time Clay/Airtable API sync (future) |
| `imports` audit trail, soft-match review queue | Auto-merge on name |

Spec: `docs/specs/import-pipeline.md`. Soft-match review: `docs/specs/admin-review.md` §5.

### 6.4 Search

| Owns | Does not own |
|---|---|
| Postgres FTS indexes, ranked results UI | External search service (Phase 2+ pgvector if needed) |
| Evidence-rich result cards | AI-generated summaries (Phase 3) |

ADR: 0006. Spec: `docs/specs/search.md`.

### 6.5 Claude (Phase 3)

| Owns | Does not own |
|---|---|
| `src/lib/ai/` gateway, prompt templates, eval set | Direct DB writes to Layer 1 |
| `(context, action, outcome)` logging | User-facing chat in V1/V2 |

All model calls go through a single internal AI gateway for logging, provider swap, and rate limiting.

---

## 7. Cron jobs

| Job | Schedule | Handler | Purpose |
|---|---|---|---|
| `gmail-sync` | Daily 02:00 UTC | `api/cron/gmail-sync` | **Not implemented** — add to `vercel.json` when route ships |
| `calendar-sync` | Daily 03:00 UTC | `api/cron/calendar-sync` | Shipped — incremental fetch for calendar accounts |
| `refresh-search-indexes` | Optional weekly | `api/cron/search-refresh` | Not implemented (FTS maintained inline) |

Vercel cron config in `vercel.json`. Protected by `CRON_SECRET` header check (see `src/app/api/cron/*/route.ts` — reject requests without matching `Authorization: Bearer ${CRON_SECRET}`).

Gmail sync is **incremental** using `historyId` stored on `gmail_accounts.sync_cursor`. Full backfill runs once on account connect.

Calendar sync is **incremental** using `nextSyncToken` stored on `calendar_accounts.sync_cursor`. Full backfill (12 months back, 3 months forward) runs once on account connect. See `docs/specs/calendar-sync.md`.

---

## 8. Environment variables

| Variable | Used by | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | App | Public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | App | Public |
| `NEXT_PUBLIC_SITE_URL` | Google OAuth redirects | Public; defaults to localhost:3000 in dev |
| `SUPABASE_SERVICE_ROLE_KEY` | Cron, import jobs | Server only |
| `DEFAULT_ORG_SLUG` | Auth bootstrap | Server only; slug of the org to bootstrap on first sign-in |
| `CRON_SECRET` | Cron routes | Verify Vercel cron |
| `GOOGLE_GMAIL_CLIENT_ID` | Gmail OAuth | Server only |
| `GOOGLE_GMAIL_CLIENT_SECRET` | Gmail OAuth | Server only |
| `GOOGLE_GMAIL_REDIRECT_URI` | Gmail OAuth callback | Server only |
| `GOOGLE_CALENDAR_CLIENT_ID` | Calendar OAuth (Phase 1.1) | Server only |
| `GOOGLE_CALENDAR_CLIENT_SECRET` | Calendar OAuth (Phase 1.1) | Server only |
| `GOOGLE_CALENDAR_REDIRECT_URI` | Calendar OAuth callback (Phase 1.1) | Server only |
| `TOKEN_ENCRYPTION_KEY` | OAuth refresh token storage | Server only |
| `GMAIL_SYNC_LABELS` | Gmail sync label filter | Server only; comma-separated label names/IDs |
| `ORG_INTERNAL_EMAIL_DOMAINS` | Gmail + Calendar participant matching | Server only; comma-separated domains (e.g. `novacollective.io`). Addresses on these domains are team/internal — no profile, activity, or review row. Also merged with `users.email` at runtime. See `src/lib/integrations/participant-email.ts`. |
| `ANTHROPIC_API_KEY` | Phase 3 AI | Server only |

Validated at boot for core app vars (`src/lib/env/public.ts`, `src/lib/env.ts`). Calendar OAuth vars validate lazily in `getCalendarEnv()` when calendar sync runs. Gmail env vars are not validated until Gmail sync is implemented.

---

## 9. Deployment

| Environment | Supabase | Purpose |
|---|---|---|
| **Local** | Supabase CLI / Docker | Development, migrations, seed |
| **Preview** | Branch or staging project | PR previews |
| **Production** | Production project | Nova Collective live instance |

Nova Collective clone: new Supabase project (or new `org_id`), same migrations, empty data (ADR 0001).

---

## 10. What not to build in Phase 1

- Shared Gmail sync with Pathway PM
- AI gateway or Claude integration (Phase 3)
- pgvector / semantic search (Phase 2)
- Real-time subscriptions (unless search demands it)
- Microservices or separate API server
- Custom auth beyond Supabase

**Phase 1.1 (shipped):** Google Calendar sync is in scope — see §6.2 and `docs/specs/calendar-sync.md`.

---

## 11. Sign-off checklist

- [x] Layer boundaries agreed (§2, §3)
- [x] Supabase client patterns agreed (§5)
- [x] Gmail owned by Ecosystem, not Pathway (§6.1, ADR 0007)
- [x] Calendar sync owned by Ecosystem (§6.2, ADR 0008 — shipped Phase 1.1)
- [x] Cron approach agreed (§7)
- [x] Env vars listed (§8)
- [x] Domain model entity map matches this doc

All items signed off 2026-06-20. Phase 1.1 calendar additions documented 2026-06-21. See `docs/pre-migration-gate.md` for the full gate record. Generate migrations from `docs/domain-model-v1.md`.
