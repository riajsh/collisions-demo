import type { ProfileListItem } from "@/lib/data/profiles";
import type { Database } from "@/types/database";

export type ProfileSortKey =
  | "name"
  | "company"
  | "occupation"
  | "location"
  | "owner"
  | "status"
  | "strength"
  | "last_interaction";

export type SortOrder = "asc" | "desc";

const VALID_SORT_KEYS = new Set<ProfileSortKey>([
  "name",
  "company",
  "occupation",
  "location",
  "owner",
  "status",
  "strength",
  "last_interaction",
]);

const STRENGTH_ORDER: Database["public"]["Enums"]["owner_strength"][] = [
  "inner_circle",
  "strong",
  "warm",
  "weak",
  "unknown",
];

export function parseProfileSort(value?: string): ProfileSortKey {
  if (value && VALID_SORT_KEYS.has(value as ProfileSortKey)) {
    return value as ProfileSortKey;
  }

  return "name";
}

export function parseSortOrder(value?: string): SortOrder {
  return value === "desc" ? "desc" : "asc";
}

export function sortProfiles(
  profiles: ProfileListItem[],
  sort: ProfileSortKey,
  order: SortOrder,
): ProfileListItem[] {
  const direction = order === "asc" ? 1 : -1;

  return [...profiles].sort((left, right) => {
    const result = compareProfiles(left, right, sort);
    if (result !== 0) {
      return result * direction;
    }

    return left.fullName.localeCompare(right.fullName) * direction;
  });
}

function compareProfiles(
  left: ProfileListItem,
  right: ProfileListItem,
  sort: ProfileSortKey,
): number {
  switch (sort) {
    case "name":
      return left.fullName.localeCompare(right.fullName);
    case "company":
      return compareNullableText(left.organisationName, right.organisationName);
    case "occupation":
      return compareNullableText(left.occupation, right.occupation);
    case "location":
      return compareNullableText(left.location, right.location);
    case "owner":
      return compareNullableText(
        left.primaryOwner?.fullName ?? null,
        right.primaryOwner?.fullName ?? null,
      );
    case "status":
      return compareNullableText(left.relationshipStatus, right.relationshipStatus);
    case "strength":
      return (
        STRENGTH_ORDER.indexOf(left.strength ?? "unknown") -
        STRENGTH_ORDER.indexOf(right.strength ?? "unknown")
      );
    case "last_interaction":
      return (
        toTimestamp(left.lastInteractionAt) - toTimestamp(right.lastInteractionAt)
      );
    default:
      return 0;
  }
}

function compareNullableText(
  left: string | null,
  right: string | null,
): number {
  return (left ?? "").localeCompare(right ?? "", undefined, { sensitivity: "base" });
}

function toTimestamp(value: string | null): number {
  if (!value) {
    return 0;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}
