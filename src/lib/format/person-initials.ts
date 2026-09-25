/** Two-letter initials from a display name or email address. */
export function personInitials(input: string): string {
  const value = input.trim();
  if (!value) {
    return "?";
  }

  if (value.includes("@")) {
    const local = value.split("@")[0]?.trim() ?? "";
    if (!local) {
      return "?";
    }

    const parts = local.split(/[._-]+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
    }

    return local.slice(0, 2).toUpperCase();
  }

  const parts = value.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
  }

  return value.slice(0, 2).toUpperCase();
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength).trimEnd()}…`;
}
