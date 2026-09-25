import "server-only";

export type CalendarSyncCursors = Record<string, string>;

export type CalendarAccountMetadata = {
  syncing?: boolean;
  started_at?: string;
  needs_backfill?: boolean;
  selected_calendar_ids?: string[];
  sync_cursors?: CalendarSyncCursors;
  sync_progress?: import("@/lib/integrations/calendar/sync-progress").CalendarSyncProgress;
  last_run?: {
    at: string;
    stats: unknown;
    error?: string;
    calendars_synced?: number;
  };
};

export function parseCalendarAccountMetadata(
  metadata: unknown,
): CalendarAccountMetadata {
  if (!metadata || typeof metadata !== "object") {
    return {};
  }

  return metadata as CalendarAccountMetadata;
}

/** Merge legacy sync_cursor column with metadata.sync_cursors. */
export function loadCalendarSyncCursors(
  metadata: unknown,
  legacySyncCursor: string | null,
): CalendarSyncCursors {
  const parsed = parseCalendarAccountMetadata(metadata);
  const cursors: CalendarSyncCursors = { ...(parsed.sync_cursors ?? {}) };

  if (legacySyncCursor && !cursors.primary) {
    cursors.primary = legacySyncCursor;
  }

  return cursors;
}

export function isCalendarBackfillPending(params: {
  syncEnabled: boolean;
  legacySyncCursor: string | null;
  metadata: unknown;
  calendarIds: string[];
}): boolean {
  if (!params.syncEnabled) {
    return false;
  }

  const parsed = parseCalendarAccountMetadata(params.metadata);
  const selectedIds = parsed.selected_calendar_ids ?? params.calendarIds;

  if (parsed.needs_backfill) {
    return true;
  }

  const cursors = loadCalendarSyncCursors(params.metadata, params.legacySyncCursor);

  if (selectedIds.length > 0) {
    return selectedIds.some((calendarId) => !cursors[calendarId]);
  }

  return params.legacySyncCursor === null && Object.keys(cursors).length === 0;
}

export function resolvePrimarySyncCursor(
  cursors: CalendarSyncCursors,
  accountEmail: string,
): string | null {
  return cursors.primary ?? cursors[accountEmail.toLowerCase()] ?? null;
}
