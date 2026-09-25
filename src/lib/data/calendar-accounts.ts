import "server-only";

import {
  isCalendarBackfillPending,
  parseCalendarAccountMetadata,
} from "@/lib/integrations/calendar/sync-cursors";
import {
  parseCalendarSyncProgress,
  syncProgressSummary,
} from "@/lib/integrations/calendar/sync-progress";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getOrgId, requireUser } from "@/lib/auth/session";

export type CalendarAccountSummary = {
  id: string;
  email: string;
  syncEnabled: boolean;
  lastSyncAt: string | null;
  syncStatus: string;
  backfillPending: boolean;
  syncing: boolean;
  lastSyncError: string | null;
  selectedCalendarCount: number;
  userId: string;
  userName: string | null;
};

function formatSyncStatus(
  lastSyncAt: string | null,
  metadata: unknown,
  backfillPending: boolean,
  lastSyncError: string | null,
): string {
  if (lastSyncError) {
    return `Last sync failed — ${lastSyncError}`;
  }

  const parsed = parseCalendarAccountMetadata(metadata);
  const progress = parseCalendarSyncProgress(metadata);

  if (parsed.syncing === true && progress) {
    const summary = syncProgressSummary(progress);
    return `Backfill ${summary.percentComplete}% — ${summary.completedCount}/${summary.totalCalendars} calendars`;
  }

  if (parsed.syncing === true) {
    return "Syncing in background…";
  }

  if (backfillPending) {
    return "Backfill pending — choose calendars below";
  }

  if (lastSyncAt) {
    return `Last synced ${new Date(lastSyncAt).toLocaleString()}`;
  }

  return "Never synced";
}

export async function listCalendarAccountsForOrg(): Promise<CalendarAccountSummary[]> {
  const orgId = await getOrgId();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("calendar_accounts")
    .select(
      `
      id,
      email,
      sync_enabled,
      last_sync_at,
      sync_cursor,
      metadata,
      user_id,
      users (
        full_name
      )
    `,
    )
    .eq("org_id", orgId)
    .order("email");

  if (error) {
    throw new Error(`Failed to list calendar accounts: ${error.message}`);
  }

  return (data ?? []).map((row) => {
    const metadata = parseCalendarAccountMetadata(row.metadata);
    const selectedCalendarIds = metadata.selected_calendar_ids ?? [];
    const backfillPending = isCalendarBackfillPending({
      syncEnabled: row.sync_enabled,
      legacySyncCursor: row.sync_cursor,
      metadata: row.metadata,
      calendarIds: selectedCalendarIds,
    });
    const lastSyncError = metadata.last_run?.error ?? null;

    return {
      id: row.id,
      email: row.email,
      syncEnabled: row.sync_enabled,
      lastSyncAt: row.last_sync_at,
      backfillPending,
      syncing: metadata.syncing === true,
      lastSyncError,
      selectedCalendarCount: selectedCalendarIds.length,
      syncStatus: formatSyncStatus(
        row.last_sync_at,
        row.metadata,
        backfillPending,
        lastSyncError,
      ),
      userId: row.user_id,
      userName: row.users?.full_name ?? null,
    };
  });
}

export async function getCurrentUserCalendarAccount(): Promise<CalendarAccountSummary | null> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("calendar_accounts")
    .select("id, email, sync_enabled, last_sync_at, user_id")
    .eq("org_id", user.org_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load calendar account: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return {
    id: data.id,
    email: data.email,
    syncEnabled: data.sync_enabled,
    lastSyncAt: data.last_sync_at,
    backfillPending: false,
    syncing: false,
    lastSyncError: null,
    selectedCalendarCount: 0,
    syncStatus: formatSyncStatus(data.last_sync_at, null, false, null),
    userId: data.user_id,
    userName: user.full_name,
  };
}

export async function getCalendarAccountForSync(accountId: string) {
  const orgId = await getOrgId();
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("calendar_accounts")
    .select("id, org_id, email, refresh_token, sync_cursor, metadata")
    .eq("id", accountId)
    .eq("org_id", orgId)
    .eq("sync_enabled", true)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load calendar account: ${error.message}`);
  }

  return data;
}

export async function disconnectCalendarAccount(accountId: string) {
  const user = await requireUser();
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("calendar_accounts")
    .update({ sync_enabled: false })
    .eq("id", accountId)
    .eq("org_id", user.org_id)
    .eq("user_id", user.id);

  if (error) {
    throw new Error(`Failed to disconnect calendar account: ${error.message}`);
  }
}
