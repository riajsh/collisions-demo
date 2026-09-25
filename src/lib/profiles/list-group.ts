import type { ProfileListItem } from "@/lib/data/profiles";
import { formatEnumLabel } from "@/lib/format/enum";

export type ProfileGroupKey = "none" | "company" | "status" | "owner";

const VALID_GROUP_KEYS = new Set<ProfileGroupKey>([
  "none",
  "company",
  "status",
  "owner",
]);

export function parseProfileGroup(value?: string): ProfileGroupKey {
  if (value && VALID_GROUP_KEYS.has(value as ProfileGroupKey)) {
    return value as ProfileGroupKey;
  }
  return "none";
}

export type ProfileGroup = {
  key: string;
  label: string;
  profiles: ProfileListItem[];
};

/**
 * Groups an already-loaded, already-sorted list of profiles for display,
 * preserving each profile's relative order within its group. This only
 * regroups what's already on the page client-side — it doesn't re-query
 * the database — so it stays correct as "Load more" grows the loaded set,
 * the same way the existing client-side sort fallback does.
 */
export function groupProfiles(
  profiles: ProfileListItem[],
  groupBy: ProfileGroupKey,
): ProfileGroup[] {
  if (groupBy === "none") {
    return [{ key: "all", label: "", profiles }];
  }

  const groups = new Map<string, ProfileGroup>();

  for (const profile of profiles) {
    const { key, label } = groupKeyFor(profile, groupBy);
    const existing = groups.get(key);
    if (existing) {
      existing.profiles.push(profile);
    } else {
      groups.set(key, { key, label, profiles: [profile] });
    }
  }

  return [...groups.values()];
}

function groupKeyFor(
  profile: ProfileListItem,
  groupBy: ProfileGroupKey,
): { key: string; label: string } {
  switch (groupBy) {
    case "company": {
      const name = profile.organisationName?.trim();
      return name ? { key: name, label: name } : { key: "__none__", label: "No company" };
    }
    case "status": {
      const status = profile.relationshipStatus;
      return status
        ? { key: status, label: formatEnumLabel(status) }
        : { key: "__none__", label: "No status" };
    }
    case "owner": {
      const owner = profile.primaryOwner;
      return owner
        ? { key: owner.userId, label: owner.fullName }
        : { key: "__none__", label: "No owner" };
    }
    default:
      return { key: "all", label: "" };
  }
}
