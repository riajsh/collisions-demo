import "server-only";

import { getOrgId, requireAdmin } from "@/lib/auth/session";
import { normaliseOrganisationName } from "@/lib/normalise/organisation";
import { createClient } from "@/lib/supabase/server";

export type ProposedFieldChange = {
  field: "role" | "company_size" | "phone" | "organisation_name";
  label: string;
  oldValue: string;
  newValue: string;
};

export type ProfileUpdateReviewRow = {
  id: string;
  profileId: string;
  profileName: string;
  eventTitle: string;
  changes: ProposedFieldChange[];
  createdAt: string;
};

const FIELD_LABELS: Record<ProposedFieldChange["field"], string> = {
  role: "Role",
  company_size: "Company size",
  phone: "Phone",
  organisation_name: "Company",
};

export async function listPendingProfileUpdateReviews(): Promise<
  ProfileUpdateReviewRow[]
> {
  await requireAdmin();
  const orgId = await getOrgId();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("eventbrite_profile_update_reviews")
    .select(
      `
      id,
      proposed_changes,
      created_at,
      profiles (
        id,
        full_name
      ),
      events (
        title
      )
    `,
    )
    .eq("org_id", orgId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    throw new Error(`Failed to load profile update reviews: ${error.message}`);
  }

  return (data ?? [])
    .map((row) => {
      const profile = row.profiles;
      const event = row.events;
      if (!profile || !event) {
        return null;
      }

      const changesRaw = (row.proposed_changes ?? {}) as Record<
        string,
        { old: string; new: string }
      >;

      const changes: ProposedFieldChange[] = Object.entries(changesRaw)
        .filter((entry): entry is [ProposedFieldChange["field"], { old: string; new: string }] =>
          entry[0] === "role" ||
          entry[0] === "company_size" ||
          entry[0] === "phone" ||
          entry[0] === "organisation_name",
        )
        .map(([field, value]) => ({
          field,
          label: FIELD_LABELS[field],
          oldValue: value.old,
          newValue: value.new,
        }));

      if (changes.length === 0) {
        return null;
      }

      return {
        id: row.id,
        profileId: profile.id,
        profileName: profile.full_name,
        eventTitle: event.title,
        changes,
        createdAt: row.created_at,
      };
    })
    .filter((row): row is ProfileUpdateReviewRow => row !== null);
}

/**
 * The actual total, not capped at the 200 the review board's list stops at
 * for rendering — see the matching note on countPendingEventbriteReviews.
 */
export async function countPendingProfileUpdateReviews(): Promise<number> {
  await requireAdmin();
  const orgId = await getOrgId();
  const supabase = await createClient();

  const { count, error } = await supabase
    .from("eventbrite_profile_update_reviews")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("status", "pending");

  if (error) {
    throw new Error(`Failed to count profile update reviews: ${error.message}`);
  }

  return count ?? 0;
}

export async function resolveProfileUpdateReview(
  reviewId: string,
  action: "apply" | "ignore",
): Promise<void> {
  const user = await requireAdmin();
  const orgId = await getOrgId();
  const supabase = await createClient();

  const { data: review, error: reviewError } = await supabase
    .from("eventbrite_profile_update_reviews")
    .select("id, profile_id, proposed_changes, status")
    .eq("id", reviewId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (reviewError) {
    throw new Error(`Failed to load review: ${reviewError.message}`);
  }
  if (!review) {
    throw new Error("Review not found");
  }
  if (review.status !== "pending") {
    throw new Error("This update has already been reviewed");
  }

  if (action === "apply") {
    const changes = (review.proposed_changes ?? {}) as Record<
      string,
      { old: string; new: string }
    >;

    const update: {
      occupation?: string;
      company_size?: string;
      phone?: string;
      organisation_name?: string;
      organisation_name_normalised?: string | null;
    } = {};
    for (const [field, value] of Object.entries(changes)) {
      if (field === "role") {
        update.occupation = value.new;
      } else if (field === "company_size") {
        update.company_size = value.new;
      } else if (field === "phone") {
        update.phone = value.new;
      } else if (field === "organisation_name") {
        update.organisation_name = value.new;
        update.organisation_name_normalised = normaliseOrganisationName(value.new);
      }
    }

    if (Object.keys(update).length > 0) {
      const { error: updateError } = await supabase
        .from("profiles")
        .update(update)
        .eq("id", review.profile_id)
        .eq("org_id", orgId);

      if (updateError) {
        throw new Error(`Failed to update profile: ${updateError.message}`);
      }
    }
  }

  const { error: reviewUpdateError } = await supabase
    .from("eventbrite_profile_update_reviews")
    .update({
      status: action === "apply" ? "applied" : "ignored",
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", reviewId)
    .eq("org_id", orgId);

  if (reviewUpdateError) {
    throw new Error(`Failed to update review: ${reviewUpdateError.message}`);
  }
}
