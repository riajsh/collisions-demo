import {
  CreateEventPanel,
  CreateEventProvider,
  CreateEventTrigger,
} from "@/components/events/create-event-form";
import { EventsTable } from "@/components/events/events-table";
import { FrequentAttendeesCard } from "@/components/events/frequent-attendees-card";
import { PageHeader } from "@/components/app-shell/page-header";
import { formatCountLabel, ListMeta } from "@/components/ui/list-meta";
import { getFrequentEventAttendees } from "@/lib/computed/event-attendance";
import { listEvents } from "@/lib/data/events";

export default async function EventsPage() {
  const [events, frequentAttendees] = await Promise.all([
    listEvents(),
    getFrequentEventAttendees(),
  ]);

  return (
    <CreateEventProvider>
      <PageHeader
        title="Events"
        description="Community events — attendance feeds profile timelines and connection signals."
      >
        <CreateEventTrigger />
      </PageHeader>
      <div className="space-y-6 px-8 py-6">
        <CreateEventPanel />
        <FrequentAttendeesCard attendees={frequentAttendees} />
        <ListMeta>{formatCountLabel(events.length, "event")}</ListMeta>
        <EventsTable events={events} />
      </div>
    </CreateEventProvider>
  );
}
