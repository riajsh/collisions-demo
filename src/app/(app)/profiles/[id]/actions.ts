"use server";

import { revalidatePath } from "next/cache";

import { createManualActivity } from "@/lib/data/activities";
import {
  createManualConnection,
  removeManualConnection,
} from "@/lib/data/connections";
import {
  deleteProfile,
  deleteProfiles,
  generateProfileSummary,
  searchProfilesForPicker,
  updateProfile,
} from "@/lib/data/profiles";
import { mergeProfiles } from "@/lib/data/profile-merge";
import {
  assignRelationshipOwner,
  updateRelationship,
  updateRelationshipNotes,
  updateRelationshipOwner,
  updateRelationshipStatus,
  updateRelationshipType,
} from "@/lib/data/relationships";
import { addTagToProfile, removeTagFromProfile } from "@/lib/data/tags";
import { createManualActivitySchema } from "@/lib/validators/activities";
import {
  createManualConnectionSchema,
  removeConnectionSchema,
} from "@/lib/validators/connections";
import { updateProfileSchema } from "@/lib/validators/profiles";
import {
  assignOwnerSchema,
  updateOwnerSchema,
  updateRelationshipNotesSchema,
  updateRelationshipSchema,
} from "@/lib/validators/relationships";
import { profileTagSchema } from "@/lib/validators/tags";
import { getOrgId, requireUser } from "@/lib/auth/session";
import { normaliseOrganisationName } from "@/lib/normalise/organisation";
import { createClient } from "@/lib/supabase/server";
import { postgresUuidSchema } from "@/lib/validators/id";
import type { Database } from "@/types/database";

function revalidateProfile(profileId: string) {
  revalidatePath("/");
  revalidatePath("/profiles");
  revalidatePath(`/profiles/${profileId}`);
}

export async function acceptSuggestedCompanyAction(
  profileId: string,
  companyName: string,
) {
  const parsedId = postgresUuidSchema.safeParse(profileId);
  const trimmedCompany = companyName.trim();

  if (!parsedId.success || !trimmedCompany) {
    return { error: "Invalid input" };
  }

  try {
    await requireUser();
    const orgId = await getOrgId();
    const supabase = await createClient();

    const { data: profile, error: loadError } = await supabase
      .from("profiles")
      .select("organisation_name")
      .eq("org_id", orgId)
      .eq("id", parsedId.data)
      .maybeSingle();

    if (loadError) {
      throw new Error(`Failed to load profile: ${loadError.message}`);
    }

    if (!profile) {
      return { error: "Profile not found" };
    }

    if (profile.organisation_name?.trim()) {
      return { error: "Profile already has a company" };
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        organisation_name: trimmedCompany,
        organisation_name_normalised: normaliseOrganisationName(trimmedCompany),
      })
      .eq("org_id", orgId)
      .eq("id", parsedId.data);

    if (error) {
      throw new Error(`Failed to update company: ${error.message}`);
    }

    revalidateProfile(parsedId.data);
    return { success: true as const };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Failed to apply company",
    };
  }
}

export async function assignSuggestedOwnerAction(
  profileId: string,
  userId: string,
) {
  const parsedProfileId = postgresUuidSchema.safeParse(profileId);
  const parsedUserId = postgresUuidSchema.safeParse(userId);

  if (!parsedProfileId.success || !parsedUserId.success) {
    return { error: "Invalid input" };
  }

  try {
    await assignRelationshipOwner({
      profileId: parsedProfileId.data,
      userId: parsedUserId.data,
      strength: "warm",
      isPrimary: true,
    });
    revalidateProfile(parsedProfileId.data);
    return { success: true as const };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Failed to assign owner",
    };
  }
}

export async function assignOwnerAction(formData: FormData) {
  const parsed = assignOwnerSchema.safeParse({
    profileId: formData.get("profileId"),
    userId: formData.get("userId"),
    strength: formData.get("strength"),
    isPrimary: formData.get("isPrimary") === "on",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    await assignRelationshipOwner(parsed.data);
    revalidateProfile(parsed.data.profileId);
    return { success: true as const };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to assign owner",
    };
  }
}

export async function updateOwnerAction(formData: FormData) {
  const parsed = updateOwnerSchema.safeParse({
    profileId: formData.get("profileId"),
    ownerId: formData.get("ownerId"),
    strength: formData.get("strength"),
    isPrimary: formData.get("isPrimary") === "on",
    notes: formData.get("notes") ?? undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    await updateRelationshipOwner(parsed.data);
    revalidateProfile(parsed.data.profileId);
    return { success: true as const };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to update owner",
    };
  }
}

export async function updateRelationshipAction(formData: FormData) {
  const parsed = updateRelationshipSchema.safeParse({
    profileId: formData.get("profileId"),
    relationshipId: formData.get("relationshipId") || undefined,
    status: formData.get("status"),
    relationshipType: formData.get("relationshipType"),
    notes: formData.get("notes") ?? undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    await updateRelationship(parsed.data);
    revalidateProfile(parsed.data.profileId);
    return { success: true as const };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Failed to update relationship",
    };
  }
}

export async function updateRelationshipNotesAction(formData: FormData) {
  const parsed = updateRelationshipNotesSchema.safeParse({
    profileId: formData.get("profileId"),
    notes: formData.get("notes") ?? undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    await updateRelationshipNotes(parsed.data);
    revalidateProfile(parsed.data.profileId);
    return { success: true as const };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Failed to save relationship context",
    };
  }
}

export async function addProfileTagAction(formData: FormData) {
  const parsed = profileTagSchema.safeParse({
    profileId: formData.get("profileId"),
    tagId: formData.get("tagId"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    await addTagToProfile(parsed.data);
    revalidateProfile(parsed.data.profileId);
    return { success: true as const };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to add tag",
    };
  }
}

export async function removeProfileTagAction(formData: FormData) {
  const parsed = profileTagSchema.safeParse({
    profileId: formData.get("profileId"),
    tagId: formData.get("tagId"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    await removeTagFromProfile(parsed.data);
    revalidateProfile(parsed.data.profileId);
    return { success: true as const };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to remove tag",
    };
  }
}

export async function logActivityAction(formData: FormData) {
  const parsed = createManualActivitySchema.safeParse({
    profileId: formData.get("profileId"),
    activityType: formData.get("activityType"),
    title: formData.get("title"),
    summary: formData.get("summary") ?? undefined,
    activityDate: formData.get("activityDate"),
    introducedBy: formData.get("introducedBy") ?? undefined,
    introductionOutcome: formData.get("introductionOutcome") ?? undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    await createManualActivity(parsed.data);
    revalidateProfile(parsed.data.profileId);
    revalidatePath("/search");
    return { success: true as const };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to log activity",
    };
  }
}

export async function updateProfileAction(formData: FormData) {
  const parsed = updateProfileSchema.safeParse({
    profileId: formData.get("profileId"),
    fullName: formData.get("fullName"),
    email: formData.get("email") ?? undefined,
    phone: formData.get("phone") ?? undefined,
    linkedinUrl: formData.get("linkedinUrl") ?? undefined,
    websiteUrl: formData.get("websiteUrl") ?? undefined,
    organisationName: formData.get("organisationName") ?? undefined,
    occupation: formData.get("occupation") ?? undefined,
    locationCity: formData.get("locationCity") ?? undefined,
    locationCountry: formData.get("locationCountry") ?? undefined,
    bio: formData.get("bio") ?? undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    await updateProfile(parsed.data);
    revalidateProfile(parsed.data.profileId);
    revalidatePath("/search");
    return { success: true as const };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to update profile",
    };
  }
}

export async function addConnectionAction(formData: FormData) {
  const parsed = createManualConnectionSchema.safeParse({
    profileId: formData.get("profileId"),
    otherProfileId: formData.get("otherProfileId"),
    connectionType: formData.get("connectionType"),
    strength: formData.get("strength"),
    notes: formData.get("notes") ?? undefined,
    introducedBy: formData.get("introducedBy") ?? undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    await createManualConnection(parsed.data);
    revalidateProfile(parsed.data.profileId);
    revalidateProfile(parsed.data.otherProfileId);
    return { success: true as const };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to add connection",
    };
  }
}

export async function removeConnectionAction(formData: FormData) {
  const parsed = removeConnectionSchema.safeParse({
    profileId: formData.get("profileId"),
    connectionId: formData.get("connectionId"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    await removeManualConnection(parsed.data.profileId, parsed.data.connectionId);
    revalidateProfile(parsed.data.profileId);
    return { success: true as const };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Failed to remove connection",
    };
  }
}

export async function generateProfileSummaryAction(profileId: string) {
  const parsed = postgresUuidSchema.safeParse(profileId);

  if (!parsed.success) {
    return { error: "Invalid profile" };
  }

  try {
    const result = await generateProfileSummary(parsed.data);
    revalidateProfile(parsed.data);
    return {
      success: true as const,
      summary: result.summary,
      signalCount: result.signalCount,
    };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Failed to generate summary",
    };
  }
}

export async function updateProfileStatusAction(
  profileId: string,
  status: Database["public"]["Enums"]["relationship_status"],
) {
  const parsed = postgresUuidSchema.safeParse(profileId);

  if (!parsed.success) {
    return { error: "Invalid profile" };
  }

  try {
    await updateRelationshipStatus(parsed.data, status);
    revalidateProfile(parsed.data);
    revalidatePath("/profiles");
    return { success: true as const };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to update status",
    };
  }
}

export async function updateProfileTypeAction(
  profileId: string,
  relationshipType: Database["public"]["Enums"]["relationship_type"],
) {
  const parsed = postgresUuidSchema.safeParse(profileId);

  if (!parsed.success) {
    return { error: "Invalid profile" };
  }

  try {
    await updateRelationshipType(parsed.data, relationshipType);
    revalidateProfile(parsed.data);
    revalidatePath("/profiles");
    return { success: true as const };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to update type",
    };
  }
}

export async function searchProfilesForPickerAction(query: string) {
  try {
    const results = await searchProfilesForPicker(query);
    return { results };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Failed to search profiles",
      results: [],
    };
  }
}

export async function deleteProfileAction(formData: FormData) {
  const profileId = String(formData.get("profileId") ?? "").trim();

  if (!/^[0-9a-f-]{36}$/i.test(profileId)) {
    return { error: "Invalid profile" };
  }

  try {
    await deleteProfile(profileId);
    revalidateProfile(profileId);
    return { success: true as const };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to delete profile",
    };
  }
}

export async function deleteProfilesAction(profileIds: string[]) {
  const validIds = [...new Set(profileIds.map((id) => id.trim()))].filter((id) =>
    /^[0-9a-f-]{36}$/i.test(id),
  );

  if (validIds.length === 0) {
    return { error: "Select at least one profile to delete" };
  }

  try {
    const result = await deleteProfiles(validIds);

    revalidatePath("/");
    revalidatePath("/profiles");

    for (const profileId of validIds) {
      revalidatePath(`/profiles/${profileId}`);
    }

    return {
      success: true as const,
      deletedCount: result.deletedCount,
      skipped: result.skipped,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to delete profiles",
    };
  }
}

export async function mergeProfilesAction(
  survivorId: string,
  duplicateIds: string[],
  retainedEmail?: string | null,
) {
  const survivor = survivorId.trim();
  const duplicates = [...new Set(duplicateIds.map((id) => id.trim()))].filter(
    (id) => /^[0-9a-f-]{36}$/i.test(id) && id !== survivor,
  );

  if (!/^[0-9a-f-]{36}$/i.test(survivor)) {
    return { error: "Choose a primary profile to keep" };
  }

  if (duplicates.length === 0) {
    return { error: "Select at least one other profile to merge" };
  }

  try {
    const result = await mergeProfiles(survivor, duplicates, { retainedEmail });

    revalidatePath("/");
    revalidatePath("/profiles");
    revalidatePath(`/profiles/${survivor}`);

    for (const profileId of duplicates) {
      revalidatePath(`/profiles/${profileId}`);
    }

    return {
      success: true as const,
      survivorId: survivor,
      mergedCount: result.mergedCount,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to merge profiles",
    };
  }
}
