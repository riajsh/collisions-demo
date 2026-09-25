import { formatEnumLabel } from "@/lib/format/enum";
import type { ProfileActivity, ProfileEvent, ProfileNote } from "@/lib/data/profiles";

export type TimelineEntry = {
  id: string;
  date: string;
  tag: string;
  title: string;
  detail: string | null;
  /** Only set on "Event" cards that also have a matching self-reported
   * note — lets the card show both the event location and what they told
   * us, instead of picking one. */
  secondaryDetail: string | null;
};

type TimelineSource = {
  events: ProfileEvent[];
  activities: ProfileActivity[];
  notes: ProfileNote[];
};

/**
 * Merges events attended, logged interactions, and self-reported notes into
 * one chronological feed. A note from an event's registration form is
 * folded into that event's card (same event title) rather than shown as a
 * separate entry — that's the "merged event+ask card" the redesign brief
 * asked for. Notes that can't be matched to an attended event (title
 * mismatch, or the event record isn't on file) still show up as their own
 * "Ask" card so nothing gets silently dropped.
 */
export function buildProfileTimeline(profile: TimelineSource): TimelineEntry[] {
  const noteByEventTitle = new Map(profile.notes.map((note) => [note.eventTitle, note]));
  const usedNoteIds = new Set<string>();

  const eventEntries: TimelineEntry[] = profile.events.map((event) => {
    const note = noteByEventTitle.get(event.title);
    if (note) {
      usedNoteIds.add(note.id);
    }

    return {
      id: `event-${event.id}`,
      date: event.eventDate,
      tag: "Event",
      title: event.title,
      detail: event.location,
      secondaryDetail: note?.text ?? null,
    };
  });

  const unmatchedNoteEntries: TimelineEntry[] = profile.notes
    .filter((note) => !usedNoteIds.has(note.id))
    .map((note) => ({
      id: `ask-${note.id}`,
      date: note.activityDate,
      tag: "Ask",
      title: note.eventTitle,
      detail: note.text,
      secondaryDetail: null,
    }));

  // The same event_system "note" rows are already represented above (either
  // folded into an event card or as an unmatched Ask card) — exclude them
  // here so they don't show a third time.
  const activityEntries: TimelineEntry[] = profile.activities
    .filter((activity) => !(activity.activityType === "note" && activity.source === "event_system"))
    .map((activity) => ({
      id: `activity-${activity.id}`,
      date: activity.activityDate,
      tag: activity.activityType === "note" ? "Note" : formatEnumLabel(activity.activityType),
      title: activity.title,
      detail: activity.summary,
      secondaryDetail: null,
    }));

  return [...eventEntries, ...unmatchedNoteEntries, ...activityEntries].sort(
    (a, b) => Date.parse(b.date) - Date.parse(a.date),
  );
}
