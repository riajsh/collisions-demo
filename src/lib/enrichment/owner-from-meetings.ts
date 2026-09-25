import type { CalendarTeamParticipant } from "@/lib/integrations/calendar/internal-team-participants";

export type OwnerMeetingSuggestion = {
  userId: string;
  meetingCount: number;
};

export function countSoleInternalAttendees(
  teamParticipantsPerMeeting: CalendarTeamParticipant[][],
): Map<string, number> {
  const counts = new Map<string, number>();

  for (const team of teamParticipantsPerMeeting) {
    const withUserId = team.filter(
      (participant): participant is CalendarTeamParticipant & { userId: string } =>
        Boolean(participant.userId),
    );

    if (withUserId.length !== 1) {
      continue;
    }

    const userId = withUserId[0]!.userId;
    counts.set(userId, (counts.get(userId) ?? 0) + 1);
  }

  return counts;
}

export function pickSoleAttendeeOwner(
  counts: Map<string, number>,
): OwnerMeetingSuggestion | null {
  const ranked = [...counts.entries()]
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);

  if (ranked.length === 0) {
    return null;
  }

  const [topUserId, topCount] = ranked[0]!;
  const secondCount = ranked[1]?.[1] ?? 0;

  if (topCount === secondCount) {
    return null;
  }

  return { userId: topUserId, meetingCount: topCount };
}
