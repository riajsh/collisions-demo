/**
 * Background AI tagging for "intelligent search" — classifies each profile's
 * seniority, function, and industry from their occupation/company/bio, and
 * saves the result as visible tags (category: seniority / function /
 * industry), the same way any other tag works in the app.
 *
 * Requires the 20260824120000_ai_profile_attributes.sql migration to have
 * been run first (adds the seniority/function tag categories, the
 * profile_tags.source column, and the profiles.ai_enrichment_* columns this
 * script reads and writes).
 *
 * Usage:
 *   node --env-file=.env.local scripts/backfill-profile-attributes.mjs --dry-run --limit 8
 *     Sanity-check mode — classifies a handful of profiles with the most
 *     complete data and prints the results. Writes nothing to the database.
 *
 *   node --env-file=.env.local scripts/backfill-profile-attributes.mjs
 *     Runs for real across every profile in the org that needs it (skips
 *     any profile whose occupation/company/bio haven't changed since the
 *     last run, so re-running this later only processes what's new or
 *     changed).
 *
 *   node --env-file=.env.local scripts/backfill-profile-attributes.mjs --force
 *     Re-classifies every profile regardless of whether its source data has
 *     changed — use this after tweaking the prompt/vocab and wanting a full
 *     do-over, not just new/edited profiles.
 */
import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";

const ORG_ID = "11111111-1111-1111-1111-111111111111";
const MODEL = "claude-haiku-4-5-20251001";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

const SENIORITY_LEVELS = [
  "Junior",
  "Mid-level",
  "Senior",
  "Head/Director",
  "VP",
  "C-level/Founder",
];

const FUNCTIONS = [
  "Marketing",
  "Sales",
  "Operations",
  "Engineering",
  "Product",
  "Finance",
  "People/HR",
  "Legal",
  "Design",
  "Customer Success",
  "Founder/Executive",
  "Investment",
  "Other",
];

const INDUSTRIES = [
  "Technology/Software",
  "Fintech",
  "Healthcare",
  "Climate/Cleantech",
  "E-commerce/Retail",
  "Media/Entertainment",
  "Professional Services",
  "Real Estate",
  "Education",
  "Manufacturing",
  "Hospitality/Travel",
  "Non-profit/Government",
  "Investment/VC",
  "Agriculture",
  "Other",
];

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes("--dry-run"),
    // Re-tag everyone, even profiles whose source hash hasn't changed —
    // for when the classifier prompt/vocab itself changes and old guesses
    // need to be redone, not just new/edited profiles.
    force: args.includes("--force"),
    limit: (() => {
      const index = args.indexOf("--limit");
      if (index === -1) return null;
      const value = Number.parseInt(args[index + 1], 10);
      return Number.isFinite(value) ? value : null;
    })(),
  };
}

const PAGE_SIZE = 500;

// Supabase/PostgREST caps a single query at 1000 rows by default. Paging
// explicitly means this keeps working correctly as the org grows past that,
// instead of silently only ever processing the first page.
async function fetchAllProfiles(baseQueryBuilder) {
  const rows = [];
  let from = 0;
  for (;;) {
    const { data, error } = await baseQueryBuilder().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

function computeSourceHash(occupation, organisationName, bio) {
  const raw = `${occupation ?? ""}|${organisationName ?? ""}|${bio ?? ""}`;
  return createHash("sha256").update(raw).digest("hex");
}

// Calls that involve tool use (web search) make Claude prone to narrating
// its reasoning ("Based on the search results, here's my classification:
// {...}") instead of returning bare JSON, even when told not to. If the
// cleaned text isn't valid JSON on its own, fall back to extracting the
// substring between the first "{" and the last "}" rather than giving up.
function parseAiJson(text) {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (firstError) {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      throw firstError;
    }
    return JSON.parse(cleaned.slice(start, end + 1));
  }
}

function buildSeniorityFunctionPrompt({ occupation, bio }) {
  return [
    "You're classifying one CRM profile so a search feature can find them later by role, even when the search terms don't literally appear in their profile.",
    "",
    `Job title: ${occupation ?? "(unknown)"}`,
    `Bio: ${bio ?? "(none)"}`,
    "",
    "Classify this person into exactly these two dimensions, choosing ONLY from the lists given — do not invent new values:",
    `1. Seniority — one of: ${SENIORITY_LEVELS.join(", ")}.`,
    `2. Function — one of: ${FUNCTIONS.join(", ")}.`,
    "",
    "If the job title is missing or too vague to classify either, use null for that field rather than guessing wildly.",
    'Respond with ONLY a JSON object shaped exactly like {"seniority": string|null, "function": string|null}. No other text, no markdown.',
  ].join("\n");
}

function buildIndustryPrompt({ occupation, organisation_name: organisationName, bio }) {
  return [
    "You're figuring out the likely industry of one company, so a CRM search feature can find related profiles later.",
    "",
    `Company: ${organisationName}`,
    occupation ? `The person's job title there: ${occupation}` : "",
    bio ? `Bio: ${bio}` : "",
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

function isValidChoice(value, options) {
  return typeof value === "string" && options.includes(value);
}

// When the web search tool is used, content holds several blocks in
// sequence — Claude's "I'll search for X" preamble, the search call, the
// raw results, and finally its actual answer (sometimes split across
// several small text blocks tied to citations). Only the LAST text block
// is guaranteed to be the answer we asked for, so this takes that rather
// than assuming content[0] like a no-tools response would.
function extractFinalText(content) {
  const textBlocks = (content ?? []).filter((block) => block?.type === "text");
  return textBlocks.length > 0 ? textBlocks[textBlocks.length - 1].text ?? "" : "";
}

// Seniority/function classification, from job title alone — no company
// research needed, so no web search tool, keeping this call fast and cheap.
async function classifySeniorityAndFunction(apiKey, profile) {
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
      messages: [{ role: "user", content: buildSeniorityFunctionPrompt(profile) }],
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API returned ${response.status}`);
  }

  const data = await response.json();
  const text = data?.content?.[0]?.text ?? "";
  const parsed = parseAiJson(text);

  return {
    seniority: isValidChoice(parsed.seniority, SENIORITY_LEVELS) ? parsed.seniority : null,
    function: isValidChoice(parsed.function, FUNCTIONS) ? parsed.function : null,
  };
}

// Industry classification, in its own focused web-search-enabled call.
// This used to be bundled into the same prompt as seniority/function, but
// that made the model far less likely to actually use web search for
// industry — too many competing instructions to reliably follow all of
// them. Splitting it into a single-purpose call fixed that. Skipped
// entirely when there's no company name to look up.
async function classifyIndustry(apiKey, profile) {
  if (!profile.organisation_name?.trim()) {
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
      // preamble, the tool call, and a second pass over the results before
      // the final answer, all within this one response.
      max_tokens: 1024,
      messages: [{ role: "user", content: buildIndustryPrompt(profile) }],
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          // Gives room for a follow-up search if the first is
          // inconclusive (e.g. broaden from "industry" to "what they do"),
          // while still capping cost/latency per profile.
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
  const parsed = parseAiJson(text);
  return isValidChoice(parsed.industry, INDUSTRIES) ? parsed.industry : null;
}

// Kept as one function with the same {seniority, function, industry} shape
// so the caller doesn't need to change — internally this now makes two
// separate calls (see the comment on classifyIndustry for why). If the
// industry call fails after seniority/function already succeeded, this
// still returns the seniority/function result rather than discarding good
// data over an unrelated hiccup.
async function classifyProfile(apiKey, profile) {
  const { seniority, function: profileFunction } = await classifySeniorityAndFunction(
    apiKey,
    profile,
  );

  let industry = null;
  try {
    industry = await classifyIndustry(apiKey, profile);
  } catch (error) {
    console.error(
      `Industry lookup failed for ${profile.full_name}, keeping seniority/function result —`,
      error.message,
    );
  }

  return { seniority, function: profileFunction, industry };
}

async function findOrCreateTag(category, name) {
  // "Other" is a fallback value in BOTH the function and industry
  // vocabularies, so this must match on (org_id, name, category) — matching
  // on name alone would let an "Other"/function tag get reused for
  // "Other"/industry, attaching the wrong category to a profile.
  const { data: existing, error: findError } = await supabase
    .from("tags")
    .select("id")
    .eq("org_id", ORG_ID)
    .eq("name", name)
    .eq("category", category)
    .maybeSingle();
  if (findError) throw findError;
  if (existing) return existing.id;

  const { data: created, error: createError } = await supabase
    .from("tags")
    .insert({ org_id: ORG_ID, name, category })
    .select("id")
    .single();

  if (createError) {
    if (createError.code === "23505") {
      const { data: retry, error: retryError } = await supabase
        .from("tags")
        .select("id")
        .eq("org_id", ORG_ID)
        .eq("name", name)
        .eq("category", category)
        .single();
      if (retryError) throw retryError;
      return retry.id;
    }
    throw createError;
  }

  return created.id;
}

async function replaceAiTag(profileId, category, value) {
  // Load every profile_tags row in this category, not just AI ones — if the
  // AI's chosen tag is already attached manually, skip the upsert entirely
  // rather than flipping that row's source to 'ai_inferred' (the upsert
  // below is keyed on (profile_id, tag_id), so it would otherwise silently
  // overwrite a manual tag's provenance when the ids coincide).
  const { data: existingTagsInCategory, error: existingError } = await supabase
    .from("profile_tags")
    .select("id, tag_id, source, tags!inner(category)")
    .eq("org_id", ORG_ID)
    .eq("profile_id", profileId)
    .eq("tags.category", category);
  if (existingError) throw existingError;

  const existingAiTags = (existingTagsInCategory ?? []).filter(
    (row) => row.source === "ai_inferred",
  );

  const newTagId = value ? await findOrCreateTag(category, value) : null;

  const idsToRemove = existingAiTags
    .filter((row) => row.tag_id !== newTagId)
    .map((row) => row.id);

  if (idsToRemove.length > 0) {
    const { error } = await supabase
      .from("profile_tags")
      .delete()
      .eq("org_id", ORG_ID)
      .in("id", idsToRemove);
    if (error) throw error;
  }

  if (newTagId) {
    const alreadyHasIt = (existingTagsInCategory ?? []).some((row) => row.tag_id === newTagId);
    if (!alreadyHasIt) {
      const { error } = await supabase.from("profile_tags").upsert(
        { org_id: ORG_ID, profile_id: profileId, tag_id: newTagId, source: "ai_inferred" },
        { onConflict: "profile_id,tag_id" },
      );
      if (error) throw error;
    }
  }
}

function buildProfilesQuery() {
  return supabase
    .from("profiles")
    .select("id, full_name, occupation, organisation_name, bio, ai_enrichment_source_hash")
    .eq("org_id", ORG_ID)
    .or("occupation.not.is.null,organisation_name.not.is.null")
    // Explicit order is required for paginated .range() calls to be safe —
    // without it, Postgres doesn't guarantee stable row order across
    // separate paged queries, which could skip or double-fetch rows at
    // page boundaries.
    .order("id", { ascending: true });
}

async function main() {
  const { dryRun, limit, force } = parseArgs();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }

  let profiles;

  if (dryRun || limit) {
    // Sample runs are always small (--limit or the default dry-run sample),
    // so a single page is fine — no need to paginate here.
    let query = buildProfilesQuery();

    if (dryRun) {
      // For the sanity-check sample, prefer profiles with the richest data
      // (occupation AND company) so the preview actually shows off what the
      // classifier can do, rather than a run of mostly-empty ones. Not
      // requiring bio too — it's an optional field this org's data doesn't
      // use at all, so requiring it would return zero rows.
      query = query
        .not("occupation", "is", null)
        .not("organisation_name", "is", null)
        .order("updated_at", { ascending: false });
    }

    if (limit) {
      query = query.limit(limit);
    }

    const { data, error } = await query;
    if (error) throw error;
    profiles = data;
  } else {
    // Full run, no limit — page through everything so this stays correct
    // regardless of how many profiles the org has (PostgREST caps a single
    // query at 1000 rows by default).
    profiles = await fetchAllProfiles(buildProfilesQuery);
  }

  console.log(
    `${dryRun ? "[DRY RUN] " : ""}${force ? "[FORCE] " : ""}Classifying ${profiles.length} profile(s)...`,
  );

  let tagged = 0;
  let skippedUnchanged = 0;
  let failed = 0;

  for (const profile of profiles) {
    const sourceHash = computeSourceHash(
      profile.occupation,
      profile.organisation_name,
      profile.bio,
    );

    if (!dryRun && !force && profile.ai_enrichment_source_hash === sourceHash) {
      skippedUnchanged += 1;
      continue;
    }

    try {
      const result = await classifyProfile(apiKey, profile);

      console.log(
        `${profile.full_name} (${profile.occupation ?? "?"} @ ${profile.organisation_name ?? "?"}) ->`,
        result,
      );

      if (!dryRun) {
        await Promise.all([
          replaceAiTag(profile.id, "seniority", result.seniority),
          replaceAiTag(profile.id, "function", result.function),
          replaceAiTag(profile.id, "industry", result.industry),
        ]);

        const { error: updateError } = await supabase
          .from("profiles")
          .update({
            ai_enrichment_generated_at: new Date().toISOString(),
            ai_enrichment_source_hash: sourceHash,
          })
          .eq("id", profile.id)
          .eq("org_id", ORG_ID);
        if (updateError) throw updateError;
      }

      tagged += 1;
    } catch (classifyError) {
      console.error(`Failed for ${profile.full_name} (${profile.id}):`, classifyError.message);
      failed += 1;
    }
  }

  console.log({ tagged, skippedUnchanged, failed, dryRun });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
