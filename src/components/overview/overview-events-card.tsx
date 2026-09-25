import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatInteractionDate } from "@/lib/format/date";
import { formatEnumLabel } from "@/lib/format/enum";
import type { EventListItem } from "@/lib/data/events";

type OverviewEventsCardProps = {
  upcomingEvents: EventListItem[];
  recentEvents: EventListItem[];
  ownerName?: string;
};

export function OverviewEventsCard({
  upcomingEvents,
  recentEvents,
  ownerName,
}: OverviewEventsCardProps) {
  const events =
    upcomingEvents.length > 0 ? upcomingEvents : recentEvents.slice(0, 5);
  const title =
    upcomingEvents.length > 0 ? "Upcoming events" : "Recent events";

  if (events.length === 0) {
    return (
      <EmptyState
        variant="dashed"
        title="Events"
        description={
          ownerName
            ? `No events where ${ownerName}'s profiles are attending yet.`
            : "Create community events and roundtables to build the attendance graph."
        }
      >
        <Link href="/events" className="text-body text-interactive-primary hover:underline">
          Go to Events →
        </Link>
      </EmptyState>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-subheading font-medium text-foreground">
          {title}
          {ownerName ? (
            <span className="text-muted-foreground"> · {ownerName}</span>
          ) : null}
        </p>
        <Link href="/events" className="text-caption text-interactive-primary hover:underline">
          View all
        </Link>
      </div>
      <ul className="mt-4 space-y-3">
        {events.map((event) => (
          <li key={event.id}>
            <Link
              href={`/events/${event.id}`}
              className="block rounded-md px-1 py-1 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-body font-medium text-foreground">
                  {event.title}
                </span>
                <Badge variant="outline">{formatEnumLabel(event.eventType)}</Badge>
              </div>
              <p className="text-caption text-muted-foreground">
                {formatInteractionDate(event.eventDate)}
                {event.location ? ` · ${event.location}` : ""}
                {event.attendeeCount > 0
                  ? ` · ${event.attendeeCount} attendee${event.attendeeCount === 1 ? "" : "s"}`
                  : ""}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
