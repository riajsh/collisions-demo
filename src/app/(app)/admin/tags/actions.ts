"use server";

import { revalidatePath } from "next/cache";

import { createTag, deleteTag } from "@/lib/data/tags";
import { createTagSchema } from "@/lib/validators/tags";
import { postgresUuidSchema } from "@/lib/validators/id";

function revalidateTags() {
  revalidatePath("/admin");
  revalidatePath("/admin/tags");
  revalidatePath("/profiles");
}

export async function createTagAction(formData: FormData) {
  const parsed = createTagSchema.safeParse({
    name: formData.get("name"),
    category: formData.get("category"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    await createTag(parsed.data);
    revalidateTags();
    return { success: true as const };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to create tag",
    };
  }
}

export async function deleteTagAction(formData: FormData) {
  const parsed = postgresUuidSchema.safeParse(formData.get("tagId"));

  if (!parsed.success) {
    return { error: "Invalid tag ID" };
  }

  try {
    await deleteTag(parsed.data);
    revalidateTags();
    return { success: true as const };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to delete tag",
    };
  }
}
