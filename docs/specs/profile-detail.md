# Profile Detail Specification

- Version: 1.0
- Status: Accepted
- Related: domain-model-v1.md §5.3–5.8, information-architecture.md, design-principles.md, design-tokens.md

The most-used screen in the product. Every lens (Search, Profiles, Orbit, Connect) resolves here. This spec defines data shape, layout, tabs, edit flows, and empty states for both **page** (`/profiles/[id]`) and **drawer** (`/profiles?profile=[id]`) modes.

---

## 1. Purpose

Show everything the org knows about one external person: identity, relationship, owners, provenance, timeline evidence, connections, and event attendance. Support inline editing of Layer 1 facts without exposing Layer 2 computed values as editable fields.

---

## 2. Entry points

| Route | Mode | Notes |
|---|---|---|
| `/profiles/[id]` | `page` | Full layout with back link to table |
| `/profiles?profile=[id]` | `drawer` | Side panel over profiles table; link to full page at bottom |
| `/profiles/[id]?tab=connections` | `page` | Deep-link to tab |
| Search result click | drawer or page | Same component (`ProfileDetailView`) |

Tab query param values: `activity` (default), `connections`, `events`, `notes`. Invalid tab → 404.

---

## 3. Data shape

Loaded via `getProfileById(id)` in `src/lib/data/profiles.ts`. Returns `ProfileDetail`:

| Field group | Source tables | Notes |
|---|---|---|
| Identity | `profiles` | fullName, email, phone, linkedinUrl, websiteUrl, organisationName, occupation, location, bio, source |
| Relationship | `relationships` | status, relationshipType, notes — one row per profile per org |
| Owners | `relationship_owners` + `users` | strength, isPrimary, lastInteractionAt, notes per owner |
| Provenance | `relationship_sources` | Aggregated in UI via `formatProfileProvenance()` — meeting sources summarised as "Google Calendar · N meetings" |
| Tags | `profile_tags` + `tags` | |
| Activities | `activities` | Ordered by `activity_date` desc, limit 50 (`PROFILE_ACTIVITY_LIMIT`); `activitiesTruncated` flag when more exist |
| Events | `event_attendees` + `events` | Attended events only |
| Connections | `connections` | Other profile name, type, strength, source |
| Internal flag | computed | `isInternalProfile` when email matches `ORG_INTERNAL_EMAIL_DOMAINS` or team user email |

Also loaded per request: `listOrgUsers()`, `listOrgTags()`, `getProfileNetworkIntel(id)`.

**Inline-editable Layer 1 fields (click to edit in place — no separate edit mode):** strength (per owner, manual enum in Phase 1 — click the badge to change), relationship status, relationship type, org-level notes, owner assignment, tags.

**Never editable on this screen:** orbit ring (computed Phase 2), last_interaction_at (computed from activities in Phase 2), Connect suggestions, network intelligence counts.

---

## 4. Layout (top to bottom)

### 4.1 Header (`ProfileHeader`)

- **Page mode:** "← Back to profiles" link.
- **Internal profile banner:** if `isInternalProfile`, show muted callout — team members are not tracked as external contacts; calendar sync does not attach meetings here.
- **Title block:** full name + tag badges (secondary).
- **Subtitle:** occupation, organisation, location (muted).
- **Bio:** full width when present.
- **Contact links:** email, phone, LinkedIn, website.
- **Summary card (right on lg+):** relationship status, relationship type, primary owner (with `OwnerDot` + `StrengthBadge`), provenance string.

### 4.2 Network intelligence (`ProfileNetworkIntelligence`)

Layer 2 preview block — always labelled **Generated** (badge). Shows:

- Connection count → links to Connections tab
- Events attended count → links to Events tab
- Same-company count → links to filtered profiles table when company name known

Phase 2 expands this block (clusters, suggested intros). V1 stays deterministic counts only.

### 4.3 Details (`EditProfileForm`)

Inline-editable Layer 1 profile fields. Server action validates with Zod; `org_id` from session.

### 4.4 Relationship (`EditRelationshipForm`)

Status, type, org-level relationship notes.

### 4.5 Owners (`ProfileOwnersSection`)

All owners listed simultaneously — not just the primary. This is a Workflow 2 requirement: intro routing requires seeing every owner and their individual strength at a glance. Each row: owner colour dot, name, strength badge (inline-editable — click to change), last interaction date, "Make primary" control, remove control. Strength changes via optimistic update. All team owners must be visible without expanding or scrolling within this section.

### 4.6 Tags (`ProfileTagsSection`)

Add/remove tags from org tag list.

### 4.7 Tabs (`ProfileDetailTabs`)

Four tabs — see §5. Keyboard shortcuts when focus is inside the drawer or page: `1` = Activity, `2` = Connections, `3` = Events, `4` = Notes.

### 4.8 Drawer footer

"View full profile page →" link to `/profiles/[id]`.

---

## 5. Tabs

### Activity (default)

1. **Quick-log input** — persistent single-line input at the top of the tab, always visible. See `docs/specs/interaction-speed.md §Quick-log`. Type and press Enter to log a note immediately. A type switcher (note / meeting / call) appears below the input. This is the primary data entry path — it must be the first element in the tab, not buried below the timeline.

2. **Full log form** (`LogActivityForm`) — secondary path for when more detail is needed (title, summary, date, `introduced_by`, introduction outcome). Accessible via "Add activity" button below the quick-log input.

3. **Timeline** (`ActivityTimeline`) — chronological list, most recent first.

Each activity row shows: date, activity type badge, introduction outcome badge (if set), source badge (`manual`, `gmail_sync`, `calendar_sync`, `import`, `event_system`), title, summary.

**Truncation:** when profile has >50 activities, show caption "Showing the 50 most recent activities." Do not paginate in V1.

**Empty state:** dashed border card — "No activity yet. Manual notes, meetings, email sync, and events will populate this timeline."

### Connections

`ProfileConnectionsSection` — list existing connections, add manual connection form. Inferred connections (Phase 2) use dashed border + "Generated" styling when added.

**Empty state:** explain connections are person-to-person edges; link to add manually.

### Events

List of community events this profile attended (`event_attendees.attended = true`). Each row: title (link to `/events/[id]`), type, date, location.

**Empty state:** "No events attended" with link to `/events`.

### Notes

Editable free-text notes (`relationship.notes`). Rendered as an auto-expanding textarea that saves on blur via server action. This is the same field as the org-level notes in the Relationship section (§4.4) — both surfaces edit the same column. The tab exists because longer scratchpad content benefits from full-width space.

**Empty state:** "Use this tab for shared notes about the relationship — context, history, things to remember. Saves automatically."

---

## 6. Edit flows

| Action | Pattern | Optimistic? |
|---|---|---|
| Update profile fields | Server action → `profiles` upsert | Yes — inline fields update immediately |
| Update relationship status/type | Server action → `relationships` update | Yes |
| Update owner strength | Server action → `relationship_owners` update | Yes — badge changes on click |
| Assign / remove owner | Server action → `relationship_owners` insert/delete | Yes |
| Quick-log activity | Server action → `activities` insert | Yes — appears at top of timeline immediately |
| Full log activity | Server action → `activities` insert | No — form submit, navigate back |
| Add connection | Server action → `connections` insert | Yes |
| Add/remove tag | Server action → `profile_tags` | Yes |

All mutations: `requireUser()` → Zod validate → repository write → `revalidatePath`. Never accept `org_id` from client. Optimistic updates roll back on error with a toast. See `docs/specs/interaction-speed.md §Optimistic updates`.

---

## 7. Visual rules

- Use `@theme` tokens only (`docs/design-tokens.md`).
- Owner dots use `ownerColour(userId)` — never hardcode owner names.
- Generated / inferred blocks: secondary badge + optional dashed border.
- Strength badge uses CVA variants from design tokens — not arbitrary colours.

---

## 8. Acceptance criteria

- [ ] Page and drawer render the same `ProfileDetailView` with correct mode spacing
- [ ] Tab deep links work; invalid tab returns 404
- [ ] Internal team profiles show banner and skip calendar pollution messaging
- [ ] Activity timeline shows sync-sourced activities with correct source badges
- [ ] Truncation caption appears when >50 activities
- [ ] All four tabs have teaching empty states
- [ ] Edits persist and revalidate without full page reload
- [ ] Network intelligence block labelled Generated
- [ ] Drawer links to full page; full page has back link to table
