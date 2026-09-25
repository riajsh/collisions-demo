const PROFILE_TABS = ["activity", "connections", "events", "notes"] as const;

export type ProfileTab = (typeof PROFILE_TABS)[number];

export function parseProfileTab(value: string | undefined): ProfileTab | undefined {
  if (!value) {
    return undefined;
  }

  return PROFILE_TABS.includes(value as ProfileTab)
    ? (value as ProfileTab)
    : undefined;
}

export function parseProfileTabOrDefault(
  value: string | undefined,
  fallback: ProfileTab = "activity",
): ProfileTab {
  return parseProfileTab(value) ?? fallback;
}
