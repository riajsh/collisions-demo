import "server-only";

import { getOrgId } from "@/lib/auth/session";
import {
  MIN_EVENTS_FOR_REGULAR,
  type AttendeeAttendanceStats,
  type ProfileEventAttendanceCounts,
} from "@/lib/event-attendance";
import { createClient } from "@/lib/supabase/server";

export type FrequentAttendee = {
  profileId: string;
  fullName: string;
  organisationName: string | null;
  eventCount: number;
};

export type { AttendeeAttendanceStats, ProfileEventAttendanceCounts };

async function loadProfileEventAttendanceCounts(): Promise<ProfileEventAttendanceCounts> {
  const orgId = await getOrgId();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("event_attendees")
    .select(
      `
      profile_id,
      profiles!inner (
        id,
        full_name,
        organisation_name
      )
    `,
    )
    .eq("org_id", orgId);

  if (error) {
    throw new Error(`Failed to load event attendance counts: ${error.message}`);
  }

  const counts: ProfileEventAttendanceCounts = new Map();

  for (const row of data ?? []) {
    const profile = row.profiles as {
      id: string;
      full_name: string;
      organisation_name: string | null;
    } | null;

    if (!profile) {
      continue;
    }

    const existing = counts.get(profile.id);
    if (existing) {
      existing.eventCount += 1;
      continue;
    }

    counts.set(profile.id, {
      fullName: profile.full_name,
      organisationName: profile.organisation_name,
      eventCount: 1,
    });
  }

  return counts;
}

export async function getFrequentEventAttendees(
  limit = 8,
): Promise<FrequentAttendee[]> {
  const counts = await loadProfileEventAttendanceCounts();

  return [...counts.entries()]
    .filter(([, stats]) => stats.eventCount >= MIN_EVENTS_FOR_REGULAR)
    .map(([profileId, stats]) => ({
      profileId,
      fullName: stats.fullName,
      organisationName: stats.organisationName,
      eventCount: stats.eventCount,
    }))
    .sort(
      (a, b) =>
        b.eventCount - a.eventCount || a.fullName.localeCompare(b.fullName),
    )
    .slice(0, limit);
}

export async function getProfileEventAttendanceCounts(): Promise<ProfileEventAttendanceCounts> {
  return loadProfileEventAttendanceCounts();
}
