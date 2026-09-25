import "server-only";

import { getOrgId } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export type OwnerDistribution = {
  userId: string;
  fullName: string;
  ownedCount: number;
  primaryCount: number;
};

export type OwnershipSummary = {
  owners: OwnerDistribution[];
  unownedProfileCount: number;
};

export async function getOwnershipSummary(): Promise<OwnershipSummary> {
  const orgId = await getOrgId();
  const supabase = await createClient();

  const [ownersResult, relationshipCountResult, ownedRelationshipsResult] =
    await Promise.all([
      supabase
        .from("relationship_owners")
        .select("user_id, is_primary, users ( full_name )")
        .eq("org_id", orgId),
      supabase
        .from("relationships")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId),
      supabase
        .from("relationship_owners")
        .select("relationship_id")
        .eq("org_id", orgId),
    ]);

  if (ownersResult.error) {
    throw new Error(
      `Failed to load ownership distribution: ${ownersResult.error.message}`,
    );
  }

  if (relationshipCountResult.error) {
    throw new Error(
      `Failed to count relationships: ${relationshipCountResult.error.message}`,
    );
  }

  if (ownedRelationshipsResult.error) {
    throw new Error(
      `Failed to count owned relationships: ${ownedRelationshipsResult.error.message}`,
    );
  }

  const counts = new Map<
    string,
    { fullName: string; ownedCount: number; primaryCount: number }
  >();

  for (const row of ownersResult.data ?? []) {
    const user = row.users as { full_name: string } | null;
    const existing = counts.get(row.user_id);

    if (existing) {
      existing.ownedCount += 1;
      if (row.is_primary) {
        existing.primaryCount += 1;
      }
      continue;
    }

    counts.set(row.user_id, {
      fullName: user?.full_name ?? "Unknown",
      ownedCount: 1,
      primaryCount: row.is_primary ? 1 : 0,
    });
  }

  const owners = [...counts.entries()]
    .map(([userId, stats]) => ({
      userId,
      fullName: stats.fullName,
      ownedCount: stats.ownedCount,
      primaryCount: stats.primaryCount,
    }))
    .sort(
      (a, b) =>
        b.primaryCount - a.primaryCount || b.ownedCount - a.ownedCount,
    );

  const ownedRelationshipIds = new Set(
    (ownedRelationshipsResult.data ?? []).map((row) => row.relationship_id),
  );

  const unownedProfileCount = Math.max(
    (relationshipCountResult.count ?? 0) - ownedRelationshipIds.size,
    0,
  );

  return {
    owners,
    unownedProfileCount,
  };
}
