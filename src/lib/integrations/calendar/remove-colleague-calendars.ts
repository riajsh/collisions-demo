import "server-only";

import { isColleagueCalendarId } from "@/lib/integrations/calendar/calendar-list";
import { trimCalendarSyncProgress } from "@/lib/integrations/calendar/trim-backfill-selection";
import {
  loadCalendarSyncCursors,
  parseCalendarAccountMetadata,
} from "@/lib/integrations/calendar/sync-cursors";
import {
  parseCalendarSyncProgress,
  syncProgressHasMore,
} from "@/lib/integrations/calendar/sync-progress";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

function primaryCalendarIds(accountEmail: string): string[] {
  const email = accountEmail.trim().toLowerCase();
  return email === "primary" ? ["primary"] : ["primary", email];
}

export async function removeColleagueCalendarsFromSync(params: {
  orgId: string;
  accountId: string;
}): Promise<{ removedCalendars: number; keptCalendars: string[] }> {
  const supabase = createAdminClient();

  const { data: account, error } = await supabase
    .from("calendar_accounts")
    .select("id, org_id, email, metadata, sync_cursor")
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
  const previousSelected = metadata.selected_calendar_ids ?? primaryCalendarIds(account.email);
  const keptCalendars = previousSelected.filter(
    (calendarId) => !isColleagueCalendarId(calendarId, account.email),
  );
  const nextSelected =
    keptCalendars.length > 0 ? keptCalendars : primaryCalendarIds(account.email);
  const removedCalendars = previousSelected.length - nextSelected.length;

  const syncCursors = loadCalendarSyncCursors(account.metadata, account.sync_cursor);
  for (const calendarId of previousSelected) {
    if (!nextSelected.includes(calendarId)) {
      delete syncCursors[calendarId];
    }
  }

  let progress = parseCalendarSyncProgress(account.metadata);
  if (progress) {
    progress = trimCalendarSyncProgress(progress, nextSelected);
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
    selected_calendar_ids: nextSelected,
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
    throw new Error(
      `Failed to update calendar selection: ${updateError.message}`,
    );
  }

  return { removedCalendars, keptCalendars: nextSelected };
}
