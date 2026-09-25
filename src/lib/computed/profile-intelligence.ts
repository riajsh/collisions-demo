import "server-only";

import { getOrgId } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export type ProfileNetworkIntelPeer = {
  id: string;
  fullName: string;
};

export type ProfileNetworkIntel = {
  sameCompanyName: string | null;
  /** Capped list of other profiles at the same company — real linked
   * records for the accordion to show, not just a count. */
  sameCompanyProfiles: ProfileNetworkIntelPeer[];
  sameCompanyTruncated: boolean;
};

const SAME_COMPANY_LIMIT = 20;

/**
 * Connections and events attended don't need their own queries here — the
 * profile page already loads the full lists via getProfileById
 * (profile.connections, profile.events), so the accordion component reads
 * those directly. This only covers "who else is at this company", which
 * isn't part of the main profile load.
 */
export async function getProfileNetworkIntel(
  profileId: string,
): Promise<ProfileNetworkIntel> {
  const orgId = await getOrgId();
  const supabase = await createClient();

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, organisation_name, organisation_name_normalised")
    .eq("org_id", orgId)
    .eq("id", profileId)
    .maybeSingle();

  if (profileError) {
    throw new Error(`Failed to load profile intel: ${profileError.message}`);
  }

  if (!profile) {
    throw new Error("Profile not found");
  }

  if (!profile.organisation_name_normalised) {
    return {
      sameCompanyName: profile.organisation_name,
      sameCompanyProfiles: [],
      sameCompanyTruncated: false,
    };
  }

  const { data: peers, error: peersError, count } = await supabase
    .from("profiles")
    .select("id, full_name", { count: "exact" })
    .eq("org_id", orgId)
    .eq(
      "organisation_name_normalised",
      profile.organisation_name_normalised,
    )
    .neq("id", profileId)
    .order("full_name", { ascending: true })
    .limit(SAME_COMPANY_LIMIT);

  if (peersError) {
    throw new Error(`Failed to load company peers: ${peersError.message}`);
  }

  return {
    sameCompanyName: profile.organisation_name,
    sameCompanyProfiles: (peers ?? []).map((peer) => ({
      id: peer.id,
      fullName: peer.full_name,
    })),
    sameCompanyTruncated: (count ?? 0) > SAME_COMPANY_LIMIT,
  };
}
