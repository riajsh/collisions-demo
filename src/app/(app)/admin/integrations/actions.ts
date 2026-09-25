"use server";

import { revalidatePath } from "next/cache";

import { getOrgId, requireAdmin, requireUser } from "@/lib/auth/session";
import {
  disconnectCalendarAccount,
  getCalendarAccountForSync,
} from "@/lib/data/calendar-accounts";
import {
  connectEventbriteAccount,
  disconnectEventbriteAccount,
} from "@/lib/data/eventbrite-accounts";
import { listSubscribedCalendarsForPicker } from "@/lib/integrations/calendar/calendar-list";
import { getCalendarClient } from "@/lib/integrations/calendar/client";
import { formatGoogleCalendarError } from "@/lib/integrations/calendar/google-errors";
import {
  loadCalendarSyncCursors,
  parseCalendarAccountMetadata,
} from "@/lib/integrations/calendar/sync-cursors";
import {
  runCalendarSyncBurst,
  syncAllCalendarAccounts,
  syncCalendarAccount,
} from "@/lib/integrations/calendar/sync";
import { updateCalendarBackfillSelection } from "@/lib/integrations/calendar/trim-backfill-selection";
import {
  parseCalendarSyncProgress,
  syncProgressHasMore,
  syncProgressSummary,
} from "@/lib/integrations/calendar/sync-progress";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

export async function disconnectCalendarAccountAction(accountId: string) {
  await requireUser();

  try {
    await disconnectCalendarAccount(accountId);
    revalidatePath("/admin");
    revalidatePath("/admin/calendar-sync/review");
    return { success: true as const };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Failed to disconnect calendar account",
    };
  }
}

export async function connectEventbriteAccountAction(formData: FormData) {
  await requireAdmin();

  const token = formData.get("token");
  if (typeof token !== "string" || !token.trim()) {
    return { error: "Paste your Eventbrite private token first." };
  }

  try {
    const account = await connectEventbriteAccount(token);
    revalidatePath("/admin");
    return { success: true as const, account };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Failed to connect Eventbrite",
    };
  }
}

export async function disconnectEventbriteAccountAction() {
  await requireAdmin();

  try {
    await disconnectEventbriteAccount();
    revalidatePath("/admin");
    return { success: true as const };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Failed to disconnect Eventbrite",
    };
  }
}

export async function runCalendarSyncAction() {
  await requireAdmin();

  try {
    const orgId = await getOrgId();
    const result = await syncAllCalendarAccounts({ orgId });
    revalidatePath("/admin");
    revalidatePath("/admin/calendar-sync/review");
    return { success: true as const, ...result };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Calendar sync failed",
    };
  }
}

export async function listSubscribedCalendarsAction(accountId: string) {
  await requireAdmin();

  try {
    const account = await getCalendarAccountForSync(accountId);
    if (!account) {
      return { error: "Calendar account not found or disabled" };
    }

    const calendar = getCalendarClient(account);
    const calendars = await listSubscribedCalendarsForPicker(
      calendar,
      account.email,
    );
    const metadata = parseCalendarAccountMetadata(account.metadata);
    const savedSelection = new Set(metadata.selected_calendar_ids ?? []);

    return {
      success: true as const,
      calendars: calendars.map((item) => ({
        ...item,
        selected: savedSelection.size
          ? savedSelection.has(item.id)
          : item.recommended && item.readable,
      })),
    };
  } catch (error) {
    return {
      error: formatGoogleCalendarError(error),
      calendars: [],
    };
  }
}

export async function getCalendarSyncProgressAction(accountId: string) {
  await requireAdmin();

  try {
    const account = await getCalendarAccountForSync(accountId);
    if (!account) {
      return { error: "Calendar account not found or disabled" };
    }

    const metadata = parseCalendarAccountMetadata(account.metadata);
    const progress = parseCalendarSyncProgress(account.metadata);

    return {
      success: true as const,
      syncing: metadata.syncing === true,
      progress,
      summary: progress ? syncProgressSummary(progress) : null,
      stats: progress?.totals ?? null,
    };
  } catch (error) {
    return {
      error: formatGoogleCalendarError(error),
    };
  }
}

export async function runCalendarBackfillContinueAction(accountId: string) {
  await requireAdmin();

  try {
    const account = await getCalendarAccountForSync(accountId);
    if (!account) {
      return { error: "Calendar account not found or disabled" };
    }

    const result = await runCalendarSyncBurst(account);

    revalidatePath("/admin");
    revalidatePath("/admin/calendar-sync/review");

    return {
      success: true as const,
      hasMore: result.hasMore,
      progress: result.progress,
      summary: result.progress ? syncProgressSummary(result.progress) : null,
      stats: result.stats,
      failed: result.stats.errors.length > 0 && !result.hasMore,
    };
  } catch (error) {
    return {
      error: formatGoogleCalendarError(error),
    };
  }
}

export async function updateCalendarBackfillSelectionAction(
  accountId: string,
  calendarIds: string[],
) {
  const user = await requireAdmin();

  const uniqueCalendarIds = [...new Set(calendarIds.map((id) => id.trim()))].filter(
    Boolean,
  );

  try {
    const result = await updateCalendarBackfillSelection({
      accountId,
      orgId: user.org_id,
      selectedCalendarIds: uniqueCalendarIds,
    });

    revalidatePath("/admin");
    revalidatePath("/admin/calendar-sync/review");

    const account = await getCalendarAccountForSync(accountId);
    const progress = account
      ? parseCalendarSyncProgress(account.metadata)
      : null;

    return {
      success: true as const,
      skippedCalendars: result.skippedCalendars,
      syncing: progress ? syncProgressHasMore(progress) : false,
      summary: progress ? syncProgressSummary(progress) : null,
      stats: progress?.totals ?? null,
    };
  } catch (error) {
    return {
      error: formatGoogleCalendarError(error),
    };
  }
}

export async function runCalendarBackfillAction(
  accountId: string,
  calendarIds: string[],
  calendarSummaries?: Record<string, string>,
) {
  await requireAdmin();

  const uniqueCalendarIds = [...new Set(calendarIds.map((id) => id.trim()))].filter(
    Boolean,
  );

  if (uniqueCalendarIds.length === 0) {
    return { error: "Select at least one calendar to load" };
  }

  try {
    const account = await getCalendarAccountForSync(accountId);
    if (!account) {
      return { error: "Calendar account not found or disabled" };
    }

    const metadata = parseCalendarAccountMetadata(account.metadata);
    const syncCursors = loadCalendarSyncCursors(account.metadata, account.sync_cursor);
    for (const calendarId of uniqueCalendarIds) {
      delete syncCursors[calendarId];
    }

    const queueItems = uniqueCalendarIds.map((calendarId) => ({
      id: calendarId,
      summary: calendarSummaries?.[calendarId] ?? calendarId,
    }));

    const supabase = createAdminClient();
    const nextMetadata = {
      ...metadata,
      needs_backfill: true,
      syncing: true,
      selected_calendar_ids: uniqueCalendarIds,
      sync_cursors: syncCursors,
      sync_progress: undefined,
    };

    await supabase
      .from("calendar_accounts")
      .update({
        sync_cursor: null,
        metadata: nextMetadata as unknown as Json,
      })
      .eq("id", account.id)
      .eq("org_id", account.org_id);

    const result = await syncCalendarAccount(
      {
        ...account,
        sync_cursor: null,
        metadata: nextMetadata as unknown as Json,
      },
      {
        selectedCalendarIds: uniqueCalendarIds,
        queueItems,
      },
    );

    revalidatePath("/admin");
    revalidatePath("/admin/calendar-sync/review");

    return {
      success: true as const,
      hasMore: result.hasMore,
      progress: result.progress,
      summary: result.progress ? syncProgressSummary(result.progress) : null,
      stats: result.stats,
      failed: result.stats.errors.length > 0 && !result.hasMore,
    };
  } catch (error) {
    return {
      error: formatGoogleCalendarError(error),
    };
  }
}
