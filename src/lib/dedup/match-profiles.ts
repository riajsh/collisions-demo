import { linkedinDedupKey, phoneDedupKey } from "@/lib/dedup/contact-keys";
import { namesAreFuzzyMatch } from "@/lib/dedup/fuzzy-name";
import { nameCompanyDedupKey } from "@/lib/dedup/name-company";
import { normaliseOrganisationName } from "@/lib/normalise/organisation";

export type ExistingProfileForDedup = {
  id: string;
  full_name: string;
  email: string | null;
  organisation_name: string | null;
  phone?: string | null;
  linkedin_url?: string | null;
};

export function findNameCompanyMatches(
  fullName: string | null | undefined,
  organisationName: string | null | undefined,
  profiles: ExistingProfileForDedup[],
  options?: { includeFuzzy?: boolean },
): string[] {
  const exactKey = nameCompanyDedupKey(fullName, organisationName);
  const matches = new Set<string>();

  if (exactKey) {
    for (const profile of profiles) {
      if (nameCompanyDedupKey(profile.full_name, profile.organisation_name) === exactKey) {
        matches.add(profile.id);
      }
    }
  }

  const targetOrg = normaliseOrganisationName(organisationName);
  if (options?.includeFuzzy && targetOrg && fullName?.trim()) {
    for (const profile of profiles) {
      if (matches.has(profile.id)) {
        continue;
      }

      const profileOrg = normaliseOrganisationName(profile.organisation_name);
      if (profileOrg !== targetOrg) {
        continue;
      }

      if (namesAreFuzzyMatch(fullName, profile.full_name)) {
        matches.add(profile.id);
      }
    }
  }

  return [...matches];
}

function collectMatches(
  profiles: ExistingProfileForDedup[],
  predicate: (profile: ExistingProfileForDedup) => boolean,
): string[] {
  return profiles.filter(predicate).map((profile) => profile.id);
}

export function findPhoneMatches(
  phone: string | null | undefined,
  profiles: ExistingProfileForDedup[],
): string[] {
  const key = phoneDedupKey(phone);
  if (!key) {
    return [];
  }

  return collectMatches(profiles, (profile) => phoneDedupKey(profile.phone) === key);
}

export function findLinkedinMatches(
  linkedinUrl: string | null | undefined,
  profiles: ExistingProfileForDedup[],
): string[] {
  const key = linkedinDedupKey(linkedinUrl);
  if (!key) {
    return [];
  }

  return collectMatches(
    profiles,
    (profile) => linkedinDedupKey(profile.linkedin_url) === key,
  );
}
