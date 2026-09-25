import { z } from "zod";

import { normalisePersonName } from "@/lib/normalise/person-name";
import { postgresUuidSchema } from "@/lib/validators/id";

const profileFieldsSchema = {
  fullName: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(200)
    .transform(normalisePersonName),
  email: z
    .string()
    .trim()
    .email("Invalid email")
    .max(320)
    .optional()
    .or(z.literal(""))
    .transform((value) => value || undefined),
  phone: z
    .string()
    .trim()
    .max(50)
    .optional()
    .transform((value) => value || undefined),
  linkedinUrl: z
    .string()
    .trim()
    .url("Invalid LinkedIn URL")
    .max(500)
    .optional()
    .or(z.literal(""))
    .transform((value) => value || undefined),
  websiteUrl: z
    .string()
    .trim()
    .url("Invalid website URL")
    .max(500)
    .optional()
    .or(z.literal(""))
    .transform((value) => value || undefined),
  organisationName: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((value) => value || undefined),
  occupation: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((value) => value || undefined),
  locationCity: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((value) => value || undefined),
  locationCountry: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((value) => value || undefined),
  bio: z
    .string()
    .trim()
    .max(5000)
    .optional()
    .transform((value) => value || undefined),
};

export const createProfileSchema = z.object(profileFieldsSchema);

export type CreateProfileInput = z.infer<typeof createProfileSchema>;

export const updateProfileSchema = z.object({
  profileId: postgresUuidSchema,
  ...profileFieldsSchema,
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
