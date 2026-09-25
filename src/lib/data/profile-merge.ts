import "server-only";

import { getOrgId, requireAdmin } from "@/lib/auth/session";
import {
  isInternalParticipant,
  loadOrgParticipantFilters,
} from "@/lib/integrations/participant-email";
import { normaliseOrganisationName } from "@/lib/normalise/organisation";
import { normalisePersonName } from "@/lib/normalise/person-name";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

function mergeProfileFields(
  survivor: ProfileRow,
  duplicate: ProfileRow,
  retainedEmail: string | null,
): Partial<ProfileRow> {
  const organisationName =
    survivor.organisation_name?.trim() || duplicate.organisation_name?.trim() || null;

  return {
    full_name: normalisePersonName(
      survivor.full_name?.trim() || duplicate.full_name,
    ),
    email: retainedEmail,
    phone: survivor.phone?.trim() || duplicate.phone?.trim() || null,
    linkedin_url: survivor.linkedin_url?.trim() || duplicate.linkedin_url?.trim() || null,
    website_url: survivor.website_url?.trim() || duplicate.website_url?.trim() || null,
    organisation_name: organisationName,
    organisation_name_normalised: normaliseOrganisationName(organisationName),
    occupation: survivor.occupation?.trim() || duplicate.occupation?.trim() || null,
    location_city:
      survivor.location_city?.trim() || duplicate.location_city?.trim() || null,
    location_country:
      survivor.location_country?.trim() || duplicate.location_country?.trim() || null,
    bio: survivor.bio?.trim() || duplicate.bio?.trim() || null,
  };
}

function resolveRetainedEmail(
  profiles: ProfileRow[],
  chosenEmail?: string | null,
): string | null {
  const byNormalized = new Map<string, string>();

  for (const profile of profiles) {
    const email = profile.email?.trim();
    if (!email) {
      continue;
    }

    byNormalized.set(email.toLowerCase(), email);
  }

  const uniqueEmails = [...byNormalized.values()];
  if (uniqueEmails.length === 0) {
    return null;
  }

  if (uniqueEmails.length === 1) {
    return uniqueEmails[0]!;
  }

  if (!chosenEmail?.trim()) {
    throw new Error("Choose which email address to keep.");
  }

  const resolved = byNormalized.get(chosenEmail.trim().toLowerCase());
  if (!resolved) {
    throw new Error(
      "Chosen email must belong to one of the profiles being merged.",
    );
  }

  return resolved;
}

function buildSurvivorFieldsPayload(
  fields: Partial<ProfileRow>,
): Record<string, string | null> {
  const payload: Record<string, string | null> = {};

  for (const key of [
    "full_name",
    "phone",
    "linkedin_url",
    "website_url",
    "organisation_name",
    "organisation_name_normalised",
    "occupation",
    "location_city",
    "location_country",
    "bio",
  ] as const) {
    const value = fields[key];
    if (value !== undefined) {
      payload[key] = value;
    }
  }

  return payload;
}

export async function mergeProfiles(
  survivorId: string,
  duplicateIds: string[],
  options?: { retainedEmail?: string | null },
): Promise<{ mergedCount: number }> {
  await requireAdmin();
  const orgId = await getOrgId();
  const supabase = await createClient();
  const participantFilters = await loadOrgParticipantFilters(
    createAdminClient(),
    orgId,
  );

  const uniqueDuplicateIds = [
    ...new Set(
      duplicateIds
        .map((id) => id.trim())
        .filter((id) => id && id !== survivorId),
    ),
  ];

  if (uniqueDuplicateIds.length === 0) {
    throw new Error("Select at least one other profile to merge.");
  }

  const profileIds = [survivorId, ...uniqueDuplicateIds];
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("*")
    .eq("org_id", orgId)
    .in("id", profileIds);

  if (profilesError) {
    throw new Error(`Failed to load profiles: ${profilesError.message}`);
  }

  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const survivor = profileById.get(survivorId);

  if (!survivor) {
    throw new Error("Primary profile not found.");
  }

  if (
    survivor.email &&
    isInternalParticipant(survivor.email, participantFilters)
  ) {
    throw new Error(
      `Team member profile ${survivor.full_name} cannot be the merge target.`,
    );
  }

  const duplicates = uniqueDuplicateIds.map((id) => {
    const profile = profileById.get(id);
    if (!profile) {
      throw new Error("One or more selected profiles could not be found.");
    }
    return profile;
  });

  for (const duplicate of duplicates) {
    if (
      duplicate.email &&
      isInternalParticipant(duplicate.email, participantFilters)
    ) {
      throw new Error(
        `Team member profile ${duplicate.full_name} cannot be merged away.`,
      );
    }
  }

  const retainedEmail = resolveRetainedEmail(
    [survivor, ...duplicates],
    options?.retainedEmail,
  );

  let mergedSurvivor: ProfileRow = { ...survivor };
  for (const duplicate of duplicates) {
    mergedSurvivor = {
      ...mergedSurvivor,
      ...mergeProfileFields(mergedSurvivor, duplicate, retainedEmail),
    };
  }

  const { email: _retained, ...fieldsWithoutEmail } = mergedSurvivor;
  const survivorFields = buildSurvivorFieldsPayload(fieldsWithoutEmail);

  const { data: mergedCount, error: mergeError } = await supabase.rpc(
    "merge_profiles_atomic",
    {
      p_survivor_id: survivorId,
      p_duplicate_ids: uniqueDuplicateIds,
      p_retained_email: retainedEmail,
      p_survivor_fields: survivorFields,
    },
  );

  if (mergeError) {
    if (mergeError.code === "23505") {
      throw new Error(
        "Another profile already uses the email address from the merged profile.",
      );
    }
    throw new Error(`Failed to merge profiles: ${mergeError.message}`);
  }

  return { mergedCount: mergedCount ?? 0 };
}
