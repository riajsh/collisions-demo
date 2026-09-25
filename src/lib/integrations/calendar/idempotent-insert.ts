import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { calendarActivitySourceRefCandidates } from "@/lib/integrations/calendar/occurrence";
import type { Database } from "@/types/database";

type AdminClient = SupabaseClient<Database>;

export function isPostgresUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "23505"
  );
}

export async function calendarActivityExistsForOccurrence(
  supabase: AdminClient,
  params: {
    orgId: string;
    profileId: string;
    icalUid: string | null | undefined;
    startAt: string | null | undefined;
    googleEventId: string;
  },
): Promise<boolean> {
  const sourceRefs = calendarActivitySourceRefCandidates(
    params.icalUid,
    params.startAt,
    params.googleEventId,
  );

  if (sourceRefs.length === 0) {
    return false;
  }

  const { data, error } = await supabase
    .from("activities")
    .select("id")
    .eq("org_id", params.orgId)
    .eq("profile_id", params.profileId)
    .eq("source", "calendar_sync")
    .in("source_ref", sourceRefs)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to check existing calendar activity: ${error.message}`,
    );
  }

  return Boolean(data);
}
