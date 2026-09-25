import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createCalendarParticipantProfile } from "@/lib/integrations/calendar/create-participant-profile";
import type { OrgProfileByEmail } from "@/lib/integrations/calendar/match";
import {
  canAutoCreateProfileFromCalendarParticipant,
  parseCalendarDisplayName,
} from "@/lib/integrations/calendar/parse-display-name";
import { resolveCalendarReviewsForEmail } from "@/lib/integrations/calendar/resolve-calendar-reviews";
import {
  isInternalParticipant,
  isNonPersonParticipant,
  normaliseEmail,
  type OrgParticipantFilters,
} from "@/lib/integrations/participant-email";
import type { Database } from "@/types/database";

type AdminClient = SupabaseClient<Database>;

type PendingReviewGroup = {
  email: string;
  displayName: string | null;
  reviewIds: string[];
};

export type AutoResolveCalendarReviewsResult = {
  profilesCreated: number;
  profilesLinked: number;
  reviewsResolved: number;
  activitiesCreated: number;
};

export async function autoResolveEligibleCalendarReviews(
  supabase: AdminClient,
  params: {
    orgId: string;
    participantFilters: OrgParticipantFilters;
    profilesByEmail: OrgProfileByEmail;
  },
): Promise<AutoResolveCalendarReviewsResult> {
  const { data, error } = await supabase
    .from("calendar_participant_reviews")
    .select("id, email, display_name")
    .eq("org_id", params.orgId)
    .eq("status", "pending");

  if (error) {
    throw new Error(`Failed to load pending calendar reviews: ${error.message}`);
  }

  const groups = new Map<string, PendingReviewGroup>();

  for (const row of data ?? []) {
    if (isNonPersonParticipant(row.email)) {
      continue;
    }

    const email = normaliseEmail(row.email);
    if (!email || isInternalParticipant(email, params.participantFilters)) {
      continue;
    }

    const existing = groups.get(email);
    if (existing) {
      existing.reviewIds.push(row.id);
      if (!existing.displayName && row.display_name) {
        existing.displayName = row.display_name;
      }
      continue;
    }

    groups.set(email, {
      email: row.email,
      displayName: row.display_name,
      reviewIds: [row.id],
    });
  }

  let profilesCreated = 0;
  let profilesLinked = 0;
  let reviewsResolved = 0;
  let activitiesCreated = 0;

  for (const group of groups.values()) {
    const email = normaliseEmail(group.email);
    const existingProfile = params.profilesByEmail.get(email);

    if (existingProfile) {
      const result = await resolveCalendarReviewsForEmail(supabase, {
        orgId: params.orgId,
        email,
        status: "linked",
        profileId: existingProfile.id,
        reviewedByUserId: null,
      });

      if (result.reviewCount > 0) {
        profilesLinked += 1;
        reviewsResolved += result.reviewCount;
        activitiesCreated += result.activitiesCreated;
      }

      continue;
    }

    if (!canAutoCreateProfileFromCalendarParticipant(group.email, group.displayName)) {
      continue;
    }

    const parsedName = parseCalendarDisplayName(group.displayName);
    if (!parsedName) {
      continue;
    }

    const profileId = await createCalendarParticipantProfile(supabase, {
      orgId: params.orgId,
      email,
      fullName: parsedName.fullName,
    });

    params.profilesByEmail.set(email, { id: profileId, email });

    const result = await resolveCalendarReviewsForEmail(supabase, {
      orgId: params.orgId,
      email,
      status: "created",
      profileId,
      reviewedByUserId: null,
    });

    profilesCreated += 1;
    reviewsResolved += result.reviewCount;
    activitiesCreated += result.activitiesCreated;
  }

  return {
    profilesCreated,
    profilesLinked,
    reviewsResolved,
    activitiesCreated,
  };
}
