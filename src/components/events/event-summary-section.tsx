"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { updateEventAction } from "@/app/(app)/events/actions";
import { InferCoAttendanceButton } from "@/components/events/infer-co-attendance-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppDialog } from "@/components/ui/app-dialog-provider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatInteractionDate } from "@/lib/format/date";
import { formatEnumLabel } from "@/lib/format/enum";
import { toastSuccess } from "@/lib/toast";
import { useAsyncAction } from "@/lib/use-async-action";

const EVENT_TYPES = [
  "dinner",
  "roundtable",
  "workshop",
  "retreat",
  "summit",
  "other",
] as const;

function toDateTimeLocalValue(iso: string) {
  const date = new Date(iso);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

type EventSummarySectionProps = {
  eventId: string;
  title: string;
  description: string | null;
  eventType: string;
  eventDate: string;
  location: string | null;
  attendeeCount: number;
};

export function EventSummarySection({
  eventId,
  title,
  description,
  eventType,
  eventDate,
  location,
  attendeeCount,
}: EventSummarySectionProps) {
  const router = useRouter();
  const { alert } = useAppDialog();
  const { isPending, run } = useAsyncAction();
  const [isEditing, setIsEditing] = useState(false);
  const [selectedType, setSelectedType] = useState(eventType);

  if (isEditing) {
    return (
      <form
        action={(formData) => {
          void run(async () => {
            const result = await updateEventAction(formData);
            if (result.error) {
              await alert({ title: "Could not update event", description: result.error });
              return;
            }
            toastSuccess("Event updated");
            setIsEditing(false);
            router.refresh();
          });
        }}
        className="space-y-4 rounded-lg border border-border bg-card p-6"
      >
        <input type="hidden" name="eventId" value={eventId} />
        <input type="hidden" name="eventType" value={selectedType} />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="edit-event-title">Title</Label>
            <Input id="edit-event-title" name="title" required defaultValue={title} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-event-type">Type</Label>
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger id="edit-event-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EVENT_TYPES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {formatEnumLabel(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-event-date">When</Label>
            <Input
              id="edit-event-date"
              name="eventDate"
              type="datetime-local"
              defaultValue={toDateTimeLocalValue(eventDate)}
              required
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="edit-event-location">Location (optional)</Label>
            <Input
              id="edit-event-location"
              name="location"
              defaultValue={location ?? ""}
              placeholder="e.g. London"
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="edit-event-description">Description (optional)</Label>
            <Textarea
              id="edit-event-description"
              name="description"
              rows={3}
              defaultValue={description ?? ""}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={isPending} size="sm">
            {isPending ? "Saving…" : "Save changes"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() => setIsEditing(false)}
          >
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{formatEnumLabel(eventType)}</Badge>
        <span className="text-body text-muted-foreground">
          {formatInteractionDate(eventDate)}
        </span>
        {location ? (
          <span className="text-body text-muted-foreground">· {location}</span>
        ) : null}
        <span className="text-body text-muted-foreground">
          · {attendeeCount} attendee
          {attendeeCount === 1 ? "" : "s"}
        </span>
      </div>
      {description ? (
        <p className="max-w-3xl text-body text-foreground">{description}</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setIsEditing(true)}
        >
          Edit event
        </Button>
        <InferCoAttendanceButton eventId={eventId} attendeeCount={attendeeCount} />
      </div>
    </section>
  );
}
