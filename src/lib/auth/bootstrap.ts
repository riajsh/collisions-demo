import type { User } from "@supabase/supabase-js";

import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

type UserRow = Database["public"]["Tables"]["users"]["Row"];

function readOrgIdFromInvite(authUser: User): string | null {
  const orgId = authUser.app_metadata?.org_id;
  return typeof orgId === "string" && orgId.length > 0 ? orgId : null;
}

function readFullName(authUser: User): string {
  const metadata = authUser.user_metadata;
  const fromMetadata =
    typeof metadata?.full_name === "string"
      ? metadata.full_name
      : typeof metadata?.name === "string"
        ? metadata.name
        : null;

  if (fromMetadata?.trim()) {
    return fromMetadata.trim();
  }

  const emailPrefix = authUser.email?.split("@")[0]?.trim();
  return emailPrefix || "User";
}

async function resolveOrgId(authUser: User): Promise<string> {
  const inviteOrgId = readOrgIdFromInvite(authUser);
  if (inviteOrgId) {
    return inviteOrgId;
  }

  const admin = createAdminClient();
  const { data: org, error } = await admin
    .from("organisations")
    .select("id")
    .eq("slug", env.DEFAULT_ORG_SLUG)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to resolve default org: ${error.message}`);
  }

  if (!org) {
    throw new Error(
      `No organisation found for DEFAULT_ORG_SLUG="${env.DEFAULT_ORG_SLUG}"`,
    );
  }

  return org.id;
}

export async function bootstrapUser(authUser: User): Promise<UserRow> {
  if (!authUser.email) {
    throw new Error("Authenticated user is missing an email address");
  }

  const admin = createAdminClient();
  const orgId = await resolveOrgId(authUser);

  const fullName = readFullName(authUser);

  const { data: inserted, error: insertError } = await admin
    .from("users")
    .insert({
      id: authUser.id,
      org_id: orgId,
      email: authUser.email,
      full_name: fullName,
      role: "member",
    })
    .select()
    .maybeSingle();

  if (insertError) {
    if (insertError.code === "23505") {
      const { data: existing, error: fetchError } = await admin
        .from("users")
        .select()
        .eq("id", authUser.id)
        .single();

      if (fetchError) {
        throw new Error(`Failed to load existing user row: ${fetchError.message}`);
      }

      return existing;
    }

    throw new Error(`Failed to bootstrap user row: ${insertError.message}`);
  }

  if (inserted) {
    return inserted;
  }

  const { data: existing, error: fetchError } = await admin
    .from("users")
    .select()
    .eq("id", authUser.id)
    .single();

  if (fetchError) {
    throw new Error(`Failed to load bootstrapped user row: ${fetchError.message}`);
  }

  return existing;
}
