import "server-only";

import { getOrgId, requireUser } from "@/lib/auth/session";
import { isInternalParticipantEmail } from "@/lib/integrations/participant-email";
import { TEAM_MEMBER_TITLES } from "@/config/team-members";
import { createClient } from "@/lib/supabase/server";

export type OrgUser = {
  id: string;
  fullName: string;
  email: string;
  role: string;
};

export type CurrentUserContext = {
  id: string;
  fullName: string;
  email: string;
  role: string;
  jobTitle: string | null;
  profileId: string | null;
  ownedProfileCount: number;
};

export async function listOrgUsers(): Promise<OrgUser[]> {
  const orgId = await getOrgId();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("users")
    .select("id, full_name, email, role")
    .eq("org_id", orgId)
    .order("full_name");

  if (error) {
    throw new Error(`Failed to list org users: ${error.message}`);
  }

  return (data ?? []).map((user) => ({
    id: user.id,
    fullName: user.full_name,
    email: user.email,
    role: user.role,
  }));
}

/** Profile link for nav — skips team/internal emails (those use /me). */
export async function findNavProfileIdForEmail(
  email: string,
): Promise<string | null> {
  if (isInternalParticipantEmail(email)) {
    return null;
  }

  return findProfileIdForEmail(email);
}

export async function findProfileIdForEmail(
  email: string,
): Promise<string | null> {
  const orgId = await getOrgId();
  const supabase = await createClient();
  const normalised = email.trim().toLowerCase();

  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("org_id", orgId)
    .ilike("email", normalised)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to look up profile by email: ${error.message}`);
  }

  return data?.id ?? null;
}

export async function getCurrentUserContext(): Promise<CurrentUserContext> {
  const user = await requireUser();
  const supabase = await createClient();

  const [profileId, ownersResult] = await Promise.all([
    findNavProfileIdForEmail(user.email),
    supabase
      .from("relationship_owners")
      .select("id", { count: "exact", head: true })
      .eq("org_id", user.org_id)
      .eq("user_id", user.id),
  ]);

  if (ownersResult.error) {
    throw new Error(
      `Failed to count owned profiles: ${ownersResult.error.message}`,
    );
  }

  return {
    id: user.id,
    fullName: user.full_name,
    email: user.email,
    role: user.role,
    jobTitle: TEAM_MEMBER_TITLES[user.email.toLowerCase()] ?? null,
    profileId,
    ownedProfileCount: ownersResult.count ?? 0,
  };
}
