import "server-only";

import {
  getRecencyBand,
  monthsSince,
  type OrbitRing,
  type RecencyBand,
} from "@/config/relationship-thresholds";
import { getOrgId } from "@/lib/auth/session";
import {
  getLatestActivityByProfile,
  resolveLastInteractionAt,
} from "@/lib/computed/recency";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type OwnerStrength = Database["public"]["Enums"]["owner_strength"];

export function assignOrbitRing(
  strength: OwnerStrength | null,
  band: RecencyBand | null,
): OrbitRing {
  if (band === "dormant") {
    return "dormant";
  }

  if (!strength || !band) {
    return "extended";
  }

  if (
    (strength === "inner_circle" || strength === "strong") &&
    band === "active"
  ) {
    return "inner_circle";
  }

  if (
    strength === "warm" ||
    ((strength === "inner_circle" || strength === "strong") &&
      band === "reconnect")
  ) {
    return "active_network";
  }

  if (strength === "weak" && band === "active") {
    return "extended";
  }

  if (band === "reconnect") {
    return "active_network";
  }

  return "extended";
}

export type OrbitNode = {
  profileId: string;
  fullName: string;
  organisationName: string | null;
  ring: OrbitRing;
  primaryOwnerUserId: string | null;
  primaryOwnerName: string | null;
  ownerStrength: OwnerStrength | null;
  lastInteractionAt: string | null;
};

export async function getOrbitNodes(options?: {
  ownerUserId?: string;
  limitPerRing?: number;
}): Promise<Record<OrbitRing, OrbitNode[]>> {
  const orgId = await getOrgId();
  const supabase = await createClient();
  const limitPerRing = options?.limitPerRing ?? 40;

  const [profiles, latestActivity] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        `
        id,
        full_name,
        organisation_name,
        relationships!inner (
          relationship_owners (
            strength,
            is_primary,
            last_interaction_at,
            user_id,
            users (
              full_name
            )
          )
        )
      `,
      )
      .eq("org_id", orgId)
      .range(0, 4_999),
    getLatestActivityByProfile(),
  ]);

  if (profiles.error) {
    throw new Error(`Failed to load orbit nodes: ${profiles.error.message}`);
  }

  const grouped: Record<OrbitRing, OrbitNode[]> = {
    inner_circle: [],
    active_network: [],
    extended: [],
    dormant: [],
  };

  for (const profile of profiles.data ?? []) {
    const owners = profile.relationships?.[0]?.relationship_owners ?? [];
    const primary =
      owners.find((owner) => owner.is_primary) ?? owners[0] ?? null;

    if (options?.ownerUserId && primary?.user_id !== options.ownerUserId) {
      continue;
    }

    const lastInteractionAt = resolveLastInteractionAt(
      latestActivity.get(profile.id),
      owners.map((owner) => owner.last_interaction_at),
    );

    const ring = assignOrbitRing(
      primary?.strength ?? null,
      getRecencyBand(monthsSince(lastInteractionAt)),
    );

    grouped[ring].push({
      profileId: profile.id,
      fullName: profile.full_name,
      organisationName: profile.organisation_name,
      ring,
      primaryOwnerUserId: primary?.user_id ?? null,
      primaryOwnerName: primary?.users?.full_name ?? null,
      ownerStrength: primary?.strength ?? null,
      lastInteractionAt,
    });
  }

  for (const ring of Object.keys(grouped) as OrbitRing[]) {
    grouped[ring] = grouped[ring]
      .sort((a, b) => a.fullName.localeCompare(b.fullName))
      .slice(0, limitPerRing);
  }

  return grouped;
}
