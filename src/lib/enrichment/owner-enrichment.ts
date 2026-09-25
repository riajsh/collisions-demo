import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { pastActivityCutoffIso } from "@/lib/activities/past-only";
import {
  countSoleInternalAttendees,
  pickSoleAttendeeOwner,
} from "@/lib/enrichment/owner-from-meetings";
import { extractInternalTeamParticipants } from "@/lib/integrations/calendar/internal-team-participants";
import type { CalendarParticipant } from "@/lib/integrations/calendar/types";
import { resolveCalendarMeetingMetadataForRefs } from "@/lib/integrations/calendar/resolve-meeting-metadata";
import {
  loadOrgParticipantFilters,
  normaliseEmail,
  type OrgParticipantFilters,
} from "@/lib/integrations/participant-email";
import type { Database } from "@/types/database";

type DbClient = SupabaseClient<Database>;

export type OwnerSuggestion = {
  userId: string;
  fullName: string;
  meetingCount: number;
  reason: string;
};

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

async function loadOrgUsersByEmail(
  supabase: DbClient,
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

function teamParticipantsFromEventParticipants(
  participants: unknown,
  filters: OrgParticipantFilters,
  usersByEmail: Map<string, { id: string; fullName: string }>,
) {
  return extractInternalTeamParticipants(participants, filters, usersByEmail);
}

function resolveOwnerSuggestionFromTeamMeetings(
  teamMeetings: ReturnType<typeof extractInternalTeamParticipants>[],
  usersByEmail: Map<string, { id: string; fullName: string }>,
): OwnerSuggestion | null {
  const pick = pickSoleAttendeeOwner(countSoleInternalAttendees(teamMeetings));
  if (!pick) {
    return null;
  }

  const user = [...usersByEmail.values()].find(
    (entry) => entry.id === pick.userId,
  );
  if (!user) {
    return null;
  }

  return {
    userId: pick.userId,
    fullName: user.fullName,
    meetingCount: pick.meetingCount,
    reason:
      pick.meetingCount === 1
        ? "Sole team attendee in 1 meeting"
        : `Sole team attendee in ${pick.meetingCount} meetings`,
  };
}

async function profileHasOwner(
  supabase: DbClient,
  orgId: string,
  profileId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("relationships")
    .select(
      `
      relationship_owners ( id )
    `,
    )
    .eq("org_id", orgId)
    .eq("profile_id", profileId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to check profile owners: ${error.message}`);
  }

  return (data?.relationship_owners?.length ?? 0) > 0;
}

export async function getOwnerSuggestionForProfile(
  supabase: DbClient,
  orgId: string,
  profileId: string,
): Promise<OwnerSuggestion | null> {
  if (await profileHasOwner(supabase, orgId, profileId)) {
    return null;
  }

  const cutoff = pastActivityCutoffIso();
  const { data, error } = await supabase
    .from("activities")
    .select("source_ref")
    .eq("org_id", orgId)
    .eq("profile_id", profileId)
    .eq("source", "calendar_sync")
    .eq("activity_type", "meeting")
    .lte("activity_date", cutoff);

  if (error) {
    throw new Error(`Failed to load calendar meetings: ${error.message}`);
  }

  const sourceRefs = [
    ...new Set(
      (data ?? [])
        .map((row) => row.source_ref?.trim())
        .filter((ref): ref is string => Boolean(ref)),
    ),
  ];

  if (sourceRefs.length === 0) {
    return null;
  }

  const filters = await loadOrgParticipantFilters(supabase, orgId);
  const usersByEmail = await loadOrgUsersByEmail(supabase, orgId);
  const metadata = await resolveCalendarMeetingMetadataForRefs(
    supabase,
    orgId,
    sourceRefs,
    filters,
  );

  const teamMeetings = sourceRefs.map(
    (ref) => metadata.get(ref)?.teamParticipants ?? [],
  );

  return resolveOwnerSuggestionFromTeamMeetings(teamMeetings, usersByEmail);
}

function teamMeetingsForEmailFromReviews(
  normalisedEmail: string,
  reviews: Array<{
    calendar_events: {
      participants: unknown;
      start_at: string | null;
    } | null;
  }>,
  filters: OrgParticipantFilters,
  usersByEmail: Map<string, { id: string; fullName: string }>,
): ReturnType<typeof extractInternalTeamParticipants>[] {
  const cutoffMs = new Date(pastActivityCutoffIso()).getTime();
  const teamMeetings: ReturnType<typeof extractInternalTeamParticipants>[] = [];

  for (const review of reviews) {
    const event = review.calendar_events;

    if (!event?.start_at || new Date(event.start_at).getTime() > cutoffMs) {
      continue;
    }

    const externalParticipants = parseCalendarParticipants(event.participants);
    const attended = externalParticipants.some(
      (participant) => normaliseEmail(participant.email) === normalisedEmail,
    );

    if (!attended) {
      continue;
    }

    teamMeetings.push(
      teamParticipantsFromEventParticipants(
        event.participants,
        filters,
        usersByEmail,
      ),
    );
  }

  return teamMeetings;
}

export async function getOwnerSuggestionsForEmails(
  supabase: DbClient,
  orgId: string,
  emails: string[],
): Promise<Map<string, OwnerSuggestion | null>> {
  const uniqueEmails = [
    ...new Set(emails.map((email) => normaliseEmail(email))),
  ];
  const suggestions = new Map<string, OwnerSuggestion | null>();
  for (const email of uniqueEmails) {
    suggestions.set(email, null);
  }

  if (uniqueEmails.length === 0) {
    return suggestions;
  }

  const [filters, usersByEmail] = await Promise.all([
    loadOrgParticipantFilters(supabase, orgId),
    loadOrgUsersByEmail(supabase, orgId),
  ]);

  const { data: reviews, error: reviewError } = await supabase
    .from("calendar_participant_reviews")
    .select(
      `
      email,
      calendar_events (
        participants,
        start_at
      )
    `,
    )
    .eq("org_id", orgId)
    .in("email", uniqueEmails)
    .eq("status", "pending");

  if (reviewError) {
    throw new Error(`Failed to load calendar reviews: ${reviewError.message}`);
  }

  const reviewsByEmail = new Map<
    string,
    Array<{
      calendar_events: {
        participants: unknown;
        start_at: string | null;
      } | null;
    }>
  >();

  for (const review of reviews ?? []) {
    const email = review.email?.trim();
    if (!email) {
      continue;
    }

    const group = reviewsByEmail.get(email) ?? [];
    group.push({
      calendar_events: review.calendar_events as {
        participants: unknown;
        start_at: string | null;
      } | null,
    });
    reviewsByEmail.set(email, group);
  }

  for (const email of uniqueEmails) {
    const teamMeetings = teamMeetingsForEmailFromReviews(
      email,
      reviewsByEmail.get(email) ?? [],
      filters,
      usersByEmail,
    );
    suggestions.set(
      email,
      resolveOwnerSuggestionFromTeamMeetings(teamMeetings, usersByEmail),
    );
  }

  return suggestions;
}

export async function getOwnerSuggestionForEmail(
  supabase: DbClient,
  orgId: string,
  email: string,
): Promise<OwnerSuggestion | null> {
  const suggestions = await getOwnerSuggestionsForEmails(supabase, orgId, [
    email,
  ]);
  return suggestions.get(normaliseEmail(email)) ?? null;
}
