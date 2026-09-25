import { NextResponse } from "next/server";

import { authoriseCronRequest } from "@/lib/auth/cron";
import { syncEventbriteAttendeesForOrg } from "@/lib/integrations/eventbrite/sync";
import { createAdminClient } from "@/lib/supabase/admin";

// Same reasoning as src/app/(app)/admin/layout.tsx — the daily "tier=all"
// catch-all run walks every linked event too, and can hit the same ceiling.
export const maxDuration = 800;

export async function GET(request: Request) {
  if (!authoriseCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const tier = searchParams.get("tier") === "all" ? "all" : "near_term";

  try {
    const supabase = createAdminClient();
    const { data: accounts, error } = await supabase
      .from("eventbrite_accounts")
      .select("org_id")
      .eq("sync_enabled", true);

    if (error) {
      throw new Error(`Failed to list connected orgs: ${error.message}`);
    }

    const results = [];
    for (const account of accounts ?? []) {
      const stats = await syncEventbriteAttendeesForOrg(account.org_id, tier);
      results.push({ orgId: account.org_id, ...stats });
    }

    return NextResponse.json({ ok: true, tier, results }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Eventbrite sync failed";
    console.error("Eventbrite sync cron failed:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
