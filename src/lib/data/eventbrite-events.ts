import "server-only";

import { getOrgId, requireAdmin } from "@/lib/auth/session";
import { getDecryptedEventbriteToken } from "@/lib/data/eventbrite-accounts";
import {
  listOrganizerEvents,
  type EventbriteEventSummary,
} from "@/lib/integrations/eventbrite/client";
import { createClient } from "@/lib/supabase/server";

export type EventbriteMappingRow = EventbriteEventSummary & {
  linkedEvent: { id: string; title: string } | null;
};

export type EventbriteMappingList = {
  connected: boolean;
  events: EventbriteMappingRow[];
};

/**
 * Lists every event in the connected Eventbrite account, cross-referenced
 * with which ones are already linked to a Nova Collective event (via
 * events.eventbrite_event_id) — the data behind the event-mapping screen.
 */
export async function listEventbriteEventsForMapping(): Promise<EventbriteMappingList> {
  const orgId = await getOrgId();
  const token = await getDecryptedEventbriteToken(orgId);

  if (!token) {
    return { connected: false, events: [] };
  }

  const [eventbriteEvents, linkedRows] = await Promise.all([
    listOrganizerEvents(token),
    loadLinkedEvents(orgId),
  ]);

  const linkedByEventbriteId = new Map(
    linkedRows.map((row) => [row.eventbrite_event_id as string, row]),
  );

  return {
    connected: true,
    events: eventbriteEvents.map((event) => {
      const linked = linkedByEventbriteId.get(event.id);
      return {
        ...event,
        linkedEvent: linked ? { id: linked.id, title: linked.title } : null,
      };
    }),
  };
}

async function loadLinkedEvents(orgId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("events")
    .select("id, title, eventbrite_event_id")
    .eq("org_id", orgId)
    .not("eventbrite_event_id", "is", null);

  if (error) {
    throw new Error(`Failed to load linked events: ${error.message}`);
  }

  return data ?? [];
}

export async function linkEventbriteEventToExisting(
  eventbriteEventId: string,
  linkedEventId: string,
): Promise<void> {
  await requireAdmin();
  const orgId = await getOrgId();
  const supabase = await createClient();

  const { data: event, error: lookupError } = await supabase
    .from("events")
    .select("id")
    .eq("id", linkedEventId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (lookupError) {
    throw new Error(`Failed to verify event: ${lookupError.message}`);
  }
  if (!event) {
    throw new Error("Event not found");
  }

  const { error } = await supabase
    .from("events")
    .update({ eventbrite_event_id: eventbriteEventId })
    .eq("id", linkedEventId)
    .eq("org_id", orgId);

  if (error) {
    if (error.code === "23505") {
      throw new Error(
        "That Eventbrite event is already linked to a different Nova Collective event.",
      );
    }
    throw new Error(`Failed to link event: ${error.message}`);
  }
}

export async function createEventFromEventbrite(
  eventbriteEventId: string,
  title: string,
  startIso: string | null,
): Promise<{ id: string; title: string }> {
  await requireAdmin();
  const orgId = await getOrgId();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("events")
    .insert({
      org_id: orgId,
      title: title.trim() || "Untitled Eventbrite event",
      event_type: "other",
      event_date: startIso ?? new Date().toISOString(),
      eventbrite_event_id: eventbriteEventId,
    })
    .select("id, title")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new Error(
        "That Eventbrite event is already linked to a different Nova Collective event.",
      );
    }
    throw new Error(`Failed to create event: ${error.message}`);
  }

  return { id: data.id, title: data.title };
}

export async function unlinkEventbriteEvent(linkedEventId: string): Promise<void> {
  await requireAdmin();
  const orgId = await getOrgId();
  const supabase = await createClient();

  const { error } = await supabase
    .from("events")
    .update({ eventbrite_event_id: null })
    .eq("id", linkedEventId)
    .eq("org_id", orgId);

  if (error) {
    throw new Error(`Failed to unlink event: ${error.message}`);
  }
}

export async function listEventsForLinking(): Promise<
  Array<{ id: string; title: string; eventDate: string }>
> {
  await requireAdmin();
  const orgId = await getOrgId();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("events")
    .select("id, title, event_date")
    .eq("org_id", orgId)
    .is("eventbrite_event_id", null)
    .order("event_date", { ascending: false })
    .limit(200);

  if (error) {
    throw new Error(`Failed to list events: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    eventDate: row.event_date,
  }));
}
