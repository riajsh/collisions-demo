import "server-only";

import { createHash } from "crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { enrichProfileAttributes } from "@/lib/ai/enrich-profile-attributes";
import type { Database } from "@/types/database";

type TagCategory = Database["public"]["Tables"]["tags"]["Row"]["category"];

export type EnrichProfileOutcome =
  | {
      status: "tagged";
      seniority: string | null;
      function: string | null;
      industry: string | null;
    }
  | { status: "skipped_unchanged" }
  | { status: "skipped_no_signal" }
  | { status: "skipped_ai_unavailable" }
  | { status: "error"; message: string };

function computeSourceHash(
  occupation: string | null,
  organisationName: string | null,
  bio: string | null,
): string {
  const raw = `${occupation ?? ""}|${organisationName ?? ""}|${bio ?? ""}`;
  return createHash("sha256").update(raw).digest("hex");
}

async function findOrCreateTag(
  supabase: SupabaseClient<Database>,
  orgId: string,
  category: TagCategory,
  name: string,
): Promise<string> {
  const { data: existing, error: findError } = await supabase
    .from("tags")
    .select("id")
    .eq("org_id", orgId)
    .eq("name", name)
    .eq("category", category)
    .maybeSingle();

  if (findError) {
    throw new Error(`Failed to look up tag: ${findError.message}`);
  }

  if (existing) {
    return existing.id;
  }

  const { data: created, error: createError } = await supabase
    .from("tags")
    .insert({ org_id: orgId, name, category })
    .select("id")
    .single();

  if (createError) {
    // Race: another concurrent enrichment call created the same tag
    // between our lookup and insert (tags are unique on
    // (org_id, name, category)) — look it up again rather than failing
    // the whole profile over a harmless race between two background jobs.
    if (createError.code === "23505") {
      const { data: retry, error: retryError } = await supabase
        .from("tags")
        .select("id")
        .eq("org_id", orgId)
        .eq("name", name)
        .eq("category", category)
        .single();
      if (retryError) {
        throw new Error(`Failed to recover from tag race: ${retryError.message}`);
      }
      return retry.id;
    }
    throw new Error(`Failed to create tag: ${createError.message}`);
  }

  return created.id;
}

/**
 * Makes a profile's AI-inferred tag in one category (seniority, function,
 * or industry) match `value` exactly — removing a stale AI guess if the
 * classification changed, adding the new one if it's missing, and never
 * touching a tag a human added by hand (source = 'manual'), even in the
 * 'industry' category where both can coexist.
 */
async function replaceAiTag(
  supabase: SupabaseClient<Database>,
  orgId: string,
  profileId: string,
  category: TagCategory,
  value: string | null,
): Promise<void> {
  // Load every profile_tags row in this category, not just AI ones — we
  // need to know about manual rows too, so that if the AI's chosen tag
  // happens to already be attached manually we skip the upsert entirely
  // rather than flipping that row's source to 'ai_inferred'. Upserting on
  // (profile_id, tag_id) would silently overwrite a manual tag's
  // provenance if the ids coincide, which breaks the "never touch a
  // human-added tag" guarantee this function is supposed to uphold.
  const { data: existingTagsInCategory, error: existingError } = await supabase
    .from("profile_tags")
    .select("id, tag_id, source, tags!inner(category)")
    .eq("org_id", orgId)
    .eq("profile_id", profileId)
    .eq("tags.category", category);

  if (existingError) {
    throw new Error(`Failed to load existing tags: ${existingError.message}`);
  }

  const existingAiTags = (existingTagsInCategory ?? []).filter(
    (row) => row.source === "ai_inferred",
  );

  const newTagId = value ? await findOrCreateTag(supabase, orgId, category, value) : null;

  const idsToRemove = existingAiTags
    .filter((row) => row.tag_id !== newTagId)
    .map((row) => row.id);

  if (idsToRemove.length > 0) {
    const { error: deleteError } = await supabase
      .from("profile_tags")
      .delete()
      .eq("org_id", orgId)
      .in("id", idsToRemove);

    if (deleteError) {
      throw new Error(`Failed to clear old AI tag: ${deleteError.message}`);
    }
  }

  if (newTagId) {
    const alreadyHasIt = (existingTagsInCategory ?? []).some(
      (row) => row.tag_id === newTagId,
    );
    if (!alreadyHasIt) {
      const { error: insertError } = await supabase.from("profile_tags").upsert(
        {
          org_id: orgId,
          profile_id: profileId,
          tag_id: newTagId,
          source: "ai_inferred",
        },
        { onConflict: "profile_id,tag_id" },
      );

      if (insertError) {
        throw new Error(`Failed to save AI tag: ${insertError.message}`);
      }
    }
  }
}

/**
 * The background half of "intelligent search": classifies one profile's
 * seniority, function, and industry from its occupation/company/bio, and
 * saves the result as visible tags. Skips cleanly (no API call, no error)
 * when there's nothing to go on or the profile hasn't changed since the
 * last run — safe to call after every profile save, or in bulk across the
 * whole org, without worrying about wasted spend on repeats.
 *
 * Takes an already-constructed Supabase client so callers can pass either
 * the request-scoped client (profile save flows) or the admin client (the
 * standalone backfill script, which has no user session to scope to).
 */
export async function enrichAndTagProfile(
  supabase: SupabaseClient<Database>,
  profileId: string,
  orgId: string,
): Promise<EnrichProfileOutcome> {
  try {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("occupation, organisation_name, bio, ai_enrichment_source_hash")
      .eq("id", profileId)
      .eq("org_id", orgId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to load profile: ${error.message}`);
    }

    if (!profile) {
      throw new Error("Profile not found");
    }

    const sourceHash = computeSourceHash(
      profile.occupation,
      profile.organisation_name,
      profile.bio,
    );

    if (profile.ai_enrichment_source_hash === sourceHash) {
      return { status: "skipped_unchanged" };
    }

    if (!profile.occupation?.trim() && !profile.organisation_name?.trim()) {
      return { status: "skipped_no_signal" };
    }

    if (!process.env.ANTHROPIC_API_KEY?.trim()) {
      return { status: "skipped_ai_unavailable" };
    }

    const result = await enrichProfileAttributes({
      occupation: profile.occupation,
      organisationName: profile.organisation_name,
      bio: profile.bio,
    });

    if (result.source === "fallback") {
      return { status: "error", message: "AI classification call failed" };
    }

    await Promise.all([
      replaceAiTag(supabase, orgId, profileId, "seniority", result.seniority),
      replaceAiTag(supabase, orgId, profileId, "function", result.function),
      replaceAiTag(supabase, orgId, profileId, "industry", result.industry),
    ]);

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        ai_enrichment_generated_at: new Date().toISOString(),
        ai_enrichment_source_hash: sourceHash,
      })
      .eq("id", profileId)
      .eq("org_id", orgId);

    if (updateError) {
      throw new Error(`Failed to save enrichment timestamp: ${updateError.message}`);
    }

    return {
      status: "tagged",
      seniority: result.seniority,
      function: result.function,
      industry: result.industry,
    };
  } catch (error) {
    console.error(
      `enrichAndTagProfile: failed for profile ${profileId} —`,
      error instanceof Error ? error.message : error,
    );
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export type EnrichStaleProfilesStats = {
  scanned: number;
  tagged: number;
  skippedUnchanged: number;
  skippedNoSignal: number;
  skippedAiUnavailable: number;
  failed: number;
  /** True if the time budget ran out before scanning every candidate
   * profile — safe to leave as-is: whoever's left still has a stale/absent
   * ai_enrichment_source_hash, so the next scheduled run picks them up
   * automatically. There's no cursor to save here, unlike the Eventbrite
   * sync — "needs enrichment" is a stateless, idempotent check per profile
   * (does the stored hash match current data?), not a multi-step process
   * with intermediate state to lose. */
  ranOutOfTime: boolean;
};

const SCAN_PAGE_SIZE = 500;

/**
 * The catch-up half of automatic tagging: enrichAndTagProfile only ever
 * runs when a human edits a profile through the UI, or when the CSV import
 * flow explicitly calls it — profiles created or updated some other way
 * (Eventbrite sync writes directly to the profiles table, bypassing both)
 * never get tagged unless something else goes looking for them. This scans
 * every profile in an org with enough data to classify and calls
 * enrichAndTagProfile on each; the function's own hash check makes this
 * cheap to run repeatedly, since only genuinely new/changed profiles ever
 * result in a real AI call — everyone else is a fast skip.
 *
 * Bounded by a time budget rather than running to completion, since an org
 * could have any number of profiles needing a real (slow, sometimes
 * web-search-backed) classification on a given day. Meant to be called
 * from a scheduled cron, not interactively.
 */
export async function enrichStaleProfilesForOrg(
  supabase: SupabaseClient<Database>,
  orgId: string,
  options: { maxDurationMs?: number } = {},
): Promise<EnrichStaleProfilesStats> {
  const deadline = Date.now() + (options.maxDurationMs ?? 450_000);

  const stats: EnrichStaleProfilesStats = {
    scanned: 0,
    tagged: 0,
    skippedUnchanged: 0,
    skippedNoSignal: 0,
    skippedAiUnavailable: 0,
    failed: 0,
    ranOutOfTime: false,
  };

  let from = 0;
  for (;;) {
    const { data: candidates, error } = await supabase
      .from("profiles")
      .select("id")
      .eq("org_id", orgId)
      .or("occupation.not.is.null,organisation_name.not.is.null")
      .order("id", { ascending: true })
      .range(from, from + SCAN_PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Failed to load candidate profiles: ${error.message}`);
    }

    if (!candidates || candidates.length === 0) {
      break;
    }

    for (const candidate of candidates) {
      if (Date.now() >= deadline) {
        stats.ranOutOfTime = true;
        return stats;
      }

      stats.scanned += 1;
      const outcome = await enrichAndTagProfile(supabase, candidate.id, orgId);

      switch (outcome.status) {
        case "tagged":
          stats.tagged += 1;
          break;
        case "skipped_unchanged":
          stats.skippedUnchanged += 1;
          break;
        case "skipped_no_signal":
          stats.skippedNoSignal += 1;
          break;
        case "skipped_ai_unavailable":
          stats.skippedAiUnavailable += 1;
          break;
        case "error":
          stats.failed += 1;
          break;
      }
    }

    if (candidates.length < SCAN_PAGE_SIZE) {
      break;
    }
    from += SCAN_PAGE_SIZE;
  }

  return stats;
}
