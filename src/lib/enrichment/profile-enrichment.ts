import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { CompanySuggestion } from "@/lib/enrichment/company-from-email";
import { resolveCompanySuggestionForEmail } from "@/lib/enrichment/company-from-email";
import {
  getCompanySuggestionForEmail,
  loadPeerOrganisationNamesIndex,
  peerOrganisationNamesForDomain,
} from "@/lib/enrichment/company-enrichment";
import { workEmailDomain } from "@/lib/integrations/calendar/company-suggestions";
import {
  getOwnerSuggestionForEmail,
  getOwnerSuggestionForProfile,
  type OwnerSuggestion,
} from "@/lib/enrichment/owner-enrichment";
import { getOrgId } from "@/lib/auth/session";
import {
  isInternalParticipant,
  loadOrgParticipantFilters,
} from "@/lib/integrations/participant-email";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type DbClient = SupabaseClient<Database>;

export type ProfileEnrichmentSuggestions = {
  company: CompanySuggestion | null;
  owner: OwnerSuggestion | null;
};

export async function getEmailEnrichmentSuggestionsForOrg(
  supabase: DbClient,
  orgId: string,
  email: string,
): Promise<ProfileEnrichmentSuggestions> {
  const [company, owner] = await Promise.all([
    getCompanySuggestionForEmail(supabase, orgId, email),
    getOwnerSuggestionForEmail(supabase, orgId, email),
  ]);

  return { company, owner };
}

export async function getProfileEnrichmentSuggestions(
  profileId: string,
): Promise<ProfileEnrichmentSuggestions> {
  const orgId = await getOrgId();
  const supabase = await createClient();

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, email, organisation_name")
    .eq("org_id", orgId)
    .eq("id", profileId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load profile for suggestions: ${error.message}`);
  }

  if (!profile) {
    throw new Error("Profile not found");
  }

  if (profile.email) {
    const filters = await loadOrgParticipantFilters(supabase, orgId);
    if (isInternalParticipant(profile.email, filters)) {
      return { company: null, owner: null };
    }
  }

  const [owner, company] = await Promise.all([
    getOwnerSuggestionForProfile(supabase, orgId, profileId),
    profile.organisation_name?.trim()
      ? Promise.resolve(null)
      : profile.email
        ? getCompanySuggestionForEmail(supabase, orgId, profile.email)
        : Promise.resolve(null),
  ]);

  return { company, owner };
}

export async function getEmailEnrichmentSuggestions(
  email: string,
): Promise<ProfileEnrichmentSuggestions> {
  const orgId = await getOrgId();
  const supabase = await createClient();
  return getEmailEnrichmentSuggestionsForOrg(supabase, orgId, email);
}

export type ProfileEnrichmentBatchInput = {
  id: string;
  email: string | null;
  organisationName: string | null;
  hasOwner: boolean;
};

export async function getProfileEnrichmentSuggestionsBatch(
  profiles: ProfileEnrichmentBatchInput[],
): Promise<Map<string, ProfileEnrichmentSuggestions>> {
  const result = new Map<string, ProfileEnrichmentSuggestions>();

  for (const profile of profiles) {
    result.set(profile.id, { company: null, owner: null });
  }

  if (profiles.length === 0) {
    return result;
  }

  const orgId = await getOrgId();
  const supabase = await createClient();
  const [filters, peerIndex] = await Promise.all([
    loadOrgParticipantFilters(supabase, orgId),
    loadPeerOrganisationNamesIndex(supabase, orgId),
  ]);

  for (const profile of profiles) {
    if (profile.organisationName?.trim() || !profile.email) {
      continue;
    }

    if (isInternalParticipant(profile.email, filters)) {
      continue;
    }

    const domain = workEmailDomain(profile.email);
    if (!domain) {
      continue;
    }

    const company = resolveCompanySuggestionForEmail(
      profile.email,
      peerOrganisationNamesForDomain(peerIndex, domain),
    );

    if (company) {
      result.get(profile.id)!.company = company;
    }
  }

  const ownerCandidates = profiles.filter((profile) => !profile.hasOwner);

  await Promise.all(
    ownerCandidates.map(async (profile) => {
      const owner = await getOwnerSuggestionForProfile(
        supabase,
        orgId,
        profile.id,
      );

      if (owner) {
        result.get(profile.id)!.owner = owner;
      }
    }),
  );

  return result;
}
