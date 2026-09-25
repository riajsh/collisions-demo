import "server-only";

import { linkedinDedupKey, phoneDedupKey } from "@/lib/dedup/contact-keys";
import { namesAreFuzzyMatch } from "@/lib/dedup/fuzzy-name";
import { nameCompanyDedupKey } from "@/lib/dedup/name-company";
import { getOrgId, requireAdmin } from "@/lib/auth/session";
import {
  isInternalParticipant,
  loadOrgParticipantFilters,
} from "@/lib/integrations/participant-email";
import { normaliseOrganisationName } from "@/lib/normalise/organisation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type DuplicateProfileEntry = {
  id: string;
  fullName: string;
  email: string | null;
  organisationName: string | null;
  occupation: string | null;
  canDelete: boolean;
};

export type DuplicateProfileGroup = {
  id: string;
  reason:
    | "same_email"
    | "same_phone"
    | "same_linkedin"
    | "same_name_organisation"
    | "fuzzy_name_organisation";
  reasonLabel: string;
  hasConflictingEmails: boolean;
  profiles: DuplicateProfileEntry[];
};

type ProfileRow = {
  id: string;
  full_name: string;
  email: string | null;
  organisation_name: string | null;
  occupation: string | null;
  phone: string | null;
  linkedin_url: string | null;
};

function toEntry(
  profile: ProfileRow,
  participantFilters: Awaited<ReturnType<typeof loadOrgParticipantFilters>>,
): DuplicateProfileEntry {
  return {
    id: profile.id,
    fullName: profile.full_name,
    email: profile.email,
    organisationName: profile.organisation_name,
    occupation: profile.occupation,
    canDelete: !(
      profile.email && isInternalParticipant(profile.email, participantFilters)
    ),
  };
}

function hasConflictingEmails(
  profiles: DuplicateProfileEntry[],
): boolean {
  const emails = new Set(
    profiles.map((profile) => profile.email?.trim().toLowerCase()).filter(Boolean),
  );
  return emails.size > 1 && emails.size === profiles.length;
}

function groupIsSubsetOf(
  members: DuplicateProfileEntry[],
  existing: DuplicateProfileGroup,
): boolean {
  const memberIds = new Set(members.map((profile) => profile.id));
  return existing.profiles.every((profile) => memberIds.has(profile.id));
}

function profilesAlreadyGrouped(
  memberIds: Set<string>,
  groups: DuplicateProfileGroup[],
): boolean {
  return groups.some((group) => {
    const groupIds = new Set(group.profiles.map((profile) => profile.id));
    if (groupIds.size !== memberIds.size) {
      return false;
    }

    for (const id of memberIds) {
      if (!groupIds.has(id)) {
        return false;
      }
    }

    return true;
  });
}

function addGroup(
  groups: DuplicateProfileGroup[],
  groupIndex: number,
  params: Omit<DuplicateProfileGroup, "id">,
): number {
  if (
    groups.some((group) => groupIsSubsetOf(params.profiles, group)) ||
    profilesAlreadyGrouped(
      new Set(params.profiles.map((profile) => profile.id)),
      groups,
    )
  ) {
    return groupIndex;
  }

  groupIndex += 1;
  groups.push({
    id: `group-${groupIndex}`,
    ...params,
  });
  return groupIndex;
}

function buildKeyedGroups(
  profiles: ProfileRow[],
  participantFilters: Awaited<ReturnType<typeof loadOrgParticipantFilters>>,
  keyFor: (profile: ProfileRow) => string | null,
): Map<string, DuplicateProfileEntry[]> {
  const groups = new Map<string, DuplicateProfileEntry[]>();

  for (const profile of profiles) {
    const key = keyFor(profile);
    if (!key) {
      continue;
    }

    const members = groups.get(key) ?? [];
    members.push(toEntry(profile, participantFilters));
    groups.set(key, members);
  }

  return groups;
}

export async function findDuplicateProfileGroups(): Promise<{
  totalProfiles: number;
  groups: DuplicateProfileGroup[];
}> {
  await requireAdmin();
  const orgId = await getOrgId();
  const supabase = await createClient();
  const participantFilters = await loadOrgParticipantFilters(
    createAdminClient(),
    orgId,
  );

  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, full_name, email, organisation_name, occupation, phone, linkedin_url",
    )
    .eq("org_id", orgId)
    .order("full_name");

  if (error) {
    throw new Error(`Failed to load profiles for dedup: ${error.message}`);
  }

  const profiles = data ?? [];
  const groups: DuplicateProfileGroup[] = [];
  let groupIndex = 0;
  const assignedProfileIds = new Set<string>();

  const keyedGroupConfigs: Array<{
    reason: DuplicateProfileGroup["reason"];
    label: (key: string) => string;
    map: Map<string, DuplicateProfileEntry[]>;
  }> = [
    {
      reason: "same_email",
      label: (key) => `Same email: ${key}`,
      map: buildKeyedGroups(profiles, participantFilters, (profile) =>
        profile.email?.trim().toLowerCase() ?? null,
      ),
    },
    {
      reason: "same_phone",
      label: (key) => `Same phone: ${key}`,
      map: buildKeyedGroups(profiles, participantFilters, (profile) =>
        phoneDedupKey(profile.phone),
      ),
    },
    {
      reason: "same_linkedin",
      label: (key) => `Same LinkedIn: ${key}`,
      map: buildKeyedGroups(profiles, participantFilters, (profile) =>
        linkedinDedupKey(profile.linkedin_url),
      ),
    },
    {
      reason: "same_name_organisation",
      label: (key) => {
        const [name, org] = key.split("::");
        return `Same name + organisation: ${name} · ${org}`;
      },
      map: buildKeyedGroups(profiles, participantFilters, (profile) =>
        nameCompanyDedupKey(profile.full_name, profile.organisation_name),
      ),
    },
  ];

  for (const config of keyedGroupConfigs) {
    for (const [key, members] of config.map) {
      if (members.length < 2) {
        continue;
      }

      groupIndex = addGroup(groups, groupIndex, {
        reason: config.reason,
        reasonLabel: config.label(key),
        hasConflictingEmails: hasConflictingEmails(members),
        profiles: members,
      });

      for (const member of members) {
        assignedProfileIds.add(member.id);
      }
    }
  }

  const profilesByOrganisation = new Map<string, ProfileRow[]>();

  for (const profile of profiles) {
    if (assignedProfileIds.has(profile.id)) {
      continue;
    }

    const orgKey = normaliseOrganisationName(profile.organisation_name);
    if (!orgKey) {
      continue;
    }

    const bucket = profilesByOrganisation.get(orgKey) ?? [];
    bucket.push(profile);
    profilesByOrganisation.set(orgKey, bucket);
  }

  for (const orgProfiles of profilesByOrganisation.values()) {
    if (orgProfiles.length < 2) {
      continue;
    }

    for (let left = 0; left < orgProfiles.length; left += 1) {
      const leftProfile = orgProfiles[left]!;

      if (assignedProfileIds.has(leftProfile.id)) {
        continue;
      }

      for (let right = left + 1; right < orgProfiles.length; right += 1) {
        const rightProfile = orgProfiles[right]!;

        if (
          assignedProfileIds.has(leftProfile.id) &&
          assignedProfileIds.has(rightProfile.id)
        ) {
          continue;
        }

        if (
          leftProfile.full_name.trim().toLowerCase() ===
          rightProfile.full_name.trim().toLowerCase()
        ) {
          continue;
        }

        if (!namesAreFuzzyMatch(leftProfile.full_name, rightProfile.full_name)) {
          continue;
        }

        const members = [leftProfile, rightProfile].map((profile) =>
          toEntry(profile, participantFilters),
        );

        groupIndex = addGroup(groups, groupIndex, {
          reason: "fuzzy_name_organisation",
          reasonLabel: `Similar name + same organisation: ${leftProfile.full_name} / ${rightProfile.full_name} · ${leftProfile.organisation_name ?? "Unknown company"}`,
          hasConflictingEmails: hasConflictingEmails(members),
          profiles: members,
        });

        assignedProfileIds.add(leftProfile.id);
        assignedProfileIds.add(rightProfile.id);
      }
    }
  }

  groups.sort((left, right) => right.profiles.length - left.profiles.length);

  return {
    totalProfiles: profiles.length,
    groups,
  };
}
