import { z } from "zod";

import { postgresUuidSchema } from "@/lib/validators/id";

export const manualActivityTypeSchema = z.enum([
  "note",
  "meeting",
  "introduction",
]);

export const introductionOutcomeSchema = z.enum([
  "pending",
  "accepted",
  "led_to_meeting",
  "no_response",
]);

export const createManualActivitySchema = z
  .object({
    profileId: postgresUuidSchema,
    activityType: manualActivityTypeSchema,
    title: z.string().trim().min(1, "Title is required").max(200),
    summary: z
      .string()
      .trim()
      .max(2000)
      .optional()
      .transform((value) => value || undefined),
    activityDate: z.string().min(1, "Date is required"),
    introducedBy: postgresUuidSchema.optional(),
    introductionOutcome: introductionOutcomeSchema.optional(),
  })
  .superRefine((data, ctx) => {
    const parsedDate = new Date(data.activityDate);
    if (Number.isNaN(parsedDate.getTime())) {
      ctx.addIssue({
        code: "custom",
        message: "Invalid date",
        path: ["activityDate"],
      });
    }

    if (data.activityType === "introduction" && !data.introducedBy) {
      ctx.addIssue({
        code: "custom",
        message: "Introducer is required for introductions",
        path: ["introducedBy"],
      });
    }
  });

export type CreateManualActivityInput = z.infer<typeof createManualActivitySchema>;
