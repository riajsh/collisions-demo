import { AdminPage } from "@/components/admin/admin-page";
import { EventbriteEventMappingRow } from "@/components/admin/eventbrite-event-mapping-row";
import { requireAdmin } from "@/lib/auth/session";
import {
  listEventsForLinking,
  listEventbriteEventsForMapping,
} from "@/lib/data/eventbrite-events";

export default async function EventbriteEventsPage() {
  await requireAdmin();

  let mapping: Awaited<ReturnType<typeof listEventbriteEventsForMapping>> = {
    connected: false,
    events: [],
  };
  let existingEvents: Awaited<ReturnType<typeof listEventsForLinking>> = [];
  let loadError: string | null = null;

  try {
    [mapping, existingEvents] = await Promise.all([
      listEventbriteEventsForMapping(),
      listEventsForLinking(),
    ]);
  } catch (error) {
    loadError =
      error instanceof Error ? error.message : "Failed to load Eventbrite events";
  }

  return (
    <AdminPage
      title="Eventbrite events"
      description="Link each Eventbrite event to a Nova Collective event so attendee syncing knows where to add people. Do this once per event — it's remembered from then on."
    >
      {loadError ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-body text-destructive">
          Couldn&apos;t load your Eventbrite events: {loadError}
        </p>
      ) : !mapping.connected ? (
        <p className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-body text-foreground">
          Connect Eventbrite from the Admin overview page first.
        </p>
      ) : mapping.events.length === 0 ? (
        <p className="text-caption text-muted-foreground">
          No events found in your connected Eventbrite account yet.
        </p>
      ) : (
        <div className="space-y-2">
          {mapping.events.map((event) => (
            <EventbriteEventMappingRow
              key={event.id}
              eventbriteEventId={event.id}
              name={event.name}
              startIso={event.startIso}
              status={event.status}
              linkedEvent={event.linkedEvent}
              existingEvents={existingEvents}
            />
          ))}
        </div>
      )}
    </AdminPage>
  );
}
