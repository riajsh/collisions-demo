import { NextResponse } from "next/server";

import { authoriseCronRequest } from "@/lib/auth/cron";
import { enrichStaleProfilesForOrg } from "@/lib/data/profile-attributes";
import { createAdminClient } from "@/lib/supabase/admin";

// Buffer under Vercel's serverless limit, same reasoning as the Eventbrite
// sync cron — leaves room for the in-flight profile's AI call to finish
// cleanly rather than being killed mid-write.
export const maxDuration = 500;

/**
 * Catches profiles that were created or updated some way other than a
 * human editing them in the UI (Eventbrite sync writes directly to the
 * profiles table, bypassing the enrichment hook — see the comment on
 * enrichStaleProfilesForOrg) and tags them. Cheap to run daily: the
 * per-profile hash check means only genuinely new/changed profiles ever
 * trigger a real AI call.
 */
export async function GET(request: Request) {
  if (!authoriseCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createAdminClient();
    const { data: orgs, error } = await supabase.from("organisations").select("id");

    if (error) {
      throw new Error(`Failed to list organisations: ${error.message}`);
    }

    const results = [];
    for (const org of orgs ?? []) {
      const stats = await enrichStaleProfilesForOrg(supabase, org.id, {
        maxDurationMs: 450_000,
      });
      results.push({ orgId: org.id, ...stats });
    }

    return NextResponse.json({ ok: true, results }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Profile attribute enrichment failed";
    console.error("Profile attribute enrichment cron failed:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
