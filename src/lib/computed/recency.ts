import "server-only";

import { getOrgId } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export async function getLatestActivityByProfile(): Promise<Map<string, string>> {
  const orgId = await getOrgId();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_last_activity_per_profile", {
    p_org_id: orgId,
  });

  if (error) {
    throw new Error(`Failed to load activity recency: ${error.message}`);
  }

  const latest = new Map<string, string>();

  for (const row of data ?? []) {
    latest.set(row.profile_id, row.activity_date);
  }

  return latest;
}

export function resolveLastInteractionAt(
  activityDate: string | null | undefined,
  ownerDates: Array<string | null | undefined>,
): string | null {
  const candidates = [activityDate, ...ownerDates].filter(
    (value): value is string => Boolean(value),
  );

  if (candidates.length === 0) {
    return null;
  }

  return candidates.sort(
    (a, b) => new Date(b).getTime() - new Date(a).getTime(),
  )[0];
}
