import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isPostgresUniqueViolation } from "@/lib/integrations/calendar/idempotent-insert";
import { normaliseEmail } from "@/lib/integrations/participant-email";
import { normaliseOrganisationName } from "@/lib/normalise/organisation";
import { normalisePersonName } from "@/lib/normalise/person-name";
import type { Database } from "@/types/database";

type AdminClient = SupabaseClient<Database>;

async function findProfileIdByEmail(
  supabase: AdminClient,
  orgId: string,
  email: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("org_id", orgId)
    .eq("email", email)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to check existing profile: ${error.message}`);
  }

  if (data?.id) {
    return data.id;
  }

  const { data: caseMatch, error: caseError } = await supabase
    .from("profiles")
    .select("id")
    .eq("org_id", orgId)
    .ilike("email", email)
    .maybeSingle();

  if (caseError) {
    throw new Error(`Failed to check existing profile: ${caseError.message}`);
  }

  return caseMatch?.id ?? null;
}

export async function createCalendarParticipantProfile(
  supabase: AdminClient,
  params: {
    orgId: string;
    email: string;
    fullName: string;
    organisationName?: string | null;
    occupation?: string | null;
  },
): Promise<string> {
  const email = normaliseEmail(params.email);
  const organisationName = params.organisationName?.trim() || null;
  const occupation = params.occupation?.trim() || null;
  const fullName = normalisePersonName(params.fullName) || params.fullName.trim();

  const existingId = await findProfileIdByEmail(supabase, params.orgId, email);
  if (existingId) {
    return existingId;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .insert({
      org_id: params.orgId,
      full_name: fullName,
      email,
      occupation,
      organisation_name: organisationName,
      organisation_name_normalised: normaliseOrganisationName(organisationName),
      source: "manual",
    })
    .select("id")
    .single();

  if (profileError) {
    if (isPostgresUniqueViolation(profileError)) {
      const racedId = await findProfileIdByEmail(supabase, params.orgId, email);
      if (racedId) {
        return racedId;
      }
    }

    throw new Error(`Failed to create profile: ${profileError.message}`);
  }

  return profile.id;
}
