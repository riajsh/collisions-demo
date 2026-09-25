import "server-only";

import { getOrgId, requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type {
  AssignOwnerInput,
  UpdateOwnerInput,
  UpdateRelationshipInput,
  UpdateRelationshipNotesInput,
} from "@/lib/validators/relationships";
import type { Database } from "@/types/database";

type OwnerStrength = Database["public"]["Enums"]["owner_strength"];

async function assertProfileInOrg(profileId: string, orgId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", profileId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to verify profile: ${error.message}`);
  }

  if (!data) {
    throw new Error("Profile not found");
  }
}

async function getOrCreateRelationship(
  profileId: string,
  orgId: string,
  createdBy: string,
): Promise<string> {
  const supabase = await createClient();

  const { data: existing, error: existingError } = await supabase
    .from("relationships")
    .select("id")
    .eq("profile_id", profileId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Failed to load relationship: ${existingError.message}`);
  }

  if (existing) {
    return existing.id;
  }

  const { data: created, error: createError } = await supabase
    .from("relationships")
    .insert({
      org_id: orgId,
      profile_id: profileId,
      status: "prospect",
      relationship_type: "other",
    })
    .select("id")
    .single();

  if (createError) {
    throw new Error(`Failed to create relationship: ${createError.message}`);
  }

  const { error: sourceError } = await supabase
    .from("relationship_sources")
    .insert({
      org_id: orgId,
      relationship_id: created.id,
      source_type: "manual",
      source_label: "Relationship created manually",
      created_by: createdBy,
    });

  if (sourceError) {
    throw new Error(
      `Failed to create relationship source: ${sourceError.message}`,
    );
  }

  return created.id;
}

async function assertOwnerBelongsToProfile(
  ownerId: string,
  profileId: string,
  orgId: string,
) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("relationship_owners")
    .select("id, relationships!inner(profile_id)")
    .eq("id", ownerId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to verify owner: ${error.message}`);
  }

  const relationship = data?.relationships as { profile_id: string } | null;
  if (!data || relationship?.profile_id !== profileId) {
    throw new Error("Owner not found");
  }
}

async function assertUserInOrg(userId: string, orgId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .select("id")
    .eq("id", userId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to verify team member: ${error.message}`);
  }

  if (!data) {
    throw new Error("Team member not found");
  }
}

async function clearPrimaryOwners(relationshipId: string, orgId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("relationship_owners")
    .update({ is_primary: false })
    .eq("relationship_id", relationshipId)
    .eq("org_id", orgId);

  if (error) {
    throw new Error(`Failed to clear primary owner: ${error.message}`);
  }
}

export async function assignRelationshipOwner(
  input: AssignOwnerInput,
): Promise<void> {
  const orgId = await getOrgId();
  const currentUser = await requireUser();
  await assertProfileInOrg(input.profileId, orgId);

  const relationshipId = await getOrCreateRelationship(
    input.profileId,
    orgId,
    currentUser.id,
  );

  const supabase = await createClient();

  if (input.isPrimary) {
    await clearPrimaryOwners(relationshipId, orgId);
  }

  await assertUserInOrg(input.userId, orgId);

  const { error } = await supabase.from("relationship_owners").insert({
    org_id: orgId,
    relationship_id: relationshipId,
    user_id: input.userId,
    strength: input.strength,
    is_primary: input.isPrimary,
  });

  if (error) {
    if (error.code === "23505") {
      throw new Error("This team member is already an owner for this profile.");
    }
    throw new Error(`Failed to assign owner: ${error.message}`);
  }
}

export async function updateRelationshipOwner(
  input: UpdateOwnerInput,
): Promise<void> {
  const orgId = await getOrgId();
  await assertProfileInOrg(input.profileId, orgId);

  const supabase = await createClient();

  const { data: ownerRow, error: ownerError } = await supabase
    .from("relationship_owners")
    .select("id, relationship_id")
    .eq("id", input.ownerId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (ownerError) {
    throw new Error(`Failed to load owner: ${ownerError.message}`);
  }

  if (!ownerRow) {
    throw new Error("Owner not found");
  }

  await assertOwnerBelongsToProfile(input.ownerId, input.profileId, orgId);

  if (input.isPrimary) {
    await clearPrimaryOwners(ownerRow.relationship_id, orgId);
  }

  const update: {
    strength: OwnerStrength;
    is_primary: boolean;
    notes?: string | null;
  } = {
    strength: input.strength,
    is_primary: input.isPrimary,
  };

  if (input.notes !== undefined) {
    update.notes = input.notes.length > 0 ? input.notes : null;
  }

  const { error } = await supabase
    .from("relationship_owners")
    .update(update)
    .eq("id", input.ownerId)
    .eq("org_id", orgId);

  if (error) {
    throw new Error(`Failed to update owner: ${error.message}`);
  }
}

/**
 * Sets just the status field — used by the inline status dropdown in the
 * Profiles table, where editing the full status/type/notes form isn't
 * appropriate. Same auto-create-if-missing behaviour as updateRelationship,
 * for the same reason (profiles from the Eventbrite review queue don't get
 * a relationship record automatically).
 */
export async function updateRelationshipStatus(
  profileId: string,
  status: Database["public"]["Enums"]["relationship_status"],
): Promise<void> {
  const user = await requireUser();
  const orgId = await getOrgId();
  await assertProfileInOrg(profileId, orgId);

  const supabase = await createClient();
  const relationshipId = await getOrCreateRelationship(profileId, orgId, user.id);

  const { error } = await supabase
    .from("relationships")
    .update({ status })
    .eq("id", relationshipId)
    .eq("org_id", orgId);

  if (error) {
    throw new Error(`Failed to update status: ${error.message}`);
  }
}

/** Same idea as updateRelationshipStatus, for the Type pill in the header. */
export async function updateRelationshipType(
  profileId: string,
  relationshipType: Database["public"]["Enums"]["relationship_type"],
): Promise<void> {
  const user = await requireUser();
  const orgId = await getOrgId();
  await assertProfileInOrg(profileId, orgId);

  const supabase = await createClient();
  const relationshipId = await getOrCreateRelationship(profileId, orgId, user.id);

  const { error } = await supabase
    .from("relationships")
    .update({ relationship_type: relationshipType })
    .eq("id", relationshipId)
    .eq("org_id", orgId);

  if (error) {
    throw new Error(`Failed to update type: ${error.message}`);
  }
}

export async function updateRelationship(
  input: UpdateRelationshipInput,
): Promise<void> {
  const user = await requireUser();
  const orgId = await getOrgId();
  await assertProfileInOrg(input.profileId, orgId);

  const supabase = await createClient();

  // No relationshipId means this profile doesn't have one yet (e.g. it was
  // created via the Eventbrite review queue, which doesn't make one
  // automatically) — create it now rather than leaving the person with no
  // way to save relationship context.
  const relationshipId =
    input.relationshipId ??
    (await getOrCreateRelationship(input.profileId, orgId, user.id));

  const { error } = await supabase
    .from("relationships")
    .update({
      status: input.status,
      relationship_type: input.relationshipType,
      notes: input.notes && input.notes.length > 0 ? input.notes : null,
    })
    .eq("id", relationshipId)
    .eq("profile_id", input.profileId)
    .eq("org_id", orgId);

  if (error) {
    throw new Error(`Failed to update relationship: ${error.message}`);
  }
}

/**
 * Saves just the free-text "Relationship context" — used by its own section
 * now that Status and Type moved into header pills, so editing your notes
 * never risks resubmitting (and clobbering) a status/type change made
 * elsewhere in the meantime.
 */
export async function updateRelationshipNotes(
  input: UpdateRelationshipNotesInput,
): Promise<void> {
  const user = await requireUser();
  const orgId = await getOrgId();
  await assertProfileInOrg(input.profileId, orgId);

  const supabase = await createClient();
  const relationshipId = await getOrCreateRelationship(
    input.profileId,
    orgId,
    user.id,
  );

  const { error } = await supabase
    .from("relationships")
    .update({
      notes: input.notes && input.notes.length > 0 ? input.notes : null,
    })
    .eq("id", relationshipId)
    .eq("profile_id", input.profileId)
    .eq("org_id", orgId);

  if (error) {
    throw new Error(`Failed to update relationship context: ${error.message}`);
  }
}
