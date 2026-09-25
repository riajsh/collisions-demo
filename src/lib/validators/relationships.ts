import { z } from "zod";

import { postgresUuidSchema } from "@/lib/validators/id";

const ownerStrength = z.enum([
  "inner_circle",
  "strong",
  "warm",
  "weak",
  "unknown",
]);

const relationshipStatus = z.enum([
  "prospect",
  "active",
  "partner",
  "advisor",
  "community",
  "dormant",
  "inactive",
]);

const relationshipType = z.enum([
  "founder",
  "investor",
  "operator",
  "advisor",
  "partner",
  "sponsor",
  "media",
  "other",
]);

export const assignOwnerSchema = z.object({
  profileId: postgresUuidSchema,
  userId: postgresUuidSchema,
  strength: ownerStrength.default("unknown"),
  isPrimary: z.coerce.boolean().default(false),
});

export const updateOwnerSchema = z.object({
  profileId: postgresUuidSchema,
  ownerId: postgresUuidSchema,
  strength: ownerStrength,
  isPrimary: z.coerce.boolean().default(false),
  notes: z.string().trim().max(2000).optional(),
});

export const updateRelationshipSchema = z.object({
  profileId: postgresUuidSchema,
  // Optional: profiles created via the Eventbrite review queue don't get a
  // relationship record made for them automatically the way manually-created
  // profiles do (see createProfileFromReview) — when it's missing, saving
  // the form creates one on the spot rather than leaving the person stuck
  // with no way to add relationship context.
  relationshipId: postgresUuidSchema.optional(),
  status: relationshipStatus,
  relationshipType: relationshipType,
  notes: z.string().trim().max(5000).optional(),
});

// Status and Type now live as inline pills in the profile header, so the
// "Relationship context" section only ever needs to save the free-text
// notes — no need to resend (and risk overwriting) status/type here.
export const updateRelationshipNotesSchema = z.object({
  profileId: postgresUuidSchema,
  notes: z.string().trim().max(5000).optional(),
});

export type AssignOwnerInput = z.infer<typeof assignOwnerSchema>;
export type UpdateOwnerInput = z.infer<typeof updateOwnerSchema>;
export type UpdateRelationshipInput = z.infer<typeof updateRelationshipSchema>;
export type UpdateRelationshipNotesInput = z.infer<
  typeof updateRelationshipNotesSchema
>;
