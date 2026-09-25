import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session";
import { runCalendarSyncBurst, DEFAULT_SYNC_BURST_CHUNKS } from "@/lib/integrations/calendar/sync";
import { syncProgressSummary } from "@/lib/integrations/calendar/sync-progress";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let accountId: string | undefined;
  let burst = DEFAULT_SYNC_BURST_CHUNKS;
  try {
    const body = (await request.json()) as { accountId?: string; burst?: number };
    accountId = body.accountId?.trim();
    if (typeof body.burst === "number" && Number.isFinite(body.burst)) {
      burst = Math.min(8, Math.max(1, Math.floor(body.burst)));
    }
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!accountId) {
    return NextResponse.json({ error: "accountId is required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: account, error } = await supabase
    .from("calendar_accounts")
    .select("id, org_id, email, refresh_token, sync_cursor, metadata, last_sync_at")
    .eq("id", accountId)
    .eq("org_id", user.org_id)
    .eq("sync_enabled", true)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!account) {
    return NextResponse.json(
      { error: "Calendar account not found or disabled" },
      { status: 404 },
    );
  }

  try {
    const result = await runCalendarSyncBurst(account, { maxChunks: burst });

    return NextResponse.json({
      ok: true,
      hasMore: result.hasMore,
      progress: result.progress,
      summary: result.progress ? syncProgressSummary(result.progress) : null,
      stats: result.stats,
      failed: result.stats.errors.length > 0 && !result.hasMore,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Calendar sync chunk failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
