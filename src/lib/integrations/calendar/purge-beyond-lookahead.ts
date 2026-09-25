import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { calendarLookaheadCutoff } from "@/lib/integrations/calendar/env";
import { activitySourceRefForCalendarEvent } from "@/lib/integrations/calendar/cleanup-event";
import type { Database } from "@/types/database";

type AdminClient = SupabaseClient<Database>;

const BATCH_SIZE = 1000;

async function deleteInBatches(
  ids: string[],
  deleteBatch: (batch: string[]) => Promise<number>,
): Promise<number> {
  let removed = 0;

  for (let index = 0; index < ids.length; index += BATCH_SIZE) {
    const batch = ids.slice(index, index + BATCH_SIZE);
    removed += await deleteBatch(batch);
  }

  return removed;
}

export async function purgeBeyondLookaheadCalendarData(
  supabase: AdminClient,
  orgId: string,
): Promise<{
  eventsRemoved: number;
  activitiesRemoved: number;
  sourcesRemoved: number;
}> {
  const cutoff = calendarLookaheadCutoff().toISOString();

  let activitiesRemovedByDate = 0;

  while (true) {
    const { data: farActivities, error: selectError } = await supabase
      .from("activities")
      .select("id")
      .eq("org_id", orgId)
      .eq("source", "calendar_sync")
      .gt("activity_date", cutoff)
      .limit(BATCH_SIZE);

    if (selectError) {
      throw new Error(
        `Failed to load far-future calendar activities: ${selectError.message}`,
      );
    }

    if (!farActivities?.length) {
      break;
    }

    const ids = farActivities.map((row) => row.id);
    const removed = await deleteInBatches(ids, async (batch) => {
      const { data, error } = await supabase
        .from("activities")
        .delete()
        .eq("org_id", orgId)
        .in("id", batch)
        .select("id");

      if (error) {
        throw new Error(
          `Failed to remove far-future calendar activities: ${error.message}`,
        );
      }

      return data?.length ?? 0;
    });

    activitiesRemovedByDate += removed;
  }

  let activitiesFromEvents = 0;
  let sourcesRemoved = 0;
  let eventsRemoved = 0;

  while (true) {
    const { data: farEvents, error: eventsError } = await supabase
      .from("calendar_events")
      .select("id, google_event_id, ical_uid, start_at")
      .eq("org_id", orgId)
      .gt("start_at", cutoff)
      .limit(BATCH_SIZE);

    if (eventsError) {
      throw new Error(
        `Failed to load far-future calendar events: ${eventsError.message}`,
      );
    }

    if (!farEvents?.length) {
      break;
    }

    const sourceRefs = farEvents.map((event) =>
      activitySourceRefForCalendarEvent(event),
    );
    const eventIds = farEvents.map((event) => event.id);

    activitiesFromEvents += await deleteInBatches(sourceRefs, async (batch) => {
      const { data, error } = await supabase
        .from("activities")
        .delete()
        .eq("org_id", orgId)
        .eq("source", "calendar_sync")
        .in("source_ref", batch)
        .select("id");

        if (error) {
          throw new Error(
            `Failed to remove activities for far-future events: ${error.message}`,
          );
        }

        return data?.length ?? 0;
    });

    sourcesRemoved += await deleteInBatches(eventIds, async (batch) => {
      const { data, error } = await supabase
        .from("relationship_sources")
        .delete()
        .eq("org_id", orgId)
        .eq("source_type", "meeting")
        .in("source_id", batch)
        .select("id");

      if (error) {
        throw new Error(
          `Failed to remove far-future meeting provenance: ${error.message}`,
        );
      }

      return data?.length ?? 0;
    });

    eventsRemoved += await deleteInBatches(eventIds, async (batch) => {
      const { data, error } = await supabase
        .from("calendar_events")
        .delete()
        .in("id", batch)
        .select("id");

      if (error) {
        throw new Error(
          `Failed to remove far-future calendar events: ${error.message}`,
        );
      }

      return data?.length ?? 0;
    });
  }

  return {
    eventsRemoved,
    activitiesRemoved: activitiesRemovedByDate + activitiesFromEvents,
    sourcesRemoved,
  };
}
