import type { ProfileDetail } from "@/lib/data/profiles";

export type FollowUpFlag = { message: string };

const MIN_EVENTS_FOR_FLAG = 3;
// Real person-to-person contact — deliberately excludes "event" (just
// attendance) and "note" (something they told us, not us reaching out).
const DIRECT_CONTACT_TYPES = new Set(["meeting", "email", "introduction"]);

/**
 * Surfaces the case the brief calls out: someone who keeps showing up to
 * events but has never actually been contacted directly — worth a human
 * follow-up rather than just another event invite. Computed from the
 * timeline, not a stored field, so it stays current automatically.
 *
 * Known limitation: profile.activities is capped (see PROFILE_ACTIVITY_LIMIT
 * in lib/data/profiles.ts) to the most recent entries, so a very old direct
 * contact could in theory fall outside that window and cause a false
 * positive here — acceptable for now given how few profiles have that much
 * history yet.
 */
export function computeFollowUpFlag(profile: ProfileDetail): FollowUpFlag | null {
  const eventCount = profile.events.length;
  if (eventCount < MIN_EVENTS_FOR_FLAG) {
    return null;
  }

  const hasDirectContact = profile.activities.some((activity) =>
    DIRECT_CONTACT_TYPES.has(activity.activityType),
  );
  if (hasDirectContact) {
    return null;
  }

  const eventTimestamps = profile.events
    .map((event) => Date.parse(event.eventDate))
    .filter((value) => !Number.isNaN(value));

  if (eventTimestamps.length < 2) {
    return {
      message: `Attended ${eventCount} events, never contacted directly — worth a personal follow-up.`,
    };
  }

  const spanMonths = Math.max(
    1,
    Math.round(
      (Math.max(...eventTimestamps) - Math.min(...eventTimestamps)) /
        (1000 * 60 * 60 * 24 * 30),
    ),
  );

  return {
    message: `Attended ${eventCount} events over ${spanMonths} month${spanMonths === 1 ? "" : "s"}, never contacted directly — worth a personal follow-up.`,
  };
}
