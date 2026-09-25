import { workEmailDomain } from "@/lib/integrations/calendar/company-suggestions";
import { normaliseOrganisationName } from "@/lib/normalise/organisation";

export type CompanySuggestionSource = "peer" | "domain";
export type CompanySuggestionConfidence = "unanimous" | "majority" | "heuristic";

export type CompanySuggestion = {
  name: string;
  source: CompanySuggestionSource;
  confidence: CompanySuggestionConfidence;
};

function pickBestDisplayName(displayCounts: Map<string, number>): string {
  return [...displayCounts.entries()].sort(
    ([leftName, leftCount], [rightName, rightCount]) =>
      rightCount - leftCount ||
      leftName.localeCompare(rightName, undefined, { sensitivity: "base" }),
  )[0]![0];
}

export function rankOrganisationNames(names: string[]): string[] {
  const counts = new Map<string, number>();

  for (const raw of names) {
    const name = raw.trim();
    if (!name) {
      continue;
    }

    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort(
      ([leftName, leftCount], [rightName, rightCount]) =>
        rightCount - leftCount ||
        leftName.localeCompare(rightName, undefined, { sensitivity: "base" }),
    )
    .map(([name]) => name);
}

export function pickConsensusOrganisationName(
  names: string[],
): { name: string; confidence: "unanimous" | "majority" } | null {
  const trimmed = names.map((name) => name.trim()).filter(Boolean);
  if (trimmed.length === 0) {
    return null;
  }

  const byNormalised = new Map<
    string,
    { count: number; displayNames: Map<string, number> }
  >();

  for (const name of trimmed) {
    const key = normaliseOrganisationName(name) ?? name.toLowerCase();
    const entry = byNormalised.get(key) ?? {
      count: 0,
      displayNames: new Map<string, number>(),
    };
    entry.count += 1;
    entry.displayNames.set(name, (entry.displayNames.get(name) ?? 0) + 1);
    byNormalised.set(key, entry);
  }

  if (byNormalised.size !== 1) {
    const ranked = [...byNormalised.entries()].sort(
      (a, b) => b[1].count - a[1].count,
    );
    const top = ranked[0];
    const second = ranked[1];
    if (!top || (second && top[1].count <= second[1].count)) {
      return null;
    }

    return {
      name: pickBestDisplayName(top[1].displayNames),
      confidence: top[1].count === trimmed.length ? "unanimous" : "majority",
    };
  }

  const group = [...byNormalised.values()][0]!;
  return {
    name: pickBestDisplayName(group.displayNames),
    confidence: "unanimous",
  };
}

export function companyNameFromDomain(domain: string): string | null {
  const normalised = domain.trim().toLowerCase().replace(/^www\./, "");
  const segments = normalised.split(".").filter(Boolean);

  if (segments.length < 2) {
    return null;
  }

  const base = segments[0];
  if (!base || base.length < 2) {
    return null;
  }

  return base
    .split(/[-_]+/)
    .filter(Boolean)
    .map(
      (word) =>
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join(" ");
}

export function resolveCompanySuggestionForEmail(
  email: string,
  peerOrganisationNames: string[],
): CompanySuggestion | null {
  const domain = workEmailDomain(email);
  if (!domain) {
    return null;
  }

  const consensus = pickConsensusOrganisationName(peerOrganisationNames);
  if (consensus) {
    return {
      name: consensus.name,
      source: "peer",
      confidence: consensus.confidence,
    };
  }

  const fromDomain = companyNameFromDomain(domain);
  if (!fromDomain) {
    return null;
  }

  return {
    name: fromDomain,
    source: "domain",
    confidence: "heuristic",
  };
}
