export function phoneDedupKey(phone: string | null | undefined): string | null {
  const digits = phone?.replace(/\D/g, "") ?? "";
  if (digits.length < 8) {
    return null;
  }

  return digits;
}

export function linkedinDedupKey(
  url: string | null | undefined,
): string | null {
  const value = url?.trim();
  if (!value) {
    return null;
  }

  try {
    const parsed = new URL(value.startsWith("http") ? value : `https://${value}`);
    const path = parsed.pathname.replace(/\/$/, "").toLowerCase();
    const inMatch = path.match(/\/in\/([^/]+)/);
    if (inMatch?.[1]) {
      return inMatch[1];
    }
  } catch {
    // Fall through to normalised raw value.
  }

  return value.toLowerCase();
}
