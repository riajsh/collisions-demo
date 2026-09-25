"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  getCalendarSyncProgressAction,
  listSubscribedCalendarsAction,
  runCalendarBackfillAction,
  updateCalendarBackfillSelectionAction,
} from "@/app/(app)/admin/integrations/actions";
import { Button } from "@/components/ui/button";
import { useAppDialog } from "@/components/ui/app-dialog-provider";
import { toastSuccess } from "@/lib/toast";
import { useAsyncAction } from "@/lib/use-async-action";

type CalendarOption = {
  id: string;
  summary: string | null;
  accessRole: string | null;
  kind: string;
  recommended: boolean;
  readable: boolean;
  selected: boolean;
};

type ProgressSummary = {
  totalCalendars: number;
  completedCount: number;
  percentComplete: number;
  currentLabel: string | null;
};

type ChunkResponse = {
  ok?: boolean;
  error?: string;
  hasMore?: boolean;
  summary?: ProgressSummary | null;
  stats?: { eventsProcessed: number; errors: string[] };
  failed?: boolean;
};

type CalendarBackfillPanelProps = {
  accountId: string;
  accountEmail: string;
  lastSyncError?: string | null;
  initialSyncing?: boolean;
};

const KIND_LABELS: Record<string, string> = {
  primary: "Primary",
  room: "Room",
  colleague: "Colleague",
  holiday: "Holiday",
  ignored: "Ignored",
  other: "Other",
};

function formatProgressLine(summary: ProgressSummary, eventsProcessed: number) {
  const calendarPart =
    summary.totalCalendars > 0
      ? `${summary.completedCount}/${summary.totalCalendars} calendars`
      : "Starting…";
  const currentPart = summary.currentLabel
    ? ` · ${summary.currentLabel}`
    : "";
  return `${calendarPart} · ${eventsProcessed.toLocaleString()} events${currentPart}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type SyncQueueState = {
  completedIds: Set<string>;
  currentId: string | null;
  queuedIds: Set<string>;
};

function buildSyncQueueState(progress: {
  completed?: { id: string }[];
  current?: { id: string } | null;
  queue?: { id: string }[];
} | null | undefined): SyncQueueState | null {
  if (!progress) {
    return null;
  }

  return {
    completedIds: new Set((progress.completed ?? []).map((item) => item.id)),
    currentId: progress.current?.id ?? null,
    queuedIds: new Set((progress.queue ?? []).map((item) => item.id)),
  };
}

function calendarSyncStatus(
  calendarId: string,
  queueState: SyncQueueState | null,
): string | null {
  if (!queueState) {
    return null;
  }
  if (queueState.completedIds.has(calendarId)) {
    return "Done";
  }
  if (queueState.currentId === calendarId) {
    return "Syncing now";
  }
  if (queueState.queuedIds.has(calendarId)) {
    return "Queued";
  }
  return null;
}

async function fetchSyncChunk(accountId: string): Promise<ChunkResponse> {
  const response = await fetch("/api/admin/calendar-sync/chunk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId, burst: 8 }),
  });

  const payload = (await response.json()) as ChunkResponse;
  if (!response.ok) {
    return { error: payload.error ?? `Chunk failed (${response.status})` };
  }

  return payload;
}

export function CalendarBackfillPanel({
  accountId,
  accountEmail,
  lastSyncError,
  initialSyncing = false,
}: CalendarBackfillPanelProps) {
  const router = useRouter();
  const { alert } = useAppDialog();
  const { isPending, run } = useAsyncAction();
  const [loaded, setLoaded] = useState(false);
  const [calendars, setCalendars] = useState<CalendarOption[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(initialSyncing);
  const [progressSummary, setProgressSummary] = useState<ProgressSummary | null>(
    null,
  );
  const [eventsProcessed, setEventsProcessed] = useState(0);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [queueState, setQueueState] = useState<SyncQueueState | null>(null);
  const continueRef = useRef(false);
  const [isDraining, setIsDraining] = useState(false);

  const selectedIds = calendars.filter((calendar) => calendar.selected).map((c) => c.id);
  const skippedQueuedCount = calendars.filter(
    (calendar) => queueState?.queuedIds.has(calendar.id) && !calendar.selected,
  ).length;
  const selectionChanged = syncing && loaded && skippedQueuedCount > 0;

  const loadCalendars = useCallback(async () => {
    setLoadError(null);
    const result = await listSubscribedCalendarsAction(accountId);
    if ("error" in result && result.error) {
      setLoadError(result.error);
      return false;
    }
    if (!("success" in result) || !result.calendars) {
      return false;
    }
    setCalendars(result.calendars);
    setLoaded(true);
    return true;
  }, [accountId]);

  const refreshProgress = useCallback(async (): Promise<boolean> => {
    const result = await getCalendarSyncProgressAction(accountId);
    if (!("success" in result) || !result.success) {
      return false;
    }
    if (result.summary) {
      setProgressSummary(result.summary);
    }
    if (result.stats) {
      setEventsProcessed(result.stats.eventsProcessed);
    }
    if (result.progress) {
      setQueueState(buildSyncQueueState(result.progress));
    }
    if (result.syncing) {
      setSyncing(true);
    } else {
      setSyncing(false);
    }
    return result.syncing;
  }, [accountId]);

  const applyChunkResult = useCallback((result: ChunkResponse): boolean => {
    if (result.error) {
      setProgressError(result.error);
      return false;
    }

    if (result.summary) {
      setProgressSummary(result.summary);
    }
    if (result.stats) {
      setEventsProcessed(result.stats.eventsProcessed);
    }
    if (result.stats?.errors.length && result.hasMore) {
      setProgressError(result.stats.errors[result.stats.errors.length - 1] ?? null);
    } else if (!result.error) {
      setProgressError(null);
    }

    return result.hasMore === true;
  }, []);

  const runNextChunk = useCallback(async (): Promise<boolean> => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        const result = await fetchSyncChunk(accountId);
        if (!result.error) {
          return applyChunkResult(result);
        }

        if (attempt < 3) {
          setProgressError(`${result.error} — retrying…`);
          await sleep(1000 * (attempt + 1));
          continue;
        }

        setProgressError(result.error);
        const progress = await getCalendarSyncProgressAction(accountId);
        if ("success" in progress && progress.success && progress.syncing) {
          return true;
        }
        return false;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Network error during sync chunk";
        if (attempt < 3) {
          setProgressError(`${message} — retrying…`);
          await sleep(1000 * (attempt + 1));
          continue;
        }
        setProgressError(message);
        const progress = await getCalendarSyncProgressAction(accountId);
        if ("success" in progress && progress.success && progress.syncing) {
          return true;
        }
        return false;
      }
    }

    return false;
  }, [accountId, applyChunkResult]);

  const finishBackfill = useCallback(
    async (failed: boolean, errors: string[], processed: number) => {
      setSyncing(false);
      router.refresh();

      if (failed) {
        await alert({
          title: "Finished with some errors",
          description: errors.join("\n") || "Unknown error",
        });
        return;
      }

      toastSuccess(
        `Done — ${processed.toLocaleString()} past meetings loaded`,
      );
      router.push("/admin/calendar-sync/review");
    },
    [alert, router],
  );

  const drainBackfill = useCallback(async () => {
    if (continueRef.current) {
      return;
    }
    continueRef.current = true;
    setIsDraining(true);
    setSyncing(true);

    try {
      let hasMore = true;
      while (hasMore) {
        hasMore = await runNextChunk();
        if (hasMore) {
          await sleep(200);
        }
      }

      const progress = await getCalendarSyncProgressAction(accountId);
      if ("success" in progress && progress.success) {
        const failed =
          (progress.stats?.errors.length ?? 0) > 0 && !progress.syncing;
        if (!progress.syncing) {
          await finishBackfill(
            failed,
            progress.stats?.errors ?? [],
            progress.stats?.eventsProcessed ?? eventsProcessed,
          );
        }
      }
    } finally {
      continueRef.current = false;
      setIsDraining(false);
    }
  }, [accountId, eventsProcessed, finishBackfill, runNextChunk]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const stillSyncing = await refreshProgress();
      if (cancelled) {
        return;
      }

      if (initialSyncing || stillSyncing) {
        await loadCalendars();
      }
      if (!cancelled && (initialSyncing || stillSyncing)) {
        await drainBackfill();
      }
    })();

    return () => {
      cancelled = true;
    };
    // Resume once when the panel mounts; server metadata is the source of truth.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  useEffect(() => {
    if (!syncing) {
      return;
    }

    const onVisible = () => {
      if (document.visibilityState === "visible" && !continueRef.current) {
        void drainBackfill();
      }
    };

    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [syncing, drainBackfill]);

  useEffect(() => {
    if (!syncing) {
      return;
    }

    const interval = window.setInterval(() => {
      void refreshProgress();
    }, 2000);

    return () => window.clearInterval(interval);
  }, [syncing, refreshProgress]);

  useEffect(() => {
    if (!syncing || isDraining) {
      return;
    }

    const timer = window.setInterval(() => {
      void drainBackfill();
    }, 5_000);

    return () => window.clearInterval(timer);
  }, [syncing, isDraining, drainBackfill]);

  const showResume = initialSyncing || syncing;

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div>
        <h3 className="text-body font-medium text-foreground">
          Load past meetings for {accountEmail}
        </h3>
        <p className="mt-1 text-caption text-muted-foreground">
          Load your subscribed Google calendars, choose which ones to pull
          from, then load past meetings from Jun 2025 through the next six
          weeks. This loads in stages so it doesn&apos;t time out — progress
          updates below. While it&apos;s running, you can uncheck calendars
          still waiting and click Skip to drop them.
        </p>
        {lastSyncError ? (
          <p className="mt-2 text-caption text-destructive" role="alert">
            {lastSyncError}
          </p>
        ) : null}
      </div>

      {showResume ? (
        <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
          <div className="flex items-center justify-between gap-2 text-caption">
            <span className="font-medium text-foreground">
              {syncing ? "Loading in progress" : "Paused"}
            </span>
            {progressSummary ? (
              <span className="text-muted-foreground">
                {progressSummary.percentComplete}%
              </span>
            ) : null}
          </div>
          {progressSummary ? (
            <>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${progressSummary.percentComplete}%` }}
                />
              </div>
              <p className="text-caption text-muted-foreground">
                {formatProgressLine(progressSummary, eventsProcessed)}
              </p>
            </>
          ) : (
            <p className="text-caption text-muted-foreground">
              Resuming…
            </p>
          )}
          {progressError ? (
            <p className="text-caption text-amber-600 dark:text-amber-400">
              {progressError}
            </p>
          ) : null}
          <p className="text-caption text-muted-foreground">
            Keep this tab open while this loads. If you navigate away, it
            picks back up when you return or on the next hourly sync.
          </p>
          {!isDraining ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={isPending}
              onClick={() => {
                void drainBackfill();
              }}
            >
              {syncing ? "Resume" : "Continue"}
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={isPending || (syncing && isDraining)}
          onClick={() => {
            void run(async () => {
              const ok = await loadCalendars();
              if (!ok) {
                await alert({
                  title: "Could not load calendars",
                  description: loadError ?? "Unknown error",
                });
              }
              if (syncing) {
                await refreshProgress();
              }
            });
          }}
        >
          {loaded ? "Reload calendars" : "Load subscribed calendars"}
        </Button>

        {loaded && syncing ? (
          <Button
            type="button"
            variant="secondary"
            disabled={isPending || isDraining || !selectionChanged}
            onClick={() => {
              void run(async () => {
                const result = await updateCalendarBackfillSelectionAction(
                  accountId,
                  selectedIds,
                );

                if ("error" in result && result.error) {
                  await alert({
                    title: "Could not update selection",
                    description: result.error,
                  });
                  return;
                }
                if (!("success" in result)) {
                  return;
                }

                if (result.summary) {
                  setProgressSummary(result.summary);
                }
                if (result.stats) {
                  setEventsProcessed(result.stats.eventsProcessed);
                }

                await refreshProgress();

                if (!result.syncing) {
                  await finishBackfill(
                    (result.stats?.errors.length ?? 0) > 0,
                    result.stats?.errors ?? [],
                    result.stats?.eventsProcessed ?? eventsProcessed,
                  );
                }
              });
            }}
          >
            {selectionChanged
              ? `Skip ${skippedQueuedCount} queued calendar${skippedQueuedCount === 1 ? "" : "s"}`
              : "Selection up to date"}
          </Button>
        ) : null}

        {loaded && !syncing ? (
          <>
            <Button
              type="button"
              variant="ghost"
              disabled={isPending || syncing}
              onClick={() => {
                setCalendars((current) =>
                  current.map((calendar) => ({
                    ...calendar,
                    selected: calendar.recommended && calendar.readable,
                  })),
                );
              }}
            >
              Select recommended
            </Button>
            <Button
              type="button"
              disabled={isPending || syncing || selectedIds.length === 0}
              onClick={() => {
                void run(async () => {
                  const summaries = Object.fromEntries(
                    calendars.map((calendar) => [
                      calendar.id,
                      calendar.summary ?? calendar.id,
                    ]),
                  );

                  setProgressSummary(null);
                  setEventsProcessed(0);
                  setProgressError(null);
                  setSyncing(true);

                  const result = await runCalendarBackfillAction(
                    accountId,
                    selectedIds,
                    summaries,
                  );

                  if ("error" in result && result.error) {
                    setSyncing(false);
                    await alert({
                      title: "Could not load past meetings",
                      description: result.error,
                    });
                    return;
                  }
                  if (!("success" in result)) {
                    setSyncing(false);
                    return;
                  }

                  if (result.summary) {
                    setProgressSummary(result.summary);
                  }
                  if (result.stats) {
                    setEventsProcessed(result.stats.eventsProcessed);
                  }

                  if (result.hasMore) {
                    await drainBackfill();
                    return;
                  }

                  await finishBackfill(
                    result.failed ?? false,
                    result.stats?.errors ?? [],
                    result.stats?.eventsProcessed ?? 0,
                  );
                });
              }}
            >
              {syncing
                ? "Loading…"
                : `Load past meetings (${selectedIds.length} selected)`}
            </Button>
          </>
        ) : null}
      </div>

      {loadError ? (
        <p className="text-caption text-destructive" role="alert">
          {loadError}
        </p>
      ) : null}

      {loaded ? (
        <ul className="max-h-80 space-y-2 overflow-y-auto rounded-md border border-border p-2">
          {calendars.map((calendar) => {
            const syncStatus = calendarSyncStatus(calendar.id, queueState);
            const isCompleted = queueState?.completedIds.has(calendar.id) ?? false;
            const isCurrent = queueState?.currentId === calendar.id;
            const isQueued = queueState?.queuedIds.has(calendar.id) ?? false;
            const canToggleDuringSync =
              syncing && isQueued && !isCompleted && !isCurrent;
            const checkboxDisabled =
              !calendar.readable ||
              isPending ||
              isCompleted ||
              isCurrent ||
              (syncing && !canToggleDuringSync);

            return (
              <li key={calendar.id}>
                <label
                  className={`flex items-start gap-3 rounded-md px-2 py-1.5 ${
                    checkboxDisabled && !isCompleted && !isCurrent
                      ? "opacity-60"
                      : "cursor-pointer hover:bg-muted/50"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-1 size-4 rounded border"
                    checked={calendar.selected}
                    disabled={checkboxDisabled}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setCalendars((current) =>
                        current.map((item) =>
                          item.id === calendar.id
                            ? { ...item, selected: checked }
                            : item,
                        ),
                      );
                    }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-body text-foreground">
                      {calendar.summary ?? calendar.id}
                    </span>
                    <span className="block text-caption text-muted-foreground">
                      {KIND_LABELS[calendar.kind] ?? calendar.kind}
                      {calendar.recommended ? " · recommended" : ""}
                      {!calendar.readable ? " · free/busy only" : ""}
                      {syncStatus ? ` · ${syncStatus}` : ""}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
