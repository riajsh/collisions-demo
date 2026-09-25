import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import { bootstrapUser } from "@/lib/auth/bootstrap";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

export type AppUser = Database["public"]["Tables"]["users"]["Row"];

async function getAuthUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}

async function getUserRow(authUserId: string): Promise<AppUser | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .select("id, org_id, email, full_name, role, created_at, updated_at")
    .eq("id", authUserId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load user row: ${error.message}`);
  }

  return data;
}

export async function ensureUserRow(authUser: User): Promise<AppUser> {
  const existing = await getUserRow(authUser.id);
  if (existing) {
    return existing;
  }

  return bootstrapUser(authUser);
}

export async function getSessionUser(): Promise<AppUser | null> {
  const authUser = await getAuthUser();
  if (!authUser) {
    return null;
  }

  return ensureUserRow(authUser);
}

export async function requireUser(): Promise<AppUser> {
  const authUser = await getAuthUser();
  if (!authUser) {
    redirect("/login");
  }

  return ensureUserRow(authUser);
}

export async function getOrgId(): Promise<string> {
  const user = await requireUser();
  return user.org_id;
}

export async function requireAdmin(): Promise<AppUser> {
  const user = await requireUser();

  if (user.role !== "admin") {
    redirect("/");
  }

  return user;
}
