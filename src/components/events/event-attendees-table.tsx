"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  markEventAttendeeAttendedAction,
  removeEventAttendeeAction,
} from "@/app/(app)/events/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useAppDialog } from "@/components/ui/app-dialog-provider";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { EventAttendee } from "@/lib/data/events";
import { isRegularEventAttendee } from "@/lib/event-attendance";
import { toastSuccess } from "@/lib/toast";
import { useAsyncAction } from "@/lib/use-async-action";

type EventAttendeesTableProps = {
  eventId: string;
  attendees: EventAttendee[];
  attendanceCounts: Record<string, number>;
};

function RemoveAttendeeButton({
  eventId,
  attendee,
}: {
  eventId: string;
  attendee: EventAttendee;
}) {
  const router = useRouter();
  const { confirm, alert } = useAppDialog();
  const { isPending, run } = useAsyncAction();
  const [isConfirming, setIsConfirming] = useState(false);

  async function handleRemove() {
    setIsConfirming(true);
    try {
      const confirmed = await confirm({
        title: "Remove attendee",
        description: `Remove ${attendee.fullName} from this event?`,
        confirmLabel: "Remove",
        destructive: true,
      });

      if (!confirmed) {
        return;
      }

      await run(async () => {
        const formData = new FormData();
        formData.set("eventId", eventId);
        formData.set("profileId", attendee.profileId);
        const result = await removeEventAttendeeAction(formData);
        if (result.error) {
          await alert({ title: "Could not remove attendee", description: result.error });
          return;
        }
        toastSuccess("Attendee removed");
        router.refresh();
      });
    } finally {
      setIsConfirming(false);
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={isPending || isConfirming}
      className="text-destructive hover:text-destructive"
      onClick={handleRemove}
    >
      Remove
    </Button>
  );
}

function MarkAttendedButton({
  eventId,
  attendee,
}: {
  eventId: string;
  attendee: EventAttendee;
}) {
  const router = useRouter();
  const { alert } = useAppDialog();
  const { isPending, run } = useAsyncAction();

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={isPending}
      onClick={() => {
        void run(async () => {
          const formData = new FormData();
          formData.set("eventId", eventId);
          formData.set("profileId", attendee.profileId);
          formData.set("attended", attendee.attended ? "false" : "true");
          const result = await markEventAttendeeAttendedAction(formData);
          if (result.error) {
            await alert({
              title: "Could not update attendance",
              description: result.error,
            });
            return;
          }
          toastSuccess(
            attendee.attended ? "Marked as registered" : "Marked as attended",
          );
          router.refresh();
        });
      }}
    >
      {isPending
        ? "Updating…"
        : attendee.attended
          ? "Mark registered"
          : "Mark attended"}
    </Button>
  );
}

export function EventAttendeesTable({
  eventId,
  attendees,
  attendanceCounts,
}: EventAttendeesTableProps) {
  if (attendees.length === 0) {
    return (
      <EmptyState
        variant="dashed"
        title="No attendees yet"
        description="Search for profiles below to record who attended."
      />
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Company</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {attendees.map((attendee) => {
            const eventCount = attendanceCounts[attendee.profileId] ?? 0;
            const isRegular = isRegularEventAttendee(
              attendanceCounts,
              attendee.profileId,
            );

            return (
              <TableRow key={attendee.id}>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/profiles/${attendee.profileId}`}
                      className="font-medium text-foreground hover:underline"
                    >
                      {attendee.fullName}
                    </Link>
                    {isRegular ? (
                      <Badge variant="outline">
                        Regular · {eventCount} events
                      </Badge>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {attendee.organisationName ?? "—"}
                </TableCell>
                <TableCell>
                  <Badge variant={attendee.attended ? "default" : "secondary"}>
                    {attendee.attended ? "Attended" : "Registered"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    <MarkAttendedButton eventId={eventId} attendee={attendee} />
                    <RemoveAttendeeButton eventId={eventId} attendee={attendee} />
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
