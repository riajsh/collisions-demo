import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  calendarActivitySourceRef,
  calendarActivitySourceRefCandidates,
} from "@/lib/integrations/calendar/occurrence";
import type { Database } from "@/types/database";

type AdminClient = SupabaseClient<Database>;

/** Remove derived calendar data when an event is cancelled or removed from sync. */
export async function removeCalendarEventDerivedData(
  supabase: AdminClient,
  orgId: string,
  eventId: string,
  googleEventId: string,
  icalUid?: string | null,
  startAt?: string | null,
): Promise<void> {
  const sourceRefs = calendarActivitySourceRefCandidates(
    icalUid,
    startAt,
    googleEventId,
  );

  const { error: activitiesError } = await supabase
    .from("activities")
    .delete()
    .eq("org_id", orgId)
    .eq("source", "calendar_sync")
    .in("source_ref", sourceRefs);

  if (activitiesError) {
    throw new Error(
      `Failed to remove calendar activities for cancelled event: ${activitiesError.message}`,
    );
  }

  const { error: reviewsError } = await supabase
    .from("calendar_participant_reviews")
    .delete()
    .eq("org_id", orgId)
    .eq("calendar_event_id", eventId)
    .eq("status", "pending");

  if (reviewsError) {
    throw new Error(
      `Failed to remove calendar reviews for cancelled event: ${reviewsError.message}`,
    );
  }

  const { error: sourcesError } = await supabase
    .from("relationship_sources")
    .delete()
    .eq("org_id", orgId)
    .eq("source_type", "meeting")
    .eq("source_id", eventId);

  if (sourcesError) {
    throw new Error(
      `Failed to remove meeting provenance for cancelled event: ${sourcesError.message}`,
    );
  }
}

export function activitySourceRefForCalendarEvent(event: {
  google_event_id: string;
  ical_uid?: string | null;
  start_at?: string | null;
}): string {
  return calendarActivitySourceRef(
    event.ical_uid,
    event.start_at,
    event.google_event_id,
  );
}
