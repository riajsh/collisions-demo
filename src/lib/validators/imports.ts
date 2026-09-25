import { z } from "zod";

import { IMPORT_SOURCES } from "@/lib/import/constants";
import { postgresUuidSchema } from "@/lib/validators/id";

export const uploadImportSchema = z.object({
  source: z.enum(IMPORT_SOURCES),
});

export const importIdSchema = postgresUuidSchema;

export const columnMappingSchema = z.record(
  z.string(),
  z.string(),
);

export const softMatchActionSchema = z.enum([
  "confirm",
  "create",
  "skip",
  "replace",
]);
