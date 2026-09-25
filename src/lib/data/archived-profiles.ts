import "server-only";

import { getOrgId, requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export type ArchivedProfileListItem = {
  id: string;
  fullName: string;
  email: string | null;
  organisationName: string | null;
  archivedAt: string | null;
};

/** Profiles with relationship status inactive — closest V1 equivalent to archive. */
export async function listArchivedProfiles(): Promise<ArchivedProfileListItem[]> {
  await requireAdmin();
  const orgId = await getOrgId();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("profiles")
    .select(
      `
      id,
      full_name,
      email,
      organisation_name,
      updated_at,
      relationships!inner (
        status,
        updated_at
      )
    `,
    )
    .eq("org_id", orgId)
    .eq("relationships.status", "inactive")
    .order("full_name");

  if (error) {
    throw new Error(`Failed to load archived profiles: ${error.message}`);
  }

  return (data ?? []).map((row) => {
    const relationship = Array.isArray(row.relationships)
      ? row.relationships[0]
      : row.relationships;

    return {
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      organisationName: row.organisation_name,
      archivedAt: relationship?.updated_at ?? row.updated_at,
    };
  });
}
