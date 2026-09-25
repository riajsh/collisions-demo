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

export type ProfileAttributeInput = {
  occupation: string | null;
  organisationName: string | null;
  bio: string | null;
};

export type ProfileAttributeResult = {
  seniority: SeniorityLevel | null;
  function: ProfileFunction | null;
  industry: Industry | null;
  /** Whether this came from a real AI read or was skipped (no API key, the
   * call failed, or there wasn't enough to go on). Callers should only
   * persist / mark a profile as enriched when this is "ai" — a "fallback"
   * result should be retried next time, not treated as a completed guess
   * of "we looked and found nothing". */
  source: "ai" | "fallback";
};

const FALLBACK_RESULT: ProfileAttributeResult = {
  seniority: null,
  function: null,
  industry: null,
  source: "fallback",
};

function isValidChoice<T extends string>(
  value: unknown,
  options: readonly T[],
): value is T {
  return typeof value === "string" && (options as readonly string[]).includes(value);
}

/**
 * When the web search tool is used, the response's content array holds
 * several blocks in sequence — Claude's "I'll search for X" preamble,
 * the search call itself, the raw results, and finally its actual answer
 * (sometimes split across several small text blocks tied to citations).
 * Only the LAST text block is guaranteed to be the answer we asked for,
 * so this takes that rather than assuming content[0] like a no-tools
 * response would.
 */
function extractFinalText(content: unknown): string {
  if (!Array.isArray(content)) {
    return "";
  }
  const textBlocks = content.filter(
    (block): block is { type: "text"; text: string } =>
      Boolean(block) && typeof block === "object" && (block as { type?: unknown }).type === "text",
  );
  return textBlocks.length > 0 ? textBlocks[textBlocks.length - 1].text : "";
}

function buildSeniorityFunctionPrompt(input: ProfileAttributeInput): string {
  return [
    "You're classifying one CRM profile so a search feature can find them later by role, even when the search terms don't literally appear in their profile.",
    "",
    `Job title: ${input.occupation ?? "(unknown)"}`,
    `Bio: ${input.bio ?? "(none)"}`,
    "",
    "Classify this person into exactly these two dimensions, choosing ONLY from the lists given — do not invent new values:",
    `1. Seniority — one of: ${SENIORITY_LEVELS.join(", ")}.`,
    `2. Function — one of: ${FUNCTIONS.join(", ")}.`,
    "",
    "If the job title is missing or too vague to classify either, use null for that field rather than guessing wildly.",
    'Respond with ONLY a JSON object shaped exactly like {"seniority": string|null, "function": string|null}. No other text, no markdown.',
  ].join("\n");
}

/**
 * Classifies seniority and function from job title alone — no company
 * research needed here, so no web search tool, which keeps this call fast
 * and cheap. Split out from industry classification (see
 * classifyIndustry) because bundling all three into one prompt made the
 * model far less likely to actually use web search for industry — it had
 * too many competing instructions to reliably follow all of them.
 */
async function classifySeniorityAndFunction(
  apiKey: string,
  input: ProfileAttributeInput,
): Promise<{ seniority: SeniorityLevel | null; function: ProfileFunction | null }> {
  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 300,
      messages: [{ role: "user", content: buildSeniorityFunctionPrompt(input) }],
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API returned ${response.status}`);
  }

  const data = await response.json();
  const text: string = data?.content?.[0]?.text ?? "";
  const parsed = parseAiJsonResponse(text);

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Unexpected seniority/function classification response shape");
  }

  const record = parsed as Record<string, unknown>;

  return {
    seniority: isValidChoice(record.seniority, SENIORITY_LEVELS) ? record.seniority : null,
    function: isValidChoice(record.function, FUNCTIONS) ? record.function : null,
  };
}

function buildIndustryPrompt(input: ProfileAttributeInput): string {
  return [
    "You're figuring out the likely industry of one company, so a CRM search feature can find related profiles later.",
    "",
    `Company: ${input.organisationName}`,
    input.occupation ? `The person's job title there: ${input.occupation}` : "",
    input.bio ? `Bio: ${input.bio}` : "",
    "",
    "If you already recognise this company (e.g. you know Xero is fintech/accounting software), use that. If you don't recognise it, use the web_search tool to look it up (e.g. search the company name together with \"industry\" or \"what they do\") before answering.",
    `Choose the closest matching industry from this list, choosing ONLY from it — do not invent new values: ${INDUSTRIES.join(", ")}.`,
    "If the search turns up anything at all about what the company does — even just a tagline, a one-line description, or the general kind of product/service it offers — use your best judgment to pick the closest matching category. An approximate match is more useful than leaving it blank, so don't require full certainty.",
    "Only answer null if a search turns up nothing about the company at all, or multiple different companies share the exact name with no way to tell which one this is.",
    'End your turn with ONLY a JSON object shaped exactly like {"industry": string|null} as your final message — no other text, no markdown, even if you searched first.',
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Classifies a company's industry alone, using its own focused web-search
 * enabled call — see the comment on classifySeniorityAndFunction for why
 * this is split out rather than bundled with the other two dimensions.
 * Skipped entirely when there's no company name to look up.
 */
async function classifyIndustry(
  apiKey: string,
  input: ProfileAttributeInput,
): Promise<Industry | null> {
  if (!input.organisationName?.trim()) {
    return null;
  }

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      // Higher than a no-tools call needs — a search round trip adds a
      // preamble, the tool call, and a second pass over the results
      // before the final answer, all within this one response.
      max_tokens: 1024,
      messages: [{ role: "user", content: buildIndustryPrompt(input) }],
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          // Gives room for a follow-up search if the first is
          // inconclusive (e.g. broaden from "industry" to "what they
          // do"), while still capping cost/latency per profile.
          max_uses: 3,
        },
      ],
    }),
    // Longer than a no-tools call — a real web search adds latency on top
    // of the model call itself.
    signal: AbortSignal.timeout(45_000),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API returned ${response.status}`);
  }

  const data = await response.json();
  const text = extractFinalText(data?.content);
  const parsed = parseAiJsonResponse(text);

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Unexpected industry classification response shape");
  }

  const record = parsed as Record<string, unknown>;
  return isValidChoice(record.industry, INDUSTRIES) ? record.industry : null;
}

/**
 * Classifies a single profile's seniority, function, and industry using
 * Claude's reasoning and general knowledge — this is the "background
 * tagging" half of intelligent search (see parse-search-query.ts for the
 * other half, which reads what a person typed). Never throws: a missing
 * API key, a failed call, or a profile with nothing to go on all just
 * return the fallback so the caller can skip persisting anything rather
 * than crash whatever triggered this (a profile save, a bulk backfill run).
 *
 * Seniority/function and industry run as two separate API calls (see
 * classifySeniorityAndFunction / classifyIndustry) — if the industry call
 * fails after seniority/function already succeeded, this still returns
 * the seniority/function result rather than discarding good data over an
 * unrelated hiccup.
 */
export async function enrichProfileAttributes(
  input: ProfileAttributeInput,
): Promise<ProfileAttributeResult> {
  if (!input.occupation?.trim() && !input.organisationName?.trim()) {
    // Nothing to reason about — no point spending an API call to learn
    // "unknown, unknown, unknown".
    return FALLBACK_RESULT;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return FALLBACK_RESULT;
  }

  let seniority: SeniorityLevel | null = null;
  let profileFunction: ProfileFunction | null = null;

  try {
    const result = await classifySeniorityAndFunction(apiKey, input);
    seniority = result.seniority;
    profileFunction = result.function;
  } catch (error) {
    console.error(
      "enrichProfileAttributes: seniority/function call failed, skipping this profile —",
      error instanceof Error ? error.message : error,
    );
    return FALLBACK_RESULT;
  }

  let industry: Industry | null = null;
  try {
    industry = await classifyIndustry(apiKey, input);
  } catch (error) {
    console.error(
      "enrichProfileAttributes: industry call failed, keeping seniority/function result —",
      error instanceof Error ? error.message : error,
    );
  }

  return {
    seniority,
    function: profileFunction,
    industry,
    source: "ai",
  };
}
