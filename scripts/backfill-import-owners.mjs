/**
 * Assign missing primary owners from a completed import CSV.
 * Usage: node --env-file=.env.local scripts/backfill-import-owners.mjs [importId]
 */
import { createClient } from "@supabase/supabase-js";

const ORG_ID = "11111111-1111-1111-1111-111111111111";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

function resolveOrgUserId(value, users) {
  if (!value?.trim()) return null;

  for (const segment of value.split(",").map((part) => part.trim()).filter(Boolean)) {
    const lower = segment.toLowerCase();
    if (lower.includes("@")) {
      const byEmail = users.find((user) => user.email.toLowerCase() === lower);
      if (byEmail) return byEmail.id;
    }

    const exact = users.find((user) => user.full_name.toLowerCase() === lower);
    if (exact) return exact.id;

    const firstMatches = users.filter((user) => {
      const first = user.full_name.toLowerCase().split(/\s+/)[0];
      return first === lower;
    });
    if (firstMatches.length === 1) return firstMatches[0].id;
  }

  return null;
}

async function getImportId() {
  const arg = process.argv[2];
  if (arg) return arg;

  const { data, error } = await supabase
    .from("imports")
    .select("id")
    .eq("org_id", ORG_ID)
    .eq("status", "complete")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("No completed import found");
  return data.id;
}

async function main() {
  const importId = await getImportId();
  console.log("Backfilling owners for import", importId);

  const [{ data: users }, { data: rows }, { data: primaryOwners }] = await Promise.all([
    supabase.from("users").select("id, email, full_name").eq("org_id", ORG_ID),
    supabase
      .from("import_rows")
      .select("raw, normalized, dedup_status, matched_profile_id")
      .eq("import_id", importId)
      .in("dedup_status", ["new", "matched_email"]),
    supabase.from("relationship_owners").select("relationship_id").eq("is_primary", true),
  ]);

  const ownedRelationshipIds = new Set(
    (primaryOwners ?? []).map((owner) => owner.relationship_id),
  );

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, email")
    .eq("org_id", ORG_ID);

  const emailToProfileId = new Map(
    (profiles ?? [])
      .filter((profile) => profile.email)
      .map((profile) => [profile.email.toLowerCase(), profile.id]),
  );

  let assigned = 0;
  let unresolved = 0;
  let skipped = 0;

  for (const row of rows ?? []) {
    const ownerRef = String(row.raw?.["Relationship Owner"] ?? "").trim();
    if (!ownerRef) {
      skipped += 1;
      continue;
    }

    let profileId = row.matched_profile_id;
    if (!profileId) {
      const email = (row.normalized?.email || row.raw?.Email || "").toLowerCase();
      profileId = emailToProfileId.get(email) ?? null;
    }
    if (!profileId) {
      skipped += 1;
      continue;
    }

    const { data: relationship } = await supabase
      .from("relationships")
      .select("id")
      .eq("org_id", ORG_ID)
      .eq("profile_id", profileId)
      .maybeSingle();

    if (!relationship || ownedRelationshipIds.has(relationship.id)) {
      skipped += 1;
      continue;
    }

    const ownerUserId = resolveOrgUserId(ownerRef, users ?? []);
    if (!ownerUserId) {
      unresolved += 1;
      continue;
    }

    await supabase
      .from("relationship_owners")
      .update({ is_primary: false })
      .eq("relationship_id", relationship.id)
      .eq("org_id", ORG_ID);

    const { error } = await supabase.from("relationship_owners").upsert(
      {
        org_id: ORG_ID,
        relationship_id: relationship.id,
        user_id: ownerUserId,
        strength: row.normalized?.owner_strength ?? "unknown",
        is_primary: true,
      },
      { onConflict: "relationship_id,user_id" },
    );

    if (error) throw error;

    ownedRelationshipIds.add(relationship.id);
    assigned += 1;
  }

  console.log({ assigned, unresolved, skipped });

  const { count: withOwner } = await supabase
    .from("relationship_owners")
    .select("*", { count: "exact", head: true })
    .eq("is_primary", true);

  console.log("Primary owners now:", withOwner);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
