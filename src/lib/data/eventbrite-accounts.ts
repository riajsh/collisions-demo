import "server-only";

import { requireAdmin } from "@/lib/auth/session";
import { validateEventbriteToken } from "@/lib/integrations/eventbrite/client";
import { decryptToken, encryptToken } from "@/lib/integrations/google/crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type EventbriteAccountSummary = {
  id: string;
  accountName: string | null;
  accountEmail: string | null;
  syncEnabled: boolean;
  lastSyncAt: string | null;
  connectedByName: string | null;
  syncStatus: string;
  lastSyncError: string | null;
  disabledReason: string | null;
};

type EventbriteAccountMetadata = {
  last_run?: { at?: string; stats?: { errors?: string[] } };
  disabled_reason?: string;
  disabled_at?: string;
};

function parseEventbriteMetadata(value: unknown): EventbriteAccountMetadata {
  if (value && typeof value === "object") {
    return value as EventbriteAccountMetadata;
  }
  return {};
}

function formatEventbriteSyncStatus(params: {
  syncEnabled: boolean;
  lastSyncAt: string | null;
  disabledReason: string | null;
  lastRunErrorCount: number;
}): string {
  if (!params.syncEnabled) {
    return params.disabledReason
      ? `Disconnected — ${params.disabledReason}`
      : "Disconnected";
  }

  const when = params.lastSyncAt ? formatRelativeTime(params.lastSyncAt) : null;

  if (params.lastRunErrorCount > 0) {
    const issueWord = params.lastRunErrorCount === 1 ? "issue" : "issues";
    return when
      ? `Last synced ${when} — ${params.lastRunErrorCount} ${issueWord}`
      : `${params.lastRunErrorCount} ${issueWord} on last sync`;
  }

  return when ? `Last synced ${when}` : "Never synced yet";
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/**
 * Called when a sync run hits a 401/403 from Eventbrite — the token itself
 * has stopped working, so every event would fail the same way from here on.
 * Rather than let that happen silently 40+ times, this switches sync off and
 * records why, so the Admin screen falls back to the "reconnect" form with a
 * clear explanation instead of quietly failing forever.
 */
export async function disableEventbriteSyncAfterAuthFailure(
  orgId: string,
  message: string,
): Promise<void> {
  const supabase = createAdminClient();

  await supabase
    .from("eventbrite_accounts")
    .update({
      sync_enabled: false,
      metadata: {
        disabled_reason: message,
        disabled_at: new Date().toISOString(),
      },
    })
    .eq("org_id", orgId);
}

export async function getEventbriteAccountForOrg(): Promise<EventbriteAccountSummary | null> {
  const user = await requireAdmin();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("eventbrite_accounts")
    .select(
      `
      id,
      account_name,
      account_email,
      sync_enabled,
      last_sync_at,
      metadata,
      users (
        full_name
      )
    `,
    )
    .eq("org_id", user.org_id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load Eventbrite account: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  const metadata = parseEventbriteMetadata(data.metadata);
  const errors = metadata.last_run?.stats?.errors ?? [];
  const lastSyncError = errors.length > 0 ? errors.join("; ") : null;
  const disabledReason = data.sync_enabled ? null : (metadata.disabled_reason ?? null);

  return {
    id: data.id,
    accountName: data.account_name,
    accountEmail: data.account_email,
    syncEnabled: data.sync_enabled,
    lastSyncAt: data.last_sync_at,
    connectedByName: data.users?.full_name ?? null,
    lastSyncError,
    disabledReason,
    syncStatus: formatEventbriteSyncStatus({
      syncEnabled: data.sync_enabled,
      lastSyncAt: data.last_sync_at,
      disabledReason,
      lastRunErrorCount: errors.length,
    }),
  };
}

export async function connectEventbriteAccount(
  token: string,
): Promise<EventbriteAccountSummary> {
  const user = await requireAdmin();
  const supabase = await createClient();

  // Validate against Eventbrite first — don't store a token we haven't confirmed works.
  const identity = await validateEventbriteToken(token);
  const encrypted = encryptToken(token.trim());

  const { data, error } = await supabase
    .from("eventbrite_accounts")
    .upsert(
      {
        org_id: user.org_id,
        connected_by: user.id,
        account_name: identity.name,
        account_email: identity.email,
        access_token: encrypted,
        sync_enabled: true,
      },
      { onConflict: "org_id" },
    )
    .select("id, account_name, account_email, sync_enabled, last_sync_at")
    .single();

  if (error || !data) {
    throw new Error(
      `Failed to save the Eventbrite connection: ${error?.message ?? "unknown error"}`,
    );
  }

  return {
    id: data.id,
    accountName: data.account_name,
    accountEmail: data.account_email,
    syncEnabled: data.sync_enabled,
    lastSyncAt: data.last_sync_at,
    connectedByName: user.full_name,
    lastSyncError: null,
    disabledReason: null,
    syncStatus: formatEventbriteSyncStatus({
      syncEnabled: data.sync_enabled,
      lastSyncAt: data.last_sync_at,
      disabledReason: null,
      lastRunErrorCount: 0,
    }),
  };
}

export async function disconnectEventbriteAccount(): Promise<void> {
  const user = await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("eventbrite_accounts")
    .update({ sync_enabled: false })
    .eq("org_id", user.org_id);

  if (error) {
    throw new Error(`Failed to disconnect Eventbrite: ${error.message}`);
  }
}

/**
 * Reads and decrypts the stored token, scoped by the caller's own RLS
 * session (admin only, per eventbrite_accounts' policies).
 */
export async function getDecryptedEventbriteToken(
  orgId: string,
): Promise<string | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("eventbrite_accounts")
    .select("access_token")
    .eq("org_id", orgId)
    .eq("sync_enabled", true)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load Eventbrite token: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return decryptToken(data.access_token);
}

/**
 * Same as above, but via the admin (service-role) client — for the cron
 * sync job, which has no logged-in user session to rely on RLS with.
 */
export async function getDecryptedEventbriteTokenForSync(
  orgId: string,
): Promise<string | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("eventbrite_accounts")
    .select("access_token")
    .eq("org_id", orgId)
    .eq("sync_enabled", true)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load Eventbrite token: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return decryptToken(data.access_token);
}
