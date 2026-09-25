"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  linkEventbriteEventAction,
  syncEventbriteEventNowAction,
} from "@/app/(app)/admin/eventbrite/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EventbriteQuestionMappingPanel } from "@/components/admin/eventbrite-question-mapping-panel";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toastSuccess } from "@/lib/toast";
import { useAsyncAction } from "@/lib/use-async-action";

type LinkableEventOption = { id: string; title: string; eventDate: string };

type EventbriteEventMappingRowProps = {
  eventbriteEventId: string;
  name: string;
  startIso: string | null;
  status: string;
  linkedEvent: { id: string; title: string } | null;
  existingEvents: LinkableEventOption[];
};

export function EventbriteEventMappingRow({
  eventbriteEventId,
  name,
  startIso,
  status,
  linkedEvent,
  existingEvents,
}: EventbriteEventMappingRowProps) {
  const router = useRouter();
  const { isPending, run } = useAsyncAction();
  const { isPending: isSyncing, run: runSync } = useAsyncAction();
  const [choice, setChoice] = useState("new");
  const [error, setError] = useState<string | null>(null);

  const formattedDate = startIso
    ? new Date(startIso).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "No date";

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium text-foreground">{name}</p>
          <p className="text-caption text-muted-foreground">
            {formattedDate} · {status}
          </p>
        </div>
        {linkedEvent ? (
          <Badge variant="default">Linked to {linkedEvent.title}</Badge>
        ) : (
          <Badge variant="secondary">Not linked</Badge>
        )}
      </div>

      {linkedEvent ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <EventbriteQuestionMappingPanel linkedEventId={linkedEvent.id} />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isSyncing}
            onClick={() => {
              void runSync(async () => {
                setError(null);
                const result = await syncEventbriteEventNowAction(linkedEvent.id);
                if (result.error) {
                  setError(result.error);
                  return;
                }
                if (!result.result) {
                  setError("Couldn't sync — check the Eventbrite connection.");
                  return;
                }
                const { matched, queued, fetched, skippedNoEmail, alreadyHandled } =
                  result.result;
                const parts: string[] = [`${fetched} fetched from Eventbrite`];
                if (matched > 0) parts.push(`${matched} matched`);
                if (queued > 0) parts.push(`${queued} new to review`);
                if (skippedNoEmail > 0) parts.push(`${skippedNoEmail} skipped (no usable email)`);
                const accountedFor = matched + queued + skippedNoEmail + alreadyHandled;
                const mismatch = fetched - accountedFor;
                toastSuccess(
                  parts.join(", ") +
                    (mismatch !== 0 ? ` — ${mismatch} unaccounted for, something's wrong` : ""),
                );
                router.refresh();
              });
            }}
          >
            {isSyncing ? "Syncing…" : "Sync this event"}
          </Button>
        </div>
      ) : null}

      {!linkedEvent ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Select value={choice} onValueChange={setChoice}>
            <SelectTrigger className="w-full sm:w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="new">
                Create a new Nova Collective event for this
              </SelectItem>
              {existingEvents.map((event) => (
                <SelectItem key={event.id} value={event.id}>
                  Link to: {event.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            disabled={isPending}
            onClick={() => {
              void run(async () => {
                setError(null);
                const formData = new FormData();
                formData.set("eventbriteEventId", eventbriteEventId);
                formData.set("eventbriteTitle", name);
                if (startIso) {
                  formData.set("eventbriteStartIso", startIso);
                }
                formData.set("mode", choice === "new" ? "new" : "existing");
                if (choice !== "new") {
                  formData.set("linkedEventId", choice);
                }
                const result = await linkEventbriteEventAction(formData);
                if (result.error) {
                  setError(result.error);
                  return;
                }
                if (result.syncResult) {
                  const { matched, queued, fetched, skippedNoEmail, alreadyHandled } =
                    result.syncResult;
                  const parts: string[] = [];
                  if (matched > 0) parts.push(`${matched} attendee${matched === 1 ? "" : "s"} added`);
                  if (queued > 0) parts.push(`${queued} queued for review`);
                  if (skippedNoEmail > 0) {
                    parts.push(`${skippedNoEmail} skipped (no usable email)`);
                  }
                  const mismatch = fetched - (matched + queued + skippedNoEmail + alreadyHandled);
                  toastSuccess(
                    (parts.length > 0
                      ? `Event linked — ${parts.join(", ")}`
                      : "Event linked — no attendees yet") +
                      (mismatch !== 0
                        ? ` — ${mismatch} unaccounted for, something's wrong`
                        : ""),
                  );
                } else {
                  toastSuccess("Event linked");
                }
                router.refresh();
              });
            }}
          >
            {isPending ? "Linking…" : "Link"}
          </Button>
        </div>
      ) : null}
      {error ? (
        <p className="mt-2 text-caption text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
