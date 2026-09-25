import "server-only";

import { parseAiJsonResponse } from "@/lib/ai/parse-ai-json";

// Sonnet, not Haiku, for this step specifically — this is the one place in
// the pipeline that has to make genuinely ambiguous judgment calls (does
// "led ops at scaling companies" really fit this person's actual history?),
// which is exactly the kind of reasoning Sonnet is worth the extra cost for.
// Both the enrichment classifier and the query parser use Haiku since
// those are much more constrained, closer-to-mechanical tasks.
const MODEL = "claude-sonnet-5";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

// Large candidate lists are reviewed in parallel batches instead of one
// giant sequential call. Same total work (every candidate still gets read
// and judged), but wall-clock time scales with the size of one batch
// instead of the whole list, since the batches run concurrently. Below the
// threshold, a single call is simplest and already fast enough.
const BATCH_THRESHOLD = 250;
const BATCH_SIZE = 200;

export type RerankCandidate = {
  profileId: string;
  fullName: string;
  occupation: string | null;
  organisationName: string | null;
  bio: string | null;
  relationshipStatus: string | null;
  relationshipCreatedAt: string | null;
  tagNames: string[];
};

export type RerankedMatch = {
  profileId: string;
  reason: string;
};

type ScoredMatch = RerankedMatch & { score: number };

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

function buildPrompt(
  query: string,
  hints: string[],
  recencyFocus: boolean,
  candidates: RerankCandidate[],
): string {
  const lines = [
    "You're reviewing a shortlist of CRM profiles that were already pre-matched by role, seniority, and industry tags for a search query. Some may not genuinely fit despite matching those tags — filter those out.",
    "",
    `Search query: "${query}"`,
  ];

  if (hints.length > 0) {
    lines.push(`Also weigh: ${hints.join(", ")}`);
  }

  if (recencyFocus) {
    lines.push(
      "The query implies someone new to this relationship — prefer candidates with 'prospect' status or a recently created relationship when it's a close call.",
    );
  }

  lines.push("", "Candidates:");

  candidates.forEach((candidate, index) => {
    const bioSnippet = candidate.bio
      ? candidate.bio.slice(0, 200)
      : "(no bio)";
    lines.push(
      `${index + 1}. ${candidate.fullName} — ${candidate.occupation ?? "unknown role"} at ${candidate.organisationName ?? "unknown company"}. Bio: ${bioSnippet}. Relationship: ${candidate.relationshipStatus ?? "none"}, added ${candidate.relationshipCreatedAt ?? "unknown"}. Tags: ${candidate.tagNames.join(", ") || "none"}`,
    );
  });

  lines.push(
    "",
    // A numeric fit score (rather than just "best match first" ordering)
    // is what lets separately-reviewed batches be merged back into one
    // globally-ranked list afterward — order alone only works within a
    // single call's candidates.
    'Respond with ONLY a JSON array of the candidates that genuinely fit, shaped exactly like [{"index": number, "score": number, "reason": "short reason, under 12 words"}]. "score" is 0-100, how well they fit the query — use the full range, don\'t cluster everything near the top. Use the 1-based candidate numbers above. Omit any candidate that doesn\'t genuinely fit — it\'s fine to return an empty array. No other text, no markdown.',
  );

  return lines.join("\n");
}

/**
 * Reviews one batch of candidates with a single Sonnet call. Non-throwing:
 * on any failure, returns every candidate in the batch unranked (score 0,
 * no reason) rather than dropping results a person was expecting to see
 * just because this extra judgment step had a hiccup.
 */
async function reviewBatch(
  apiKey: string,
  query: string,
  hints: string[],
  recencyFocus: boolean,
  candidates: RerankCandidate[],
): Promise<ScoredMatch[]> {
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
        // Scales with this batch's size rather than a flat number — the
        // output is one {index, score, reason} entry per genuine match.
        // Sonnet supports up to 128k output tokens, so this stays
        // comfortably under that even at the full batch size.
        max_tokens: Math.min(32_000, 500 + candidates.length * 60),
        messages: [
          { role: "user", content: buildPrompt(query, hints, recencyFocus, candidates) },
        ],
      }),
      // Generous per batch — reviewing candidates and writing a JSON
      // response both take real time, and this now only has to cover one
      // batch's worth of work rather than the whole candidate list.
      signal: AbortSignal.timeout(90_000),
    });

    if (!response.ok) {
      throw new Error(`Anthropic API returned ${response.status}`);
    }

    const data = await response.json();
    const text: string = data?.content?.[0]?.text ?? "";
    const parsed = parseAiJsonResponse(text);

    if (!Array.isArray(parsed)) {
      throw new Error("Unexpected re-rank response shape");
    }

    const matches: ScoredMatch[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object") continue;
      const record = entry as Record<string, unknown>;
      const index = typeof record.index === "number" ? record.index - 1 : -1;
      const candidate = candidates[index];
      if (!candidate) continue;
      const score = typeof record.score === "number" ? record.score : 0;
      matches.push({
        profileId: candidate.profileId,
        reason: typeof record.reason === "string" ? record.reason : "",
        score,
      });
    }

    return matches;
  } catch (error) {
    console.error(
      "rerankSearchCandidates: batch review failed, returning its candidates unranked —",
      error instanceof Error ? error.message : error,
    );
    return candidates.map((candidate) => ({
      profileId: candidate.profileId,
      reason: "",
      score: 0,
    }));
  }
}

/**
 * The "double check" step of intelligent search: candidates were already
 * narrowed down by exact tag matching (fast, free), but tags alone can't
 * judge nuance — whether a "Head/Director" tagged as "Operations" really
 * counts as someone who has "led ops at scaling companies", for instance.
 * This reads each candidate's actual bio/title and the original query, and
 * returns only the genuine matches, best fit first.
 *
 * Large candidate lists are split into parallel batches (see BATCH_SIZE)
 * rather than reviewed in one sequential call, then merged back into a
 * single ranked list by fit score — cuts wall-clock time roughly in
 * proportion to the number of batches for a broad query, at effectively no
 * extra cost (the only overhead is repeating the short instructions in
 * each batch's prompt).
 *
 * Non-throwing: on any failure, returns every candidate unranked (in their
 * original order, no reason) rather than dropping results a person was
 * expecting to see just because this extra judgment step had a hiccup.
 */
export async function rerankSearchCandidates(
  query: string,
  hints: string[],
  recencyFocus: boolean,
  candidates: RerankCandidate[],
): Promise<RerankedMatch[]> {
  if (candidates.length === 0) {
    return [];
  }

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return candidates.map((candidate) => ({
      profileId: candidate.profileId,
      reason: "",
    }));
  }

  const batches =
    candidates.length > BATCH_THRESHOLD
      ? chunk(candidates, BATCH_SIZE)
      : [candidates];

  const batchResults = await Promise.all(
    batches.map((batch) => reviewBatch(apiKey, query, hints, recencyFocus, batch)),
  );

  return batchResults
    .flat()
    .sort((a, b) => b.score - a.score)
    .map(({ profileId, reason }) => ({ profileId, reason }));
}
