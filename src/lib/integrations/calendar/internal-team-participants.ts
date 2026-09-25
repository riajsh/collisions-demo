import "server-only";

import { personInitials } from "@/lib/format/person-initials";
import type { CalendarParticipant } from "@/lib/integrations/calendar/types";
import {
  isInternalParticipant,
  isNonPersonParticipant,
  normaliseEmail,
  type OrgParticipantFilters,
} from "@/lib/integrations/participant-email";

export type CalendarTeamParticipant = {
  initials: string;
  userId: string | null;
  label: string;
};

type OrgUserByEmail = Map<string, { id: string; fullName: string }>;

function parseCalendarParticipants(participants: unknown): CalendarParticipant[] {
  if (!Array.isArray(participants)) {
    return [];
  }

  return participants.flatMap((entry) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }

    const record = entry as Record<string, unknown>;
    const email = typeof record.email === "string" ? record.email.trim() : "";
    if (!email) {
      return [];
    }

    return [
      {
        email,
        name: typeof record.name === "string" ? record.name.trim() || null : null,
        responseStatus:
          typeof record.responseStatus === "string" ? record.responseStatus : null,
        organizer: record.organizer === true,
      },
    ];
  });
}

export function extractInternalTeamParticipants(
  participants: unknown,
  filters: OrgParticipantFilters,
  usersByEmail: OrgUserByEmail,
): CalendarTeamParticipant[] {
  const seen = new Set<string>();
  const team: CalendarTeamParticipant[] = [];

  for (const participant of parseCalendarParticipants(participants)) {
    const email = normaliseEmail(participant.email);
    if (!email || isNonPersonParticipant(email) || !isInternalParticipant(email, filters)) {
      continue;
    }

    if (seen.has(email)) {
      continue;
    }

    seen.add(email);

    const user = usersByEmail.get(email);
    const displayName = participant.name?.trim() || user?.fullName || email;
    const initialsSource = user?.fullName || participant.name?.trim() || email;

    team.push({
      initials: personInitials(initialsSource),
      userId: user?.id ?? null,
      label: displayName,
    });
  }

  return team;
}
