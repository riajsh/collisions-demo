import "server-only";

import { resolveCalendarReviewsForEmail } from "@/lib/integrations/calendar/resolve-calendar-reviews";
import { loadOwnedProfileEmails } from "@/lib/integrations/calendar/review-utils";
import {
  isPersonalEmailDomain,
  normaliseEmail,
} from "@/lib/integrations/participant-email";
import { createAdminClient } from "@/lib/supabase/admin";

export async function ignoreUnownedPersonalEmailReviews(params: {
  orgId: string;
  reviewedByUserId: string | null;
}): Promise<{ ignoredEmails: number; reviewCount: number }> {
  const supabase = createAdminClient();

  const [ownedEmails, pendingResult] = await Promise.all([
    loadOwnedProfileEmails(supabase, params.orgId),
    supabase
      .from("calendar_participant_reviews")
      .select("email")
      .eq("org_id", params.orgId)
      .eq("status", "pending"),
  ]);

  if (pendingResult.error) {
    throw new Error(
      `Failed to load pending reviews: ${pendingResult.error.message}`,
    );
  }

  const emailsToIgnore = new Set<string>();

  for (const row of pendingResult.data ?? []) {
    const email = normaliseEmail(row.email);
    if (!email || !isPersonalEmailDomain(email)) {
      continue;
    }
    if (ownedEmails.has(email)) {
      continue;
    }
    emailsToIgnore.add(email);
  }

  let reviewCount = 0;

  for (const email of emailsToIgnore) {
    const result = await resolveCalendarReviewsForEmail(supabase, {
      orgId: params.orgId,
      email,
      status: "ignored",
      reviewedByUserId: params.reviewedByUserId,
    });
    reviewCount += result.reviewCount;
  }

  return { ignoredEmails: emailsToIgnore.size, reviewCount };
}
