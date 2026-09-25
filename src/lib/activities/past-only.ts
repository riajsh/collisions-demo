import type { Database } from "@/types/database";

type ActivitySource = Database["public"]["Enums"]["activity_source"];

/** Overview feed: human-entered and confirmed profile evidence, not auto-synced invites. */
export const OVERVIEW_RECENT_ACTIVITY_SOURCES: ActivitySource[] = [
  "manual",
  "event_system",
  "import",
];

/** ISO timestamp for queries: activities at or before now count as "happened". */
export function pastActivityCutoffIso(): string {
  return new Date().toISOString();
}

export function isPastOrPresentActivityDate(
  activityDate: string | null | undefined,
): boolean {
  if (!activityDate) {
    return false;
  }

  return new Date(activityDate).getTime() <= Date.now();
}
