import "server-only";

import type { CalendarSyncStats } from "@/lib/integrations/calendar/types";

export type CalendarQueueItem = {
  id: string;
  summary: string;
};

export type CalendarSyncProgress = {
  status: "idle" | "running" | "complete" | "failed";
  queue: CalendarQueueItem[];
  completed: CalendarQueueItem[];
  current: (CalendarQueueItem & { page_token: string | null }) | null;
  totals: CalendarSyncStats;
  started_at: string | null;
  updated_at: string | null;
  last_error: string | null;
};

export function emptySyncStats(): CalendarSyncStats {
  return {
    eventsProcessed: 0,
    eventsSkippedDuplicate: 0,
    calendarsSynced: 0,
    activitiesCreated: 0,
    reviewsQueued: 0,
    profilesAutoCreated: 0,
    errors: [],
  };
}

export function parseCalendarSyncProgress(
  metadata: unknown,
): CalendarSyncProgress | null {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const raw = metadata as { sync_progress?: CalendarSyncProgress };
  if (!raw.sync_progress) {
    return null;
  }

  return raw.sync_progress;
}

export function initCalendarSyncProgress(
  queue: CalendarQueueItem[],
): CalendarSyncProgress {
  return {
    status: "running",
    queue,
    completed: [],
    current: null,
    totals: emptySyncStats(),
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_error: null,
  };
}

export function mergeIntoTotals(
  totals: CalendarSyncStats,
  chunk: CalendarSyncStats,
): void {
  totals.eventsProcessed += chunk.eventsProcessed;
  totals.eventsSkippedDuplicate += chunk.eventsSkippedDuplicate;
  totals.calendarsSynced += chunk.calendarsSynced;
  totals.activitiesCreated += chunk.activitiesCreated;
  totals.reviewsQueued += chunk.reviewsQueued;
  totals.profilesAutoCreated += chunk.profilesAutoCreated;
  totals.errors.push(...chunk.errors);
  if (chunk.rateLimited) {
    totals.rateLimited = true;
  }
}

export function syncProgressSummary(progress: CalendarSyncProgress): {
  totalCalendars: number;
  completedCount: number;
  percentComplete: number;
  currentLabel: string | null;
} {
  const totalCalendars =
    progress.completed.length + progress.queue.length + (progress.current ? 1 : 0);
  const completedCount = progress.completed.length;
  const percentComplete =
    totalCalendars > 0 ? Math.round((completedCount / totalCalendars) * 100) : 0;

  return {
    totalCalendars,
    completedCount,
    percentComplete,
    currentLabel: progress.current?.summary ?? null,
  };
}

export function syncProgressHasMore(progress: CalendarSyncProgress): boolean {
  return (
    progress.status === "running" &&
    (progress.queue.length > 0 ||
      progress.current !== null ||
      progress.totals.rateLimited === true)
  );
}
