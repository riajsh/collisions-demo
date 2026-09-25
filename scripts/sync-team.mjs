/**
 * Sync team users to Supabase (local or remote).
 * Source of truth: src/config/team-members.json
 *
 * Usage: npm run sync:team
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const teamConfig = JSON.parse(
  readFileSync(join(__dirname, "../src/config/team-members.json"), "utf8"),
);

const ORG_ID = teamConfig.localDevOrgId;
const TEAM = teamConfig.members;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const DEV_PASSWORD = "password123";

function authUserPayload(member) {
  return {
    email: member.email,
    password: DEV_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: member.fullName },
    app_metadata: {
      provider: "email",
      providers: ["email"],
      org_id: ORG_ID,
    },
  };
}

async function findAuthUserByEmail(email) {
  const normalised = email.trim().toLowerCase();
  let page = 1;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 1000,
    });

    if (error) {
      throw error;
    }

    const match = data.users.find(
      (user) => user.email?.trim().toLowerCase() === normalised,
    );

    if (match) {
      return match;
    }

    if (data.users.length < 1000) {
      return null;
    }

    page += 1;
  }
}

async function ensureAuthUser(member) {
  const { data: byId, error: lookupError } =
    await supabase.auth.admin.getUserById(member.id);

  if (lookupError && lookupError.status !== 404) {
    throw lookupError;
  }

  if (byId?.user) {
    const { error } = await supabase.auth.admin.updateUserById(
      member.id,
      authUserPayload(member),
    );

    if (error) {
      throw error;
    }

    return { result: "updated", userId: member.id };
  }

  const byEmail = await findAuthUserByEmail(member.email);

  if (byEmail) {
    const { error } = await supabase.auth.admin.updateUserById(
      byEmail.id,
      authUserPayload(member),
    );

    if (error) {
      throw error;
    }

    return { result: "updated-by-email", userId: byEmail.id };
  }

  const { error } = await supabase.auth.admin.createUser({
    id: member.id,
    ...authUserPayload(member),
  });

  if (error) {
    throw error;
  }

  return { result: "created", userId: member.id };
}

async function ensurePublicUser(member, userId) {
  if (userId !== member.id) {
    const { error: deleteError } = await supabase
      .from("users")
      .delete()
      .eq("id", member.id)
      .eq("org_id", ORG_ID);

    if (deleteError) {
      throw deleteError;
    }
  }

  const { error } = await supabase.from("users").upsert(
    {
      id: userId,
      org_id: ORG_ID,
      email: member.email,
      full_name: member.fullName,
      role: member.role,
    },
    { onConflict: "id" },
  );

  if (error) {
    throw error;
  }
}

async function main() {
  const synced = [];

  for (const member of TEAM) {
    const { result, userId } = await ensureAuthUser(member);
    synced.push({ member, userId });
    console.log(`${member.fullName}: auth ${result} (${userId})`);
  }

  for (const { member, userId } of synced) {
    await ensurePublicUser(member, userId);
    console.log(`${member.fullName}: public.users ok (${userId})`);
  }

  const { data: users } = await supabase
    .from("users")
    .select("full_name, email")
    .eq("org_id", ORG_ID)
    .order("full_name");

  console.log("\nTeam in database:");
  for (const user of users ?? []) {
    console.log(`  - ${user.full_name} (${user.email})`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
