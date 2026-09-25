import "server-only";

import {
  parseCalendarSyncProgress,
  syncProgressHasMore,
  type CalendarSyncProgress,
} from "@/lib/integrations/calendar/sync-progress";
import {
  loadCalendarSyncCursors,
  parseCalendarAccountMetadata,
} from "@/lib/integrations/calendar/sync-cursors";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

export function trimCalendarSyncProgress(
  progress: CalendarSyncProgress,
  selectedCalendarIds: string[],
): CalendarSyncProgress {
  const selected = new Set(selectedCalendarIds);

  return {
    ...progress,
    queue: progress.queue.filter((item) => selected.has(item.id)),
    current:
      progress.current && selected.has(progress.current.id)
        ? progress.current
        : null,
  };
}

export async function updateCalendarBackfillSelection(params: {
  accountId: string;
  orgId: string;
  selectedCalendarIds: string[];
}): Promise<{ skippedCalendars: number }> {
  const uniqueSelected = [
    ...new Set(params.selectedCalendarIds.map((id) => id.trim())),
  ].filter(Boolean);

  const supabase = createAdminClient();
  const { data: account, error } = await supabase
    .from("calendar_accounts")
    .select("id, org_id, metadata, sync_cursor")
    .eq("id", params.accountId)
    .eq("org_id", params.orgId)
    .eq("sync_enabled", true)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load calendar account: ${error.message}`);
  }

  if (!account) {
    throw new Error("Calendar account not found or disabled");
  }

  const metadata = parseCalendarAccountMetadata(account.metadata);
  const previousSelected = new Set(metadata.selected_calendar_ids ?? []);
  const nextSelected = new Set(uniqueSelected);
  const skippedCalendars = [...previousSelected].filter(
    (id) => !nextSelected.has(id),
  ).length;

  const syncCursors = loadCalendarSyncCursors(account.metadata, account.sync_cursor);
  for (const calendarId of previousSelected) {
    if (!nextSelected.has(calendarId)) {
      delete syncCursors[calendarId];
    }
  }

  let progress = parseCalendarSyncProgress(account.metadata);
  if (progress) {
    progress = trimCalendarSyncProgress(progress, uniqueSelected);
    if (
      progress.queue.length === 0 &&
      progress.current === null &&
      progress.status === "running"
    ) {
      progress.status =
        progress.totals.errors.length > 0 ? "failed" : "complete";
    }
    progress.updated_at = new Date().toISOString();
  }

  const hasMore = progress ? syncProgressHasMore(progress) : false;
  const nextMetadata = {
    ...metadata,
    selected_calendar_ids: uniqueSelected,
    sync_cursors: syncCursors,
    sync_progress: progress ?? undefined,
    needs_backfill: hasMore,
    syncing: hasMore,
  };

  const { error: updateError } = await supabase
    .from("calendar_accounts")
    .update({
      metadata: nextMetadata as unknown as Json,
      sync_cursor: Object.values(syncCursors)[0] ?? null,
    })
    .eq("id", account.id)
    .eq("org_id", params.orgId);

  if (updateError) {
    throw new Error(`Failed to update calendar selection: ${updateError.message}`);
  }

  return { skippedCalendars };
}
