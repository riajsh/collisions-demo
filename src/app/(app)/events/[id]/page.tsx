import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/app-shell/breadcrumbs";
import { PageHeader } from "@/components/app-shell/page-header";
import { AddEventAttendeeForm } from "@/components/events/add-event-attendee-form";
import { EventAttendeesTable } from "@/components/events/event-attendees-table";
import { EventConnectionsSection } from "@/components/events/event-connections-section";
import { EventSummarySection } from "@/components/events/event-summary-section";
import { DeleteEventButton } from "@/components/events/delete-event-button";
import {
  getProfileEventAttendanceCounts,
} from "@/lib/computed/event-attendance";
import { toAttendanceCountRecord } from "@/lib/event-attendance";
import { getEventById } from "@/lib/data/events";
import { listEventConnections } from "@/lib/data/connections";

type EventPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EventPage({ params }: EventPageProps) {
  const { id } = await params;

  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    notFound();
  }

  const [event, connections, attendanceCounts] = await Promise.all([
    getEventById(id),
    listEventConnections(id),
    getProfileEventAttendanceCounts(),
  ]);
  const attendanceCountRecord = toAttendanceCountRecord(attendanceCounts);

  return (
    <>
      <div className="border-b border-border px-8 pt-6">
        <Breadcrumbs
          items={[
            { label: "Events", href: "/events" },
            { label: event.title },
          ]}
        />
      </div>
      <PageHeader title={event.title}>
        <DeleteEventButton eventId={event.id} eventTitle={event.title} />
      </PageHeader>
      <div className="space-y-8 px-8 py-6">
        <EventSummarySection
          eventId={event.id}
          title={event.title}
          description={event.description}
          eventType={event.eventType}
          eventDate={event.eventDate}
          location={event.location}
          attendeeCount={event.attendeeCount}
        />

        <section className="space-y-4">
          <h2 className="text-heading font-medium text-foreground">Attendees</h2>
          <AddEventAttendeeForm
            eventId={event.id}
            existingProfileIds={event.attendees.map((attendee) => attendee.profileId)}
          />
          <EventAttendeesTable
            eventId={event.id}
            attendees={event.attendees}
            attendanceCounts={attendanceCountRecord}
          />
        </section>

        <section className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-heading font-medium text-foreground">
              Connections from this event
            </h2>
            <p className="text-caption text-muted-foreground">
              Profile pairs linked because they attended together.
            </p>
          </div>
          <EventConnectionsSection connections={connections} />
        </section>
      </div>
    </>
  );
}
