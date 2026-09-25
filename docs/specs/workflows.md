# Core User Workflows

- Version: 1.0
- Status: Accepted
- Related: information-architecture.md, product-brief-v1.md, specs/interaction-speed.md

---

This document describes the five core jobs a team member comes to Ecosystem to do. Every screen, every empty state, and every UI decision should be traceable to at least one of these workflows. If a design serves none of them, it should not be built in Phase 1.

These are flows, not feature lists. Each describes the trigger, the steps, the data needed at each step, and what the system should surface.

---

## Workflow 1: Pre-meeting research

**Trigger:** You have a meeting in the next few hours with someone external. You want to walk in with context.

**Who:** Any team member. Happens multiple times per week.

**Steps:**
1. Open Ecosystem. Search the person's name or company.
2. Find their profile in results. See immediately: relationship strength, primary owner, last interaction date.
3. Open the profile drawer. Scan the Activity tab: what emails have been exchanged, what meetings logged, what notes exist.
4. Check the Connections tab: does the org know anyone else at their company? Does anyone else on the team also know this person?
5. Close the drawer and go to the meeting.

**What the system must surface at each step:**
- Search results: name, company, owner, strength, last interaction — all visible without opening the profile.
- Drawer header: strength, status, all owners and their individual interaction recency at a glance.
- Activity tab: timeline in reverse chronological order. Email subject lines, meeting dates, notes. Context you can scan in 30 seconds.
- Connections tab: co-workers at the same company (inferred), co-attended events, mutual connections.

**What makes this workflow fail:**
- Search returns bare results with no owner or last interaction.
- Opening the profile drawer navigates away, losing search context.
- The activity timeline is empty because Gmail sync hasn't run yet (Phase 1 risk — empty state must explain this).
- There's a connection the org has that isn't visible because it's held in someone's head, not logged.

**Empty state for this workflow:**
Activity tab with no activities: "No activity logged yet for this person. If Gmail sync is connected, email threads will appear here after the next sync. You can also log a meeting or note using the input above."

---

## Workflow 2: Introduction routing

**Trigger:** Someone asks the team "can you intro me to X?" or the team wants to make an introduction to support a portfolio company or partner.

**Who:** Priya, Henry, Simon, Jordan. Daily.

**Steps:**
1. Search the person by name or company.
2. Find their profile. See: strength, who on the team owns the relationship, when the org last interacted.
3. Decide: is the relationship warm enough to use? Who on the team is best placed to make the intro?
4. If the person isn't in the system yet, create a profile and note the potential connection.

**What the system must surface at each step:**
- Search: all profiles matching the name, immediately. If there's more than one person with similar names, show company to disambiguate.
- Profile header: all team owners visible simultaneously, each with their own strength indicator and last interaction date. Not just "primary owner" — all owners at a glance.
- Relationship status: active vs dormant matters. A dormant relationship with a strong historical strength is different from a never-interacted-with contact.

**What makes this workflow fail:**
- Only one owner shown (can't see if someone else has a warmer path).
- Strength is a label without evidence (can't tell if the score is based on 3 emails from 2 years ago or 30 meetings this year).
- The person isn't in the system and there's no quick way to add them.

**The routing decision:**
This is the highest-value thing Ecosystem enables. The answer to "who should make this intro" requires seeing strength across ALL owners simultaneously. The profile header must show this. It's not a detail buried in a tab.

---

## Workflow 3: Post-event triage

**Trigger:** A community event has just run. The event is in Ecosystem. There are attendees who either matched to existing profiles or need processing.

**Who:** Whoever runs events. Admin role likely, but any team member may need to process attendees.

**Steps:**
1. Open Events. Find the event.
2. See attendee list. Attendees are grouped: matched to existing profiles (green), new (amber).
3. For matched attendees: confirm the match, log attendance as an activity.
4. For new attendees: create profile → assign owner → log attendance.
5. After triage, review: are there people who showed up for the third time but don't have a strong relationship recorded? Flag for follow-up.

**What the system must surface at each step:**
- Event detail: attendee count, how many are matched vs new.
- For each attendee: existing profile name if matched, match confidence if soft-matched, "Create profile" if new.
- After creation: the new profile has the event logged as their first activity automatically.

**Phase 1 limitation:**
Calendar sync can surface meeting attendees for review; direct event RSVP integration (e.g. Lu.ma) is not in Phase 1. Post-event attendee entry is manual or via CSV in Phase 1.

**Empty state for this workflow:**
Event with no attendees: "No attendees recorded yet. Add them manually or import from a CSV."

---

## Workflow 4: Relationship maintenance (the reconnect loop)

**Trigger:** You want to make sure important relationships haven't gone cold. Weekly cadence.

**Who:** Any owner. This is the "proactive" use case — you're not looking for a specific person, you're scanning for who needs attention.

**Steps (Phase 1 — manual):**
1. Open Profiles.
2. Filter by owner: yourself.
3. Sort by last interaction (ascending) — relationships that have gone longest without contact float to the top.
4. Scan for relationships that are "active" strength but haven't had interaction in 60+ days. These are drift risks.
5. Click through to the profile, review the history, log a note: "flagged for re-engagement" or log that you reached out.

**Steps (Phase 2 — system-assisted):**
The Connect screen surfaces these automatically as "Reconnect" suggestions with the last interaction date and the suggested action.

**What the system must surface at each step:**
- Last interaction date on every row in the profiles table. This is the most important column for this workflow.
- Filtering by owner works cleanly (filter by "me" not by selecting your own name from a list).
- Sort by last interaction (ascending) as a one-click sort.

**What makes this workflow fail:**
- Last interaction is null for profiles that have activities (sync not run, or activity not linked).
- No way to filter by "my profiles" quickly.
- No visual indication of drift risk in the table.

**Phase 1 stopgap for drift detection:**
The profiles table can show a subtle visual indicator (e.g. muted row, dimmed last-interaction cell) when a "active" strength profile has had no interaction in 90+ days. This is purely computed from existing data — no schema change required.

---

## Workflow 5: Adding a new contact

**Trigger:** You've just met someone — at an event, through an intro, on a call. They're not in Ecosystem.

**Who:** Any team member. Happens after every meaningful meeting or event.

**Steps:**
1. Open "New profile" (/profiles/new).
2. Fill: name, email (required), company, role. Skip everything else for now.
3. Assign yourself (or correct owner) as primary owner.
4. Set initial strength.
5. Submit → land on the profile drawer for the new profile.
6. Log first activity: "Met at [event/intro]" — one interaction, using the quick-log input.

**What the system must surface:**
- The create form is short. Required fields only up front (name + email). Everything else is optional and accessible later.
- After submit, go straight to the profile. Don't go back to the profiles list — the user is in the middle of a workflow.
- The quick-log is immediately visible and focused on the Activity tab after creation.

**Duplicate prevention:**
If the email matches an existing profile, surface it during form entry (before submit), not after. Show a banner: "A profile already exists for this email — [Name]. View profile." This prevents the most common data quality problem.

**What makes this workflow fail:**
- Too many required fields (user skips or fills junk to get past validation).
- Redirect after creation goes to the wrong place (list instead of new profile).
- Duplicate not caught until after submit.

---

## Cross-workflow principles

These hold across all five:

**Search is the entry point for four of five workflows.** Search quality is not a nice-to-have. Evidence-rich results (name + company + owner + last interaction + context snippet) are required from day one.

**The profile drawer is the work surface for most of the value.** It should open fast (optimistic, no full-page load), show all relevant context above the fold, and let the user act without navigating away.

**Logging an activity is a side effect of workflows 1, 3, 4, and 5.** Every workflow ends with logging something. The quick-log pattern (see `docs/specs/interaction-speed.md §Quick-log`) must be frictionless — it's the core data quality mechanism.

**The system should be more useful on day 100 than day 1.** Workflows 1 and 2 are useless without data. The post-event triage and new contact workflows ARE the data-entry mechanism. Design them to be fast enough that the team actually does them — they are the flywheel.
