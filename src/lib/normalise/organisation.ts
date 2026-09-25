const ORG_SUFFIXES =
  /\s+(ltd\.?|limited|inc\.?|llc|pty\.?|corp\.?|corporation|co\.?)$/i;

export function normaliseOrganisationName(
  name: string | null | undefined,
): string | null {
  if (!name?.trim()) {
    return null;
  }

  return name.trim().replace(ORG_SUFFIXES, "").toLowerCase();
}
