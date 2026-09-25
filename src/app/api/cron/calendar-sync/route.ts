import { NextResponse } from "next/server";

import { authoriseCronRequest } from "@/lib/auth/cron";
import { syncAllCalendarAccounts } from "@/lib/integrations/calendar/sync";

export const maxDuration = 300;

export async function GET(request: Request) {
  if (!authoriseCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncAllCalendarAccounts({ maxAccounts: 1 });
    return NextResponse.json(
      {
        ok: true,
        accountsProcessed: result.accountsProcessed,
        stats: result.stats,
        chunksRemaining: result.chunksRemaining,
        warnings:
          result.stats.errors.length > 0 ? result.stats.errors : undefined,
      },
      { status: 200 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Calendar sync failed";
    console.error("Calendar sync cron failed:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
