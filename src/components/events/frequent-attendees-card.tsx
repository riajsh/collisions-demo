import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import type { FrequentAttendee } from "@/lib/computed/event-attendance";

type FrequentAttendeesCardProps = {
  attendees: FrequentAttendee[];
};

export function FrequentAttendeesCard({ attendees }: FrequentAttendeesCardProps) {
  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-heading font-medium text-foreground">
            Regular attendees
          </h2>
          <Badge variant="secondary">Automatic</Badge>
        </div>
        <p className="text-caption text-muted-foreground">
          Profiles who have attended two or more events — useful for room
          composition and follow-up.
        </p>
      </div>

      {attendees.length === 0 ? (
        <p className="text-body text-muted-foreground">
          No repeat attendees yet. Add attendees to multiple events to see who
          keeps showing up.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {attendees.map((attendee) => (
            <li
              key={attendee.profileId}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
            >
              <Link
                href={`/profiles/${attendee.profileId}?tab=events`}
                className="text-body font-medium text-foreground hover:underline"
              >
                {attendee.fullName}
              </Link>
              <div className="flex flex-wrap items-center gap-2 text-caption text-muted-foreground">
                <span>{attendee.organisationName ?? "—"}</span>
                <span>·</span>
                <span>
                  {attendee.eventCount} event
                  {attendee.eventCount === 1 ? "" : "s"}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
