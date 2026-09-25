# Standing up the demo — step by step

This folder is a complete, standalone copy of the platform, rebranded as a fictional company ("Nova Collective") and pre-loaded with about 70 fictional people, companies, events, and relationships — so it looks and behaves like a real, populated system without any real Caffeine Daily data in it. It's meant to be shown to people outside Caffeine as a demo/MVP.

It's a completely separate, isolated copy: its own code, its own database, its own live site. Nothing you do here can affect the real Caffeine Daily app or its data.

You'll need about 30-45 minutes and three free accounts if you don't already have them: **GitHub**, **Supabase**, and **Vercel**. You already have all three from setting up the real app, so you can reuse those same accounts — you're just creating new, separate projects inside them.

---

## Step 1 — Put the code on GitHub

1. Go to [github.com/new](https://github.com/new) and create a new repository (e.g. `ecosystem-demo`). Keep it **private** for now — you can make it public later if you want.
2. On your computer, open Terminal and go into this folder (wherever you saved it), then run:

```bash
git init
git add -A
git commit -m "Initial demo"
git branch -M main
git remote add origin <the URL GitHub just gave you>
git push -u origin main
```

GitHub shows you the exact `git remote add origin ...` line to copy right after you create the repo.

---

## Step 2 — Create a new Supabase project

1. Go to [supabase.com](https://supabase.com) → **New project**.
2. Give it any name (e.g. "Ecosystem Demo"). Pick any region. Save the database password it generates somewhere safe.
3. Once it's created, go to **Project Settings → API** and copy three values — you'll paste these into Vercel in Step 4:
   - **Project URL**
   - **anon public** key
   - **service_role** key (click "reveal" — keep this one secret, never share it)

4. Run the database setup. The easiest way, if you have the Supabase CLI installed (`npm install -g supabase`):

```bash
cd ecosystem-demo   # this folder
supabase link --project-ref <your-project-ref>   # found in Project Settings → General
supabase db push       # creates all the tables
```

Then open your new project's **SQL Editor** in the Supabase dashboard, paste in the entire contents of `supabase/seed.sql` from this folder, and run it. That single script creates the fictional organisation, the fictional team, and all ~70 fictional people/relationships/events in one go.

(If you don't want to install the Supabase CLI, you can instead paste each file under `supabase/migrations/` into the SQL Editor in order by filename, then paste and run `supabase/seed.sql` last — just more copy-pasting, same result.)

---

## Step 3 — Create a new Vercel project

1. Go to [vercel.com/new](https://vercel.com/new) and import the GitHub repo you created in Step 1.
2. Before clicking Deploy, add these environment variables (Vercel's import screen has a spot for this — add for **Production** at minimum):

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | The Project URL from Step 2 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | The anon public key from Step 2 |
| `SUPABASE_SERVICE_ROLE_KEY` | The service_role key from Step 2 |
| `DEFAULT_ORG_SLUG` | `nova-collective` |
| `ORG_INTERNAL_EMAIL_DOMAINS` | `novacollective.io` |
| `NEXT_PUBLIC_SITE_URL` | Leave blank for now — you'll fill this in after your first deploy gives you a URL |
| `TOKEN_ENCRYPTION_KEY` | Any random 32+ character string (you can generate one at [random.org/strings](https://www.random.org/strings/) or just mash the keyboard) |
| `CRON_SECRET` | Same — any random string |
| `ANTHROPIC_API_KEY` | Your Anthropic API key (see note below) |

**About the Anthropic key:** this is optional but recommended. With it set, the AI-powered search and auto-tagging features actually work live during your demo, on the fictional data. Without it, those specific features will quietly do nothing (everything else still works fine). You can reuse your existing key from the real Caffeine app, or create a new one at [console.anthropic.com](https://console.anthropic.com) — either works, since this is a completely separate deployment.

3. Click **Deploy**.
4. Once it's deployed, copy the `.vercel.app` URL Vercel gives you, go back into your Vercel project's environment variables, and set `NEXT_PUBLIC_SITE_URL` to that URL. Redeploy (Vercel → Deployments → ⋯ → Redeploy) so the new value takes effect.

---

## Step 4 — Sign in and check it over

Open your new `.vercel.app` URL. Sign in with the seeded dev account:

- **Email:** `jordan@novacollective.io`
- **Password:** `password123`

You should see a fully populated app: ~70 fictional profiles, a handful of past events, relationships in different states (some active, some flagged for reconnection), and the Connect page suggesting introductions. Try a descriptive search (e.g. "senior operations people in fintech") to show off the AI search live, if you set the Anthropic key.

**Before sharing the link with anyone external:** change that dev password, or better, remove the dev password login option entirely and just share screen-recorded walkthroughs instead if you're worried about the login being guessable. `password123` is fine for a controlled demo where you're driving, but not for a link you hand out unsupervised.

---

## What's intentionally left out of this demo

To keep setup simple, a few real integrations are **not** wired up here — they're not needed since all the data is already pre-seeded:

- **Google Calendar sync** — the "Connect Calendar" button in Admin won't do anything live. All the timeline/activity data you'll see was seeded directly, not synced.
- **Eventbrite sync** — same idea: the event attendee data is already there, just not pulled from a live Eventbrite account.
- **Gmail sync** — not implemented in the underlying product yet either way (same as the real Caffeine instance).

If you ever want to demo those specific integrations live (not just show the data they'd produce), that's a separate, bigger setup step — a new Google Cloud OAuth app and/or Eventbrite API credentials pointed at this demo's domain. Not necessary for a pitch demo; the seeded data already shows what those features produce.

---

## If something goes wrong

This is the same underlying app as the real Caffeine deployment, so the same troubleshooting table in `SETUP.md` mostly applies (wrong Supabase project, slug mismatches, etc.). The most common thing to check first: does `DEFAULT_ORG_SLUG` in Vercel exactly match `nova-collective`, and does the Supabase project you linked actually have the seed data in it (check the `profiles` table in Supabase's Table Editor — you should see ~70 rows).
