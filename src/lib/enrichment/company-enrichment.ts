import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  pickConsensusOrganisationName,
  rankOrganisationNames,
  resolveCompanySuggestionForEmail,
  type CompanySuggestion,
} from "@/lib/enrichment/company-from-email";
import {
  workEmailDomain,
} from "@/lib/integrations/calendar/company-suggestions";
import { normaliseEmail } from "@/lib/integrations/participant-email";
import { normaliseOrganisationName } from "@/lib/normalise/organisation";
import type { Database } from "@/types/database";

type DbClient = SupabaseClient<Database>;

export type ApplyPeerCompanyResult = {
  updated: number;
  skipped: number;
};

type ProfileEmailRow = {
  id: string;
  email: string | null;
  organisation_name: string | null;
};

export type PeerOrganisationNamesIndex = Map<string, string[]>;

export async function loadPeerOrganisationNamesIndex(
  supabase: DbClient,
  orgId: string,
): Promise<PeerOrganisationNamesIndex> {
  const { data, error } = await supabase
    .from("profiles")
    .select("email, organisation_name")
    .eq("org_id", orgId)
    .not("email", "is", null)
    .not("organisation_name", "is", null);

  if (error) {
    throw new Error(`Failed to load peer companies: ${error.message}`);
  }

  const index: PeerOrganisationNamesIndex = new Map();

  for (const row of data ?? []) {
    const email = row.email ? normaliseEmail(row.email) : null;
    const name = row.organisation_name?.trim();
    if (!email || !name) {
      continue;
    }

    const domain = workEmailDomain(email);
    if (!domain) {
      continue;
    }

    const names = index.get(domain) ?? [];
    names.push(name);
    index.set(domain, names);
  }

  return index;
}

export function peerOrganisationNamesForDomain(
  index: PeerOrganisationNamesIndex,
  domain: string,
): string[] {
  return index.get(domain) ?? [];
}

export async function loadPeerOrganisationNamesForDomain(
  supabase: DbClient,
  orgId: string,
  domain: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("organisation_name")
    .eq("org_id", orgId)
    .ilike("email", `%@${domain}`)
    .not("organisation_name", "is", null);

  if (error) {
    throw new Error(`Failed to load peer companies: ${error.message}`);
  }

  return (data ?? [])
    .map((row) => row.organisation_name?.trim())
    .filter((name): name is string => Boolean(name));
}

export async function getCompanySuggestionForEmail(
  supabase: DbClient,
  orgId: string,
  email: string,
): Promise<CompanySuggestion | null> {
  const domain = workEmailDomain(email);
  if (!domain) {
    return null;
  }

  const peerNames = await loadPeerOrganisationNamesForDomain(
    supabase,
    orgId,
    domain,
  );

  return resolveCompanySuggestionForEmail(email, peerNames);
}

export async function getCompanySuggestionsForEmail(
  supabase: DbClient,
  orgId: string,
  email: string,
): Promise<string[]> {
  const domain = workEmailDomain(email);
  if (!domain) {
    return [];
  }

  return rankOrganisationNames(
    await loadPeerOrganisationNamesForDomain(supabase, orgId, domain),
  ).slice(0, 8);
}

export async function applyPeerCompanyEnrichment(
  supabase: DbClient,
  orgId: string,
): Promise<ApplyPeerCompanyResult> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, organisation_name")
    .eq("org_id", orgId)
    .not("email", "is", null);

  if (error) {
    throw new Error(`Failed to load profiles for company enrichment: ${error.message}`);
  }

  const byDomain = new Map<string, ProfileEmailRow[]>();

  for (const profile of (data ?? []) as ProfileEmailRow[]) {
    const email = profile.email ? normaliseEmail(profile.email) : null;
    if (!email) {
      continue;
    }

    const domain = workEmailDomain(email);
    if (!domain) {
      continue;
    }

    const group = byDomain.get(domain) ?? [];
    group.push(profile);
    byDomain.set(domain, group);
  }

  let updated = 0;
  let skipped = 0;

  for (const group of byDomain.values()) {
    const peerNames = group
      .map((profile) => profile.organisation_name?.trim())
      .filter((name): name is string => Boolean(name));

    const consensus = pickConsensusOrganisationName(peerNames);
    if (!consensus) {
      skipped += group.filter((profile) => !profile.organisation_name?.trim())
        .length;
      continue;
    }

    const normalisedName = normaliseOrganisationName(consensus.name);

    for (const profile of group) {
      if (profile.organisation_name?.trim()) {
        continue;
      }

      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          organisation_name: consensus.name,
          organisation_name_normalised: normalisedName,
        })
        .eq("org_id", orgId)
        .eq("id", profile.id);

      if (updateError) {
        throw new Error(
          `Failed to update profile company: ${updateError.message}`,
        );
      }

      updated += 1;
    }
  }

  return { updated, skipped };
}
