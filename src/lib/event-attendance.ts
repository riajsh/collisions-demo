export const MIN_EVENTS_FOR_REGULAR = 2;

export type AttendeeAttendanceStats = {
  fullName: string;
  organisationName: string | null;
  eventCount: number;
};

export type ProfileEventAttendanceCounts = Map<string, AttendeeAttendanceStats>;

export function isRegularEventAttendee(
  counts: Record<string, number>,
  profileId: string,
): boolean {
  return (counts[profileId] ?? 0) >= MIN_EVENTS_FOR_REGULAR;
}

export function toAttendanceCountRecord(
  counts: ProfileEventAttendanceCounts,
): Record<string, number> {
  return Object.fromEntries(
    [...counts.entries()].map(([profileId, stats]) => [
      profileId,
      stats.eventCount,
    ]),
  );
}
