/**
 * One-off cleanup: remove the two leftover placeholder team members
 * (old "jordan@novacollective.io" Jordan entry, and the generic "team@novacollective.io" owner)
 * that are no longer in team-members.json but still exist in the database
 * from before the roster was updated.
 *
 * Anything they created or own is reassigned to the current Jordan account
 * first, so nothing is silently lost, then the two stale accounts are
 * deleted from both auth and public.users.
 *
 * Usage: node --env-file=.env.local scripts/cleanup-legacy-team-members.mjs
 */
import { createClient } from "@supabase/supabase-js";

const ORG_ID = "11111111-1111-1111-1111-111111111111";
const STALE_IDS = [
  "22222222-2222-2222-2222-222222222230", // old jordan@novacollective.io placeholder
  "22222222-2222-2222-2222-222222222228", // generic team@novacollective.io placeholder
];
const NEW_RIA_ID = "22222222-2222-2222-2222-222222222231";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function reassignColumn(table, column) {
  const { data, error } = await supabase
    .from(table)
    .update({ [column]: NEW_RIA_ID })
    .in(column, STALE_IDS)
    .eq("org_id", ORG_ID)
    .select("id");

  if (error) throw new Error(`${table}.${column}: ${error.message}`);
  if (data?.length) {
    console.log(`  reassigned ${data.length} row(s) in ${table}.${column}`);
  }
}

async function reassignRelationshipOwners() {
  const { data: staleRows, error } = await supabase
    .from("relationship_owners")
    .select("id, relationship_id, user_id")
    .eq("org_id", ORG_ID)
    .in("user_id", STALE_IDS);

  if (error) throw new Error(`relationship_owners select: ${error.message}`);
  if (!staleRows?.length) return;

  for (const row of staleRows) {
    const { data: existing, error: existingError } = await supabase
      .from("relationship_owners")
      .select("id")
      .eq("relationship_id", row.relationship_id)
      .eq("user_id", NEW_RIA_ID)
      .maybeSingle();

    if (existingError) throw new Error(`relationship_owners check: ${existingError.message}`);

    if (existing) {
      // Jordan is already an owner of this relationship — drop the stale duplicate.
      const { error: deleteError } = await supabase
        .from("relationship_owners")
        .delete()
        .eq("id", row.id);
      if (deleteError) throw new Error(`relationship_owners delete: ${deleteError.message}`);
    } else {
      const { error: updateError } = await supabase
        .from("relationship_owners")
        .update({ user_id: NEW_RIA_ID })
        .eq("id", row.id);
      if (updateError) throw new Error(`relationship_owners update: ${updateError.message}`);
    }
  }

  console.log(`  resolved ${staleRows.length} row(s) in relationship_owners.user_id`);
}

async function main() {
  console.log("Reassigning references from the stale placeholders to Jordan...");
  await reassignRelationshipOwners();
  await reassignColumn("imports", "created_by");
  await reassignColumn("calendar_accounts", "user_id");
  await reassignColumn("gmail_accounts", "user_id");
  await reassignColumn("activities", "created_by");
  await reassignColumn("activities", "introduced_by");
  await reassignColumn("connections", "introduced_by");
  await reassignColumn("calendar_participant_reviews", "reviewed_by");
  await reassignColumn("email_participant_reviews", "reviewed_by");

  console.log("\nDeleting the two stale accounts...");
  for (const id of STALE_IDS) {
    const { error: publicError } = await supabase
      .from("users")
      .delete()
      .eq("id", id)
      .eq("org_id", ORG_ID);
    if (publicError) throw new Error(`users delete (${id}): ${publicError.message}`);

    const { error: authError } = await supabase.auth.admin.deleteUser(id);
    if (authError && authError.status !== 404) {
      throw new Error(`auth delete (${id}): ${authError.message}`);
    }
    console.log(`  removed ${id}`);
  }

  const { data: users, error: listError } = await supabase
    .from("users")
    .select("full_name, email")
    .eq("org_id", ORG_ID)
    .order("full_name");
  if (listError) throw new Error(listError.message);

  console.log("\nTeam in database now:");
  for (const user of users ?? []) {
    console.log(`  - ${user.full_name} (${user.email})`);
  }
}

main().catch((error) => {
  console.error("\nCleanup failed:", error.message);
  process.exit(1);
});
