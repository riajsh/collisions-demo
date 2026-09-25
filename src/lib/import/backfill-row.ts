import type { SupabaseClient } from "@supabase/supabase-js";

import { parseTags } from "@/lib/import/mapping";
import type { NormalizedImportRow } from "@/lib/import/types";
import { normaliseOrganisationName } from "@/lib/normalise/organisation";
import type { Database } from "@/types/database";

type Client = SupabaseClient<Database>;
type RelationshipStatus = Database["public"]["Enums"]["relationship_status"];
type RelationshipType = Database["public"]["Enums"]["relationship_type"];
type OwnerStrength = Database["public"]["Enums"]["owner_strength"];

export async function resolveProfileIdForImportRow(
  supabase: Client,
  orgId: string,
  matchedProfileId: string | null,
  normalized: NormalizedImportRow,
): Promise<string | null> {
  if (matchedProfileId) {
    return matchedProfileId;
  }

  if (!normalized.email) {
    return null;
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("org_id", orgId)
    .eq("email", normalized.email)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to look up profile: ${error.message}`);
  }

  return profile?.id ?? null;
}

export async function backfillProfileFieldsFromNormalized(
  supabase: Client,
  orgId: string,
  profileId: string,
  normalized: NormalizedImportRow,
): Promise<boolean> {
  const { data: existing, error: existingError } = await supabase
    .from("profiles")
    .select(
      "email, phone, linkedin_url, organisation_name, occupation, location_city, location_country, extended",
    )
    .eq("id", profileId)
    .eq("org_id", orgId)
    .single();

  if (existingError) {
    throw new Error(`Failed to load profile: ${existingError.message}`);
  }

  const update: Database["public"]["Tables"]["profiles"]["Update"] = {};

  const fillIfEmpty = (
    field:
      | "email"
      | "phone"
      | "linkedin_url"
      | "organisation_name"
      | "occupation"
      | "location_city"
      | "location_country",
    value: string | undefined,
  ) => {
    const current = existing[field];
    const incoming = value?.trim();

    if (!current && incoming) {
      update[field] = incoming;
    }
  };

  fillIfEmpty("email", normalized.email);
  fillIfEmpty("phone", normalized.phone);
  fillIfEmpty("linkedin_url", normalized.linkedin_url);
  fillIfEmpty("organisation_name", normalized.organisation_name);
  fillIfEmpty("occupation", normalized.occupation);
  fillIfEmpty("location_city", normalized.location_city);
  fillIfEmpty("location_country", normalized.location_country);

  if (update.organisation_name) {
    update.organisation_name_normalised = normaliseOrganisationName(
      update.organisation_name,
    );
  }

  const mergedExtended = {
    ...(typeof existing.extended === "object" && existing.extended
      ? (existing.extended as Record<string, string>)
      : {}),
    ...(normalized.extended ?? {}),
  };

  if (Object.keys(mergedExtended).length > 0) {
    update.extended = mergedExtended;
  }

  if (Object.keys(update).length === 0) {
    return false;
  }

  const { error } = await supabase
    .from("profiles")
    .update(update)
    .eq("id", profileId)
    .eq("org_id", orgId);

  if (error) {
    throw new Error(`Failed to update profile: ${error.message}`);
  }

  return true;
}

export async function backfillRelationshipFromNormalized(
  supabase: Client,
  orgId: string,
  profileId: string,
  normalized: NormalizedImportRow,
): Promise<boolean> {
  if (!normalized.relationship_status && !normalized.relationship_type) {
    return false;
  }

  const { data: relationship, error: relationshipError } = await supabase
    .from("relationships")
    .select("id, status, relationship_type")
    .eq("org_id", orgId)
    .eq("profile_id", profileId)
    .maybeSingle();

  if (relationshipError) {
    throw new Error(`Failed to load relationship: ${relationshipError.message}`);
  }

  if (!relationship) {
    return false;
  }

  const update: Database["public"]["Tables"]["relationships"]["Update"] = {};

  if (
    normalized.relationship_status &&
    relationship.status === "prospect" &&
    normalized.relationship_status !== "prospect"
  ) {
    update.status = normalized.relationship_status as RelationshipStatus;
  }

  if (
    normalized.relationship_type &&
    relationship.relationship_type === "other" &&
    normalized.relationship_type !== "other"
  ) {
    update.relationship_type = normalized.relationship_type as RelationshipType;
  }

  if (Object.keys(update).length === 0) {
    return false;
  }

  const { error } = await supabase
    .from("relationships")
    .update(update)
    .eq("id", relationship.id)
    .eq("org_id", orgId);

  if (error) {
    throw new Error(`Failed to update relationship: ${error.message}`);
  }

  return true;
}

export async function assignOwnerFromNormalized(
  supabase: Client,
  orgId: string,
  relationshipId: string,
  normalized: NormalizedImportRow,
  ownerUserId: string,
): Promise<void> {
  const ownerStrength = (normalized.owner_strength ?? "unknown") as OwnerStrength;

  await supabase
    .from("relationship_owners")
    .update({ is_primary: false })
    .eq("relationship_id", relationshipId)
    .eq("org_id", orgId);

  const { error } = await supabase.from("relationship_owners").upsert(
    {
      org_id: orgId,
      relationship_id: relationshipId,
      user_id: ownerUserId,
      strength: ownerStrength,
      is_primary: true,
    },
    { onConflict: "relationship_id,user_id" },
  );

  if (error) {
    throw new Error(`Failed to assign owner: ${error.message}`);
  }
}

export async function linkProfileTagsFromNormalized(
  supabase: Client,
  orgId: string,
  profileId: string,
  normalized: NormalizedImportRow,
): Promise<number> {
  const tagNames = parseTags(normalized.tags);
  if (tagNames.length === 0) {
    return 0;
  }

  let linked = 0;

  for (const tagName of tagNames) {
    const { data: tag, error: tagLookupError } = await supabase
      .from("tags")
      .select("id")
      .eq("org_id", orgId)
      .eq("name", tagName)
      .maybeSingle();

    if (tagLookupError) {
      throw new Error(`Failed to look up tag: ${tagLookupError.message}`);
    }

    let tagId = tag?.id;

    if (!tagId) {
      const { data: createdTag, error: createTagError } = await supabase
        .from("tags")
        .insert({
          org_id: orgId,
          name: tagName,
          category: "other",
        })
        .select("id")
        .single();

      if (createTagError) {
        throw new Error(`Failed to create tag: ${createTagError.message}`);
      }

      tagId = createdTag.id;
    }

    const { error: profileTagError } = await supabase.from("profile_tags").upsert(
      {
        org_id: orgId,
        profile_id: profileId,
        tag_id: tagId,
      },
      { onConflict: "profile_id,tag_id" },
    );

    if (profileTagError) {
      throw new Error(`Failed to link tag: ${profileTagError.message}`);
    }

    linked += 1;
  }

  return linked;
}
