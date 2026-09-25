import "server-only";

import { getOrgId, requireAdmin } from "@/lib/auth/session";
import {
  autoResolveEligibleCalendarReviews,
  type AutoResolveCalendarReviewsResult,
} from "@/lib/integrations/calendar/auto-resolve-reviews";
import { loadOrgProfilesByEmail } from "@/lib/integrations/calendar/match";
import { loadOrgParticipantFilters } from "@/lib/integrations/participant-email";
import { createAdminClient } from "@/lib/supabase/admin";

export type { AutoResolveCalendarReviewsResult };

export async function autoResolveNamedCalendarReviews(): Promise<AutoResolveCalendarReviewsResult> {
  await requireAdmin();
  const orgId = await getOrgId();
  const supabase = createAdminClient();
  const participantFilters = await loadOrgParticipantFilters(supabase, orgId);
  const profilesByEmail = await loadOrgProfilesByEmail(supabase, orgId);

  return autoResolveEligibleCalendarReviews(supabase, {
    orgId,
    participantFilters,
    profilesByEmail,
  });
}
