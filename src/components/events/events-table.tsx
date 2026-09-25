"use client";

import { useRouter } from "next/navigation";

import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatInteractionDate } from "@/lib/format/date";
import { formatEnumLabel } from "@/lib/format/enum";
import type { EventListItem } from "@/lib/data/events";

type EventsTableProps = {
  events: EventListItem[];
};

export function EventsTable({ events }: EventsTableProps) {
  const router = useRouter();

  if (events.length === 0) {
    return (
      <EmptyState
        title="No events yet"
        description="Create dinners, roundtables, and workshops — then add attendees to build the attendance graph."
      >
        <p className="text-caption text-muted-foreground">
          Use the New event button above to get started.
        </p>
      </EmptyState>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-card [&_tr]:border-b">
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Location</TableHead>
            <TableHead>Attendees</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.map((event) => (
            <TableRow
              key={event.id}
              tabIndex={0}
              role="button"
              aria-label={`Open event ${event.title}`}
              className="cursor-pointer hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              onClick={() => router.push(`/events/${event.id}`)}
              onKeyDown={(keydownEvent) => {
                if (keydownEvent.key === "Enter" || keydownEvent.key === " ") {
                  keydownEvent.preventDefault();
                  router.push(`/events/${event.id}`);
                }
              }}
            >
              <TableCell className="font-medium text-foreground">
                {event.title}
              </TableCell>
              <TableCell>
                <Badge variant="outline">{formatEnumLabel(event.eventType)}</Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatInteractionDate(event.eventDate)}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {event.location ?? "—"}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {event.attendeeCount}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
