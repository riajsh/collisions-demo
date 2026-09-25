import { z } from "zod";

import { postgresUuidSchema } from "@/lib/validators/id";

export const tagCategorySchema = z.enum([
  "expertise",
  "industry",
  "signal_influence",
  "events",
  "seniority",
  "function",
]);

export const createTagSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  category: tagCategorySchema.default("expertise"),
});

export const profileTagSchema = z.object({
  profileId: postgresUuidSchema,
  tagId: postgresUuidSchema,
});

export type CreateTagInput = z.infer<typeof createTagSchema>;
export type ProfileTagInput = z.infer<typeof profileTagSchema>;
