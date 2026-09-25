import { z } from "zod";

import { postgresUuidSchema } from "@/lib/validators/id";

export const connectionTypeSchema = z.enum([
  "colleague",
  "cofounder",
  "introduced",
  "met_at_event",
  "personal",
  "unknown",
]);

export const connectionStrengthSchema = z.enum([
  "strong",
  "warm",
  "weak",
  "unknown",
]);

export const createManualConnectionSchema = z
  .object({
    profileId: postgresUuidSchema,
    otherProfileId: postgresUuidSchema,
    connectionType: connectionTypeSchema.default("unknown"),
    strength: connectionStrengthSchema.default("unknown"),
    notes: z
      .string()
      .trim()
      .max(2000)
      .optional()
      .transform((value) => value || undefined),
    introducedBy: postgresUuidSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.profileId === data.otherProfileId) {
      ctx.addIssue({
        code: "custom",
        message: "A profile cannot connect to itself",
        path: ["otherProfileId"],
      });
    }

    if (data.connectionType === "introduced" && !data.introducedBy) {
      ctx.addIssue({
        code: "custom",
        message: "Introducer is required for introduced connections",
        path: ["introducedBy"],
      });
    }
  });

export const removeConnectionSchema = z.object({
  profileId: postgresUuidSchema,
  connectionId: postgresUuidSchema,
});

export type CreateManualConnectionInput = z.infer<
  typeof createManualConnectionSchema
>;
