import type { ProfileSource } from "@/lib/data/profiles";

const PROFILE_ACTIVITY_LIMIT = 50;

export { PROFILE_ACTIVITY_LIMIT };

export function formatProfileProvenance(sources: ProfileSource[]): string {
  const parts: string[] = [];
  const seenLabels = new Set<string>();
  let meetingCount = 0;

  for (const source of sources) {
    if (source.sourceType === "meeting") {
      meetingCount += 1;
      continue;
    }

    if (!seenLabels.has(source.sourceLabel)) {
      seenLabels.add(source.sourceLabel);
      parts.push(source.sourceLabel);
    }
  }

  if (meetingCount > 0) {
    parts.push(
      `Google Calendar · ${meetingCount} meeting${meetingCount === 1 ? "" : "s"}`,
    );
  }

  return parts.join(" · ");
}
