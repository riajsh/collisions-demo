import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

type Client = SupabaseClient<Database>;

type OwnerStrength = Database["public"]["Enums"]["owner_strength"];

export type RelationshipOwnerSnapshot = {
  user_id: string;
  strength: OwnerStrength;
  is_primary: boolean;
  notes: string | null;
  last_interaction_at: string | null;
};

export type RelationshipGraphRollback = {
  relationshipId: string;
  createdRelationshipId?: string;
  createdRelationshipSourceId?: string;
  ownersModified: boolean;
  relationshipOwnersBefore: RelationshipOwnerSnapshot[];
  linkedProfileTags: Array<{ profileId: string; tagId: string }>;
  createdTagIds: string[];
  createdEventAttendeeKeys: Array<{ eventId: string; profileId: string }>;
};

export async function applyRelationshipGraphRollback(
  supabase: Client,
  orgId: string,
  rollback: RelationshipGraphRollback,
): Promise<void> {
  for (const link of rollback.linkedProfileTags) {
    await supabase
      .from("profile_tags")
      .delete()
      .eq("org_id", orgId)
      .eq("profile_id", link.profileId)
      .eq("tag_id", link.tagId);
  }

  for (const attendee of rollback.createdEventAttendeeKeys ?? []) {
    await supabase
      .from("event_attendees")
      .delete()
      .eq("org_id", orgId)
      .eq("event_id", attendee.eventId)
      .eq("profile_id", attendee.profileId);
  }

  for (const tagId of rollback.createdTagIds) {
    const { count, error: countError } = await supabase
      .from("profile_tags")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("tag_id", tagId);

    if (countError) {
      continue;
    }

    if ((count ?? 0) === 0) {
      await supabase.from("tags").delete().eq("id", tagId).eq("org_id", orgId);
    }
  }

  if (rollback.ownersModified) {
    const { data: currentOwners, error: currentOwnersError } = await supabase
      .from("relationship_owners")
      .select("user_id")
      .eq("org_id", orgId)
      .eq("relationship_id", rollback.relationshipId);

    if (!currentOwnersError) {
      const snapshotUserIds = new Set(
        rollback.relationshipOwnersBefore.map((owner) => owner.user_id),
      );

      for (const owner of currentOwners ?? []) {
        if (!snapshotUserIds.has(owner.user_id)) {
          await supabase
            .from("relationship_owners")
            .delete()
            .eq("org_id", orgId)
            .eq("relationship_id", rollback.relationshipId)
            .eq("user_id", owner.user_id);
        }
      }
    }

    for (const owner of rollback.relationshipOwnersBefore) {
      await supabase.from("relationship_owners").upsert(
        {
          org_id: orgId,
          relationship_id: rollback.relationshipId,
          user_id: owner.user_id,
          strength: owner.strength,
          is_primary: owner.is_primary,
          notes: owner.notes,
          last_interaction_at: owner.last_interaction_at,
        },
        { onConflict: "relationship_id,user_id" },
      );
    }
  }

  if (rollback.createdRelationshipSourceId) {
    await supabase
      .from("relationship_sources")
      .delete()
      .eq("id", rollback.createdRelationshipSourceId)
      .eq("org_id", orgId);
  }

  if (rollback.createdRelationshipId) {
    await supabase
      .from("relationships")
      .delete()
      .eq("id", rollback.createdRelationshipId)
      .eq("org_id", orgId);
  }
}

export async function applyImportCommitRollbacks(
  supabase: Client,
  orgId: string,
  graphRollbacks: RelationshipGraphRollback[],
): Promise<void> {
  for (const rollback of [...graphRollbacks].reverse()) {
    await applyRelationshipGraphRollback(supabase, orgId, rollback);
  }
}
