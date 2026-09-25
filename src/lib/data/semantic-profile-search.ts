import "server-only";

import { parseSearchQuery, type ParsedSearchCriteria } from "@/lib/ai/parse-search-query";
import {
  rerankSearchCandidates,
  type RerankCandidate,
} from "@/lib/ai/rerank-search-candidates";
import { createClient } from "@/lib/supabase/server";

export type SemanticProfileMatch = {
  profileId: string;
  fullName: string;
  organisationName: string | null;
  reason: string;
};

// Jordan wants to see every relevant profile to compare candidates, not just
// a partial slice — so this is sized to comfortably cover the whole org
// (matches Supabase/PostgREST's own default per-query row cap) rather
// than an arbitrary small cutoff. The tradeoff: a very broad query now
// sends more candidates to Claude for the review pass, which costs more
// and takes a little longer than a tightly-capped list would — acceptable
// since this only runs per interactive search, not in bulk.
const MAX_CANDIDATES_FOR_RERANK = 1000;

/**
 * Finds every profile whose AI-inferred tags include one of the given
 * values in one category — e.g. every profile tagged Function: Marketing.
 * Returns null (meaning "no constraint from this dimension") when no
 * values were requested, so the caller can tell "matches everything" apart
 * from "matches nothing".
 */
async function profileIdsWithTagValues(
  orgId: string,
  category: string,
  values: string[],
): Promise<Set<string> | null> {
  if (values.length === 0) {
    return null;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profile_tags")
    .select("profile_id, tags!inner(name, category)")
    .eq("org_id", orgId)
    .eq("tags.category", category)
    .in("tags.name", values);

  if (error) {
    throw new Error(`Failed to look up ${category} tags: ${error.message}`);
  }

  return new Set((data ?? []).map((row) => row.profile_id));
}

function intersectConstraints(sets: Array<Set<string> | null>): Set<string> | null {
  const constraints = sets.filter((set): set is Set<string> => set !== null);
  if (constraints.length === 0) {
    return null;
  }

  return constraints.reduce((acc, set) => {
    const intersection = new Set<string>();
    for (const id of acc) {
      if (set.has(id)) {
        intersection.add(id);
      }
    }
    return intersection;
  });
}

async function loadCandidateDetails(
  orgId: string,
  profileIds: string[],
): Promise<RerankCandidate[]> {
  if (profileIds.length === 0) {
    return [];
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(
      `
      id,
      full_name,
      occupation,
      organisation_name,
      bio,
      relationships ( status, created_at ),
      profile_tags ( tags ( name ) )
    `,
    )
    .eq("org_id", orgId)
    .in("id", profileIds)
    .order("full_name", { ascending: true })
    .limit(MAX_CANDIDATES_FOR_RERANK);

  if (error) {
    throw new Error(`Failed to load candidate profiles: ${error.message}`);
  }

  return (data ?? []).map((row) => {
    const relationship = row.relationships?.[0] as
      | { status: string; created_at: string }
      | undefined;
    const tagNames = (row.profile_tags ?? [])
      .map((entry) => (entry.tags as { name: string } | null)?.name)
      .filter((name): name is string => Boolean(name));

    return {
      profileId: row.id,
      fullName: row.full_name,
      occupation: row.occupation,
      organisationName: row.organisation_name,
      bio: row.bio,
      relationshipStatus: relationship?.status ?? null,
      relationshipCreatedAt: relationship?.created_at ?? null,
      tagNames,
    };
  });
}

/**
 * The full "intelligent search" pipeline for profiles: parse the query into
 * structured criteria, look up candidates by tag (fast, exact, no AI
 * needed), then have Sonnet review and rank the shortlist. Returns null
 * when the query doesn't look descriptive (a literal name/company search)
 * or matched no structured criteria at all — the caller should fall back
 * to the existing keyword search in that case, not treat it as "zero
 * results".
 */
export async function semanticProfileSearch(
  query: string,
  orgId: string,
): Promise<SemanticProfileMatch[] | null> {
  const criteria: ParsedSearchCriteria = await parseSearchQuery(query);

  if (!criteria.isDescriptiveQuery) {
    return null;
  }

  const [seniorityIds, functionIds, industryIds] = await Promise.all([
    profileIdsWithTagValues(orgId, "seniority", criteria.seniority),
    profileIdsWithTagValues(orgId, "function", criteria.function),
    profileIdsWithTagValues(orgId, "industry", criteria.industry),
  ]);

  const candidateIds = intersectConstraints([seniorityIds, functionIds, industryIds]);

  if (candidateIds === null || candidateIds.size === 0) {
    return null;
  }

  const candidates = await loadCandidateDetails(orgId, [...candidateIds]);
  const candidatesById = new Map(candidates.map((candidate) => [candidate.profileId, candidate]));

  const reranked = await rerankSearchCandidates(
    query,
    criteria.hints,
    criteria.recencyFocus,
    candidates,
  );

  return reranked.flatMap((match) => {
    const candidate = candidatesById.get(match.profileId);
    if (!candidate) {
      return [];
    }
    return [
      {
        profileId: match.profileId,
        fullName: candidate.fullName,
        organisationName: candidate.organisationName,
        reason: match.reason,
      },
    ];
  });
}
