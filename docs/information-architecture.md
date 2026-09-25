# Ecosystem Information Architecture

- Version: 1.0
- Status: Accepted
- Related: domain-model-v1.md, product-brief-v1.md

---

## Mental model

The product has one spine and a small set of lenses onto it.

- **Spine:** people we know, the relationships the org holds with them, who owns those relationships, and the evidence (activities, emails, events).
- **Lenses:** Search, Profiles, Orbit, Connect, Events, Watch List. Each is a different way of looking at the same graph. None is a separate data silo.

If a screen invents its own data instead of reading the spine, it is wrong.

## Primary objects

| Object | What it is | Where it lives |
|---|---|---|
| Profile | An external person | Profiles, Search, Orbit nodes |
| Relationship | the org's relationship with a person | Inside a profile |
| Owner | A team member who holds a relationship | Profile header, Orbit colour |
| Activity | Evidence of interaction | Profile timeline, Search |
| Connection | A person-to-person edge | Profile, Orbit, Connect |
| Event | A community event | Events, profile timeline |
| Tag | Expertise, Industry, Signal/Influence | Profile, Search filters |

## Navigation

Sidebar order, matching the validated prototype:

1. **Overview** — home and landing. Defaults to Search plus a few high-signal cards (recent activity, reconnect prompts, upcoming events). Search is the centre of gravity, not an afterthought.
2. **Watch List (Phase 2)** — a saved set of people the user is actively tracking.
3. **Connect** — computed suggestions: reconnect, introduce, emerging. Phase 2.
4. **Profiles** — the table view. Filterable, sortable, the workhorse for browsing and bulk actions.
5. **Orbit** — the relationship radar. Strength and recency as distance from centre, owner as colour. Phase 2.
6. **Events** — community events and attendance.
7. **Admin** — import, users, tags, review queues (unmatched email participants, soft-match dedup).

## Screen map

### Overview
- Global search bar, prominent.
- Cards: recent activity, reconnect candidates (Phase 2), upcoming and recent events.
- Empty state explains what populates each card.

### Search
- Searches profiles, tags, activities, events, email subjects.
- Results are evidence-rich: name, company, owner, last interaction, matching context, not bare cards.
- Filters: tag, sector, location, owner, status, relationship type.

### Profiles (table)
- Columns: name, company, occupation, location, primary owner, status, strength, last interaction (date), last meeting, calendar source, tags.
- Row click opens the profile drawer or page.
- Bulk: merge, delete, tag, add to watch list, assign owner.

### Profiles → Import (`/profiles/import`, `/profiles/import/[id]`)
- Three steps: Upload → Check & fix → Complete. Column mapping is auto-guessed and dedup runs automatically right after upload — no separate manual clicks for either.
- "Check & fix" surfaces everything that needs a human: possible duplicate profiles to resolve (merge, create separate, delete & replace, or skip) and a list of rows that will be skipped due to errors. A "Fix column mapping" option is tucked away and only opens automatically if the auto-guess clearly failed.
- Optional "attach to event" step on Complete: pick an existing event or create one, and every attendee in the file is linked and tagged with the event name automatically.
- Admin-only, same as before — enforced server-side regardless of route.
- Spec: `docs/specs/import-pipeline.md`, `docs/specs/admin-review.md` §5.

**Deferred — first / last name columns.** V1 stores a single `profiles.full_name` (no `first_name` / `last_name` in schema). A display-only split in the table (first word vs remainder) is straightforward; proper separate fields need a schema change, backfill, and updates to create/edit, import, merge, and search. Revisit once the core platform UX feels more settled — not worth the ambiguity cost until then.

### Admin → Dedup
- Detects duplicate groups by email, phone, LinkedIn, exact name+company, and fuzzy name+company (same org).
- **Merge group** opens the same merge dialog as Profiles bulk actions (including email conflict resolution).
- Per-import dedup still runs in the CSV wizard.

### Profile (drawer or page)

Spec: `docs/specs/profile-detail.md`.

- Header: name, company, role, location, links, primary owner, owner list with strength, status, relationship type.
- Tabs: Activity (timeline), Connections, Events attended, Notes.
- Network intelligence block (Phase 2): works with N people at the same company, appears in these clusters, strongly connected to, suggested introductions. Generated, labelled as generated.

### Orbit (Phase 2)
- Rings: inner circle, active, extended, dormant. Derived, not maintained.
- Node size by strength, colour by primary owner, with a legend.
- Defaults to a filtered view, never the full hairball. Filter before decorate.
- Node click opens the profile drawer. Detail on demand, minimal node chrome.

### Connect (Phase 2)
- Three sections: reconnect, introduce, emerging.
- Each item is actionable: log the reconnect, draft the intro, add to watch list.

### Events
- Event list with type, date, location, attendee count.
- Event detail: attendee list, connections that originated here, who attends often, who stopped attending.

### Admin
- Review queues: calendar participants (shipped), unmatched email participants (planned), import soft-matches (`docs/specs/admin-review.md`).
- Team members, tags, dedup, archived, connect settings.
- CSV import lives under Profiles → Import, not here (see above).

## Cross-cutting UI rules

- Inferred data is visually distinct from confirmed data everywhere it appears.
- Generated or computed intelligence is labelled as such, never presented as user-entered fact.
- Detail opens in a side panel or drawer, not crammed into dense nodes or rows.
- Empty states teach: they say what the screen is for and what fills it.
