# Ecosystem setup — Nova Collective

Use this file when opening the project in **Cursor**, or for the full technical setup reference. For the simplest path to a live shareable demo, see `DEMO-SETUP.md` instead.

**In Cursor, start a chat with:**

> Help me set up Ecosystem locally — follow SETUP.md step by step.

The agent should walk through each phase below, run verification commands, and flag anything missing before moving on.

---

## What this repo is

- **Product:** Ecosystem — relationship intelligence (who we know, who owns the relationship, evidence from calendar/import).
- **Tenant:** Nova Collective (`slug: nova-collective`, domain `@novacollective.io`).
- **Stack:** Next.js 16, Supabase (Postgres + Auth + RLS), Vercel deployment.


---

## Prerequisites

Install before starting:

| Tool | Purpose | Check |
|---|---|---|
| Node.js 20+ | App and scripts | `node -v` |
| npm | Dependencies | `npm -v` |
| Supabase CLI | Local DB + migrations | `supabase -v` |
| Git | Clone and pull | `git -v` |

Optional for production: Vercel CLI (`vercel -v`), access to Supabase dashboard, Google Cloud Console.

---

## Phase 1 — Clone and install

```bash
cd ecosystem-demo   # or your clone path
npm install
npm run typecheck       # should pass with no errors
```

**Verify:** `npm run typecheck` exits 0.

---

## Phase 2 — Environment variables

1. Copy the template:

```bash
cp .env.example .env.local
```

2. Fill in `.env.local`. **Required for local dev:**

| Variable | Where to get it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same page (anon/public key) |
| `SUPABASE_SERVICE_ROLE_KEY` | Same page (service role — server only, never commit) |
| `DEFAULT_ORG_SLUG` | Must be `nova-collective` |
| `ORG_INTERNAL_EMAIL_DOMAINS` | `novacollective.io` (comma-separated if multiple) |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` locally |
| `TOKEN_ENCRYPTION_KEY` | Generate: `openssl rand -base64 32` |
| `CRON_SECRET` | Generate: `openssl rand -base64 32` |

3. **Calendar sync** (needed for Admin → Connect Calendar):

| Variable | Notes |
|---|---|
| `GOOGLE_CALENDAR_CLIENT_ID` | Google Cloud Console → OAuth client |
| `GOOGLE_CALENDAR_CLIENT_SECRET` | Same client |
| `GOOGLE_CALENDAR_REDIRECT_URI` | `http://localhost:3000/api/auth/google-calendar/callback` |

Register that redirect URI in Google Cloud for localhost **and** your production Vercel URL.

**Verify:** Ask Cursor to check Admin deploy checklist logic — or run dev and open `/admin` (after Phase 4); missing vars show in the deploy checklist.

**Never commit `.env.local`.** Receive production secrets through a secure channel, not the repo.

Optional: copy `.cursor/mcp.json.example` → `.cursor/mcp.json` and set your Supabase `project_ref` for Cursor MCP integration.

---

## Phase 3 — Supabase

Pick **one** path.

### Path A — Local Supabase (recommended first)

```bash
supabase start
supabase db reset    # runs migrations + seed.sql
```

Copy the local API URL and keys from `supabase status` into `.env.local`.

Then sync team auth:

```bash
npm run sync:team
```

**Verify:**

- Org row exists: `name = Nova Collective`, `slug = nova-collective`
- User `jordan@novacollective.io` exists in Auth and `public.users` with `role = admin`

Local password login (dev only): `jordan@novacollective.io` / `password123`

### Path B — Hosted Supabase project

1. Create a **new** Supabase project (empty — no legacy tenant data).
2. Link and push migrations:

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

3. Insert the org row (if not using seed):

```sql
insert into public.organisations (id, name, slug, email_access_level)
values (
  '11111111-1111-1111-1111-111111111111',
  'Nova Collective',
  'nova-collective',
  'restricted_body_access'
);
```

4. Provision team:

```bash
npm run sync:team
```

**Verify:** `DEFAULT_ORG_SLUG` in `.env.local` matches `organisations.slug`. Mismatch causes bootstrap errors on first sign-in.

---

## Phase 4 — Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

**Verify:**

- Login page shows `@novacollective.io` domain hint
- Dev sign-in (development only): `jordan@novacollective.io` / `password123`
- After login: Profiles, Search, Admin (for admin users) visible in nav

---

## Phase 5 — Google Calendar (production path)

1. Create a Google Cloud project (Internal app if using Workspace `@novacollective.io`).
2. Enable Google Calendar API.
3. Create OAuth 2.0 client (Web application).
4. Add redirect URIs:
   - `http://localhost:3000/api/auth/google-calendar/callback`
   - `https://YOUR_VERCEL_DOMAIN/api/auth/google-calendar/callback`
5. Put client ID/secret in `.env.local` and Vercel env vars.
6. In the app: **Admin → Google Calendar → Connect**, then run calendar sync/backfill.

Spec: [docs/specs/calendar-sync.md](./docs/specs/calendar-sync.md)

---

## Phase 6 — Team roster

Single source of truth: **`src/config/team-members.json`**

To add someone:

1. Add entry with stable UUID, `@novacollective.io` email, `role`, `colourToken`.
2. Add `--color-owner-*` in `src/app/globals.css` if they need a distinct colour.
3. Run `npm run sync:team`.

Promote to admin in SQL if needed:

```sql
update public.users set role = 'admin'
where lower(email) = 'someone@novacollective.io';
```

---

## Phase 7 — Vercel deployment

1. Create/link a Vercel project for this repo.
2. Copy all `.env.example` variables into Vercel (Production + Preview).
3. Set `NEXT_PUBLIC_SITE_URL` to the Vercel domain.
4. Confirm `DEFAULT_ORG_SLUG=nova-collective` matches Supabase.
5. Deploy; test Google sign-in and calendar connect on production URL.

---

## Phase 8 — Go-live checklist

- [ ] Supabase org slug matches env
- [ ] Team synced (`npm run sync:team`)
- [ ] Jordan can sign in (Google or dev password locally)
- [ ] Admin → Deploy checklist shows no missing required env vars
- [ ] Calendar connected and first sync completed
- [ ] Initial contacts imported via Admin → Import
- [ ] Cron secret set on Vercel (for scheduled sync jobs)

---

## Prompts that work well in Cursor

| Goal | Prompt |
|---|---|
| Full local setup | Help me set up Ecosystem locally — follow SETUP.md step by step. |
| Check env | Compare my `.env.local` to `.env.example` and tell me what's missing for local dev. |
| Add team member | Add [name] to team-members.json and run sync:team. |
| Calendar issues | Calendar connect failed — diagnose using docs/specs/calendar-sync.md. |
| Import help | Walk me through importing a CSV via Admin → Import. |
| Understand the product | Summarise docs/product-brief-v1.md and docs/specs/workflows.md for a new admin user. |

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| "No organisation found for DEFAULT_ORG_SLUG" | Slug mismatch | Align `.env.local`, `team-members.json`, and `organisations.slug` |
| Login works but empty/wrong data | Wrong Supabase project | Check `NEXT_PUBLIC_SUPABASE_URL` points at Nova Collective project |
| Calendar OAuth redirect error | Redirect URI not registered | Add exact callback URL in Google Cloud Console |
| `sync:team` fails | Missing service role key | Set `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` |
| Not seeing Admin | User is `member` | Promote via SQL or `team-members.json` + `sync:team` |

---

## Key files (do not hard-code tenant elsewhere)

| File | Purpose |
|---|---|
| `src/config/team-members.json` | Org name, slug, team roster |
| `supabase/seed.sql` | Local dev seed data |
| `.env.local` | Secrets and env (gitignored) |
| `AGENTS.md` | Cursor agent conventions |

---

## After setup

This repo already ships with a full synthetic demo dataset (`supabase/seed.sql`) — fictional people, companies, relationships, and events — so there's nothing to import before demoing. See `DEMO-SETUP.md` for the simplest path to a live, shareable deployment.
