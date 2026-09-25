import { z } from "zod";

import { postgresUuidSchema } from "@/lib/validators/id";

export const linkEventbriteEventSchema = z
  .object({
    eventbriteEventId: z.string().trim().min(1),
    eventbriteTitle: z.string().trim().min(1),
    eventbriteStartIso: z
      .string()
      .optional()
      .transform((value) => value || null),
    mode: z.enum(["existing", "new"]),
    linkedEventId: postgresUuidSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.mode === "existing" && !data.linkedEventId) {
      ctx.addIssue({
        code: "custom",
        message: "Choose an event to link to",
        path: ["linkedEventId"],
      });
    }
  });

export const resolveEventbriteReviewSchema = z
  .object({
    reviewId: postgresUuidSchema,
    action: z.enum(["link", "create", "ignore"]),
    profileId: postgresUuidSchema.optional(),
    fullName: z
      .string()
      .trim()
      .max(200)
      .optional()
      .transform((value) => value || undefined),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(320)
      .optional()
      .transform((value) => value || undefined),
    role: z
      .string()
      .trim()
      .max(200)
      .optional()
      .transform((value) => value || undefined),
    organisationName: z
      .string()
      .trim()
      .max(200)
      .optional()
      .transform((value) => value || undefined),
  })
  .superRefine((data, ctx) => {
    if (data.action === "link" && !data.profileId) {
      ctx.addIssue({
        code: "custom",
        message: "Choose a profile to link",
        path: ["profileId"],
      });
    }
    if (data.action === "create" && data.email && !data.email.includes("@")) {
      ctx.addIssue({
        code: "custom",
        message: "Enter a valid email",
        path: ["email"],
      });
    }
  });

export type LinkEventbriteEventInput = z.infer<typeof linkEventbriteEventSchema>;
export type ResolveEventbriteReviewInput = z.infer<
  typeof resolveEventbriteReviewSchema
>;
