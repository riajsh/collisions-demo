"use server";

import { revalidatePath } from "next/cache";

import { createProfile } from "@/lib/data/profiles";
import { createProfileSchema } from "@/lib/validators/profiles";

export async function createProfileAction(formData: FormData) {
  const parsed = createProfileSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email") ?? undefined,
    phone: formData.get("phone") ?? undefined,
    linkedinUrl: formData.get("linkedinUrl") ?? undefined,
    websiteUrl: formData.get("websiteUrl") ?? undefined,
    organisationName: formData.get("organisationName") ?? undefined,
    occupation: formData.get("occupation") ?? undefined,
    locationCity: formData.get("locationCity") ?? undefined,
    locationCountry: formData.get("locationCountry") ?? undefined,
    bio: formData.get("bio") ?? undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    const profileId = await createProfile(parsed.data);
    revalidatePath("/");
    revalidatePath("/profiles");
    revalidatePath("/connect");
    revalidatePath("/orbit");
    revalidatePath("/search");
    return { success: true as const, profileId };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to create profile",
    };
  }
}
