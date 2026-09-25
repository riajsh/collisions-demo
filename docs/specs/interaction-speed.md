# Interaction Speed

- Version: 1.0
- Status: Accepted
- Related: design-principles.md, information-architecture.md, design-tokens.md

---

Ecosystem is a tool the team opens multiple times per day. Every second of unnecessary friction compounds. This document establishes hard rules that every screen must follow — not aspirational guidelines, but constraints Cursor enforces at build time the same way RLS is enforced at data time.

---

## The two-touch rule

Any action a user takes more than once per day must complete in two interactions or fewer.

An interaction is a discrete user gesture: a click, a keypress, a form submit. Navigation to a new page counts as an interaction. Opening a drawer counts as one interaction. Filling a form field counts as one interaction per field.

Examples:
- Logging a quick note → 1 interaction (type in persistent input, press Enter). ✓
- Changing a profile's strength → 1 interaction (click the badge, select new value). ✓
- Assigning an owner → 1 interaction (click the owner slot, select from dropdown). ✓
- Creating a new profile → 2 interactions (navigate to /profiles/new, fill and submit form). ✓
- Opening a profile drawer, then navigating to a separate edit page to change a field → 3 interactions. ✗

When a design requires more than two interactions for a repeated action, the design is wrong. Simplify it before building it.

---

## Table row hover actions

The profiles table is used dozens of times per session. Row actions must be available without opening the drawer.

On hover (or keyboard focus), each row exposes a contextual action bar in the rightmost column:

- **Quick-log** — opens an inline popover anchored to the row. Type a short note, press Enter. One interaction total after the hover. The activity type defaults to `note`; a small segmented control lets the user change it to `meeting` or `email` before submitting.
- **Quick-assign** — opens an owner picker popover. Select a team member. Closes on selection.

These are the only hover actions in Phase 1. Do not add more until usage proves the need.

Implementation notes:
- The action bar appears on `hover` and `focus-within`.
- It uses a small `opacity-0 group-hover:opacity-100 transition-opacity` pattern — the row has `group` and the action bar transitions in.
- The popover anchors to the action bar, not to the row. It closes on `Escape`, on outside click, and after a successful submit.
- After a quick-log, the row's "last interaction" column updates optimistically before the server confirms.

---

## Inline editing in the profile drawer

The drawer is not a read-only view with a separate edit mode. Fields are editable in place.

Rules:
- Every field that a user might want to change more than once a week is inline-editable.
- Inline editing activates on click. The field transitions from display to input in place (no layout shift).
- Pressing `Escape` cancels and restores the previous value.
- Pressing `Enter` (for single-line fields) or a save button (for multi-line) commits the change.
- Changes are saved via Server Action and applied optimistically — the UI updates immediately, rolls back on error.

Fields that are inline-editable in Phase 1:
- Strength (click the badge → cycles through values or opens a small picker)
- Relationship status (click the status chip → opens a small picker)
- Primary owner (click the owner dot/name → opens an owner selector)
- Co-owners (click "+ Add owner" → opens a picker; click an existing owner → remove confirmation)
- Notes (Activity tab — see Quick-log section below)

Fields that are NOT inline-editable (open a dedicated edit form or new page):
- Name, email, company, occupation, location, social links — these are structured fields that benefit from a form with validation. Edit button in the drawer header opens the form in the drawer itself (no page navigation).

---

## Quick-log in the Activity tab

The Activity tab has a persistent, always-visible log input at the top of the tab — above the timeline, not below it. This is the fastest way to capture a note, meeting, or call.

Behaviour:
- A single-line text input with placeholder "Log a note, meeting, or call…"
- Pressing Enter submits as `activity_type: note`.
- A small icon row below the input lets the user switch type to `meeting`, `call`, or `email` before submitting.
- After submit, the new activity appears at the top of the timeline immediately (optimistic update).
- The input clears and refocuses so the user can log another without any clicks.

This is not a modal, not a slide-up sheet, not a separate page. It lives in the tab content and is always visible.

---

## Keyboard navigation

The product must be usable without lifting hands from the keyboard. Every common action has a keyboard path.

### Profiles table
- `Tab` / `Shift-Tab` — move focus between rows.
- `Enter` — open the profile drawer for the focused row.
- `Escape` — close the drawer and return focus to the last-focused row.
- `L` — trigger quick-log popover for the focused row (no hover required).
- `A` — trigger quick-assign popover for the focused row.

### Profile drawer
- `Tab` — move focus between interactive elements.
- `Escape` — close the drawer.
- Numbers 1–4 — switch tabs (1 = Activity, 2 = Connections, 3 = Events, 4 = Notes) when focus is inside the drawer.

### Admin review queue (triage mode)
See `docs/specs/admin-review.md §Triage mode` for the full keyboard spec (L, C, I, J/K shortcuts).

### Global
- No custom global keyboard shortcuts in Phase 1 beyond the above. Avoid clashing with browser defaults.

---

## Optimistic updates

Every mutation that a user can see the result of immediately should be optimistic: the UI reflects the intended state before the server confirms, and rolls back with an error toast if the server rejects.

Must be optimistic in Phase 1:
- Quick-log activity (row and drawer timeline update immediately)
- Inline strength change
- Inline status change
- Owner assignment or removal
- Admin review queue: ignore, link, create — remove the card from the queue immediately (see `docs/specs/admin-review.md §Optimistic UI`)

Must NOT be optimistic:
- Profile creation (complex form, needs server-assigned ID for navigation)
- CSV import commit (too complex to reverse locally)
- OAuth connection steps

---

## Loading states

- Use skeleton loaders, not spinners, for content that renders on page load. Skeletons match the shape of the content they replace.
- Use a loading indicator on the button that triggered a mutation (spinner on the button, disable it), not a full-page overlay.
- Never block navigation while a mutation is in flight. Complete the navigation, settle the mutation in the background.
- Suspense boundaries: every data-fetching page component has a `<Suspense fallback={<SkeletonFor... />}>` wrapper. Cursor must not render loading states as bare `<div className="h-64 animate-pulse">` — use named skeleton components.

---

## Empty states

Every empty state has exactly one primary action and a sentence that explains what will fill the screen.

Formula: `[What this screen shows] + [Why it's empty] + [One action to fix it]`

Examples:
- Activity tab, no activities: "No activity logged yet. Use the input above to log a note, meeting, or call."
- Profiles table, no profiles: "Import a CSV or add profiles manually to start building the graph." → two buttons: Import dataset, New profile.
- Events, no events: "No events added yet. Events let you track who attends and what connections they create." → New event button.

Rules:
- Do not use "Nothing here yet" alone. It teaches nothing.
- Do not show multiple CTAs unless the user genuinely has multiple paths. Pick the most likely one as primary.
- The empty state for a filtered view is different from the empty state for an empty database. The filtered empty state always offers "Clear filters" as a secondary action.

---

## Navigation and layout

### Sticky page headers
Every page has a header with the page title, a description line, and a primary action button. The header and filter bar are `sticky top-0` within the page content container. They do not scroll away.

The layout pattern (from `app/(app)/layout.tsx`):
- App shell: `flex h-dvh overflow-hidden` — the whole shell fits the viewport.
- Sidebar: `h-dvh shrink-0` — never scrolls.
- Main content: `flex flex-1 flex-col overflow-hidden` — does NOT use `overflow-y-auto`. Each page manages its own scroll.
- Page root: `flex flex-1 flex-col overflow-hidden min-h-0`.
- Page header/filters: `sticky top-0 z-20 shrink-0 bg-background`.
- Page content wrapper: `flex flex-1 flex-col overflow-hidden min-h-0 px-8 pb-6 pt-4` — note: must be `flex flex-col` to pass sizing to the scroll container below.
- Scrollable content (table, list): `flex-1 overflow-auto min-h-0`.

This pattern ensures the sidebar and header never move, only the content scrolls, and the sticky header always remains visible.

### Drawers and panels
- The profile drawer slides in from the right at a fixed width (max 560px).
- It does not push the main content — it overlays it.
- The URL reflects the drawer state (`?profile=uuid`) so it is shareable and browser-back closes it.
- The drawer has its own scroll, independent of the page.
- Opening the drawer does not trigger a full page navigation or reload.

---

## Interaction anti-patterns

Do not build these:
- **Multi-step wizards for common actions.** If a mutation is done more than weekly, it should not be a wizard.
- **Confirmation dialogs for reversible actions.** Optimistic updates with an undo toast replace confirmation dialogs for reversible mutations (quick-log, strength change, owner assign). Reserve confirmation dialogs for destructive, irreversible actions (delete profile, archive import).
- **Separate edit pages for single-field changes.** Inline editing replaces these.
- **Scroll-to-top on drawer close.** Preserve scroll position when the drawer closes.
- **Full page refresh after background mutations.** Use `router.refresh()` only when necessary (server-side data changed that is not covered by the optimistic update). For queue-style UIs, remove items from local state immediately.
- **Toast for every successful mutation.** Only toast for mutations where confirmation adds value (e.g., "Import committed — 312 profiles created"). Do not toast for inline strength changes or quick-logs.

---

## Sign-off checklist

- [ ] Two-touch rule applied to all repeated actions
- [ ] Table row hover actions implemented (quick-log, quick-assign)
- [ ] All drawer fields editable inline (no separate edit mode)
- [ ] Quick-log input persistent at top of Activity tab
- [ ] Keyboard navigation working for table and drawer
- [ ] Optimistic updates on all inline mutations
- [ ] Skeleton loaders, not spinners, for page load
- [ ] Empty states follow formula (what + why + one action)
- [ ] Sticky headers never scroll away
- [ ] No confirmation dialogs for reversible actions
