"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { runEventbriteSyncBurstAction } from "@/app/(app)/admin/eventbrite/actions";
import { Button } from "@/components/ui/button";
import { toastSuccess } from "@/lib/toast";
import { useAsyncAction } from "@/lib/use-async-action";

type EventbriteSyncStats = {
  eventsProcessed: number;
  attendeesFetched: number;
  attendeesSkippedNoEmail: number;
  attendeesMatched: number;
  attendeesQueuedForReview: number;
  attendeesAlreadyHandled: number;
  errors: string[];
};

type ProgressSummary = {
  completed: number;
  total: number;
  currentEventTitle: string | null;
} | null;

function formatProgressLine(progress: ProgressSummary, stats: EventbriteSyncStats): string {
  const eventPart =
    progress && progress.total > 0
      ? `${progress.completed}/${progress.total} events`
      : "Starting…";
  const attendeePart = `${stats.attendeesFetched.toLocaleString()} attendees fetched`;
  const currentPart = progress?.currentEventTitle ? ` · next up: ${progress.currentEventTitle}` : "";
  return `${eventPart} · ${attendeePart}${currentPart}`;
}

function buildFinalMessage(stats: EventbriteSyncStats): string {
  const parts: string[] = [
    `${stats.eventsProcessed} event${stats.eventsProcessed === 1 ? "" : "s"} synced`,
    `${stats.attendeesFetched} fetched from Eventbrite`,
  ];
  if (stats.attendeesMatched > 0) parts.push(`${stats.attendeesMatched} matched`);
  if (stats.attendeesQueuedForReview > 0) parts.push(`${stats.attendeesQueuedForReview} new to review`);
  if (stats.attendeesSkippedNoEmail > 0) {
    parts.push(`${stats.attendeesSkippedNoEmail} skipped (no usable email)`);
  }

  const accountedFor =
    stats.attendeesMatched +
    stats.attendeesQueuedForReview +
    stats.attendeesSkippedNoEmail +
    stats.attendeesAlreadyHandled;
  const mismatch = stats.attendeesFetched - accountedFor;

  return (
    parts.join(", ") +
    (mismatch !== 0 ? ` — ${mismatch} unaccounted for, something's wrong, please flag this` : "")
  );
}

export function EventbriteSyncNowButton() {
  const router = useRouter();
  const { isPending, run } = useAsyncAction();
  const [error, setError] = useState<string | null>(null);
  const [progressLine, setProgressLine] = useState<string | null>(null);

  return (
    <div>
      <Button
        type="button"
        variant="outline"
        disabled={isPending}
        onClick={() => {
          void run(async () => {
            setError(null);
            setProgressLine("Starting…");

            let stats: EventbriteSyncStats = {
              eventsProcessed: 0,
              attendeesFetched: 0,
              attendeesSkippedNoEmail: 0,
              attendeesMatched: 0,
              attendeesQueuedForReview: 0,
              attendeesAlreadyHandled: 0,
              errors: [],
            };

            // Keeps asking for the next bounded burst of events until
            // there's nothing left, rather than trying to sync everything
            // in one request — that's what let a big sync silently get cut
            // off by the server's time limit once enough events were
            // linked. Each burst is small enough to always finish cleanly,
            // so this loop can keep going as long as it needs to.
            for (;;) {
              const result = await runEventbriteSyncBurstAction();
              if (!("success" in result) || !result.success) {
                setError("error" in result ? result.error ?? "Sync failed" : "Sync failed");
                setProgressLine(null);
                return;
              }

              stats = result.stats;
              setProgressLine(formatProgressLine(result.progress, stats));

              if (!result.hasMore) {
                break;
              }
            }

            setProgressLine(null);
            router.refresh();
            if (stats.errors.length > 0) {
              setError(stats.errors.join("; "));
            }
            toastSuccess(buildFinalMessage(stats));
          });
        }}
      >
        {isPending ? "Syncing…" : "Sync now"}
      </Button>
      {progressLine ? (
        <p className="mt-1 text-caption text-muted-foreground">{progressLine}</p>
      ) : null}
      {error ? (
        <p className="mt-1 text-caption text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
