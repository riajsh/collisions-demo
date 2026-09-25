import "server-only";

import {
  getRecencyBand,
  monthsSince,
  RELATIONSHIP_THRESHOLDS,
} from "@/config/relationship-thresholds";
import { getOrgId } from "@/lib/auth/session";
import {
  getLatestActivityByProfile,
  resolveLastInteractionAt,
} from "@/lib/computed/recency";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type OwnerStrength = Database["public"]["Enums"]["owner_strength"];

export type ReconnectSuggestion = {
  profileId: string;
  fullName: string;
  organisationName: string | null;
  primaryOwnerName: string | null;
  ownerStrength: OwnerStrength;
  lastInteractionAt: string | null;
  monthsSinceInteraction: number;
};

export type IntroduceSuggestion = {
  profileAId: string;
  profileAName: string;
  profileBId: string;
  profileBName: string;
  reason: string;
};

export type EmergingSuggestion = {
  profileId: string;
  fullName: string;
  organisationName: string | null;
  signal: string;
};

type ProfileSpineRow = {
  id: string;
  full_name: string;
  organisation_name: string | null;
  relationships: Array<{
    relationship_owners: Array<{
      user_id: string;
      strength: OwnerStrength;
      is_primary: boolean;
      last_interaction_at: string | null;
      users: { full_name: string } | null;
    }>;
  }> | null;
};

function orderPairKey(profileAId: string, profileBId: string): string {
  return profileAId < profileBId
    ? `${profileAId}:${profileBId}`
    : `${profileBId}:${profileAId}`;
}

async function loadConnectionPairKeys(orgId: string): Promise<Set<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("connections")
    .select("profile_a_id, profile_b_id")
    .eq("org_id", orgId);

  if (error) {
    throw new Error(`Failed to load connections: ${error.message}`);
  }

  return new Set(
    (data ?? []).map((row) => orderPairKey(row.profile_a_id, row.profile_b_id)),
  );
}

function getPrimaryOwner(row: ProfileSpineRow) {
  const owners = row.relationships?.[0]?.relationship_owners ?? [];
  const primary = owners.find((owner) => owner.is_primary) ?? owners[0];
  return primary ?? null;
}

async function loadProfileSpine(options?: {
  ownerUserId?: string;
}): Promise<ProfileSpineRow[]> {
  const orgId = await getOrgId();
  const supabase = await createClient();
  const ownerUserId = options?.ownerUserId;
  const useOwnerInner = Boolean(ownerUserId);

  let query = supabase
    .from("profiles")
    .select(
      `
      id,
      full_name,
      organisation_name,
      relationships${useOwnerInner ? "!inner" : ""} (
        relationship_owners${useOwnerInner ? "!inner" : ""} (
          user_id,
          strength,
          is_primary,
          last_interaction_at,
          users (
            full_name
          )
        )
      )
    `,
    )
    .eq("org_id", orgId);

  if (ownerUserId) {
    query = query.eq("relationships.relationship_owners.user_id", ownerUserId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to load profiles for connect: ${error.message}`);
  }

  return (data ?? []) as ProfileSpineRow[];
}

export async function getReconnectSuggestions(
  limit = 20,
  options?: { ownerUserId?: string },
): Promise<ReconnectSuggestion[]> {
  const orgId = await getOrgId();
  const [profiles, latestActivity] = await Promise.all([
    loadProfileSpine(options),
    getLatestActivityByProfile(),
  ]);

  const suggestions: ReconnectSuggestion[] = [];

  for (const profile of profiles) {
    const owner = getPrimaryOwner(profile);
    if (!owner) {
      continue;
    }

    if (
      !RELATIONSHIP_THRESHOLDS.reconnectOwnerStrengths.includes(
        owner.strength as (typeof RELATIONSHIP_THRESHOLDS.reconnectOwnerStrengths)[number],
      )
    ) {
      continue;
    }

    const lastInteractionAt = resolveLastInteractionAt(
      latestActivity.get(profile.id),
      (profile.relationships?.[0]?.relationship_owners ?? []).map(
        (row) => row.last_interaction_at,
      ),
    );

    const elapsed = monthsSince(lastInteractionAt);
    const band = getRecencyBand(elapsed);

    if (band !== "reconnect" && band !== "dormant") {
      continue;
    }

    if (elapsed === null) {
      continue;
    }

    suggestions.push({
      profileId: profile.id,
      fullName: profile.full_name,
      organisationName: profile.organisation_name,
      primaryOwnerName: owner.users?.full_name ?? null,
      ownerStrength: owner.strength,
      lastInteractionAt,
      monthsSinceInteraction: Math.floor(elapsed),
    });
  }

  return suggestions
    .sort((a, b) => b.monthsSinceInteraction - a.monthsSinceInteraction)
    .slice(0, limit);
}

function addIntroducePairs(
  suggestions: IntroduceSuggestion[],
  seen: Set<string>,
  connectionPairs: Set<string>,
  profileNames: Map<string, string>,
  profileIds: string[],
  reason: string,
  limit: number,
) {
  for (let i = 0; i < profileIds.length; i += 1) {
    for (let j = i + 1; j < profileIds.length; j += 1) {
      if (suggestions.length >= limit) {
        return;
      }

      const profileAId = profileIds[i];
      const profileBId = profileIds[j];
      const pairKey = orderPairKey(profileAId, profileBId);

      if (connectionPairs.has(pairKey) || seen.has(pairKey)) {
        continue;
      }

      seen.add(pairKey);
      suggestions.push({
        profileAId,
        profileAName: profileNames.get(profileAId) ?? "Unknown",
        profileBId,
        profileBName: profileNames.get(profileBId) ?? "Unknown",
        reason,
      });
    }
  }
}

export async function getIntroduceSuggestions(
  limit = 20,
): Promise<IntroduceSuggestion[]> {
  const orgId = await getOrgId();
  const supabase = await createClient();

  const [connectionPairs, tagRows, eventRows] = await Promise.all([
    loadConnectionPairKeys(orgId),
    supabase
      .from("profile_tags")
      .select(
        `
        profile_id,
        tags (
          id,
          name
        )
      `,
      )
      .eq("org_id", orgId),
    supabase
      .from("event_attendees")
      .select(
        `
        profile_id,
        events (
          id,
          title
        )
      `,
      )
      .eq("org_id", orgId),
  ]);

  if (tagRows.error) {
    throw new Error(`Failed to load tag pairs: ${tagRows.error.message}`);
  }

  if (eventRows.error) {
    throw new Error(`Failed to load event pairs: ${eventRows.error.message}`);
  }

  const suggestions: IntroduceSuggestion[] = [];
  const seen = new Set<string>();

  const tagGroups = new Map<string, { name: string; profileIds: string[] }>();
  for (const row of tagRows.data ?? []) {
    const tag = row.tags;
    if (!tag) {
      continue;
    }

    const group = tagGroups.get(tag.id) ?? { name: tag.name, profileIds: [] };
    group.profileIds.push(row.profile_id);
    tagGroups.set(tag.id, group);
  }

  const eventGroups = new Map<string, { title: string; profileIds: string[] }>();
  for (const row of eventRows.data ?? []) {
    const event = row.events;
    if (!event) {
      continue;
    }

    const group = eventGroups.get(event.id) ?? {
      title: event.title,
      profileIds: [],
    };
    group.profileIds.push(row.profile_id);
    eventGroups.set(event.id, group);
  }

  const profileIdsNeeded = new Set<string>();
  for (const group of tagGroups.values()) {
    if (group.profileIds.length < 2) {
      continue;
    }
    for (const profileId of group.profileIds) {
      profileIdsNeeded.add(profileId);
    }
  }
  for (const group of eventGroups.values()) {
    if (group.profileIds.length < 2) {
      continue;
    }
    for (const profileId of group.profileIds) {
      profileIdsNeeded.add(profileId);
    }
  }

  const profileNames = new Map<string, string>();
  if (profileIdsNeeded.size > 0) {
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("org_id", orgId)
      .in("id", [...profileIdsNeeded]);

    if (profilesError) {
      throw new Error(
        `Failed to load profile names for introduce suggestions: ${profilesError.message}`,
      );
    }

    for (const profile of profiles ?? []) {
      profileNames.set(profile.id, profile.full_name);
    }
  }

  for (const group of tagGroups.values()) {
    if (group.profileIds.length < 2) {
      continue;
    }

    addIntroducePairs(
      suggestions,
      seen,
      connectionPairs,
      profileNames,
      group.profileIds,
      `Shared tag: ${group.name}`,
      limit,
    );
  }

  for (const group of eventGroups.values()) {
    if (group.profileIds.length < 2) {
      continue;
    }

    addIntroducePairs(
      suggestions,
      seen,
      connectionPairs,
      profileNames,
      group.profileIds,
      `Co-attended ${group.title}`,
      limit,
    );
  }

  return suggestions.slice(0, limit);
}

export async function getEmergingSuggestions(
  limit = 20,
): Promise<EmergingSuggestion[]> {
  const orgId = await getOrgId();
  const supabase = await createClient();
  const windowStart = new Date();
  windowStart.setDate(
    windowStart.getDate() - RELATIONSHIP_THRESHOLDS.emergingActivityWindowDays,
  );

  const { data, error } = await supabase
    .from("activities")
    .select(
      `
      profile_id,
      activity_date,
      profiles (
        full_name,
        organisation_name
      )
    `,
    )
    .eq("org_id", orgId)
    .gte("activity_date", windowStart.toISOString());

  if (error) {
    throw new Error(`Failed to load emerging signals: ${error.message}`);
  }

  const counts = new Map<
    string,
    { fullName: string; organisationName: string | null; count: number }
  >();

  for (const row of data ?? []) {
    const profile = row.profiles;
    if (!profile) {
      continue;
    }

    const existing = counts.get(row.profile_id) ?? {
      fullName: profile.full_name,
      organisationName: profile.organisation_name,
      count: 0,
    };
    existing.count += 1;
    counts.set(row.profile_id, existing);
  }

  return [...counts.entries()]
    .filter(([, value]) => value.count >= RELATIONSHIP_THRESHOLDS.emergingMinActivities)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, limit)
    .map(([profileId, value]) => ({
      profileId,
      fullName: value.fullName,
      organisationName: value.organisationName,
      signal: `${value.count} activities in the last ${RELATIONSHIP_THRESHOLDS.emergingActivityWindowDays} days`,
    }));
}
