import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  extractInternalTeamParticipants,
  type CalendarTeamParticipant,
} from "@/lib/integrations/calendar/internal-team-participants";
import { formatCalendarSourceLabel } from "@/lib/integrations/calendar/source-label";
import {
  normaliseEmail,
  type OrgParticipantFilters,
} from "@/lib/integrations/participant-email";
import type { Database } from "@/types/database";

export type CalendarMeetingMetadata = {
  calendarSource: string | null;
  teamParticipants: CalendarTeamParticipant[];
};

type CalendarEventMetadataRow = {
  google_event_id: string;
  ical_uid: string | null;
  start_at: string | null;
  source_calendar_id: string | null;
  participants: unknown;
  calendar_accounts: {
    email: string;
    users: { full_name: string } | { full_name: string }[] | null;
  } | {
    email: string;
    users: { full_name: string } | { full_name: string }[] | null;
  }[] | null;
};

const CALENDAR_EVENT_METADATA_SELECT = `
  google_event_id,
  ical_uid,
  start_at,
  source_calendar_id,
  participants,
  calendar_accounts (
    email,
    users (
      full_name
    )
  )
`;

function parseOccurrenceSourceRef(
  sourceRef: string,
): { icalUid: string; startAt: string } | null {
  const separatorIndex = sourceRef.indexOf("#");
  if (separatorIndex <= 0 || separatorIndex === sourceRef.length - 1) {
    return null;
  }

  return {
    icalUid: sourceRef.slice(0, separatorIndex),
    startAt: sourceRef.slice(separatorIndex + 1),
  };
}

function mapCalendarEventMetadata(
  row: CalendarEventMetadataRow,
  filters: OrgParticipantFilters,
  usersByEmail: Map<string, { id: string; fullName: string }>,
): CalendarMeetingMetadata {
  return {
    calendarSource: formatCalendarSourceLabel(row),
    teamParticipants: extractInternalTeamParticipants(
      row.participants,
      filters,
      usersByEmail,
    ),
  };
}

async function loadOrgUsersByEmail(
  supabase: SupabaseClient<Database>,
  orgId: string,
): Promise<Map<string, { id: string; fullName: string }>> {
  const { data, error } = await supabase
    .from("users")
    .select("id, email, full_name")
    .eq("org_id", orgId);

  if (error) {
    throw new Error(`Failed to load org users: ${error.message}`);
  }

  const usersByEmail = new Map<string, { id: string; fullName: string }>();

  for (const user of data ?? []) {
    const email = user.email?.trim();
    if (!email) {
      continue;
    }

    usersByEmail.set(normaliseEmail(email), {
      id: user.id,
      fullName: user.full_name,
    });
  }

  return usersByEmail;
}

export async function resolveCalendarMeetingMetadataForRefs(
  supabase: SupabaseClient<Database>,
  orgId: string,
  sourceRefs: string[],
  participantFilters: OrgParticipantFilters,
): Promise<Map<string, CalendarMeetingMetadata>> {
  const uniqueRefs = [...new Set(sourceRefs.map((ref) => ref.trim()).filter(Boolean))];
  const metadata = new Map<string, CalendarMeetingMetadata>();

  if (uniqueRefs.length === 0) {
    return metadata;
  }

  const usersByEmail = await loadOrgUsersByEmail(supabase, orgId);

  const googleEventIds: string[] = [];
  const occurrenceRefs: Array<{ sourceRef: string; icalUid: string; startAt: string }> =
    [];

  for (const sourceRef of uniqueRefs) {
    const occurrence = parseOccurrenceSourceRef(sourceRef);
    if (occurrence) {
      occurrenceRefs.push({ sourceRef, ...occurrence });
    } else {
      googleEventIds.push(sourceRef);
    }
  }

  if (googleEventIds.length > 0) {
    const { data, error } = await supabase
      .from("calendar_events")
      .select(CALENDAR_EVENT_METADATA_SELECT)
      .eq("org_id", orgId)
      .in("google_event_id", googleEventIds);

    if (error) {
      throw new Error(`Failed to load calendar events: ${error.message}`);
    }

    for (const row of (data ?? []) as CalendarEventMetadataRow[]) {
      metadata.set(
        row.google_event_id,
        mapCalendarEventMetadata(row, participantFilters, usersByEmail),
      );
    }
  }

  if (occurrenceRefs.length > 0) {
    const icalUids = [...new Set(occurrenceRefs.map((entry) => entry.icalUid))];
    const { data, error } = await supabase
      .from("calendar_events")
      .select(CALENDAR_EVENT_METADATA_SELECT)
      .eq("org_id", orgId)
      .in("ical_uid", icalUids);

    if (error) {
      throw new Error(`Failed to load calendar occurrences: ${error.message}`);
    }

    const rowsByOccurrence = new Map<string, CalendarEventMetadataRow>();
    for (const row of (data ?? []) as CalendarEventMetadataRow[]) {
      if (!row.ical_uid || !row.start_at) {
        continue;
      }

      rowsByOccurrence.set(`${row.ical_uid}#${row.start_at}`, row);
    }

    for (const occurrence of occurrenceRefs) {
      const row = rowsByOccurrence.get(occurrence.sourceRef);
      if (!row) {
        continue;
      }

      metadata.set(
        occurrence.sourceRef,
        mapCalendarEventMetadata(row, participantFilters, usersByEmail),
      );
    }
  }

  return metadata;
}
