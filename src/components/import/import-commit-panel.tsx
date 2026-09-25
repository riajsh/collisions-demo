"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  getImportProgressAction,
  prepareCommitAction,
  reopenImportAction,
} from "@/app/(app)/profiles/import/actions";
import type { CommitSummary, ImportDetail } from "@/lib/import/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type EventOption = {
  id: string;
  title: string;
};

type ImportCommitPanelProps = {
  detail: ImportDetail;
  events: EventOption[];
};

type ChunkResponse = {
  ok?: boolean;
  error?: string;
  hasMore?: boolean;
  cancelled?: boolean;
  summary?: CommitSummary;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchImportChunk(importId: string): Promise<ChunkResponse> {
  try {
    const response = await fetch(`/api/profiles/import/${importId}/chunk`, {
      method: "POST",
    });
    const payload = (await response.json()) as ChunkResponse;
    if (!response.ok) {
      return { error: payload.error ?? `Chunk failed (${response.status})` };
    }
    return payload;
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? `Network error — ${error.message}`
          : "Network error while completing this import",
    };
  }
}

function AttachToEventFields({
  events,
  initialEventId,
  initialEventTitle,
}: {
  events: EventOption[];
  initialEventId?: string | null;
  initialEventTitle?: string | null;
}) {
  const [choice, setChoice] = useState(initialEventId ?? "none");

  return (
    <div className="space-y-3 rounded-lg border border-dashed border-border p-4">
      {initialEventId && initialEventTitle ? (
        <p className="text-body text-foreground">
          Already connected to <strong>{initialEventTitle}</strong> from upload.
          Change the selection below to switch it, or leave as is.
        </p>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="import-event-choice">Attach to an event (optional)</Label>
        <Select value={choice} onValueChange={setChoice}>
          <SelectTrigger id="import-event-choice" className="w-full sm:w-80">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No event</SelectItem>
            {events.map((event) => (
              <SelectItem key={event.id} value={event.id}>
                {event.title}
              </SelectItem>
            ))}
            <SelectItem value="new">+ Create new event</SelectItem>
          </SelectContent>
        </Select>
        <input
          type="hidden"
          name="eventId"
          value={choice === "none" || choice === "new" ? "" : choice}
        />
      </div>

      {choice === "new" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="new-event-title">Event name</Label>
            <Input id="new-event-title" name="newEventTitle" placeholder="e.g. Risk-Reward Equation breakfast" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-event-date">Event date</Label>
            <Input id="new-event-date" name="newEventDate" type="date" />
          </div>
        </div>
      ) : null}

      <p className="text-caption text-muted-foreground">
        Everyone in this file will be linked as an attendee of this event and tagged with its name.
      </p>
    </div>
  );
}

function ImportProgressBar({
  importId,
  active,
}: {
  importId: string;
  active: boolean;
}) {
  const [progress, setProgress] = useState<{
    processed: number;
    total: number;
  } | null>(null);

  useEffect(() => {
    if (!active) {
      return;
    }

    let cancelled = false;

    async function poll() {
      const result = await getImportProgressAction(importId);
      if (cancelled || !("progress" in result) || !result.progress) {
        return;
      }
      setProgress({
        processed: result.progress.processedRows,
        total: result.progress.totalRows,
      });
    }

    void poll();
    const interval = window.setInterval(() => void poll(), 2000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [active, importId]);

  if (!active || !progress || progress.total === 0) {
    return null;
  }

  const percent = Math.min(
    100,
    Math.round((progress.processed / progress.total) * 100),
  );

  return (
    <div className="space-y-1">
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-caption text-muted-foreground">
        {progress.processed} of {progress.total} profiles processed ({percent}%)
      </p>
    </div>
  );
}

function CommitSummaryView({ summary }: { summary: CommitSummary }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div>
        <dt className="text-caption text-muted-foreground">Created</dt>
        <dd className="text-subheading font-medium">{summary.created}</dd>
      </div>
      <div>
        <dt className="text-caption text-muted-foreground">Updated</dt>
        <dd className="text-subheading font-medium">{summary.updated}</dd>
      </div>
      <div>
        <dt className="text-caption text-muted-foreground">Skipped</dt>
        <dd className="text-subheading font-medium">{summary.skipped}</dd>
      </div>
      <div>
        <dt className="text-caption text-muted-foreground">Owner warnings</dt>
        <dd className="text-subheading font-medium">{summary.ownerWarnings}</dd>
      </div>
    </dl>
  );
}

export function ImportCommitPanel({ detail, events }: ImportCommitPanelProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isDraining, setIsDraining] = useState(false);
  const drainingRef = useRef(false);

  const runNextChunk = useCallback(async (): Promise<boolean> => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const result = await fetchImportChunk(detail.id);

      if (!result.error) {
        if (result.cancelled) {
          return false;
        }
        return result.hasMore === true;
      }

      if (attempt < 3) {
        await sleep(1000 * (attempt + 1));
        continue;
      }

      setError(result.error);
      return false;
    }

    return false;
  }, [detail.id]);

  const drainCommit = useCallback(async () => {
    if (drainingRef.current) {
      return;
    }
    drainingRef.current = true;
    setIsDraining(true);
    setError(null);

    try {
      let hasMore = true;
      while (hasMore) {
        hasMore = await runNextChunk();
        if (hasMore) {
          await sleep(150);
        }
      }
    } finally {
      drainingRef.current = false;
      setIsDraining(false);
      router.refresh();
    }
  }, [router, runNextChunk]);

  // If this import is sitting mid-completion (e.g. the page was reopened
  // after a tab close or a stall), pick it back up automatically instead
  // of waiting for a manual click.
  useEffect(() => {
    if (detail.status === "processing" && !drainingRef.current) {
      void drainCommit();
    }
    // Only re-check when the import identity or its status changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.id, detail.status]);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setIsPreparing(true);

    try {
      const result = await prepareCommitAction(formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
    } finally {
      setIsPreparing(false);
    }

    await drainCommit();
  }

  async function handleReopen(formData: FormData) {
    setError(null);
    const result = await reopenImportAction(formData);
    if (result?.error) {
      setError(result.error);
    }
  }

  if (detail.status === "complete" && detail.commitSummary) {
    const wroteNothing =
      detail.commitSummary.created === 0 && detail.commitSummary.updated === 0;

    return (
      <div className="space-y-4 rounded-lg border border-border bg-card p-6">
        <div>
          <h2 className="text-heading font-medium text-foreground">
            {wroteNothing ? "Import finished with no changes" : "Import complete"}
          </h2>
          <p className="mt-1 text-body text-muted-foreground">
            {wroteNothing
              ? "Every row was skipped. This usually means the automatic duplicate check didn't finish, or no name column was mapped (map Full name, or map First name + Last name together). Re-upload the file and try again."
              : "Profiles and relationships were saved."}
          </p>
          {detail.eventTitle ? (
            <p className="mt-1 text-body text-muted-foreground">
              Attendees were linked to the event <strong>{detail.eventTitle}</strong>.
            </p>
          ) : null}
        </div>
        <CommitSummaryView summary={detail.commitSummary} />
        {wroteNothing ? (
          <form action={handleReopen}>
            <input type="hidden" name="importId" value={detail.id} />
            <Button type="submit" variant="outline">
              Reopen import to retry
            </Button>
          </form>
        ) : null}
      </div>
    );
  }

  if (detail.status === "processing") {
    return (
      <div className="space-y-2 rounded-lg border border-border bg-card p-6">
        <h2 className="text-heading font-medium text-foreground">
          {isDraining ? "Completing…" : "Paused"}
        </h2>
        <p className="text-body text-muted-foreground">
          {isDraining
            ? "This runs in small automatic steps, so it's safe to leave this tab open — it'll keep going on its own."
            : "This got interrupted partway through. Click below to pick back up from where it left off."}
        </p>
        <ImportProgressBar importId={detail.id} active />
        {!isDraining ? (
          <Button
            type="button"
            onClick={() => {
              void drainCommit();
            }}
          >
            Resume
          </Button>
        ) : null}
        {error ? (
          <p className="text-body text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  if (detail.status === "failed") {
    return (
      <div className="space-y-2 rounded-lg border border-destructive/30 bg-card p-6">
        <h2 className="text-heading font-medium text-destructive">Import failed</h2>
        <p className="text-body text-muted-foreground">
          {detail.metadata.errors?.join(", ") ?? "An error occurred during import."}
        </p>
      </div>
    );
  }

  const dedupNotRun = !detail.metadata.dedup_summary;
  const noCommittableRows =
    Boolean(detail.metadata.dedup_summary) && detail.committableRowCount === 0;
  const hasPendingRows = detail.pendingRowCount > 0;

  let helperText = "Checking for duplicates…";

  if (detail.unresolvedSoftMatches > 0) {
    helperText = `Resolve ${detail.unresolvedSoftMatches} row${
      detail.unresolvedSoftMatches === 1 ? "" : "s"
    } above before completing.`;
  } else if (dedupNotRun) {
    helperText = "Still checking for duplicates — this happens automatically, refresh in a moment.";
  } else if (hasPendingRows) {
    helperText = `${detail.pendingRowCount} row${
      detail.pendingRowCount === 1 ? "" : "s"
    } still pending — try fixing the column mapping above.`;
  } else if (noCommittableRows) {
    helperText =
      "No rows are ready. Check that Full name (or First name + Last name) is mapped, using the \"Fix column mapping\" section above.";
  } else if (detail.canCommit) {
    helperText = `Ready to create or update ${detail.committableRowCount} profile${
      detail.committableRowCount === 1 ? "" : "s"
    }.`;
  }

  const isBusy = isPreparing || isDraining;

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-6">
      <p className="text-body text-muted-foreground">{helperText}</p>

      <form action={handleSubmit} className="space-y-4">
        <input type="hidden" name="importId" value={detail.id} />
        <AttachToEventFields
          events={events}
          initialEventId={detail.eventId}
          initialEventTitle={detail.eventTitle}
        />
        <Button type="submit" disabled={!detail.canCommit || isBusy}>
          {isBusy ? "Completing…" : "Complete import"}
        </Button>
      </form>

      {isBusy ? (
        <>
          <ImportProgressBar importId={detail.id} active={isBusy} />
          <p className="text-caption text-muted-foreground">
            This runs in small automatic steps — safe to leave this tab open,
            even for a large file. It&apos;ll keep going on its own.
          </p>
        </>
      ) : null}

      {error ? (
        <p className="text-body text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
