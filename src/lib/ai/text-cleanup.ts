import "server-only";

import { parseAiJsonResponse } from "@/lib/ai/parse-ai-json";
import { titleCaseWithAcronyms } from "@/lib/normalise/title-case";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
// A small, fast, cheap model — this is short free-text cleanup, not
// anything that needs a bigger model's reasoning.
const MODEL = "claude-haiku-4-5-20251001";

export type CleanedText = {
  value: string;
  // Same reasoning as CompanyRoleSplit's source field: a cached "fallback"
  // result should always get a real AI attempt next time, since the only
  // reason it fell back might have been a since-fixed missing API key or a
  // transient outage, not anything about the text itself.
  source: "ai" | "fallback";
};

function fallback(values: string[]): CleanedText[] {
  return values.map((value) => ({
    value: value ? titleCaseWithAcronyms(value) : value,
    source: "fallback" as const,
  }));
}

function buildPrompt(values: string[]): string {
  return [
    "You clean up short free-text answers people typed into an event registration form (things like job titles).",
    "For each input string, fix spelling mistakes and standardise capitalisation (e.g. \"Title Case\"), but preserve real acronyms exactly (CEO, CTO, VP, HR, IT, SaaS, B2B, etc.) rather than capitalising them like normal words.",
    "Do not change the meaning, do not add or remove words, do not translate.",
    "Respond with ONLY a JSON array of strings, in the exact same order and count as the input, no other text.",
    "",
    `Input: ${JSON.stringify(values)}`,
  ].join("\n");
}

/**
 * Cleans up a batch of short free-text answers (role/job title, mostly)
 * using an AI model — fixes genuine spelling mistakes and formatting that
 * simple title-casing can't (see src/lib/normalise/title-case.ts for the
 * rule-based fallback used here when there's no API key configured, or if
 * the API call fails for any reason). Never throws — always returns
 * something usable, since a sync shouldn't fail just because AI cleanup
 * isn't available right now.
 */
export async function cleanupTextBatch(values: string[]): Promise<CleanedText[]> {
  const trimmed = values.map((value) => value?.trim() ?? "");

  const nonEmpty = trimmed
    .map((value, index) => ({ value, index }))
    .filter((entry) => entry.value.length > 0);

  if (nonEmpty.length === 0) {
    return trimmed.map((value) => ({ value, source: "fallback" as const }));
  }

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return fallback(trimmed);
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
        // Generous headroom for large events — see the matching comment in
        // split-company-role.ts for why this needed raising.
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
      throw new Error("Unexpected AI cleanup response shape");
    }

    const result: CleanedText[] = trimmed.map((value) => ({ value, source: "fallback" as const }));
    nonEmpty.forEach((entry, i) => {
      const cleaned = parsed[i];
      result[entry.index] =
        typeof cleaned === "string" && cleaned.trim()
          ? { value: cleaned.trim(), source: "ai" }
          : { value: titleCaseWithAcronyms(entry.value), source: "fallback" };
    });

    return result;
  } catch (error) {
    // Logged so a real, ongoing problem (bad key, rate limit, Anthropic
    // outage) shows up in the server logs instead of silently and
    // invisibly downgrading every sync to the rough fallback.
    console.error(
      "cleanupTextBatch: AI call failed, using rule-based fallback —",
      error instanceof Error ? error.message : error,
    );
    return fallback(trimmed);
  }
}
