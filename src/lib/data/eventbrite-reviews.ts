import "server-only";

import { getOrgId, requireAdmin } from "@/lib/auth/session";
import {
  ensureEventAttendanceEvidence,
  findOrCreateEventTag,
  linkProfileToTag,
} from "@/lib/data/events";
import { normaliseOrganisationName } from "@/lib/normalise/organisation";
import { createClient } from "@/lib/supabase/server";
import type { ResolveEventbriteReviewInput } from "@/lib/validators/eventbrite";

export type EventbriteReviewRow = {
  id: string;
  email: string;
  displayName: string | null;
  ticketType: string | null;
  eventId: string;
  eventTitle: string;
  eventDate: string;
  createdAt: string;
  /** Auto-extracted from mapped registration questions (e.g. a combined
   * "company & role" answer) — offered as an editable starting point,
   * same as the name/email fields, before creating a profile. */
  suggestedRole: string | null;
  suggestedOrganisationName: string | null;
};

export async function listPendingEventbriteReviews(): Promise<EventbriteReviewRow[]> {
  await requireAdmin();
  const orgId = await getOrgId();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("eventbrite_attendee_reviews")
    .select(
      `
      id,
      email,
      display_name,
      ticket_type,
      created_at,
      mapped_fields,
      events (
        id,
        title,
        event_date
      )
    `,
    )
    .eq("org_id", orgId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    throw new Error(`Failed to load Eventbrite review queue: ${error.message}`);
  }

  return (data ?? [])
    .map((row) => {
      const event = row.events;
      if (!event) {
        return null;
      }

      const mapped = (row.mapped_fields ?? {}) as Record<string, string | undefined>;

      return {
        id: row.id,
        email: row.email,
        displayName: row.display_name,
        ticketType: row.ticket_type,
        eventId: event.id,
        eventTitle: event.title,
        eventDate: event.event_date,
        createdAt: row.created_at,
        suggestedRole: mapped.role ?? null,
        suggestedOrganisationName: mapped.organisation_name ?? null,
      };
    })
    .filter((row): row is EventbriteReviewRow => row !== null);
}

/**
 * The actual total, not capped at the 200 the review board's list stops at
 * for rendering. The Admin page's "Review (N)" badge uses this, not the
 * length of listPendingEventbriteReviews' (deliberately truncated) list —
 * otherwise the badge would silently freeze at 200 forever once the real
 * queue passed that size, no matter how much was actually resolved or
 * added underneath, which is exactly what was happening at Jordan's scale.
 */
export async function countPendingEventbriteReviews(): Promise<number> {
  await requireAdmin();
  const orgId = await getOrgId();
  const supabase = await createClient();

  const { count, error } = await supabase
    .from("eventbrite_attendee_reviews")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("status", "pending");

  if (error) {
    throw new Error(`Failed to count Eventbrite review queue: ${error.message}`);
  }

  return count ?? 0;
}

export type EventbriteProfileMatch = {
  id: string;
  fullName: string;
  email: string | null;
};

/** Simple name/email search for linking a review to an existing profile. */
export async function searchProfilesForEventbriteLink(
  query: string,
): Promise<EventbriteProfileMatch[]> {
  await requireAdmin();
  const orgId = await getOrgId();
  const supabase = await createClient();
  const term = query.trim().replace(/[%_]/g, "");

  if (term.length < 2) {
    return [];
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("org_id", orgId)
    .or(`full_name.ilike.%${term}%,email.ilike.%${term}%`)
    .order("full_name")
    .limit(8);

  if (error) {
    throw new Error(`Failed to search profiles: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    fullName: row.full_name,
    email: row.email,
  }));
}

type MappedProfileFields = Partial<
  Record<"role" | "company_size" | "phone" | "organisation_name", string>
> & {
  /** Not a profile column — an open-ended answer mapped to "Note" becomes
   * its own timeline entry once the review turns into a profile, handled
   * separately from the fill/queue-for-review logic below. */
  note?: string;
};

const FIELD_TO_COLUMN: Record<
  Exclude<keyof MappedProfileFields, "note">,
  "occupation" | "company_size" | "phone" | "organisation_name"
> = {
  role: "occupation",
  company_size: "company_size",
  phone: "phone",
  organisation_name: "organisation_name",
};

/** Fills in any blank profile fields from the review's mapped Eventbrite
 * answers (role/company size/phone/company name) — never overwrites
 * something already set, since that's what the profile-update review queue
 * is for. */
async function fillBlankFieldsFromMappedAnswers(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  profileId: string,
  mappedFields: MappedProfileFields | null | undefined,
): Promise<void> {
  if (!mappedFields || Object.keys(mappedFields).length === 0) {
    return;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("occupation, company_size, phone, organisation_name")
    .eq("id", profileId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (!profile) {
    return;
  }

  const profileValues: Record<string, string | null> = {
    occupation: profile.occupation,
    company_size: profile.company_size,
    phone: profile.phone,
    organisation_name: profile.organisation_name,
  };

  const fill: {
    occupation?: string;
    company_size?: string;
    phone?: string;
    organisation_name?: string;
    organisation_name_normalised?: string | null;
  } = {};
  for (const [field, value] of Object.entries(mappedFields) as Array<
    [keyof MappedProfileFields, string]
  >) {
    if (field === "note") {
      // Handled separately once a profile actually exists — see
      // resolveEventbriteReview.
      continue;
    }
    const column = FIELD_TO_COLUMN[field];
    if (!profileValues[column]?.trim() && value) {
      fill[column] = value;
      if (column === "organisation_name") {
        fill.organisation_name_normalised = normaliseOrganisationName(value);
      }
    }
  }

  if (Object.keys(fill).length > 0) {
    await supabase.from("profiles").update(fill).eq("id", profileId).eq("org_id", orgId);
  }
}

async function createProfileFromReview(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  review: { email: string; displayName: string | null; mappedFields?: MappedProfileFields },
): Promise<string> {
  const email = review.email.trim().toLowerCase();

  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("org_id", orgId)
    .ilike("email", email)
    .maybeSingle();

  if (existing) {
    await fillBlankFieldsFromMappedAnswers(supabase, orgId, existing.id, review.mappedFields);
    return existing.id;
  }

  const fullName = review.displayName?.trim() || email;

  const mapped = review.mappedFields ?? {};
  const extraFields: {
    occupation?: string;
    company_size?: string;
    phone?: string;
    organisation_name?: string;
    organisation_name_normalised?: string | null;
  } = {};
  for (const [field, value] of Object.entries(mapped) as Array<
    [keyof MappedProfileFields, string]
  >) {
    if (field === "note") {
      // Handled separately once a profile actually exists — see
      // resolveEventbriteReview.
      continue;
    }
    if (value) {
      extraFields[FIELD_TO_COLUMN[field]] = value;
      if (field === "organisation_name") {
        extraFields.organisation_name_normalised = normaliseOrganisationName(value);
      }
    }
  }

  const { data, error } = await supabase
    .from("profiles")
    .insert({
      org_id: orgId,
      full_name: fullName,
      email,
      organisation_name: null,
      organisation_name_normalised: normaliseOrganisationName(null),
      source: "manual",
      ...extraFields,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      const { data: racedProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("org_id", orgId)
        .ilike("email", email)
        .maybeSingle();
      if (racedProfile) {
        return racedProfile.id;
      }
    }
    throw new Error(`Failed to create profile: ${error.message}`);
  }

  return data.id;
}

export async function resolveEventbriteReview(
  input: ResolveEventbriteReviewInput,
): Promise<void> {
  const user = await requireAdmin();
  const orgId = await getOrgId();
  const supabase = await createClient();

  const { data: review, error: reviewError } = await supabase
    .from("eventbrite_attendee_reviews")
    .select(
      `
      id,
      email,
      display_name,
      status,
      mapped_fields,
      events (
        id,
        title,
        event_date
      )
    `,
    )
    .eq("id", input.reviewId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (reviewError) {
    throw new Error(`Failed to load review: ${reviewError.message}`);
  }
  if (!review) {
    throw new Error("Review not found");
  }
  if (review.status !== "pending") {
    throw new Error("This attendee has already been reviewed");
  }

  const event = review.events;
  if (!event) {
    throw new Error("The linked event no longer exists");
  }

  if (input.action === "ignore") {
    const { error } = await supabase
      .from("eventbrite_attendee_reviews")
      .update({
        status: "ignored",
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", input.reviewId)
      .eq("org_id", orgId);

    if (error) {
      throw new Error(`Failed to update review: ${error.message}`);
    }
    return;
  }

  const mappedFields: MappedProfileFields = {
    ...((review.mapped_fields ?? {}) as MappedProfileFields),
  };
  if (input.role) {
    mappedFields.role = input.role;
  }
  if (input.organisationName) {
    mappedFields.organisation_name = input.organisationName;
  }

  let profileId: string;
  if (input.action === "link" && input.profileId) {
    profileId = input.profileId;
    await fillBlankFieldsFromMappedAnswers(supabase, orgId, profileId, mappedFields);
  } else {
    profileId = await createProfileFromReview(supabase, orgId, {
      email: input.email ?? review.email,
      displayName: input.fullName ?? review.display_name,
      mappedFields,
    });
  }

  const { error: attendeeError } = await supabase.from("event_attendees").upsert(
    {
      org_id: orgId,
      event_id: event.id,
      profile_id: profileId,
      attended: false,
    },
    { onConflict: "event_id,profile_id", ignoreDuplicates: true },
  );

  if (attendeeError) {
    throw new Error(`Failed to add attendee: ${attendeeError.message}`);
  }

  // A "Note" question mapping isn't a profile field to fill in — it's an
  // open-ended answer that becomes its own dated entry on the profile's
  // timeline, tagged to this event. Uses its own source_ref (rather than
  // the plain event id used by attendance evidence below) because
  // activities can only have one row per (org_id, profile_id, source,
  // source_ref) — reusing the event id here would collide with the
  // "attended this event" row. A review only resolves once, but two
  // separate reviews (e.g. a duplicate registration under the same email)
  // can still land on the same profile — 23505 there just means this
  // profile already has this event's note, which is fine, not an error.
  if (mappedFields.note) {
    const { error: noteError } = await supabase.from("activities").insert({
      org_id: orgId,
      profile_id: profileId,
      activity_type: "note",
      title: `Note from ${event.title}`,
      summary: mappedFields.note,
      activity_date: event.event_date,
      source: "event_system",
      source_ref: `${event.id}:note`,
      created_by: user.id,
    });
    if (noteError && noteError.code !== "23505") {
      throw new Error(`Failed to add note: ${noteError.message}`);
    }
  }

  await ensureEventAttendanceEvidence(orgId, event, profileId, user.id);

  const tagResult = await findOrCreateEventTag(supabase, orgId, event.title);
  if (tagResult.tagId) {
    await linkProfileToTag(supabase, orgId, profileId, tagResult.tagId);
  }

  const { error: updateError } = await supabase
    .from("eventbrite_attendee_reviews")
    .update({
      status: input.action === "link" ? "linked" : "created",
      profile_id: profileId,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", input.reviewId)
    .eq("org_id", orgId);

  if (updateError) {
    throw new Error(`Failed to update review: ${updateError.message}`);
  }
}

export type BulkCreateProfilesResult = {
  createdCount: number;
  errors: Array<{ reviewId: string; message: string }>;
};

/**
 * Resolves several pending reviews as "create new profile" in one go, using
 * each one's current (possibly hand-edited) name/email — the "select all" +
 * "create all" bulk action. Runs one at a time rather than in parallel: if
 * two selected reviews share an email (e.g. someone registered for the same
 * event twice), the second one will find the profile the first one just
 * created and reuse it instead of making a duplicate.
 */
export async function bulkCreateProfilesFromReviews(
  items: Array<{
    reviewId: string;
    fullName: string;
    email: string;
    role?: string;
    organisationName?: string;
  }>,
): Promise<BulkCreateProfilesResult> {
  const result: BulkCreateProfilesResult = { createdCount: 0, errors: [] };

  for (const item of items) {
    try {
      await resolveEventbriteReview({
        reviewId: item.reviewId,
        action: "create",
        fullName: item.fullName,
        email: item.email,
        role: item.role,
        organisationName: item.organisationName,
      });
      result.createdCount += 1;
    } catch (error) {
      result.errors.push({
        reviewId: item.reviewId,
        message: error instanceof Error ? error.message : "Failed to create profile",
      });
    }
  }

  return result;
}

export type BulkIgnoreReviewsResult = {
  ignoredCount: number;
  errors: Array<{ reviewId: string; message: string }>;
};

/** Bulk "ignore" companion to bulkCreateProfilesFromReviews — same one-at-a-
 * time approach, used for e.g. clearing out a wave of Eventbrite's "Info
 * Requested" placeholder attendees that got queued before we started
 * filtering them out at sync time. */
export async function bulkIgnoreReviews(
  reviewIds: string[],
): Promise<BulkIgnoreReviewsResult> {
  const result: BulkIgnoreReviewsResult = { ignoredCount: 0, errors: [] };

  for (const reviewId of reviewIds) {
    try {
      await resolveEventbriteReview({
        reviewId,
        action: "ignore",
        fullName: undefined,
        email: undefined,
        role: undefined,
        organisationName: undefined,
      });
      result.ignoredCount += 1;
    } catch (error) {
      result.errors.push({
        reviewId,
        message: error instanceof Error ? error.message : "Failed to ignore",
      });
    }
  }

  return result;
}
