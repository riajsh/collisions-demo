import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { backfillCalendarReviewsForProfile } from "@/lib/integrations/calendar/backfill-review";
import { normaliseEmail } from "@/lib/integrations/participant-email";
import type { Database } from "@/types/database";

type AdminClient = SupabaseClient<Database>;

export async function resolveCalendarReviewsForEmail(
  supabase: AdminClient,
  params: {
    orgId: string;
    email: string;
    status: "linked" | "created" | "ignored";
    profileId?: string;
    reviewedByUserId?: string | null;
  },
): Promise<{ reviewCount: number; activitiesCreated: number; profileId: string | null }> {
  const normalisedEmail = normaliseEmail(params.email);

  const { data: pendingReviews, error: pendingError } = await supabase
    .from("calendar_participant_reviews")
    .select("id")
    .eq("org_id", params.orgId)
    .ilike("email", normalisedEmail)
    .eq("status", "pending");

  if (pendingError) {
    throw new Error(`Failed to load pending reviews: ${pendingError.message}`);
  }

  const reviewIds = (pendingReviews ?? []).map((row) => row.id);
  if (reviewIds.length === 0) {
    return {
      reviewCount: 0,
      activitiesCreated: 0,
      profileId: params.profileId ?? null,
    };
  }

  const reviewedAt = new Date().toISOString();

  if (params.status !== "ignored" && params.profileId) {
    const activitiesCreated = await backfillCalendarReviewsForProfile(supabase, {
      orgId: params.orgId,
      profileId: params.profileId,
      reviewIds,
    });

    const { error: updateError } = await supabase
      .from("calendar_participant_reviews")
      .update({
        status: params.status,
        profile_id: params.profileId,
        reviewed_by: params.reviewedByUserId ?? null,
        reviewed_at: reviewedAt,
      })
      .eq("org_id", params.orgId)
      .ilike("email", normalisedEmail)
      .eq("status", "pending");

    if (updateError) {
      throw new Error(`Failed to update review rows: ${updateError.message}`);
    }

    return {
      reviewCount: reviewIds.length,
      activitiesCreated,
      profileId: params.profileId,
    };
  }

  const { error: updateError } = await supabase
    .from("calendar_participant_reviews")
    .update({
      status: params.status,
      profile_id: params.status === "ignored" ? null : params.profileId,
      reviewed_by: params.reviewedByUserId ?? null,
      reviewed_at: reviewedAt,
    })
    .eq("org_id", params.orgId)
    .ilike("email", normalisedEmail)
    .eq("status", "pending");

  if (updateError) {
    throw new Error(`Failed to update review rows: ${updateError.message}`);
  }

  return {
    reviewCount: reviewIds.length,
    activitiesCreated: 0,
    profileId: params.profileId ?? null,
  };
}

export async function deleteCalendarReviewsForEmail(
  supabase: AdminClient,
  params: {
    orgId: string;
    email: string;
  },
): Promise<{ reviewCount: number }> {
  const normalisedEmail = normaliseEmail(params.email);

  const { data, error } = await supabase
    .from("calendar_participant_reviews")
    .delete()
    .eq("org_id", params.orgId)
    .ilike("email", normalisedEmail)
    .eq("status", "pending")
    .select("id");

  if (error) {
    throw new Error(`Failed to delete review rows: ${error.message}`);
  }

  return { reviewCount: data?.length ?? 0 };
}
