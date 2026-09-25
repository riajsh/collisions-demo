import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { normaliseEmail } from "@/lib/integrations/participant-email";
import type { Database } from "@/types/database";

type AdminClient = SupabaseClient<Database>;

export type OrgRelationshipsByProfileId = Map<string, string>;

export async function loadIgnoredParticipantEmails(
  supabase: AdminClient,
  orgId: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("calendar_participant_reviews")
    .select("email")
    .eq("org_id", orgId)
    .eq("status", "ignored");

  if (error) {
    throw new Error(
      `Failed to load ignored calendar participants: ${error.message}`,
    );
  }

  return new Set(
    (data ?? [])
      .map((row) => normaliseEmail(row.email))
      .filter(Boolean),
  );
}

export async function loadOrgRelationshipsByProfileId(
  supabase: AdminClient,
  orgId: string,
): Promise<OrgRelationshipsByProfileId> {
  const { data, error } = await supabase
    .from("relationships")
    .select("id, profile_id")
    .eq("org_id", orgId);

  if (error) {
    throw new Error(`Failed to load org relationships: ${error.message}`);
  }

  const relationshipsByProfileId: OrgRelationshipsByProfileId = new Map();

  for (const relationship of data ?? []) {
    relationshipsByProfileId.set(relationship.profile_id, relationship.id);
  }

  return relationshipsByProfileId;
}

export async function loadOwnedProfileEmails(
  supabase: AdminClient,
  orgId: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("profiles")
    .select(
      `
      email,
      relationships!inner (
        relationship_owners!inner ( user_id )
      )
    `,
    )
    .eq("org_id", orgId)
    .not("email", "is", null);

  if (error) {
    throw new Error(`Failed to load owned profile emails: ${error.message}`);
  }

  const owned = new Set<string>();
  for (const profile of data ?? []) {
    if (!profile.email) {
      continue;
    }
    const relationships = profile.relationships ?? [];
    const hasOwner = relationships.some(
      (relationship) => (relationship.relationship_owners?.length ?? 0) > 0,
    );
    if (hasOwner) {
      owned.add(normaliseEmail(profile.email));
    }
  }

  return owned;
}

export async function ensureRelationshipsForProfiles(
  supabase: AdminClient,
  orgId: string,
  profileIds: string[],
  relationshipsByProfileId: OrgRelationshipsByProfileId,
): Promise<void> {
  const missingProfileIds = profileIds.filter(
    (profileId) => !relationshipsByProfileId.has(profileId),
  );

  if (missingProfileIds.length === 0) {
    return;
  }

  const { data, error } = await supabase
    .from("relationships")
    .upsert(
      missingProfileIds.map((profileId) => ({
        org_id: orgId,
        profile_id: profileId,
        status: "prospect" as const,
        relationship_type: "other" as const,
      })),
      { onConflict: "org_id,profile_id" },
    )
    .select("id, profile_id");

  if (error) {
    throw new Error(`Failed to create relationships: ${error.message}`);
  }

  for (const relationship of data ?? []) {
    relationshipsByProfileId.set(relationship.profile_id, relationship.id);
  }
}

export async function ensureRelationshipForProfile(
  supabase: AdminClient,
  orgId: string,
  profileId: string,
  relationshipsByProfileId?: OrgRelationshipsByProfileId,
): Promise<string> {
  const cached = relationshipsByProfileId?.get(profileId);
  if (cached) {
    return cached;
  }

  const { data, error } = await supabase
    .from("relationships")
    .upsert(
      {
        org_id: orgId,
        profile_id: profileId,
        status: "prospect",
        relationship_type: "other",
      },
      { onConflict: "org_id,profile_id" },
    )
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to create relationship: ${error.message}`);
  }

  relationshipsByProfileId?.set(profileId, data.id);
  return data.id;
}
