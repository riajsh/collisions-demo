import { z } from "zod";

import { postgresUuidSchema } from "@/lib/validators/id";

export const eventTypeSchema = z.enum([
  "dinner",
  "roundtable",
  "workshop",
  "retreat",
  "summit",
  "other",
]);

const eventFieldsSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z
    .string()
    .trim()
    .max(5000)
    .optional()
    .transform((value) => value || undefined),
  eventType: eventTypeSchema.default("other"),
  eventDate: z.string().min(1, "Date is required"),
  location: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((value) => value || undefined),
});

function refineEventDate<T extends { eventDate: string }>(
  data: T,
  ctx: z.RefinementCtx,
) {
  if (Number.isNaN(new Date(data.eventDate).getTime())) {
    ctx.addIssue({
      code: "custom",
      message: "Invalid date",
      path: ["eventDate"],
    });
  }
}

export const createEventSchema = eventFieldsSchema.superRefine(refineEventDate);

export const updateEventSchema = eventFieldsSchema
  .extend({ eventId: postgresUuidSchema })
  .superRefine(refineEventDate);

export const addEventAttendeeSchema = z.object({
  eventId: postgresUuidSchema,
  profileId: postgresUuidSchema,
  attended: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value !== "false"),
});

export const addEventAttendeesBulkSchema = z.object({
  eventId: postgresUuidSchema,
  profileIds: z.array(postgresUuidSchema).min(1, "Select at least one profile"),
  tagWithEvent: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
});

export const removeEventAttendeeSchema = z.object({
  eventId: postgresUuidSchema,
  profileId: postgresUuidSchema,
});

export const markEventAttendeeAttendedSchema = z.object({
  eventId: postgresUuidSchema,
  profileId: postgresUuidSchema,
  attended: z.enum(["true", "false"]).transform((value) => value === "true"),
});

export const deleteEventSchema = z.object({
  eventId: postgresUuidSchema,
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type AddEventAttendeeInput = z.infer<typeof addEventAttendeeSchema>;
export type AddEventAttendeesBulkInput = z.infer<
  typeof addEventAttendeesBulkSchema
>;
export type MarkEventAttendeeAttendedInput = z.infer<
  typeof markEventAttendeeAttendedSchema
>;
