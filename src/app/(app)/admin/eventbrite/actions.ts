"use server";

import { revalidatePath } from "next/cache";

import { getOrgId, requireAdmin } from "@/lib/auth/session";
import {
  createEventFromEventbrite,
  linkEventbriteEventToExisting,
} from "@/lib/data/eventbrite-events";
import type {
  MappableField,
  QuestionMappingList,
} from "@/lib/data/eventbrite-question-mappings";
import {
  listQuestionMappingsForEvent,
  saveQuestionMappings,
} from "@/lib/data/eventbrite-question-mappings";
import {
  bulkCreateProfilesFromReviews,
  bulkIgnoreReviews,
  resolveEventbriteReview,
  searchProfilesForEventbriteLink,
} from "@/lib/data/eventbrite-reviews";
import { resolveProfileUpdateReview } from "@/lib/data/eventbrite-profile-updates";
import {
  runEventbriteSyncBurst,
  syncEventbriteAttendeesForEvent,
} from "@/lib/integrations/eventbrite/sync";
import {
  linkEventbriteEventSchema,
  resolveEventbriteReviewSchema,
} from "@/lib/validators/eventbrite";

function revalidateEventbrite() {
  revalidatePath("/admin");
  revalidatePath("/admin/eventbrite/events");
  revalidatePath("/admin/eventbrite/review");
  revalidatePath("/events");
  revalidatePath("/profiles");
}

export async function linkEventbriteEventAction(formData: FormData) {
  const parsed = linkEventbriteEventSchema.safeParse({
    eventbriteEventId: formData.get("eventbriteEventId"),
    eventbriteTitle: formData.get("eventbriteTitle"),
    eventbriteStartIso: formData.get("eventbriteStartIso") ?? undefined,
    mode: formData.get("mode"),
    linkedEventId: formData.get("linkedEventId") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const orgId = await getOrgId();
  let linkedEventId: string;

  try {
    if (parsed.data.mode === "existing" && parsed.data.linkedEventId) {
      linkedEventId = parsed.data.linkedEventId;
      await linkEventbriteEventToExisting(parsed.data.eventbriteEventId, linkedEventId);
    } else {
      const created = await createEventFromEventbrite(
        parsed.data.eventbriteEventId,
        parsed.data.eventbriteTitle,
        parsed.data.eventbriteStartIso,
      );
      linkedEventId = created.id;
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to link event",
    };
  }

  // Pull in attendees right away rather than making the admin wait for the
  // next cron tick or remember to click "Sync now" — best-effort: the link
  // itself already succeeded above, so a sync hiccup here shouldn't be
  // reported as a failure to link, just skipped silently (the cron will
  // pick it up within 30 minutes regardless).
  let syncResult: {
    matched: number;
    queued: number;
    fetched: number;
    skippedNoEmail: number;
    alreadyHandled: number;
  } | null = null;
  try {
    syncResult = await syncEventbriteAttendeesForEvent(orgId, linkedEventId);
  } catch {
    syncResult = null;
  }

  revalidateEventbrite();
  return { success: true as const, syncResult };
}

/**
 * Runs one bounded burst of the org-wide sync — a handful of events, not
 * necessarily all of them — and reports back whether there's more to do.
 * The "Sync now" button calls this in a loop, showing the running progress
 * each time, until `hasMore` comes back false. Replaces the old approach of
 * trying to sync every linked event inside a single request, which is what
 * let the whole thing get silently killed by the server's time limit once
 * there were enough events linked (see BUILD-LOG).
 */
export async function runEventbriteSyncBurstAction() {
  await requireAdmin();
  const orgId = await getOrgId();

  try {
    const result = await runEventbriteSyncBurst(orgId, "all");
    revalidateEventbrite();
    return { success: true as const, ...result };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Sync failed",
    };
  }
}

/**
 * Re-syncs just one linked event, rather than every Eventbrite event in the
 * org ("Sync now" on the main Admin page does the full-org sync, which gets
 * slower as more events get linked). Useful right after changing a single
 * event's question mapping, when waiting on a full org sync isn't worth it.
 */
export async function syncEventbriteEventNowAction(linkedEventId: string) {
  await requireAdmin();
  const orgId = await getOrgId();

  try {
    const result = await syncEventbriteAttendeesForEvent(orgId, linkedEventId);
    revalidateEventbrite();
    return { success: true as const, result };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Sync failed",
    };
  }
}

export async function resolveEventbriteReviewAction(formData: FormData) {
  const parsed = resolveEventbriteReviewSchema.safeParse({
    reviewId: formData.get("reviewId"),
    action: formData.get("action"),
    profileId: formData.get("profileId") || undefined,
    fullName: formData.get("fullName") || undefined,
    email: formData.get("email") || undefined,
    role: formData.get("role") || undefined,
    organisationName: formData.get("organisationName") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    await resolveEventbriteReview(parsed.data);
    revalidateEventbrite();
    return { success: true as const };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to update review",
    };
  }
}

export async function bulkCreateProfilesFromReviewsAction(
  items: Array<{
    reviewId: string;
    fullName: string;
    email: string;
    role?: string;
    organisationName?: string;
  }>,
  // We're on the /admin/eventbrite/review page while this runs, so each
  // revalidatePath() call forces Next to re-render that page's data and
  // stream it back as part of THIS action's response — worth doing once
  // the whole run finishes, but doing it on every small batch was adding
  // real, avoidable latency to each round trip. The client only passes
  // `true` for the very last batch.
  isFinalBatch = true,
) {
  if (items.length === 0) {
    return { createdCount: 0, errors: [] };
  }

  try {
    const result = await bulkCreateProfilesFromReviews(items);
    if (isFinalBatch) {
      revalidateEventbrite();
    }
    return result;
  } catch (error) {
    return {
      createdCount: 0,
      errors: [
        {
          reviewId: "",
          message: error instanceof Error ? error.message : "Bulk create failed",
        },
      ],
    };
  }
}

export async function bulkIgnoreReviewsAction(
  reviewIds: string[],
  isFinalBatch = true,
) {
  if (reviewIds.length === 0) {
    return { ignoredCount: 0, errors: [] };
  }

  try {
    const result = await bulkIgnoreReviews(reviewIds);
    if (isFinalBatch) {
      revalidateEventbrite();
    }
    return result;
  } catch (error) {
    return {
      ignoredCount: 0,
      errors: [
        {
          reviewId: "",
          message: error instanceof Error ? error.message : "Bulk ignore failed",
        },
      ],
    };
  }
}

export async function loadQuestionMappingsAction(
  linkedEventId: string,
): Promise<{ result?: QuestionMappingList; error?: string }> {
  try {
    const result = await listQuestionMappingsForEvent(linkedEventId);
    return { result };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to load questions",
    };
  }
}

export async function saveQuestionMappingsAction(
  linkedEventId: string,
  mappings: Array<{
    eventbriteQuestionId: string;
    questionText: string;
    targetField: MappableField;
  }>,
) {
  try {
    await saveQuestionMappings(linkedEventId, mappings);
    revalidateEventbrite();
    return { success: true as const };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to save mappings",
    };
  }
}

export async function resolveProfileUpdateReviewAction(formData: FormData) {
  const reviewId = formData.get("reviewId");
  const action = formData.get("action");

  if (typeof reviewId !== "string" || (action !== "apply" && action !== "ignore")) {
    return { error: "Invalid input" };
  }

  try {
    await resolveProfileUpdateReview(reviewId, action);
    revalidateEventbrite();
    return { success: true as const };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to update",
    };
  }
}

export async function searchProfilesForEventbriteLinkAction(query: string) {
  try {
    const results = await searchProfilesForEventbriteLink(query);
    return { results };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Search failed",
      results: [],
    };
  }
}
