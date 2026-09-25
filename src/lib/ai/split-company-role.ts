import "server-only";

import { parseAiJsonResponse } from "@/lib/ai/parse-ai-json";
import { titleCaseWithAcronyms } from "@/lib/normalise/title-case";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5-20251001";

export type CompanyRoleSplit = {
  role: string | null;
  company: string | null;
  // Whether this came from the real AI read or the rough rule-based
  // fallback — callers that cache results should only treat "ai" results
  // as safe to reuse indefinitely; a cached "fallback" result should always
  // get another real attempt next time, in case the AI wasn't available
  // (or was mid-outage) the first time this exact answer was seen.
  source: "ai" | "fallback";
};

// Real examples from Jordan's forms mixing role/company in one free-text answer,
// in every order and separator imaginable: "Co founder", "Lumin, VP of
// Growth", "CSO - Pyper Vision", "Founder & CEO, Lumin", "Chief Marketing
// Officer at LawVu", even multiple roles at once ("Pyper Vision - Chair,
// Victory and Grace - Co-Founder, Chitogel - Director"). There's no reliable
// fixed pattern — this needs actual reading comprehension, not string
// splitting, which is why the AI path is the real fix and the fallback below
// is a rough approximation at best.
const ROLE_KEYWORDS = [
  "ceo",
  "cto",
  "cfo",
  "coo",
  "cmo",
  "cpo",
  "cio",
  "ciso",
  "cro",
  "cso",
  "vp",
  "svp",
  "evp",
  "avp",
  "chief",
  "founder",
  "co-founder",
  "cofounder",
  "co founder",
  "president",
  "chair",
  "director",
  "manager",
  "lead",
  "head",
  "partner",
  "owner",
  "executive",
];

function looksLikeRole(segment: string): boolean {
  const lower = segment.toLowerCase();
  return ROLE_KEYWORDS.some((keyword) => lower.includes(keyword));
}

/** Rough, rule-based fallback for when there's no AI key configured — only
 * handles the simple two-part case reliably; anything with multiple
 * role/company pairs or no recognisable role keyword just falls back to
 * putting the whole answer in "role" so nothing is silently lost, and
 * leaving company blank for a human (or a later AI-assisted pass) to sort out. */
function fallbackSplit(value: string): CompanyRoleSplit {
  const trimmed = value.trim();
  if (!trimmed) {
    return { role: null, company: null, source: "fallback" };
  }

  const atMatch = trimmed.match(/^(.+?)\s+at\s+(.+)$/i);
  if (atMatch) {
    return {
      role: titleCaseWithAcronyms(atMatch[1]),
      company: titleCaseWithAcronyms(atMatch[2]),
      source: "fallback",
    };
  }

  const parts = trimmed.split(/,| - | – /).map((part) => part.trim()).filter(Boolean);
  if (parts.length === 2) {
    const [first, second] = parts;
    if (looksLikeRole(first) && !looksLikeRole(second)) {
      return {
        role: titleCaseWithAcronyms(first),
        company: titleCaseWithAcronyms(second),
        source: "fallback",
      };
    }
    if (looksLikeRole(second) && !looksLikeRole(first)) {
      return {
        role: titleCaseWithAcronyms(second),
        company: titleCaseWithAcronyms(first),
        source: "fallback",
      };
    }
  }

  return { role: titleCaseWithAcronyms(trimmed), company: null, source: "fallback" };
}

function buildPrompt(values: string[]): string {
  return [
    "Each input string is one person's free-text answer to a form question asking for their company AND their role/title together, in no fixed order or format (e.g. \"Lumin, VP of Growth\", \"CSO - Pyper Vision\", \"Founder & CEO, Lumin\", \"Chief Marketing Officer at LawVu\").",
    "For each input, extract the company/organisation name and the role/job title as separate values.",
    "If someone lists multiple companies/roles, use only the first one mentioned.",
    "If you can't confidently identify the company, or the role, leave that one as null — don't guess wildly.",
    "Fix obvious spelling/casing issues in both fields (preserve real acronyms like CEO, VP, CMO).",
    "Respond with ONLY a JSON array, one object per input in the same order, each shaped exactly like {\"role\": string|null, \"company\": string|null}. No other text.",
    "",
    `Input: ${JSON.stringify(values)}`,
  ].join("\n");
}

/**
 * Splits a batch of combined "company & role" free-text answers into
 * separate role/company values. Uses the AI model when available (this is
 * genuinely a reading-comprehension task, not something regex can do
 * reliably — see the real examples in the comments above), and a much
 * rougher rule-based fallback otherwise. Never throws.
 */
export async function splitCompanyAndRoleBatch(
  values: string[],
): Promise<CompanyRoleSplit[]> {
  const trimmed = values.map((value) => value?.trim() ?? "");

  const nonEmpty = trimmed
    .map((value, index) => ({ value, index }))
    .filter((entry) => entry.value.length > 0);

  if (nonEmpty.length === 0) {
    return trimmed.map(() => ({ role: null, company: null, source: "fallback" as const }));
  }

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return trimmed.map((value) =>
      value ? fallbackSplit(value) : { role: null, company: null, source: "fallback" as const },
    );
  }

  try {
    // 30s cap so a hung Anthropic request can't stall a sync chunk
    // indefinitely — a timeout hits the catch block below just like any
    // other failure, and falls back cleanly for this batch.
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        // Generous headroom for large events: each reply item is a small
        // {"role":...,"company":...} object, but a big attendee list adds
        // up fast, and a reply cut off mid-array fails to parse just like
        // any other malformed response — falling the whole batch back to
        // the rough guesser, not just the overflow.
        max_tokens: 16000,
        messages: [
          { role: "user", content: buildPrompt(nonEmpty.map((entry) => entry.value)) },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new Error(`Anthropic API returned ${response.status}`);
    }

    const data = await response.json();
    const text: string = data?.content?.[0]?.text ?? "";
    const parsed = parseAiJsonResponse(text);

    if (!Array.isArray(parsed) || parsed.length !== nonEmpty.length) {
      throw new Error("Unexpected AI split response shape");
    }

    const result: CompanyRoleSplit[] = trimmed.map(() => ({
      role: null,
      company: null,
      source: "fallback" as const,
    }));
    nonEmpty.forEach((entry, i) => {
      const item = parsed[i];
      if (item && typeof item === "object") {
        result[entry.index] = {
          role: typeof item.role === "string" && item.role.trim() ? item.role.trim() : null,
          company:
            typeof item.company === "string" && item.company.trim() ? item.company.trim() : null,
          source: "ai",
        };
      } else {
        result[entry.index] = fallbackSplit(entry.value);
      }
    });

    return result;
  } catch (error) {
    // Logged so a real, ongoing problem (bad key, rate limit, Anthropic
    // outage) shows up in the server logs instead of silently and
    // invisibly downgrading every sync to the rough fallback.
    console.error(
      "splitCompanyAndRoleBatch: AI call failed, using rule-based fallback —",
      error instanceof Error ? error.message : error,
    );
    return trimmed.map((value) =>
      value ? fallbackSplit(value) : { role: null, company: null, source: "fallback" as const },
    );
  }
}
