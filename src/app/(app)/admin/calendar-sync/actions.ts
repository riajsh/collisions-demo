"use server";

import { revalidatePath } from "next/cache";

import { getOrgId, requireAdmin, requireUser } from "@/lib/auth/session";
import { createCalendarParticipantProfile } from "@/lib/integrations/calendar/create-participant-profile";
import {
  isInternalParticipant,
  loadOrgParticipantFilters,
} from "@/lib/integrations/participant-email";
import { assignRelationshipOwner } from "@/lib/data/relationships";
import { normalisePersonName } from "@/lib/normalise/person-name";
import { ignoreSingleMeetingCalendarReviews } from "@/lib/integrations/calendar/ignore-single-meeting-reviews";
import { ignoreUnownedPersonalEmailReviews } from "@/lib/integrations/calendar/ignore-unowned-personal-reviews";
import { deleteUnownedPersonalEmailProfiles, listUnownedPersonalEmailProfiles } from "@/lib/integrations/calendar/purge-unowned-personal-profiles";
import { removeColleagueCalendarsFromSync } from "@/lib/integrations/calendar/remove-colleague-calendars";
import {
  deleteCalendarReviewsForEmail,
  resolveCalendarReviewsForEmail,
} from "@/lib/integrations/calendar/resolve-calendar-reviews";
import { createAdminClient } from "@/lib/supabase/admin";

export async function createProfileFromCalendarReviewAction(formData: FormData) {
  await requireAdmin();

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const organisationName = String(formData.get("organisationName") ?? "").trim();
  const occupation = String(formData.get("occupation") ?? "").trim();
  const ownerUserId = String(formData.get("ownerUserId") ?? "").trim();
  const fullName = normalisePersonName(
    displayName || email.split("@")[0]?.replace(/[._]/g, " ") || email,
  );

  if (!email) {
    return { error: "Email is required" };
  }

  const orgId = await getOrgId();
  const filters = await loadOrgParticipantFilters(createAdminClient(), orgId);
  if (isInternalParticipant(email, filters)) {
    return { error: "That address is internal to your organisation" };
  }

  try {
    const user = await requireUser();
    const supabase = createAdminClient();

    const profileId = await createCalendarParticipantProfile(supabase, {
      orgId,
      email,
      fullName,
      organisationName,
      occupation,
    });

    const result = await resolveCalendarReviewsForEmail(supabase, {
      orgId,
      email,
      status: "created",
      profileId,
      reviewedByUserId: user.id,
    });

    if (ownerUserId) {
      await assignRelationshipOwner({
        profileId,
        userId: ownerUserId,
        strength: "warm",
        isPrimary: true,
      });
    }

    revalidatePath("/admin");
    revalidatePath("/admin/calendar-sync/review");
    revalidatePath("/profiles");

    return { success: true as const, ...result };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Failed to create profile",
    };
  }
}

export async function linkCalendarReviewAction(formData: FormData) {
  await requireAdmin();

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const profileId = String(formData.get("profileId") ?? "").trim();

  if (!email || !profileId) {
    return { error: "Email and profile are required" };
  }

  try {
    const user = await requireUser();
    const orgId = await getOrgId();
    const supabase = createAdminClient();

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("org_id", orgId)
      .eq("id", profileId)
      .maybeSingle();

    if (profileError) {
      throw new Error(`Failed to verify profile: ${profileError.message}`);
    }

    if (!profile) {
      return { error: "Profile not found" };
    }

    const result = await resolveCalendarReviewsForEmail(supabase, {
      orgId,
      email,
      status: "linked",
      profileId,
      reviewedByUserId: user.id,
    });

    revalidatePath("/admin");
    revalidatePath("/admin/calendar-sync/review");
    revalidatePath(`/profiles/${profileId}`);

    return { success: true as const, ...result };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to link profile",
    };
  }
}

export async function ignoreCalendarReviewAction(formData: FormData) {
  await requireAdmin();

  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!email) {
    return { error: "Email is required" };
  }

  try {
    const user = await requireUser();
    const orgId = await getOrgId();
    const supabase = createAdminClient();

    const result = await resolveCalendarReviewsForEmail(supabase, {
      orgId,
      email,
      status: "ignored",
      reviewedByUserId: user.id,
    });

    revalidatePath("/admin");
    revalidatePath("/admin/calendar-sync/review");

    return { success: true as const, ...result };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to ignore participant",
    };
  }
}

export async function deleteCalendarReviewAction(formData: FormData) {
  await requireAdmin();

  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!email) {
    return { error: "Email is required" };
  }

  try {
    const orgId = await getOrgId();
    const supabase = createAdminClient();

    const result = await deleteCalendarReviewsForEmail(supabase, {
      orgId,
      email,
    });

    revalidatePath("/admin");
    revalidatePath("/admin/calendar-sync/review");

    return { success: true as const, ...result };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Failed to delete review",
    };
  }
}

export async function ignoreAllInternalCalendarReviewsAction() {
  await requireAdmin();

  try {
    const user = await requireUser();
    const orgId = await getOrgId();
    const supabase = createAdminClient();
    const filters = await loadOrgParticipantFilters(supabase, orgId);

    const { data: pendingReviews, error: pendingError } = await supabase
      .from("calendar_participant_reviews")
      .select("email")
      .eq("org_id", orgId)
      .eq("status", "pending");

    if (pendingError) {
      throw new Error(`Failed to load pending reviews: ${pendingError.message}`);
    }

    const internalEmails = new Set<string>();

    for (const row of pendingReviews ?? []) {
      if (isInternalParticipant(row.email, filters)) {
        internalEmails.add(row.email.toLowerCase());
      }
    }

    let ignoredCount = 0;

    for (const email of internalEmails) {
      const result = await resolveCalendarReviewsForEmail(supabase, {
        orgId,
        email,
        status: "ignored",
        reviewedByUserId: user.id,
      });
      ignoredCount += result.reviewCount;
    }

    revalidatePath("/admin");
    revalidatePath("/admin/calendar-sync/review");

    return { success: true as const, ignoredCount };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Failed to ignore internal participants",
    };
  }
}

export async function clearColleagueCalendarSyncNoiseAction() {
  await requireAdmin();

  try {
    const user = await requireUser();
    const orgId = await getOrgId();
    const supabase = createAdminClient();

    const { data: account, error: accountError } = await supabase
      .from("calendar_accounts")
      .select("id")
      .eq("org_id", orgId)
      .eq("sync_enabled", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (accountError) {
      throw new Error(`Failed to load calendar account: ${accountError.message}`);
    }

    if (!account) {
      return { error: "No connected calendar account" };
    }

    const [calendarResult, reviewResult] = await Promise.all([
      removeColleagueCalendarsFromSync({ orgId, accountId: account.id }),
      ignoreUnownedPersonalEmailReviews({
        orgId,
        reviewedByUserId: user.id,
      }),
    ]);

    revalidatePath("/admin");
    revalidatePath("/admin/calendar-sync/review");

    return {
      success: true as const,
      removedCalendars: calendarResult.removedCalendars,
      keptCalendars: calendarResult.keptCalendars,
      ignoredEmails: reviewResult.ignoredEmails,
      ignoredReviewCount: reviewResult.reviewCount,
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Failed to clear colleague calendar noise",
    };
  }
}

export async function ignoreUnownedPersonalEmailReviewsAction() {
  await requireAdmin();

  try {
    const user = await requireUser();
    const orgId = await getOrgId();

    const result = await ignoreUnownedPersonalEmailReviews({
      orgId,
      reviewedByUserId: user.id,
    });

    revalidatePath("/admin");
    revalidatePath("/admin/calendar-sync/review");

    return { success: true as const, ...result };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Failed to ignore personal email reviews",
    };
  }
}

export async function listUnownedPersonalEmailProfilesAction() {
  await requireAdmin();

  try {
    const orgId = await getOrgId();
    const profiles = await listUnownedPersonalEmailProfiles(orgId);

    return { success: true as const, profiles, count: profiles.length };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Failed to list personal-email profiles",
      profiles: [],
      count: 0,
    };
  }
}

export async function deleteUnownedPersonalEmailProfilesAction() {
  await requireAdmin();

  try {
    const orgId = await getOrgId();
    const result = await deleteUnownedPersonalEmailProfiles({ orgId });

    revalidatePath("/admin");
    revalidatePath("/admin/calendar-sync/review");
    revalidatePath("/profiles");

    return { success: true as const, ...result };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Failed to delete personal-email profiles",
    };
  }
}

export async function ignoreSingleMeetingCalendarReviewsAction() {
  await requireAdmin();

  try {
    const user = await requireUser();
    const orgId = await getOrgId();

    const result = await ignoreSingleMeetingCalendarReviews({
      orgId,
      reviewedByUserId: user.id,
    });

    revalidatePath("/admin");
    revalidatePath("/admin/calendar-sync/review");

    return { success: true as const, ...result };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Failed to ignore single-meeting reviews",
    };
  }
}

export async function searchProfilesForCalendarLinkAction(
  query: string,
  calendarEmail?: string,
) {
  await requireAdmin();

  const { searchProfilesForCalendarLink } = await import(
    "@/lib/data/calendar-sync-review"
  );

  try {
    const result = await searchProfilesForCalendarLink(query, calendarEmail);
    return { success: true as const, ...result };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Search failed",
      profiles: [],
      exactEmailMatch: false,
    };
  }
}
