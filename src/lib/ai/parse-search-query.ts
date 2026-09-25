import "server-only";

import { parseAiJsonResponse } from "@/lib/ai/parse-ai-json";
import {
  FUNCTIONS,
  INDUSTRIES,
  SENIORITY_LEVELS,
  type Industry,
  type ProfileFunction,
  type SeniorityLevel,
} from "@/lib/ai/profile-attribute-vocab";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5-20251001";

export type ParsedSearchCriteria = {
  /** True if this reads as a description of a kind of person (a role,
   * seniority, industry, etc.) rather than a literal name/company/keyword
   * lookup. False means: skip the reasoning pipeline entirely and just use
   * the existing keyword search — no point spending an AI call reasoning
   * about "Sarah Chen" or "Acme Corp". */
  isDescriptiveQuery: boolean;
  seniority: SeniorityLevel[];
  function: ProfileFunction[];
  industry: Industry[];
  /** True when the query implies "someone we haven't worked with long" —
   * e.g. "new to Nova Collective", "recently met" — used to weight relationship
   * recency during re-ranking rather than as a hard filter. */
  recencyFocus: boolean;
  /** Anything meaningful in the query that the fixed vocab above can't
   * capture (e.g. "early-stage", "non-technical", "scaling company") —
   * passed to the re-ranking step, which reads each candidate's actual
   * bio/title text rather than relying on tags for these. */
  hints: string[];
};

const EMPTY_RESULT: ParsedSearchCriteria = {
  isDescriptiveQuery: false,
  seniority: [],
  function: [],
  industry: [],
  recencyFocus: false,
  hints: [],
};

function buildPrompt(query: string): string {
  return [
    "You're the first stage of a CRM search feature that finds people by description, not just keyword matching — e.g. searching \"senior marketers\" should surface CMOs, Heads of Marketing, and VPs of Marketing even though none of those job titles contain the word \"senior\".",
    "Read the search query and decide: is this describing a KIND of person (a role, seniority level, industry, stage, or similar), or is it a literal lookup for a specific name, company, or exact keyword? Only the first kind should be treated as descriptive.",
    "",
    "If it's a literal lookup (a name, an email, a company name, an exact phrase), respond with isDescriptiveQuery: false and leave every other field empty — the existing keyword search already handles those correctly.",
    "",
    "If it's descriptive, extract EVERY seniority level, function, and industry from the fixed lists below that plausibly fits — be inclusive, not exact. \"Senior marketers\" should match every seniority level that reads as senior in everyday language (Senior, Head/Director, VP, and C-level/Founder all count — not just the literal word \"Senior\"), and the Marketing function.",
    "",
    `Seniority levels (choose zero or more): ${SENIORITY_LEVELS.join(", ")}`,
    `Functions (choose zero or more): ${FUNCTIONS.join(", ")}`,
    `Industries (choose zero or more): ${INDUSTRIES.join(", ")}`,
    "",
    "Also set recencyFocus to true if the query implies someone new to the relationship (e.g. \"new to Nova Collective\", \"recently met\", \"just connected\").",
    "Put anything meaningful the lists above can't capture into \"hints\" as short phrases (e.g. \"early-stage company\", \"non-technical background\", \"scaling company\") — these get checked against each person's actual bio and title later, not matched by tag.",
    "",
    "Examples:",
    '- "Senior marketers in tech businesses" -> {"isDescriptiveQuery": true, "seniority": ["Senior", "Head/Director", "VP", "C-level/Founder"], "function": ["Marketing"], "industry": ["Technology/Software"], "recencyFocus": false, "hints": []}',
    '- "Early-stage founders new to Nova Collective" -> {"isDescriptiveQuery": true, "seniority": ["C-level/Founder"], "function": ["Founder/Executive"], "industry": [], "recencyFocus": true, "hints": ["early-stage company"]}',
    '- "People who have led ops at scaling companies" -> {"isDescriptiveQuery": true, "seniority": ["Head/Director", "VP", "C-level/Founder"], "function": ["Operations"], "industry": [], "recencyFocus": false, "hints": ["scaling company"]}',
    '- "Non-technical co-founders" -> {"isDescriptiveQuery": true, "seniority": ["C-level/Founder"], "function": ["Founder/Executive"], "industry": [], "recencyFocus": false, "hints": ["non-technical background"]}',
    '- "Investors focused on climate tech" -> {"isDescriptiveQuery": true, "seniority": [], "function": ["Investment"], "industry": ["Climate/Cleantech"], "recencyFocus": false, "hints": []}',
    '- "Sarah Chen" -> {"isDescriptiveQuery": false, "seniority": [], "function": [], "industry": [], "recencyFocus": false, "hints": []}',
    "",
    `Query: ${query}`,
    "",
    "Respond with ONLY the JSON object — no other text, no markdown.",
  ].join("\n");
}

function filterValidValues<T extends string>(
  value: unknown,
  options: readonly T[],
): T[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is T =>
    (options as readonly string[]).includes(entry),
  );
}

/**
 * Turns a natural-language search query into structured criteria the
 * candidate lookup can match quickly against the tags every profile
 * already has from enrichProfileAttributes. This only ever reads the query
 * itself (a few words), never the profile database, which is what keeps
 * it fast and cheap regardless of how many profiles exist.
 *
 * Non-throwing: any failure (no API key, bad response, network error)
 * returns the empty/non-descriptive result, which tells the caller to fall
 * back to plain keyword search rather than break it.
 */
export async function parseSearchQuery(
  query: string,
): Promise<ParsedSearchCriteria> {
  const trimmed = query.trim();
  if (!trimmed) {
    return EMPTY_RESULT;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return EMPTY_RESULT;
  }

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        messages: [{ role: "user", content: buildPrompt(trimmed) }],
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      throw new Error(`Anthropic API returned ${response.status}`);
    }

    const data = await response.json();
    const text: string = data?.content?.[0]?.text ?? "";
    const parsed = parseAiJsonResponse(text);

    if (!parsed || typeof parsed !== "object") {
      throw new Error("Unexpected query parse response shape");
    }

    const record = parsed as Record<string, unknown>;

    if (record.isDescriptiveQuery !== true) {
      return EMPTY_RESULT;
    }

    return {
      isDescriptiveQuery: true,
      seniority: filterValidValues(record.seniority, SENIORITY_LEVELS),
      function: filterValidValues(record.function, FUNCTIONS),
      industry: filterValidValues(record.industry, INDUSTRIES),
      recencyFocus: record.recencyFocus === true,
      hints: Array.isArray(record.hints)
        ? record.hints.filter((hint): hint is string => typeof hint === "string").slice(0, 5)
        : [],
    };
  } catch (error) {
    console.error(
      "parseSearchQuery: AI call failed, falling back to keyword search —",
      error instanceof Error ? error.message : error,
    );
    return EMPTY_RESULT;
  }
}
