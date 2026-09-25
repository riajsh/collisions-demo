import "server-only";

import { loadOwnedProfileEmails } from "@/lib/integrations/calendar/review-utils";
import {
  isPersonalEmailDomain,
  normaliseEmail,
} from "@/lib/integrations/participant-email";
import { createAdminClient } from "@/lib/supabase/admin";

export type UnownedPersonalProfile = {
  id: string;
  email: string;
  fullName: string;
  source: string | null;
};

export async function listUnownedPersonalEmailProfiles(
  orgId: string,
): Promise<UnownedPersonalProfile[]> {
  const supabase = createAdminClient();

  const [ownedEmails, profilesResult] = await Promise.all([
    loadOwnedProfileEmails(supabase, orgId),
    supabase
      .from("profiles")
      .select("id, email, full_name, source")
      .eq("org_id", orgId)
      .not("email", "is", null),
  ]);

  if (profilesResult.error) {
    throw new Error(`Failed to load profiles: ${profilesResult.error.message}`);
  }

  return (profilesResult.data ?? [])
    .filter((profile) => {
      if (!profile.email) {
        return false;
      }
      const email = normaliseEmail(profile.email);
      return isPersonalEmailDomain(email) && !ownedEmails.has(email);
    })
    .map((profile) => ({
      id: profile.id,
      email: profile.email!,
      fullName: profile.full_name,
      source: profile.source,
    }))
    .sort((left, right) => left.email.localeCompare(right.email));
}

export async function deleteUnownedPersonalEmailProfiles(params: {
  orgId: string;
}): Promise<{
  deletedCount: number;
  deletedEmails: string[];
}> {
  const supabase = createAdminClient();
  const candidates = await listUnownedPersonalEmailProfiles(params.orgId);

  if (candidates.length === 0) {
    return { deletedCount: 0, deletedEmails: [] };
  }

  const ids = candidates.map((profile) => profile.id);
  const { error } = await supabase
    .from("profiles")
    .delete()
    .eq("org_id", params.orgId)
    .in("id", ids);

  if (error) {
    throw new Error(`Failed to delete personal-email profiles: ${error.message}`);
  }

  return {
    deletedCount: candidates.length,
    deletedEmails: candidates.map((profile) => profile.email),
  };
}
