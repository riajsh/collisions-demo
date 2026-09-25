/** Overrides for enum values whose display label isn't a plain Title Case split. */
const ENUM_LABEL_OVERRIDES: Record<string, string> = {
  signal_influence: "Signal/Influence",
};

export function formatEnumLabel(value: string): string {
  if (ENUM_LABEL_OVERRIDES[value]) {
    return ENUM_LABEL_OVERRIDES[value];
  }

  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
