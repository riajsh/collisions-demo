import { normaliseOrganisationName } from "@/lib/normalise/organisation";

export function nameCompanyDedupKey(
  fullName: string | null | undefined,
  organisationName: string | null | undefined,
): string | null {
  const name = fullName?.trim().toLowerCase();
  const org = normaliseOrganisationName(organisationName);

  if (!name || !org) {
    return null;
  }

  return `${name}::${org}`;
}
