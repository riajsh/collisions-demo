import "server-only";

import { getOrgId, requireAdmin, requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { CreateTagInput, ProfileTagInput } from "@/lib/validators/tags";
import type { Database } from "@/types/database";

type TagCategory = Database["public"]["Tables"]["tags"]["Row"]["category"];

export type OrgTag = {
  id: string;
  name: string;
  category: TagCategory;
  profileCount: number;
};

async function assertProfileInOrg(profileId: string, orgId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", profileId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to verify profile: ${error.message}`);
  }

  if (!data) {
    throw new Error("Profile not found");
  }
}

export async function listOrgTags(): Promise<OrgTag[]> {
  const orgId = await getOrgId();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tags")
    .select(
      `
      id,
      name,
      category,
      profile_tags (count)
    `,
    )
    .eq("org_id", orgId)
    .order("name");

  if (error) {
    throw new Error(`Failed to list tags: ${error.message}`);
  }

  return (data ?? []).map((tag) => {
    const countRow = tag.profile_tags?.[0] as { count: number } | undefined;

    return {
      id: tag.id,
      name: tag.name,
      category: tag.category,
      profileCount: countRow?.count ?? 0,
    };
  });
}

export type EventTag = {
  id: string;
  name: string;
  createdAt: string;
};

/**
 * Event-category tags only, newest first — used by the Search page's event
 * filter. Unlike listOrgTags (every category, alphabetical, no cap), this
 * is scoped to just the "events" category and ordered by recency so the
 * events someone's most likely to filter by (something recent) sort to the
 * top rather than being buried alphabetically.
 */
export async function listEventTags(): Promise<EventTag[]> {
  const orgId = await getOrgId();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tags")
    .select("id, name, created_at")
    .eq("org_id", orgId)
    .eq("category", "events")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to list event tags: ${error.message}`);
  }

  return (data ?? []).map((tag) => ({
    id: tag.id,
    name: tag.name,
    createdAt: tag.created_at,
  }));
}

export async function createTag(input: CreateTagInput): Promise<OrgTag> {
  await requireAdmin();
  const orgId = await getOrgId();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tags")
    .insert({
      org_id: orgId,
      name: input.name.trim(),
      category: input.category,
    })
    .select("id, name, category")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new Error(`A tag named "${input.name}" already exists`);
    }
    throw new Error(`Failed to create tag: ${error.message}`);
  }

  return {
    id: data.id,
    name: data.name,
    category: data.category,
    profileCount: 0,
  };
}

export async function deleteTag(tagId: string): Promise<void> {
  await requireAdmin();
  const orgId = await getOrgId();
  const supabase = await createClient();

  const { error } = await supabase
    .from("tags")
    .delete()
    .eq("id", tagId)
    .eq("org_id", orgId);

  if (error) {
    throw new Error(`Failed to delete tag: ${error.message}`);
  }
}

export async function addTagToProfile(input: ProfileTagInput): Promise<void> {
  await requireUser();
  const orgId = await getOrgId();
  const supabase = await createClient();

  await assertProfileInOrg(input.profileId, orgId);

  const { data: tag, error: tagError } = await supabase
    .from("tags")
    .select("id")
    .eq("id", input.tagId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (tagError) {
    throw new Error(`Failed to verify tag: ${tagError.message}`);
  }

  if (!tag) {
    throw new Error("Tag not found");
  }

  const { error } = await supabase.from("profile_tags").upsert(
    {
      org_id: orgId,
      profile_id: input.profileId,
      tag_id: input.tagId,
    },
    { onConflict: "profile_id,tag_id" },
  );

  if (error) {
    throw new Error(`Failed to add tag: ${error.message}`);
  }
}

export async function removeTagFromProfile(input: ProfileTagInput): Promise<void> {
  await requireUser();
  const orgId = await getOrgId();
  const supabase = await createClient();

  await assertProfileInOrg(input.profileId, orgId);

  const { error } = await supabase
    .from("profile_tags")
    .delete()
    .eq("org_id", orgId)
    .eq("profile_id", input.profileId)
    .eq("tag_id", input.tagId);

  if (error) {
    throw new Error(`Failed to remove tag: ${error.message}`);
  }
}
